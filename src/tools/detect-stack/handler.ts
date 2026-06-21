import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveSafe } from '../../shared/sandbox.js';
import type { DetectStackInput } from './schema.js';
import {
  detectFramework,
  detectPackageManager,
  detectOpenApiFile,
  detectRoutesExpress,
  detectRoutesNext,
  type PackageJsonShape,
  type RouteEntry,
} from './detectors.js';

// ---------------------------------------------------------------------------
// Output type
// ---------------------------------------------------------------------------

/**
 * Shape returned by the `detect_stack` tool on success.
 *
 * Aligns with tasks.md contract and design.md interfaces.
 */
export interface DetectStackOutput {
  /** Recognised framework: "nextjs" | "express" | "fastify" | "nestjs" | "unknown". */
  framework: 'nextjs' | 'express' | 'fastify' | 'nestjs' | 'unknown';
  /** Semver string from package.json (e.g. "^14.0.0") or null if unknown. */
  version: string | null;
  /** Detected REST route entries (may be empty). */
  routes: RouteEntry[];
  /** Lock-file-derived package manager. */
  packageManager: string;
  /** Value of `scripts.test` from package.json, or null if absent. */
  testScript: string | null;
  /** True if tsconfig.json exists at the project root. */
  hasTypeScript: boolean;
  /** Value of `scripts.start` or `main` from package.json, or null. */
  entryPoint: string | null;
  /** Path to an OpenAPI/Swagger spec file if found, otherwise null. */
  openApiFile: string | null;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Analyses a project at `projectPath` and returns stack metadata.
 *
 * Error codes:
 *   - `MissingPackageJson` — `package.json` not found at the project root.
 *
 * All paths are validated through `resolveSafe` to prevent sandbox escapes.
 *
 * @param sandboxRoot  Absolute sandbox root (projectRoot arg or cwd).
 * @param input        Validated input from the Zod schema.
 */
export async function detectStackHandler(
  sandboxRoot: string,
  input: DetectStackInput,
): Promise<DetectStackOutput> {
  // 1. Sandbox check for the projectPath itself.
  const projectRoot = resolveSafe(sandboxRoot, input.projectPath);

  // 2. Read package.json — mandatory.
  const pkgPath = path.join(projectRoot, 'package.json');
  let pkg: PackageJsonShape;
  try {
    const raw = await fs.readFile(resolveSafe(sandboxRoot, pkgPath), 'utf-8');
    pkg = JSON.parse(raw) as PackageJsonShape;
  } catch (err: unknown) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === 'ENOENT') {
      throw new MissingPackageJsonError(projectRoot);
    }
    throw err;
  }

  // 3. Detect framework and version.
  const { framework, version } = detectFramework(pkg);

  // 4. Detect package manager (lock files).
  const packageManager = await detectPackageManager(projectRoot);

  // 5. Detect routes based on framework.
  let routes: RouteEntry[] = [];
  const srcDir = path.join(projectRoot, 'src');
  if (framework === 'nextjs') {
    routes = await detectRoutesNext(srcDir);
  } else if (framework === 'express' || framework === 'fastify') {
    routes = await detectRoutesExpress(srcDir);
    // Fallback to project root if src/ doesn't yield results.
    if (routes.length === 0) {
      routes = await detectRoutesExpress(projectRoot);
    }
  }

  // 6. Detect OpenAPI spec file.
  const openApiFile = await detectOpenApiFile(projectRoot);

  // 7. Check for TypeScript config.
  let hasTypeScript = false;
  try {
    await fs.access(resolveSafe(sandboxRoot, path.join(projectRoot, 'tsconfig.json')));
    hasTypeScript = true;
  } catch {
    hasTypeScript = false;
  }

  // 8. Extract test script and entry point from package.json.
  const testScript = pkg.scripts?.['test'] ?? null;
  const entryPoint = pkg.scripts?.['start'] ?? null;

  return {
    framework,
    version,
    routes,
    packageManager,
    testScript,
    hasTypeScript,
    entryPoint,
    openApiFile,
  };
}

// ---------------------------------------------------------------------------
// Custom errors
// ---------------------------------------------------------------------------

/**
 * Thrown when `package.json` is not found at the project root.
 * Code: `MissingPackageJson` — surfaced as an MCP-level error.
 */
export class MissingPackageJsonError extends Error {
  readonly code = 'MissingPackageJson';

  constructor(projectRoot: string) {
    super(`No package.json found at "${projectRoot}". Is this a Node.js project?`);
    this.name = 'MissingPackageJsonError';
  }
}
