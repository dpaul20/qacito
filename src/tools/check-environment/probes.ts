import net from 'node:net';
import type { UrlCheck, EnvVarCheck, PortCheck } from './schema.js';

const LOGIN_PATH_RE = /\/(login|signin|sign-in|auth|sso)(\/|$|\?)/i;

export async function urlProbe(url: string, timeoutMs: number): Promise<UrlCheck> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timer);

    const status = response.status;
    const finalUrl = response.url;
    const redirected = finalUrl !== url;
    const finalPath = (() => { try { return new URL(finalUrl).pathname; } catch { return ''; } })();

    const authShaped =
      status === 401 ||
      status === 403 ||
      (redirected && LOGIN_PATH_RE.test(finalPath));

    if (authShaped) {
      return {
        url, ok: false, status, durationMs: Date.now() - start, error: null,
        errorCode: 'AuthRequired',
        ...(redirected ? { finalUrl } : {}),
      };
    }

    const ok = status >= 200 && status < 400;
    return {
      url, ok, status, durationMs: Date.now() - start, error: null,
      ...(redirected ? { finalUrl } : {}),
    };
  } catch (err: unknown) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    return { url, ok: false, status: null, durationMs: Date.now() - start, error: msg };
  }
}

export function envVarProbe(names: string[]): EnvVarCheck[] {
  return names.map((name) => {
    const val = process.env[name];
    const present = val !== undefined;
    const nonEmpty = present && val.trim().length > 0;
    return { name, present, nonEmpty };
  });
}

export function portProbe(host: string, port: number, timeoutMs: number): Promise<PortCheck> {
  return new Promise((resolve) => {
    const start = Date.now();
    let settled = false;

    const done = (result: PortCheck) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch { /* already destroyed */ }
      resolve(result);
    };

    const socket = net.createConnection({ host, port });

    const timer = setTimeout(() => {
      done({ host, port, open: false, durationMs: Date.now() - start, error: 'timeout' });
    }, timeoutMs);

    socket.once('connect', () => {
      clearTimeout(timer);
      done({ host, port, open: true, durationMs: Date.now() - start, error: null });
    });

    socket.once('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      done({ host, port, open: false, durationMs: Date.now() - start, error: `${err.code ?? 'error'}: ${err.message}` });
    });
  });
}
