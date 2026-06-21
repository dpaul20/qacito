import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { readFilesHandler } from './handler.js';
import { ReadFilesInputSchema } from './schema.js';

/**
 * Registers the `read_files` MCP tool into the server.
 *
 * Tool contract:
 *   Input:  { paths: string[], projectRoot?: string }
 *   Output: { files: [{path, content?, error?}] }
 *
 * Per-file errors (PathOutOfBounds, FileNotFound) do NOT raise an MCP-level
 * error; they appear as `error` strings inside the corresponding file entry.
 * This lets the caller process partial results without retrying the whole batch.
 *
 * @param server  The MCP Server instance provided by register-tools.ts.
 */
export function register(server: McpServer): void {
  server.tool(
    'read_files',
    'Read one or more files from the target project. Pass projectRoot to ' +
      'specify which project to read from (falls back to process.cwd()). ' +
      'Each path is validated against the resolved root. Returns an array of ' +
      '{path, content} objects; unreadable files include an `error` field ' +
      'instead of `content` and do not abort the rest of the batch.',
    ReadFilesInputSchema.shape,
    async (rawInput) => {
      const parseResult = ReadFilesInputSchema.safeParse(rawInput);
      if (!parseResult.success) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'InvalidInput', detail: parseResult.error.message }) }],
          isError: true,
        };
      }
      const { paths, projectRoot } = parseResult.data;
      const root = projectRoot ?? process.cwd();

      process.stderr.write(
        `[read_files] root="${root}" reading ${paths.length} path(s)\n`,
      );

      try {
        const output = await readFilesHandler(root, { paths });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output) }],
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'ReadFilesError', detail: msg }) }],
          isError: true,
        };
      }
    },
  );
}
