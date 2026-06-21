import { z } from 'zod';

export const GetCoverageInputSchema = z.object({
  projectRoot: z.string().min(1, 'projectRoot must not be empty'),
  threshold:   z.number().min(0).max(100).optional(),
});

export type GetCoverageInput = z.infer<typeof GetCoverageInputSchema>;

export interface FileCoverage {
  file:       string;
  lines:      { pct: number; total: number; covered: number };
  statements: { pct: number; total: number; covered: number };
  functions:  { pct: number; total: number; covered: number };
  branches:   { pct: number; total: number; covered: number };
}

export interface GetCoverageOutput {
  found:          boolean;
  reportPath:     string;
  total:          FileCoverage['lines'] & { label: 'total' };
  files:          FileCoverage[];
  belowThreshold: FileCoverage[];
  howToEnable:    string;
}
