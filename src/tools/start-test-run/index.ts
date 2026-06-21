import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { startTestRunHandler, SpecNotFoundError, PathOutOfBoundsError } from './handler.js';
import { StartTestRunInputSchema } from './schema.js';

export function register(server: McpServer): void {
  server.tool(
    'start_test_run',
    'Fire a Playwright spec asynchronously and return a runId immediately — does NOT block. ' +
      'Use get_run_status(runId) to poll for completion. ' +
      'Designed for parallel subagent workflows: multiple agents can each call start_test_run ' +
      'for different specs and poll concurrently without blocking each other. ' +
      'Retry logic is the orchestrator\'s responsibility: if the run fails, rewrite the spec ' +
      'via write_file and call start_test_run again with the same path.',
    StartTestRunInputSchema.shape,
    async (rawInput) => {
      const root = rawInput.projectRoot ?? process.cwd();

      const parseResult = StartTestRunInputSchema.safeParse(rawInput);
      if (!parseResult.success) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'InvalidInput', detail: parseResult.error.message }) }],
          isError: true,
        };
      }

      process.stderr.write(`[start_test_run] root="${root}" scriptPath="${parseResult.data.scriptPath}"\n`);

      try {
        const output = await startTestRunHandler(root, parseResult.data);
        return { content: [{ type: 'text' as const, text: JSON.stringify(output) }] };
      } catch (err: unknown) {
        if (err instanceof SpecNotFoundError || err instanceof PathOutOfBoundsError) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: (err as SpecNotFoundError | PathOutOfBoundsError).code, detail: err.message }) }],
            isError: true,
          };
        }
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'StartTestRunError', detail: msg }) }],
          isError: true,
        };
      }
    },
  );
}
