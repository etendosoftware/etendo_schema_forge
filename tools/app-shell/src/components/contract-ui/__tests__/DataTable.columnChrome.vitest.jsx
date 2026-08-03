/**
 * DataTable — opt-in per-column chrome (`col.headClass` / `col.cellClass`), ETP-4658 Fase 0.
 *
 * List windows whose design pins column widths (financial-account's Figma layout aligns the
 * "Cuenta" header with the row avatar) could not express that through `columns` before. Both
 * classes are additive and optional: absent means the auto layout every existing window
 * relies on stays byte-identical, which the "no chrome" cases below lock in by comparing the
 * emitted class string against the chromeless baseline.
 *
 * Note on indices: DataTable always emits a leading gutter/selection cell, so the column
 * under test is cell index 1 in both the header row and the body row.
 */
import { render, screen } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocale: () => ({ genericLabels: {}, statuses: {} }),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('@/lib/buildUrlWithParams.js', () => ({ buildUrlWithParams: (url) => url }));
vi.mock('@/lib/selectorCatalog.js', () => ({ getCatalogOptions: () => [] }));
vi.mock('@/lib/statusBadge.js', () => ({
  getStatusDotColor: () => 'dot',
  getStatusTone: () => 'neutral',
  statusLabel: (raw) => `lbl-${raw}`,
}));
vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (row, key) => row?.[key] ?? '',
}));
vi.mock('@/lib/resolveColumnLabel.js', () => ({
  resolveColumnLabel: (col) => col.label ?? col.key,
}));
vi.mock('@/lib/formatAmount.js', () => ({
  formatAmount: (val) => (val != null ? String(val) : ''),
}));
vi.mock('@/lib/applyCalloutUpdates.js', () => ({
  applyCalloutUpdates: (prev, updates) => ({ ...prev, ...updates }),
}));
vi.mock('@/lib/linesColumnWidth.js', () => ({
  columnFlex: () => '1 0 100px',
  columnMinWidthPx: () => 100,
}));
vi.mock('../ProductSearchDrawer.jsx', () => ({ default: () => null }));
vi.mock('../ProductStockSearchDrawer.jsx', () => ({ default: () => null }));
vi.mock('../SelectorInput.jsx', () => ({ SelectorInput: () => null }));
vi.mock('../InlineSearchCombo.jsx', () => ({ InlineSearchCombo: () => null }));
vi.mock('../RowQuickActions.jsx', () => ({ default: () => null }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { DataTable } from '../DataTable.jsx';

const DATA = [{ id: 'r1', name: 'BBVA', total: 10 }];

/**
 * Renders a single-column table and returns the emitted class strings for that column's
 * header and body cell. Unmounts so successive calls in one test stay isolated.
 */
function classesFor(col) {
  const { unmount } = render(<DataTable columns={[col]} data={DATA} />);
  const th = document.querySelectorAll('thead th')[1].className;
  const td = screen.getByTestId('row-r1').querySelectorAll('td')[1].className;
  unmount();
  return { th, td };
}

const STRING_COL = { key: 'name', label: 'Name', type: 'string' };
const AMOUNT_COL = { key: 'total', label: 'Total', type: 'amount' };

describe('DataTable — col.headClass', () => {
  it('appends headClass to the column header cell', () => {
    const { th } = classesFor({ ...STRING_COL, headClass: 'w-[480px] pl-[84px]' });

    expect(th).toContain('w-[480px]');
    expect(th).toContain('pl-[84px]');
  });

  it('appends it — the base header classes survive', () => {
    const { th } = classesFor({ ...STRING_COL, headClass: 'sf-head-chrome' });
    const baseline = classesFor(STRING_COL).th;

    expect(th).toBe(`${baseline} sf-head-chrome`);
  });

  it('composes headClass with the numeric right-alignment instead of replacing it', () => {
    const { th } = classesFor({ ...AMOUNT_COL, headClass: 'w-[200px]' });

    expect(th).toContain('text-right');
    expect(th).toContain('w-[200px]');
  });

  it('leaves the header class list untouched when no headClass is given', () => {
    const withEmpty = classesFor({ ...STRING_COL, headClass: '' }).th;
    const withUndefined = classesFor(STRING_COL).th;

    expect(withEmpty).toBe(withUndefined);
    expect(withUndefined).toContain('align-middle');
  });
});

describe('DataTable — col.cellClass', () => {
  it('appends cellClass to the body cell', () => {
    const { td } = classesFor({ ...STRING_COL, cellClass: 'w-[480px]' });

    expect(td).toContain('w-[480px]');
  });

  it('appends it — the base body classes survive', () => {
    const { td } = classesFor({ ...STRING_COL, cellClass: 'sf-cell-chrome' });
    const baseline = classesFor(STRING_COL).td;

    expect(td).toBe(`${baseline} sf-cell-chrome`);
  });

  it('composes cellClass with the numeric right-alignment instead of replacing it', () => {
    const { td } = classesFor({ ...AMOUNT_COL, cellClass: 'w-[200px]' });

    expect(td).toContain('tabular-nums');
    expect(td).toContain('text-right');
    expect(td).toContain('w-[200px]');
  });

  it('leaves the body class list untouched when no cellClass is given', () => {
    const withEmpty = classesFor({ ...STRING_COL, cellClass: '' }).td;
    const withUndefined = classesFor(STRING_COL).td;

    expect(withEmpty).toBe(withUndefined);
    expect(withUndefined).toContain('text-sm');
  });

  it('is independent of headClass on the same column', () => {
    const { th, td } = classesFor({ ...STRING_COL, headClass: 'sf-head-only' });

    expect(th).toContain('sf-head-only');
    expect(td).not.toContain('sf-head-only');
  });
});

describe('DataTable — per-column isolation', () => {
  it('applies each column\'s chrome only to that column', () => {
    render(
      <DataTable
        columns={[
          { key: 'name', label: 'Name', type: 'string', headClass: 'sf-head-a', cellClass: 'sf-cell-a' },
          { key: 'total', label: 'Total', type: 'string', headClass: 'sf-head-b', cellClass: 'sf-cell-b' },
        ]}
        data={DATA}
      />,
    );

    const [, nameTh, totalTh] = document.querySelectorAll('thead th');
    expect(nameTh.className).toContain('sf-head-a');
    expect(nameTh.className).not.toContain('sf-head-b');
    expect(totalTh.className).toContain('sf-head-b');

    const [, nameTd, totalTd] = screen.getByTestId('row-r1').querySelectorAll('td');
    expect(nameTd.className).toContain('sf-cell-a');
    expect(nameTd.className).not.toContain('sf-cell-b');
    expect(totalTd.className).toContain('sf-cell-b');
  });

  it('wraps a custom col.render body inside the styled cell', () => {
    render(
      <DataTable
        columns={[{
          ...STRING_COL,
          cellClass: 'sf-cell-custom',
          render: (row) => <span data-testid={`custom-${row.id}`}>{row.name}</span>,
        }]}
        data={DATA}
      />,
    );

    const td = screen.getByTestId('row-r1').querySelectorAll('td')[1];
    expect(td.className).toContain('sf-cell-custom');
    expect(td).toContainElement(screen.getByTestId('custom-r1'));
  });
});
