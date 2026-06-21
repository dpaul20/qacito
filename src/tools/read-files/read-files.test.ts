import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readFilesHandler } from './handler.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'qacito-read-test-'));
}

async function writeTempFile(dir: string, name: string, content: string): Promise<string> {
  const fullPath = path.join(dir, name);
  await fs.writeFile(fullPath, content, 'utf-8');
  return fullPath;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('readFilesHandler', () => {
  test('reads a single existing file successfully', async () => {
    const dir = await makeTempDir();
    try {
      const filePath = await writeTempFile(dir, 'hello.txt', 'Hello, world!');

      const output = await readFilesHandler(dir, { paths: [filePath] });

      expect(output.files).toHaveLength(1);
      expect(output.files[0]).toEqual({
        path: filePath,
        content: 'Hello, world!',
      });
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  test('reads multiple files in a single batch', async () => {
    const dir = await makeTempDir();
    try {
      const a = await writeTempFile(dir, 'a.txt', 'content-a');
      const b = await writeTempFile(dir, 'b.txt', 'content-b');

      const output = await readFilesHandler(dir, { paths: [a, b] });

      expect(output.files).toHaveLength(2);
      const contents = output.files.map((f) => f.content);
      expect(contents).toContain('content-a');
      expect(contents).toContain('content-b');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  test('returns FileNotFound error for a missing file without aborting the batch', async () => {
    const dir = await makeTempDir();
    try {
      const existing = await writeTempFile(dir, 'exists.txt', 'I exist');
      const missing = path.join(dir, 'does-not-exist.txt');

      const output = await readFilesHandler(dir, { paths: [existing, missing] });

      expect(output.files).toHaveLength(2);

      const existingResult = output.files.find((f) => f.path === existing);
      const missingResult  = output.files.find((f) => f.path === missing);

      expect(existingResult?.content).toBe('I exist');
      expect(existingResult?.error).toBeUndefined();

      expect(missingResult?.error).toBe('FileNotFound');
      expect(missingResult?.content).toBeUndefined();
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  test('returns PathOutOfBounds error for a path outside the sandbox root', async () => {
    const dir = await makeTempDir();
    try {
      const outsidePath = path.join(dir, '..', 'escape.txt');

      const output = await readFilesHandler(dir, { paths: [outsidePath] });

      expect(output.files).toHaveLength(1);
      expect(output.files[0]?.error).toBe('PathOutOfBounds');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  test('PathOutOfBounds for one path does NOT abort reading the remaining paths', async () => {
    const dir = await makeTempDir();
    try {
      const good = await writeTempFile(dir, 'good.txt', 'valid');
      const bad  = path.join(dir, '..', 'bad.txt');

      const output = await readFilesHandler(dir, { paths: [good, bad] });

      expect(output.files).toHaveLength(2);

      const goodResult = output.files.find((f) => f.path === good);
      const badResult  = output.files.find((f) => f.path === bad);

      expect(goodResult?.content).toBe('valid');
      expect(badResult?.error).toBe('PathOutOfBounds');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  test('reads a relative path resolved against the sandbox root', async () => {
    const dir = await makeTempDir();
    try {
      await writeTempFile(dir, 'rel.txt', 'relative content');

      const output = await readFilesHandler(dir, { paths: ['rel.txt'] });

      expect(output.files[0]?.content).toBe('relative content');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
