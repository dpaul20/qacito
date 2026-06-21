import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import fsAsync from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  AuthConfigSchema,
  resolveAuthOptions,
  hashBaseUrl,
  discoverStorageState,
  AuthEnvVarMissingError,
  AuthStorageStateMissingError,
  AuthPathNotAllowedError,
} from './auth-context.js';

test.describe('AuthConfigSchema', () => {
  test('accepts valid bearerEnvVar', () => {
    const result = AuthConfigSchema.safeParse({ bearerEnvVar: 'MY_TOKEN' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.bearerEnvVar).toBe('MY_TOKEN');
    }
  });

  test('accepts valid storageStatePath', () => {
    const result = AuthConfigSchema.safeParse({ storageStatePath: '/tmp/auth.json' });
    expect(result.success).toBe(true);
  });

  test('accepts both fields', () => {
    const result = AuthConfigSchema.safeParse({ bearerEnvVar: 'X', storageStatePath: '/tmp/auth.json' });
    expect(result.success).toBe(true);
  });

  test('rejects empty object (requires at least one field)', () => {
    const result = AuthConfigSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

test.describe('resolveAuthOptions — bearerEnvVar', () => {
  test('returns empty object when auth is undefined', () => {
    const result = resolveAuthOptions(undefined);
    expect(result).toEqual({});
  });

  test('throws AuthEnvVarMissingError when env var is not set', () => {
    expect(() => resolveAuthOptions({ bearerEnvVar: 'NONEXISTENT_VAR_12345' })).toThrow(AuthEnvVarMissingError);
  });

  test('returns extraHTTPHeaders when env var is set', () => {
    process.env['TEST_BEARER_TOKEN_QA'] = 'abc123';
    try {
      const result = resolveAuthOptions({ bearerEnvVar: 'TEST_BEARER_TOKEN_QA' });
      expect(result.extraHTTPHeaders).toEqual({ Authorization: 'Bearer abc123' });
    } finally {
      delete process.env['TEST_BEARER_TOKEN_QA'];
    }
  });
});

test.describe('resolveAuthOptions — storageStatePath', () => {
  test('throws AuthStorageStateMissingError for non-existent file within allowed path', () => {
    const tmpBase = os.tmpdir();
    const nonExistent = path.join(tmpBase, 'qacito-nonexistent-auth-9999.json');
    expect(() => resolveAuthOptions({ storageStatePath: nonExistent })).toThrow(AuthStorageStateMissingError);
  });

  test('throws AuthPathNotAllowedError for path outside home and tmpdir', () => {
    expect(() => resolveAuthOptions({ storageStatePath: 'C:/workspace/project/auth.json' })).toThrow(AuthPathNotAllowedError);
  });

  test('normalizes Windows backslash paths to forward slashes', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qacito-auth-test-'));
    try {
      const filePath = path.join(tmpDir, 'state.json');
      fs.writeFileSync(filePath, JSON.stringify({ cookies: [], origins: [] }), 'utf-8');

      const windowsStylePath = filePath.replace(/\//g, '\\');
      const result = resolveAuthOptions({ storageStatePath: windowsStylePath });
      expect(result.storageState).toBeDefined();
      expect(result.storageState).not.toContain('\\');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('succeeds with valid file in tmpdir', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qacito-auth-test-'));
    try {
      const filePath = path.join(tmpDir, 'state.json');
      fs.writeFileSync(filePath, JSON.stringify({ cookies: [], origins: [] }), 'utf-8');

      const result = resolveAuthOptions({ storageStatePath: filePath });
      expect(typeof result.storageState).toBe('string');
      expect(result.storageState).not.toContain('\\');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

test.describe('hashBaseUrl', () => {
  test('normalizes trailing slash — https://A.com/ === https://a.com', () => {
    expect(hashBaseUrl('https://A.com/')).toBe(hashBaseUrl('https://a.com'));
  });

  test('returns 8-char hex string', () => {
    const h = hashBaseUrl('https://example.com');
    expect(h).toMatch(/^[0-9a-f]{8}$/);
  });

  test('different hosts produce different hashes', () => {
    expect(hashBaseUrl('https://app.example.com')).not.toBe(hashBaseUrl('https://api.example.com'));
  });
});

test.describe('discoverStorageState', () => {
  test('returns null when file does not exist', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qacito-auth-discover-'));
    const originalAuthDir = process.env['QACITO_AUTH_DIR'];
    process.env['QACITO_AUTH_DIR'] = tmpDir;
    try {
      const result = await discoverStorageState('https://notexistent.example.com');
      expect(result).toBeNull();
    } finally {
      if (originalAuthDir !== undefined) {
        process.env['QACITO_AUTH_DIR'] = originalAuthDir;
      } else {
        delete process.env['QACITO_AUTH_DIR'];
      }
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('returns null for stale file (mtime > 24h ago)', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qacito-auth-stale-'));
    const originalAuthDir = process.env['QACITO_AUTH_DIR'];
    const originalTtl = process.env['QACITO_AUTH_TTL_MS'];
    process.env['QACITO_AUTH_DIR'] = tmpDir;
    try {
      const hash = hashBaseUrl('https://stale.example.com');
      const filePath = path.join(tmpDir, `${hash}.json`);
      fs.writeFileSync(filePath, JSON.stringify({ cookies: [], origins: [] }), 'utf-8');

      const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
      fs.utimesSync(filePath, twentyFiveHoursAgo, twentyFiveHoursAgo);

      const result = await discoverStorageState('https://stale.example.com');
      expect(result).toBeNull();
    } finally {
      if (originalAuthDir !== undefined) {
        process.env['QACITO_AUTH_DIR'] = originalAuthDir;
      } else {
        delete process.env['QACITO_AUTH_DIR'];
      }
      if (originalTtl !== undefined) {
        process.env['QACITO_AUTH_TTL_MS'] = originalTtl;
      } else {
        delete process.env['QACITO_AUTH_TTL_MS'];
      }
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('returns file path for fresh file', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qacito-auth-fresh-'));
    const originalAuthDir = process.env['QACITO_AUTH_DIR'];
    process.env['QACITO_AUTH_DIR'] = tmpDir;
    try {
      const hash = hashBaseUrl('https://fresh.example.com');
      const filePath = path.join(tmpDir, `${hash}.json`);
      fs.writeFileSync(filePath, JSON.stringify({ cookies: [], origins: [] }), 'utf-8');

      const result = await discoverStorageState('https://fresh.example.com');
      expect(result).not.toBeNull();
      expect(result).not.toContain('\\');
    } finally {
      if (originalAuthDir !== undefined) {
        process.env['QACITO_AUTH_DIR'] = originalAuthDir;
      } else {
        delete process.env['QACITO_AUTH_DIR'];
      }
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
