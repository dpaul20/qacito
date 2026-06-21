import { chromium } from '@playwright/test';
import { appendHistory, type HistoryEntry } from '../../shared/history.js';
import { loadAxeBuilder, MissingAxeCoreError, type AxeResult, type AxeViolation } from './axe-loader.js';
import type { CheckAccessibilityInput, CheckAccessibilityOutput, A11yViolation, A11yNode } from './schema.js';
import { resolveAuthOptions, discoverStorageState, type AuthConfig } from '../../shared/auth-context.js';

export { MissingAxeCoreError };

export class InvalidUrlSchemeError extends Error {
  readonly code = 'InvalidUrlScheme';
  constructor(scheme: string) {
    super(`URL scheme "${scheme}" is not allowed. Only http and https are accepted.`);
    this.name = 'InvalidUrlSchemeError';
  }
}

export class NavigationFailedError extends Error {
  readonly code = 'NavigationFailed';
  constructor(detail: string) {
    super(`Navigation failed: ${detail}`);
    this.name = 'NavigationFailedError';
  }
}

export class CheckAccessibilityTimeoutError extends Error {
  readonly code = 'CheckAccessibilityTimeout';
  constructor(ms: number) {
    super(`Accessibility check timed out after ${ms}ms`);
    this.name = 'CheckAccessibilityTimeoutError';
  }
}

function rejectAfter(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new CheckAccessibilityTimeoutError(ms)), ms),
  );
}

const MAX_CHARS = 2_000;
function trunc(s: string): string {
  return s.length <= MAX_CHARS ? s : s.slice(0, MAX_CHARS - 14) + '...[truncated]';
}

function shapeAxeResult(result: AxeResult, url: string, durationMs: number): CheckAccessibilityOutput {
  const violations: A11yViolation[] = result.violations.map((v: AxeViolation) => ({
    id:          v.id,
    impact:      v.impact,
    description: v.description,
    help:        v.help,
    helpUrl:     v.helpUrl,
    wcagCriteria: v.tags.filter((t) => t.startsWith('wcag')),
    nodes: v.nodes.map((n): A11yNode => ({
      target:         n.target,
      html:           trunc(n.html),
      failureSummary: trunc(n.failureSummary),
    })),
  }));

  return {
    url,
    runDurationMs:  durationMs,
    axeCoreVersion: result.testEngine?.version ?? null,
    summary: {
      violations:   result.violations.length,
      passes:       result.passes.length,
      incomplete:   result.incomplete.length,
      inapplicable: result.inapplicable.length,
    },
    violations,
  };
}

export async function checkAccessibilityHandler(
  sandboxRoot: string,
  input: CheckAccessibilityInput,
): Promise<CheckAccessibilityOutput> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(input.url);
  } catch {
    throw new InvalidUrlSchemeError('(invalid URL)');
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new InvalidUrlSchemeError(parsedUrl.protocol.replace(':', ''));
  }

  const AxeBuilderCtor = await loadAxeBuilder();

  const start = Date.now();
  const browser = await chromium.launch({ headless: input.headless });

  try {
    const origin = (() => { try { const u = new URL(input.url); return `${u.protocol}//${u.host}`; } catch { return input.url; } })();
    const storedPath = !input.auth ? await discoverStorageState(origin) : null;
    const effectiveAuth: AuthConfig | undefined = input.auth ?? (storedPath ? { storageStatePath: storedPath } : undefined);
    const context = await browser.newContext(resolveAuthOptions(effectiveAuth));
    const page    = await context.newPage();

    const auditPromise = (async () => {
      try {
        await page.goto(input.url, { waitUntil: input.waitFor, timeout: input.timeoutMs });
      } catch (err: unknown) {
        throw new NavigationFailedError(err instanceof Error ? err.message : String(err));
      }

      const builder = new AxeBuilderCtor({ page }).withTags(input.tags);
      for (const s of input.includeSelectors ?? []) builder.include(s);
      for (const s of input.excludeSelectors ?? []) builder.exclude(s);

      return await builder.analyze();
    })();

    const result = await Promise.race([auditPromise, rejectAfter(input.timeoutMs)]);
    const shaped = shapeAxeResult(result, input.url, Date.now() - start);

    const entry: HistoryEntry = {
      timestamp:    new Date().toISOString(),
      specPath:     `accessibility:${input.url}`,
      projectRoot:  sandboxRoot,
      status:       shaped.summary.violations > 0 ? 'failed' : 'passed',
      durationMs:   shaped.runDurationMs,
      passedCount:  shaped.summary.passes,
      failedCount:  shaped.summary.violations,
      skippedCount: shaped.summary.incomplete,
    };
    await appendHistory(entry).catch((err: unknown) => {
      process.stderr.write(`[check_accessibility] history write failed: ${err instanceof Error ? err.message : String(err)}\n`);
    });

    return shaped;
  } finally {
    await browser.close();
  }
}
