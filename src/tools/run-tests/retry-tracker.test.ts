import { test, expect } from '@playwright/test';
import {
  increment,
  getCount,
  canRetry,
  recordErrors,
  reset,
  buildBlockerReport,
} from './retry-tracker.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generates a unique spec path to avoid cross-test state pollution. */
function uniquePath(label: string): string {
  return `/tmp/qacito-test-specs/${label}-${Date.now()}-${Math.random()}.spec.ts`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('retry-tracker', () => {
  test('increment initialises count to 1 on first call', () => {
    const spec = uniquePath('init');
    const count = increment(spec);
    expect(count).toBe(1);
    reset(spec);
  });

  test('increment increases count by 1 on each subsequent call', () => {
    const spec = uniquePath('incr');
    increment(spec);
    increment(spec);
    const count = increment(spec);
    expect(count).toBe(3);
    reset(spec);
  });

  test('getCount returns 0 for an unknown spec path', () => {
    const spec = uniquePath('never-seen');
    expect(getCount(spec)).toBe(0);
  });

  test('getCount reflects the current attempt count', () => {
    const spec = uniquePath('getcount');
    increment(spec);
    increment(spec);
    expect(getCount(spec)).toBe(2);
    reset(spec);
  });

  test('canRetry returns true when attempt count is below maxRetries', () => {
    const spec = uniquePath('can-retry-true');
    increment(spec); // attempt = 1
    expect(canRetry(spec, 3)).toBe(true); // 1 < 3
    reset(spec);
  });

  test('canRetry returns false when attempt count equals maxRetries', () => {
    const spec = uniquePath('can-retry-equal');
    increment(spec); // 1
    increment(spec); // 2
    increment(spec); // 3 — exhausted
    expect(canRetry(spec, 3)).toBe(false); // 3 < 3 is false
    reset(spec);
  });

  test('canRetry returns false when attempt count exceeds maxRetries', () => {
    const spec = uniquePath('can-retry-over');
    increment(spec); // 1
    increment(spec); // 2
    increment(spec); // 3
    increment(spec); // 4
    expect(canRetry(spec, 3)).toBe(false);
    reset(spec);
  });

  test('reset clears the counter so the path starts fresh', () => {
    const spec = uniquePath('reset-test');
    increment(spec);
    increment(spec);
    reset(spec);
    expect(getCount(spec)).toBe(0);
    // After reset, a new increment starts at 1
    const newCount = increment(spec);
    expect(newCount).toBe(1);
    reset(spec);
  });

  test('different spec paths have independent counters', () => {
    const specA = uniquePath('independent-a');
    const specB = uniquePath('independent-b');

    increment(specA);
    increment(specA);
    increment(specB);

    expect(getCount(specA)).toBe(2);
    expect(getCount(specB)).toBe(1);

    reset(specA);
    reset(specB);
  });

  test('buildBlockerReport includes the spec path and attempt counts', () => {
    const spec = uniquePath('blocker');
    increment(spec); // attempt 1
    recordErrors(spec, 1, ['Error A', 'Error B']);
    increment(spec); // attempt 2
    recordErrors(spec, 2, ['Error C']);

    const report = buildBlockerReport(spec, 3);

    expect(report).toContain(spec);
    expect(report).toContain('Attempts made: 2 / 3');
    reset(spec);
  });

  test('buildBlockerReport includes recorded error messages', () => {
    const spec = uniquePath('blocker-errors');
    increment(spec);
    recordErrors(spec, 1, ['expect(received).toBe(expected)', 'Timeout exceeded']);

    const report = buildBlockerReport(spec, 3);

    expect(report).toContain('expect(received).toBe(expected)');
    expect(report).toContain('Timeout exceeded');
    reset(spec);
  });

  test('buildBlockerReport handles zero attempts gracefully', () => {
    const spec = uniquePath('blocker-zero');
    // Do not increment — spec was never tracked
    const report = buildBlockerReport(spec, 3);
    expect(report).toContain('Attempts made: 0 / 3');
  });

  test('recordErrors does nothing when spec path is not tracked', () => {
    const spec = uniquePath('record-unknown');
    // Should not throw
    expect(() => recordErrors(spec, 1, ['some error'])).not.toThrow();
  });
});
