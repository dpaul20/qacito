import { z } from 'zod';

/**
 * Input schema for the `write_file` tool.
 *
 * `path`    — destination path (relative or absolute within the sandbox).
 * `content` — file content. Must be non-empty; a string of only whitespace
 *             is also rejected to avoid accidentally writing blank files.
 *             The rejection is surfaced as an `EmptyContent` error.
 */
export const WriteFileInputSchema = z.object({
  path: z.string().min(1, 'path must not be empty'),
  projectRoot: z.string().optional(),
  content: z
    .string()
    .min(1, 'EmptyContent')
    .refine((s) => s.trim().length > 0, {
      message: 'EmptyContent',
    }),
});

export type WriteFileInput = z.infer<typeof WriteFileInputSchema>;
