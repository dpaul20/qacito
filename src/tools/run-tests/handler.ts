import fs from 'node:fs/promises';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { PathOutOfBoundsError, resolveSafe } from '../../shared/sandbox.js';
import type { RunTestsInput } from './schema.js';
import { spawnPlaywright, spawnCypress, detectRunner, type TestFailure } from './runner.js';
import {
  increment,
  canRetry,
  recordErrors,
  buildBlockerReport,
} from './retry-tracker.js';
import { appendHistory, type HistoryEntry } from '../../shared/history.js';
import { createRun, completeRun, upsertTest, type TestStatus } from '../../dashboard-server/run-store.js';
import { broadcast } from '../../dashboard-server/ws-broadcaster.js';
import { getDashboardUrl } from '../../dashboard-server/index.js';

// ---------------------------------------------------------------------------
// Output type
// ---------------------------------------------------------------------------

/**
 * Shape returned by the `run_tests` tool.
 *
 * Aligns with both spec files (test-execution + self-healing-loop) and the
 * design.md interface contract.
 */
export interface RunTestsOutput {
  /** Aggregate status: "passed" | "failed" | "timeout" | "error" | "blocked". */
  status: 'passed' | 'failed' | 'timeout' | 'error' | 'blocked';
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  failures: TestFailure[];
  durationMs: number;
  /** Combined process output, truncated to 8 192 bytes. */
  logs: string;
  /** 1-based attempt number for this spec path in the current session. */
  attempt: number;
  /**
   * Whether the self-healing loop may invoke `run_tests` again for this spec.
   * Becomes `false` once `attempt >= maxRetries`.
   */
  can_retry: boolean;
  /**
   * Present only when `can_retry` is `false` and the run did not pass.
   * Contains the full error history and suggested next actions.
   */
  blocker_report?: string;
  /** Unique identifier for this run (UUID v4). */
  runId: string;
  /** URL to the live dashboard run view. Empty string if dashboard is not running. */
  dashboardUrl: string;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Validates the spec file, runs Playwright, updates the retry tracker, and
 * returns a structured `RunTestsOutput`.
 *
 * Error codes (thrown as `SpecNotFoundError`):
 *   - `SpecNotFound` — the spec file does not exist on disk.
 *
 * Path traversal attempts are prevented by `resolveSafe` (throws
 * `PathOutOfBoundsError` before any process is spawned).
 *
 * @param sandboxRoot  Absolute sandbox root (projectRoot arg or cwd).
 * @param input        Validated input from the Zod schema.
 */
export async function runTestsHandler(
  sandboxRoot: string,
  input: RunTestsInput,
): Promise<RunTestsOutput> {
  // 1. Sandbox check — never pass unsanitised paths to child_process.
  const resolvedSpec = resolveSafe(sandboxRoot, input.scriptPath);

  // 2. Verify the spec file exists before spawning a child process.
  try {
    await fs.access(resolvedSpec);
  } catch {
    throw new SpecNotFoundError(input.scriptPath);
  }

  // 3. Determine the cwd for playwright — parent directory of the spec file,
  //    bounded to the sandbox root.  We use the sandbox root directly so that
  //    Playwright's node_modules resolution works from the project root.
  const cwd = sandboxRoot;

  // 4. Increment attempt counter BEFORE spawning (so attempt=1 on first call).
  const attempt = increment(resolvedSpec);

  // 4b. Register run in the store and broadcast run_started.
  const runId = uuidv4();
  createRun(runId, { specPath: resolvedSpec, projectRoot: sandboxRoot });
  broadcast(runId, { type: 'run_started', payload: { runId, specPath: resolvedSpec } });

  process.stderr.write(
    `[run_tests] attempt=${attempt} maxRetries=${input.maxRetries} ` +
      `spec="${resolvedSpec}" runId=${runId}\n`,
  );

  // 5. Detect runner and spawn the appropriate test runner, forwarding events to WebSocket.
  // run_started / run_completed are managed explicitly by this handler (with runId + finalStatus).
  const detectedRunner = await detectRunner(cwd);
  const spawnFn = detectedRunner === 'cypress'
    ? (onEvent: Parameters<typeof spawnPlaywright>[4]) => spawnCypress(resolvedSpec, cwd, input.timeoutMs, onEvent)
    : (onEvent: Parameters<typeof spawnPlaywright>[4]) => spawnPlaywright(resolvedSpec, cwd, input.timeoutMs, [], onEvent);
  const result = await spawnFn((event) => {
    if (event.type !== 'run_started' && event.type !== 'run_completed') {
      broadcast(runId, event);
    }
    if (event.type === 'test_result') {
      const p = event.payload;
      upsertTest(runId, {
        id: String(p['title'] ?? ''),
        title: String(p['title'] ?? ''),
        status: String(p['status'] ?? 'failed') as TestStatus,
        durationMs: Number(p['durationMs'] ?? 0),
      });
    }
  });

  // 6. Record errors in the tracker for the blocker report.
  if (result.failures.length > 0) {
    const errorMessages = result.failures.map(
      (f) => `${f.title}: ${f.message}`,
    );
    recordErrors(resolvedSpec, attempt, errorMessages);
  } else if (result.status === 'timeout') {
    recordErrors(resolvedSpec, attempt, [
      `Test suite timed out after ${input.timeoutMs}ms`,
    ]);
  } else if (result.status === 'error') {
    recordErrors(resolvedSpec, attempt, [
      'Playwright process exited with an error — check logs',
    ]);
  }

  // 7. Determine can_retry and produce a blocker report when exhausted.
  const canRetryNow = canRetry(resolvedSpec, input.maxRetries);
  const isBlocked = !canRetryNow && result.status !== 'passed';

  const finalStatus = isBlocked ? 'blocked' : result.status;

  // Persist the completed run in the store and notify WebSocket clients.
  await completeRun(runId, {
    status: finalStatus,
    durationMs: result.durationMs,
    total: result.summary.total,
    passed: result.summary.passed,
    failed: result.summary.failed,
    skipped: result.summary.skipped,
  });
  broadcast(runId, {
    type: 'run_completed',
    payload: { runId, status: finalStatus, summary: result.summary, durationMs: result.durationMs },
  });

  const baseUrl = getDashboardUrl();
  const output: RunTestsOutput = {
    status: finalStatus,
    summary: result.summary,
    failures: result.failures,
    durationMs: result.durationMs,
    logs: result.rawOutput,
    attempt,
    can_retry: canRetryNow,
    runId,
    dashboardUrl: baseUrl ? `${baseUrl}/run/${runId}` : '',
  };

  if (isBlocked) {
    output.blocker_report = buildBlockerReport(resolvedSpec, input.maxRetries);
  }

  try {
    const entry: HistoryEntry = {
      timestamp: new Date().toISOString(),
      specPath: resolvedSpec,
      projectRoot: sandboxRoot,
      status: output.status,
      durationMs: output.durationMs,
      passedCount: output.summary.passed,
      failedCount: output.summary.failed,
      skippedCount: output.summary.skipped,
    };
    await appendHistory(entry);
  } catch (histErr: unknown) {
    process.stderr.write(
      `[run_tests] history write failed: ${histErr instanceof Error ? histErr.message : String(histErr)}\n`,
    );
  }

  process.stderr.write(
    `[run_tests] status="${output.status}" total=${result.summary.total} ` +
      `passed=${result.summary.passed} failed=${result.summary.failed} ` +
      `can_retry=${output.can_retry}\n`,
  );

  return output;
}

// ---------------------------------------------------------------------------
// Custom errors
// ---------------------------------------------------------------------------

/**
 * Thrown when the specified spec file does not exist on disk.
 *
 * The caller (index.ts) converts this to an MCP-level `isError: true`
 * response with code `SpecNotFound`.
 */
export class SpecNotFoundError extends Error {
  readonly code = 'SpecNotFound';

  constructor(scriptPath: string) {
    super(
      `Spec file not found: "${scriptPath}". ` +
        'Ensure the path is correct and the file exists before calling run_tests.',
    );
    this.name = 'SpecNotFoundError';
  }
}
