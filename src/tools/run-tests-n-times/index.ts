import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { runTestsNTimesHandler, SpecNotFoundError, PathOutOfBoundsError } from './handler.js';
import { RunTestsNTimesInputSchema } from './schema.js';

export function register(server: McpServer): void {
  server.tool(
    'run_tests_n_times',
    'Run a Playwright spec N times sequentially (2–10) and return a flakiness report. ' +
      'flakinessScore: 0.0 = always passes (stable), 1.0 = always fails (broken), ' +
      '0 < score < 1 = flaky (intermittent). ' +
      'Use this when run_tests returns inconsistent results, or before marking a test as fixed. ' +
      'Runs are sequential to avoid port/resource conflicts between Playwright workers.',
    RunTestsNTimesInputSchema.shape,
    async (rawInput) => {
      const root = rawInput.projectRoot ?? process.cwd();

      const parseResult = RunTestsNTimesInputSchema.safeParse(rawInput);
      if (!parseResult.success) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'InvalidInput', detail: parseResult.error.message }) }],
          isError: true,
        };
      }

      process.stderr.write(
        `[run_tests_n_times] root="${root}" scriptPath="${parseResult.data.scriptPath}" n=${parseResult.data.n}\n`,
      );

      try {
        const output = await runTestsNTimesHandler(root, parseResult.data);
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
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'RunTestsNTimesError', detail: msg }) }],
          isError: true,
        };
      }
    },
  );
}
