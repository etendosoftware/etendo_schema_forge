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

    it('string/text columns always return 1 1 224px regardless of index (no idx=0 special case)', () => {
      assert.equal(columnFlex({ type: 'string' }, 0), '1 1 224px');
      assert.equal(columnFlex({ type: 'string' }, 1), '1 1 224px');
      assert.equal(columnFlex({ type: 'text' }, 0), '1 1 224px');
      assert.equal(columnFlex({ type: 'text' }, 2), '1 1 224px');
    });

    it('selector/foreignKey at idx=0 returns 1 1 192px (elastic so product column takes remaining space)', () => {
      assert.equal(columnFlex({ type: 'selector' }, 0), '1 1 192px');
      assert.equal(columnFlex({ type: 'foreignKey' }, 0), '1 1 192px');
    });

    it('selector/search/foreignKey columns at idx>0 → 0 0 192px (fixed)', () => {
      assert.equal(columnFlex({ type: 'selector' }, 1), '0 0 192px');
      assert.equal(columnFlex({ type: 'search' }, 1), '0 0 192px');
      assert.equal(columnFlex({ type: 'foreignKey' }, 1), '0 0 192px');
    });

    it('enum/select columns → 1 1 224px (string-sized basis so long Select values fit)', () => {
      assert.equal(columnFlex({ type: 'enum' }, 1), '1 1 224px');
      assert.equal(columnFlex({ type: 'select' }, 1), '1 1 224px');
    });

    it('date columns → 1 1 130px', () => {
      assert.equal(columnFlex({ type: 'date' }, 1), '1 1 130px');
    });

    it('unknown types → 0 0 120px (safe fallback)', () => {
      assert.equal(columnFlex({ type: 'custom' }, 1), '0 0 120px');
      assert.equal(columnFlex({}, 1), '0 0 120px');
    });

    it('grow:true on amount → 1 0 172px', () => {
      assert.equal(columnFlex({ type: 'amount', grow: true }, 0), '1 0 172px');
    });

    it('grow:true on price → 1 0 152px', () => {
      assert.equal(columnFlex({ type: 'price', grow: true }, 1), '1 0 152px');
    });

    it('grow:true on quantity → 1 0 152px', () => {
      assert.equal(columnFlex({ type: 'quantity', grow: true }, 1), '1 0 152px');
    });

    it('grow:true on integer → 1 0 152px', () => {
      assert.equal(columnFlex({ type: 'integer', grow: true }, 1), '1 0 152px');
    });

    it('grow:true on decimal → 1 0 152px', () => {
      assert.equal(columnFlex({ type: 'decimal', grow: true }, 1), '1 0 152px');
    });

    it('grow:true on percent → 1 0 152px', () => {
      assert.equal(columnFlex({ type: 'percent', grow: true }, 1), '1 0 152px');
    });

    it('grow:true on unknown type → 1 0 120px fallback', () => {
      assert.equal(columnFlex({ type: 'custom', grow: true }, 1), '1 0 120px');
    });

    it('selector at idx=0 grows by default; grow:false overrides it', () => {
      assert.equal(columnFlex({ type: 'selector' }, 0), '1 1 192px');
      assert.equal(columnFlex({ type: 'selector', grow: true }, 0), '1 1 192px');
      assert.equal(columnFlex({ type: 'selector', grow: false }, 0), '0 0 192px');
    });

    it('search at idx=1 is fixed by default; grow:true overrides it', () => {
      assert.equal(columnFlex({ type: 'search' }, 1), '0 0 192px');
      assert.equal(columnFlex({ type: 'search', grow: false }, 1), '0 0 192px');
      assert.equal(columnFlex({ type: 'search', grow: true }, 1), '1 1 192px');
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
        [{ type: 'enum' },        1, 224],
        [{ type: 'select' },      1, 224],
        [{ type: 'date' },        1, 130],
        [{ type: 'string' },      0, 224],  // idx=0 no longer special — same as idx=1+
        [{ type: 'string' },      1, 224],
        [{ type: 'text' },        0, 224],  // text at idx=0 also 224
        [{ type: 'text' },        1, 224],
        [{ type: 'selector' },    0, 192],  // selector at idx=0 unchanged (192)
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
