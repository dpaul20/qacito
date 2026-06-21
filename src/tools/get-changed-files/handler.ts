import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { resolveSafe } from '../../shared/sandbox.js';
import type { GetChangedFilesInput } from './schema.js';

const _promisifiedExecFile = promisify(execFile);

// Wrapper that guarantees the rejection always carries a `stderr` string,
// even on platforms where promisify(execFile) omits it from the Error object.
function execFileAsync(
  cmd: string,
  args: string[],
  opts: { cwd: string },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, opts, (error, stdout, stderr) => {
      if (error) {
        const enriched = error as Error & { stdout: string; stderr: string };
        enriched.stdout = stdout;
        enriched.stderr = stderr;
        reject(enriched);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Output type
// ---------------------------------------------------------------------------

export interface GetChangedFilesOutput {
  base: string;
  changedFiles: string[];
  totalChanged: number;
}

// ---------------------------------------------------------------------------
// Custom errors
// ---------------------------------------------------------------------------

export class GitNotFoundError extends Error {
  readonly code = 'GitNotFound' as const;
  constructor() {
    super('git binary not found. Install git and ensure it is on your PATH.');
    this.name = 'GitNotFoundError';
  }
}

export class NoGitRepoError extends Error {
  readonly code = 'NoGitRepo' as const;
  constructor(p: string) {
    super(`"${p}" is not inside a git repository.`);
    this.name = 'NoGitRepoError';
  }
}

// ---------------------------------------------------------------------------
// Internal type for the injected execFile function
// ---------------------------------------------------------------------------

type ExecFileFn = (
  cmd: string,
  args: string[],
  opts: { cwd: string },
) => Promise<{ stdout: string; stderr: string }>;

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Returns git-changed file paths for a project directory.
 *
 * @param input        Validated input (projectPath, staged, base, filter).
 * @param execFileFn   Optional injected exec function for testability.
 */
export async function getChangedFilesHandler(
  input: GetChangedFilesInput,
  execFileFn: ExecFileFn = execFileAsync,
): Promise<GetChangedFilesOutput> {
  const resolvedPath = path.resolve(input.projectPath);
  resolveSafe(resolvedPath, resolvedPath);

  let gitArgs: string[];
  let effectiveBase: string;

  if (input.staged) {
    gitArgs = ['diff', '--name-only', '--cached'];
    effectiveBase = '--cached';
  } else {
    gitArgs = ['diff', '--name-only', input.base];
    effectiveBase = input.base;
  }

  let stdout: string;
  try {
    const result = await execFileFn('git', gitArgs, { cwd: resolvedPath });
    stdout = result.stdout;
  } catch (err: unknown) {
    const nodeErr = err as NodeJS.ErrnoException & { stderr?: string };
    if (nodeErr.code === 'ENOENT') throw new GitNotFoundError();
    const errText = (nodeErr.stderr ?? '') + ' ' + (nodeErr.message ?? '');
    if (errText.toLowerCase().includes('not a git repository')) throw new NoGitRepoError(resolvedPath);
    throw err;
  }

  let changedFiles = stdout.trim().split('\n').filter(Boolean);

  if (input.filter && input.filter.length > 0) {
    changedFiles = changedFiles.filter((f) =>
      input.filter!.some((pattern) => f.includes(pattern)),
    );
  }

  return { base: effectiveBase, changedFiles, totalChanged: changedFiles.length };
}
