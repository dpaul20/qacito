import fs from 'node:fs/promises';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { resolveSafe, PathOutOfBoundsError } from '../../shared/sandbox.js';
import { spawnPlaywright } from '../run-tests/runner.js';
import {
  createRun,
  completeRun,
  upsertTest,
  type TestStatus,
} from '../../dashboard-server/run-store.js';
import { broadcast } from '../../dashboard-server/ws-broadcaster.js';
import { getDashboardUrl } from '../../dashboard-server/index.js';
import { appendHistory, type HistoryEntry } from '../../shared/history.js';
import type { StartTestRunInput, StartTestRunOutput } from './schema.js';
import { discoverStorageState, resolveAuthOptions, type AuthConfig } from '../../shared/auth-context.js';
import { writeQacitoConfig } from '../analyze-project/handler.js';

export { PathOutOfBoundsError };

export class SpecNotFoundError extends Error {
  readonly code = 'SpecNotFound';
  constructor(scriptPath: string) {
    super(`Spec file not found: "${scriptPath}".`);
    this.name = 'SpecNotFoundError';
  }
}

/**
 * Fires a Playwright run asynchronously and returns a runId immediately.
 * The caller can poll get_run_status(runId) to track progress.
 * Retry logic is intentionally left to the orchestrator — this tool
 * runs once and records the result.
 */
export async function startTestRunHandler(
  sandboxRoot: string,
  input: StartTestRunInput,
): Promise<StartTestRunOutput> {
  const resolvedSpec = resolveSafe(sandboxRoot, input.scriptPath);

  try {
    await fs.access(resolvedSpec);
  } catch {
    throw new SpecNotFoundError(input.scriptPath);
  }

  const storedPath = !input.auth ? await discoverStorageState(sandboxRoot) : null;
  const effectiveAuth: AuthConfig | undefined = input.auth ?? (storedPath ? { storageStatePath: storedPath } : undefined);

  if (effectiveAuth) {
    resolveAuthOptions(effectiveAuth);

    const specDir = path.dirname(resolvedSpec);
    const configPath = path.join(specDir, 'playwright.qacito.config.ts');
    let configExists = false;
    let existingBaseUrl = '';
    try {
      const configContent = await fs.readFile(configPath, 'utf-8');
      configExists = true;
      const match = /baseURL:\s*['"`]([^'"`]+)['"`]/.exec(configContent);
      existingBaseUrl = match?.[1] ?? '';
    } catch {
      // config does not exist
    }

    if (configExists && existingBaseUrl) {
      await writeQacitoConfig(specDir, existingBaseUrl, effectiveAuth);
    } else {
      process.stderr.write(
        `[start_test_run] auth supplied but no qacito config found at "${configPath}"; storageState/headers will not be applied\n`,
      );
    }
  }

  const runId = uuidv4();
  createRun(runId, { specPath: resolvedSpec, projectRoot: sandboxRoot });
  broadcast(runId, { type: 'run_started', payload: { runId, specPath: resolvedSpec } });

  process.stderr.write(
    `[start_test_run] fired runId=${runId} spec="${resolvedSpec}"\n`,
  );

  // Fire without awaiting — result is written to the run-store when complete.
  spawnPlaywright(resolvedSpec, sandboxRoot, input.timeoutMs, [], (event) => {
    if (event.type !== 'run_started' && event.type !== 'run_completed') {
      broadcast(runId, event);
    }
    if (event.type === 'test_result') {
      const p = event.payload;
      upsertTest(runId, {
        id:         String(p['title'] ?? ''),
        title:      String(p['title'] ?? ''),
        status:     String(p['status'] ?? 'failed') as TestStatus,
        durationMs: Number(p['durationMs'] ?? 0),
      });
    }
  })
    .then(async (result) => {
      const finalStatus = result.status === 'passed' ? 'passed'
        : result.status === 'timeout'               ? 'timeout'
        : result.status === 'error'                 ? 'error'
        : 'failed';

      await completeRun(runId, {
        status:     finalStatus,
        durationMs: result.durationMs,
        total:      result.summary.total,
        passed:     result.summary.passed,
        failed:     result.summary.failed,
        skipped:    result.summary.skipped,
      });

      broadcast(runId, {
        type: 'run_completed',
        payload: { runId, status: finalStatus, summary: result.summary, durationMs: result.durationMs },
      });

      const entry: HistoryEntry = {
        timestamp:    new Date().toISOString(),
        specPath:     resolvedSpec,
        projectRoot:  sandboxRoot,
        status:       finalStatus,
        durationMs:   result.durationMs,
        passedCount:  result.summary.passed,
        failedCount:  result.summary.failed,
        skippedCount: result.summary.skipped,
      };
      await appendHistory(entry).catch((err: unknown) => {
        process.stderr.write(
          `[start_test_run] history write failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
      });

      process.stderr.write(
        `[start_test_run] completed runId=${runId} status="${finalStatus}" ` +
          `passed=${result.summary.passed} failed=${result.summary.failed}\n`,
      );
    })
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[start_test_run] unexpected error runId=${runId}: ${msg}\n`);
      completeRun(runId, {
        status: 'error', durationMs: 0, total: 0, passed: 0, failed: 0, skipped: 0,
      }).catch(() => undefined);
    });

  const baseUrl = getDashboardUrl();
  return {
    runId,
    status:       'started',
    dashboardUrl: baseUrl ? `${baseUrl}/run/${runId}` : '',
  };
}
