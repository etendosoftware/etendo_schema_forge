// @covers tools/app-shell/src/lib/importBatchSize.js
import { describe, it, expect } from 'vitest';
import { resolveImportBatchSize } from '../importBatchSize.js';

// ETP-5676 — the global `import-batch-size` flag overrides a window's `limit.batchSize`.
describe('resolveImportBatchSize', () => {
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['0', 0],
    ['a negative number', -1],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['a string', 'abc'],
    ['a fraction below 1', 0.4],
    ['a boolean', true],
  ])('falls back to the decisions value when the flag is %s', (_label, flag) => {
    expect(resolveImportBatchSize(flag, 10)).toBe(10);
  });

  it('falls back to 1 when neither the flag nor the decisions value is usable', () => {
    expect(resolveImportBatchSize(undefined, undefined)).toBe(1);
    expect(resolveImportBatchSize(0, 'x')).toBe(1);
    expect(resolveImportBatchSize(0, -3)).toBe(1);
  });

  it('uses a valid flag value over the decisions value', () => {
    expect(resolveImportBatchSize(7, 10)).toBe(7);
    expect(resolveImportBatchSize(7, undefined)).toBe(7);
  });

  it('rounds a fractional flag down and leaves clamping to the engine', () => {
    expect(resolveImportBatchSize(2.9, 10)).toBe(2);
    expect(resolveImportBatchSize(99, 10)).toBe(99);
  });

  it('rounds a fractional decisions value down as well', () => {
    expect(resolveImportBatchSize(0, 10.7)).toBe(10);
  });
});
