import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { RunEvent } from '../../dashboard-server/ws-broadcaster.js';

// ---------------------------------------------------------------------------
// Package manager detection
// ---------------------------------------------------------------------------

type PackageManager = 'npm' | 'yarn' | 'pnpm';

/**
 * Walks up from `startDir` looking for a lock file to detect the package
 * manager. Stops at the filesystem root or after 8 levels. Falls back to npm.
 */
async function detectPackageManager(startDir: string): Promise<PackageManager> {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 8; i++) {
    const [hasPnpm, hasYarn, hasNpm] = await Promise.all([
      fs.access(path.join(dir, 'pnpm-lock.yaml')).then(() => true).catch(() => false),
      fs.access(path.join(dir, 'yarn.lock')).then(() => true).catch(() => false),
      fs.access(path.join(dir, 'package-lock.json')).then(() => true).catch(() => false),
    ]);
    if (hasPnpm) return 'pnpm';
    if (hasYarn) return 'yarn';
    if (hasNpm) return 'npm';
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return 'npm';
}

/**
 * On Windows, Node spawn with shell:false requires the `.cmd` extension for
 * scripts installed in node_modules/.bin (npx, yarn, pnpm).
 */
function resolveCmd(cmd: string): string {
  return process.platform === 'win32' ? `${cmd}.cmd` : cmd;
}

/**
 * Builds [command, args] for `npx/yarn/pnpm playwright test <scriptPath> ...`
 * depending on the detected package manager.
 * reportPath is injected via PLAYWRIGHT_JSON_OUTPUT_NAME env var, not CLI.
 * preArgs (e.g. --config) are inserted before the file filter so Playwright
 * processes them before resolving testDir.
 */
function buildPlaywrightCommand(
  pm: PackageManager,
  scriptPath: string,
  cwd: string,
  preArgs: string[],
  extraArgs: string[],
): [string, string[]] {
  // Convert absolute path to forward-slash relative path so Playwright
  // treats it as a file filter instead of a regex (backslashes break regex matching).
  const relPath = path.relative(cwd, scriptPath).replace(/\\/g, '/');
  // Use dual reporter: line for real-time streaming, json for final structured result.
  const pwArgs = ['playwright', 'test', ...preArgs, relPath, ...extraArgs, '--reporter=line,json'];
  switch (pm) {
    case 'yarn': return [resolveCmd('yarn'), pwArgs];
    case 'pnpm': return [resolveCmd('pnpm'), ['exec', ...pwArgs]];
    default:     return [resolveCmd('npx'), pwArgs];
  }
}

/**
 * Looks for a `playwright.qacito.config.{ts,js}` file in the same directory
 * as the spec. Returns its absolute path if found, null otherwise.
 */
async function findColocatedConfig(scriptPath: string): Promise<string | null> {
  const dir = path.dirname(scriptPath);
  for (const name of ['playwright.qacito.config.ts', 'playwright.qacito.config.js']) {
    const candidate = path.join(dir, name);
    try {
      await fs.access(candidate);
      return candidate;
    } catch { /* not found, try next */ }
  }
  return null;
}

// Playwright line reporter patterns for real-time event parsing.
// ✓  test title (450ms)   → passed
// ✘  test title           → failed  (Playwright uses ✘ or ✗ depending on version)
//  ·  test title          → running
const RE_PASSED  = /[✓✔]\s+(.+?)\s+\((\d+)ms\)/u;
const RE_FAILED  = /[✘✗×]\s+(.+)/u;
const RE_RUNNING = /·\s+(.+)/u;

