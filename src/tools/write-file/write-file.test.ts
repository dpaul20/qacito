import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeFileHandler } from './handler.js';
import { PathOutOfBoundsError } from '../../shared/sandbox.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'qacito-write-test-'));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('writeFileHandler', () => {
  test('writes a file and returns the resolved path and byte count', async () => {
    const dir = await makeTempDir();
    try {
      const destPath = path.join(dir, 'output.txt');
      const content  = 'Hello, QAcito!';

      const output = await writeFileHandler(dir, { path: destPath, content });

      expect(output.path).toBe(destPath);
      // byte count for ASCII is char count
      expect(output.bytesWritten).toBe(Buffer.byteLength(content, 'utf-8'));

      const written = await fs.readFile(destPath, 'utf-8');
      expect(written).toBe(content);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  test('creates missing parent directories automatically', async () => {
    const dir = await makeTempDir();
    try {
      const destPath = path.join(dir, 'deep', 'nested', 'dir', 'file.ts');
      const content  = 'export const x = 1;';

      const output = await writeFileHandler(dir, { path: destPath, content });

      expect(output.path).toBe(destPath);

      const written = await fs.readFile(destPath, 'utf-8');
      expect(written).toBe(content);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  test('overwrites an existing file', async () => {
    const dir = await makeTempDir();
    try {
      const destPath = path.join(dir, 'file.txt');
      await fs.writeFile(destPath, 'original', 'utf-8');

      await writeFileHandler(dir, { path: destPath, content: 'updated' });

      const written = await fs.readFile(destPath, 'utf-8');
      expect(written).toBe('updated');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  test('throws PathOutOfBoundsError when path escapes the sandbox root', async () => {
    const dir = await makeTempDir();
    try {
      const escapePath = path.join(dir, '..', 'escape.txt');

      await expect(
        writeFileHandler(dir, { path: escapePath, content: 'evil' }),
      ).rejects.toThrow(PathOutOfBoundsError);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  test('thrown PathOutOfBoundsError carries the correct code', async () => {
    const dir = await makeTempDir();
    try {
      const escapePath = path.join(dir, '../../evil.txt');
      let caught: unknown;

      try {
        await writeFileHandler(dir, { path: escapePath, content: 'x' });
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(PathOutOfBoundsError);
      expect((caught as PathOutOfBoundsError).code).toBe('PathOutOfBounds');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  test('correctly computes bytesWritten for multi-byte UTF-8 content', async () => {
    const dir = await makeTempDir();
    try {
      const content  = '日本語テスト'; // multi-byte characters
      const destPath = path.join(dir, 'utf8.txt');

      const output = await writeFileHandler(dir, { path: destPath, content });

      // Buffer.byteLength gives the correct UTF-8 byte count
      expect(output.bytesWritten).toBe(Buffer.byteLength(content, 'utf-8'));
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  test('accepts a relative path resolved against the sandbox root', async () => {
    const dir = await makeTempDir();
    try {
      const output = await writeFileHandler(dir, {
        path: 'relative/file.txt',
        content: 'relative write',
      });

      expect(output.path).toBe(path.join(dir, 'relative', 'file.txt'));

      const written = await fs.readFile(output.path, 'utf-8');
      expect(written).toBe('relative write');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
