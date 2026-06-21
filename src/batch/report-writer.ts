/**
 * ReportWriter
 *
 * Generates the final `qacito-report.json` from a BatchRunResult.
 *
 * Report shape (spec-mandated):
 * {
 *   specs_generated: number,
 *   tests_total:     number,
 *   tests_passed:    number,
 *   tests_failed:    number,
 *   duration_ms:     number,
 *   timestamp:       string   // ISO 8601
 * }
 *
 * The writer also includes a `specs` array with per-spec details for
 * debugging, but the top-level fields above are the CI-visible contract.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { BatchRunResult } from './orchestrator.js';

// ---------------------------------------------------------------------------
// Public shape (spec contract)
// ---------------------------------------------------------------------------

/**
 * The JSON object written to disk.
 * Satisfies the spec requirement:
 *   { specs_generated, tests_total, tests_passed, tests_failed, duration_ms, timestamp }
 */
export interface QacitoReport {
  specs_generated: number;
  tests_total:     number;
  tests_passed:    number;
  tests_failed:    number;
  duration_ms:     number;
  timestamp:       string;
  /** Per-spec breakdown (non-spec field, included for debugging). */
  specs: Array<{
    path:   string;
    status: string;
    total:  number;
    passed: number;
    failed: number;
  }>;
}

// ---------------------------------------------------------------------------
// ReportWriter
// ---------------------------------------------------------------------------

export class ReportWriter {
  /**
   * Writes the batch run result as a JSON file.
   *
   * - Creates parent directories if they don't exist.
   * - Formats JSON with 2-space indentation for readability.
   * - Logs progress to stderr.
   *
   * @param result      BatchRunResult from the orchestrator.
   * @param outputPath  Destination file path (default: qacito-report.json in cwd).
   */
  async write(result: BatchRunResult, outputPath: string): Promise<void> {
    const report: QacitoReport = {
      specs_generated: result.specs_generated,
      tests_total:     result.tests_total,
      tests_passed:    result.tests_passed,
      tests_failed:    result.tests_failed,
      duration_ms:     result.duration_ms,
      timestamp:       result.timestamp,
      specs:           result.specs.map((s) => ({
        path:   s.path,
        status: s.status,
        total:  s.total,
        passed: s.passed,
        failed: s.failed,
      })),
    };

    const resolved = path.resolve(outputPath);
    const dir      = path.dirname(resolved);

    // Ensure parent directory exists.
    await fs.mkdir(dir, { recursive: true });

    const json = JSON.stringify(report, null, 2);
    await fs.writeFile(resolved, json, 'utf-8');

    process.stderr.write(`[report-writer] Report written: ${resolved}\n`);
  }
}

/**
 * Reads and parses an existing report file.
 * Returns null if the file does not exist.
 *
 * Useful in tests and for inspection tooling.
 */
export async function readReport(reportPath: string): Promise<QacitoReport | null> {
  try {
    const raw = await fs.readFile(path.resolve(reportPath), 'utf-8');
    return JSON.parse(raw) as QacitoReport;
  } catch (err: unknown) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === 'ENOENT') return null;
    throw err;
  }
}
