import { test, expect } from '@playwright/test';
import path from 'node:path';
import { resolveSafe, PathOutOfBoundsError } from './sandbox.js';

test.describe('resolveSafe', () => {
  test('accepts a relative path nested inside root', () => {
    const root = '/app';
    const result = resolveSafe(root, 'src/index.ts');
    expect(result).toBe(path.resolve('/app', 'src/index.ts'));
  });

  test('accepts a deeply nested relative path inside root', () => {
    const root = '/app';
    const result = resolveSafe(root, 'a/b/c/file.ts');
    expect(result).toBe(path.resolve('/app/a/b/c/file.ts'));
  });

  test('accepts path equal to root itself (exact root)', () => {
    const root = '/app';
    const result = resolveSafe(root, '.');
    expect(result).toBe(path.resolve('/app'));
  });

  test('rejects a classic path traversal (../../etc/passwd)', () => {
    expect(() => resolveSafe('/app', '../../etc/passwd')).toThrow(
      PathOutOfBoundsError,
    );
  });

  test('rejects a path traversal one level above root', () => {
    expect(() => resolveSafe('/app', '../secret')).toThrow(PathOutOfBoundsError);
  });

  test('rejects an absolute path that escapes the root', () => {
    expect(() => resolveSafe('/app', '/etc/passwd')).toThrow(PathOutOfBoundsError);
  });

  test('does NOT confuse /app-extra as being inside /app', () => {
    // '/app-extra' starts with '/app' as a string but is NOT under '/app/'.
    expect(() => resolveSafe('/app', '/app-extra/file.ts')).toThrow(
      PathOutOfBoundsError,
    );
  });

  test('accepts an absolute path that IS inside root', () => {
    const root = '/app';
    const result = resolveSafe(root, '/app/src/index.ts');
    expect(result).toBe(path.resolve('/app/src/index.ts'));
  });

  test('thrown error carries the PathOutOfBounds code', () => {
    let caught: unknown;
    try {
      resolveSafe('/app', '../escape');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PathOutOfBoundsError);
    expect((caught as PathOutOfBoundsError).code).toBe('PathOutOfBounds');
  });

  test('normalises double-dot segments in valid paths', () => {
    // /app/src/../lib resolves to /app/lib — still inside /app
    const result = resolveSafe('/app', 'src/../lib/util.ts');
    expect(result).toBe(path.resolve('/app/lib/util.ts'));
  });
});
