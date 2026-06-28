import { getRun, listRuns, type RunDetail } from '../../dashboard-server/run-store.js';
import type { ViewRunResultsInput } from './schema.js';

export class RunNotFoundError extends Error {
  readonly code = 'RunNotFound';
  constructor(runId: string) {
    super(`Run not found: "${runId}". The runId may be from a previous server session.`);
    this.name = 'RunNotFoundError';
  }
}

export class NoRunsError extends Error {
  readonly code = 'NoRuns';
  constructor() {
    super('No completed runs found. Start a test run first with start_test_run.');
    this.name = 'NoRunsError';
  }
}

/**
 * Returns a RunDetail for display in the interactive UI.
 * If runId is given, fetches that specific run.
 * Otherwise, returns the most recent completed run.
 */
export async function viewRunResultsHandler(input: ViewRunResultsInput): Promise<RunDetail> {
  if (input.runId !== undefined) {
    const run = getRun(input.runId);
    if (!run) throw new RunNotFoundError(input.runId);
    return run;
  }

  // Find the latest completed run (any non-running status)
  const summaries = listRuns(10);
  const completed = summaries.find((s) => s.status !== 'running');
  if (!completed) throw new NoRunsError();

  const run = getRun(completed.id);
  if (!run) throw new RunNotFoundError(completed.id);
  return run;
}
