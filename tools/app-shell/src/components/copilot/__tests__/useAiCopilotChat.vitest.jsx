import { describe, expect, it } from 'vitest';
import { assertInternalPath } from '../useAiCopilotChat.js';

describe('useAiCopilotChat client tool path policy', () => {
  it('allows internal application paths', () => {
    expect(assertInternalPath('/sales-order/new')).toBe('/sales-order/new');
  });

  it('rejects external and protocol-relative paths', () => {
    expect(() => assertInternalPath('https://example.com')).toThrow();
    expect(() => assertInternalPath('//example.com')).toThrow();
    expect(() => assertInternalPath('sales-order/new')).toThrow();
  });
});
