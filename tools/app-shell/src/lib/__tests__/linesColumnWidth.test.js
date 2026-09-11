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

    it('string/text columns always return 1 0 224px regardless of index (no idx=0 special case)', () => {
      assert.equal(columnFlex({ type: 'string' }, 0), '1 0 224px');
      assert.equal(columnFlex({ type: 'string' }, 1), '1 0 224px');
      assert.equal(columnFlex({ type: 'text' }, 0), '1 0 224px');
      assert.equal(columnFlex({ type: 'text' }, 2), '1 0 224px');
    });

    it('selector/foreignKey at idx=0 returns 1 0 192px (elastic grow, no shrink, so product column takes remaining space without collapsing)', () => {
      assert.equal(columnFlex({ type: 'selector' }, 0), '1 0 192px');
      assert.equal(columnFlex({ type: 'foreignKey' }, 0), '1 0 192px');
    });

    it('selector/search/foreignKey columns at idx>0 → 0 0 192px (fixed)', () => {
      assert.equal(columnFlex({ type: 'selector' }, 1), '0 0 192px');
      assert.equal(columnFlex({ type: 'search' }, 1), '0 0 192px');
      assert.equal(columnFlex({ type: 'foreignKey' }, 1), '0 0 192px');
    });

    it('enum/select columns → 1 0 224px (string-sized basis so long Select values fit)', () => {
      assert.equal(columnFlex({ type: 'enum' }, 1), '1 0 224px');
      assert.equal(columnFlex({ type: 'select' }, 1), '1 0 224px');
    });

    it('date columns → 1 0 130px', () => {
      assert.equal(columnFlex({ type: 'date' }, 1), '1 0 130px');
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

    // ETP-5133 review (Alex) — the `col.minWidth` branch is checked FIRST in
    // columnFlex() and short-circuits every other type/idx rule, but it was
    // never updated by this fix: it still hardcodes `1 1 ${minWidth}px`
    // (flex-shrink: 1), the exact shorthand this PR just replaced everywhere
    // else because it let leading columns collapse toward zero at a narrow
    // viewport instead of triggering horizontal scroll (see selectorFlex()
    // and the elastic-type branch above, both now `1 0`).
    //
    // No window's column config sets `col.minWidth` today (confirmed via
    // `grep -rn "minWidth:" artifacts/*/decisions.json` — no line-grid column
    // declares it), so this is DEAD CODE right now, not a live regression.
    // This test pins down that latent gap: it will keep passing unchanged
    // (documenting the bug) until a real fix lands, at which point updating
    // this assertion to `1 0 ...` is the signal the fix landed. If a future
    // window ever declares `minWidth` on a leading/growing column, this
    // branch reintroduces the ETP-5133 collapse bug for that column.
    it('KNOWN GAP (non-blocking) — col.minWidth branch still returns 1 1 (shrinkable), unlike every other elastic branch fixed by ETP-5133', () => {
      assert.equal(columnFlex({ type: 'string', minWidth: 300 }, 0), '1 1 300px');
    });

    it('selector at idx=0 grows by default; grow:false overrides it', () => {
      assert.equal(columnFlex({ type: 'selector' }, 0), '1 0 192px');
      assert.equal(columnFlex({ type: 'selector', grow: true }, 0), '1 0 192px');
      assert.equal(columnFlex({ type: 'selector', grow: false }, 0), '0 0 192px');
    });

    it('search at idx=1 is fixed by default; grow:true overrides it', () => {
      assert.equal(columnFlex({ type: 'search' }, 1), '0 0 192px');
      assert.equal(columnFlex({ type: 'search', grow: false }, 1), '0 0 192px');
      assert.equal(columnFlex({ type: 'search', grow: true }, 1), '1 0 192px');
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
