import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function register(server: McpServer): void {
  server.prompt(
    'qa:fix-failures',
    'Read a failing test run and propose concrete fixes for each failure.',
    { runId: z.string().optional().describe('Run ID to inspect. If omitted, the latest failed run is used.') },
    async ({ runId }) => ({
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: runId
            ? `Investigate and fix failures in run: ${runId}

Steps:
1. Read the MCP resource runs://${runId} to get the full run detail including test results and error messages.
2. For each failed test, read the spec file using read_files to understand the current implementation.
3. Propose a concrete fix for each failure with an explanation of the root cause.
4. Apply fixes using write_file and re-run the spec with run_tests to verify.`
            : `Investigate and fix the most recent test failures.

Steps:
1. Read the MCP resource runs://history to get recent runs.
2. Select the most recent run with status "fail" or "error".
3. Read runs://<that-run-id> to get the full detail including test results and error messages.
4. For each failed test, read the spec file using read_files to understand the current implementation.
5. Propose and apply concrete fixes using write_file, then re-run with run_tests to verify.`,
        },
      }],
    }),
  );
}
