import fs from 'node:fs/promises';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import type { AnalyzeProjectInput, AnalyzeProjectOutput, TestCaseOutput } from './schema.js';
import { savePlan, type TestPlan } from '../../dashboard-server/plans-store.js';
import { getDashboardUrl } from '../../dashboard-server/index.js';
import { resolveSafe } from '../../shared/sandbox.js';
import type { AuthConfig } from '../../shared/auth-context.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function exists(p: string): Promise<boolean> {
  return fs.access(p).then(() => true).catch(() => false);
}

async function readJsonFile<T>(p: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(p, 'utf-8')) as T;
  } catch {
    return null;
  }
}

async function globRoutes(dir: string, pattern: string): Promise<string[]> {
  const results: string[] = [];
  async function walk(current: string, depth: number): Promise<void> {
    if (depth > 6) return;
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full, depth + 1);
      } else if (entry.name === pattern) {
        results.push(full);
        if (results.length >= 50) return;
      }
    }
  }
  await walk(dir, 0);
  return results;
}

const PRIMARY_SCRIPT_NAMES = new Set(['dev', 'start', 'serve', 'preview', 'develop']);

function inferBaseUrl(pkg: PackageJson | null): string {
  if (!pkg?.scripts) return 'http://localhost:3000';
  // Only scan primary dev/start scripts — auxiliary tools like Storybook use
  // different script names and their ports must not override the app's port.
  const primaryValues = Object.entries(pkg.scripts)
    .filter(([name]) => PRIMARY_SCRIPT_NAMES.has(name))
    .map(([, value]) => value)
    .join(' ');
  const portMatch =
    /localhost:(\d{4,5})/.exec(primaryValues) ??
    /-p\s+(\d{4,5})/.exec(primaryValues) ??
    /--port[=\s]+(\d{4,5})/.exec(primaryValues);
  if (portMatch?.[1]) return `http://localhost:${portMatch[1]}`;
  return 'http://localhost:3000';
}

function detectTechStack(pkg: PackageJson | null): string[] {
  if (!pkg) return ['Unknown'];
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const stack: string[] = [];
  if ('next' in deps) stack.push('Next.js');
  if ('react' in deps) stack.push('React');
  if ('vue' in deps) stack.push('Vue');
  if ('typescript' in deps || '@types/node' in deps) stack.push('TypeScript');
  if ('tailwindcss' in deps) stack.push('Tailwind CSS');
  if ('@playwright/test' in deps) stack.push('Playwright');
  if (stack.length === 0) stack.push('Node.js');
  return stack;
}

function routeToUrl(baseUrl: string, routeFile: string, projectRoot: string): string {
  const rel = path.relative(projectRoot, routeFile);
  // Next.js App Router: app/foo/bar/page.tsx → /foo/bar
  const appMatch = /^(?:src\/)?app\/(.+?)\/page\.[jt]sx?$/.exec(rel.replace(/\\/g, '/'));
  if (appMatch) {
    const segment = (appMatch[1] ?? '').replace(/\(.*?\)\//g, '').replace(/\[.*?\]/g, ':param');
    return `${baseUrl}/${segment}`;
  }
  // Next.js Pages Router: pages/foo/bar.tsx → /foo/bar
  const pagesMatch = /^(?:src\/)?pages\/(.+?)\.[jt]sx?$/.exec(rel.replace(/\\/g, '/'));
  if (pagesMatch) {
    const segment = (pagesMatch[1] ?? '').replace(/\[.*?\]/g, ':param').replace(/\/index$/, '');
    return `${baseUrl}/${segment}`;
  }
  return baseUrl;
}

function padId(n: number): string {
  return `TC${String(n).padStart(3, '0')}`;
}

function slugify(title: string): string {
  return title.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60);
}

