import fs from 'node:fs/promises';
import { resolveSafe, PathOutOfBoundsError } from '../../shared/sandbox.js';
import { spawnPlaywright } from '../run-tests/runner.js';
import type { RunTestsNTimesInput, RunTestsNTimesOutput, RunAttempt } from './schema.js';

export { PathOutOfBoundsError };

export class SpecNotFoundError extends Error {
  readonly code = 'SpecNotFound';
  constructor(scriptPath: string) {
    super(`Spec file not found: "${scriptPath}".`);
    this.name = 'SpecNotFoundError';
  }
}

/**
 * Runs a Playwright spec N times sequentially and computes a flakiness score.
 *
 * flakinessScore = failCount / runCount
 *   0.0 → always passes (stable-pass)
 *   1.0 → always fails  (stable-fail)
 *   0 < score < 1 → intermittent (flaky)
 *
 * Runs are sequential (not parallel) to avoid port/resource conflicts
 * between Playwright workers on the same machine.
 */
export async function runTestsNTimesHandler(
  sandboxRoot: string,
  input: RunTestsNTimesInput,
): Promise<RunTestsNTimesOutput> {
  const resolvedSpec = resolveSafe(sandboxRoot, input.scriptPath);

  try {
    await fs.access(resolvedSpec);
  } catch {
    throw new SpecNotFoundError(input.scriptPath);
  }

  const runs: RunAttempt[] = [];

  for (let i = 1; i <= input.n; i++) {
    process.stderr.write(
      `[run_tests_n_times] attempt ${i}/${input.n} spec="${resolvedSpec}"\n`,
    );

    const result = await spawnPlaywright(resolvedSpec, sandboxRoot, input.timeoutMs);

    runs.push({
      attempt:    i,
      status:     result.status,
      durationMs: result.durationMs,
      failCount:  result.summary.failed,
    });
  }

  const passCount      = runs.filter((r) => r.status === 'passed').length;
  const failCount      = runs.length - passCount;
  const flakinessScore = parseFloat((failCount / runs.length).toFixed(2));
  const isFlaky        = flakinessScore > 0 && flakinessScore < 1;
  const verdict: RunTestsNTimesOutput['verdict'] =
    flakinessScore === 0 ? 'stable-pass'
    : flakinessScore === 1 ? 'stable-fail'
    : 'flaky';

  return {
    scriptPath:     input.scriptPath,
    runCount:       runs.length,
    passCount,
    failCount,
    flakinessScore,
    isFlaky,
    verdict,
    runs,
  };
}
