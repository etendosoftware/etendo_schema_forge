/**
 * DataTable — percent column header wrapping + list width (ETP-5545 follow-up).
 *
 * `percent` columns wrap their header label (`wrapHeader = col.headerWrap ?? type === 'percent'`)
 * and use the real `columnMinWidthPx` (104px list basis). `@/lib/linesColumnWidth.js` is NOT
 * mocked here on purpose, so the 104px width is verified end to end.
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
    render(<DataTable columns={[PCT]} data={DATA} />);

    const widths = [...document.querySelectorAll('colgroup col')].map((c) => c.style.width);
    expect(widths).toContain('104px');
    expect(screen.getByTestId('column-header-pct').style.width).toBe('104px');
    expect(screen.getByTestId('row-r1').querySelectorAll('td')[1].style.minWidth).toBe('104px');
  });

  it('an explicit minWidth wins over the percent default', () => {
    render(<DataTable columns={[{ ...PCT, minWidth: 200 }]} data={DATA} />);

    const widths = [...document.querySelectorAll('colgroup col')].map((c) => c.style.width);
    expect(widths).toContain('200px');
    expect(widths).not.toContain('104px');
    expect(screen.getByTestId('column-header-pct').style.width).toBe('200px');
    expect(screen.getByTestId('row-r1').querySelectorAll('td')[1].style.minWidth).toBe('200px');
  });
});
