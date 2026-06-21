import type { Page } from '@playwright/test';

export interface AxeBuilderInstance {
  withTags(tags: string[]): AxeBuilderInstance;
  include(selector: string): AxeBuilderInstance;
  exclude(selector: string): AxeBuilderInstance;
  analyze(): Promise<AxeResult>;
}

export interface AxeBuilderConstructor {
  new (opts: { page: Page }): AxeBuilderInstance;
}

export interface AxeResult {
  violations:   AxeViolation[];
  passes:       unknown[];
  incomplete:   unknown[];
  inapplicable: unknown[];
  testEngine?:  { version?: string };
}

export interface AxeViolation {
  id:          string;
  impact:      'minor' | 'moderate' | 'serious' | 'critical' | null;
  description: string;
  help:        string;
  helpUrl:     string;
  tags:        string[];
  nodes:       Array<{ target: string[]; html: string; failureSummary: string }>;
}

export class MissingAxeCoreError extends Error {
  readonly code = 'MissingAxeCore';
  constructor() {
    super('npm install --save-dev @axe-core/playwright axe-core');
    this.name = 'MissingAxeCoreError';
  }
}

function isModuleNotFoundError(err: unknown): boolean {
  const e = err as NodeJS.ErrnoException;
  return e?.code === 'ERR_MODULE_NOT_FOUND' || e?.code === 'MODULE_NOT_FOUND';
}

async function defaultLoader(): Promise<AxeBuilderConstructor> {
  try {
    const mod = await import('@axe-core/playwright');
    const ctor = (mod as unknown as Record<string, unknown>)['AxeBuilder'] as AxeBuilderConstructor | undefined;
    if (!ctor) throw new Error('AxeBuilder not found in @axe-core/playwright exports');
    return ctor;
  } catch (err) {
    if (isModuleNotFoundError(err)) throw new MissingAxeCoreError();
    throw err;
  }
}

// DI seam for tests
type LoaderFn = () => Promise<AxeBuilderConstructor>;
let _loadAxeBuilder: LoaderFn = defaultLoader;

export function loadAxeBuilder(): Promise<AxeBuilderConstructor> { return _loadAxeBuilder(); }
export function __setAxeBuilderLoaderForTests(loader: LoaderFn): void { _loadAxeBuilder = loader; }
export function __resetAxeBuilderLoaderForTests(): void { _loadAxeBuilder = defaultLoader; }
