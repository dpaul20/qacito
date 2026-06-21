import { z } from 'zod';

export const GetImpactedSpecsInputSchema = z.object({
  projectRoot:  z.string().min(1, 'projectRoot must not be empty'),
  changedFiles: z.array(z.string()).min(1, 'changedFiles must not be empty'),
  specsDir:     z.string().optional(),
  extensions:   z.array(z.string()).optional(),
});

export type GetImpactedSpecsInput = z.infer<typeof GetImpactedSpecsInputSchema>;

export interface SpecImpact {
  spec:         string;
  matchedFiles: string[];
}

export interface GetImpactedSpecsOutput {
  impactedSpecs:    string[];
  unimpactedSpecs:  string[];
  analysis:         SpecImpact[];
  totalSpecsScanned: number;
  note:             string;
}
