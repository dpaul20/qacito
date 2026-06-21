import { z } from 'zod';

/**
 * Input schema for the `run_tests` tool.
 *
 * `scriptPath`  — path to the Playwright spec file to execute. Validated
 *                 via `resolveSafe` before being passed to child_process.
 * `timeoutMs`   — maximum execution time in milliseconds. Defaults to 120 000
 *                 (2 minutes) — same as the Playwright default per-test timeout.
 * `maxRetries`  — maximum number of times the self-healing loop may call
 *                 `run_tests` on the same spec before `can_retry` flips to
 *                 `false`. Defaults to 3.
 */
export const RunTestsInputSchema = z.object({
  scriptPath: z.string().min(1, 'scriptPath must not be empty'),
  timeoutMs: z.number().int().positive().default(120_000),
  maxRetries: z.number().int().min(1).default(3),
  projectRoot: z.string().optional(),
});

export type RunTestsInput = z.infer<typeof RunTestsInputSchema>;
