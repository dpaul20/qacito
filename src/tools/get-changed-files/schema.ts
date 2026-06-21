import { z } from 'zod';

export const GetChangedFilesInputSchema = z.object({
  projectPath: z.string().min(1, 'projectPath must not be empty'),
  staged: z.boolean().optional().default(false),
  base: z
    .string()
    .regex(/^[\w.\-/]+$/, 'base must only contain word chars, dots, slashes, and hyphens')
    .refine((v) => !v.includes('..'), 'base must not contain path traversal sequences')
    .optional()
    .default('HEAD'),
  filter: z.array(z.string()).optional(),
});

export type GetChangedFilesInput = z.infer<typeof GetChangedFilesInputSchema>;
