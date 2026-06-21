import { z } from 'zod';

export const GenerateFromOpenApiInputSchema = z.object({
  projectPath: z.string().min(1, 'projectPath must not be empty').describe('Absolute path to the project root (sandbox boundary).'),
  specPath:    z.string().min(1, 'specPath must not be empty').describe('Path to the OpenAPI 3.x spec file (JSON or YAML), relative to projectPath.'),
  outputDir:   z.string().min(1, 'outputDir must not be empty').describe('Directory where generated spec files are written, relative to projectPath.'),
  baseUrl:     z.string().url().optional().describe('Base URL injected into generated tests. Defaults to servers[0].url from the spec.'),
  groupBy:     z.enum(['tag', 'path']).default('tag').describe('"tag" groups operations by OpenAPI tag (one file per tag); "path" groups by URL path prefix.'),
  include:     z.array(z.string()).optional().describe('Whitelist of operation IDs or tags to generate. Omit to generate all operations.'),
  overwrite:   z.boolean().default(false).describe('When true, regenerates files that already exist. Default false skips existing files.'),
});

export type GenerateFromOpenApiInput = z.infer<typeof GenerateFromOpenApiInputSchema>;

export interface GeneratedFile {
  specPath:           string;
  method:             string;
  endpoint:           string;
  expectedStatus:     number;
  group:              string;
  variablesRemaining: string[];
}

export interface SkippedOperation {
  endpoint: string;
  method:   string;
  reason:   'unsupportedMethod' | 'noTestableResponses' | 'alreadyExists' | 'unresolvedRef' | 'filteredByInclude';
}

export interface GenerateFromOpenApiOutput {
  generated:          GeneratedFile[];
  skipped:            SkippedOperation[];
  totalEndpoints:     number;
  yamlParserAvailable: boolean;
}
