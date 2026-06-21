import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { updateVisualBaselinesHandler, SpecNotFoundError } from './handler.js';
import type { PlaywrightResult } from '../run-tests/runner.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a temp dir + a minimal spec file inside it. Returns both paths. */
async function makeSpecEnv(): Promise<{ tmpDir: string; specPath: string }> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qacito-vr-'));
  const specPath = path.join(tmpDir, 'visual.spec.ts');
  await fs.writeFile(specPath, '// placeholder spec');
  return { tmpDir, specPath };
}

/** A mock spawnFn that returns a configurable PlaywrightResult. */
function makeSpawnMock(status: PlaywrightResult['status'] = 'passed'): {
  fn: typeof import('../run-tests/runner.js').spawnPlaywright;
  calls: Array<{ scriptPath: string; cwd: string; timeoutMs: number; extraArgs: string[] }>;
} {
  const calls: Array<{ scriptPath: string; cwd: string; timeoutMs: number; extraArgs: string[] }> = [];

  const fn = async (
    scriptPath: string,
    cwd: string,
    timeoutMs: number,
    extraArgs: string[] = [],
  ): Promise<PlaywrightResult> => {
    calls.push({ scriptPath, cwd, timeoutMs, extraArgs });
    return {
      status,
      summary: { total: 1, passed: status === 'passed' ? 1 : 0, failed: status === 'failed' ? 1 : 0, skipped: 0 },
      failures: [],
      durationMs: 50,
      rawOutput: '',
    };
  };

  return { fn, calls };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('update-visual-baselines handler', () => {
  test('VR-1: status is "updated" when spawnFn returns "passed"', async () => {
    const { tmpDir, specPath } = await makeSpecEnv();
    const mock = makeSpawnMock('passed');

    try {
      const output = await updateVisualBaselinesHandler(
        tmpDir,
        { scriptPath: specPath, timeoutMs: 5_000 },
        mock.fn,
      );

      expect(output.status).toBe('updated');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  test('VR-2: status is "failed" when spawnFn returns "failed"', async () => {
    const { tmpDir, specPath } = await makeSpecEnv();
    const mock = makeSpawnMock('failed');

    try {
      const output = await updateVisualBaselinesHandler(
        tmpDir,
        { scriptPath: specPath, timeoutMs: 5_000 },
        mock.fn,
      );

      expect(output.status).toBe('failed');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  test('VR-3: spawnFn is called with extraArgs containing "--update-snapshots"', async () => {
    const { tmpDir, specPath } = await makeSpecEnv();
    const mock = makeSpawnMock('passed');

    try {
      await updateVisualBaselinesHandler(
        tmpDir,
        { scriptPath: specPath, timeoutMs: 5_000 },
        mock.fn,
      );

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0]?.extraArgs).toContain('--update-snapshots');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  test('VR-4: snapshotsAdded reflects PNGs added to snapshot dir during the run', async () => {
    const { tmpDir, specPath } = await makeSpecEnv();

    // Create snapshot dir with 2 PNGs before the run.
    const snapshotDir = specPath + '-snapshots';
    await fs.mkdir(snapshotDir, { recursive: true });
    await fs.writeFile(path.join(snapshotDir, 'before-1.png'), '');
    await fs.writeFile(path.join(snapshotDir, 'before-2.png'), '');

    // Mock spawnFn that also creates one more PNG (simulating baseline update).
    const calls: Array<unknown> = [];
    const spawnFn = async (
      scriptPath: string,
      cwd: string,
      timeoutMs: number,
      extraArgs: string[] = [],
    ): Promise<PlaywrightResult> => {
      calls.push({ scriptPath, cwd, timeoutMs, extraArgs });
      // Simulate Playwright writing a new snapshot.
      await fs.writeFile(path.join(snapshotDir, 'after-3.png'), '');
      return {
        status: 'passed',
        summary: { total: 1, passed: 1, failed: 0, skipped: 0 },
        failures: [],
        durationMs: 50,
        rawOutput: '',
      };
    };

    try {
      const output = await updateVisualBaselinesHandler(
        tmpDir,
        { scriptPath: specPath, timeoutMs: 5_000 },
        spawnFn,
      );

      expect(output.snapshotsBefore).toBe(2);
      expect(output.snapshotsAfter).toBe(3);
      expect(output.updatedCount).toBe(1);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  test('VR-5: throws SpecNotFoundError for a non-existent spec path within sandbox', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qacito-vr-'));
    const mock = makeSpawnMock('passed');

    try {
      await expect(
        updateVisualBaselinesHandler(
          tmpDir,
          { scriptPath: path.join(tmpDir, 'nonexistent.spec.ts'), timeoutMs: 5_000 },
          mock.fn,
        ),
      ).rejects.toThrow(SpecNotFoundError);

      // spawnFn must NOT have been called.
      expect(mock.calls).toHaveLength(0);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
