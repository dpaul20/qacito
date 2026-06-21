import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { detectStackHandler, MissingPackageJsonError } from './handler.js';
import { DetectStackInputSchema } from './schema.js';

/**
 * Registers the `detect_stack` MCP tool into the server.
 *
 * Tool contract:
 *   Input:  { projectPath: string }
 *   Output: { framework, version, routes, packageManager, testScript,
 *             hasTypeScript, entryPoint, openApiFile }
 *
 * Error cases:
 *   - `MissingPackageJson` — no package.json found at projectPath.
 *   - `PathOutOfBounds`    — an internal path escapes the project root.
 *
 * Both cases surface as `isError: true` MCP responses so Claude Desktop
 * receives a structured failure it can reason about and recover from.
 *
 * @param server  The MCP Server instance provided by register-tools.ts.
 */
export function register(server: McpServer): void {
  server.tool(
    'detect_stack',
    'Analyse a Node.js project to detect its framework (Next.js, Express, ' +
      'Fastify, NestJS), package manager, REST routes, TypeScript config, ' +
      'test script, and OpenAPI spec file. Pass the absolute path to the ' +
      'project root as projectPath. Requires a valid package.json.',
    DetectStackInputSchema.shape,
    async (rawInput) => {
      const parseResult = DetectStackInputSchema.safeParse(rawInput);
      if (!parseResult.success) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'InvalidInput', detail: parseResult.error.message }) }],
          isError: true,
        };
      }
      const { projectPath } = parseResult.data;
      // projectPath IS the project — use it directly as the sandbox boundary.
      const root = path.resolve(projectPath);

      process.stderr.write(
        `[detect_stack] root="${root}" analysing "${projectPath}"\n`,
      );

      try {
        const output = await detectStackHandler(root, { projectPath });

        process.stderr.write(
          `[detect_stack] detected framework="${output.framework}" ` +
            `routes=${output.routes.length} pm="${output.packageManager}"\n`,
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(output),
            },
          ],
        };
      } catch (err: unknown) {
        if (err instanceof MissingPackageJsonError) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: err.code,
                  detail: err.message,
                }),
              },
            ],
            isError: true,
          };
        }

        // PathOutOfBoundsError bubbles up here too.
        if (err instanceof Error && 'code' in err) {
          const e = err as Error & { code: string };
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({ error: e.code, detail: e.message }),
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
              text: JSON.stringify({ error: 'DetectStackError', detail: msg }),
            },
          ],
          isError: true,
        };
      }
    },
  );
}
