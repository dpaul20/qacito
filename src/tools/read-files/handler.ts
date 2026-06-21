import fs from 'node:fs/promises';
import { PathOutOfBoundsError, resolveSafe } from '../../shared/sandbox.js';
import type { ReadFilesInput } from './schema.js';

/**
 * Shape of a single file result returned by the handler.
 * `error` is present only when the file could not be read.
 */
export interface FileResult {
  path: string;
  content?: string;
  error?: string;
}

/**
 * Shape of the full tool response.
 */
export interface ReadFilesOutput {
  files: FileResult[];
}

/**
 * Reads each requested path within the sandbox root.
 *
 * Per-file errors (PathOutOfBounds, FileNotFound) are recorded in the result
 * object without aborting the rest of the batch — the overall MCP response
 * always succeeds (the error is conveyed in the per-entry `error` field).
 *
 * @param root   Absolute sandbox root (the project directory).
 * @param input  Validated input from the Zod schema.
 */
export async function readFilesHandler(
  root: string,
  input: ReadFilesInput,
): Promise<ReadFilesOutput> {
  const results = await Promise.all(
    input.paths.map(async (p): Promise<FileResult> => {
      // 1. Sandbox check — must happen before any I/O.
      let resolvedPath: string;
      try {
        resolvedPath = resolveSafe(root, p);
      } catch (err) {
        if (err instanceof PathOutOfBoundsError) {
          return { path: p, error: 'PathOutOfBounds' };
        }
        return { path: p, error: `Unexpected sandbox error: ${String(err)}` };
      }

      // 2. Read the file.
      try {
        const content = await fs.readFile(resolvedPath, 'utf-8');
        return { path: p, content };
      } catch (err: unknown) {
        const nodeErr = err as NodeJS.ErrnoException;
        if (nodeErr.code === 'ENOENT') {
          return { path: p, error: 'FileNotFound' };
        }
        // Other OS errors (EACCES, EISDIR, etc.) — surface the code.
        return {
          path: p,
          error: `ReadError:${nodeErr.code ?? 'UNKNOWN'}: ${nodeErr.message}`,
        };
      }
    }),
  );

  return { files: results };
}
