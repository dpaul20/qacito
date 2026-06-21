import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { generateReportHandler } from './handler.js';
import { GenerateReportInputSchema } from './schema.js';

export function register(server: McpServer): void {
  server.tool(
    'generate_report',
    'Generates a human-readable test report (.md + .html) for a completed run. ' +
      'The HTML report includes a summary table, per-test results with error details, ' +
      'and a key findings section with root cause analysis. ' +
      'Provide the runId returned by run_tests and the directory where the report should be written.',
    GenerateReportInputSchema.shape,
    async (rawInput) => {
      const parseResult = GenerateReportInputSchema.safeParse(rawInput);
      if (!parseResult.success) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'InvalidInput', detail: parseResult.error.message }) }],
          isError: true,
        };
      }

      try {
        const output = await generateReportHandler(parseResult.data);
        return { content: [{ type: 'text' as const, text: JSON.stringify(output) }] };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'GenerateReportError', detail: msg }) }],
          isError: true,
        };
      }
    },
  );
}
