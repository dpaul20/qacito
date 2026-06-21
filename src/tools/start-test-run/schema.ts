import { z } from 'zod';
import { AuthConfigSchema } from '../../shared/auth-context.js';

export const StartTestRunInputSchema = z.object({
  scriptPath:  z.string().min(1, 'scriptPath must not be empty'),
  projectRoot: z.string().optional(),
  timeoutMs:   z.number().int().positive().default(120_000),
  auth:        AuthConfigSchema.optional(),
});

export type StartTestRunInput = z.infer<typeof StartTestRunInputSchema>;

export interface StartTestRunOutput {
  runId:        string;
  status:       'started';
  dashboardUrl: string;
}
