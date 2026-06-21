import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DualEvaluateInputSchema } from './schema.js';
import { dualEvaluateHandler } from './handler.js';

export function register(server: McpServer): void {
  server.tool(
    'dual_evaluate',
    'Generates a dual-agent QA evaluation plan. Returns structured instructions for running ' +
      'two independent evaluations — Agent A (constructive) and Agent B (adversarial) — using ' +
      'QAcito tools, then reconciling their verdicts. Follow the returned plan to execute the ' +
      'evaluation. Provide `task` as the QA question and optionally `context` as the project root.',
    DualEvaluateInputSchema.shape,
    async (rawInput) => {
      const parseResult = DualEvaluateInputSchema.safeParse(rawInput);
      if (!parseResult.success) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'InvalidInput', detail: parseResult.error.message }) }],
          isError: true,
        };
      }

      const output = await dualEvaluateHandler(parseResult.data);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output) }],
      };
    },
  );
}
