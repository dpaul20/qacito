import { z } from 'zod';

/**
 * Input schema for the `detect_stack` tool.
 *
 * `projectPath` — absolute or relative path to the root of the project to analyse.
 */
export const DetectStackInputSchema = z.object({
  projectPath: z.string().min(1, 'projectPath must not be empty'),
});

export type DetectStackInput = z.infer<typeof DetectStackInputSchema>;
