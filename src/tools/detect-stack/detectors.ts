import fs from 'node:fs/promises';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single detected REST route entry. */
export interface RouteEntry {
  method: string;
  path: string;
  source: string;
}

/** Recognised framework identifiers (matches spec scenarios). */
export type Framework = 'nextjs' | 'express' | 'fastify' | 'nestjs' | 'unknown';

/** Recognised package managers. */
export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun' | 'unknown';

/** Raw shape of package.json we care about (all fields are optional). */
export interface PackageJsonShape {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Framework detection
// ---------------------------------------------------------------------------

/**
 * Derives the framework name and version from a parsed `package.json`.
 *
 * Priority: next > express > fastify > nestjs. Returns "unknown" if none match.
 */
export function detectFramework(pkg: PackageJsonShape): {
  framework: Framework;
  version: string | null;
} {
  const all: Record<string, string> = {
    ...(pkg.dependencies ?? {}),
    ...(pkg.devDependencies ?? {}),
  };

  if ('next' in all) {
    return { framework: 'nextjs', version: all['next'] ?? null };
  }
  if ('express' in all) {
    return { framework: 'express', version: all['express'] ?? null };
  }
  if ('fastify' in all) {
    return { framework: 'fastify', version: all['fastify'] ?? null };
  }
  if ('@nestjs/core' in all) {
    return { framework: 'nestjs', version: all['@nestjs/core'] ?? null };
  }

  return { framework: 'unknown', version: null };
}

// ---------------------------------------------------------------------------
// Route detection — Express / generic router files
// ---------------------------------------------------------------------------

/**
 * Scans files in `srcDir` for Express-style route definitions.
 * Recognised patterns: `app.get`, `app.post`, `router.get`, `router.post`, etc.
 *
 * The scan is intentionally shallow — it reads only `.ts` and `.js` files at
 * depth 1–2 relative to `srcDir` to avoid scanning the entire node_modules.
 *
 * Returns an array of `RouteEntry` objects, one per matched route definition.
 */
export async function detectRoutesExpress(srcDir: string): Promise<RouteEntry[]> {
  const entries: RouteEntry[] = [];

  let files: string[];
  try {
    files = await collectSourceFiles(srcDir, 2);
  } catch {
    return [];
  }

  // Match: app.get('/path', ...) | router.post('/path', ...) etc.
  const routePattern =
    /(?:app|router)\.(get|post|put|patch|delete|options|head)\s*\(\s*['"]([^'"]+)['"]/g;

  for (const file of files) {
    let content: string;
    try {
      content = await fs.readFile(file, 'utf-8');
    } catch {
      continue;
    }

    let match: RegExpExecArray | null;
    while ((match = routePattern.exec(content)) !== null) {
      const method = match[1];
      const routePath = match[2];
      if (method !== undefined && routePath !== undefined) {
        entries.push({
          method: method.toUpperCase(),
          path: routePath,
          source: file,
        });
      }
    }
    routePattern.lastIndex = 0; // reset for next file
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Route detection — Next.js API routes
// ---------------------------------------------------------------------------

/**
 * Lists route entries derived from Next.js file-system routing conventions:
 * - `pages/api/**` (Pages Router)
 * - app&#47;**&#47;route.ts or app&#47;**&#47;route.js (App Router)
 *
 * Returns one entry per matching file; `method` is "ANY" because Next.js
 * exports per-handler functions (`GET`, `POST`, …) from a single file and
 * static analysis would require parsing the AST.
 */
export async function detectRoutesNext(srcDir: string): Promise<RouteEntry[]> {
  const entries: RouteEntry[] = [];

  // Pages Router: <root>/pages/api/**
  const pagesApiDir = path.join(srcDir, '..', 'pages', 'api');
  await collectRouteFiles(pagesApiDir, entries, 'ANY', srcDir);

  // App Router: <root>/app/**/route.{ts,js,tsx,jsx}  (glob — *&#47; safe in line comment)
  const appDir = path.join(srcDir, '..', 'app');
  await collectAppRouterFiles(appDir, entries);

  return entries;
}

async function collectRouteFiles(
  dir: string,
  entries: RouteEntry[],
  method: string,
  srcDir: string,
): Promise<void> {
  let items: string[];
  try {
    items = await fs.readdir(dir);
  } catch {
    return;
  }

  for (const item of items) {
    const full = path.join(dir, item);
    let stat: import('node:fs').Stats;
    try {
      stat = await fs.stat(full);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      await collectRouteFiles(full, entries, method, srcDir);
    } else if (/\.(ts|tsx|js|jsx)$/.test(item)) {
      // Convert filesystem path to URL-style route
      const rel = path.relative(path.join(srcDir, '..', 'pages', 'api'), full);
      const routePath = '/' + rel.replace(/\\/g, '/').replace(/\.[^.]+$/, '').replace(/\/index$/, '');
      entries.push({ method, path: routePath, source: full });
    }
  }
}

async function collectAppRouterFiles(
  appDir: string,
  entries: RouteEntry[],
): Promise<void> {
  let items: string[];
  try {
    items = await fs.readdir(appDir);
  } catch {
    return;
  }

  for (const item of items) {
    const full = path.join(appDir, item);
    let stat: import('node:fs').Stats;
    try {
      stat = await fs.stat(full);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      await collectAppRouterFiles(full, entries);
    } else if (/^route\.(ts|tsx|js|jsx)$/.test(item)) {
      const rel = path.relative(appDir, path.dirname(full));
      const routePath = '/api/' + rel.replace(/\\/g, '/');
      entries.push({ method: 'ANY', path: routePath, source: full });
    }
  }
}

// ---------------------------------------------------------------------------
// OpenAPI file detection
// ---------------------------------------------------------------------------

/**
 * Checks for `openapi.yaml`, `openapi.json`, `swagger.yaml`, or `swagger.json`
 * in `rootDir`. Returns the resolved path of the first file found, or `null`.
 */
export async function detectOpenApiFile(rootDir: string): Promise<string | null> {
  const candidates = [
    'openapi.yaml',
    'openapi.yml',
    'openapi.json',
    'swagger.yaml',
    'swagger.yml',
    'swagger.json',
  ];

  for (const name of candidates) {
    const full = path.join(rootDir, name);
    try {
      await fs.access(full);
      return full;
    } catch {
      // not found, try next
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Package manager detection
// ---------------------------------------------------------------------------

/**
 * Detects which package manager is being used by checking for lock files.
 *
 * Priority: bun > pnpm > yarn > npm.
 */
export async function detectPackageManager(rootDir: string): Promise<PackageManager> {
  const lockFiles: Array<[string, PackageManager]> = [
    ['bun.lockb', 'bun'],
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['package-lock.json', 'npm'],
  ];

  for (const [file, manager] of lockFiles) {
    try {
      await fs.access(path.join(rootDir, file));
      return manager;
    } catch {
      // not present, try next
    }
  }

  return 'unknown';
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Recursively collects `.ts` and `.js` source files up to `maxDepth` levels
 * deep under `dir`.  Skips `node_modules` and `dist` directories.
 */
async function collectSourceFiles(dir: string, maxDepth: number): Promise<string[]> {
  if (maxDepth <= 0) return [];

  let items: string[];
  try {
    items = await fs.readdir(dir);
  } catch {
    return [];
  }

  const results: string[] = [];

  for (const item of items) {
    if (item === 'node_modules' || item === 'dist' || item === '.git') continue;

    const full = path.join(dir, item);
    let stat: import('node:fs').Stats;
    try {
      stat = await fs.stat(full);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      const nested = await collectSourceFiles(full, maxDepth - 1);
      results.push(...nested);
    } else if (/\.(ts|tsx|js|jsx)$/.test(item)) {
      results.push(full);
    }
  }

  return results;
}
