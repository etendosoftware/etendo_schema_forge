// @covers tools/app-shell/src/lib/linesColumnWidth.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
// @covers tools/app-shell/src/lib/linesColumnWidth.js
import {
  columnFlex, columnMinWidthPx, withImplicitGrowColumn, withLinesAbsorberColumn, listTableMinWidthPx, GROW_COLUMN_MIN_PX,
  listHeaderMinWidthPx, measureHeaderLabelPx, LIST_HEADER_CHROME_PX, resetHeaderMeasureCache,
} from '../linesColumnWidth.js';

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

    // ETP-5833 — codes/states keep the 224px room for the value + chevron but no longer
    // expand like a description.
    it('enum/select columns → 0 0 224px (string-sized basis so long Select values fit, never grows)', () => {
      assert.equal(columnFlex({ type: 'enum' }, 1), '0 0 224px');
      assert.equal(columnFlex({ type: 'select' }, 1), '0 0 224px');
    });

    it('date columns → 0 0 176px (fixed: a date must not stretch like a description)', () => {
      assert.equal(columnFlex({ type: 'date' }, 0), '0 0 176px');
      assert.equal(columnFlex({ type: 'date' }, 1), '0 0 176px');
    });

    it('number columns (the generator numeric type) → 0 0 152px, same tier as quantity', () => {
      assert.equal(columnFlex({ type: 'number' }, 1), '0 0 152px');
      assert.equal(columnFlex({ type: 'number' }, 1), columnFlex({ type: 'quantity' }, 1));
    });

    it('status columns → 0 0 184px in lines too (pill clips at 120px)', () => {
      assert.equal(columnFlex({ type: 'status' }, 1), '0 0 184px');
    });

    // ETP-5833 — expansion audit: across the whole type set, ONLY descriptive types
    // (string/text) and the leading selector grow by default; an explicit `grow: true`
    // or `minWidth` still opts any column in.
    it('only descriptive types grow by default; date/number/amount/status/enum/select/boolean never do', () => {
      const grows = (col, idx = 1) => columnFlex(col, idx).split(' ')[0] === '1';
      for (const type of ['string', 'text']) assert.equal(grows({ type }), true, type);
      for (const type of ['date', 'number', 'amount', 'price', 'quantity', 'integer', 'decimal', 'percent',
        'signedDelta', 'status', 'enum', 'select', 'boolean', 'custom']) {
        assert.equal(grows({ type }), false, `${type} must not grow by default`);
        assert.equal(grows({ type, grow: true }), true, `${type} grows when it opts in with grow:true`);
      }
      assert.equal(grows({ type: 'selector' }, 0), true);
      assert.equal(grows({ type: 'selector' }, 1), false);
    });

    it('an explicit minWidth on a date still wins and stays elastic (ETP-5332 contract)', () => {
      assert.equal(columnFlex({ type: 'date', minWidth: 160 }, 1), '1 0 160px');
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

    // ETP-5332 — closes the gap the ETP-5133 review (Alex) predicted: Contacts'
    // ContactTable.jsx declared `minWidth: 320` on Email once the create-contact popup
    // made the row genuinely narrow, and the `col.minWidth` branch's old `1 1` (shrinkable)
    // let Email alone collapse toward zero while its neighbors (shrink: 0) held their
    // ground — with no `overflow: hidden` on the cell, that read as Email's text bleeding
    // into Phone instead of the row scrolling. Now `1 0`, matching every other branch.
    it('col.minWidth branch is non-shrinkable (1 0), matching every other elastic branch fixed by ETP-5133', () => {
      assert.equal(columnFlex({ type: 'string', minWidth: 300 }, 0), '1 0 300px');
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

    // ETP-5210 — decisions.json `columnWidth` is carried through to `col.minWidth`
    // by the generator; this is the exact override mechanism the Simple G/L
    // Journal Account-column widening (and the physical-inventory `etgoQtydiff`
    // precedent) depends on. It must win over the type-based default regardless
    // of type/idx/grow, since it is checked first and short-circuits.
    describe('minWidth override (ETP-5210)', () => {
      it('overrides the selector type-based default (192px)', () => {
        assert.equal(columnFlex({ type: 'selector', minWidth: 280 }, 0), '1 0 280px');
        assert.equal(columnFlex({ type: 'selector', minWidth: 280 }, 1), '1 0 280px');
      });

      it('overrides the string type-based default (224px)', () => {
        assert.equal(columnFlex({ type: 'string', minWidth: 280 }, 0), '1 0 280px');
        assert.equal(columnFlex({ type: 'string', minWidth: 280 }, 1), '1 0 280px');
      });

      it('wins even when grow:false is also set (minWidth check short-circuits first)', () => {
        assert.equal(columnFlex({ type: 'selector', minWidth: 280, grow: false }, 0), '1 0 280px');
        assert.equal(columnFlex({ type: 'string', minWidth: 280, grow: false }, 1), '1 0 280px');
      });

      it('wins even when grow:true is also set', () => {
        assert.equal(columnFlex({ type: 'amount', minWidth: 300, grow: true }, 1), '1 0 300px');
      });
    });

    // ETP-5133 (QA pass 3, F-2) — a no-truncate column carries the width its widest value
    // needs (`contentWidthPx`, set by linesContentWidth.js). It may only RAISE the basis, and
    // must keep the grow/shrink terms so the absorber choice is unchanged.
    describe('contentWidthPx (ETP-5133)', () => {
      it('raises the basis above the type default, keeping the grow term', () => {
        assert.equal(columnFlex({ type: 'selector', contentWidthPx: 412.4 }, 0), '1 0 413px');
        assert.equal(columnFlex({ type: 'selector', contentWidthPx: 412 }, 1), '0 0 412px');
      });

      it('never shrinks the basis below the type default or an explicit minWidth', () => {
        assert.equal(columnFlex({ type: 'selector', contentWidthPx: 100 }, 1), '0 0 192px');
        assert.equal(columnFlex({ type: 'selector', minWidth: 280, contentWidthPx: 200 }, 1), '1 0 280px');
      });

      it('is ignored when absent or not positive', () => {
        assert.equal(columnFlex({ type: 'selector', contentWidthPx: 0 }, 1), '0 0 192px');
        assert.equal(columnFlex({ type: 'selector' }, 1), '0 0 192px');
      });
    });

    // A `boolean`+`badge` column normally gets the generic 152px basis, but the
    // Posted-status column (`postedStatus.js`) needs a wider 240px basis — its
    // pill can also show one of 15 long reason codes, not just true/false.
    describe('boolean+badge basis', () => {
      it('a generic boolean+badge column gets the 152px basis', () => {
        assert.equal(columnFlex({ type: 'boolean', badge: true, column: 'Active' }, 1), '0 0 152px');
      });

      it('the Posted-status column gets the wider 240px basis', () => {
        assert.equal(columnFlex({ type: 'boolean', badge: true, column: 'Posted' }, 1), '0 0 240px');
        assert.equal(columnFlex({ type: 'boolean', badge: true, column: 'posted' }, 1), '0 0 240px');
      });
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
        [{ type: 'price' },       1, 152],
        [{ type: 'quantity' },    1, 152],
        [{ type: 'integer' },     1, 152],
        [{ type: 'decimal' },     1, 152],
        [{ type: 'selector' },    1, 192],
        [{ type: 'search' },      1, 192],
        [{ type: 'foreignKey' },  1, 192],
        [{ type: 'enum' },        1, 224],
        [{ type: 'select' },      1, 224],
        [{ type: 'date' },        1, 176],
        [{ type: 'number' },      1, 152],  // ETP-5833
        [{ type: 'status' },      1, 184],  // ETP-5833: lines and list agree
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

    // Intentional divergence: `percent` is the ONE type where columnMinWidthPx (DataTable
    // list mode: <col>, header th, body td) is narrower than the columnFlex basis. The list
    // cell is a compact ProgressCircle, so it uses PERCENT_LIST_BASIS_PX (104), while
    // InlineLinesPanel / add-row keep the 152px flex basis (FIXED_BASIS_PX.percent).
    describe('percent list basis (intentional divergence from columnFlex)', () => {
      it('columnMinWidthPx returns 104 for percent', () => {
        assert.equal(columnMinWidthPx({ type: 'percent' }), 104);
        assert.equal(columnMinWidthPx({ type: 'percent' }, 1), 104);
      });

      it('an explicit minWidth wins over the 104px percent default', () => {
        assert.equal(columnMinWidthPx({ type: 'percent', minWidth: 200 }), 200);
      });

      it('columnFlex keeps the 152px basis for InlineLinesPanel / add-row', () => {
        assert.equal(columnFlex({ type: 'percent' }, 1), '0 0 152px');
        assert.equal(columnFlex({ type: 'percent', grow: true }, 1), '1 0 152px');
      });
    });

    // ETP-5210 — same override guarantee as columnFlex above, for the
    // HTML-table-layout counterpart used by DataTable's inline-add row.
    describe('minWidth override (ETP-5210)', () => {
      it('overrides the selector type-based default (192px)', () => {
        assert.equal(columnMinWidthPx({ type: 'selector', minWidth: 280 }), 280);
      });

      it('overrides the string type-based default (224px)', () => {
        assert.equal(columnMinWidthPx({ type: 'string', minWidth: 280 }), 280);
      });

      it('wins regardless of idx', () => {
        assert.equal(columnMinWidthPx({ type: 'selector', minWidth: 280 }, 0), 280);
        assert.equal(columnMinWidthPx({ type: 'selector', minWidth: 280 }, 1), 280);
      });
    });

    describe('boolean+badge basis', () => {
      it('a generic boolean+badge column gets the 152px basis', () => {
        assert.equal(columnMinWidthPx({ type: 'boolean', badge: true, column: 'Active' }), 152);
      });

      it('the Posted-status column gets the wider 240px basis, matching columnFlex', () => {
        const col = { type: 'boolean', badge: true, column: 'Posted' };
        assert.equal(columnMinWidthPx(col), 240);
        assert.equal(columnMinWidthPx(col), basis(columnFlex(col, 1)));
      });
    });
    describe('display: tag basis', () => {
      it('is fixed at 144px and never elastic', () => {
        assert.equal(columnFlex({ type: 'selector', display: 'tag' }, 1), '0 0 144px');
        assert.equal(columnFlex({ type: 'foreignKey', display: 'tag' }, 0), '0 0 144px');
        assert.equal(columnFlex({ type: 'string', display: 'tag' }, 0), '0 0 144px');
      });

      it('columnMinWidthPx is 144 and matches the flex basis', () => {
        const col = { type: 'selector', display: 'tag' };
        assert.equal(columnMinWidthPx(col), 144);
        assert.equal(columnMinWidthPx(col), basis(columnFlex(col, 1)));
      });

      it('an explicit minWidth sets the pixel basis but stays 0 0', () => {
        const col = { type: 'selector', display: 'tag', minWidth: 200 };
        assert.equal(columnFlex(col, 0), '0 0 200px');
        assert.equal(columnMinWidthPx(col), 200);
      });

      it('a non-tag selector column is unchanged (192px, elastic at idx 0)', () => {
        assert.equal(columnMinWidthPx({ type: 'selector' }), 192);
        assert.equal(columnFlex({ type: 'selector' }, 0), '1 0 192px');
        assert.equal(columnFlex({ type: 'selector' }, 1), '0 0 192px');
      });
    });
  });

  // ETP-5833 (QA) — the lines tier (172) is sized for an editable amount input; a read-only list
  // cell needs far less, so the list narrows exactly like `percent` does.
  describe('amount list basis (intentional divergence from columnFlex)', () => {
    it('columnMinWidthPx returns 130 for amount, columnFlex keeps 172', () => {
      assert.equal(columnMinWidthPx({ type: 'amount' }), 130);
      assert.equal(columnFlex({ type: 'amount' }, 1), '0 0 172px');
    });

    it('an explicit minWidth still wins over the amount list basis', () => {
      assert.equal(columnMinWidthPx({ type: 'amount', minWidth: 220 }), 220);
    });
  });

  // ETP-5833 (QA) — a list header never wraps: the column floor covers the rendered header.
  describe('list header floor (listHeaderMinWidthPx / headerMinWidthPx)', () => {
    it('measures with the deterministic 7px-per-character estimate where no canvas exists', () => {
      assert.equal(measureHeaderLabelPx('Fecha de la factura'), 19 * 7);
      assert.equal(measureHeaderLabelPx('Fecha de la factura'), measureHeaderLabelPx('Fecha de la factura'));
      assert.equal(measureHeaderLabelPx(''), 0);
      assert.equal(measureHeaderLabelPx(null), 0);
      assert.equal(measureHeaderLabelPx({ type: 'span' }), 0, 'a React node is not measured');
    });

    // Canvas path, with OffscreenCanvas / document.fonts doubles (node has neither).
    describe('canvas measurement and the font-loading cache', () => {
      let pxPerChar;
      let fontLoaded;
      const FONT = '600 12px Inter, sans-serif';
      function install() {
        pxPerChar = 5;
        fontLoaded = false;
        globalThis.OffscreenCanvas = class {
          getContext() { return { font: '', measureText: (t) => ({ width: t.length * pxPerChar }) }; }
        };
        globalThis.document = { fonts: { check: () => fontLoaded } };
        resetHeaderMeasureCache();
      }
      function uninstall() {
        delete globalThis.OffscreenCanvas;
        delete globalThis.document;
        resetHeaderMeasureCache();
      }

      it('measures with the canvas when one exists', () => {
        install();
        try {
          assert.equal(measureHeaderLabelPx('Contacto', FONT), 40);
        } finally { uninstall(); }
      });

      it('does not cache a width measured before the web font loaded (fallback face)', () => {
        install();
        try {
          assert.equal(measureHeaderLabelPx('Contacto', FONT), 40);
          pxPerChar = 6; // Inter is in: same family string, wider glyphs
          fontLoaded = true;
          assert.equal(measureHeaderLabelPx('Contacto', FONT), 48, 'the fallback width was not cached');
          pxPerChar = 9;
          assert.equal(measureHeaderLabelPx('Contacto', FONT), 48, 'a width measured with the font loaded is cached');
        } finally { uninstall(); }
      });

      it('bounds the width cache (cell values are unbounded, ETP-5133)', () => {
        install();
        try {
          fontLoaded = true;
          assert.equal(measureHeaderLabelPx('Contacto', FONT), 40);
          for (let i = 0; i < 500; i += 1) measureHeaderLabelPx(`label ${i}`, FONT);
          pxPerChar = 6;
          assert.equal(measureHeaderLabelPx('Contacto', FONT), 48, 'the cache was reset once full');
        } finally { uninstall(); }
      });

      it('falls back to the estimate when the canvas measures 0', () => {
        install();
        try {
          pxPerChar = 0;
          assert.equal(measureHeaderLabelPx('Contacto', FONT), 8 * 7);
        } finally { uninstall(); }
      });
    });

    it('is label width + chrome (padding, reserved sort arrow, slack)', () => {
      assert.equal(LIST_HEADER_CHROME_PX, 42);
      assert.equal(listHeaderMinWidthPx({ type: 'date' }, 'Fecha de la factura'), 133 + 42);
    });

    it('adds the computed-freshness clock only when it renders (deferred stored column)', () => {
      const label = 'Estado';
      const base = listHeaderMinWidthPx({ type: 'string' }, label);
      assert.equal(listHeaderMinWidthPx({ type: 'string', computed: { mode: 'stored', refresh: 'queued' } }, label), base + 18);
      assert.equal(listHeaderMinWidthPx({ type: 'string', computed: { mode: 'stored', refresh: 'synchronous' } }, label), base);
    });

    it('is 0 for headers that do not render on one line from a label', () => {
      assert.equal(listHeaderMinWidthPx({ type: 'string', headClass: 'w-[80px]' }, 'Long header label'), 0);
      assert.equal(listHeaderMinWidthPx({ type: 'percent' }, 'Entregado y facturado'), 0, 'percent wraps by default');
      assert.equal(listHeaderMinWidthPx({ type: 'date', headerWrap: true }, 'Última actualización'), 0);
      assert.equal(listHeaderMinWidthPx({ type: 'string' }, ''), 0);
    });

    it('columnMinWidthPx is max(type basis, header floor) — a short label keeps the basis', () => {
      assert.equal(columnMinWidthPx({ type: 'date', headerMinWidthPx: 90 }), 176);
      assert.equal(columnMinWidthPx({ type: 'amount', headerMinWidthPx: 150 }), 150);
      assert.equal(columnMinWidthPx({ type: 'date', minWidth: 130, headerMinWidthPx: 162 }), 162,
        'the header floor also beats an explicit minWidth: a list header is never truncated');
      assert.equal(columnMinWidthPx({ type: 'selector', display: 'tag', headerMinWidthPx: 160 }), 160);
    });

    it('listTableMinWidthPx counts the header floor of fixed and grow columns', () => {
      const cols = [{ type: 'string', grow: true, headerMinWidthPx: 400 }, { type: 'date', headerMinWidthPx: 200 }];
      assert.equal(listTableMinWidthPx(cols), 400 + 200);
    });

    it('never affects the lines layout (columnFlex ignores headerMinWidthPx)', () => {
      assert.equal(columnFlex({ type: 'date', headerMinWidthPx: 300 }, 1), '0 0 176px');
    });
  });

  describe('list-only bases (multiField)', () => {
    it('status columns get the same 184px basis in a list and in lines (ETP-5833)', () => {
      assert.equal(columnMinWidthPx({ type: 'status' }), 184);
      assert.equal(columnFlex({ type: 'status' }, 1), '0 0 184px');
    });

    // ETP-5833 — a date WITH time has no tier (no list/lines column carries one): an ISO
    // datetime value in a `date` column sizes exactly like a date.
    it('a date column sizes the same whatever value it carries (no datetime tier)', () => {
      assert.equal(columnMinWidthPx({ type: 'date', key: 'orderDate' }), 176);
      assert.equal(basis(columnFlex({ type: 'date', key: 'orderDate' }, 1)), 176);
    });

    it('multiField columns get a 240px basis in a list and keep the 120px generic basis in lines', () => {
      assert.equal(columnMinWidthPx({ type: 'multiField' }), 240);
      assert.equal(columnFlex({ type: 'multiField' }, 1), '0 0 120px');
    });

    it('an explicit minWidth still wins over the list basis', () => {
      assert.equal(columnMinWidthPx({ type: 'status', minWidth: 90 }), 90);
    });
  });

  describe('withImplicitGrowColumn', () => {
    it('returns the same array when a column already grows', () => {
      const cols = [{ key: 'a' }, { key: 'b', grow: true }];
      assert.equal(withImplicitGrowColumn(cols), cols);
    });

    it('marks the first column that does not pin its width as grow', () => {
      const cols = [{ key: 'a', headClass: 'w-[80px]' }, { key: 'b', cellClass: 'w-10' }, { key: 'c' }, { key: 'd' }];
      const out = withImplicitGrowColumn(cols);
      assert.deepEqual(out.map(c => !!c.grow), [false, false, true, false]);
      assert.equal(cols[2].grow, undefined, 'input is not mutated');
    });

    it('returns the columns unchanged when every column pins its width', () => {
      const cols = [{ key: 'a', headClass: 'w-10' }, { key: 'b', cellClass: 'w-10' }];
      assert.equal(withImplicitGrowColumn(cols), cols);
    });

    it('returns an empty list unchanged', () => {
      const cols = [];
      assert.equal(withImplicitGrowColumn(cols), cols);
    });
  });

  describe('listTableMinWidthPx', () => {
    it('floors the grow column at GROW_COLUMN_MIN_PX (320) and adds the fixed slots', () => {
      assert.equal(GROW_COLUMN_MIN_PX, 320);
      const cols = [{ type: 'string', grow: true }, { type: 'amount' }];
      assert.equal(listTableMinWidthPx(cols, 40), 320 + 130 + 40);
    });

    it('keeps a grow column that is already wider than the floor at its own basis', () => {
      assert.equal(listTableMinWidthPx([{ type: 'string', grow: true, minWidth: 500 }]), 500);
    });

    it('excludes columns that pin their width with headClass', () => {
      const cols = [{ type: 'string', grow: true }, { type: 'amount', headClass: 'w-[100px]' }];
      assert.equal(listTableMinWidthPx(cols), 320);
    });

    it('is the fixed slots alone for an empty list', () => {
      assert.equal(listTableMinWidthPx([], 80), 80);
      assert.equal(listTableMinWidthPx([]), 0);
    });
  });

  // ETP-5833 — the implicit grow column must be descriptive, never a fixed date/number.
  describe('withImplicitGrowColumn picks a descriptive column', () => {
    it('skips a leading date and grows the first string/selector', () => {
      const cols = [{ key: 'd', type: 'date' }, { key: 'n', type: 'string' }, { key: 'b', type: 'selector' }];
      assert.deepEqual(withImplicitGrowColumn(cols).map(c => !!c.grow), [false, true, false]);
    });
    it('falls back to the first unpinned column when none is descriptive', () => {
      const cols = [{ key: 'd', type: 'date' }, { key: 'a', type: 'amount' }];
      assert.deepEqual(withImplicitGrowColumn(cols).map(c => !!c.grow), [true, false]);
    });
  });

  describe('absorber rules (ETP-5833)', () => {
    // QA — Sales Invoice list: DocumentNo precedes the business partner and took the 320px grow.
    it('skips a document-number / search-key column (by AD column) for a descriptive one', () => {
      const cols = [
        { key: 'invoiceDate', column: 'DateInvoiced', type: 'date' },
        { key: 'documentNo', column: 'DocumentNo', type: 'string' },
        { key: 'businessPartner', column: 'C_BPartner_ID', type: 'string' },
      ];
      assert.deepEqual(withImplicitGrowColumn(cols).map(c => !!c.grow), [false, false, true]);
      const byValue = [{ key: 'searchKey', column: 'value', type: 'string' }, { key: 'name', column: 'Name', type: 'string' }];
      assert.deepEqual(withImplicitGrowColumn(byValue).map(c => !!c.grow), [false, true]);
    });

    it('a code column still absorbs when it is the only descriptive one (before a date)', () => {
      const cols = [{ key: 'd', type: 'date' }, { key: 'documentNo', column: 'DocumentNo', type: 'string' }];
      assert.deepEqual(withImplicitGrowColumn(cols).map(c => !!c.grow), [false, true]);
    });

    it('the lines absorber skips a code column too', () => {
      const cols = [
        { key: 'value', column: 'Value', type: 'string', grow: false },
        { key: 'name', column: 'Name', type: 'text' },
      ];
      // `text` already grows on its own; with fixed types only, the lines absorber must not pick the code.
      const fixed = [{ key: 'a', type: 'amount' }, { key: 'value', column: 'Value', type: 'selector', grow: false }, { key: 'n', type: 'selector', grow: false }];
      assert.equal(withLinesAbsorberColumn(cols), cols);
      assert.deepEqual(withLinesAbsorberColumn(fixed).map(c => !!c.grow), [false, false, true]);
    });

    it('never picks a display:tag pill as the absorber', () => {
      const cols = [{ key: 'u', type: 'selector', display: 'tag' }, { key: 's', type: 'string' }];
      assert.deepEqual(withImplicitGrowColumn(cols).map(c => !!c.grow), [false, true]);
    });

    it('lines grid with no growing column (amount + two dates, Product > Costo) gets exactly one absorber', () => {
      const cols = [{ key: 'cost', type: 'amount' }, { key: 'a', type: 'date' }, { key: 'b', type: 'date' }];
      const out = withLinesAbsorberColumn(cols);
      assert.equal(out.filter((c, i) => columnFlex(c, i).startsWith('1')).length, 1);
    });

    it('lines grid that already grows is returned unchanged (same reference)', () => {
      const cols = [{ key: 'p', type: 'selector' }, { key: 'd', type: 'date' }];
      assert.equal(withLinesAbsorberColumn(cols), cols);
    });

    it('lines absorber prefers a descriptive column over a fixed one', () => {
      const cols = [{ key: 'd', type: 'date' }, { key: 'e', type: 'enum' }, { key: 'n', type: 'selector' }];
      assert.deepEqual(withLinesAbsorberColumn(cols).map(c => !!c.grow), [false, false, true]);
    });
  });
});
