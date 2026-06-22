import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import path from 'node:path';
import { analyzeProjectHandler } from './handler.js';
import { AnalyzeProjectInputSchema } from './schema.js';

export function register(server: McpServer): void {
  server.tool(
    'analyze_project',
    'Analyzes a project\'s codebase (routes, components, package.json) to generate a structured ' +
      'test plan with numbered test cases (TC001–TCN). Writes Playwright spec files to ' +
      '<projectRoot>/qacito_tests/ and returns a dashboard URL to browse the plan. ' +
      'Supports Next.js App Router, Pages Router, and generic Node.js projects. ' +
      'Pass baseUrl to override the inferred dev server URL (e.g. when Storybook or another ' +
      'tool is also present in package.json scripts and its port would otherwise be picked up).',
    AnalyzeProjectInputSchema.shape,
    async (rawInput) => {
      const parseResult = AnalyzeProjectInputSchema.safeParse(rawInput);
      if (!parseResult.success) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'InvalidInput', detail: parseResult.error.message }) }],
          isError: true,
        };
      }

      try {
        const sandboxRoot = path.resolve(parseResult.data.projectRoot);
        const output = await analyzeProjectHandler(sandboxRoot, parseResult.data);
        return { content: [{ type: 'text' as const, text: JSON.stringify(output) }] };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'AnalyzeProjectError', detail: msg }) }],
          isError: true,
        };
      }
    },
  );
}
