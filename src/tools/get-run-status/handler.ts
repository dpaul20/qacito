import { getRun, type RunDetail } from '../../dashboard-server/run-store.js';
import type { GetRunStatusInput } from './schema.js';

export class RunNotFoundError extends Error {
  readonly code = 'RunNotFound';
  constructor(runId: string) {
    super(`Run not found: "${runId}". The runId may be from a previous server session.`);
    this.name = 'RunNotFoundError';
  }
}

/**
 * Returns the current state of a run by ID.
 * Status transitions: running → passed | failed | timeout | error | blocked
 * Poll until status is no longer "running".
 */
export async function getRunStatusHandler(input: GetRunStatusInput): Promise<RunDetail> {
  const run = getRun(input.runId);
  if (!run) throw new RunNotFoundError(input.runId);
  return run;
}
