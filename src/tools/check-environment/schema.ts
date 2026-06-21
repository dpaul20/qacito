import { z } from 'zod';

export const CheckEnvironmentBaseSchema = z.object({
  url:       z.string().optional(),
  envVars:   z.array(z.string()).optional(),
  ports:     z.array(z.object({
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535),
  })).optional(),
  timeoutMs: z.number().int().positive().default(5_000),
});

export const CheckEnvironmentInputSchema = CheckEnvironmentBaseSchema.refine(
  (d) => d.url !== undefined || (d.envVars && d.envVars.length > 0) || (d.ports && d.ports.length > 0),
  { message: 'At least one of url, envVars, or ports must be provided' },
);

export type CheckEnvironmentInput = z.infer<typeof CheckEnvironmentInputSchema>;

export interface UrlCheck {
  url:        string;
  ok:         boolean;
  status:     number | null;
  durationMs: number;
  error:      string | null;
  /** Set when the failure is auth-shaped: 401/403 or redirect to a login URL. */
  errorCode?: 'AuthRequired';
  /** Final URL after redirect chain, when different from `url`. */
  finalUrl?:  string;
}

export interface EnvVarCheck {
  name:     string;
  present:  boolean;
  nonEmpty: boolean;
}

export interface PortCheck {
  host:      string;
  port:      number;
  open:      boolean;
  durationMs: number;
  error:     string | null;
}

export interface CheckEnvironmentOutput {
  ok:           boolean;
  durationMs:   number;
  urlCheck:     UrlCheck | null;
  envVarChecks: EnvVarCheck[];
  portChecks:   PortCheck[];
}
