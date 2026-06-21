/**
 * Batch mode CLI entry point.
 *
 * Usage:
 *   node dist/batch/index.js --project <path> [--output <reportPath>] [--max-retries <n>] [--max-iterations <n>]
 *
 * Environment:
 *   ANTHROPIC_API_KEY  — required; throws MissingApiKey if absent.
 *
 * Exit codes:
 *   0 — all tests passed (or no tests ran)
 *   1 — one or more test failures, configuration error, or project not found
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { BatchOrchestrator } from './orchestrator.js';
import { ReportWriter } from './report-writer.js';

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class MissingApiKeyError extends Error {
  readonly code = 'MissingApiKey';
  constructor() {
    super(
      'ANTHROPIC_API_KEY environment variable is not set.\n' +
        'Set it before running the batch runner:\n' +
        '  export ANTHROPIC_API_KEY=sk-ant-...',
    );
    this.name = 'MissingApiKeyError';
  }
}

export class ProjectNotFoundError extends Error {
  readonly code = 'ProjectNotFound';
  constructor(projectPath: string) {
    super(
      `Project directory not found or not accessible: "${projectPath}".\n` +
        'Ensure the path exists and is readable before running the batch runner.',
    );
    this.name = 'ProjectNotFoundError';
  }
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

interface CliArgs {
  project: string;
  output: string;
  maxRetries: number;
  maxIterations: number;
}

function parseCliArgs(): CliArgs {
  const { values } = parseArgs({
    options: {
      project: { type: 'string', short: 'p' },
      output:  { type: 'string', short: 'o', default: 'qacito-report.json' },
      'max-retries': { type: 'string', default: '3' },
      'max-iterations': { type: 'string', default: '20' },
    },
    strict: true,
  });

  if (!values['project']) {
    process.stderr.write(
      '[batch/cli] Error: --project <path> is required.\n' +
        'Usage: node dist/batch/index.js --project <path> [--output <report>] [--max-retries <n>]\n',
    );
    process.exit(1);
  }

  return {
    project:       values['project'],
    output:        values['output'] as string,
    maxRetries:    parseInt(values['max-retries'] as string, 10) || 3,
    maxIterations: parseInt(values['max-iterations'] as string, 10) || 20,
  };
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

/**
 * Validates ANTHROPIC_API_KEY is present in the environment.
 * Terminates with code 1 + MissingApiKey message if absent.
 */
function assertApiKey(): string {
  const key = process.env['ANTHROPIC_API_KEY'];
  if (!key || key.trim() === '') {
    throw new MissingApiKeyError();
  }
  return key;
}

/**
 * Validates the project path is accessible.
 * Throws ProjectNotFoundError if the directory does not exist or is not readable.
 */
async function assertProjectExists(projectPath: string): Promise<string> {
  const resolved = path.resolve(projectPath);
  try {
    const stat = await fs.stat(resolved);
    if (!stat.isDirectory()) {
      throw new ProjectNotFoundError(projectPath);
    }
  } catch (err: unknown) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === 'ENOENT' || nodeErr.code === 'EACCES') {
      throw new ProjectNotFoundError(projectPath);
    }
    throw err;
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseCliArgs();

  // 1. Guard: API key must exist before ANY external calls.
  let apiKey: string;
  try {
    apiKey = assertApiKey();
  } catch (err) {
    if (err instanceof MissingApiKeyError) {
      process.stderr.write(`[batch/cli] ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }

  // 2. Guard: project must be accessible — no API calls until this passes.
  let resolvedProject: string;
  try {
    resolvedProject = await assertProjectExists(args.project);
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      process.stderr.write(`[batch/cli] ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }

  process.stderr.write(
    `[batch/cli] Starting batch run\n` +
      `  project:        ${resolvedProject}\n` +
      `  output:         ${args.output}\n` +
      `  max-retries:    ${args.maxRetries}\n` +
      `  max-iterations: ${args.maxIterations}\n`,
  );

  // 3. Run the orchestrator.
  const orchestrator = new BatchOrchestrator({
    apiKey,
    projectPath: resolvedProject,
    maxRetries:  args.maxRetries,
    maxIterations: args.maxIterations,
  });

  const result = await orchestrator.run();

  // 4. Write the report.
  const writer = new ReportWriter();
  await writer.write(result, args.output);

  process.stderr.write(
    `[batch/cli] Report written to ${args.output}\n` +
      `  specs generated:  ${result.specs_generated}\n` +
      `  tests total:      ${result.tests_total}\n` +
      `  tests passed:     ${result.tests_passed}\n` +
      `  tests failed:     ${result.tests_failed}\n` +
      `  duration:         ${result.duration_ms}ms\n`,
  );

  // 5. Exit with code 0 (all passed) or 1 (failures).
  const exitCode = result.tests_failed > 0 ? 1 : 0;
  process.exit(exitCode);
}

main().catch((err: unknown) => {
  process.stderr.write(
    `[batch/cli] Fatal error: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
