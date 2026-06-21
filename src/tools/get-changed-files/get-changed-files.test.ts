import { test, expect } from '@playwright/test';
import { getChangedFilesHandler, GitNotFoundError, NoGitRepoError } from './handler.js';
import { GetChangedFilesInputSchema } from './schema.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds a minimal mock execFileFn that resolves with the given stdout. */
function makeExecFn(stdout: string) {
  return async (_cmd: string, _args: string[], _opts: { cwd: string }) => ({
    stdout,
    stderr: '',
  });
}

/** Builds a mock execFileFn that throws the given error. */
function makeThrowingExecFn(err: unknown) {
  return async (_cmd: string, _args: string[], _opts: { cwd: string }): Promise<{ stdout: string; stderr: string }> => {
    throw err;
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('get-changed-files handler', () => {
  // DT-1: normal diff returns 2 files, base defaults to HEAD
  test('DT-1: returns changed files with base=HEAD by default', async () => {
    const execFn = makeExecFn('src/foo.ts\nsrc/bar.ts\n');
    const result = await getChangedFilesHandler(
      { projectPath: process.cwd(), staged: false, base: 'HEAD', filter: undefined },
      execFn,
    );
    expect(result.changedFiles).toHaveLength(2);
    expect(result.changedFiles).toContain('src/foo.ts');
    expect(result.changedFiles).toContain('src/bar.ts');
    expect(result.base).toBe('HEAD');
    expect(result.totalChanged).toBe(2);
  });

  // DT-2: staged flag uses --cached and sets base accordingly
  test('DT-2: staged=true passes --cached and sets base to --cached', async () => {
    let capturedArgs: string[] = [];
    const execFn = async (_cmd: string, args: string[], _opts: { cwd: string }) => {
      capturedArgs = args;
      return { stdout: 'src/staged.ts\n', stderr: '' };
    };
    const result = await getChangedFilesHandler(
      { projectPath: process.cwd(), staged: true, base: 'HEAD', filter: undefined },
      execFn,
    );
    expect(capturedArgs).toContain('--cached');
    expect(result.base).toBe('--cached');
  });

  // DT-3: filter by .ts extension returns only 3 of 5 files
  test('DT-3: filter reduces results to matching files only', async () => {
    const execFn = makeExecFn(
      'src/a.ts\nsrc/b.ts\nsrc/c.ts\ndocs/guide.md\nREADME.md\n',
    );
    const result = await getChangedFilesHandler(
      { projectPath: process.cwd(), staged: false, base: 'HEAD', filter: ['.ts'] },
      execFn,
    );
    expect(result.changedFiles).toHaveLength(3);
    expect(result.changedFiles.every((f) => f.endsWith('.ts'))).toBe(true);
    expect(result.totalChanged).toBe(3);
  });

  // DT-4: custom base ref is forwarded
  test('DT-4: custom base ref is reflected in output', async () => {
    const execFn = makeExecFn('src/feature.ts\n');
    const result = await getChangedFilesHandler(
      { projectPath: process.cwd(), staged: false, base: 'main', filter: undefined },
      execFn,
    );
    expect(result.base).toBe('main');
  });

  // DT-5: empty stdout returns zero files
  test('DT-5: empty git output returns empty changedFiles', async () => {
    const execFn = makeExecFn('');
    const result = await getChangedFilesHandler(
      { projectPath: process.cwd(), staged: false, base: 'HEAD', filter: undefined },
      execFn,
    );
    expect(result.changedFiles).toHaveLength(0);
    expect(result.totalChanged).toBe(0);
  });

  // DT-6: ENOENT from execFile → GitNotFoundError
  test('DT-6: ENOENT throws GitNotFoundError', async () => {
    const error = Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' });
    const execFn = makeThrowingExecFn(error);
    await expect(
      getChangedFilesHandler(
        { projectPath: process.cwd(), staged: false, base: 'HEAD', filter: undefined },
        execFn,
      ),
    ).rejects.toThrow(GitNotFoundError);
  });

  // DT-7: stderr with "not a git repository" → NoGitRepoError
  test('DT-7: not-a-git-repository error throws NoGitRepoError', async () => {
    const error = Object.assign(
      new Error('fatal: not a git repository'),
      { stderr: 'fatal: not a git repository' },
    );
    const execFn = makeThrowingExecFn(error);
    await expect(
      getChangedFilesHandler(
        { projectPath: process.cwd(), staged: false, base: 'HEAD', filter: undefined },
        execFn,
      ),
    ).rejects.toThrow(NoGitRepoError);
  });

  // DT-8: traversal base like ../../etc fails schema validation
  test('DT-8: traversal base fails schema validation', () => {
    const parseResult = GetChangedFilesInputSchema.safeParse({
      projectPath: '/some/project',
      base: '../../etc',
    });
    expect(parseResult.success).toBe(false);
  });
});
