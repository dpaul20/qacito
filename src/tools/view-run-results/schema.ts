import { z } from 'zod';

export const viewRunResultsSchema = z.object({
  runId: z.string().optional().describe('Run ID to display. Omit to show the latest completed run.'),
});

export type ViewRunResultsInput = z.infer<typeof viewRunResultsSchema>;
