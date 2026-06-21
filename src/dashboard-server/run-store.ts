import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export type RunStatus = 'running' | 'passed' | 'failed' | 'timeout' | 'error' | 'blocked';
export type TestStatus = 'pending' | 'running' | 'passed' | 'failed' | 'timedOut';

export interface TestResult {
  id: string;
  title: string;
  status: TestStatus;
  durationMs: number;
  error?: string;
  screenshotPath?: string;
}

export interface RunSummary {
  id: string;
  projectRoot: string;
  specPath: string;
  status: RunStatus;
  startedAt: string;
  durationMs: number;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  planId?: string;
}

export interface RunDetail extends RunSummary {
  tests: TestResult[];
}

export const DEFAULT_RUNS_FILE = path.join(os.homedir(), '.qacito', 'runs.jsonl');
const MAX_RUNS_IN_MEMORY = 50;

const runMap = new Map<string, RunDetail>();

export function createRun(
  id: string,
  meta: { specPath: string; projectRoot: string; planId?: string },
): void {
  runMap.set(id, {
    id,
    projectRoot: meta.projectRoot,
    specPath: meta.specPath,
    status: 'running',
    startedAt: new Date().toISOString(),
    durationMs: 0,
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    tests: [],
    ...(meta.planId !== undefined ? { planId: meta.planId } : {}),
  });
}

export function upsertTest(runId: string, test: TestResult): void {
  const run = runMap.get(runId);
  if (!run) return;
  const idx = run.tests.findIndex((t) => t.id === test.id);
  if (idx >= 0) {
    run.tests[idx] = test;
  } else {
    run.tests.push(test);
  }
}

export async function completeRun(
  runId: string,
  summary: {
    status: RunStatus;
    durationMs: number;
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  },
  runsFilePath = DEFAULT_RUNS_FILE,
): Promise<void> {
  const run = runMap.get(runId);
  if (!run) return;
  run.status = summary.status;
  run.durationMs = summary.durationMs;
  run.total = summary.total;
  run.passed = summary.passed;
  run.failed = summary.failed;
  run.skipped = summary.skipped;
  await fs.mkdir(path.dirname(runsFilePath), { recursive: true });
  await fs.appendFile(runsFilePath, JSON.stringify(run) + '\n', 'utf-8');
}

export function getRun(id: string): RunDetail | undefined {
  return runMap.get(id);
}

export function listRuns(limit = 20, projectRoot?: string): RunSummary[] {
  return [...runMap.values()]
    .filter((run) => projectRoot === undefined || run.projectRoot === projectRoot)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, limit)
    .map(({ tests: _tests, ...summary }) => summary);
}

export async function loadRunsFromDisk(runsFilePath = DEFAULT_RUNS_FILE): Promise<void> {
  let raw: string;
  try {
    raw = await fs.readFile(runsFilePath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw err;
  }
  const lines = raw.split('\n').filter((l) => l.trim() !== '');
  for (const line of lines.slice(-MAX_RUNS_IN_MEMORY)) {
    try {
      const run = JSON.parse(line) as RunDetail;
      runMap.set(run.id, run);
    } catch {
      // skip malformed lines
    }
  }
}
