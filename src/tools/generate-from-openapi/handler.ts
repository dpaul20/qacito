import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveSafe, PathOutOfBoundsError } from '../../shared/sandbox.js';
import {
  loadOpenApiDocument,
  assertOpenApiVersion,
  walkPaths,
  MissingYamlParserError,
  UnsupportedOpenApiVersionError,
  InvalidOpenApiError,
} from './openapi-parser.js';
import { emitSpec } from './spec-emitter.js';
import type { GenerateFromOpenApiInput, GenerateFromOpenApiOutput, GeneratedFile, SkippedOperation } from './schema.js';

export {
  PathOutOfBoundsError,
  MissingYamlParserError,
  UnsupportedOpenApiVersionError,
  InvalidOpenApiError,
};

export class SpecNotFoundError extends Error {
  readonly code = 'SpecNotFound';
  constructor(specPath: string) {
    super(`OpenAPI spec file not found: "${specPath}"`);
    this.name = 'SpecNotFoundError';
  }
}

export async function generateFromOpenApiHandler(
  sandboxRoot: string,
  input: GenerateFromOpenApiInput,
): Promise<GenerateFromOpenApiOutput> {
  const resolvedSpecPath  = resolveSafe(sandboxRoot, input.specPath);
  const resolvedOutputDir = resolveSafe(sandboxRoot, input.outputDir);

  let raw: string;
  try {
    raw = await fs.readFile(resolvedSpecPath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw new SpecNotFoundError(input.specPath);
    throw err;
  }

  let yamlParserAvailable = true;
  let doc: Awaited<ReturnType<typeof loadOpenApiDocument>>;
  try {
    doc = await loadOpenApiDocument(raw, resolvedSpecPath);
  } catch (err) {
    if (err instanceof MissingYamlParserError) yamlParserAvailable = false;
    throw err;
  }

  assertOpenApiVersion(doc);

  const effectiveBaseUrl = input.baseUrl ?? doc.servers?.[0]?.url;
  const operations = walkPaths(doc, input.include);

  await fs.mkdir(resolvedOutputDir, { recursive: true });

  const generated: GeneratedFile[] = [];
  const skipped: SkippedOperation[] = [];

  for (const op of operations) {
    const emission = emitSpec(op, effectiveBaseUrl, input.groupBy);

    if ('skipReason' in emission) {
      skipped.push({
        endpoint: emission.endpoint ?? op.path,
        method:   emission.method   ?? op.method,
        reason:   emission.skipReason,
      });
      continue;
    }

    const destPath = resolveSafe(resolvedOutputDir, emission.filename);

    if (!input.overwrite) {
      try {
        await fs.access(destPath);
        skipped.push({ endpoint: emission.endpoint, method: emission.method, reason: 'alreadyExists' });
        continue;
      } catch {
        // file doesn't exist — proceed
      }
    }

    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.writeFile(destPath, emission.content, 'utf-8');

    generated.push({
      specPath:           destPath,
      method:             emission.method,
      endpoint:           emission.endpoint,
      expectedStatus:     emission.expectedStatus,
      group:              emission.group,
      variablesRemaining: emission.variablesRemaining,
    });
  }

  return { generated, skipped, totalEndpoints: operations.length, yamlParserAvailable };
}
