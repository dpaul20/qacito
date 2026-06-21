import { z } from 'zod';
import { AuthConfigSchema } from '../../shared/auth-context.js';

export const AnalyzeProjectInputSchema = z.object({
  projectRoot: z.string().min(1, 'projectRoot must not be empty'),
  auth:        AuthConfigSchema.optional(),
});

export type AnalyzeProjectInput = z.infer<typeof AnalyzeProjectInputSchema>;

export interface AnalyzeProjectOutput {
  projectName: string;
  projectRoot: string;
  baseUrl: string;
  techStack: string[];
  testCases: TestCaseOutput[];
  specsDir: string;
  filesWritten: number;
  dashboardUrl: string;
}

export interface TestCaseOutput {
  id: string;
  title: string;
  description: string;
  steps: string[];
  url: string;
  category: string;
}
