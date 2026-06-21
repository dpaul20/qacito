import { z } from 'zod';

/**
 * Valid HTTP methods (plus the "error" sentinel for 4xx test scenarios).
 */
export const TemplateMethodEnum = z.enum(['GET', 'POST', 'PUT', 'DELETE', 'error', 'screenshot']);

/**
 * Input schema for the `get_api_template` tool.
 *
 * `method`         — HTTP verb to generate the template for, or "error" for
 *                    a 4xx/error-handling scenario.
 * `endpoint`       — The URL path of the endpoint (e.g. "/api/users"). Used
 *                    as documentation context only — inserted as a placeholder
 *                    comment in the generated spec.
 * `expectedStatus` — HTTP status code the test should assert (e.g. 200, 201,
 *                    204, 400, 401, 404). Defaults to sensible values per method
 *                    but must always be explicit to avoid ambiguous specs.
 */
export const GetApiTemplateInputSchema = z.object({
  method: TemplateMethodEnum,
  endpoint: z.string().min(1, 'endpoint must not be empty'),
  expectedStatus: z
    .number()
    .int()
    .min(100)
    .max(599)
    .default(200),
});

export type GetApiTemplateInput = z.infer<typeof GetApiTemplateInputSchema>;
