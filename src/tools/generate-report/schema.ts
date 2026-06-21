import { z } from 'zod';

export const GenerateReportInputSchema = z.object({
  runId: z.string().min(1, 'runId must not be empty'),
  outputDir: z.string().min(1, 'outputDir must not be empty'),
});

export type GenerateReportInput = z.infer<typeof GenerateReportInputSchema>;

export interface GenerateReportOutput {
  mdPath: string;
  htmlPath: string;
  dashboardUrl: string;
}

export interface GenerateReportError {
  error: string;
  runId: string;
}
