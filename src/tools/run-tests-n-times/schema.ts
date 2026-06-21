import { z } from 'zod';

export const RunTestsNTimesInputSchema = z.object({
  scriptPath:  z.string().min(1, 'scriptPath must not be empty'),
  n:           z.number().int().min(2).max(10).default(3),
  projectRoot: z.string().optional(),
  timeoutMs:   z.number().int().positive().default(120_000),
});

export type RunTestsNTimesInput = z.infer<typeof RunTestsNTimesInputSchema>;

export interface RunAttempt {
  attempt:    number;
  status:     'passed' | 'failed' | 'timeout' | 'error';
  durationMs: number;
  failCount:  number;
}

export interface RunTestsNTimesOutput {
  scriptPath:      string;
  runCount:        number;
  passCount:       number;
  failCount:       number;
  flakinessScore:  number;
  isFlaky:         boolean;
  verdict:         'stable-pass' | 'stable-fail' | 'flaky';
  runs:            RunAttempt[];
}
