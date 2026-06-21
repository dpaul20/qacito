/**
 * In-memory retry tracker for the self-healing loop.
 *
 * Tracks how many times `run_tests` has been called for a given spec file
 * within the current process session. The counter resets automatically when
 * a NEW scriptPath is seen (each path has its own independent counter).
 *
 * Design note: the server does NOT retry automatically — it only exposes
 * `can_retry` and `attempt` so Claude Desktop can decide whether to
 * rewrite the spec and invoke `run_tests` again.
 */

export interface RetryState {
  /** 1-based attempt count. */
  attemptCount: number;
  /** Accumulated error messages keyed by attempt number. */
  history: Map<number, string[]>;
}

/** Singleton map: scriptPath → RetryState. */
const tracker = new Map<string, RetryState>();

/**
 * Increments (or initialises) the attempt counter for `scriptPath`.
 *
 * @returns The new (1-based) attempt count.
 */
export function increment(scriptPath: string): number {
  const existing = tracker.get(scriptPath);
  if (existing) {
    existing.attemptCount += 1;
    return existing.attemptCount;
  }
  tracker.set(scriptPath, { attemptCount: 1, history: new Map() });
  return 1;
}

/**
 * Returns the current attempt count for `scriptPath` (0 if never seen).
 */
export function getCount(scriptPath: string): number {
  return tracker.get(scriptPath)?.attemptCount ?? 0;
}

/**
 * Returns `true` if the attempt count for `scriptPath` is strictly less
 * than `maxRetries`, meaning at least one more attempt is allowed.
 */
export function canRetry(scriptPath: string, maxRetries: number): boolean {
  return getCount(scriptPath) < maxRetries;
}

/**
 * Appends error messages from a failed attempt to the history for `scriptPath`.
 *
 * @param scriptPath  The spec file path.
 * @param attempt     The 1-based attempt number this set of errors belongs to.
 * @param errors      Error message strings from the failed run.
 */
export function recordErrors(
  scriptPath: string,
  attempt: number,
  errors: string[],
): void {
  const state = tracker.get(scriptPath);
  if (!state) return;
  state.history.set(attempt, errors);
}

/**
 * Resets all state for `scriptPath`.
 * Useful for tests or when the caller explicitly starts over with the same path.
 */
export function reset(scriptPath: string): void {
  tracker.delete(scriptPath);
}

/**
 * Builds a structured blocker report when the self-healing loop has exhausted
 * its retries without converging.
 *
 * The report is meant to be surfaced directly to the user / orchestrator so
 * they can take manual action.
 *
 * @param scriptPath  The spec file that could not be healed.
 * @param maxRetries  The retry limit that was configured.
 * @returns           A human-readable + machine-parseable string.
 */
export function buildBlockerReport(
  scriptPath: string,
  maxRetries: number,
): string {
  const state = tracker.get(scriptPath);
  const totalAttempts = state?.attemptCount ?? 0;
  const historyEntries: string[] = [];

  for (let i = 1; i <= totalAttempts; i++) {
    const errors = state?.history.get(i) ?? [];
    const formatted =
      errors.length > 0
        ? errors.map((e, idx) => `    [${idx + 1}] ${e}`).join('\n')
        : '    (no error details recorded)';
    historyEntries.push(`  Attempt ${i}:\n${formatted}`);
  }

  return [
    `Self-healing loop blocked for spec: ${scriptPath}`,
    `Attempts made: ${totalAttempts} / ${maxRetries}`,
    '',
    'Error history:',
    historyEntries.join('\n\n'),
    '',
    'Suggested actions:',
    '  • Verify the application under test is running and reachable.',
    '  • Check that selectors match the current DOM (prefer getByRole / getByTestId).',
    '  • Inspect the full Playwright HTML report in test-results/ for screenshots.',
    '  • Review the spec logic — the generated test may target a non-existent endpoint.',
  ].join('\n');
}
