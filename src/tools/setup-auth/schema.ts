import { z } from 'zod';

export const SetupAuthInputSchema = z.object({
  baseUrl: z.string().url().describe('Base URL of the app (used for storage state file naming)'),
  loginUrl: z.string().url().describe('URL of the login page'),
  usernameEnvVar: z.string().describe('Name of env var containing username/email'),
  passwordEnvVar: z.string().describe('Name of env var containing password'),
  usernameSelector: z.string().default('input[type=email], input[name=email], input[name=username]').describe('CSS selector for username field'),
  passwordSelector: z.string().default('input[type=password]').describe('CSS selector for password field'),
  submitSelector: z.string().default('button[type=submit], input[type=submit]').describe('CSS selector for submit button'),
  navigationTimeoutMs: z.number().int().positive().default(15_000).describe('Timeout in ms for each navigation step'),
  postLoginWaitMs: z.number().int().min(0).default(2_000).describe('Extra wait in ms after submit before reading final URL'),
});

export type SetupAuthInput = z.infer<typeof SetupAuthInputSchema>;

export interface SetupAuthOutput {
  storageStatePath: string;
  baseUrl: string;
  baseUrlHash: string;
  createdAt: string;
  finalUrl: string;
}