function buildTestCases(
  routes: string[],
  baseUrl: string,
  projectRoot: string,
  coveredPaths: Set<string>,
): TestCaseOutput[] {
  const cases: TestCaseOutput[] = [];

  // Normalise a URL to a path segment for coverage comparison.
  const toPath = (url: string) => {
    try { return new URL(url).pathname; } catch { return url; }
  };
  const isCovered = (url: string) => {
    const p = toPath(url);
    for (const c of coveredPaths) {
      if (toPath(c) === p) return true;
    }
    return false;
  };

  // Always include a health check for the home page (unless already covered)
  if (!isCovered(baseUrl)) {
    cases.push({
      id: padId(cases.length + 1),
      title: 'Página principal responde correctamente',
      description: 'Verificar que la página home carga sin errores y retorna HTTP 200.',
      steps: [
        `Navegar a ${baseUrl}`,
        'Esperar a que la página termine de cargar',
        'Verificar que el status HTTP es 200',
        'Verificar que no hay errores visibles en pantalla',
      ],
      url: baseUrl,
      category: 'Health',
    });
  }

  for (const routeFile of routes) {
    const url = routeToUrl(baseUrl, routeFile, projectRoot);
    if (url === baseUrl) continue; // skip if couldn't parse route

    const segment = url.replace(baseUrl, '').replace(/^\//, '') || 'home';
    if (segment.includes(':param')) continue; // skip dynamic routes
    if (isCovered(url)) continue; // skip routes already tested in existing suite

    const pageName = segment.split('/').pop() ?? segment;

    // TC: page loads
    cases.push({
      id: padId(cases.length + 1),
      title: `${pageName} carga correctamente`,
      description: `Verificar que la página ${url} carga sin errores.`,
      steps: [
        `Navegar a ${url}`,
        'Esperar a que la página termine de cargar',
        'Verificar que el contenido principal es visible',
        'Verificar que no hay errores de JavaScript en consola',
      ],
      url,
      category: 'UI',
    });

    if (cases.length >= 20) break;
  }

  return cases;
}

/**
 * Reads the project's playwright.config.ts/js and returns the configured
 * testDir (e.g. "e2e"). Falls back to "e2e" if not found.
 */
async function detectTestDir(projectRoot: string): Promise<string> {
  for (const name of ['playwright.config.ts', 'playwright.config.js']) {
    try {
      const content = await fs.readFile(path.join(projectRoot, name), 'utf-8');
      const match = /testDir\s*:\s*['"`]([^'"`]+)['"`]/.exec(content);
      if (match?.[1]) return match[1].replace(/^\.\//, '');
    } catch { /* not found */ }
  }
  return 'e2e';
}

/**
 * Scans existing specs in testDir and returns a set of URL paths already
 * covered (extracted from page.goto() and request.get/post/put/delete calls).
 */
async function getCoveredPaths(projectRoot: string, testDir: string): Promise<Set<string>> {
  const covered = new Set<string>();
  const dir = path.join(projectRoot, testDir);
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return covered;
  }
  for (const file of entries.filter(f => /\.spec\.[jt]s$/.test(f))) {
    try {
      const content = await fs.readFile(path.join(dir, file), 'utf-8');
      for (const m of content.matchAll(/page\.goto\(['"`]([^'"`]+)['"`]/g)) {
        if (m[1]) covered.add(m[1]);
      }
      for (const m of content.matchAll(/request\.(?:get|post|put|delete)\(['"`]([^'"`]+)['"`]/g)) {
        if (m[1]) covered.add(m[1]);
      }
    } catch { /* skip unreadable */ }
  }
  return covered;
}

export async function writeQacitoConfig(specsDir: string, baseUrl: string, auth?: AuthConfig): Promise<void> {
  const useLines: string[] = [];
  useLines.push(`    baseURL: '${baseUrl}',`);

  if (auth?.storageStatePath) {
    const normalizedPath = auth.storageStatePath.replace(/\\/g, '/');
    useLines.push(`    storageState: '${normalizedPath}',`);
  }

  if (auth?.bearerEnvVar) {
    const varName = auth.bearerEnvVar;
    useLines.push(`    extraHTTPHeaders: { Authorization: \`Bearer \${process.env.${varName} ?? ''}\` },`);
  }

  useLines.push(`    ...devices['Desktop Chrome'],`);

  const content = `import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  fullyParallel: true,
  retries: 0,
  use: {
${useLines.join('\n')}
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
`;
  await fs.writeFile(path.join(specsDir, 'playwright.qacito.config.ts'), content, 'utf-8');
}

async function writeSpecFile(
  specsDir: string,
  tc: TestCaseOutput,
  baseUrl: string,
): Promise<void> {
  const isApi = tc.url.includes('/api/');
  const content = isApi
    ? buildApiSpec(tc, baseUrl)
    : buildPageSpec(tc, baseUrl);
  const filename = `${tc.id}_${slugify(tc.title)}.spec.ts`;
  await fs.writeFile(path.join(specsDir, filename), content, 'utf-8');
}

function buildPageSpec(tc: TestCaseOutput, baseUrl: string): string {
  return `import { test, expect } from '@playwright/test';

test('${tc.title}', async ({ page }) => {
  await page.goto('${tc.url}');
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveTitle(/.+/);
});
`;
}

function buildApiSpec(tc: TestCaseOutput, _baseUrl: string): string {
  return `import { test, expect } from '@playwright/test';

test('${tc.title}', async ({ request }) => {
  const response = await request.get('${tc.url}');
  expect(response.ok()).toBeTruthy();
});
`;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function analyzeProjectHandler(
  sandboxRoot: string,
  input: AnalyzeProjectInput,
): Promise<AnalyzeProjectOutput> {
  const projectRoot = resolveSafe(sandboxRoot, input.projectRoot);

  if (!(await exists(projectRoot))) {
    throw new Error(`Project root not found: "${projectRoot}"`);
  }

  const pkg = await readJsonFile<PackageJson>(path.join(projectRoot, 'package.json'));
  const projectName = pkg?.name ?? path.basename(projectRoot);
  const baseUrl = input.baseUrl ?? inferBaseUrl(pkg);
  const techStack = detectTechStack(pkg);

  // Detect router type and collect route files
  const appDir = (await exists(path.join(projectRoot, 'app')))
    ? path.join(projectRoot, 'app')
    : (await exists(path.join(projectRoot, 'src', 'app')))
      ? path.join(projectRoot, 'src', 'app')
      : null;

  const pagesDir = (await exists(path.join(projectRoot, 'pages')))
    ? path.join(projectRoot, 'pages')
    : (await exists(path.join(projectRoot, 'src', 'pages')))
      ? path.join(projectRoot, 'src', 'pages')
      : null;

  const routeFiles: string[] = [];
  if (appDir) {
    routeFiles.push(...await globRoutes(appDir, 'page.tsx'), ...await globRoutes(appDir, 'page.ts'));
  } else if (pagesDir) {
    const entries = await globRoutes(pagesDir, '*.tsx').catch(() => []);
    routeFiles.push(...entries.filter((f) => !path.basename(f).startsWith('_')));
  }

  const existingTestDir = await detectTestDir(projectRoot);
  const coveredPaths    = await getCoveredPaths(projectRoot, existingTestDir);
  const testCases       = buildTestCases(routeFiles, baseUrl, projectRoot, coveredPaths);

  // Write spec files + co-located Playwright config so runner can find tests
  // regardless of the project's own playwright.config.ts testDir setting.
  const specsDir = path.join(projectRoot, 'qacito_tests');
  await fs.mkdir(specsDir, { recursive: true });
  await writeQacitoConfig(specsDir, baseUrl, input.auth);

  let filesWritten = 0;
  for (const tc of testCases) {
    await writeSpecFile(specsDir, tc, baseUrl);
    filesWritten++;
  }

  // Persist plan
  const plan: TestPlan = {
    id: uuidv4(),
    projectName,
    projectRoot,
    baseUrl,
    techStack,
    testCases,
    createdAt: new Date().toISOString(),
    specsDir,
  };
  await savePlan(plan);

  const dashBase = getDashboardUrl();
  return {
    projectName,
    projectRoot,
    baseUrl,
    techStack,
    testCases,
    specsDir,
    filesWritten,
    dashboardUrl: dashBase ? `${dashBase}/plan?projectRoot=${encodeURIComponent(projectRoot)}` : '',
  };
}
