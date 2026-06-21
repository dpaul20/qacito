import type { GetApiTemplateInput } from './schema.js';
import { getTemplate, extractVariables, type TemplateMethod } from './templates.js';

// ---------------------------------------------------------------------------
// Output type
// ---------------------------------------------------------------------------

/**
 * Shape returned by the `get_api_template` tool.
 *
 * Mirrors the batch scope contract: { template, type, variables }.
 *
 * `template`  — ready-to-use Playwright .spec.ts content with {{PLACEHOLDERS}}
 *               already substituted where `endpoint` and `expectedStatus` are known.
 * `type`      — the method/type that was requested (e.g. "GET", "POST", "error").
 * `variables` — list of {{PLACEHOLDER}} variables still remaining in the template
 *               that Claude should fill in before passing to write_file.
 */
export interface GetApiTemplateOutput {
  template: string;
  type: string;
  variables: string[];
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Selects the appropriate Playwright spec template, applies known substitutions
 * (`endpoint` and `expectedStatus`), and returns the result with a variable list.
 *
 * Claude is responsible for filling in the remaining {{PLACEHOLDERS}} (e.g.
 * BASE_URL, AUTH_TOKEN) before calling write_file with the final spec.
 *
 * @param input  Validated input from the Zod schema.
 */
export async function getApiTemplateHandler(input: GetApiTemplateInput): Promise<GetApiTemplateOutput> {
  const raw = getTemplate(input.method as TemplateMethod);

  // Apply known substitutions from the tool input.
  // Replace all occurrences of the known placeholders so the output is
  // immediately useful without requiring Claude to know the endpoint/status.
  const substituted = raw
    .replace(/\{\{ENDPOINT\}\}/g, input.endpoint)
    .replace(/\{\{EXPECTED_STATUS\}\}/g, String(input.expectedStatus));

  // Collect remaining unresolved placeholder variables for the caller.
  const variables = extractVariables(substituted);

  process.stderr.write(
    `[get_api_template] method="${input.method}" endpoint="${input.endpoint}" ` +
      `expectedStatus=${input.expectedStatus} variables=[${variables.join(', ')}]\n`,
  );

  return {
    template: substituted,
    type: input.method,
    variables,
  };
}
