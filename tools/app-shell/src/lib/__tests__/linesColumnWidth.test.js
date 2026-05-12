import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { columnFlex, columnMinWidthPx } from '../linesColumnWidth.js';

// Helper — extract the flex-basis px from a CSS flex shorthand like "0 0 172px"
function basis(flex) {
  const m = flex.match(/(\d+)px$/);
  return m ? parseInt(m[1], 10) : null;
}

describe('linesColumnWidth', () => {
  describe('columnFlex', () => {
    it('returns a CSS flex string', () => {
      const f = columnFlex({ type: 'string' }, 1);
      assert.match(f, /^\d+ \d+ \d+px$/);
    });

    it('amount columns → 0 0 172px (fixed width)', () => {
      assert.equal(columnFlex({ type: 'amount' }, 0), '0 0 172px');
      assert.equal(columnFlex({ type: 'amount' }, 1), '0 0 172px');
    });

    it('price columns → 0 0 152px', () => {
      assert.equal(columnFlex({ type: 'price' }, 1), '0 0 152px');
    });

    it('quantity/integer columns → 0 0 152px', () => {
      assert.equal(columnFlex({ type: 'quantity' }, 1), '0 0 152px');
      assert.equal(columnFlex({ type: 'integer' }, 1), '0 0 152px');
    });

    it('decimal/percent columns → 0 0 152px', () => {
      assert.equal(columnFlex({ type: 'decimal' }, 1), '0 0 152px');
      assert.equal(columnFlex({ type: 'percent' }, 1), '0 0 152px');
    });

    it('first column (idx=0) gets 1 1 244px regardless of type', () => {
      assert.equal(columnFlex({ type: 'string' }, 0), '1 1 244px');
      assert.equal(columnFlex({ type: 'selector' }, 0), '1 1 244px');
    });

    it('string/text at non-zero idx → 1 1 224px', () => {
      assert.equal(columnFlex({ type: 'string' }, 1), '1 1 224px');
      assert.equal(columnFlex({ type: 'text' }, 2), '1 1 224px');
    });

    it('selector/search/foreignKey columns → 0 0 192px (fixed)', () => {
      assert.equal(columnFlex({ type: 'selector' }, 1), '0 0 192px');
      assert.equal(columnFlex({ type: 'search' }, 1), '0 0 192px');
      assert.equal(columnFlex({ type: 'foreignKey' }, 1), '0 0 192px');
    });

    it('enum/select columns → 0 0 152px', () => {
      assert.equal(columnFlex({ type: 'enum' }, 1), '0 0 152px');
      assert.equal(columnFlex({ type: 'select' }, 1), '0 0 152px');
    });

    it('date columns → 1 1 130px', () => {
      assert.equal(columnFlex({ type: 'date' }, 1), '1 1 130px');
    });

    it('unknown types → 0 0 120px (safe fallback)', () => {
      assert.equal(columnFlex({ type: 'custom' }, 1), '0 0 120px');
      assert.equal(columnFlex({}, 1), '0 0 120px');
    });
  });

  describe('columnMinWidthPx', () => {
    it('returns an integer (number, not string)', () => {
      const v = columnMinWidthPx({ type: 'amount' }, 0);
      assert.equal(typeof v, 'number');
      assert.equal(Math.floor(v), v);
    });

    it('matches the flex-basis of columnFlex for every type', () => {
      const CASES = [
        [{ type: 'amount' },      1, 172],
        [{ type: 'price' },       1, 152],
        [{ type: 'quantity' },    1, 152],
        [{ type: 'integer' },     1, 152],
        [{ type: 'decimal' },     1, 152],
        [{ type: 'percent' },     1, 152],
        [{ type: 'selector' },    1, 192],
        [{ type: 'search' },      1, 192],
        [{ type: 'foreignKey' },  1, 192],
        [{ type: 'enum' },        1, 152],
        [{ type: 'select' },      1, 152],
        [{ type: 'date' },        1, 130],
        [{ type: 'string' },      0, 244],  // first col
        [{ type: 'string' },      1, 224],
        [{ type: 'text' },        1, 224],
        [{ type: 'custom' },      1, 120],
      ];
      for (const [col, idx, expected] of CASES) {
        const px = columnMinWidthPx(col, idx);
        assert.equal(px, expected, `type=${col.type} idx=${idx}: expected ${expected}, got ${px}`);
        const flexBasis = basis(columnFlex(col, idx));
        assert.equal(px, flexBasis, `px and flex-basis must match for type=${col.type} idx=${idx}`);
      }
    });
  });
});
