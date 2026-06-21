import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  generateFromOpenApiHandler,
  SpecNotFoundError,
  PathOutOfBoundsError,
  MissingYamlParserError,
  UnsupportedOpenApiVersionError,
  InvalidOpenApiError,
} from './handler.js';
import { GenerateFromOpenApiInputSchema } from './schema.js';

export function register(server: McpServer): void {
  server.tool(
    'generate_from_openapi',
    'Read an OpenAPI 3.x spec (JSON or YAML) and generate ready-to-run Playwright API test specs — ' +
      'one file per operation, grouped by tag or path. ' +
      'Replaces the detect_stack → read_files → get_api_template × N loop for API-first projects. ' +
      'YAML support requires js-yaml (npm install js-yaml). JSON works without extra deps.',
    GenerateFromOpenApiInputSchema.shape,
    async (rawInput) => {
      const root = rawInput.projectPath ?? process.cwd();

      const parseResult = GenerateFromOpenApiInputSchema.safeParse(rawInput);
      if (!parseResult.success) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'InvalidInput', detail: parseResult.error.message }) }],
          isError: true,
        };
      }

      process.stderr.write(`[generate_from_openapi] specPath="${parseResult.data.specPath}" outputDir="${parseResult.data.outputDir}"\n`);

      try {
        const output = await generateFromOpenApiHandler(root, parseResult.data);
        return { content: [{ type: 'text' as const, text: JSON.stringify(output) }] };
      } catch (err: unknown) {
        for (const [Cls, code] of [
          [PathOutOfBoundsError,            'PathOutOfBounds'],
          [SpecNotFoundError,               'SpecNotFound'],
          [UnsupportedOpenApiVersionError,  'UnsupportedOpenApiVersion'],
          [InvalidOpenApiError,             'InvalidOpenApi'],
          [MissingYamlParserError,          'MissingYamlParser'],
        ] as const) {
          if (err instanceof Cls) {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({ error: code, detail: (err as Error).message }) }],
              isError: true,
            };
          }
        }
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'GenerateFromOpenApiError', detail: msg }) }],
          isError: true,
        };
      }
    },
  );
}
