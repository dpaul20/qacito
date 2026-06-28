import { test, expect } from '@playwright/test';
import { qacitoHomeHandler } from './handler.js';
import { TOOL_COUNT } from '../../shared/registry-meta.js';

test.describe('qacitoHomeHandler', () => {
  test('returns toolCount and projectRoot without throwing', async () => {
    const result = await qacitoHomeHandler();
    expect(result.toolCount).toBe(23);
    expect(result).toHaveProperty('projectRoot');
  });

  test('TOOL_COUNT constant equals 23', () => {
    expect(TOOL_COUNT).toBe(23);
  });
});
