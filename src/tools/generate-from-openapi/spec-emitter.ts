import { getTemplate, extractVariables, type TemplateMethod } from '../api-templates/templates.js';
import type { OpenApiOperation } from './openapi-parser.js';

export type SkipReason = 'unsupportedMethod' | 'noTestableResponses' | 'unresolvedRef' | 'filteredByInclude';

export type Emission =
  | { skipReason: SkipReason; method?: string; endpoint?: string }
  | {
      filename:           string;
      content:            string;
      group:              string;
      variablesRemaining: string[];
      expectedStatus:     number;
      method:             TemplateMethod;
      endpoint:           string;
    };

const METHOD_MAP: Record<string, TemplateMethod | null> = {
  get: 'GET', post: 'POST', put: 'PUT', delete: 'DELETE',
  patch: null, options: null, head: null, trace: null,
};

function mapMethod(method: string): TemplateMethod | null {
  return METHOD_MAP[method.toLowerCase()] ?? null;
}

function selectExpectedStatus(responses: Record<string, unknown>): number | null {
  const codes = Object.keys(responses).map(Number).filter((n) => !Number.isNaN(n));
  if (codes.length === 0) return null;
  for (const preferred of [200, 201, 204]) {
    if (codes.includes(preferred)) return preferred;
  }
  const twoxx = codes.filter((c) => c >= 200 && c < 300).sort((a, b) => a - b);
  if (twoxx.length > 0) return twoxx[0] ?? null;
  const errxx = codes.filter((c) => c >= 400).sort((a, b) => a - b);
  if (errxx.length > 0) return errxx[0] ?? null;
  return null;
}

function sanitizePath(p: string): string {
  return p
    .replace(/\//g, '-')
    .replace(/[{}]/g, '')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
    .replace(/-{2,}/g, '-')
    .toLowerCase();
}

function firstSegment(urlPath: string): string {
  const parts = urlPath.split('/').filter(Boolean);
  return (parts[0] ?? 'api').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function buildFilename(group: string, method: string, urlPath: string): string {
  const g = group.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '');
  const m = method.toLowerCase();
  const p = sanitizePath(urlPath);
  return `${g}-${m}-${p}.spec.ts`;
}

export function emitSpec(
  op: OpenApiOperation,
  baseUrl?: string,
  groupBy: 'tag' | 'path' = 'tag',
): Emission {
  if (op.unresolvedRef) return { skipReason: 'unresolvedRef', method: op.method, endpoint: op.path };
  if (op.tags?.includes('__filtered__')) return { skipReason: 'filteredByInclude', method: op.method, endpoint: op.path };

  const templateMethod = mapMethod(op.method);
  if (!templateMethod) return { skipReason: 'unsupportedMethod', method: op.method, endpoint: op.path };

  const expectedStatus = selectExpectedStatus(op.responses);
  if (expectedStatus === null) return { skipReason: 'noTestableResponses', method: op.method, endpoint: op.path };

  const effectiveMethod: TemplateMethod = expectedStatus >= 400 ? 'error' : templateMethod;
  let content = getTemplate(effectiveMethod);

  content = content.replace(/\{\{ENDPOINT\}\}/g, op.path);
  content = content.replace(/\{\{EXPECTED_STATUS\}\}/g, String(expectedStatus));
  if (baseUrl) content = content.replace(/\{\{BASE_URL\}\}/g, baseUrl);

  const variablesRemaining = extractVariables(content);

  const group = groupBy === 'tag'
    ? (op.tags?.find((t) => t !== '__filtered__') ?? firstSegment(op.path))
    : firstSegment(op.path);

  const filename = buildFilename(group, templateMethod, op.path);

  return { filename, content, group, variablesRemaining, expectedStatus, method: templateMethod, endpoint: op.path };
}
