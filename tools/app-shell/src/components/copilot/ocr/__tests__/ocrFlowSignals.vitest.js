// @covers tools/app-shell/src/components/copilot/ocr/ocrFlowSignals.js
import { describe, it, expect } from 'vitest';
import { BACK, isBack } from '../ocrFlowSignals.js';

describe('ocrFlowSignals', () => {
  describe('BACK', () => {
    it('is a symbol', () => {
      expect(typeof BACK).toBe('symbol');
    });

    it('is one shared sentinel across imports', async () => {
      const again = await import('../ocrFlowSignals.js');
      expect(again.BACK).toBe(BACK);
    });

    it('is distinct from cancel (null)', () => {
      expect(BACK).not.toBe(null);
    });
  });

  describe('isBack', () => {
    it('is true for BACK', () => {
      expect(isBack(BACK)).toBe(true);
    });

    it.each([
      ['null (cancel)', null],
      ['undefined', undefined],
      ['a reviewed value object', { vendor: 'x' }],
      ["the symbol's description string", 'ocr-flow-back'],
      ['a local symbol with the same description', Symbol('ocr-flow-back')],
      ['false', false],
      ['0', 0],
      ['empty string', ''],
      ['the descriptor back-report shape', { back: true }],
    ])('is false for %s', (_label, value) => {
      expect(isBack(value)).toBe(false);
    });

    it('does not treat cancel as back', () => {
      expect(isBack(null)).toBe(false);
    });
  });
});
