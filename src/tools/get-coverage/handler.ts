import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveSafe } from '../../shared/sandbox.js';
import type { GetCoverageInput, GetCoverageOutput, FileCoverage } from './schema.js';

// Istanbul coverage-summary.json shape (only fields we read).
interface IstanbulMetric {
  total:   number;
  covered: number;
  pct:     number;
}
interface IstanbulFileSummary {
  lines:      IstanbulMetric;
  statements: IstanbulMetric;
  functions:  IstanbulMetric;
  branches:   IstanbulMetric;
}
type IstanbulSummary = Record<string, IstanbulFileSummary>;

const HOW_TO_ENABLE = [
  'No coverage report found. To enable coverage:',
  '1. Install: npm i -D @bcoe/v8-coverage nyc',
  '2. Add to package.json scripts:',
  '   "test:coverage": "nyc npx playwright test"',
  '3. Run: npm run test:coverage',
  '4. Coverage summary will appear at coverage/coverage-summary.json',
  '',
  'Alternative (Istanbul via c8):',
  '   "test:coverage": "c8 npx playwright test"',
].join('\n');

const CANDIDATE_PATHS = [
  'coverage/coverage-summary.json',
  '.nyc_output/coverage-summary.json',
  'test-results/coverage-summary.json',
];

async function findSummary(projectRoot: string): Promise<{ filePath: string; raw: string } | null> {
  for (const candidate of CANDIDATE_PATHS) {
    try {
      const abs = resolveSafe(projectRoot, candidate);
      const raw = await fs.readFile(abs, 'utf-8');
      return { filePath: abs, raw };
    } catch {
      // try next
    }
  }
  return null;
}

function parseMetric(m: IstanbulMetric): { pct: number; total: number; covered: number } {
  return { pct: m.pct ?? 0, total: m.total ?? 0, covered: m.covered ?? 0 };
}

export async function getCoverageHandler(
  sandboxRoot: string,
  input: GetCoverageInput,
): Promise<GetCoverageOutput> {
  const projectRoot = resolveSafe(sandboxRoot, input.projectRoot);
  const found = await findSummary(projectRoot);

  if (!found) {
    return {
      found:          false,
      reportPath:     '',
      total:          { label: 'total', pct: 0, total: 0, covered: 0 },
      files:          [],
      belowThreshold: [],
      howToEnable:    HOW_TO_ENABLE,
    };
  }

  let summary: IstanbulSummary;
  try {
    summary = JSON.parse(found.raw) as IstanbulSummary;
  } catch {
    throw new Error(`Coverage report at "${found.filePath}" is not valid JSON.`);
  }

  const totalEntry = summary['total'];
  const total = totalEntry
    ? { label: 'total' as const, ...parseMetric(totalEntry.lines) }
    : { label: 'total' as const, pct: 0, total: 0, covered: 0 };

  const files: FileCoverage[] = Object.entries(summary)
    .filter(([key]) => key !== 'total')
    .map(([file, data]) => ({
      file:       path.relative(projectRoot, file),
      lines:      parseMetric(data.lines),
      statements: parseMetric(data.statements),
      functions:  parseMetric(data.functions),
      branches:   parseMetric(data.branches),
    }))
    .sort((a, b) => a.lines.pct - b.lines.pct);

  const threshold = input.threshold;
  const belowThreshold = threshold !== undefined
    ? files.filter((f) => f.lines.pct < threshold)
    : [];

  return {
    found:      true,
    reportPath: path.relative(projectRoot, found.filePath),
    total,
    files,
    belowThreshold,
    howToEnable: HOW_TO_ENABLE,
  };
}
