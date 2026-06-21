import { z } from 'zod';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import fsAsync from 'node:fs/promises';
import crypto from 'node:crypto';
import type { BrowserContextOptions } from 'playwright';

export const AuthConfigSchema = z.object({
  bearerEnvVar:     z.string().min(1).optional(),
  storageStatePath: z.string().min(1).optional(),
}).refine(
  (d) => d.bearerEnvVar !== undefined || d.storageStatePath !== undefined,
  { message: 'AuthConfig requires at least one of bearerEnvVar or storageStatePath' },
);
export type AuthConfig = z.infer<typeof AuthConfigSchema>;

export class AuthEnvVarMissingError extends Error {
  readonly code = 'AuthEnvVarMissing';
  constructor(name: string) {
    super(`Env var "${name}" is not set; cannot resolve bearer token.`);
    this.name = 'AuthEnvVarMissingError';
  }
}

export class AuthStorageStateMissingError extends Error {
  readonly code = 'AuthStorageStateMissing';
  constructor(p: string) {
    super(`storageState file not found at "${p}".`);
    this.name = 'AuthStorageStateMissingError';
  }
}

export class AuthPathNotAllowedError extends Error {
  readonly code = 'AuthPathNotAllowed';
  constructor(filePath: string) {
    super(`storageState path not allowed (must be in ~/.qacito/auth/ or OS temp): "${filePath}"`);
    this.name = 'AuthPathNotAllowedError';
  }
}

export function resolveAuthOptions(auth?: AuthConfig): BrowserContextOptions {
  if (!auth) return {};
  const opts: BrowserContextOptions = {};

  if (auth.bearerEnvVar) {
    const token = process.env[auth.bearerEnvVar];
    if (token === undefined || token.trim() === '') {
      throw new AuthEnvVarMissingError(auth.bearerEnvVar);
    }
    opts.extraHTTPHeaders = { Authorization: `Bearer ${token}` };
  }

  if (auth.storageStatePath) {
    const abs = path.resolve(auth.storageStatePath).replace(/\\/g, '/');
    const home = os.homedir().replace(/\\/g, '/');
    const tmp  = os.tmpdir().replace(/\\/g, '/');
    const allowedPrefixes = [
      path.join(home, '.qacito', 'auth').replace(/\\/g, '/'),
      tmp,
    ];
    const isAllowed = allowedPrefixes.some((prefix) =>
      abs === prefix || abs.startsWith(prefix + '/'),
    );
    if (!isAllowed) {
      throw new AuthPathNotAllowedError(abs);
    }
    try {
      fs.accessSync(abs);
    } catch {
      throw new AuthStorageStateMissingError(abs);
    }
    opts.storageState = abs;
  }

  return opts;
}

export function resolveBearerHeader(auth?: AuthConfig): { Authorization: string } | null {
  if (!auth?.bearerEnvVar) return null;
  const token = process.env[auth.bearerEnvVar];
  if (!token) throw new AuthEnvVarMissingError(auth.bearerEnvVar);
  return { Authorization: `Bearer ${token}` };
}

export function hashBaseUrl(baseUrl: string): string {
  const u = new URL(baseUrl);
  const norm = `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/$/, '')}`;
  return crypto.createHash('sha256').update(norm).digest('hex').slice(0, 8);
}

export function getAuthDir(): string {
  return process.env['QACITO_AUTH_DIR'] ?? path.join(os.homedir(), '.qacito', 'auth');
}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export async function discoverStorageState(baseUrl: string): Promise<string | null> {
  const hash = hashBaseUrl(baseUrl);
  const authDir = getAuthDir();
  const filePath = path.join(authDir, `${hash}.json`);
  try {
    const stat = await fsAsync.stat(filePath);
    const ttlMs = Number(process.env['QACITO_AUTH_TTL_MS'] ?? TWENTY_FOUR_HOURS_MS);
    if (Date.now() - stat.mtimeMs > ttlMs) return null;
    return filePath.replace(/\\/g, '/');
  } catch {
    return null;
  }
}
