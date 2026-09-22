/**
 * ETP-5133 BUG-1 regression guard — pure-function coverage for
 * `growColumnWidth()`'s two branches, with no DOM/rendering involved at all
 * (see linesAddRowColumnAlignment.vitest.jsx and DataTable.etp4603Coverage.vitest.jsx
 * for why a DOM read-back of the `<col>` style is unreliable here: jsdom's
 * `cssstyle` cannot parse a `calc(...)` value and silently drops the entire
 * `style` attribute).
 *
 * `growColumnWidth()` is exported directly from DataTable.jsx, so this file
 * calls it and asserts on its literal return value instead — the simplest,
 * most robust coverage for this function, per that pair of files' own doc
 * comments recommending exactly this for "does the math itself work" cases.
 *
 * Two branches:
 *  - `measured` present with a finite `hostWidthPx` (BUG-1's actual fix,
 *    ETP-5133 pass 2 — see DataTable.jsx's own extensive doc comment on
 *    growColumnWidth): returns a literal "Npx" string — `basisPx +
 *    leftover-space share`, floored at `basisPx` (never negative extra space).
 *  - no `measured`/non-finite `hostWidthPx` (every existing standalone unit
 *    test, and any non-portaled/non-`inlineEditable` caller): returns the
 *    original bare `calc(...)` string, completely unchanged.
 */
import { growColumnWidth } from '../DataTable.jsx';

// Mock the heavy dependencies — same set DataTable.helpers.vitest.jsx /
// DataTable.linesColgroupChevron.vitest.jsx already proved sufficient to
// import DataTable.jsx's module graph cleanly.
vi.mock('react-dom', () => ({ createPortal: (c) => c }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/i18n', () => ({
  useLabel: () => () => '',
  useUI: () => (k) => k,
  useLocale: () => 'en_US',
  useMenuLabel: () => (k) => k,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));
vi.mock('@/lib/buildUrlWithParams.js', () => ({ buildUrlWithParams: (u) => u }));
vi.mock('@/lib/selectorCatalog.js', () => ({
  getCatalogOptions: (catalogs, entity, field) => catalogs?.[field.key] || [],
}));
vi.mock('@/lib/statusBadge.js', () => ({
  getStatusDotColor: () => 'bg-gray-400',
  getStatusTone: () => 'neutral',
  statusLabel: (s) => s,
}));
vi.mock('@/lib/resolveIdentifier.js', () => ({ resolveIdentifier: (d, f) => d?.[f] }));
vi.mock('@/lib/resolveColumnLabel.js', () => ({ resolveColumnLabel: (c) => c.label }));
vi.mock('@/lib/formatAmount.js', () => ({ formatAmount: (v) => String(v) }));
vi.mock('@/lib/applyCalloutUpdates.js', () => ({ applyCalloutUpdates: vi.fn() }));
vi.mock('@/lib/linesColumnWidth.js', () => ({
  columnMinWidthPx: () => 100,
  columnFlex: () => '1 0 100px',
  isLineGridColumn: (col) => col?.type !== 'dimensionsPanel',
}));

describe('growColumnWidth()', () => {
  it('returns undefined when there are no growing columns', () => {
    expect(growColumnWidth(192, 864, 0)).toBeUndefined();
    expect(growColumnWidth(192, 864, 0, { hostWidthPx: 1754, growBasisTotalPx: 416 })).toBeUndefined();
  });

  describe('measured branch (BUG-1 fix — literal pixel width from a real scroll host)', () => {
    it('computes basis + an equal share of the positive leftover space', () => {
      // Real values verified against the live flex header, per DataTable.jsx's
      // own doc comment: product basis 192, description basis 224,
      // fixedTotalPx 864, growBasisTotalPx 416, hostWidthPx 1754 → leftover
      // 1754 - 864 - 416 = 474, split evenly between the two grow columns.
      const measured = { hostWidthPx: 1754, growBasisTotalPx: 416 };
      expect(growColumnWidth(192, 864, 2, measured)).toBe('429px'); // 192 + 474/2
      expect(growColumnWidth(224, 864, 2, measured)).toBe('461px'); // 224 + 474/2
    });

    it('floors at the bare basis when the leftover space is negative — the BUG-1 regression guard', () => {
      // hostWidthPx narrower than the fixed + grow-basis total: the host has
      // genuinely overflowed, so leftover is negative. The literal pixel
      // width must never drop below the column's own basis — anything less
      // is exactly BUG-1 (Product/Description collapsing toward 0px).
      const measured = { hostWidthPx: 654, growBasisTotalPx: 416 };
      // leftover = 654 - 864 - 416 = -626
      expect(growColumnWidth(192, 864, 2, measured)).toBe('192px');
      expect(growColumnWidth(224, 864, 2, measured)).toBe('224px');
    });

    it('floors at the bare basis when the leftover space is exactly zero', () => {
      const measured = { hostWidthPx: 1280, growBasisTotalPx: 416 };
      // leftover = 1280 - 864 - 416 = 0
      expect(growColumnWidth(192, 864, 2, measured)).toBe('192px');
    });

    it('defaults growBasisTotalPx to 0 when the caller omits it', () => {
      const measured = { hostWidthPx: 1000 };
      // leftover = 1000 - 800 - 0 = 200, single grow column takes it all.
      expect(growColumnWidth(150, 800, 1, measured)).toBe('350px');
    });

    it('rounds a fractional per-column share to the nearest pixel', () => {
      const measured = { hostWidthPx: 1000, growBasisTotalPx: 0 };
      // leftover = 1000 - 800 = 200, split three ways = 66.667px each — not a
      // whole number, so the result depends on growColumnWidth() rounding.
      expect(growColumnWidth(100, 800, 3, measured)).toBe('167px');
    });

    it('ignores a non-finite hostWidthPx and falls back to the calc()-string formula', () => {
      expect(growColumnWidth(192, 864, 2, { hostWidthPx: NaN, growBasisTotalPx: 416 }))
        .toBe(growColumnWidth(192, 864, 2));
      expect(growColumnWidth(192, 864, 2, { hostWidthPx: undefined, growBasisTotalPx: 416 }))
        .toBe(growColumnWidth(192, 864, 2));
    });
  });

  describe('unmeasured fallback (no live scroll host — every existing standalone caller)', () => {
    it('returns the original bare calc(...) string unchanged when measured is omitted', () => {
      expect(growColumnWidth(192, 864, 2))
        .toBe('calc((100% - 864px) / 2 + 192px)');
    });

    it('returns the same original formula when measured is explicitly null', () => {
      expect(growColumnWidth(224, 412, 1, null))
        .toBe('calc((100% - 412px) / 1 + 224px)');
    });

    it('never emits a literal pixel value on this path — always the calc() expression', () => {
      const result = growColumnWidth(80, 200, 3);
      expect(result).toMatch(/^calc\(/);
      expect(result).not.toMatch(/^\d+px$/);
    });
  });
});
