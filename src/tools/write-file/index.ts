import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ZodError } from 'zod';
import { PathOutOfBoundsError } from '../../shared/sandbox.js';
import { writeFileHandler } from './handler.js';
import { WriteFileInputSchema } from './schema.js';

/**
 * Registers the `write_file` MCP tool into the server.
 *
 * Tool contract:
 *   Input:  { path: string, content: string, projectRoot?: string }
 *   Output: { path: string, bytesWritten: number }
 *
 * Error cases:
 *   - `PathOutOfBounds`  — destination escapes the sandbox root
 *   - `EmptyContent`     — content is empty or only whitespace
 *
 * Both error cases raise an MCP-level `isError: true` response so Claude
 * Desktop receives a structured failure it can reason about.
 *
 * @param server  The MCP Server instance provided by register-tools.ts.
 */
export function register(server: McpServer): void {
  server.tool(
    'write_file',
    'Write content to a file in the target project. Pass projectRoot to ' +
      'specify which project to write to (falls back to process.cwd()). ' +
      'Missing parent directories are created automatically. Returns ' +
      '{path, bytesWritten} on success. Raises PathOutOfBounds or EmptyContent on failure.',
    WriteFileInputSchema.shape,
    async ({ path: filePath, content, projectRoot }) => {
      const root = projectRoot ?? process.cwd();

      // Re-validate through Zod to surface EmptyContent clearly.
      const parsed = WriteFileInputSchema.safeParse({ path: filePath, content, projectRoot });
      if (!parsed.success) {
        const issue = parsed.error.errors[0];
        const code =
          issue?.message === 'EmptyContent' ? 'EmptyContent' : 'ValidationError';
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: code }) }],
          isError: true,
        };
      }

      process.stderr.write(
        `[write_file] root="${root}" dest="${filePath}"\n`,
      );

      try {
        const output = await writeFileHandler(root, parsed.data);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(output),
            },
          ],
        };
      } catch (err: unknown) {
        if (err instanceof PathOutOfBoundsError) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({ error: 'PathOutOfBounds', detail: err.message }),
              },
            ],
            isError: true,
          };
        }
        if (err instanceof ZodError) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({ error: 'ValidationError', detail: err.message }),
              },
            ],
            isError: true,
          };
        }
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'WriteError', detail: msg }) }],
          isError: true,
        };
      }
    },
  );
}
