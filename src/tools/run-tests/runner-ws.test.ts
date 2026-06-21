import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnPlaywright, type PlaywrightResult } from './runner.js';
import type { RunEvent } from '../../dashboard-server/ws-broadcaster.js';

async function makeTempSpec(): Promise<{ tmpDir: string; specPath: string }> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qacito-ws-'));
  const specPath = path.join(tmpDir, 'dummy.spec.ts');
  await fs.writeFile(
    specPath,
    `import { test } from '@playwright/test';
test('dummy passes', async () => {});
`,
    'utf-8',
  );
  return { tmpDir, specPath };
}

test.describe('spawnPlaywright WebSocket events', () => {
  test('RT-WS-1: onEvent callback receives run_started and run_completed', async () => {
    const { tmpDir, specPath } = await makeTempSpec();
    const events: RunEvent[] = [];

    try {
      await spawnPlaywright(specPath, tmpDir, 30_000, [], (event) => {
        events.push(event);
      });

      const types = events.map((e) => e.type);
      expect(types).toContain('run_started');
      expect(types).toContain('run_completed');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  test('RT-WS-2: run_started event payload contains specPath', async () => {
    const { tmpDir, specPath } = await makeTempSpec();
    const events: RunEvent[] = [];

    try {
      await spawnPlaywright(specPath, tmpDir, 30_000, [], (event) => {
        events.push(event);
      });

      const started = events.find((e) => e.type === 'run_started');
      expect(started).toBeDefined();
      expect(started!.payload['specPath']).toBe(specPath);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  test('RT-WS-3: backward-compat — spawnPlaywright without onEvent still works', async () => {
    const { tmpDir, specPath } = await makeTempSpec();

    try {
      const result: PlaywrightResult = await spawnPlaywright(specPath, tmpDir, 30_000);
      expect(['passed', 'failed', 'error']).toContain(result.status);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
