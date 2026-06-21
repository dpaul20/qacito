import { z } from 'zod';

/**
 * Input schema for the `read_files` tool.
 *
 * `paths` — one or more file paths (relative or absolute) to read.
 * At least one path is required; an empty array is rejected immediately.
 */
export const ReadFilesInputSchema = z.object({
  paths: z.array(z.string()).min(1, 'At least one path is required'),
  projectRoot: z.string().optional(),
});

export type ReadFilesInput = z.infer<typeof ReadFilesInputSchema>;
