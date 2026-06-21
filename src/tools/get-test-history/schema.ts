import { z } from 'zod';

export const GetTestHistoryInputSchema = z.object({
  projectRoot: z.string().optional(),
  specPath: z.string().optional(),
  limit: z.number().int().positive().optional(),
});

export type GetTestHistoryInput = z.infer<typeof GetTestHistoryInputSchema>;
