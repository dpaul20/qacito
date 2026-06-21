import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseMochaJson, detectRunner } from './runner.js';

// ---------------------------------------------------------------------------
// parseMochaJson
// ---------------------------------------------------------------------------

test.describe('parseMochaJson', () => {
  test('all-pass fixture → status: passed', () => {
    const fixture = JSON.stringify({
      stats: { passes: 3, failures: 0, pending: 0, duration: 1200 },
      tests: [
        { fullTitle: 'suite test 1', file: 'spec.cy.ts' },
        { fullTitle: 'suite test 2', file: 'spec.cy.ts' },
        { fullTitle: 'suite test 3', file: 'spec.cy.ts' },
      ],
      failures: [],
    });

    const result = parseMochaJson(fixture);

    expect(result.status).toBe('passed');
    expect(result.summary.passed).toBe(3);
    expect(result.summary.failed).toBe(0);
    expect(result.summary.total).toBe(3);
    expect(result.durationMs).toBe(1200);
  });

  test('fixture with failures → correct failed count', () => {
    const fixture = JSON.stringify({
      stats: { passes: 1, failures: 2, pending: 0, duration: 800 },
      tests: [],
      failures: [
        { fullTitle: 'it fails A', file: 'spec.cy.ts', err: { message: 'AssertionError: expected 1 to equal 2', stack: 'at Context.<anonymous>' } },
        { fullTitle: 'it fails B', file: 'spec.cy.ts', err: { message: 'Timeout of 2000ms exceeded' } },
      ],
    });

    const result = parseMochaJson(fixture);

    expect(result.status).toBe('failed');
    expect(result.summary.failed).toBe(2);
    expect(result.summary.passed).toBe(1);
    expect(result.failures).toHaveLength(2);
    expect(result.failures[0]?.title).toBe('it fails A');
    expect(result.failures[0]?.message).toContain('AssertionError');
    expect(result.failures[1]?.message).toContain('Timeout');
  });

  test('malformed JSON → status: error', () => {
    const result = parseMochaJson('not valid json {{{');

    expect(result.status).toBe('error');
    expect(result.summary.total).toBe(0);
    expect(result.rawOutput).toContain('not valid json');
  });
});

// ---------------------------------------------------------------------------
// detectRunner
// ---------------------------------------------------------------------------

test.describe('detectRunner', () => {
  test('dir with cypress.config.ts → returns "cypress"', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qacito-detect-'));
    try {
      await fsp.writeFile(path.join(tmpDir, 'cypress.config.ts'), '// cypress config', 'utf-8');
      const runner = await detectRunner(tmpDir);
      expect(runner).toBe('cypress');
    } finally {
      await fsp.rm(tmpDir, { recursive: true, force: true });
    }
  });

  test('empty dir → returns null', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qacito-detect-'));
    try {
      const runner = await detectRunner(tmpDir);
      expect(runner).toBeNull();
    } finally {
      await fsp.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
