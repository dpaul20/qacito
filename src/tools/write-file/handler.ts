import fs from 'node:fs/promises';
import path from 'node:path';
import { PathOutOfBoundsError, resolveSafe } from '../../shared/sandbox.js';
import type { WriteFileInput } from './schema.js';

/**
 * Shape of the `write_file` tool response.
 */
export interface WriteFileOutput {
  path: string;
  bytesWritten: number;
}

/**
 * Writes `content` to `input.path` within the sandbox root.
 *
 * Behaviour:
 * - Resolves the destination via `resolveSafe` — throws `PathOutOfBoundsError`
 *   when the path escapes the sandbox (the caller converts this to an MCP error).
 * - Creates any missing parent directories with `{ recursive: true }`.
 * - Writes the file with UTF-8 encoding.
 * - Returns the absolute path and the number of bytes written.
 *
 * @param root   Absolute sandbox root (the project directory).
 * @param input  Validated input from the Zod schema.
 * @throws       `PathOutOfBoundsError` when the destination escapes the sandbox.
 */
export async function writeFileHandler(
  root: string,
  input: WriteFileInput,
): Promise<WriteFileOutput> {
  // 1. Sandbox check — before any I/O.
  const resolvedPath = resolveSafe(root, input.path);

  // 2. Ensure parent directory exists.
  const dir = path.dirname(resolvedPath);
  await fs.mkdir(dir, { recursive: true });

  // 3. Write the file.
  const encoder = new TextEncoder();
  const bytesWritten = encoder.encode(input.content).length;
  await fs.writeFile(resolvedPath, input.content, 'utf-8');

  return { path: resolvedPath, bytesWritten };
}
