import path from 'node:path';

export interface OpenApiDocument {
  openapi: string;
  info?:    { title?: string; version?: string };
  servers?: Array<{ url: string }>;
  paths:    Record<string, Record<string, unknown>>;
}

export interface OpenApiOperation {
  path:          string;
  method:        string;
  operationId?:  string;
  tags?:         string[];
  responses:     Record<string, unknown>;
  unresolvedRef?: true;
}

export class MissingYamlParserError extends Error {
  readonly code = 'MissingYamlParser';
  constructor() {
    super('js-yaml is required to parse YAML OpenAPI specs. Run: npm install js-yaml @types/js-yaml');
    this.name = 'MissingYamlParserError';
  }
}

export class UnsupportedOpenApiVersionError extends Error {
  readonly code = 'UnsupportedOpenApiVersion';
  constructor(version: string) {
    super(`OpenAPI version "${version}" is not supported. Only 3.0.x and 3.1.x are accepted.`);
    this.name = 'UnsupportedOpenApiVersionError';
  }
}

export class InvalidOpenApiError extends Error {
  readonly code = 'InvalidOpenApi';
  constructor(detail: string) {
    super(`Invalid OpenAPI document: ${detail}`);
    this.name = 'InvalidOpenApiError';
  }
}

function isModuleNotFoundError(err: unknown): boolean {
  const e = err as NodeJS.ErrnoException;
  return e?.code === 'ERR_MODULE_NOT_FOUND' || e?.code === 'MODULE_NOT_FOUND';
}

// DI seam for tests
type YamlLoader = (raw: string) => unknown;
let _yamlLoader: YamlLoader | null = null;

export function __setYamlLoaderForTests(loader: YamlLoader): void { _yamlLoader = loader; }
export function __resetYamlLoaderForTests(): void { _yamlLoader = null; }

async function loadYaml(raw: string): Promise<unknown> {
  if (_yamlLoader) return _yamlLoader(raw);
  try {
    const mod = await import('js-yaml');
    const jsYaml = (mod.default ?? mod) as { load: (s: string) => unknown };
    return jsYaml.load(raw);
  } catch (err) {
    if (isModuleNotFoundError(err)) throw new MissingYamlParserError();
    throw err;
  }
}

export async function loadOpenApiDocument(raw: string, filePath: string): Promise<OpenApiDocument> {
  const ext = path.extname(filePath).toLowerCase();
  let parsed: unknown;

  if (ext === '.yaml' || ext === '.yml') {
    parsed = await loadYaml(raw);
  } else {
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new InvalidOpenApiError(`JSON parse failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const doc = parsed as Record<string, unknown>;
  if (!doc || typeof doc !== 'object') throw new InvalidOpenApiError('document is not an object');
  if (typeof doc['openapi'] !== 'string') throw new InvalidOpenApiError('missing or non-string "openapi" field');
  if (!doc['paths'] || typeof doc['paths'] !== 'object') throw new InvalidOpenApiError('missing "paths" field');

  return doc as unknown as OpenApiDocument;
}

export function assertOpenApiVersion(doc: OpenApiDocument): void {
  const v = doc.openapi ?? '';
  if (!v.startsWith('3.0.') && !v.startsWith('3.1.')) {
    throw new UnsupportedOpenApiVersionError(v);
  }
}

export function walkPaths(doc: OpenApiDocument, includeFilter?: string[]): OpenApiOperation[] {
  const ops: OpenApiOperation[] = [];

  for (const [urlPath, methods] of Object.entries(doc.paths ?? {})) {
    if (!methods || typeof methods !== 'object') continue;

    for (const [method, operation] of Object.entries(methods as Record<string, unknown>)) {
      if (method.startsWith('x-') || method === 'parameters' || method === 'summary' || method === 'description') continue;

      if (includeFilter && includeFilter.length > 0) {
        const matched = includeFilter.some((f) => urlPath.startsWith(f));
        if (!matched) {
          ops.push({ path: urlPath, method, responses: {}, tags: ['__filtered__'] });
          continue;
        }
      }

      const op = operation as Record<string, unknown>;

      if (typeof op === 'object' && op !== null && '$ref' in op) {
        ops.push({ path: urlPath, method, responses: {}, unresolvedRef: true });
        continue;
      }

      const responses = (op['responses'] ?? {}) as Record<string, unknown>;
      const tags = Array.isArray(op['tags']) ? (op['tags'] as string[]) : [];
      const operationId = typeof op['operationId'] === 'string' ? op['operationId'] : undefined;
      const entry: OpenApiOperation = { path: urlPath, method, responses, tags };
      if (operationId) entry.operationId = operationId;
      ops.push(entry);
    }
  }

  return ops;
}
