// @covers tools/app-shell/src/components/contract-ui/DataTable.jsx
/**
 * DataTable — percent column header wrapping + list width (ETP-5545 follow-up).
 *
 * `percent` columns wrap their header label (`wrapHeader = col.headerWrap ?? type === 'percent'`)
 * and use the real `columnMinWidthPx` (104px list basis). `@/lib/linesColumnWidth.js` is NOT
 * mocked here on purpose, so the 104px width is verified end to end.
 */
import { render, screen } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  // AD label lookup (`t(col.column)`): one long Spanish AD label, to prove the list header floor
  // is measured from the label the header RESOLVES at render time, not from `col.label`.
  useLabel: () => (key) => (key === 'DateInvoiced' ? 'Fecha de la factura rectificativa' : key),
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
  resolveColumnLabel: (col, _locale, t) => col.label ?? (col.column ? t(col.column) : undefined) ?? col.key,
}));
vi.mock('@/lib/formatAmount.js', () => ({
  formatAmount: (val) => (val != null ? String(val) : ''),
}));
vi.mock('@/lib/applyCalloutUpdates.js', () => ({
  applyCalloutUpdates: (prev, updates) => ({ ...prev, ...updates }),
}));
vi.mock('../ProductSearchDrawer.jsx', () => ({ default: () => null }));
vi.mock('../ProductStockSearchDrawer.jsx', () => ({ default: () => null }));
vi.mock('../SelectorInput.jsx', () => ({ SelectorInput: () => null }));
vi.mock('../InlineSearchCombo.jsx', () => ({ InlineSearchCombo: () => null }));
vi.mock('../RowQuickActions.jsx', () => ({ default: () => null }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { DataTable } from '../DataTable.jsx';

const DATA = [{ id: 'r1', name: 'BBVA', pct: 50 }];
const PCT = { key: 'pct', label: 'Percent paid', type: 'percent' };
const STR = { key: 'name', label: 'Name', type: 'string' };

function renderHeader(col, props = {}) {
  render(<DataTable columns={[col]} data={DATA} {...props} />);
  const th = screen.getByTestId(`column-header-${col.key}`);
  const label = th.querySelector('span[title]');
  return { th, label };
}

describe('DataTable — percent header wrapping', () => {
  it('sortable path: th, button and label wrap', () => {
    const { th, label } = renderHeader(PCT, { onSort: vi.fn() });
    const button = th.querySelector('button');

    expect(button).toBeTruthy();
    expect(th.className).toContain('whitespace-normal');
    expect(button.className).toContain('whitespace-normal');
    expect(label.className).toContain('max-w-[80px]');
    expect(label.className).toContain('whitespace-normal');
    expect(label.className).toContain('break-words');
    expect(label.className).toContain('text-left');
    expect(label.className).not.toContain('text-right');
    expect(label.className).not.toContain('truncate');
    expect(th.querySelector('span.truncate')).toBeNull();
  });

  it('non-sortable path: th, span wrapper and label wrap', () => {
    const { th, label } = renderHeader(PCT);

    expect(th.querySelector('button')).toBeNull();
    const wrapper = label.parentElement.parentElement;
    expect(wrapper.tagName).toBe('SPAN');
    expect(wrapper.className).toContain('whitespace-normal');
    expect(th.className).toContain('whitespace-normal');
    expect(label.className).toContain('max-w-[80px]');
    expect(label.className).toContain('break-words');
    expect(label.className).not.toContain('truncate');
  });

  it('headerWrap:false on a percent column keeps the truncating label', () => {
    const { th, label } = renderHeader({ ...PCT, headerWrap: false });

    expect(th.className).not.toContain('whitespace-normal');
    expect(th.querySelector('span.truncate')).toBe(label);
    expect(label.className).not.toContain('max-w-[80px]');
  });

  it('headerWrap:true on a string column wraps', () => {
    const { th, label } = renderHeader({ ...STR, headerWrap: true }, { onSort: vi.fn() });

    expect(th.className).toContain('whitespace-normal');
    expect(th.querySelector('button').className).toContain('whitespace-normal');
    expect(label.className).toContain('max-w-[80px]');
    expect(label.className).not.toContain('truncate');
  });

  it('a default string column is unchanged (truncate, no wrap)', () => {
    const { th, label } = renderHeader(STR, { onSort: vi.fn() });

    expect(th.className).not.toContain('whitespace-normal');
    expect(th.querySelector('button').className).not.toContain('whitespace-normal');
    expect(label.className).toBe('min-w-0 truncate');
  });
});

describe('DataTable — percent column alignment (left) vs numeric (right)', () => {
  const arrow = (th) => [...th.querySelectorAll('span')].find((s) => /[▲▼]/.test(s.textContent));

  it('percent: th, sort button and non-sortable span are forced left', () => {
    const sortable = renderHeader(PCT, { onSort: vi.fn() });
    expect(sortable.th.className).toContain('!text-left');
    expect(sortable.th.querySelector('button').className).toContain('!text-left');
    document.body.innerHTML = '';
    const plain = renderHeader(PCT);
    expect(plain.th.className).toContain('!text-left');
    expect(plain.label.parentElement.parentElement.className).toContain('!text-left');
  });

  it('percent: sort arrow uses the non-numeric placement', () => {
    const { th } = renderHeader(PCT, { onSort: vi.fn(), sortColumn: 'pct', sortDirection: 'asc' });
    const a = arrow(th);
    expect(a.className).toContain('right-0 translate-x-full pl-0.5');
    expect(a.className).not.toContain('-translate-x-full');
  });

  it('percent: body td is text-left, not text-right', () => {
    render(<DataTable columns={[PCT]} data={DATA} />);
    const td = screen.getByTestId('cell-r1-pct');
    expect(td.className).toContain('text-left');
    expect(td.className).not.toContain('text-right');
  });

  it.each(['amount', 'number'])('%s keeps right alignment and numeric arrow placement', (type) => {
    const col = { key: 'val', label: 'Val', type };
    const data = [{ id: 'r1', val: 5 }];
    render(<DataTable columns={[col]} data={data} onSort={vi.fn()} sortColumn="val" sortDirection="desc" />);
    const th = screen.getByTestId('column-header-val');
    expect(th.className).toContain('text-right');
    expect(th.className).not.toContain('!text-left');
    expect(th.querySelector('button').className).not.toContain('!text-left');
    const a = arrow(th);
    expect(a.className).toContain('left-0 -translate-x-full pr-0.5');
    const td = screen.getByTestId('cell-r1-val');
    expect(td.className).toContain('text-right');
    expect(td.className).toContain('tabular-nums');
  });
});

describe('DataTable — percent column list width', () => {
  it('uses 104px for the colgroup <col>, header th and body td', () => {
    // ETP-5510 — STR (first, non-pinned) becomes the implicit grow column; PCT keeps its basis.
    render(<DataTable columns={[STR, PCT]} data={DATA} />);

    const widths = [...document.querySelectorAll('colgroup col')].map((c) => c.style.width);
    expect(widths).toContain('104px');
    expect(screen.getByTestId('column-header-pct').style.width).toBe('104px');
    expect(screen.getByTestId('row-r1').querySelectorAll('td')[2].style.minWidth).toBe('104px');
  });

  it('an explicit minWidth wins over the percent default', () => {
    render(<DataTable columns={[STR, { ...PCT, minWidth: 200 }]} data={DATA} />);

    const widths = [...document.querySelectorAll('colgroup col')].map((c) => c.style.width);
    expect(widths).toContain('200px');
    expect(widths).not.toContain('104px');
    expect(screen.getByTestId('column-header-pct').style.width).toBe('200px');
    expect(screen.getByTestId('row-r1').querySelectorAll('td')[2].style.minWidth).toBe('200px');
  });
});

// ETP-5510 — the real (unmocked) width helpers, end to end through a plain list.
describe('DataTable — plain list implicit grow column and min-width', () => {
  const AMOUNT = { key: 'total', label: 'Total', type: 'amount' };

  it('leaves the first non-pinned column width-less, keeps the checkbox <col> at 40px and sets the table min-width', () => {
    render(<DataTable columns={[STR, AMOUNT]} data={[{ id: 'r1', name: 'BBVA', total: 5 }]} selectable />);

    const widths = [...document.querySelectorAll('colgroup col')].slice(0, 3).map((c) => c.style.width);
    // checkbox | grow (no width) | amount (130px list basis, ETP-5833 QA; lines keep 172)
    expect(widths).toEqual(['40px', '', '130px']);

    // grow floor 320 + amount 130 + 40px selection slot
    const tables = [...document.querySelectorAll('table')];
    expect(tables.length).toBeGreaterThan(0);
    for (const t of tables) expect(t.style.minWidth).toBe('490px');
  });
});

// ETP-5833 (QA) — a list header never wraps, so no header may be truncated: each column's floor is
// max(type basis, rendered header). jsdom has no canvas, so the deterministic 7px/char estimate
// applies; chrome = 42px (padding 24 + reserved sort arrow 14 + slack 4).
describe('DataTable — plain list header floor', () => {
  const DATE = { key: 'invoiceDate', column: 'DateInvoiced', type: 'date' }; // label from AD: 33 chars
  const TOTAL = { key: 'total', label: 'Importe total pendiente', type: 'amount' }; // 23 chars
  const ROWS = [{ id: 'r1', name: 'BBVA', invoiceDate: '2026-10-20', total: 5 }];
  const DATE_PX = 33 * 7 + 42; // 273 > 176 date basis
  const TOTAL_PX = 23 * 7 + 42; // 203 > 130 amount list basis

  function widthsOf() {
    return {
      th: [DATE, TOTAL].map(c => screen.getByTestId(`column-header-${c.key}`).style.width),
      td: [DATE, TOTAL].map(c => screen.getByTestId(`cell-r1-${c.key}`).style.minWidth),
      tables: [...document.querySelectorAll('table')].map(t => t.style.minWidth),
    };
  }

  it('header, body cells and table min-width all use the resolved (AD) label width', () => {
    render(<DataTable columns={[STR, DATE, TOTAL]} data={ROWS} onSort={vi.fn()} />);
    expect(screen.getByTestId('column-header-invoiceDate')).toHaveTextContent('Fecha de la factura rectificativa');
    const w = widthsOf();
    expect(w.th).toEqual([`${DATE_PX}px`, `${TOTAL_PX}px`]);
    expect(w.td).toEqual([`${DATE_PX}px`, `${TOTAL_PX}px`]);
    // grow floor 320 + both header floors + the 40px row quick-actions slot
    expect(new Set(w.tables)).toEqual(new Set([`${320 + DATE_PX + TOTAL_PX + 40}px`]));
  });

  it('a short label keeps the type basis', () => {
    render(<DataTable columns={[STR, { key: 'd', label: 'Fecha', type: 'date' }]} data={ROWS} />);
    expect(screen.getByTestId('column-header-d').style.width).toBe('176px');
  });

  it('sorting does not move a column (the floor depends on the label, not on the sort state)', () => {
    const { rerender } = render(<DataTable columns={[STR, DATE, TOTAL]} data={ROWS} onSort={vi.fn()} />);
    const before = widthsOf();
    rerender(<DataTable columns={[STR, DATE, TOTAL]} data={[...ROWS].reverse()} onSort={vi.fn()} sortColumn="invoiceDate" sortDirection="desc" />);
    expect(widthsOf()).toEqual(before);
  });

  it('a headerWrap column opts out of the floor (its header wraps instead)', () => {
    render(<DataTable columns={[STR, { ...DATE, minWidth: 130, headerWrap: true }]} data={ROWS} />);
    expect(screen.getByTestId('column-header-invoiceDate').style.width).toBe('130px');
  });
});
