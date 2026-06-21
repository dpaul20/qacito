import { test, expect } from '@playwright/test';
import { dualEvaluateHandler } from './handler.js';

test.describe('dual_evaluate', () => {
  test('plan contains both agent sections and reconciliation', () => {
    const result = dualEvaluateHandler({ task: 'Is the login flow passing?' });
    expect(result.plan).toContain('Agent A');
    expect(result.plan).toContain('Agent B');
    expect(result.plan).toContain('Reconciliation');
    expect(result.plan).toContain('Is the login flow passing?');
  });

  test('includes context in plan when provided', () => {
    const result = dualEvaluateHandler({
      task: 'Check test coverage',
      context: '/path/to/project',
    });
    expect(result.plan).toContain('/path/to/project');
    expect(result.plan).toContain('**Project/Context:**');
  });

  test('omits context line when context is not provided', () => {
    const result = dualEvaluateHandler({ task: 'Check something' });
    expect(result.plan).not.toContain('**Project/Context:**');
  });

  test('plan includes verdict format and confidence instructions', () => {
    const result = dualEvaluateHandler({ task: 'Evaluate API stability' });
    expect(result.plan).toMatch(/pass\|fail\|inconclusive/i);
    expect(result.plan).toContain('CONFIDENCE');
    expect(result.plan).toContain('high confidence');
    expect(result.plan).toContain('medium confidence');
  });
});
