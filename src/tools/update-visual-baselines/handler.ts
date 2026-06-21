import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveSafe, PathOutOfBoundsError } from '../../shared/sandbox.js';
import { spawnPlaywright } from '../run-tests/runner.js';
import type { UpdateVisualBaselinesInput } from './schema.js';

export interface UpdateVisualBaselinesOutput {
  status: 'updated' | 'failed' | 'timeout' | 'error';
  snapshotDir: string;
  updatedCount: number;
  snapshotsBefore: number;
  snapshotsAfter: number;
  durationMs: number;
  logs: string;
}

export class SpecNotFoundError extends Error {
  readonly code = 'SpecNotFound' as const;
  constructor(p: string) {
    super(`Spec file not found: "${p}"`);
    this.name = 'SpecNotFoundError';
  }
}

// Re-export for convenience in index.ts
export { PathOutOfBoundsError };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Counts PNG files in a directory. Returns 0 if the directory does not exist.
 */
async function countPngs(dir: string): Promise<number> {
  try {
    const entries = await fs.readdir(dir);
    return entries.filter((e) => e.endsWith('.png')).length;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return 0;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Updates visual regression baselines by running a Playwright spec with
 * `--update-snapshots`. Returns snapshot counts before/after for auditability.
 *
 * @param sandboxRoot  Absolute path to the project root (sandbox boundary).
 * @param input        Validated input from the MCP tool call.
 * @param spawnFn      Playwright spawn function — injectable for testing.
 */
export async function updateVisualBaselinesHandler(
  sandboxRoot: string,
  input: UpdateVisualBaselinesInput,
  spawnFn = spawnPlaywright,
): Promise<UpdateVisualBaselinesOutput> {
  // 1. Resolve and sandbox-check the spec path.
  const resolvedSpec = resolveSafe(sandboxRoot, input.scriptPath);

  // 2. Verify the spec file exists on disk.
  try {
    await fs.access(resolvedSpec);
  } catch {
    throw new SpecNotFoundError(resolvedSpec);
  }

  // 3. Determine the Playwright snapshot directory (default convention).
  //    e.g. foo.spec.ts → foo.spec.ts-snapshots/
  const snapshotDir = path.join(
    path.dirname(resolvedSpec),
    path.basename(resolvedSpec) + '-snapshots',
  );

  // 4. Count PNGs before the run.
  const snapshotsBefore = await countPngs(snapshotDir);

  // 5. Run Playwright with --update-snapshots.
  const result = await spawnFn(resolvedSpec, sandboxRoot, input.timeoutMs, [
    '--update-snapshots',
  ]);

  // 6. Count PNGs after the run.
  const snapshotsAfter = await countPngs(snapshotDir);

  // 7. Map Playwright result status to our output status.
  const status: UpdateVisualBaselinesOutput['status'] =
    result.status === 'passed' ? 'updated' : result.status;

  return {
    status,
    snapshotDir,
    updatedCount: snapshotsAfter - snapshotsBefore,
    snapshotsBefore,
    snapshotsAfter,
    durationMs: result.durationMs,
    logs: result.rawOutput,
  };
}
