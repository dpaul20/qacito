import { z } from 'zod';
import { AuthConfigSchema } from '../../shared/auth-context.js';

export const CheckAccessibilityInputSchema = z.object({
  url:              z.string().min(1, 'url must not be empty').describe('Full URL to audit (must be reachable by the local Playwright browser).'),
  waitFor:          z.enum(['load', 'domcontentloaded', 'networkidle']).default('networkidle').describe('Page lifecycle event to wait for before running axe. Use "networkidle" for SPAs, "load" for static pages.'),
  includeSelectors: z.array(z.string()).optional().describe('CSS selectors to restrict the audit to specific elements. Omit to audit the whole page.'),
  excludeSelectors: z.array(z.string()).optional().describe('CSS selectors to exclude from the audit (e.g. third-party widgets).'),
  tags:             z.array(z.string()).default(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).describe('axe-core rule tags to run. Defaults to WCAG 2.0 + 2.1 A and AA.'),
  timeoutMs:        z.number().int().positive().default(30_000),
  headless:         z.boolean().default(true),
  auth:             AuthConfigSchema.optional(),
});

export type CheckAccessibilityInput = z.infer<typeof CheckAccessibilityInputSchema>;

export interface A11yNode {
  target:         string[];
  html:           string;
  failureSummary: string;
}

export interface A11yViolation {
  id:            string;
  impact:        'minor' | 'moderate' | 'serious' | 'critical' | null;
  description:   string;
  help:          string;
  helpUrl:       string;
  wcagCriteria:  string[];
  nodes:         A11yNode[];
}

export interface A11ySummary {
  violations:   number;
  passes:       number;
  incomplete:   number;
  inapplicable: number;
}

export interface CheckAccessibilityOutput {
  url:           string;
  runDurationMs: number;
  axeCoreVersion: string | null;
  summary:       A11ySummary;
  violations:    A11yViolation[];
}
