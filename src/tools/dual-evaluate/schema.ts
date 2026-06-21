import { z } from 'zod';

export const DualEvaluateInputSchema = z.object({
  task: z.string().min(1, 'task must not be empty'),
  context: z.string().optional(),
});

export type DualEvaluateInput = z.infer<typeof DualEvaluateInputSchema>;

export interface DualEvaluateOutput {
  plan: string;
}
