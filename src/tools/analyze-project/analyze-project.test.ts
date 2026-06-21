import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PathOutOfBoundsError } from '../../shared/sandbox.js';
import { analyzeProjectHandler } from './handler.js';
import { getLatestPlanForProject } from '../../dashboard-server/plans-store.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'qacito-ap-'));
}

async function makeNextjsAppRouter(root: string): Promise<void> {
  await fs.mkdir(path.join(root, 'app', 'home'), { recursive: true });
  await fs.mkdir(path.join(root, 'app', 'about'), { recursive: true });
  await fs.writeFile(path.join(root, 'app', 'page.tsx'), '// root page', 'utf-8');
  await fs.writeFile(path.join(root, 'app', 'home', 'page.tsx'), '// home page', 'utf-8');
  await fs.writeFile(path.join(root, 'app', 'about', 'page.tsx'), '// about page', 'utf-8');
  await fs.writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'test-app', dependencies: { next: '15.0.0', react: '18.0.0' }, scripts: { dev: 'next dev -p 3001' } }),
    'utf-8',
  );
}

async function makeNextjsPagesRouter(root: string): Promise<void> {
  await fs.mkdir(path.join(root, 'pages'), { recursive: true });
  await fs.writeFile(path.join(root, 'pages', 'index.tsx'), '// index', 'utf-8');
  await fs.writeFile(path.join(root, 'pages', 'about.tsx'), '// about', 'utf-8');
  await fs.writeFile(path.join(root, 'pages', '_app.tsx'), '// _app', 'utf-8');
  await fs.writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'pages-app', dependencies: { next: '14.0.0', react: '18.0.0' } }),
    'utf-8',
  );
}

async function makeGenericProject(root: string): Promise<void> {
  await fs.writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'generic-app', dependencies: { express: '4.0.0' } }),
    'utf-8',
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('analyze-project handler', () => {
  test('AP-1: detects Next.js App Router routes and generates TCs', async () => {
    const root = await makeTempDir();
    await makeNextjsAppRouter(root);

    try {
      const output = await analyzeProjectHandler(root, { projectRoot: root });

      expect(output.techStack).toContain('Next.js');
      expect(output.testCases.length).toBeGreaterThanOrEqual(2);
      expect(output.testCases[0]?.id).toBe('TC001');
      // IDs should be zero-padded
      for (const tc of output.testCases) {
        expect(tc.id).toMatch(/^TC\d{3}$/);
      }
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  test('AP-2: detects Next.js Pages Router and generates TCs', async () => {
    const root = await makeTempDir();
    await makeNextjsPagesRouter(root);

    try {
      const output = await analyzeProjectHandler(root, { projectRoot: root });

      expect(output.techStack).toContain('Next.js');
      // Should skip _app.tsx and include index + about
      const urls = output.testCases.map((tc) => tc.url);
      // At least the health check TC is always present
      expect(output.testCases.length).toBeGreaterThanOrEqual(1);
      expect(urls.some((u) => u.includes('localhost'))).toBe(true);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  test('AP-3: generic project always generates at least one health check TC', async () => {
    const root = await makeTempDir();
    await makeGenericProject(root);

    try {
      const output = await analyzeProjectHandler(root, { projectRoot: root });

      expect(output.testCases.length).toBeGreaterThanOrEqual(1);
      expect(output.testCases[0]?.category).toBe('Health');
      expect(output.testCases[0]?.url).toContain('localhost');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  test('AP-4: writes .spec.ts files to qacito_tests/', async () => {
    const root = await makeTempDir();
    await makeNextjsAppRouter(root);

    try {
      const output = await analyzeProjectHandler(root, { projectRoot: root });

      expect(output.specsDir).toBe(path.join(root, 'qacito_tests'));
      expect(output.filesWritten).toBeGreaterThan(0);
      expect(output.filesWritten).toBe(output.testCases.length);

      const files = await fs.readdir(output.specsDir);
      const specFiles = files.filter((f) => f.endsWith('.spec.ts'));
      expect(specFiles.length).toBe(output.filesWritten);
      expect(specFiles.every((f) => f.endsWith('.spec.ts'))).toBe(true);
      expect(specFiles[0]).toMatch(/^TC001_/);
      expect(files).toContain('playwright.qacito.config.ts');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  test('AP-5: plan is saved and retrievable via getLatestPlanForProject', async () => {
    const root = await makeTempDir();
    await makeNextjsAppRouter(root);

    try {
      const output = await analyzeProjectHandler(root, { projectRoot: root });

      const plan = getLatestPlanForProject(root);
      expect(plan).toBeDefined();
      expect(plan!.projectRoot).toBe(root);
      expect(plan!.testCases.length).toBe(output.testCases.length);
      expect(plan!.specsDir).toBe(output.specsDir);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  test('AP-6: infers baseUrl from package.json scripts', async () => {
    const root = await makeTempDir();
    await fs.writeFile(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'port-app', scripts: { dev: 'next dev -p 4321' } }),
      'utf-8',
    );

    try {
      const output = await analyzeProjectHandler(root, { projectRoot: root });
      expect(output.baseUrl).toBe('http://localhost:4321');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  test('AP-7: writes bearer env var name (not value) and storageState to playwright config', async () => {
    const root = await makeTempDir();
    await makeGenericProject(root);

    process.env['AP_TEST_SECRET_TOKEN'] = 'should-not-appear-in-config';
    try {
      await analyzeProjectHandler(root, {
        projectRoot: root,
        auth: { bearerEnvVar: 'AP_TEST_SECRET_TOKEN', storageStatePath: '/tmp/state.json' },
      });

      const configPath = path.join(root, 'qacito_tests', 'playwright.qacito.config.ts');
      const content = await fs.readFile(configPath, 'utf-8');

      expect(content).toContain('process.env.AP_TEST_SECRET_TOKEN');
      expect(content).toContain("storageState: '/tmp/state.json'");
      expect(content).not.toContain('should-not-appear-in-config');
    } finally {
      delete process.env['AP_TEST_SECRET_TOKEN'];
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  test('AP-8: accepts a project root inside the sandbox boundary', async () => {
    const root = await makeTempDir();
    await makeGenericProject(root);

    try {
      const output = await analyzeProjectHandler(root, { projectRoot: root });

      expect(output.projectRoot).toBe(root);
      expect(output.specsDir).toBe(path.join(root, 'qacito_tests'));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  test('AP-9: rejects traversal paths before filesystem access', async () => {
    const root = await makeTempDir();
    await makeGenericProject(root);

    try {
      const traversal = path.resolve(root, '..');
      let caught: unknown;

      try {
        await analyzeProjectHandler(root, { projectRoot: traversal });
      } catch (err: unknown) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(PathOutOfBoundsError);
      if (!(caught instanceof PathOutOfBoundsError)) return;
      expect(caught.code).toBe('PathOutOfBounds');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