function parseLineEvent(line: string): RunEvent | null {
  const passed = RE_PASSED.exec(line);
  if (passed) {
    return {
      type: 'test_result',
      payload: { title: passed[1] ?? '', status: 'passed', durationMs: Number(passed[2] ?? 0) },
    };
  }
  const failed = RE_FAILED.exec(line);
  if (failed) {
    return { type: 'test_result', payload: { title: failed[1] ?? '', status: 'failed', durationMs: 0 } };
  }
  const running = RE_RUNNING.exec(line);
  if (running) {
    return { type: 'test_started', payload: { title: running[1] ?? '' } };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single test failure as extracted from the Playwright JSON report. */
export interface TestFailure {
  title: string;
  file: string;
  message: string;
  /** Stack trace, truncated to 2 000 characters. */
  stack?: string;
}

/** Normalised result returned by `spawnPlaywright`. */
export interface PlaywrightResult {
  /** Aggregate status across all suites. */
  status: 'passed' | 'failed' | 'timeout' | 'error';
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  failures: TestFailure[];
  /** Wall-clock duration in milliseconds. */
  durationMs: number;
  /** Combined stdout + stderr from the process, truncated to 8 192 bytes. */
  rawOutput: string;
}

// ---------------------------------------------------------------------------
// Internal Playwright JSON report shapes
// (Only the fields we actually read — Playwright may include more.)
// ---------------------------------------------------------------------------

interface PwError {
  message?: string;
  stack?: string;
  value?: string;
}

interface PwTestResult {
  status?: string;
  errors?: PwError[];
}

interface PwTestCase {
  title?: string;
  status?: string;
  results?: PwTestResult[];
}

interface PwSuite {
  title?: string;
  file?: string;
  specs?: PwTestCase[];
  suites?: PwSuite[];
}

interface PwReport {
  stats?: {
    expected?: number;
    unexpected?: number;
    skipped?: number;
    duration?: number;
  };
  suites?: PwSuite[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_STACK_CHARS = 2_000;
const MAX_RAW_OUTPUT_BYTES = 8_192;
const TRUNCATION_SUFFIX = '...[truncated]';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Truncates `text` to `maxChars` characters, appending `TRUNCATION_SUFFIX`
 * when truncation actually occurs.
 */
function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - TRUNCATION_SUFFIX.length) + TRUNCATION_SUFFIX;
}

/**
 * Walks the nested `suites` tree from a Playwright JSON report and collects
 * every failing test case as a `TestFailure`.
 */
function extractFailures(suites: PwSuite[] | undefined, fileHint = ''): TestFailure[] {
  if (!suites) return [];
  const failures: TestFailure[] = [];

  for (const suite of suites) {
    const file = suite.file ?? fileHint;

    // Recurse into nested suites first.
    if (suite.suites) {
      failures.push(...extractFailures(suite.suites, file));
    }

    // Walk each test spec in this suite.
    for (const spec of suite.specs ?? []) {
      const failed = spec.results?.some(
        (r) => r.status === 'failed' || r.status === 'timedOut',
      );
      if (!failed) continue;

      const firstFailedResult = spec.results?.find(
        (r) => r.status === 'failed' || r.status === 'timedOut',
      );
      const firstError = firstFailedResult?.errors?.[0];

      failures.push({
        title: spec.title ?? '(unnamed)',
        file,
        message: firstError?.message ?? firstError?.value ?? 'No error message',
        ...(firstError?.stack
          ? { stack: truncate(firstError.stack, MAX_STACK_CHARS) }
          : {}),
      });
    }
  }

  return failures;
}

// ---------------------------------------------------------------------------
// Cypress support
// ---------------------------------------------------------------------------

export type Runner = 'playwright' | 'cypress';

/**
 * Detects whether the project uses Cypress by looking for a Cypress config
 * file in `cwd`. Returns `'cypress'` on first match, `null` if none found.
 */
export async function detectRunner(cwd: string): Promise<Runner | null> {
  const candidates = [
    'cypress.config.js',
    'cypress.config.ts',
    'cypress.config.cjs',
    'cypress.config.mjs',
    'cypress.json',
  ];
  for (const name of candidates) {
    try {
      await fs.access(path.join(cwd, name));
      return 'cypress';
    } catch { /* not found, try next */ }
  }
  return null;
}

interface MochaStats {
  passes?: number;
  failures?: number;
  pending?: number;
  duration?: number;
}

interface MochaTest {
  fullTitle?: string;
  title?: string;
  file?: string;
  err?: { message?: string; stack?: string };
}

interface MochaReport {
  stats?: MochaStats;
  tests?: MochaTest[];
  failures?: MochaTest[];
}

/**
 * Parses a Mocha JSON reporter output into the `PlaywrightResult` shape.
 * On malformed JSON returns a `status: 'error'` result.
 */
export function parseMochaJson(raw: string): PlaywrightResult {
  let report: MochaReport;
  try {
    report = JSON.parse(raw) as MochaReport;
  } catch {
    return {
      status: 'error',
      summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
      failures: [],
      durationMs: 0,
      rawOutput: truncate(raw, MAX_RAW_OUTPUT_BYTES),
    };
  }

  const stats = report.stats ?? {};
  const passed = stats.passes ?? 0;
  const failed = stats.failures ?? 0;
  const skipped = stats.pending ?? 0;
  const total = passed + failed + skipped;
  const durationMs = stats.duration ?? 0;

  const failures: TestFailure[] = (report.failures ?? []).map((t) => ({
    title: t.fullTitle ?? t.title ?? '(unnamed)',
    file: t.file ?? '',
    message: t.err?.message ?? 'No error message',
    ...(t.err?.stack ? { stack: truncate(t.err.stack, MAX_STACK_CHARS) } : {}),
  }));

  return {
    status: failed > 0 ? 'failed' : 'passed',
    summary: { total, passed, failed, skipped },
    failures,
    durationMs,
    rawOutput: '',
  };
}

/**
 * Spawns `npx cypress run --spec <scriptPath> --reporter json --reporter-options output=<tmpFile>`
 * in the given working directory, waits for completion (or timeout), reads the
 * Mocha JSON report, and returns a normalised `PlaywrightResult`.
 */
export async function spawnCypress(
  scriptPath: string,
  cwd: string,
  timeoutMs: number,
  onEvent?: (e: RunEvent) => void,
): Promise<PlaywrightResult> {
  const tmpFile = path.join(os.tmpdir(), `cypress-report-${Date.now()}.json`);

  const cmd = resolveCmd('npx');
  const args = [
    'cypress', 'run',
    '--spec', scriptPath,
    '--reporter', 'json',
    '--reporter-options', `output=${tmpFile}`,
  ];

  const startTime = Date.now();
  const outputChunks: Buffer[] = [];
  let timedOut = false;

  onEvent?.({ type: 'run_started', payload: { specPath: scriptPath } });

  return new Promise<PlaywrightResult>((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      shell: cmd.endsWith('.cmd'),
      env: { ...process.env },
    });

    const collectChunk = (chunk: Buffer) => { outputChunks.push(chunk); };
    child.stdout.on('data', collectChunk);
    child.stderr.on('data', (chunk: Buffer) => {
      process.stderr.write(chunk);
      collectChunk(chunk);
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.on('close', async () => {
      clearTimeout(timer);
      const durationMs = Date.now() - startTime;

      const rawFull = Buffer.concat(outputChunks).toString('utf-8');
      const rawOutput = truncate(rawFull, MAX_RAW_OUTPUT_BYTES);

      if (timedOut) {
        const result: PlaywrightResult = {
          status: 'timeout',
          summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
          failures: [],
          durationMs,
          rawOutput,
        };
        onEvent?.({ type: 'run_completed', payload: result as unknown as Record<string, unknown> });
        resolve(result);
        return;
      }

      let result: PlaywrightResult;
      try {
        const raw = await fs.readFile(tmpFile, 'utf-8');
        result = parseMochaJson(raw);
        result = { ...result, rawOutput, durationMs: result.durationMs || durationMs };
      } catch {
        result = {
          status: 'error',
          summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
          failures: [],
          durationMs,
          rawOutput,
        };
      } finally {
        fs.unlink(tmpFile).catch(() => undefined);
      }

      onEvent?.({ type: 'run_completed', payload: result as unknown as Record<string, unknown> });
      resolve(result);
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      const durationMs = Date.now() - startTime;
      const rawOutput = truncate(
        Buffer.concat(outputChunks).toString('utf-8') + '\n' + err.message,
        MAX_RAW_OUTPUT_BYTES,
      );
      const result: PlaywrightResult = {
        status: 'error',
        summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
        failures: [],
        durationMs,
        rawOutput,
      };
      onEvent?.({ type: 'run_completed', payload: result as unknown as Record<string, unknown> });
      resolve(result);
    });
  });
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Spawns `npx playwright test <scriptPath> [...extraArgs] --reporter=line,json` in
 * the given working directory, waits for completion (or timeout), parses the
 * JSON report from a temp file, and returns a normalised `PlaywrightResult`.
 *
 * @param scriptPath  Absolute, pre-validated path to the Playwright spec file.
 * @param cwd         Working directory for the spawned process (project root).
 * @param timeoutMs   Milliseconds before the child process is SIGKILL-ed.
 * @param extraArgs   Additional CLI args inserted before `--reporter=json`.
 */
export async function spawnPlaywright(
  scriptPath: string,
  cwd: string,
  timeoutMs: number,
  extraArgs: string[] = [],
  onEvent?: (event: RunEvent) => void,
): Promise<PlaywrightResult> {
  // Write report to a temp file to avoid stdout buffer truncation issues.
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qacito-'));
  const reportPath = path.join(tempDir, 'report.json');

  const pm = await detectPackageManager(cwd);
  const colocatedConfig = await findColocatedConfig(scriptPath);
  const preArgs = colocatedConfig ? ['--config', colocatedConfig] : [];
  const [cmd, args] = buildPlaywrightCommand(pm, scriptPath, cwd, preArgs, extraArgs);

  const startTime = Date.now();
  const outputChunks: Buffer[] = [];
  let timedOut = false;

  onEvent?.({ type: 'run_started', payload: { specPath: scriptPath } });

  return new Promise<PlaywrightResult>((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      // On Windows, .cmd batch files cannot be spawned with shell:false — Node throws EINVAL.
      shell: cmd.endsWith('.cmd'),
      env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: reportPath },
    });

    // Collect combined output (both streams merged) for rawOutput field.
    // Also parse stdout line-by-line for real-time WebSocket events.
    let lineBuffer = '';
    const collectChunk = (chunk: Buffer) => {
      outputChunks.push(chunk);
      if (onEvent) {
        lineBuffer += chunk.toString('utf-8');
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() ?? '';
        for (const line of lines) {
          const event = parseLineEvent(line);
          if (event) onEvent(event);
        }
      }
    };
    child.stdout.on('data', collectChunk);
    child.stderr.on('data', (chunk: Buffer) => {
      // Forward stderr of the child to our own stderr for visibility.
      process.stderr.write(chunk);
      collectChunk(chunk);
    });

    // Kill the child after the configured timeout.
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.on('close', async () => {
      clearTimeout(timer);
      const durationMs = Date.now() - startTime;

      // Assemble raw output, truncated to MAX_RAW_OUTPUT_BYTES.
      const rawFull = Buffer.concat(outputChunks).toString('utf-8');
      const rawOutput = truncate(rawFull, MAX_RAW_OUTPUT_BYTES);

      if (timedOut) {
        const result: PlaywrightResult = {
          status: 'timeout',
          summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
          failures: [],
          durationMs,
          rawOutput,
        };
        onEvent?.({ type: 'run_completed', payload: result as unknown as Record<string, unknown> });
        resolve(result);
        return;
      }

      // Parse the JSON report.
      let report: PwReport;
      try {
        const raw = await fs.readFile(reportPath, 'utf-8');
        report = JSON.parse(raw) as PwReport;
      } catch {
        // Report file missing or malformed — surface as an error status.
        const result: PlaywrightResult = {
          status: 'error',
          summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
          failures: [],
          durationMs,
          rawOutput,
        };
        onEvent?.({ type: 'run_completed', payload: result as unknown as Record<string, unknown> });
        resolve(result);
        return;
      } finally {
        // Best-effort cleanup of the temp dir.
        fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
      }

      const stats = report.stats ?? {};
      const total = (stats.expected ?? 0) + (stats.unexpected ?? 0) + (stats.skipped ?? 0);
      const passed = stats.expected ?? 0;
      const failed = stats.unexpected ?? 0;
      const skipped = stats.skipped ?? 0;
      const durationFromReport = stats.duration ?? durationMs;

      const failures = extractFailures(report.suites);

      // Treat 0 tests as an error — it means Playwright found the spec file
      // but no tests inside it, usually because the spec is outside the
      // project's configured testDir and the co-located config is missing.
      if (total === 0) {
        const result: PlaywrightResult = {
          status: 'error',
          summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
          failures: [],
          durationMs: durationFromReport,
          rawOutput: rawOutput +
            '\n[qacito] No tests collected — the spec may be outside the project\'s ' +
            'configured testDir. Ensure a playwright.qacito.config.ts exists alongside ' +
            'the spec (analyze_project generates it automatically).',
        };
        onEvent?.({ type: 'run_completed', payload: result as unknown as Record<string, unknown> });
        resolve(result);
        return;
      }

      const result: PlaywrightResult = {
        status: failed > 0 ? 'failed' : 'passed',
        summary: { total, passed, failed, skipped },
        failures,
        durationMs: durationFromReport,
        rawOutput,
      };
      onEvent?.({ type: 'run_completed', payload: result as unknown as Record<string, unknown> });
      resolve(result);
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      const durationMs = Date.now() - startTime;
      const rawOutput = truncate(
        Buffer.concat(outputChunks).toString('utf-8') + '\n' + err.message,
        MAX_RAW_OUTPUT_BYTES,
      );
      const result: PlaywrightResult = {
        status: 'error',
        summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
        failures: [],
        durationMs,
        rawOutput,
      };
      onEvent?.({ type: 'run_completed', payload: result as unknown as Record<string, unknown> });
      resolve(result);
    });
  });
}
