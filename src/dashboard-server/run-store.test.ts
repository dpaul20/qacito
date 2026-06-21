import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import {
  createRun,
  completeRun,
  getRun,
  listRuns,
  upsertTest,
  loadRunsFromDisk,
} from './run-store.js';

async function makeTempFile(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'qacito-rs-'));
  return path.join(dir, 'runs.jsonl');
}

test.describe('run-store', () => {
  test('RS-1: createRun → getRun roundtrip', () => {
    const id = uuidv4();
    createRun(id, { specPath: '/p/test.spec.ts', projectRoot: '/p' });

    const run = getRun(id);
    expect(run).toBeDefined();
    expect(run!.id).toBe(id);
    expect(run!.specPath).toBe('/p/test.spec.ts');
    expect(run!.projectRoot).toBe('/p');
    expect(run!.status).toBe('running');
    expect(run!.tests).toEqual([]);
  });

  test('RS-2: completeRun persists to JSONL file', async () => {
    const id = uuidv4();
    const filePath = await makeTempFile();

    createRun(id, { specPath: '/p/suite.spec.ts', projectRoot: '/p' });
    await completeRun(
      id,
      { status: 'passed', durationMs: 1200, total: 3, passed: 3, failed: 0, skipped: 0 },
      filePath,
    );

    const run = getRun(id);
    expect(run!.status).toBe('passed');
    expect(run!.durationMs).toBe(1200);

    const raw = await fs.readFile(filePath, 'utf-8');
    const persisted = JSON.parse(raw.trim()) as { id: string; status: string };
    expect(persisted.id).toBe(id);
    expect(persisted.status).toBe('passed');
  });

  test('RS-3: listRuns orders by startedAt DESC', async () => {
    const ids = [uuidv4(), uuidv4(), uuidv4()];
    const filePath = await makeTempFile();

    for (const id of ids) {
      createRun(id, { specPath: `/p/${id}.spec.ts`, projectRoot: '/p' });
      await completeRun(id, { status: 'passed', durationMs: 100, total: 1, passed: 1, failed: 0, skipped: 0 }, filePath);
      await new Promise((r) => setTimeout(r, 10)); // ensure distinct timestamps
    }

    const runs = listRuns(10);
    const returnedIds = runs.map((r) => r.id);
    // Most recent first — last created should appear first among our 3
    const lastIdx = returnedIds.indexOf(ids[2]!);
    const firstIdx = returnedIds.indexOf(ids[0]!);
    expect(lastIdx).toBeLessThan(firstIdx);
  });

  test('RS-4: loadRunsFromDisk populates the store from JSONL', async () => {
    const filePath = await makeTempFile();
    const id = uuidv4();

    // Write a run directly to the file (simulating a previous session)
    const entry = {
      id,
      projectRoot: '/p',
      specPath: '/p/prev.spec.ts',
      status: 'failed',
      startedAt: new Date().toISOString(),
      durationMs: 500,
      total: 2,
      passed: 1,
      failed: 1,
      skipped: 0,
      tests: [],
    };
    await fs.writeFile(filePath, JSON.stringify(entry) + '\n', 'utf-8');

    await loadRunsFromDisk(filePath);

    const loaded = getRun(id);
    expect(loaded).toBeDefined();
    expect(loaded!.status).toBe('failed');
    expect(loaded!.specPath).toBe('/p/prev.spec.ts');
  });

  test('RS-5: upsertTest adds and updates test within run', () => {
    const runId = uuidv4();
    createRun(runId, { specPath: '/p/t.spec.ts', projectRoot: '/p' });

    upsertTest(runId, { id: 'tc1', title: 'TC1', status: 'passed', durationMs: 100 });
    upsertTest(runId, { id: 'tc2', title: 'TC2', status: 'failed', durationMs: 200, error: 'expected true' });

    const run = getRun(runId)!;
    expect(run.tests).toHaveLength(2);
    expect(run.tests.find((t) => t.id === 'tc1')?.status).toBe('passed');
    expect(run.tests.find((t) => t.id === 'tc2')?.error).toBe('expected true');

    // Update existing test
    upsertTest(runId, { id: 'tc1', title: 'TC1', status: 'failed', durationMs: 150 });
    expect(run.tests).toHaveLength(2);
    expect(run.tests.find((t) => t.id === 'tc1')?.status).toBe('failed');
  });

  test('RS-6: listRuns can filter by exact projectRoot', async () => {
    const filePath = await makeTempFile();
    const alphaId = uuidv4();
    const betaId = uuidv4();

    createRun(alphaId, { specPath: '/alpha/a.spec.ts', projectRoot: '/alpha' });
    await completeRun(alphaId, { status: 'passed', durationMs: 100, total: 1, passed: 1, failed: 0, skipped: 0 }, filePath);

    createRun(betaId, { specPath: '/beta/b.spec.ts', projectRoot: '/beta' });
    await completeRun(betaId, { status: 'failed', durationMs: 100, total: 1, passed: 0, failed: 1, skipped: 0 }, filePath);

    const alphaRuns = listRuns(20, '/alpha');
    expect(alphaRuns.some((run) => run.id === alphaId)).toBe(true);
    expect(alphaRuns.some((run) => run.id === betaId)).toBe(false);
    expect(alphaRuns.every((run) => run.projectRoot === '/alpha')).toBe(true);
  });
});
