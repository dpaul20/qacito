import { urlProbe, envVarProbe, portProbe } from './probes.js';
import type { CheckEnvironmentInput, CheckEnvironmentOutput } from './schema.js';

export async function checkEnvironmentHandler(
  _sandboxRoot: string,
  input: CheckEnvironmentInput,
): Promise<CheckEnvironmentOutput> {
  const timeoutMs = input.timeoutMs ?? 5_000;
  const start = Date.now();

  const urlCheckP     = input.url     ? urlProbe(input.url, timeoutMs)                                 : Promise.resolve(null);
  const envVarChecksP = input.envVars ? Promise.resolve(envVarProbe(input.envVars))                    : Promise.resolve([]);
  const portChecksP   = input.ports   ? Promise.all(input.ports.map((p) => portProbe(p.host, p.port, timeoutMs))) : Promise.resolve([]);

  const [urlCheck, envVarChecks, portChecks] = await Promise.all([urlCheckP, envVarChecksP, portChecksP]);

  const ok =
    (urlCheck === null || urlCheck.ok === true) &&
    envVarChecks.every((e) => e.present && e.nonEmpty) &&
    portChecks.every((p) => p.open);

  return {
    ok,
    durationMs: Date.now() - start,
    urlCheck,
    envVarChecks,
    portChecks,
  };
}
