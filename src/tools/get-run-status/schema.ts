import { z } from 'zod';

export const GetRunStatusInputSchema = z.object({
  runId: z.string().min(1, 'runId must not be empty'),
});

export type GetRunStatusInput = z.infer<typeof GetRunStatusInputSchema>;
