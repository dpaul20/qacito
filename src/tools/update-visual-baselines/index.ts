import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { updateVisualBaselinesHandler, SpecNotFoundError, PathOutOfBoundsError } from './handler.js';
import { UpdateVisualBaselinesInputSchema } from './schema.js';

/**
 * Registers the `update_visual_baselines` MCP tool into the server.
 *
 * Tool contract:
 *   Input:  { scriptPath: string; timeoutMs?: number; projectRoot?: string }
 *   Output: { status, snapshotsBefore, snapshotsAfter, snapshotsAdded,
 *             durationMs, logs }
 *
 * Error cases (surfaced as `isError: true`):
 *   - `SpecNotFound`      — the spec file does not exist on disk.
 *   - `PathOutOfBounds`   — scriptPath escapes the sandbox root.
 *
 * @param server  The MCP Server instance provided by register-tools.ts.
 */
export function register(server: McpServer): void {
  server.tool(
    'update_visual_baselines',
    '⚠️ Destructive. Runs a Playwright spec with --update-snapshots to regenerate visual regression baselines. Overwrites existing baselines without confirmation. Returns snapshot counts before/after. Use update_visual_baselines only after intentional UI changes.',
    UpdateVisualBaselinesInputSchema.shape,
    async (rawInput) => {
      const sandboxRoot = rawInput.projectRoot ?? process.cwd();

      // Parse and apply defaults via Zod before passing to the handler.
      const parseResult = UpdateVisualBaselinesInputSchema.safeParse(rawInput);
      if (!parseResult.success) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'InvalidInput',
                detail: parseResult.error.message,
              }),
            },
          ],
          isError: true,
        };
      }

      const input = parseResult.data;

      process.stderr.write(
        `[update_visual_baselines] root="${sandboxRoot}" scriptPath="${input.scriptPath}" ` +
          `timeoutMs=${input.timeoutMs}\n`,
      );

      try {
        const output = await updateVisualBaselinesHandler(sandboxRoot, input);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(output),
            },
          ],
        };
      } catch (err: unknown) {
        if (err instanceof SpecNotFoundError || err instanceof PathOutOfBoundsError) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: (err as SpecNotFoundError | PathOutOfBoundsError).code,
                  detail: err.message,
                }),
              },
            ],
            isError: true,
          };
        }

        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: 'UpdateBaselinesError', detail: msg }),
            },
          ],
          isError: true,
        };
      }
    },
  );
}
