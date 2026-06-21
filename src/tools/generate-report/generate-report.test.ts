import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { createRun, completeRun, upsertTest } from '../../dashboard-server/run-store.js';
import { generateReportHandler } from './handler.js';

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'qacito-gr-'));
}

function makeCompletedRun(overrides: { status?: string; withTests?: boolean } = {}): string {
  const runId = uuidv4();
  createRun(runId, { specPath: '/project/e2e/suite.spec.ts', projectRoot: '/project' });

  if (overrides.withTests) {
    upsertTest(runId, { id: 'tc1', title: 'Home page loads', status: 'passed', durationMs: 450 });
    upsertTest(runId, { id: 'tc2', title: 'Login fails gracefully', status: 'failed', durationMs: 200, error: 'Expected 200, got 404' });
  }

  // completeRun is async, but for tests we just update the in-memory status directly
  const run = (createRun as unknown as undefined) ?? undefined; void run;
  // Use a noop path so we don't write to disk during tests
  completeRun(
    runId,
    { status: (overrides.status ?? 'passed') as 'passed', durationMs: 1500, total: 2, passed: 1, failed: 1, skipped: 0 },
    path.join(os.tmpdir(), `qacito-gr-noop-${uuidv4()}.jsonl`),
  ).catch(() => undefined);

  return runId;
}

test.describe('generate-report handler', () => {
  test('GR-1: valid run generates .md and .html in outputDir', async () => {
    const runId = makeCompletedRun({ withTests: true });
    const dir = await makeTempDir();

    const result = await generateReportHandler({ runId, outputDir: dir });

    expect('error' in result).toBe(false);
    if ('error' in result) return;

    expect(result.mdPath).toMatch(/qacito-report-.+\.md$/);
    expect(result.htmlPath).toMatch(/qacito-report-.+\.html$/);

    const mdExists = await fs.access(result.mdPath).then(() => true).catch(() => false);
    const htmlExists = await fs.access(result.htmlPath).then(() => true).catch(() => false);
    expect(mdExists).toBe(true);
    expect(htmlExists).toBe(true);
  });

  test('GR-2: non-existent runId returns RunNotFound error', async () => {
    const dir = await makeTempDir();
    const result = await generateReportHandler({ runId: uuidv4(), outputDir: dir });

    expect('error' in result).toBe(true);
    if (!('error' in result)) return;
    expect(result.error).toBe('RunNotFound');
  });

  test('GR-3: .md contains required sections in order', async () => {
    const runId = makeCompletedRun({ withTests: true });
    const dir = await makeTempDir();

    const result = await generateReportHandler({ runId, outputDir: dir });
    if ('error' in result) throw new Error('Expected success');

    const md = await fs.readFile(result.mdPath, 'utf-8');

    const metaIdx     = md.indexOf('## Metadata');
    const summaryIdx  = md.indexOf('## Resumen');
    const resultsIdx  = md.indexOf('## Resultados por Test');
    const findingsIdx = md.indexOf('## Hallazgos Clave');

    expect(metaIdx).toBeGreaterThan(-1);
    expect(summaryIdx).toBeGreaterThan(metaIdx);
    expect(resultsIdx).toBeGreaterThan(summaryIdx);
    expect(findingsIdx).toBeGreaterThan(resultsIdx);
  });

  test('GR-4: .html contains status color values', async () => {
    const runId = makeCompletedRun({ withTests: true });
    const dir = await makeTempDir();

    const result = await generateReportHandler({ runId, outputDir: dir });
    if ('error' in result) throw new Error('Expected success');

    const html = await fs.readFile(result.htmlPath, 'utf-8');

    expect(html).toContain('#22c55e'); // pass color
    expect(html).toContain('#ef4444'); // fail color
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('system-ui');
    expect(html).toContain('max-width: 900px');
  });
});
