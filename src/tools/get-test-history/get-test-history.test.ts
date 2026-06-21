import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { appendHistory, type HistoryEntry } from '../../shared/history.js';
import { getTestHistoryHandler } from './handler.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates an isolated temp directory for a single test. */
async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'qacito-history-test-'));
}

/** Returns the full history file path inside the given temp dir. */
function historyFilePath(dir: string): string {
  return path.join(dir, 'history.jsonl');
}

/** Produces a HistoryEntry with sensible defaults. */
function makeEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    timestamp: new Date().toISOString(),
    specPath: '/project/test.spec.ts',
    projectRoot: '/project',
    status: 'passed',
    durationMs: 100,
    passedCount: 1,
    failedCount: 0,
    skippedCount: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('get-test-history handler', () => {
  // TH-1: all 3 entries are returned in insertion order
  test('TH-1: returns all entries in order when no filter is applied', async () => {
    const dir = await makeTempDir();
    const filePath = historyFilePath(dir);

    const e1 = makeEntry({ specPath: '/p/a.spec.ts' });
    const e2 = makeEntry({ specPath: '/p/b.spec.ts' });
    const e3 = makeEntry({ specPath: '/p/c.spec.ts' });

    await appendHistory(e1, filePath);
    await appendHistory(e2, filePath);
    await appendHistory(e3, filePath);

    const result = await getTestHistoryHandler({}, filePath);

    expect(result.totalEntries).toBe(3);
    expect(result.entries).toHaveLength(3);
    expect(result.entries[0]?.specPath).toBe('/p/a.spec.ts');
    expect(result.entries[2]?.specPath).toBe('/p/c.spec.ts');
  });

  // TH-2: filter by projectRoot returns only matching entries
  test('TH-2: projectRoot filter returns only matching entries', async () => {
    const dir = await makeTempDir();
    const filePath = historyFilePath(dir);

    await appendHistory(makeEntry({ projectRoot: '/alpha' }), filePath);
    await appendHistory(makeEntry({ projectRoot: '/beta' }), filePath);
    await appendHistory(makeEntry({ projectRoot: '/alpha/sub' }), filePath);

    const result = await getTestHistoryHandler({ projectRoot: '/alpha' }, filePath);

    expect(result.totalEntries).toBe(2);
    expect(result.entries.every((e) => e.projectRoot.includes('/alpha'))).toBe(true);
  });

  // TH-3: filter by specPath returns only matching entries
  test('TH-3: specPath filter returns only matching entries', async () => {
    const dir = await makeTempDir();
    const filePath = historyFilePath(dir);

    await appendHistory(makeEntry({ specPath: '/p/auth.spec.ts' }), filePath);
    await appendHistory(makeEntry({ specPath: '/p/login.spec.ts' }), filePath);
    await appendHistory(makeEntry({ specPath: '/p/auth-flow.spec.ts' }), filePath);

    const result = await getTestHistoryHandler({ specPath: 'auth' }, filePath);

    expect(result.totalEntries).toBe(2);
    expect(result.entries.every((e) => e.specPath.includes('auth'))).toBe(true);
  });

  // TH-4: limit takes the last N entries
  test('TH-4: limit returns the most recent N entries', async () => {
    const dir = await makeTempDir();
    const filePath = historyFilePath(dir);

    for (let i = 1; i <= 5; i++) {
      await appendHistory(makeEntry({ specPath: `/p/run${i}.spec.ts` }), filePath);
    }

    const result = await getTestHistoryHandler({ limit: 2 }, filePath);

    expect(result.totalEntries).toBe(2);
    expect(result.entries[0]?.specPath).toBe('/p/run4.spec.ts');
    expect(result.entries[1]?.specPath).toBe('/p/run5.spec.ts');
  });

  // TH-5: non-existent file returns empty array
  test('TH-5: returns empty array when history file does not exist', async () => {
    const dir = await makeTempDir();
    const filePath = historyFilePath(dir); // file was never created

    const result = await getTestHistoryHandler({}, filePath);

    expect(result.totalEntries).toBe(0);
    expect(result.entries).toHaveLength(0);
  });

  // TH-6: malformed line is skipped, valid lines are returned
  test('TH-6: skips malformed lines and returns valid entries', async () => {
    const dir = await makeTempDir();
    const filePath = historyFilePath(dir);

    const validEntry = makeEntry({ specPath: '/p/good.spec.ts' });
    await appendHistory(validEntry, filePath);
    await fs.appendFile(filePath, 'NOT_VALID_JSON\n', 'utf-8');
    await appendHistory(makeEntry({ specPath: '/p/also-good.spec.ts' }), filePath);

    const result = await getTestHistoryHandler({}, filePath);

    expect(result.totalEntries).toBe(2);
    expect(result.entries.every((e) => e.specPath.includes('.spec.ts'))).toBe(true);
  });

  // TH-7: combining projectRoot + specPath filters yields the intersection
  test('TH-7: combined filters return only entries matching both criteria', async () => {
    const dir = await makeTempDir();
    const filePath = historyFilePath(dir);

    await appendHistory(makeEntry({ projectRoot: '/alpha', specPath: '/alpha/auth.spec.ts' }), filePath);
    await appendHistory(makeEntry({ projectRoot: '/alpha', specPath: '/alpha/login.spec.ts' }), filePath);
    await appendHistory(makeEntry({ projectRoot: '/beta', specPath: '/beta/auth.spec.ts' }), filePath);

    const result = await getTestHistoryHandler({ projectRoot: '/alpha', specPath: 'auth' }, filePath);

    expect(result.totalEntries).toBe(1);
    expect(result.entries[0]?.projectRoot).toBe('/alpha');
    expect(result.entries[0]?.specPath).toContain('auth');
  });

  // TH-8: round-trip — appendHistory then getTestHistoryHandler returns matching fields
  test('TH-8: round-trip preserves all entry fields', async () => {
    const dir = await makeTempDir();
    const filePath = historyFilePath(dir);

    const original = makeEntry({
      specPath: '/project/e2e/checkout.spec.ts',
      projectRoot: '/project',
      status: 'failed',
      durationMs: 4200,
      passedCount: 3,
      failedCount: 2,
      skippedCount: 1,
    });

    await appendHistory(original, filePath);

    const result = await getTestHistoryHandler({}, filePath);

    expect(result.totalEntries).toBe(1);
    const entry = result.entries[0];
    expect(entry?.specPath).toBe(original.specPath);
    expect(entry?.projectRoot).toBe(original.projectRoot);
    expect(entry?.status).toBe(original.status);
    expect(entry?.durationMs).toBe(original.durationMs);
    expect(entry?.passedCount).toBe(original.passedCount);
    expect(entry?.failedCount).toBe(original.failedCount);
    expect(entry?.skippedCount).toBe(original.skippedCount);
  });
});
