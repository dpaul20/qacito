import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  detectFramework,
  detectPackageManager,
  detectOpenApiFile,
  type PackageJsonShape,
} from './detectors.js';
import { MissingPackageJsonError, detectStackHandler } from './handler.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'qacito-stack-test-'));
}

async function writePkgJson(dir: string, pkg: PackageJsonShape): Promise<void> {
  await fs.writeFile(
    path.join(dir, 'package.json'),
    JSON.stringify(pkg),
    'utf-8',
  );
}

// ---------------------------------------------------------------------------
// detectFramework — pure function tests (no filesystem)
// ---------------------------------------------------------------------------

test.describe('detectFramework', () => {
  test('detects Next.js from dependencies', () => {
    const pkg: PackageJsonShape = { dependencies: { next: '^14.0.0' } };
    const { framework, version } = detectFramework(pkg);
    expect(framework).toBe('nextjs');
    expect(version).toBe('^14.0.0');
  });

  test('detects Next.js from devDependencies', () => {
    const pkg: PackageJsonShape = { devDependencies: { next: '^13.0.0' } };
    const { framework, version } = detectFramework(pkg);
    expect(framework).toBe('nextjs');
    expect(version).toBe('^13.0.0');
  });

  test('detects Express from dependencies', () => {
    const pkg: PackageJsonShape = { dependencies: { express: '^4.18.0' } };
    const { framework, version } = detectFramework(pkg);
    expect(framework).toBe('express');
    expect(version).toBe('^4.18.0');
  });

  test('detects Fastify from dependencies', () => {
    const pkg: PackageJsonShape = { dependencies: { fastify: '^4.0.0' } };
    const { framework, version } = detectFramework(pkg);
    expect(framework).toBe('fastify');
    expect(version).toBe('^4.0.0');
  });

  test('returns unknown when no recognisable framework is present', () => {
    const pkg: PackageJsonShape = { dependencies: { lodash: '^4.17.0' } };
    const { framework, version } = detectFramework(pkg);
    expect(framework).toBe('unknown');
    expect(version).toBeNull();
  });

  test('returns unknown for an empty package.json', () => {
    const { framework, version } = detectFramework({});
    expect(framework).toBe('unknown');
    expect(version).toBeNull();
  });

  test('prioritises next over express when both are present', () => {
    const pkg: PackageJsonShape = {
      dependencies: { next: '^14.0.0', express: '^4.18.0' },
    };
    const { framework } = detectFramework(pkg);
    expect(framework).toBe('nextjs');
  });
});

// ---------------------------------------------------------------------------
// detectPackageManager — filesystem-based tests
// ---------------------------------------------------------------------------

test.describe('detectPackageManager', () => {
  test('detects npm from package-lock.json', async () => {
    const dir = await makeTempDir();
    try {
      await fs.writeFile(path.join(dir, 'package-lock.json'), '{}', 'utf-8');
      const pm = await detectPackageManager(dir);
      expect(pm).toBe('npm');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  test('detects yarn from yarn.lock', async () => {
    const dir = await makeTempDir();
    try {
      await fs.writeFile(path.join(dir, 'yarn.lock'), '', 'utf-8');
      const pm = await detectPackageManager(dir);
      expect(pm).toBe('yarn');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  test('detects pnpm from pnpm-lock.yaml', async () => {
    const dir = await makeTempDir();
    try {
      await fs.writeFile(path.join(dir, 'pnpm-lock.yaml'), '', 'utf-8');
      const pm = await detectPackageManager(dir);
      expect(pm).toBe('pnpm');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  test('returns unknown when no lock file is present', async () => {
    const dir = await makeTempDir();
    try {
      const pm = await detectPackageManager(dir);
      expect(pm).toBe('unknown');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// detectOpenApiFile
// ---------------------------------------------------------------------------

test.describe('detectOpenApiFile', () => {
  test('returns path to openapi.yaml when present', async () => {
    const dir = await makeTempDir();
    try {
      const filePath = path.join(dir, 'openapi.yaml');
      await fs.writeFile(filePath, 'openapi: 3.0.0', 'utf-8');
      const found = await detectOpenApiFile(dir);
      expect(found).toBe(filePath);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  test('returns null when no OpenAPI file exists', async () => {
    const dir = await makeTempDir();
    try {
      const found = await detectOpenApiFile(dir);
      expect(found).toBeNull();
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// detectStackHandler — full handler integration
// ---------------------------------------------------------------------------

test.describe('detectStackHandler', () => {
  test('detects a Next.js project correctly', async () => {
    const dir = await makeTempDir();
    try {
      await writePkgJson(dir, {
        name: 'my-next-app',
        dependencies: { next: '^14.0.0' },
        scripts: { test: 'jest', start: 'next start' },
      });

      const result = await detectStackHandler(dir, { projectPath: dir });

      expect(result.framework).toBe('nextjs');
      expect(result.version).toBe('^14.0.0');
      expect(result.testScript).toBe('jest');
      expect(result.entryPoint).toBe('next start');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  test('detects an Express project correctly', async () => {
    const dir = await makeTempDir();
    try {
      await writePkgJson(dir, {
        name: 'my-express-app',
        dependencies: { express: '^4.18.0' },
      });

      const result = await detectStackHandler(dir, { projectPath: dir });

      expect(result.framework).toBe('express');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  test('absent package.json → throws MissingPackageJsonError', async () => {
    const dir = await makeTempDir();
    try {
      let caught: unknown;
      try {
        await detectStackHandler(dir, { projectPath: dir });
      } catch (err: unknown) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(MissingPackageJsonError);
      if (!(caught instanceof MissingPackageJsonError)) return;
      expect(caught.code).toBe('MissingPackageJson');
      expect(caught.message).toContain(dir);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  test('includes hasTypeScript:true when tsconfig.json exists', async () => {
    const dir = await makeTempDir();
    try {
      await writePkgJson(dir, { dependencies: { express: '^4.18.0' } });
      await fs.writeFile(path.join(dir, 'tsconfig.json'), '{}', 'utf-8');

      const result = await detectStackHandler(dir, { projectPath: dir });

      expect(result.hasTypeScript).toBe(true);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  test('includes hasTypeScript:false when tsconfig.json is absent', async () => {
    const dir = await makeTempDir();
    try {
      await writePkgJson(dir, { dependencies: { express: '^4.18.0' } });

      const result = await detectStackHandler(dir, { projectPath: dir });

      expect(result.hasTypeScript).toBe(false);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
