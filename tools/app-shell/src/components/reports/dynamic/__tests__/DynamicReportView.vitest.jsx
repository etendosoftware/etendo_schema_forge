// @covers tools/app-shell/src/components/reports/dynamic/useReportPanelCollapsed.js
// @covers tools/app-shell/src/components/reports/dynamic/DynamicReportView.jsx
// @covers tools/app-shell/src/components/reports/dynamic/DynamicReportPanel.jsx
// @covers tools/app-shell/src/components/reports/dynamic/DynamicReportTable.jsx
// @covers tools/app-shell/src/components/reports/dynamic/useReportDefaults.js
// @covers tools/app-shell/src/components/reports/dynamic/useAccountSplit.js
// @covers tools/app-shell/src/components/reports/dynamic/DynamicDrillPanel.jsx
// @covers tools/app-shell/src/components/reports/dynamic/DynamicResultPanel.jsx
// @covers tools/app-shell/src/components/reports/dynamic/DynamicReportBalance.jsx
// @covers tools/app-shell/src/components/reports/dynamic/reportTelemetry.js
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { clearSessionIdentity, setSessionIdentity } from '@/lib/sessionIdentity.js';

const apiFetchMock = vi.fn();
const trackMock = vi.fn();
vi.mock('@/lib/observability.js', () => ({ track: (...args) => trackMock(...args) }));
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => apiFetchMock }));
vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => (params ? `${key}:${Object.values(params).join(',')}` : key),
  useMenuLabel: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));
vi.mock('@/components/layout/PageMetaContext', () => ({ useSetPageMeta: vi.fn() }));
vi.mock('@/components/ui/date-field', () => ({
  DateField: ({ value, onChange, 'data-testid': testId }) => (
    <input data-testid={testId} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));
// The old viewer's multi picker: a stub that commits one contact when clicked.
vi.mock('@/pages/ReportViewerPage.jsx', () => ({
  PopupMultiSelector: ({ label, onChange, displayNames, displayValue, 'data-testid': testId }) => (
    <>
      <button type="button" data-testid={testId} onClick={() => onChange('B1', 'Acme', ['Acme'])}>{label}</button>
      {(displayNames ?? (displayValue ? displayValue.split(', ') : [])).map((n) => <span key={n} data-testid="PickerChip">{n}</span>)}
    </>
  ),
  buildReportFilename: (id, format) => `${id}.${format}`,
}));

import DynamicReportView from '../DynamicReportView.jsx';
import DynamicReportBalance from '../DynamicReportBalance.jsx';
import { useSetPageMeta } from '@/components/layout/PageMetaContext';
import { LEDGER_LINE_CAP } from '../drillDown.js';

const REPORT = {
  id: 'profit-loss',
  category: 'finance',
  title: { es_ES: 'Pérdidas y Ganancias' },
  sections: [{ id: 'periodo', label: { es_ES: 'Periodo' } }, { id: 'agrupacion', label: { es_ES: 'Agrupación' } }, { id: 'comparacion', label: { es_ES: 'Comparación' } }],
  parameters: [
    { name: 'orgId', type: 'search', selector: 'org', hidden: true, label: { es_ES: 'Organización' } },
    { name: 'dateFrom', type: 'date', label: { es_ES: 'Fecha de Inicio' } },
    { name: 'dateTo', type: 'date', label: { es_ES: 'Fecha de Fin' } },
    { name: 'compareTo', type: 'toggle' },
    { name: 'columns', type: 'string', hidden: true },
    { name: 'bPartnerId', type: 'search', selector: 'bpartner', label: { es_ES: 'Contacto' } },
    { name: 'productId', type: 'search', selector: 'product-all', label: { es_ES: 'Producto' } },
    { name: 'splitBy', type: 'string', hidden: true },
    { name: 'accountLevel', default: 'C', options: [{ value: 'E', label: { es_ES: 'Epígrafe' } }, { value: 'C', label: { es_ES: 'Cuenta' } }, { value: 'S', label: { es_ES: 'Subcuenta' } }] },
  ],
};
const JULY_YEARS = [
  { id: 'Y26', name: '2026 (GO)', startDate: '2026-07-01', endDate: '2027-06-30' },
  { id: 'Y25', name: '2025 (GO)', startDate: '2025-07-01', endDate: '2026-06-30' },
];
const TREE = [
  { node_id: 'E1', parentId: null, elementlevel: 'E', value: 'P.G.1', name: 'Ventas', amount: 1000, amount_ref: 800, sign: 'C' },
  { node_id: 'C1', parentId: 'E1', elementlevel: 'C', value: '70', name: 'Ventas de mercaderías', amount: 1000, amount_ref: 800, sign: 'C' },
  { node_id: 'S1', parentId: 'C1', elementlevel: 'S', value: '700', name: 'Ventas nacionales', amount: 1000, amount_ref: 800, sign: 'C' },
];
const TOTAL_PERIOD = [{ idx: 0, dateFrom: '2026-07-01', dateTo: '2026-11-03', partial: false }];
const withVariation = (rows) => rows.map((r) => ({ ...r, variationAmount: r.amount - r.amount_ref, variationPct: 25, trend: 'improves' }));

const json = (body, { ok = true, status = 200 } = {}) => ({ ok, status, json: () => Promise.resolve(body) });
let years;
let queryAnswer;
let entryAnswer;
let ledgerAnswer;
let splitAnswer;
// pg sends a SQL date as the server's local midnight in UTC: 15 September in Madrid.
const LEDGER = {
  kind: 'rows',
  rows: [
    { value: '700', dateacct: '2026-09-14T22:00:00.000Z', fact_acct_group_id: 'G1', groupbyname: 'Acme', amtacctdr: 0, amtacctcr: 1050 },
    { value: '700', dateacct: '2026-10-01T22:00:00.000Z', fact_acct_group_id: 'G2', groupbyname: 'Beta', amtacctdr: 50, amtacctcr: 0 },
  ],
  openingRows: [{ value: '700', openingtotal: -200 }],
};
const ENTRY = {
  kind: 'rows',
  rows: [
    { document_type: 'Factura', account_no: '430', account_name: 'Clientes', amtacctdr: 1050, amtacctcr: 0, doc_window: 'sales-invoice', doc_record_id: 'INV1', doc_query_key: '', doc_query_value: '' },
    { document_type: 'Factura', account_no: '700', account_name: 'Ventas nacionales', amtacctdr: 0, amtacctcr: 1050, doc_window: 'sales-invoice', doc_record_id: 'INV1', doc_query_key: '', doc_query_value: '' },
  ],
};
const queriesTo = (reportId) => apiFetchMock.mock.calls.filter(([url]) => url === `/api/reports/${reportId}/query`).map(([, init]) => JSON.parse(init.body).params);
const queries = () => queriesTo('profit-loss');

function route(url, init) {
  if (url.includes('/report-selectors/acctschema')) return Promise.resolve(json({ items: [{ id: 'S1', name: 'Schema' }] }));
  if (url.includes('/report-selectors/bpartner')) {
    const all = [{ id: 'BP1', name: 'Acme' }, { id: 'BP2', name: 'Beta' }, { id: 'BP3', name: 'Smith, John' }, { id: 'BP4', name: 'A, B' }, { id: 'BP5', name: 'Acme, S.L.' }];
    const ids = new URL(url, 'http://x').searchParams.get('ids');
    // `ids` answers exactly those rows (as the servlet does); without it, the usual search page.
    return Promise.resolve(json({ items: ids === null ? all.slice(0, 2) : all.filter((b) => ids.split(',').includes(b.id)) }));
  }
  if (url.includes('/report-selectors/year')) return Promise.resolve(json({ items: years }));
  if (url.endsWith('/render')) return Promise.resolve({ ok: true, status: 200, blob: () => Promise.resolve(new Blob(['x'])) });
  if (url.endsWith('/report-general-ledger/query')) return Promise.resolve(json(ledgerAnswer(JSON.parse(init.body))));
  if (url.endsWith('/report-journal-entries/query')) return Promise.resolve(json(entryAnswer));
  if (url.endsWith('/query')) {
    const { params } = JSON.parse(init.body);
    // As the split SQL answers it: a part with no dimension has name '' (COALESCE), not null.
    if (params.splitBy && splitAnswer) return Promise.resolve(splitAnswer(params));
    if (params.splitBy) return Promise.resolve(json({ kind: 'split', periods: TOTAL_PERIOD, rows: [{ node_id: 'O1', name: 'Spain', amount: 600, amount_ref: 0 }, { node_id: null, name: '', amount: 400, amount_ref: 0 }] }));
    return Promise.resolve(queryAnswer(params));
  }
  return Promise.reject(new Error(`unexpected ${url}`));
}

const FULL_ACCESS = { 'profit-loss': 'full', 'report-general-ledger': 'full', 'report-journal-entries': 'full' };
const TWO_ORGS = [{ id: 'O1', name: 'Spain' }, { id: 'O2', name: 'USA' }];
const renderView = (props = {}) => render(<DynamicReportView report={REPORT} onBack={vi.fn()} selectedOrgId="O1" reportAccess={FULL_ACCESS} {...props} />);
const rowIds = () => screen.queryAllByTestId('DynamicReportTable__row').map((r) => r.dataset.nodeId);

beforeEach(() => {
  window.history.replaceState(null, '', '/'); // the view writes its selections to the URL: start every test clean
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 3, 12));
  years = JULY_YEARS;
  entryAnswer = ENTRY;
  ledgerAnswer = () => LEDGER;
  splitAnswer = null;
  queryAnswer = (params) => json({ kind: 'tree', periods: TOTAL_PERIOD, rows: withVariation(TREE) });
  apiFetchMock.mockReset();
  trackMock.mockReset();
  apiFetchMock.mockImplementation(route);
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:x');
  globalThis.URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.useRealTimers());

// The first breadcrumb level names the report's own category (Tesorería for the aging reports),
// Finance when the contract has none. The category → label mapping itself is unit-tested in
// components/reports/__tests__/reportCategories.vitest.js.
describe('DynamicReportView — breadcrumb', () => {
  const lastBreadcrumb = () => useSetPageMeta.mock.calls.map(([meta]) => meta).filter((m) => m?.breadcrumb).at(-1).breadcrumb;

  beforeEach(() => useSetPageMeta.mockClear());

  it.each([
    ['treasury', 'Treasury', '/report-viewer?category=treasury'],
    ['finance', 'Finance', '/report-viewer?category=finance'],
    [undefined, 'Finance', '/report-viewer?category=finance'],
    ['no-such-category', 'Finance', '/report-viewer?category=no-such-category'],
  ])('category %j: first level %s, Reports links to %s', async (category, label, href) => {
    renderView({ report: { ...REPORT, category } });
    await waitFor(() => expect(queries()).toHaveLength(1));
    expect(lastBreadcrumb()).toEqual([
      { label },
      { label: 'Reports', href },
      { label: 'Pérdidas y Ganancias' },
    ]);
  });
});

describe('DynamicReportView — opening (§19)', () => {
  it('opens on the fiscal year that contains today, with the schema and org, and never sends a year', async () => {
    renderView();
    await waitFor(() => expect(queries()).toHaveLength(1));
    const [params] = queries();
    expect(params).toMatchObject({ acctSchemaId: 'S1', orgId: 'O1', dateFrom: '2026-07-01', dateTo: '2026-11-03', columns: 'total' });
    expect(params).not.toHaveProperty('compareTo');
    expect(params).not.toHaveProperty('yearId');
    expect(params).not.toHaveProperty('referenceYearId');
    expect(screen.getByTestId('DynamicReportPanel__shortcut-year')).toHaveAttribute('aria-pressed', 'true');
    expect(apiFetchMock.mock.calls.find(([u]) => u.includes('/year'))[0]).toContain('selectedOrgId=O1');
  });

  it('no fiscal year for today: 1 January to today, with the hint', async () => {
    years = [];
    renderView();
    await waitFor(() => expect(queries()).toHaveLength(1));
    expect(queries()[0]).toMatchObject({ dateFrom: '2026-01-01', dateTo: '2026-11-03' });
    expect(screen.getByTestId('DynamicReportPanel__noFiscalYear')).toBeInTheDocument();
  });

  it('the first request waits for the defaults', async () => {
    let releaseYears;
    apiFetchMock.mockImplementation((url, init) => (url.includes('/year')
      ? new Promise((res) => { releaseYears = () => res(json({ items: years })); })
      : route(url, init)));
    renderView();
    await new Promise((r) => setTimeout(r, 400)); // longer than the query debounce
    expect(queries()).toHaveLength(0);
    releaseYears();
    await waitFor(() => expect(queries()).toHaveLength(1));
    expect(queries()[0].dateFrom).toBe('2026-07-01');
  });

  it('no accounting schema for the role: says there is nothing to show, sends no query', async () => {
    apiFetchMock.mockImplementation((url, init) => (url.includes('/acctschema') ? Promise.resolve(json({ items: [] })) : route(url, init)));
    renderView();
    expect(await screen.findByTestId('DynamicReportView__empty')).toBeInTheDocument();
    expect(queries()).toHaveLength(0);
  });

  it('a past year picked by hand gives its whole range', async () => {
    renderView();
    await waitFor(() => expect(queries()).toHaveLength(1));
    fireEvent.change(screen.getByTestId('DynamicReportPanel__year'), { target: { value: 'Y25' } });
    await waitFor(() => expect(queries().at(-1)).toMatchObject({ dateFrom: '2025-07-01', dateTo: '2026-06-30' }));
    // The selector keeps the year; a shortcut that leaves the year clears it.
    expect(screen.getByTestId('DynamicReportPanel__year')).toHaveValue('Y25');
    fireEvent.click(screen.getByTestId('DynamicReportPanel__shortcut-month'));
    await waitFor(() => expect(screen.getByTestId('DynamicReportPanel__year')).toHaveValue(''));
  });

  it('opens with the current fiscal year shown in the selector', async () => {
    renderView();
    await waitFor(() => expect(queries()).toHaveLength(1));
    expect(screen.getByTestId('DynamicReportPanel__year')).toHaveValue('Y26');
  });
});

describe('DynamicReportView — tree', () => {
  it('opens folded at the contract level (Account) and expands a row on click', async () => {
    renderView();
    await waitFor(() => expect(rowIds()).toEqual(['E1', 'C1']));
    fireEvent.click(within(screen.getAllByTestId('DynamicReportTable__row')[1]).getByTestId('DynamicReportTable__toggle'));
    expect(rowIds()).toEqual(['E1', 'C1', 'S1']);
  });

  it('level selector, expand all and collapse all', async () => {
    renderView();
    await waitFor(() => expect(rowIds()).toEqual(['E1', 'C1']));
    fireEvent.change(screen.getByTestId('DynamicReportPanel__level'), { target: { value: 'E' } });
    expect(rowIds()).toEqual(['E1']);
    fireEvent.click(screen.getByTestId('DynamicReportPanel__expandAll'));
    expect(rowIds()).toEqual(['E1', 'C1', 'S1']);
    fireEvent.click(screen.getByTestId('DynamicReportPanel__collapseAll'));
    expect(rowIds()).toEqual(['E1']);
  });

  it('rows a new filter brings in follow the level, not the earlier expansion', async () => {
    renderView();
    await waitFor(() => expect(rowIds()).toEqual(['E1', 'C1']));
    queryAnswer = () => json({ kind: 'tree', rows: [...TREE,
      { node_id: 'E2', parentId: null, elementlevel: 'E', value: 'P.G.2', name: 'Gastos', amount: 5, amount_ref: 0, sign: 'D' },
      { node_id: 'C2', parentId: 'E2', elementlevel: 'C', value: '62', name: 'Servicios', amount: 5, amount_ref: 0, sign: 'D' }] });
    fireEvent.click(screen.getByTestId('DynamicReportPanel__bPartnerId'));
    await waitFor(() => expect(rowIds()).toEqual(['E1', 'C1', 'E2', 'C2']));
  });

  it('folding does not send a new request', async () => {
    renderView();
    await waitFor(() => expect(rowIds()).toEqual(['E1', 'C1']));
    fireEvent.click(screen.getByTestId('DynamicReportPanel__expandAll'));
    await new Promise((r) => setTimeout(r, 400));
    expect(queries()).toHaveLength(1);
  });
});

describe('DynamicReportView — comparison and chips', () => {
  it('"same period last year" sends the reference dates and shows the variation columns, coloured by trend', async () => {
    renderView();
    await waitFor(() => expect(rowIds()).toHaveLength(2));
    fireEvent.change(screen.getByTestId('DynamicReportPanel__compare'), { target: { value: 'same-last-year' } });
    // The comparison is a display choice: no new request, and none carries the compared dates.
    expect(queries()).toHaveLength(1);
    expect(queries()[0]).not.toHaveProperty('compareTo');
    expect(queries()[0].periods).toContain('|2025-07-01..2025-11-03|');
    await waitFor(() => expect(screen.getAllByTestId('DynamicReportTable__variation')).toHaveLength(2));
    expect(screen.getAllByTestId('DynamicReportTable__variationPct')[0]).toHaveTextContent('25,00 %');
    expect(screen.getAllByTestId('DynamicReportTable__variation')[0].className).toContain('status-success');
    // Headline figures over the top-level line only (1000 now, 800 compared): income up is good news.
    expect(screen.getByTestId('DynamicReportKpis__incomeValue')).toHaveTextContent('1.000,00');
    expect(screen.getByTestId('DynamicReportKpis__incomeTrend').className).toContain('status-success');
    expect(screen.getByTestId('DynamicReportKpis__marginValue')).toHaveTextContent('100,00 %');
    // Each card names how it is computed, for the hover tooltip and screen readers.
    expect(screen.getByTestId('DynamicReportKpis__marginInfo')).toHaveAttribute('aria-label', expect.stringMatching(/\S/));
    expect(screen.getByTestId('DynamicReportView__chip-compare')).toBeInTheDocument();
  });

  it('a contact filter shows as a removable chip; removing it sends the query without it', async () => {
    renderView();
    await waitFor(() => expect(queries()).toHaveLength(1));
    fireEvent.click(screen.getByTestId('DynamicReportPanel__bPartnerId'));
    await waitFor(() => expect(queries().at(-1).bPartnerId).toBe('B1'));
    expect(screen.getByTestId('DynamicReportView__chip-bp')).toHaveTextContent('Acme');
    fireEvent.click(screen.getByTestId('DynamicReportView__chipRemove-bp'));
    await waitFor(() => expect(queries().at(-1).bPartnerId).toBe(''));
    expect(screen.queryByTestId('DynamicReportView__chip-bp')).not.toBeInTheDocument();
  });

  it('the org picker shows only when the role reaches more than one org (0 not counted)', async () => {
    const { unmount } = renderView({ roleOrgs: [{ id: '0', name: '*' }, { id: 'O1', name: 'Spain' }] });
    await waitFor(() => expect(queries()).toHaveLength(1));
    expect(screen.queryByTestId('DynamicReportPanel__org')).not.toBeInTheDocument();
    unmount();
    renderView({ roleOrgs: [{ id: 'O1', name: 'Spain' }, { id: 'O2', name: 'USA' }] });
    fireEvent.change(await screen.findByTestId('DynamicReportPanel__org'), { target: { value: 'O2' } });
    await waitFor(() => expect(queries().at(-1).orgId).toBe('O2'));
  });

  it('"Limpiar filtros" goes back to the opening period with no filters', async () => {
    renderView();
    await waitFor(() => expect(queries()).toHaveLength(1));
    fireEvent.click(screen.getByTestId('DynamicReportPanel__shortcut-month'));
    fireEvent.click(screen.getByTestId('DynamicReportPanel__bPartnerId'));
    await waitFor(() => expect(queries().at(-1)).toMatchObject({ dateFrom: '2026-11-01', bPartnerId: 'B1' }));
    fireEvent.click(screen.getByTestId('DynamicReportPanel__reset'));
    await waitFor(() => expect(queries().at(-1)).toMatchObject({ dateFrom: '2026-07-01', dateTo: '2026-11-03', bPartnerId: '' }));
  });
});

describe('DynamicReportView — split, errors and exports', () => {
  it('with dateFrom after dateTo the split toggle is not offered: no request, no parts', async () => {
    renderView({ roleOrgs: TWO_ORGS });
    await waitFor(() => expect(rowIds()).toEqual(['E1', 'C1']));
    fireEvent.click(screen.getByTestId('DynamicReportPanel__expandAll'));
    fireEvent.change(screen.getByTestId('DynamicReportPanel__splitBy'), { target: { value: 'org' } });
    await screen.findByTestId('DynamicReportTable__splitToggle');
    fireEvent.change(screen.getByTestId('DynamicReportPanel__dateFrom'), { target: { value: '2026-12-01' } });
    await new Promise((r) => setTimeout(r, 450));
    expect(screen.queryAllByTestId('DynamicReportTable__splitToggle')).toHaveLength(0);
    expect(queries().some((p) => p.splitNodeId)).toBe(false);
    expect(screen.queryAllByTestId('DynamicReportTable__splitRow')).toHaveLength(0);
  });

  it('with dateFrom after dateTo it says so and drops the previous period data', async () => {
    renderView();
    await waitFor(() => expect(rowIds()).toHaveLength(2));
    fireEvent.change(screen.getByTestId('DynamicReportPanel__dateFrom'), { target: { value: '2026-12-01' } });
    expect(await screen.findByTestId('DynamicReportView__error')).toHaveTextContent('dynamicReportErrorReversedDates');
    expect(rowIds()).toHaveLength(0);
    expect(JSON.stringify(trackMock.mock.calls)).not.toContain('invalid_periods'); // a client-side refusal is no server error class
    fireEvent.change(screen.getByTestId('DynamicReportPanel__dateFrom'), { target: { value: '2026-10-01' } });
    await waitFor(() => expect(screen.queryByTestId('DynamicReportView__error')).toBeNull());
  });

  it('with dateFrom after dateTo no /query is sent', async () => {
    renderView();
    await waitFor(() => expect(rowIds()).toHaveLength(2));
    const before = queries().length;
    fireEvent.change(screen.getByTestId('DynamicReportPanel__dateFrom'), { target: { value: '2026-12-01' } });
    await new Promise((r) => setTimeout(r, 450)); // longer than the debounce
    expect(queries()).toHaveLength(before);
    fireEvent.change(screen.getByTestId('DynamicReportPanel__dateFrom'), { target: { value: '2026-10-01' } });
    await waitFor(() => expect(queries()).toHaveLength(before + 1));
    expect(queries().at(-1)).toMatchObject({ dateFrom: '2026-10-01' });
  });
  it('with dateFrom after dateTo the exports are disabled', async () => {
    renderView();
    await waitFor(() => expect(rowIds()).toHaveLength(2));
    for (const f of ['pdf', 'xlsx', 'csv']) expect(screen.getByTestId(`DynamicReportView__export-${f}`)).toBeEnabled();
    fireEvent.change(screen.getByTestId('DynamicReportPanel__dateFrom'), { target: { value: '2026-12-01' } });
    for (const f of ['pdf', 'xlsx', 'csv']) expect(screen.getByTestId(`DynamicReportView__export-${f}`)).toBeDisabled();
  });

  it('with a split dimension, a leaf account lists its parts by that dimension', async () => {
    renderView({ roleOrgs: TWO_ORGS });
    await waitFor(() => expect(rowIds()).toEqual(['E1', 'C1']));
    fireEvent.click(screen.getByTestId('DynamicReportPanel__expandAll'));
    fireEvent.change(screen.getByTestId('DynamicReportPanel__splitBy'), { target: { value: 'org' } });
    fireEvent.click(await screen.findByTestId('DynamicReportTable__splitToggle'));
    const parts = await screen.findAllByTestId('DynamicReportTable__splitRow');
    expect(parts.map((p) => p.textContent)).toEqual(['Spain600,00', 'dynamicReportSplitNone400,00']);
    expect(queries().find((p) => p.splitBy)).toMatchObject({ splitBy: 'org', splitNodeId: 'S1', splitSign: 'C' });
  });

  it('org access denied shows the translated message and keeps the last tree', async () => {
    renderView({ roleOrgs: [{ id: 'O1', name: 'Spain' }, { id: 'O2', name: 'USA' }] });
    await waitFor(() => expect(rowIds()).toHaveLength(2));
    queryAnswer = () => json({ error: 'ORG_ACCESS_DENIED', code: 'ORG_ACCESS_DENIED' }, { ok: false, status: 403 });
    fireEvent.change(screen.getByTestId('DynamicReportPanel__org'), { target: { value: 'O2' } });
    expect(await screen.findByTestId('DynamicReportView__error')).toHaveTextContent('reportErrorOrgAccess');
    expect(rowIds()).toHaveLength(2);
  });

  it.each([
    ['PERIOD_RANGE_TOO_LONG', 'reportErrorPeriodRangeTooLong'],
    ['INVALID_PERIODS', 'reportErrorInvalidPeriods'],
  ])('maps %s to its translated message and keeps the last tree', async (code, key) => {
    renderView();
    await waitFor(() => expect(rowIds()).toHaveLength(2));
    queryAnswer = () => json({ error: code, code }, { ok: false, status: 400 });
    fireEvent.click(screen.getByTestId('DynamicReportPanel__shortcut-month'));
    expect(await screen.findByTestId('DynamicReportView__error')).toHaveTextContent(key);
    expect(rowIds()).toHaveLength(2);
  });

  it('PDF export renders what the screen shows: same filters, level and expanded rows', async () => {
    renderView({ roleOrgs: [{ id: 'O1', name: 'Spain' }] });
    await waitFor(() => expect(rowIds()).toEqual(['E1', 'C1']));
    fireEvent.click(screen.getByTestId('DynamicReportView__export-pdf'));
    await waitFor(() => expect(apiFetchMock.mock.calls.some(([u]) => u.endsWith('/render'))).toBe(true));
    const [, init] = apiFetchMock.mock.calls.find(([u]) => u.endsWith('/render'));
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ format: 'pdf', locale: 'es_ES' });
    expect(body.params).toMatchObject({ dateFrom: '2026-07-01', accountLevel: 'C', expandedNodeIds: 'E1' });
    // The exported header names the org, not its id.
    expect(body.params._display_orgId).toBe('Spain');
  });

  it('an export with no resolvable org name sends no org display and still downloads', async () => {
    renderView();
    await waitFor(() => expect(rowIds()).toEqual(['E1', 'C1']));
    fireEvent.click(screen.getByTestId('DynamicReportView__export-pdf'));
    await waitFor(() => expect(apiFetchMock.mock.calls.some(([u]) => u.endsWith('/render'))).toBe(true));
    const [, init] = apiFetchMock.mock.calls.find(([u]) => u.endsWith('/render'));
    expect(JSON.parse(init.body).params._display_orgId).toBeUndefined();
    await waitFor(() => expect(globalThis.URL.createObjectURL).toHaveBeenCalled());
  });

  it('a fully collapsed export sends "none", never the blank value core reads as not sent', async () => {
    renderView();
    await waitFor(() => expect(rowIds()).toEqual(['E1', 'C1']));
    fireEvent.click(screen.getByTestId('DynamicReportPanel__collapseAll'));
    fireEvent.click(screen.getByTestId('DynamicReportView__export-pdf'));
    await waitFor(() => expect(apiFetchMock.mock.calls.some(([u]) => u.endsWith('/render'))).toBe(true));
    const [, init] = apiFetchMock.mock.calls.find(([u]) => u.endsWith('/render'));
    expect(JSON.parse(init.body).params.expandedNodeIds).toBe('none');
    expect(globalThis.URL.createObjectURL).toHaveBeenCalled();
  });
});

describe('DynamicReportView — drill steps the role cannot open (ETP-6080)', () => {
  it('shows the account name as plain text without General Ledger access', async () => {
    renderView({ reportAccess: { 'profit-loss': 'full' } });
    fireEvent.click(await screen.findByTestId('DynamicReportPanel__expandAll'));
    await waitFor(() => expect(rowIds()).toContain('S1'));
    expect(screen.queryByTestId('DynamicReportTable__ledger')).toBeNull();
    expect(screen.getByText('700 - Ventas nacionales')).toBeInTheDocument();
  });

  it('opens the ledger but not the entry without Journal Entries access', async () => {
    renderView({ reportAccess: { 'profit-loss': 'full', 'report-general-ledger': 'read-only' } });
    fireEvent.click(await screen.findByTestId('DynamicReportPanel__expandAll'));
    fireEvent.click(await screen.findByTestId('DynamicReportTable__ledger'));
    expect(await screen.findAllByTestId('DynamicDrillPanel__ledgerRow')).toHaveLength(2);
    expect(screen.queryByTestId('DynamicDrillPanel__openEntry')).toBeNull();
  });

  it('shows a refused query as "no access to this report"', async () => {
    queryAnswer = () => json({ error: 'x', code: 'REPORT_ACCESS_DENIED' }, { ok: false, status: 403 });
    renderView();
    expect(await screen.findByTestId('DynamicReportView__error')).toHaveTextContent('reportErrorReportAccess');
  });

  it('shows a query past the statement timeout as the translated timeout message (ETP-6146)', async () => {
    queryAnswer = () => json({ error: 'REPORT_TIMEOUT', code: 'REPORT_TIMEOUT' }, { ok: false, status: 504 });
    renderView();
    expect(await screen.findByTestId('DynamicReportView__error')).toHaveTextContent('reportErrorTimeout');
  });
});

describe('DynamicReportView — drill-down (F9)', () => {
  const openLedger = async () => {
    renderView();
    await waitFor(() => expect(rowIds()).toEqual(['E1', 'C1']));
    fireEvent.click(screen.getByTestId('DynamicReportPanel__expandAll'));
    fireEvent.click(await screen.findByTestId('DynamicReportTable__ledger'));
    return screen.findByTestId('DynamicDrillPanel__ledger');
  };

  it('only a leaf account opens its ledger; a summary row only folds', async () => {
    renderView();
    await waitFor(() => expect(rowIds()).toEqual(['E1', 'C1']));
    expect(screen.queryByTestId('DynamicReportTable__ledger')).toBeNull();
    fireEvent.click(screen.getByTestId('DynamicReportPanel__expandAll'));
    expect(await screen.findAllByTestId('DynamicReportTable__ledger')).toHaveLength(1);
    expect(screen.getByTestId('DynamicReportTable__ledger')).toHaveTextContent('700 - Ventas nacionales');
  });

  it('the ledger reads the account code with the view period and filters, and sums it up', async () => {
    await openLedger();
    await waitFor(() => expect(queriesTo('report-general-ledger')).toHaveLength(1));
    expect(queriesTo('report-general-ledger')[0]).toEqual({
      acctSchemaId: 'S1', orgId: 'O1', dateFrom: '2026-07-01', dateTo: '2026-11-03', bPartnerId: '', productId: '',
      accountId: 'S1', fromAccountId: '700', toAccountId: '700',
    });
    expect(await screen.findByTestId('DynamicDrillPanel__opening')).toHaveTextContent('-200,00');
    expect(screen.getByTestId('DynamicDrillPanel__debit')).toHaveTextContent('50,00');
    expect(screen.getByTestId('DynamicDrillPanel__credit')).toHaveTextContent('1.050,00');
    expect(screen.getByTestId('DynamicDrillPanel__closing')).toHaveTextContent('-1.200,00');
    // Signed like the row (700 is a credit account): equals its 1.000,00 in the report.
    expect(screen.getByTestId('DynamicDrillPanel__movement')).toHaveTextContent('1.000,00');
    // The day the server meant, not the UTC day before.
    expect(screen.getAllByTestId('DynamicDrillPanel__openEntry').map((b) => b.textContent)).toEqual(['15/09/2026', '02/10/2026']);
    fireEvent.change(screen.getByTestId('DynamicDrillPanel__search'), { target: { value: 'beta' } });
    expect(screen.getAllByTestId('DynamicDrillPanel__ledgerRow')).toHaveLength(1);
  });

  it('a ledger line opens its whole entry, the source account highlighted, and its document', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    await openLedger();
    fireEvent.click((await screen.findAllByTestId('DynamicDrillPanel__openEntry'))[0]);
    await screen.findAllByTestId('DynamicDrillPanel__entryRow');
    expect(queriesTo('report-journal-entries')).toEqual([{ acctSchemaId: 'S1', orgId: 'O1', factAcctGroupId: 'G1' }]);
    expect(screen.getAllByTestId('DynamicDrillPanel__entryRow').map((r) => r.dataset.source ?? '')).toEqual(['', 'true']);
    expect(screen.getByTestId('DynamicDrillPanel__crumb-entry')).toHaveTextContent('dynamicReportEntry 15/09/2026');
    fireEvent.click(screen.getByTestId('DynamicDrillPanel__openDocument'));
    expect(open).toHaveBeenCalledWith(expect.stringMatching(/\/sales-invoice\/INV1$/), '_blank');
    fireEvent.click(screen.getByTestId('DynamicDrillPanel__crumb-account'));
    expect(await screen.findByTestId('DynamicDrillPanel__ledger')).toBeInTheDocument();
    open.mockRestore();
  });

  it('an entry whose table has no window ends the drill-down there and says so', async () => {
    entryAnswer = { kind: 'rows', rows: ENTRY.rows.map((r) => ({ ...r, doc_window: null, doc_record_id: null })) };
    await openLedger();
    fireEvent.click((await screen.findAllByTestId('DynamicDrillPanel__openEntry'))[0]);
    expect(await screen.findByTestId('DynamicDrillPanel__noDocument')).toBeInTheDocument();
    expect(screen.queryByTestId('DynamicDrillPanel__openDocument')).toBeNull();
  });

  it('caps the ledger, hides the sums a capped ledger would get wrong, and loads every line on request', async () => {
    const line = (i) => ({ ...LEDGER.rows[0], fact_acct_group_id: `G${i}` });
    ledgerAnswer = ({ limit }) => ({ ...LEDGER, rows: Array.from({ length: limit ?? LEDGER_LINE_CAP + 40 }, (_, i) => line(i)) });
    await openLedger();
    await waitFor(() => expect(screen.getAllByTestId('DynamicDrillPanel__ledgerRow')).toHaveLength(LEDGER_LINE_CAP));
    expect(JSON.parse(apiFetchMock.mock.calls.find(([u]) => u.endsWith('/report-general-ledger/query'))[1].body).limit).toBe(LEDGER_LINE_CAP + 1);
    expect(screen.getByTestId('DynamicDrillPanel__capped')).toBeInTheDocument();
    expect(screen.getByTestId('DynamicDrillPanel__opening')).toBeInTheDocument();
    expect(screen.queryByTestId('DynamicDrillPanel__debit')).toBeNull();
    expect(screen.queryByTestId('DynamicDrillPanel__movement')).toBeNull();

    fireEvent.click(screen.getByTestId('DynamicDrillPanel__loadAll'));
    await waitFor(() => expect(screen.getAllByTestId('DynamicDrillPanel__ledgerRow')).toHaveLength(LEDGER_LINE_CAP + 40));
    const calls = apiFetchMock.mock.calls.filter(([u]) => u.endsWith('/report-general-ledger/query'));
    expect(JSON.parse(calls.at(-1)[1].body).limit).toBeUndefined();
    expect(screen.queryByTestId('DynamicDrillPanel__capped')).toBeNull();
    expect(screen.getByTestId('DynamicDrillPanel__debit')).toBeInTheDocument();
  });

  const cappedLedger = () => {
    ledgerAnswer = ({ limit }) => ({ ...LEDGER, rows: Array.from({ length: limit ?? LEDGER_LINE_CAP + 40 }, (_, i) => ({ ...LEDGER.rows[0], fact_acct_group_id: `G${i}` })) });
  };
  const ledgerLimits = () => apiFetchMock.mock.calls.filter(([u]) => u.endsWith('/report-general-ledger/query')).map(([, init]) => JSON.parse(init.body).limit);

  it('the ledger stays full after opening an entry and coming back to the account', async () => {
    cappedLedger();
    await openLedger();
    await waitFor(() => expect(screen.getAllByTestId('DynamicDrillPanel__ledgerRow')).toHaveLength(LEDGER_LINE_CAP));
    fireEvent.click(screen.getByTestId('DynamicDrillPanel__loadAll'));
    await waitFor(() => expect(screen.getAllByTestId('DynamicDrillPanel__ledgerRow')).toHaveLength(LEDGER_LINE_CAP + 40));
    fireEvent.click(screen.getAllByTestId('DynamicDrillPanel__openEntry')[0]);
    await screen.findAllByTestId('DynamicDrillPanel__entryRow');
    fireEvent.click(screen.getByTestId('DynamicDrillPanel__crumb-account'));
    await waitFor(() => expect(screen.getAllByTestId('DynamicDrillPanel__ledgerRow')).toHaveLength(LEDGER_LINE_CAP + 40));
    expect(screen.queryByTestId('DynamicDrillPanel__capped')).toBeNull();
    expect(screen.getByTestId('DynamicDrillPanel__debit')).toBeInTheDocument();
    expect(ledgerLimits().at(-1)).toBeUndefined();
  });

  it('closing the panel and reopening the account caps the ledger again', async () => {
    cappedLedger();
    await openLedger();
    await waitFor(() => expect(screen.getAllByTestId('DynamicDrillPanel__ledgerRow')).toHaveLength(LEDGER_LINE_CAP));
    fireEvent.click(screen.getByTestId('DynamicDrillPanel__loadAll'));
    await waitFor(() => expect(screen.getAllByTestId('DynamicDrillPanel__ledgerRow')).toHaveLength(LEDGER_LINE_CAP + 40));
    fireEvent.click(screen.getByTestId('DynamicDrillPanel__crumb-report'));
    await waitFor(() => expect(screen.queryByTestId('DynamicDrillPanel')).toBeNull());
    fireEvent.click(screen.getByTestId('DynamicReportTable__ledger'));
    await waitFor(() => expect(screen.getAllByTestId('DynamicDrillPanel__ledgerRow')).toHaveLength(LEDGER_LINE_CAP));
    expect(ledgerLimits().at(-1)).toBe(LEDGER_LINE_CAP + 1);
    expect(screen.getByTestId('DynamicDrillPanel__capped')).toBeInTheDocument();
  });

  it('a ledger of exactly the cap is complete: no hint, every sum shown', async () => {
    ledgerAnswer = () => ({ ...LEDGER, rows: Array.from({ length: LEDGER_LINE_CAP }, (_, i) => ({ ...LEDGER.rows[0], fact_acct_group_id: `G${i}` })) });
    await openLedger();
    await waitFor(() => expect(screen.getAllByTestId('DynamicDrillPanel__ledgerRow')).toHaveLength(LEDGER_LINE_CAP));
    expect(screen.queryByTestId('DynamicDrillPanel__capped')).toBeNull();
    expect(screen.getByTestId('DynamicDrillPanel__movement')).toBeInTheDocument();
  });

  it('the report crumb closes the panel', async () => {
    await openLedger();
    fireEvent.click(screen.getByTestId('DynamicDrillPanel__crumb-report'));
    await waitFor(() => expect(screen.queryByTestId('DynamicDrillPanel')).toBeNull());
  });
});

describe('DynamicReportView — telemetry (F10, T9)', () => {
  const sent = (name) => trackMock.mock.calls.filter(([event]) => event === name).map(([, props]) => props);
  const settle = () => waitFor(() => expect(screen.queryByTestId('DynamicReportView__loading')).toBeNull());

  it('report_opened once per session, after the first result, with source and duration; the defaults are no filter', async () => {
    renderView({ source: 'menu' });
    await waitFor(() => expect(sent('report_opened')).toHaveLength(1));
    const [opened] = sent('report_opened');
    expect(opened).toMatchObject({ specName: 'profit-loss', source: 'menu', outcome: 'success' });
    expect(opened.reportSessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(opened.durationMs).toEqual(expect.any(Number));
    fireEvent.click(screen.getByTestId('DynamicReportPanel__bPartnerId'));
    await waitFor(() => expect(sent('report_filter_applied')).toHaveLength(1));
    expect(sent('report_opened')).toHaveLength(1);
  });

  it('attaches account_id from the session clientId, and omits it when empty (ETP-6230)', async () => {
    setSessionIdentity({ clientId: 'client-1' });
    renderView();
    await waitFor(() => expect(sent('report_opened')).toHaveLength(1));
    expect(sent('report_opened')[0].account_id).toBe('client-1');
    fireEvent.click(screen.getByTestId('DynamicReportPanel__bPartnerId'));
    await waitFor(() => expect(sent('report_filter_applied')).toHaveLength(1));
    expect(sent('report_filter_applied')[0].account_id).toBe('client-1');
    clearSessionIdentity();
    trackMock.mockReset();
    cleanup();
    renderView();
    await waitFor(() => expect(sent('report_opened')).toHaveLength(1));
    expect('account_id' in sent('report_opened')[0]).toBe(false);
  });

  it('a user change: one report_filter_applied once its result is in; "Limpiar filtros" none', async () => {
    renderView();
    await waitFor(() => expect(sent('report_opened')).toHaveLength(1));
    expect(sent('report_filter_applied')).toEqual([]);
    fireEvent.click(screen.getByTestId('DynamicReportPanel__bPartnerId'));
    await waitFor(() => expect(sent('report_filter_applied')).toHaveLength(1));
    const [applied] = sent('report_filter_applied');
    expect(applied).toMatchObject({ type: 'business_partner', outcome: 'success', reportSessionId: sent('report_opened')[0].reportSessionId });
    expect(applied.durationMs).toEqual(expect.any(Number));
    fireEvent.click(screen.getByTestId('DynamicReportPanel__reset'));
    await waitFor(() => expect(queries().at(-1).bPartnerId).toBe(''));
    await settle();
    expect(sent('report_filter_applied')).toHaveLength(1);
  });

  it('two request-producing changes inside the debounce: one request, and only the last change is reported', async () => {
    queryAnswer = periodAnswer;
    renderView();
    await waitFor(() => expect(sent('report_opened')).toHaveLength(1));
    expect(queries()).toHaveLength(1);
    fireEvent.click(screen.getByTestId('DynamicReportPanel__shortcut-month'));
    fireEvent.change(screen.getByTestId('DynamicReportPanel__columns'), { target: { value: 'month' } });
    await waitFor(() => expect(queries()).toHaveLength(2)); // the opening one and one for both changes
    await settle();
    await new Promise((r) => setTimeout(r, 450)); // longer than the debounce: no second request follows
    expect(queries()).toHaveLength(2);
    expect(queries().at(-1)).toMatchObject({ columns: 'month', dateFrom: '2026-11-01' });
    expect(sent('report_filter_applied').map((e) => e.type)).toEqual(['columns']);
  });

  it('a failed request reports the error class, never the message', async () => {
    renderView({ roleOrgs: [{ id: 'O1', name: 'Spain' }, { id: 'O2', name: 'USA' }] });
    await waitFor(() => expect(sent('report_opened')).toHaveLength(1));
    queryAnswer = () => json({ error: 'Access denied to org O2', code: 'ORG_ACCESS_DENIED' }, { ok: false, status: 403 });
    fireEvent.change(screen.getByTestId('DynamicReportPanel__org'), { target: { value: 'O2' } });
    await waitFor(() => expect(sent('report_filter_applied')).toHaveLength(1));
    expect(sent('report_filter_applied')[0]).toMatchObject({ type: 'organization', outcome: 'error', errorCode: 'org_access_denied' });
    expect(JSON.stringify(trackMock.mock.calls)).not.toContain('Access denied');
  });

  it('folding: expand / collapse / expand_all / collapse_all; the level is an account_level filter', async () => {
    renderView();
    await waitFor(() => expect(rowIds()).toEqual(['E1', 'C1']));
    const toggleOf = (i) => within(screen.getAllByTestId('DynamicReportTable__row')[i]).getByTestId('DynamicReportTable__toggle');
    fireEvent.click(toggleOf(1));
    fireEvent.click(toggleOf(1));
    fireEvent.click(screen.getByTestId('DynamicReportPanel__expandAll'));
    fireEvent.click(screen.getByTestId('DynamicReportPanel__collapseAll'));
    expect(sent('report_group_toggled').map((e) => [e.type, e.outcome])).toEqual([
      ['expand', 'success'], ['collapse', 'success'], ['expand_all', 'success'], ['collapse_all', 'success'],
    ]);
    fireEvent.change(screen.getByTestId('DynamicReportPanel__level'), { target: { value: 'S' } });
    expect(sent('report_filter_applied')).toEqual([expect.objectContaining({ type: 'account_level', outcome: 'success' })]);
  });

  it('another report is a new session', async () => {
    const view = renderView();
    await waitFor(() => expect(sent('report_opened')).toHaveLength(1));
    view.rerender(<DynamicReportView report={{ ...REPORT, id: 'balance-sheet' }} onBack={vi.fn()} selectedOrgId="O1" />);
    await waitFor(() => expect(sent('report_opened')).toHaveLength(2));
    const [first, second] = sent('report_opened');
    expect(second.specName).toBe('balance-sheet');
    expect(second.reportSessionId).not.toBe(first.reportSessionId);
  });

  it('drill-down: ledger and entry timed, the document when its tab opens, no_document at a dead end', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => ({}));
    renderView();
    await waitFor(() => expect(rowIds()).toEqual(['E1', 'C1']));
    fireEvent.click(screen.getByTestId('DynamicReportPanel__expandAll'));
    fireEvent.click(await screen.findByTestId('DynamicReportTable__ledger'));
    fireEvent.click((await screen.findAllByTestId('DynamicDrillPanel__openEntry'))[0]);
    fireEvent.click(await screen.findByTestId('DynamicDrillPanel__openDocument'));
    const drills = sent('report_drilldown');
    expect(drills.map((e) => [e.type, e.outcome])).toEqual([['ledger', 'success'], ['entry', 'success'], ['document', 'success']]);
    expect(drills[0].durationMs).toEqual(expect.any(Number));
    expect(drills[1].durationMs).toEqual(expect.any(Number));
    expect(drills[2]).not.toHaveProperty('durationMs');

    trackMock.mockReset();
    entryAnswer = { kind: 'rows', rows: ENTRY.rows.map((r) => ({ ...r, doc_window: null })) };
    fireEvent.click(screen.getByTestId('DynamicDrillPanel__crumb-account'));
    fireEvent.click((await screen.findAllByTestId('DynamicDrillPanel__openEntry'))[1]);
    await screen.findByTestId('DynamicDrillPanel__noDocument');
    await waitFor(() => expect(sent('report_drilldown').map((e) => [e.type, e.outcome])).toContainEqual(['document', 'no_document']));
    open.mockRestore();
  });

  it('a blocked pop-up is a document drill-down that failed', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderView();
    await waitFor(() => expect(rowIds()).toEqual(['E1', 'C1']));
    fireEvent.click(screen.getByTestId('DynamicReportPanel__expandAll'));
    fireEvent.click(await screen.findByTestId('DynamicReportTable__ledger'));
    fireEvent.click((await screen.findAllByTestId('DynamicDrillPanel__openEntry'))[0]);
    fireEvent.click(await screen.findByTestId('DynamicDrillPanel__openDocument'));
    expect(sent('report_drilldown').at(-1)).toMatchObject({ type: 'document', outcome: 'error' });
    open.mockRestore();
  });
});

// ETP-6239 — period columns: the server answers one `cells[i]` per requested period, in every mode.
const cellOf = (n) => ({
  amount: n,
  sly: { amount: n - 20, variationAmount: 20, variationPct: 25, trend: 'improves' },
  prev: { amount: n - 10, variationAmount: 10, variationPct: 11, trend: 'improves' },
});
const periodsOf = (params, partialIdx) => params.periods.split(',').map((tuple, idx) => {
  const [dateFrom, dateTo] = tuple.split('|')[0].split('..');
  return { idx, dateFrom, dateTo, partial: idx === partialIdx };
});
const periodAnswer = (params, { partialIdx, extraRows = [] } = {}) => {
  const periods = periodsOf(params, partialIdx);
  return json({
    kind: 'tree',
    periods,
    hiddenCount: Number(params.hiddenCount),
    rows: [...TREE, ...extraRows].map((r) => ({ ...r, cells: periods.map((_, pos) => cellOf(100 + pos)) })),
  });
};

describe('DynamicReportView — period columns (ETP-6239)', () => {
  const settle = () => waitFor(() => expect(screen.queryByTestId('DynamicReportView__loading')).toBeNull());
  const sent = (name) => trackMock.mock.calls.filter(([event]) => event === name).map(([, props]) => props);
  const quiet = () => new Promise((r) => setTimeout(r, 450)); // longer than the query debounce
  // Choosing Mes/Trimestre hides the panel (D8), so a later control is reached by showing it again.
  const showPanel = () => {
    const expand = screen.queryByTestId('DynamicReportPanel__expand');
    if (expand) fireEvent.click(expand);
  };
  const choose = (testId, value) => {
    showPanel();
    fireEvent.change(screen.getByTestId(testId), { target: { value } });
  };
  const groupLabels = () => screen.getAllByTestId('DynamicReportTable__group').map((th) => th.textContent);
  const renderPeriods = async (props) => {
    queryAnswer = periodAnswer;
    renderView(props);
    await waitFor(() => expect(rowIds()).toEqual(['E1', 'C1']));
  };
  const toMonths = async () => {
    choose('DynamicReportPanel__columns', 'month');
    await waitFor(() => expect(queries().at(-1).columns).toBe('month'));
    await waitFor(() => expect(groupLabels()).toHaveLength(6));
  };
  const leafRow = () => screen.getAllByTestId('DynamicReportTable__row').find((r) => r.dataset.nodeId === 'S1');
  const drillButtons = () => within(leafRow()).getAllByTestId('DynamicReportTable__cellLedger');
  const openLeaf = async () => {
    showPanel();
    fireEvent.click(screen.getByTestId('DynamicReportPanel__expandAll'));
    await waitFor(() => expect(rowIds()).toContain('S1'));
  };
  const lastLedger = () => queriesTo('report-general-ledger').at(-1);

  describe('the request', () => {
    it('Total mode carries columns, periods and hiddenCount, and nothing of the comparison', async () => {
      await renderPeriods();
      const [params] = queries();
      expect(params).toMatchObject({
        columns: 'total', hiddenCount: '0',
        periods: '2026-07-01..2026-11-03|2025-07-01..2025-11-03|2026-02-25..2026-06-30',
      });
      for (const gone of ['compareTo', 'fromReferenceDate', 'toReferenceDate', 'yearId', 'referenceYearId', 'compare']) {
        expect(params).not.toHaveProperty(gone);
      }
    });

    it('Mes sends the range plus the shown months, each with its compared ranges, and no year', async () => {
      await renderPeriods();
      await toMonths();
      const params = queries().at(-1);
      const tuples = params.periods.split(',');
      expect(tuples).toHaveLength(6);
      expect(tuples[0]).toBe('2026-07-01..2026-11-03|2025-07-01..2025-11-03|2026-06-01..2026-10-03');
      expect(tuples[1]).toBe('2026-07-01..2026-07-31|2025-07-01..2025-07-31|2026-06-01..2026-06-30');
      expect(tuples[5]).toBe('2026-11-01..2026-11-03|2025-11-01..2025-11-03|2026-10-01..2026-10-03');
      expect(params.hiddenCount).toBe('0');
      for (const gone of ['compareTo', 'fromReferenceDate', 'toReferenceDate', 'yearId', 'referenceYearId']) {
        expect(params).not.toHaveProperty(gone);
      }
    });

    it('Trimestre sends quarters; a long range sends only the last N plus hiddenCount', async () => {
      await renderPeriods();
      choose('DynamicReportPanel__year', 'Y25'); // 2025-07-01 .. 2026-06-30: 12 months, 4 quarters
      choose('DynamicReportPanel__columns', 'month');
      // The request asks for the most periods any mode shows (12 months / 8 quarters); a comparison trims on screen.
      await waitFor(() => expect(queries().at(-1)).toMatchObject({ columns: 'month', dateFrom: '2025-07-01', hiddenCount: '0' }));
      expect(queries().at(-1).periods.split(',')).toHaveLength(13);
      choose('DynamicReportPanel__columns', 'quarter');
      await waitFor(() => expect(queries().at(-1)).toMatchObject({ columns: 'quarter', hiddenCount: '0' }));
      expect(queries().at(-1).periods.split(',')).toHaveLength(5);
    });
  });

  describe('the comparison toggle sends no request (D4)', () => {
    it('in Total mode', async () => {
      await renderPeriods();
      await settle();
      const before = apiFetchMock.mock.calls.length;
      choose('DynamicReportPanel__compare', 'same-last-year');
      choose('DynamicReportPanel__compare', 'previous');
      choose('DynamicReportPanel__compare', '');
      await quiet();
      expect(apiFetchMock.mock.calls.length).toBe(before);
      expect(queries()).toHaveLength(1);
    });

    it('in Mes mode, and the compared columns appear for every period', async () => {
      await renderPeriods();
      await toMonths();
      await settle();
      const before = apiFetchMock.mock.calls.length;
      choose('DynamicReportPanel__compare', 'previous');
      await quiet();
      expect(apiFetchMock.mock.calls.length).toBe(before);
      expect(screen.getAllByTestId('DynamicReportTable__variation').length).toBe(2 * 6);
      choose('DynamicReportPanel__compare', '');
      await quiet();
      expect(apiFetchMock.mock.calls.length).toBe(before);
      expect(screen.queryAllByTestId('DynamicReportTable__variation')).toHaveLength(0);
    });
  });

  describe('stale data and notes', () => {
    it('Total → Mes while the old answer is still shown: labels stay consistent with it, then follow the new answer', async () => {
      await renderPeriods();
      let release;
      queryAnswer = (params) => (params.columns === 'month'
        ? new Promise((res) => { release = () => res(periodAnswer(params)); })
        : periodAnswer(params));
      choose('DynamicReportPanel__columns', 'month');
      await waitFor(() => expect(typeof release).toBe('function'));
      // The Total answer (one period) is still on screen: its header, no month label, no crash.
      expect(groupLabels()).toEqual(['dynamicReportColumnsTotal']);
      expect(rowIds()).toEqual(['E1', 'C1']);
      release();
      await waitFor(() => expect(groupLabels()).toHaveLength(6));
      expect(groupLabels()).toEqual([expect.stringMatching(/^jul 26$/), 'ago 26', expect.stringMatching(/^sept? 26$/), 'oct 26', 'nov 26', 'dynamicReportColumnsTotal']);
    });

    it('the hidden-periods note counts what the mode hides: 12 months / 8 quarters, 6 / 4 with a comparison, with no new request', async () => {
      await renderPeriods();
      expect(screen.queryByTestId('DynamicReportView__hiddenNote')).toBeNull();
      choose('DynamicReportPanel__year', 'Y25'); // 12 months, 4 quarters
      choose('DynamicReportPanel__columns', 'month');
      await waitFor(() => expect(groupLabels()).toHaveLength(13)); // 12 months + Total, nothing hidden
      expect(screen.queryByTestId('DynamicReportView__hiddenNote')).toBeNull();
      const before = apiFetchMock.mock.calls.length;
      choose('DynamicReportPanel__compare', 'previous');
      expect(await screen.findByTestId('DynamicReportView__hiddenNote')).toHaveTextContent('dynamicReportHiddenPeriods:6');
      expect(groupLabels()).toHaveLength(7);
      choose('DynamicReportPanel__compare', '');
      await waitFor(() => expect(groupLabels()).toHaveLength(13));
      expect(screen.queryByTestId('DynamicReportView__hiddenNote')).toBeNull();
      await quiet();
      expect(apiFetchMock.mock.calls.length).toBe(before);
    });

    it('the note reads in the singular at the 13-month / 1-hidden boundary', async () => {
      await renderPeriods();
      choose('DynamicReportPanel__columns', 'month');
      showPanel();
      fireEvent.change(screen.getByTestId('DynamicReportPanel__dateFrom'), { target: { value: '2025-11-01' } }); // 13 months to 2026-11
      expect(await screen.findByTestId('DynamicReportView__hiddenNote')).toHaveTextContent('dynamicReportHiddenPeriodsOne:1');
      fireEvent.change(screen.getByTestId('DynamicReportPanel__dateFrom'), { target: { value: '2025-10-01' } });
      await waitFor(() => expect(screen.getByTestId('DynamicReportView__hiddenNote')).toHaveTextContent('dynamicReportHiddenPeriods:2'));
    });

    it('a 23-month range hides 11 months, 17 with a comparison; quarters hide 0 / 0 over 4 quarters and 4 over 8', async () => {
      await renderPeriods();
      choose('DynamicReportPanel__columns', 'month');
      showPanel();
      fireEvent.change(screen.getByTestId('DynamicReportPanel__dateFrom'), { target: { value: '2025-01-01' } });
      expect(await screen.findByTestId('DynamicReportView__hiddenNote')).toHaveTextContent('dynamicReportHiddenPeriods:11');
      choose('DynamicReportPanel__compare', 'same-last-year');
      await waitFor(() => expect(screen.getByTestId('DynamicReportView__hiddenNote')).toHaveTextContent('dynamicReportHiddenPeriods:17'));
      choose('DynamicReportPanel__columns', 'quarter');
      await waitFor(() => expect(screen.getByTestId('DynamicReportView__hiddenNote')).toHaveTextContent('dynamicReportHiddenPeriods:4'));
      choose('DynamicReportPanel__compare', '');
      await waitFor(() => expect(screen.queryByTestId('DynamicReportView__hiddenNote')).toBeNull());
    });

    it('the partial note and the * show only when a bucket is partial', async () => {
      queryAnswer = (params) => periodAnswer(params, { partialIdx: params.columns === 'month' ? 5 : undefined });
      renderView();
      await waitFor(() => expect(rowIds()).toEqual(['E1', 'C1']));
      expect(screen.queryByTestId('DynamicReportView__partialNote')).toBeNull();
      await toMonths();
      expect(screen.getByTestId('DynamicReportView__partialNote')).toHaveTextContent('dynamicReportPartialPeriods');
      expect(groupLabels().filter((l) => l.endsWith('*'))).toEqual(['nov 26*']);
    });
  });

  describe('exports', () => {
    const renderBody = (format) => {
      const call = apiFetchMock.mock.calls.filter(([u]) => u.endsWith('/render')).at(-1);
      expect(call).toBeTruthy();
      const body = JSON.parse(call[1].body);
      expect(body.format).toBe(format);
      return body.params;
    };
    const exportAs = async (format) => {
      fireEvent.click(screen.getByTestId(`DynamicReportView__export-${format}`));
      await waitFor(() => expect(globalThis.URL.createObjectURL).toHaveBeenCalled());
      globalThis.URL.createObjectURL.mockClear();
      return renderBody(format);
    };

    it('PDF sends the last N plus hiddenCount; Excel and CSV send every bucket; all send compareMode', async () => {
      await renderPeriods();
      choose('DynamicReportPanel__year', 'Y25');
      choose('DynamicReportPanel__columns', 'month');
      choose('DynamicReportPanel__compare', 'previous');
      await waitFor(() => expect(screen.getByTestId('DynamicReportView__hiddenNote')).toBeInTheDocument());
      await settle();
      const pdf = await exportAs('pdf');
      expect(pdf.periods.split(',')).toHaveLength(7);
      expect(pdf.hiddenCount).toBe('6');
      expect(pdf.compareMode).toBe('prev');
      choose('DynamicReportPanel__compare', '');
      await settle();
      const plainPdf = await exportAs('pdf');
      expect(plainPdf.periods.split(',')).toHaveLength(13);
      expect(plainPdf.hiddenCount).toBe('0');
      expect(plainPdf.compareMode).toBe('none');
      choose('DynamicReportPanel__compare', 'previous');
      await settle();
      for (const format of ['xlsx', 'csv']) {
        const params = await exportAs(format);
        expect(params.periods.split(',')).toHaveLength(13);
        expect(params.hiddenCount).toBe('0');
        expect(params.compareMode).toBe('prev');
        expect(params.columns).toBe('month');
      }
    });

    it('the PDF carries the screen\'s headline cards as `kpis`; Excel and CSV do not', async () => {
      await renderPeriods();
      choose('DynamicReportPanel__year', 'Y25');
      choose('DynamicReportPanel__compare', 'previous');
      await settle();
      const cards = JSON.parse((await exportAs('pdf')).kpis);
      expect(cards.map((c) => c.id)).toEqual(['income', 'expenses', 'result', 'margin']);
      expect(cards[0]).toMatchObject({ compare: true });
      expect((await exportAs('csv')).kpis).toBeUndefined();
      choose('DynamicReportPanel__compare', '');
      await settle();
      expect(JSON.parse((await exportAs('pdf')).kpis)[0]).toMatchObject({ compare: false, delta: null });
    });

    it('compareMode follows the toggle, and is none without a comparison', async () => {
      await renderPeriods();
      expect((await exportAs('pdf')).compareMode).toBe('none');
      choose('DynamicReportPanel__compare', 'same-last-year');
      expect((await exportAs('csv')).compareMode).toBe('sly');
    });

    it('over 25 buckets Excel and CSV are disabled with a translated message; PDF still works; Total mode obeys the 24-month cap', async () => {
      await renderPeriods();
      choose('DynamicReportPanel__columns', 'month');
      showPanel();
      fireEvent.change(screen.getByTestId('DynamicReportPanel__dateFrom'), { target: { value: '2020-01-01' } });
      await waitFor(() => expect(queries().at(-1)).toMatchObject({ columns: 'month', dateFrom: '2020-01-01' }));
      await settle();
      expect(screen.getByTestId('DynamicReportView__exportTooLong')).toHaveTextContent('dynamicReportExportTooLong');
      expect(screen.getByTestId('DynamicReportView__export-xlsx')).toBeDisabled();
      expect(screen.getByTestId('DynamicReportView__export-csv')).toBeDisabled();
      expect(screen.getByTestId('DynamicReportView__export-pdf')).toBeEnabled();
      expect((await exportAs('pdf')).periods.split(',')).toHaveLength(13); // no comparison: 12 months + Total
      choose('DynamicReportPanel__columns', 'total');
      // The server refuses a range past from + 24 months in any grain (report-periods.js, D5).
      await waitFor(() => expect(screen.getByTestId('DynamicReportView__export-xlsx')).toBeDisabled());
      expect(screen.getByTestId('DynamicReportView__exportTooLong')).toBeInTheDocument();
      fireEvent.change(screen.getByTestId('DynamicReportPanel__dateFrom'), { target: { value: '2025-01-01' } });
      await waitFor(() => expect(screen.queryByTestId('DynamicReportView__exportTooLong')).toBeNull());
      expect(screen.getByTestId('DynamicReportView__export-xlsx')).toBeEnabled();
    });

    it('a server refusal of an export shows its translated message, not the generic one', async () => {
      await renderPeriods();
      apiFetchMock.mockImplementation((url, init) => (url.endsWith('/render')
        ? Promise.resolve({ ok: false, status: 400, json: () => Promise.resolve({ code: 'PERIOD_RANGE_TOO_LONG' }) })
        : route(url, init)));
      fireEvent.click(screen.getByTestId('DynamicReportView__export-xlsx'));
      expect(await screen.findByTestId('DynamicReportView__error')).toHaveTextContent('reportErrorPeriodRangeTooLong');
    });
  });

  describe('drill (D7)', () => {
    it('a current cell opens the ledger of its bucket; the total column opens the whole range', async () => {
      await renderPeriods();
      await toMonths();
      await openLeaf();
      // Groups in screen order: jul, ago, sep, oct, nov, Total.
      expect(drillButtons()).toHaveLength(6);
      fireEvent.click(drillButtons()[1]);
      await waitFor(() => expect(lastLedger()).toMatchObject({ dateFrom: '2026-08-01', dateTo: '2026-08-31', accountId: 'S1' }));
      fireEvent.click(await screen.findByTestId('DynamicDrillPanel__crumb-report'));
      await waitFor(() => expect(screen.queryByTestId('DynamicDrillPanel__ledger')).toBeNull());
      fireEvent.click(drillButtons()[5]);
      await waitFor(() => expect(lastLedger()).toMatchObject({ dateFrom: '2026-07-01', dateTo: '2026-11-03' }));
    });

    it('a Comparado cell opens the compared range; for the total it is the single D3 range', async () => {
      await renderPeriods();
      await toMonths();
      choose('DynamicReportPanel__compare', 'previous');
      await openLeaf();
      // Per group: Importe, Comparado. Var. € and Var. % are not buttons.
      expect(drillButtons()).toHaveLength(12);
      fireEvent.click(drillButtons()[1]);
      await waitFor(() => expect(lastLedger()).toMatchObject({ dateFrom: '2026-06-01', dateTo: '2026-06-30' }));
      fireEvent.click(await screen.findByTestId('DynamicDrillPanel__crumb-report'));
      await waitFor(() => expect(screen.queryByTestId('DynamicDrillPanel__ledger')).toBeNull());
      fireEvent.click(drillButtons()[11]);
      await waitFor(() => expect(lastLedger()).toMatchObject({ dateFrom: '2026-06-01', dateTo: '2026-10-03' }));
    });

    it('Comparado under same-period-last-year opens last year\'s bucket', async () => {
      await renderPeriods();
      await toMonths();
      choose('DynamicReportPanel__compare', 'same-last-year');
      await openLeaf();
      fireEvent.click(drillButtons()[1]);
      await waitFor(() => expect(lastLedger()).toMatchObject({ dateFrom: '2025-07-01', dateTo: '2025-07-31' }));
    });

    it('the variation cells are not clickable', async () => {
      await renderPeriods();
      await toMonths();
      choose('DynamicReportPanel__compare', 'previous');
      await openLeaf();
      const cells = [...within(leafRow()).getAllByTestId('DynamicReportTable__variation'), ...within(leafRow()).getAllByTestId('DynamicReportTable__variationPct')];
      expect(cells).toHaveLength(12);
      for (const cell of cells) expect(within(cell).queryByRole('button')).toBeNull();
    });
  });

  describe('telemetry (D9)', () => {
    it('the comparison is emitted at once with no durationMs, and sends no request', async () => {
      await renderPeriods();
      await settle();
      choose('DynamicReportPanel__compare', 'previous');
      const [applied] = sent('report_filter_applied');
      expect(applied).toMatchObject({ type: 'comparison', outcome: 'success', specName: 'profit-loss' });
      expect(applied).not.toHaveProperty('durationMs');
      await quiet();
      expect(sent('report_filter_applied')).toHaveLength(1);
    });

    it('Columnas is a timed filter: one event with durationMs once its result is in', async () => {
      await renderPeriods();
      await waitFor(() => expect(sent('report_opened')).toHaveLength(1));
      choose('DynamicReportPanel__columns', 'month');
      await waitFor(() => expect(sent('report_filter_applied')).toHaveLength(1));
      expect(sent('report_filter_applied')[0]).toMatchObject({ type: 'columns', outcome: 'success' });
      expect(sent('report_filter_applied')[0].durationMs).toEqual(expect.any(Number));
    });
  });

  describe('chips and the panel', () => {
    it('has the Columnas select with the three grains', async () => {
      await renderPeriods();
      const options = within(screen.getByTestId('DynamicReportPanel__columns')).getAllByRole('option').map((o) => [o.value, o.textContent]);
      expect(options).toEqual([['total', 'dynamicReportColumnsTotal'], ['month', 'dynamicReportColumnsMonth'], ['quarter', 'dynamicReportColumnsQuarter']]);
    });

    it('the comparison chip shows the total group\'s compared range, per mode and grain', async () => {
      await renderPeriods();
      choose('DynamicReportPanel__compare', 'same-last-year');
      expect(await screen.findByTestId('DynamicReportView__chip-compare')).toHaveTextContent('01/07/2025 – 03/11/2025');
      choose('DynamicReportPanel__compare', 'previous');
      // Total mode: the same number of days, ending the day before.
      expect(screen.getByTestId('DynamicReportView__chip-compare')).toHaveTextContent('25/02/2026 – 30/06/2026');
      await toMonths();
      // Mes mode: the D3 single range [prev(first).from, prev(last).to].
      await waitFor(() => expect(screen.getByTestId('DynamicReportView__chip-compare')).toHaveTextContent('01/06/2026 – 03/10/2026'));
    });

    it('a Columnas chip shows outside Total and its remove button goes back to Total', async () => {
      await renderPeriods();
      expect(screen.queryByTestId('DynamicReportView__chip-columns')).toBeNull();
      await toMonths();
      expect(screen.getByTestId('DynamicReportView__chip-columns')).toHaveTextContent('dynamicReportColumnsMonth');
      fireEvent.click(screen.getByTestId('DynamicReportView__chipRemove-columns'));
      await waitFor(() => expect(queries().at(-1).columns).toBe('total'));
      expect(screen.queryByTestId('DynamicReportView__chip-columns')).toBeNull();
    });
  });

  describe('the table', () => {
    it('has a two-row header: Concepto spans both, each period is a colgroup over its sub-columns', async () => {
      await renderPeriods();
      await toMonths();
      choose('DynamicReportPanel__compare', 'previous');
      const table = screen.getByTestId('DynamicReportTable');
      const headerRows = table.querySelectorAll('thead tr');
      expect(headerRows).toHaveLength(2);
      const concept = headerRows[0].querySelector('th[scope="col"]');
      expect(concept).toHaveAttribute('rowspan', '2');
      const colgroups = headerRows[0].querySelectorAll('th[scope="colgroup"]');
      expect(colgroups).toHaveLength(6);
      for (const th of colgroups) expect(th).toHaveAttribute('colspan', '4');
      const subs = headerRows[1].querySelectorAll('th[scope="col"]');
      expect(subs).toHaveLength(24);
      expect([...subs].slice(0, 4).map((th) => th.textContent)).toEqual(['dynamicReportAmount', expect.stringMatching(/^dynamicReportCompared \(.+\)$/), 'dynamicReportVariation', 'dynamicReportVariationPct']);
    });

    it('Comparado names what it is compared against, under the header, and only with a comparison', async () => {
      await renderPeriods();
      await toMonths();
      expect(screen.queryAllByTestId('DynamicReportTable__comparedLabel')).toHaveLength(0);
      choose('DynamicReportPanel__compare', 'same-last-year');
      const labels = await screen.findAllByTestId('DynamicReportTable__comparedLabel');
      expect(labels).toHaveLength(6); // the 5 months on screen + the Total
      const first = groupLabels()[0].replace(/\*$/, '').replace(/\d+$/, (y) => String(Number(y) - 1));
      expect(labels[0]).toHaveTextContent(`(${first})`);
      expect(labels.at(-1).textContent).toMatch(/^\(\d{2}\/\d{2}\/\d{4} – \d{2}\/\d{2}\/\d{4}\)$/);
    });

    it('scrolls horizontally inside its own wrapper', async () => {
      await renderPeriods();
      expect(screen.getByTestId('DynamicReportTable__scroll').className).toContain('overflow-x-auto');
      expect(screen.getByTestId('DynamicReportTable__scroll')).toContainElement(screen.getByTestId('DynamicReportTable'));
    });

    it('the sticky Concepto cell has an opaque background on normal, heading, formula and hovered rows', async () => {
      queryAnswer = (params) => periodAnswer(params, {
        extraRows: [{ node_id: 'F1', parentId: null, elementlevel: 'E', value: '', name: 'Resultado', amount: 1, amount_ref: 0, sign: 'C', isFormula: true }],
      });
      renderView();
      await waitFor(() => expect(rowIds()).toContain('F1'));
      const first = (id) => screen.getAllByTestId('DynamicReportTable__row').find((r) => r.dataset.nodeId === id).querySelector('td');
      for (const id of ['E1', 'C1', 'F1']) {
        const tokens = first(id).className.split(/\s+/);
        expect(tokens, id).toContain('sticky');
        expect(tokens, id).toContain('left-0');
        // a solid fill: bg-card / bg-muted, never an alpha one like bg-muted/40
        expect(tokens.some((t) => /^bg-(card|muted)$/.test(t)), id).toBe(true);
        expect(tokens.some((t) => /^bg-[a-z-]+\//.test(t)), id).toBe(false);
      }
      // hovering the row must not let the scrolled amounts show through
      expect(first('C1').className).toContain('group-hover:bg-muted');
      expect(first('F1').className).toContain('bg-muted');
      const concept = screen.getByTestId('DynamicReportTable').querySelector('thead th[scope="col"]');
      expect(concept.className).toContain('sticky');
      expect(concept.className).toContain('bg-muted');
    });
  });

  describe('the split by dimension', () => {
    it('opens in Mes with one cell per period, in the same column order, and carries columns and periods', async () => {
      splitAnswer = (params) => json({
        kind: 'split',
        periods: periodsOf(params),
        rows: [{ node_id: 'O1', name: 'Spain', cells: periodsOf(params).map((_, pos) => cellOf(600 + pos)) }],
      });
      await renderPeriods({ roleOrgs: TWO_ORGS });
      await toMonths();
      await openLeaf();
      choose('DynamicReportPanel__splitBy', 'org');
      fireEvent.click(await screen.findByTestId('DynamicReportTable__splitToggle'));
      const part = await screen.findByTestId('DynamicReportTable__splitRow');
      // jul..nov (pos 1..5), then the range total (pos 0)
      expect(part.textContent).toBe(['Spain', '601,00', '602,00', '603,00', '604,00', '605,00', '600,00'].join(''));
      expect(queries().find((p) => p.splitBy)).toMatchObject({ splitBy: 'org', splitNodeId: 'S1', columns: 'month' });
      expect(queries().find((p) => p.splitBy).periods.split(',')).toHaveLength(6);
    });

    it('opens in Trimestre too, with the compared columns of the mode', async () => {
      splitAnswer = (params) => json({
        kind: 'split',
        periods: periodsOf(params),
        rows: [{ node_id: 'O1', name: 'Spain', cells: periodsOf(params).map((_, pos) => cellOf(600 + pos)) }],
      });
      await renderPeriods({ roleOrgs: TWO_ORGS });
      choose('DynamicReportPanel__columns', 'quarter');
      await waitFor(() => expect(groupLabels()).toHaveLength(3));
      choose('DynamicReportPanel__compare', 'previous');
      await openLeaf();
      choose('DynamicReportPanel__splitBy', 'org');
      fireEvent.click(await screen.findByTestId('DynamicReportTable__splitToggle'));
      const part = await screen.findByTestId('DynamicReportTable__splitRow');
      // Importe, Comparado (amount - 10), Var. €, Var. % per group; q3 (pos 1), q4 (pos 2), total (pos 0)
      expect(part.textContent).toContain('601,00591,00');
      expect(part.textContent).toContain('600,00590,00');
      expect(queries().find((p) => p.splitBy)).toMatchObject({ columns: 'quarter' });
    });
  });
});

describe('DynamicReportView — collapsible panel (ETP-6239 D8/D9)', () => {
  const KEY = 'etendo.reports.panel.collapsed:anonymous';
  const sent = (name) => trackMock.mock.calls.filter(([event]) => event === name).map(([, props]) => props);
  const ready = async (props) => {
    queryAnswer = periodAnswer;
    const view = renderView(props);
    await waitFor(() => expect(rowIds()).toEqual(['E1', 'C1']));
    return view;
  };
  const ROLE_ORGS = TWO_ORGS;
  const quietMs = () => new Promise((r) => setTimeout(r, 450));
  beforeEach(() => localStorage.clear());

  it('the collapse button hides the panel, persists it, reports a user toggle and moves focus to the strip button', async () => {
    await ready();
    fireEvent.click(screen.getByTestId('DynamicReportPanel__collapse'));
    expect(screen.queryByTestId('DynamicReportPanel')).toBeNull();
    expect(localStorage.getItem(KEY)).toBe('1');
    expect(sent('report_panel_toggled')).toEqual([expect.objectContaining({ panelState: 'collapsed', trigger: 'user', outcome: 'success' })]);
    expect(screen.getByTestId('DynamicReportPanel__expand')).toHaveFocus();
  });

  it('the strip is a labelled disclosure; expanding persists and focus returns to the collapse button', async () => {
    await ready();
    fireEvent.click(screen.getByTestId('DynamicReportPanel__collapse'));
    const expand = screen.getByTestId('DynamicReportPanel__expand');
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    expect(expand).not.toHaveAttribute('aria-controls');
    expect(expand).toHaveAttribute('aria-label', 'dynamicReportShowPanel');
    fireEvent.click(expand);
    expect(screen.getByTestId('DynamicReportPanel')).toBeInTheDocument();
    expect(localStorage.getItem(KEY)).toBe('0');
    expect(screen.getByTestId('DynamicReportPanel__collapse')).toHaveFocus();
    expect(sent('report_panel_toggled').at(-1)).toMatchObject({ panelState: 'expanded', trigger: 'user' });
  });

  it('on the collapsed strip, clicking the "customize" text inside the button expands the panel', async () => {
    localStorage.setItem(KEY, '1');
    await ready();
    const strip = screen.getByTestId('DynamicReportPanel__strip');
    fireEvent.click(within(strip).getByText('customizeReport'));
    expect(screen.getByTestId('DynamicReportPanel')).toBeInTheDocument();
    expect(sent('report_panel_toggled').at(-1)).toMatchObject({ panelState: 'expanded', trigger: 'user' });
  });

  it('opens collapsed when the saved state says so', async () => {
    localStorage.setItem(KEY, '1');
    await ready();
    expect(screen.getByTestId('DynamicReportPanel__strip')).toBeInTheDocument();
    expect(screen.queryByTestId('DynamicReportPanel')).toBeNull();
  });

  it('the badge counts only the removable chips: contact, product, columns, comparison, split', async () => {
    await ready({ roleOrgs: ROLE_ORGS });
    expect(screen.getByTestId('DynamicReportView__chip-org')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('DynamicReportPanel__bPartnerId'));
    fireEvent.click(screen.getByTestId('DynamicReportPanel__productId'));
    fireEvent.change(screen.getByTestId('DynamicReportPanel__compare'), { target: { value: 'previous' } });
    fireEvent.change(screen.getByTestId('DynamicReportPanel__splitBy'), { target: { value: 'org' } });
    fireEvent.change(screen.getByTestId('DynamicReportPanel__columns'), { target: { value: 'month' } }); // auto-hides
    const badge = await screen.findByTestId('DynamicReportPanel__activeCount');
    expect(badge).toHaveTextContent('5');
    expect(badge).toHaveAttribute('aria-label', 'dynamicReportActiveFilters:5');
  });

  it('with only the period and the org on, the strip has no badge', async () => {
    localStorage.setItem(KEY, '1');
    await ready();
    expect(screen.queryByTestId('DynamicReportPanel__activeCount')).toBeNull();
  });

  describe('auto-hide on Mes / Trimestre', () => {
    it('hides the panel, reports auto_columns, saves nothing and focuses the expand button', async () => {
      await ready();
      fireEvent.change(screen.getByTestId('DynamicReportPanel__columns'), { target: { value: 'month' } });
      expect(screen.queryByTestId('DynamicReportPanel')).toBeNull();
      expect(sent('report_panel_toggled')).toEqual([expect.objectContaining({ panelState: 'collapsed', trigger: 'auto_columns' })]);
      expect(localStorage.getItem(KEY)).toBeNull();
      expect(screen.getByTestId('DynamicReportPanel__expand')).toHaveFocus();
    });

    it('Trimestre hides it too', async () => {
      await ready();
      fireEvent.change(screen.getByTestId('DynamicReportPanel__columns'), { target: { value: 'quarter' } });
      expect(screen.getByTestId('DynamicReportPanel__strip')).toBeInTheDocument();
    });

    it('does not fire on Total, nor when the panel is already collapsed', async () => {
      await ready();
      fireEvent.change(screen.getByTestId('DynamicReportPanel__compare'), { target: { value: 'previous' } });
      expect(screen.getByTestId('DynamicReportPanel')).toBeInTheDocument();
      expect(sent('report_panel_toggled')).toHaveLength(0);
      fireEvent.click(screen.getByTestId('DynamicReportPanel__collapse'));
      expect(sent('report_panel_toggled')).toHaveLength(1);
      fireEvent.click(screen.getByTestId('DynamicReportView__chipRemove-compare'));
      await quietMs();
      expect(sent('report_panel_toggled')).toHaveLength(1);
    });

    it('a remount after an auto-hide shows the panel expanded', async () => {
      const { unmount } = await ready();
      fireEvent.change(screen.getByTestId('DynamicReportPanel__columns'), { target: { value: 'month' } });
      unmount();
      // Opened afresh (the URL's columns would restore the hide, see the URL suite): nothing was stored.
      window.history.replaceState(null, '', '/');
      await ready();
      expect(screen.getByTestId('DynamicReportPanel')).toBeInTheDocument();
    });
  });

  describe('chips while the panel is collapsed', () => {
    it('Columnas, contact and product are removable under the title; the org chip has no remove button', async () => {
      await ready({ roleOrgs: ROLE_ORGS });
      expect(screen.getByTestId('DynamicReportView__chip-org')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('DynamicReportPanel__bPartnerId'));
      fireEvent.click(screen.getByTestId('DynamicReportPanel__productId'));
      fireEvent.change(screen.getByTestId('DynamicReportPanel__columns'), { target: { value: 'month' } });
      expect(screen.getByTestId('DynamicReportPanel__strip')).toBeInTheDocument();
      expect(screen.queryByTestId('DynamicReportView__chipRemove-org')).toBeNull();
      fireEvent.click(screen.getByTestId('DynamicReportView__chipRemove-bp'));
      fireEvent.click(screen.getByTestId('DynamicReportView__chipRemove-product'));
      fireEvent.click(screen.getByTestId('DynamicReportView__chipRemove-columns'));
      await waitFor(() => expect(queries().at(-1)).toMatchObject({ columns: 'total' }));
      expect(queries().at(-1)).not.toHaveProperty('bPartnerId', 'B1');
      expect(screen.queryByTestId('DynamicReportView__chip-bp')).toBeNull();
      expect(screen.queryByTestId('DynamicReportView__chip-product')).toBeNull();
    });
  });
});

describe('dynamic report view — translations', () => {
  it('every ui() key the view uses exists in en_US and es_ES', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const dir = join(__dirname, '..');
    const used = new Set();
    for (const file of readdirSync(dir).filter((f) => /\.jsx?$/.test(f))) {
      const src = readFileSync(join(dir, file), 'utf8');
      for (const m of src.matchAll(/\bui\(\s*'([A-Za-z0-9]+)'/g)) used.add(m[1]);
      for (const m of src.matchAll(/'((?:dynamicReport|reportError)[A-Za-z0-9]+)'/g)) used.add(m[1]);
    }
    for (const locale of ['en_US', 'es_ES']) {
      const labels = JSON.parse(readFileSync(join(__dirname, '../../../../locales', `${locale}.json`), 'utf8')).genericLabels;
      expect([...used].filter((k) => !labels[k]), locale).toEqual([]);
    }
    expect(used.size).toBeGreaterThan(20);
  });
});

describe('DynamicReportView — selections in the URL (ETP-6239)', () => {
  const eventsOf = (name) => trackMock.mock.calls.filter(([event]) => event === name);
  const ORGS = [{ id: 'O1', name: 'Org 1' }, { id: 'O2', name: 'Org 2' }, { id: '0', name: '*' }];
  const link = (query) => window.history.replaceState(null, '', `/report-viewer?report=profit-loss&${query}`);

  it('restores the panel from the query string before the first query: one request, the restored params, no filter event', async () => {
    link('columns=month&compare=same-last-year&dateFrom=2026-03-01&dateTo=2026-05-31&bPartnerId=BP1&splitBy=org&orgId=O2&bogus=1');
    queryAnswer = periodAnswer;
    renderView({ roleOrgs: ORGS });
    await waitFor(() => expect(rowIds()).toEqual(['E1', 'C1']));
    await new Promise((r) => setTimeout(r, 450));
    expect(queries()).toHaveLength(1);
    expect(queries()[0]).toMatchObject({ columns: 'month', dateFrom: '2026-03-01', dateTo: '2026-05-31', bPartnerId: 'BP1', orgId: 'O2' });
    // Mes hides the panel for the session, as a manual pick does.
    fireEvent.click(screen.getByTestId('DynamicReportPanel__expand'));
    expect(screen.getByTestId('DynamicReportPanel__columns')).toHaveValue('month');
    expect(screen.getByTestId('DynamicReportPanel__compare')).toHaveValue('same-last-year');
    expect(eventsOf('report_filter_applied')).toHaveLength(0);
    // A user's change does emit it.
    fireEvent.change(screen.getByTestId('DynamicReportPanel__compare'), { target: { value: 'previous' } });
    await waitFor(() => expect(eventsOf('report_filter_applied')).toHaveLength(1));
    expect(localStorage.getItem('etendo.reports.panel.collapsed:undefined')).toBeNull(); // the auto-hide stores nothing
  });

  it('a restored link on Mes hides the panel for the session; the Total does not', async () => {
    link('columns=month');
    renderView();
    await waitFor(() => expect(screen.getByTestId('DynamicReportPanel__expand')).toBeInTheDocument());
  });

  it('a clean URL opens the defaults, and an invalid value is ignored and cleaned from the URL', async () => {
    link('columns=week&compare=x&dateFrom=2026-02-30&dateTo=2026-03-01');
    renderView();
    await waitFor(() => expect(rowIds()).toEqual(['E1', 'C1']));
    expect(queries()).toHaveLength(1);
    expect(queries()[0]).toMatchObject({ columns: 'total', dateFrom: '2026-07-01', dateTo: '2026-11-03' });
    expect(window.location.search).toBe('?report=profit-loss');
  });

  it('an org the role cannot pick (unknown, or *) falls back to the default org and leaves the URL', async () => {
    for (const org of ['0123456789ABCDEF0123456789ABCDEF', '0']) {
      apiFetchMock.mockClear();
      link(`orgId=${org}`);
      const view = renderView({ roleOrgs: ORGS });
      await waitFor(() => expect(queries()).toHaveLength(1));
      expect(queries()[0].orgId).toBe('O1');
      expect(window.location.search).toBe('?report=profit-loss');
      view.unmount();
    }
  });

  it('a restored contact shows its id until its name is resolved by id, with no name taken from the URL', async () => {
    link('bPartnerId=BP1&_display_bPartnerId=Spoofed');
    renderView();
    await waitFor(() => expect(screen.getAllByText('Acme').length).toBeGreaterThan(0)); // the chip, from the selector
    expect(screen.queryByText('Spoofed')).toBeNull();
    expect(apiFetchMock.mock.calls.some(([u]) => u.includes('/report-selectors/bpartner'))).toBe(true);
    await waitFor(() => expect(queries()).toHaveLength(1)); // the lookup never delays or repeats the query
    expect(queries()[0].bPartnerId).toBe('BP1');
    expect(window.location.search).not.toContain('_display');
  });

  it('resolves restored names with one ?ids= lookup, one chip per contact', async () => {
    link('bPartnerId=BP1,BP3');
    renderView();
    await waitFor(() => expect(screen.getAllByTestId('PickerChip').map((c) => c.textContent)).toEqual(['Acme', 'Smith, John']));
    const lookups = apiFetchMock.mock.calls.map(([u]) => u).filter((u) => u.includes('/report-selectors/bpartner'));
    expect(lookups).toEqual(['/sws/report-selectors/bpartner?ids=BP1%2CBP3']);
  });

  it('resolves a restored product through the contract selector (product-all), not the stock-scoped one', async () => {
    link('productId=PR1');
    renderView();
    await waitFor(() => expect(apiFetchMock.mock.calls.map(([u]) => u).some((u) => u.includes('/report-selectors/product-all?ids='))).toBe(true));
    const lookups = apiFetchMock.mock.calls.map(([u]) => u).filter((u) => u.includes('/report-selectors/product'));
    expect(lookups).toEqual(['/sws/report-selectors/product-all?ids=PR1']);
  });

  it('names containing a comma survive the URL round trip as single chips, and reach the PDF header exactly', async () => {
    link('bPartnerId=BP4,BP5');
    renderView();
    await waitFor(() => expect(screen.getAllByTestId('PickerChip').map((c) => c.textContent)).toEqual(['A, B', 'Acme, S.L.']));
    await waitFor(() => expect(rowIds()).toEqual(['E1', 'C1']));
    expect(window.location.search).not.toMatch(/A%2C\+B|Acme/); // ids only: no names in the link
    fireEvent.click(screen.getByTestId('DynamicReportView__export-pdf'));
    await waitFor(() => expect(apiFetchMock.mock.calls.some(([u]) => u.endsWith('/render'))).toBe(true));
    const [, init] = apiFetchMock.mock.calls.find(([u]) => u.endsWith('/render'));
    expect(JSON.parse(init.body).params._display_bPartnerId).toBe('A, B, Acme, S.L.');
  });

  it('drops an id the lookup does not know when others resolve, but never clears a filter whose ids all fail to resolve', async () => {
    link('bPartnerId=BP1,STALE9');
    const view1 = renderView();
    await waitFor(() => expect(window.location.search).toBe('?report=profit-loss&bPartnerId=BP1'));
    await waitFor(() => expect(queries().at(-1).bPartnerId).toBe('BP1'));
    view1.unmount();
    link('bPartnerId=STALE9');
    renderView();
    await waitFor(() => expect(rowIds()).toEqual(['E1', 'C1']));
    await new Promise((r) => setTimeout(r, 100));
    expect(window.location.search).toBe('?report=profit-loss&bPartnerId=STALE9'); // kept: not silently company-wide
    expect(queries().at(-1).bPartnerId).toBe('STALE9');
  });

  it('a backend that ignores `ids` and answers its first page drops nothing', async () => {
    link('bPartnerId=BP1,BP9');
    const base = apiFetchMock.getMockImplementation();
    apiFetchMock.mockImplementation((u, i) => (u.includes('ids=') ? Promise.resolve(json({ items: [{ id: 'BP1', name: 'Acme' }, { id: 'BP2', name: 'Beta' }] })) : base(u, i)));
    renderView();
    await waitFor(() => expect(rowIds()).toEqual(['E1', 'C1']));
    await new Promise((r) => setTimeout(r, 100));
    expect(window.location.search).toContain('bPartnerId=BP1%2CBP9');
    apiFetchMock.mockImplementation(base);
  });

  it('a lookup that fails keeps the restored id (nothing is dropped on an error)', async () => {
    link('bPartnerId=BP1');
    const base = apiFetchMock.getMockImplementation();
    apiFetchMock.mockImplementation((u, i) => (u.includes('ids=') ? Promise.resolve(json({}, { ok: false, status: 500 })) : base(u, i)));
    renderView();
    await waitFor(() => expect(rowIds()).toEqual(['E1', 'C1']));
    expect(window.location.search).toContain('bPartnerId=BP1');
    apiFetchMock.mockImplementation(base);
  });

  it('restoring Mes hides the panel silently: no panel event', async () => {
    link('columns=month');
    renderView();
    await waitFor(() => expect(screen.getByTestId('DynamicReportPanel__expand')).toBeInTheDocument());
    expect(eventsOf('report_panel_toggled')).toHaveLength(0);
  });

  it('the panel offers Columnas/Comparar/Dividir only when the contract declares them, like the URL', async () => {
    const bare = { ...REPORT, parameters: REPORT.parameters.filter((p) => !['compareTo', 'splitBy', 'columns'].includes(p.name)) };
    link('columns=month&compare=previous&splitBy=org');
    renderView({ report: bare });
    await waitFor(() => expect(rowIds()).toEqual(['E1', 'C1']));
    expect(screen.queryByTestId('DynamicReportPanel__columns')).toBeNull();
    expect(screen.queryByTestId('DynamicReportPanel__compare')).toBeNull();
    expect(screen.queryByTestId('DynamicReportPanel__splitBy')).toBeNull();
    expect(queries()[0]).toMatchObject({ columns: 'total' }); // the link's controls are not the report's: ignored, and left in the URL untouched
  });

  it('a change replaces the URL (no new history entry) with only what differs from the default', async () => {
    link('x=1');
    const replace = vi.spyOn(window.history, 'replaceState');
    const push = vi.spyOn(window.history, 'pushState');
    renderView();
    await waitFor(() => expect(rowIds()).toEqual(['E1', 'C1']));
    expect(window.location.search).toBe('?report=profit-loss&x=1'); // untouched dates stay out
    fireEvent.change(screen.getByTestId('DynamicReportPanel__compare'), { target: { value: 'previous' } });
    fireEvent.change(screen.getByTestId('DynamicReportPanel__columns'), { target: { value: 'month' } }); // hides the panel (D8)
    await waitFor(() => expect(window.location.search).toBe('?report=profit-loss&x=1&columns=month&compare=previous'));
    expect(replace).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('DynamicReportPanel__expand'));
    fireEvent.change(screen.getByTestId('DynamicReportPanel__columns'), { target: { value: 'total' } });
    await waitFor(() => expect(window.location.search).toBe('?report=profit-loss&x=1&compare=previous'));
    replace.mockRestore();
    push.mockRestore();
  });

  it('writes through the router when the page hands one over, and reads its query string', async () => {
    const onSearchChange = vi.fn();
    renderView({ search: 'report=profit-loss&category=finance&compare=previous', onSearchChange });
    await waitFor(() => expect(rowIds()).toEqual(['E1', 'C1']));
    expect(screen.getByTestId('DynamicReportPanel__compare')).toHaveValue('previous');
    fireEvent.change(screen.getByTestId('DynamicReportPanel__compare'), { target: { value: 'same-last-year' } });
    await waitFor(() => expect(onSearchChange).toHaveBeenLastCalledWith('?report=profit-loss&category=finance&compare=same-last-year'));
  });

  it('does not write the defaults while they reload on an org change, so an untouched period stays out of the URL', async () => {
    link('x=1');
    const onSearchChange = vi.fn();
    const view = renderView({ onSearchChange });
    await waitFor(() => expect(rowIds()).toEqual(['E1', 'C1']));
    onSearchChange.mockClear();
    view.rerender(<DynamicReportView report={REPORT} onBack={vi.fn()} selectedOrgId="O2" onSearchChange={onSearchChange} reportAccess={FULL_ACCESS} />);
    await new Promise((r) => setTimeout(r, 50));
    // While the years reload the opening period is unknown: nothing of the period is written.
    expect(onSearchChange.mock.calls.map(([next]) => next).filter((next) => next.includes('dateFrom'))).toEqual([]);
  });
});

// ETP-6080 (QA CP-8 note) — same rule as the org picker: Organización only for a role with several orgs.
describe('DynamicReportView — Organización split and chip (ETP-6080)', () => {
  const splitValues = () => [...screen.getByTestId('DynamicReportPanel__splitBy').querySelectorAll('option')].map((o) => o.value);

  it('a single-org role has no org split option and no org chip', async () => {
    queryAnswer = periodAnswer;
    renderView({ roleOrgs: [{ id: 'O1', name: 'Spain' }] });
    await waitFor(() => expect(rowIds()).toEqual(['E1', 'C1']));
    expect(splitValues()).not.toContain('org');
    expect(splitValues()).toContain('bpartner');
    expect(screen.queryByTestId('DynamicReportView__chip-org')).toBeNull();
  });

  it('a role with two orgs has both', async () => {
    queryAnswer = periodAnswer;
    renderView({ roleOrgs: TWO_ORGS });
    await waitFor(() => expect(rowIds()).toEqual(['E1', 'C1']));
    expect(splitValues()).toContain('org');
    expect(screen.getByTestId('DynamicReportView__chip-org')).toBeInTheDocument();
  });

  it('a link restored with splitBy=org for a single-org role ends with no split and no chip', async () => {
    window.history.replaceState(null, '', '/report-viewer?report=profit-loss&splitBy=org');
    queryAnswer = periodAnswer;
    renderView({ roleOrgs: [{ id: 'O1', name: 'Spain' }] });
    await waitFor(() => expect(rowIds()).toEqual(['E1', 'C1']));
    expect(screen.getByTestId('DynamicReportPanel__splitBy')).toHaveValue('');
    expect(screen.queryByTestId('DynamicReportView__chip-split')).toBeNull();
  });
});

// ETP-6084 — the Trial Balance: a chart tree with the contract's own amount columns, filters, grouping and totals.
describe('DynamicReportView — chart tree: Trial Balance (ETP-6084)', () => {
  const TB = {
    id: 'report-trial-balance',
    category: 'finance',
    title: { es_ES: 'Balance de Sumas y Saldos' },
    tree: 'chart',
    amountColumns: [
      { field: 'opening', labelKey: 'dynamicReportOpening', compare: 'never' },
      { field: 'debit', labelKey: 'dynamicReportDebit', compare: 'optional' },
      { field: 'credit', labelKey: 'dynamicReportCredit', compare: 'optional' },
      { field: 'closing', labelKey: 'dynamicReportClosing', compare: 'always' },
    ],
    sections: [{ id: 'periodo', label: { es_ES: 'Periodo' } }, { id: 'opciones', label: { es_ES: 'Opciones' } }],
    parameters: [
      { name: 'orgId', type: 'search', selector: 'org', hidden: true },
      { name: 'dateFrom', type: 'date', label: { es_ES: 'Desde' } },
      { name: 'dateTo', type: 'date', label: { es_ES: 'Hasta' } },
      { name: 'compareTo', type: 'toggle' },
      { name: 'fromAccountId', type: 'search', selector: 'account', label: { es_ES: 'Desde la cuenta' } },
      { name: 'bPartnerId', type: 'search', selector: 'bpartner', label: { es_ES: 'Contacto' }, groupByValue: 'bpartner' },
      { name: 'projectId', type: 'search', selector: 'project', label: { es_ES: 'Proyecto' } },
      { name: 'groupBy', type: 'select', label: { es_ES: 'Agrupar por' } },
      { name: 'openingEntryAmount', type: 'toggle', default: true, label: { es_ES: 'Asiento de apertura' } },
      { name: 'showOnlyAccountsWithValue', type: 'toggle', default: true, label: { es_ES: 'Solo con valor' } },
      { name: 'accountLevel', default: 'S', options: [{ value: 'E', label: { es_ES: 'Epígrafe' } }, { value: 'S', label: { es_ES: 'Subcuenta' } }] },
    ],
  };
  const cell = (amount, ref = 0) => ({ amount, sly: { amount: ref, variationAmount: amount - ref, variationPct: 10, trend: null }, prev: { amount: ref, variationAmount: amount - ref, variationPct: 10, trend: null } });
  const cells = (o, d, c, cl) => [{ opening: cell(o), debit: cell(d), credit: cell(c), closing: cell(cl, 1) }];
  const TB_ROWS = [
    { node_id: 'E1', parentId: null, elementlevel: 'E', value: '4', name: 'Acreedores', account_id: 'E1', cells: cells(0, 100, 100, 0) },
    { node_id: 'S1', parentId: 'E1', elementlevel: 'S', value: '430', name: 'Clientes', account_id: 'S1', account_value: '430', cells: cells(0, 100, 100, 0) },
  ];
  const DIMENSION_ROWS = [
    { node_id: 'S1|B1', parentId: 'S1', elementlevel: 'S', value: '430', name: 'Acme', isDimension: true, account_id: 'S1', account_value: '430', dimension_id: 'B1', dimension_name: 'Acme', cells: cells(0, 60, 60, 0) },
    { node_id: 'S1|', parentId: 'S1', elementlevel: 'S', value: '430', name: '', isDimension: true, account_id: 'S1', account_value: '430', dimension_id: '', dimension_name: '', cells: cells(0, 40, 40, 0) },
  ];
  const TOTALS = cells(0, 100, 100, 0);
  const tbAnswer = ({ balanced = true, balance } = {}) => (params) => json({
    kind: 'tree',
    periods: TOTAL_PERIOD,
    rows: params.groupBy ? [...TB_ROWS, ...DIMENSION_ROWS] : TB_ROWS,
    totals: TOTALS,
    balance: balance ?? { balanced, debitCreditDiff: balanced ? 0 : 12.5, closingDiff: 0 },
  });
  const renderTb = (props = {}) => renderView({ report: TB, reportAccess: { ...FULL_ACCESS, 'report-trial-balance': 'full' }, ...props });
  const tbQueries = () => queriesTo('report-trial-balance');
  const headers = () => screen.getAllByTestId('DynamicReportTable__amount').map((h) => h.textContent);

  beforeEach(() => { queryAnswer = tbAnswer(); });

  it('one column group per contract amount, the TOTALES row and the balance check; no KPI strip, no bars', async () => {
    renderTb();
    await waitFor(() => expect(rowIds()).toEqual(['E1', 'S1']));
    expect(headers()).toEqual(['dynamicReportOpening', 'dynamicReportDebit', 'dynamicReportCredit', 'dynamicReportClosing']);
    expect(screen.getByTestId('DynamicReportTable__totals')).toHaveTextContent('dynamicReportTotalRow');
    expect(screen.getByTestId('DynamicReportBalance__ok')).toBeInTheDocument();
    expect(screen.queryByTestId('DynamicReportKpis')).toBeNull();
    expect(screen.queryByTestId('DynamicReportTable__bar')).toBeNull();
  });

  it('panel: the filters and toggles come from the contract; the toggles reach the query and none is forced', async () => {
    renderTb();
    await waitFor(() => expect(rowIds()).toEqual(['E1', 'S1']));
    expect(tbQueries()[0]).toMatchObject({ openingEntryAmount: 'true', showOnlyAccountsWithValue: 'true', groupBy: '', projectId: '', fromAccountId: '' });
    expect(screen.getByTestId('DynamicReportPanel__projectId')).toBeInTheDocument();
    expect(screen.getByTestId('DynamicReportPanel__fromAccountId')).toBeInTheDocument();
    expect(screen.queryByTestId('DynamicReportPanel__columns')).toBeNull(); // no period columns marker
    expect(screen.queryByTestId('DynamicReportPanel__productId')).toBeNull(); // not declared
    fireEvent.click(screen.getByTestId('DynamicReportPanel__toggle-showOnlyAccountsWithValue'));
    await waitFor(() => expect(tbQueries().at(-1).showOnlyAccountsWithValue).toBe('false'));
    fireEvent.click(screen.getByTestId('DynamicReportPanel__toggle-openingEntryAmount'));
    await waitFor(() => expect(tbQueries().at(-1)).toMatchObject({ openingEntryAmount: 'false', showOnlyAccountsWithValue: 'false' }));
  });

  it('comparison: closing compares, debit/credit only with "Comparar también movimientos", and that sends no request', async () => {
    renderTb();
    await waitFor(() => expect(rowIds()).toEqual(['E1', 'S1']));
    expect(screen.queryByTestId('DynamicReportPanel__compareMovements')).toBeNull(); // only with a comparison
    fireEvent.change(screen.getByTestId('DynamicReportPanel__compare'), { target: { value: 'same-last-year' } });
    await waitFor(() => expect(screen.getAllByText('dynamicReportCompared')).toHaveLength(1));
    const sent = tbQueries().length;
    fireEvent.click(screen.getByTestId('DynamicReportPanel__compareMovements'));
    await waitFor(() => expect(screen.getAllByText('dynamicReportCompared')).toHaveLength(3));
    expect(tbQueries()).toHaveLength(sent);
    // A TB variation is neutral: it has no trend, so no tone class
    expect(screen.getAllByTestId('DynamicReportTable__variation')[0].className).not.toMatch(/destructive|success/);
  });

  it('grouping: dimension rows open under the account; a contact row drills with its id, an empty one does not', async () => {
    renderTb();
    await waitFor(() => expect(rowIds()).toEqual(['E1', 'S1']));
    fireEvent.change(screen.getByTestId('DynamicReportPanel__groupBy'), { target: { value: 'bpartner' } });
    await waitFor(() => expect(rowIds()).toEqual(['E1', 'S1', 'S1|B1', 'S1|'])); // the account starts open
    expect(tbQueries().at(-1).groupBy).toBe('bpartner');
    expect(screen.getByTestId('DynamicReportView__chip-groupBy')).toBeInTheDocument();
    // S1 (leaf account) and the contact row are drillable; the empty-dimension one is not.
    expect(screen.getAllByTestId('DynamicReportTable__ledger')).toHaveLength(2);
    fireEvent.click(screen.getAllByTestId('DynamicReportTable__ledger')[1]);
    await waitFor(() => expect(queriesTo('report-general-ledger')).toHaveLength(1));
    expect(queriesTo('report-general-ledger')[0]).toMatchObject({ accountId: 'S1', fromAccountId: '430', toAccountId: '430', bPartnerId: 'B1', openingEntryAmount: 'true' });
  });

  it('balance: out of balance is an alert; with a dimension filter or account range it is only a note', async () => {
    queryAnswer = tbAnswer({ balanced: false });
    renderTb();
    await waitFor(() => expect(screen.getByTestId('DynamicReportBalance__error')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('DynamicReportPanel__projectId')); // the stub commits one item
    await waitFor(() => expect(screen.getByTestId('DynamicReportBalance__partial')).toBeInTheDocument());
    expect(screen.queryByTestId('DynamicReportBalance__error')).toBeNull();
  });

  it('the export sends the rows on screen as visibleNodeIds, and compareMovements; the P&L sends neither', async () => {
    renderTb();
    await waitFor(() => expect(rowIds()).toEqual(['E1', 'S1']));
    fireEvent.click(screen.getByTestId('DynamicReportView__export-pdf'));
    await waitFor(() => expect(apiFetchMock.mock.calls.some(([u]) => u.endsWith('/render'))).toBe(true));
    const body = (id) => JSON.parse(apiFetchMock.mock.calls.filter(([u]) => u === `/api/reports/${id}/render`).at(-1)[1].body).params;
    expect(body('report-trial-balance')).toMatchObject({ visibleNodeIds: 'E1,S1', compareMovements: 'false' });
    // Collapse all: only the roots are visible, and that is what prints.
    fireEvent.click(screen.getByTestId('DynamicReportPanel__collapseAll'));
    fireEvent.click(screen.getByTestId('DynamicReportView__export-xlsx'));
    await waitFor(() => expect(body('report-trial-balance').visibleNodeIds).toBe('E1'));
    cleanup();
    queryAnswer = (params) => json({ kind: 'tree', periods: TOTAL_PERIOD, rows: withVariation(TREE) });
    renderView();
    await waitFor(() => expect(rowIds()).toEqual(['E1', 'C1']));
    fireEvent.click(screen.getByTestId('DynamicReportView__export-pdf'));
    await waitFor(() => expect(apiFetchMock.mock.calls.some(([u]) => u === '/api/reports/profit-loss/render')).toBe(true));
    expect(body('profit-loss')).not.toHaveProperty('visibleNodeIds');
    expect(body('profit-loss')).not.toHaveProperty('compareMovements');
  });

  it('a filter change is timed with the Trial Balance filter types', async () => {
    renderTb();
    await waitFor(() => expect(rowIds()).toEqual(['E1', 'S1']));
    fireEvent.click(screen.getByTestId('DynamicReportPanel__projectId'));
    await waitFor(() => expect(trackMock.mock.calls.filter(([e]) => e === 'report_filter_applied').map(([, p]) => p.type)).toContain('project'));
  });
});

// ETP-6083 — the Balance Sheet: a balance AT A DATE on the period tree, everything it needs declared by its contract.
describe('DynamicReportView — Balance Sheet (ETP-6083)', () => {
  const ENDS = ['today', 'lastMonthEnd', 'lastQuarterEnd', 'lastFiscalYearEnd'];
  const BS = {
    id: 'balance-sheet',
    category: 'finance',
    title: { es_ES: 'Balance de Situación' },
    balanceCheck: true,
    sections: [{ id: 'periodo', label: { es_ES: 'Periodo' } }, { id: 'agrupacion', label: { es_ES: 'Agrupación' } }, { id: 'comparacion', label: { es_ES: 'Comparación' } }],
    parameters: [
      { name: 'orgId', type: 'search', selector: 'org', hidden: true },
      { name: 'dateFrom', type: 'date', role: 'ledgerStart', label: { es_ES: 'Fecha de Inicio' } },
      { name: 'dateTo', type: 'date', shortcuts: ENDS, label: { es_ES: 'Fecha de Fin' } },
      { name: 'compareTo', type: 'toggle', compareModes: { sly: 'sameDateLastYear', prev: 'previousFiscalYearClose' } },
      { name: 'bPartnerId', type: 'search', selector: 'bpartner', label: { es_ES: 'Contacto' } },
      { name: 'productId', type: 'search', selector: 'product-all', label: { es_ES: 'Producto' } },
      { name: 'splitBy', type: 'string', hidden: true },
      {
        name: 'accountLevel',
        default: 'C',
        options: [
          { value: 'G', maxIndent: 0, dynamicOnly: true, label: { es_ES: 'Grupo' } },
          { value: 'P', maxIndent: 1, dynamicOnly: true, label: { es_ES: 'Epígrafe' } },
          { value: 'E', legacyOnly: true, label: { es_ES: 'Epígrafe (clásico)' } },
          { value: 'C', label: { es_ES: 'Cuenta' } },
          { value: 'D', legacyOnly: true, label: { es_ES: 'Desglose' } },
          { value: 'S', label: { es_ES: 'Subcuenta' } },
        ],
      },
    ],
  };
  const BS_ACCESS = { ...FULL_ACCESS, 'balance-sheet': 'full' };
  const renderBs = (props = {}) => renderView({ report: BS, reportAccess: BS_ACCESS, ...props });
  const bsQueries = () => queriesTo('balance-sheet');
  const ONE_DAY = (n, sly, prev) => ({
    amount: n,
    sly: { amount: sly, variationAmount: n - sly, variationPct: 10, trend: null },
    prev: { amount: prev, variationAmount: n - prev, variationPct: 5, trend: null },
  });
  // 129: the posted part is 0, everything is calculated on the fly (what the live company showed).
  const RESULT_CELL = { ...ONE_DAY(37504, 24811, 20000), result: { onTheFly: 37504, posted: 0, sly: { onTheFly: 24811, posted: 0 }, prev: { onTheFly: 5000, posted: 15000 } } };
  const row = (r, cell) => ({ ...r, amount: cell.amount, cells: [cell] });
  const BS_ROWS = [
    row({ node_id: 'A1', parentId: null, elementlevel: 'E', value: 'A', name: 'ACTIVO', sign: 'D', group: 'Activo', isGroupStart: true }, ONE_DAY(700, 600, 500)),
    row({ node_id: 'A2', parentId: 'A1', elementlevel: 'E', value: 'A.I', name: 'Inmovilizado', sign: 'D', group: 'Activo' }, ONE_DAY(700, 600, 500)),
    row({ node_id: '213', parentId: 'A2', elementlevel: 'C', value: '213', name: 'Maquinaria', sign: 'D', group: 'Activo' }, ONE_DAY(1000, 900, 800)),
    row({ node_id: '281', parentId: 'A2', elementlevel: 'C', value: '281', name: 'Amortización acumulada', sign: 'D', group: 'Activo' }, ONE_DAY(-300, -300, -300)),
    row({ node_id: 'P1', parentId: null, elementlevel: 'E', value: 'P', name: 'PATRIMONIO NETO', sign: 'C', group: 'Pasivo', isGroupStart: true }, ONE_DAY(37504, 24811, 20000)),
    row({ node_id: 'P2', parentId: 'P1', elementlevel: 'E', value: 'P.I', name: 'Resultado', sign: 'C', group: 'Pasivo' }, ONE_DAY(37504, 24811, 20000)),
    row({ node_id: '129', parentId: 'P2', elementlevel: 'C', value: '129', name: 'Resultados del ejercicio', sign: 'C', group: 'Pasivo', result: { onTheFly: 37504, posted: 0 } }, RESULT_CELL),
  ];
  const BALANCED = { balanced: true, activo: 700, pnPasivo: 700, diff: 0 };
  const bsAnswer = (balance = BALANCED) => (params) => json({
    kind: 'tree',
    periods: [{ idx: 0, dateFrom: params.dateFrom, dateTo: params.dateTo, partial: false }],
    hiddenCount: 0,
    rows: BS_ROWS,
    balance,
  });
  const ids = () => rowIds();
  const sent = (name) => trackMock.mock.calls.filter(([event]) => event === name).map(([, props]) => props);
  const quiet = () => new Promise((r) => setTimeout(r, 450)); // longer than the query debounce
  const openNode = async (testId) => {
    await waitFor(() => expect(ids()).toContain(testId));
    return within(screen.getAllByTestId('DynamicReportTable__row').find((r) => r.dataset.nodeId === testId));
  };

  beforeEach(() => { queryAnswer = bsAnswer(); });

  describe('opening and the panel', () => {
    it('is the balance at Hasta: the query reads from the start of the fiscal year, the period chip is "balance at"', async () => {
      renderBs();
      await waitFor(() => expect(bsQueries()).toHaveLength(1));
      expect(bsQueries()[0]).toMatchObject({ dateFrom: '2026-07-01', dateTo: '2026-11-03', columns: 'total' });
      expect(bsQueries()[0].periods).toBe('2026-07-01..2026-11-03|2025-11-03..2025-11-03|2026-06-30..2026-06-30');
      expect(screen.getByTestId('DynamicReportView__chip-period')).toHaveTextContent('dynamicReportAsOfChip');
      expect(screen.getByTestId('DynamicReportView__chip-period')).toHaveTextContent('03/11/2026');
      expect(screen.getByTestId('DynamicReportView__chip-period')).not.toHaveTextContent('dynamicReportPeriodChip');
    });

    it('Desde is labelled as the ledger start, with its hint, and the Hasta shortcuts replace Mes / Trimestre / Año', async () => {
      renderBs();
      await waitFor(() => expect(bsQueries()).toHaveLength(1));
      expect(screen.getByText('dynamicReportLedgerStart')).toBeInTheDocument();
      expect(screen.getByTestId('DynamicReportPanel__ledgerStartHint')).toHaveTextContent('dynamicReportLedgerStartHint');
      for (const kind of ENDS) expect(screen.getByTestId(`DynamicReportPanel__shortcut-${kind}`)).toBeInTheDocument();
      for (const gone of ['month', 'quarter', 'year']) expect(screen.queryByTestId(`DynamicReportPanel__shortcut-${gone}`)).toBeNull();
      expect(screen.getByTestId('DynamicReportPanel__shortcut-today')).toHaveAttribute('aria-pressed', 'true');
    });

    it('each shortcut sets Hasta to its date, and Desde follows the fiscal year of that date', async () => {
      renderBs();
      await waitFor(() => expect(bsQueries()).toHaveLength(1));
      const click = (kind) => fireEvent.click(screen.getByTestId(`DynamicReportPanel__shortcut-${kind}`));
      click('lastMonthEnd');
      await waitFor(() => expect(bsQueries().at(-1)).toMatchObject({ dateFrom: '2026-07-01', dateTo: '2026-10-31' }));
      expect(screen.getByTestId('DynamicReportPanel__shortcut-lastMonthEnd')).toHaveAttribute('aria-pressed', 'true');
      click('lastQuarterEnd');
      await waitFor(() => expect(bsQueries().at(-1).dateTo).toBe('2026-09-30'));
      // The last COMPLETED fiscal year ends 30 June 2026 (never "31 December"): Desde moves to that year's start.
      click('lastFiscalYearEnd');
      await waitFor(() => expect(bsQueries().at(-1)).toMatchObject({ dateFrom: '2025-07-01', dateTo: '2026-06-30' }));
      expect(screen.getByTestId('DynamicReportPanel__dateFrom')).toHaveValue('2025-07-01');
      click('today');
      await waitFor(() => expect(bsQueries().at(-1)).toMatchObject({ dateFrom: '2026-07-01', dateTo: '2026-11-03' }));
    });

    it('with no completed fiscal year the last-fiscal-year shortcut is disabled and does nothing', async () => {
      years = [JULY_YEARS[0]]; // only the year that contains today: none has ended
      renderBs();
      await waitFor(() => expect(bsQueries()).toHaveLength(1));
      const button = screen.getByTestId('DynamicReportPanel__shortcut-lastFiscalYearEnd');
      expect(button).toBeDisabled();
      fireEvent.click(button);
      await quiet();
      expect(bsQueries()).toHaveLength(1);
      expect(screen.getByTestId('DynamicReportPanel__shortcut-lastMonthEnd')).not.toBeDisabled();
    });

    it('Desde is clamped into the fiscal year of Hasta, and editing it sends no request', async () => {
      renderBs();
      await waitFor(() => expect(bsQueries()).toHaveLength(1));
      const from = screen.getByTestId('DynamicReportPanel__dateFrom');
      fireEvent.change(from, { target: { value: '2026-05-01' } }); // before the year start
      await waitFor(() => expect(from).toHaveValue('2026-07-01'));
      fireEvent.change(from, { target: { value: '2026-09-15' } }); // inside the year: kept
      await waitFor(() => expect(from).toHaveValue('2026-09-15'));
      fireEvent.change(from, { target: { value: '2026-12-01' } }); // after Hasta
      await waitFor(() => expect(from).toHaveValue('2026-07-01'));
      await quiet();
      expect(bsQueries()).toHaveLength(1);
    });

    it('a deep link with a Desde outside the fiscal year of Hasta shows it clamped, like an edit', async () => {
      renderBs({ search: 'dateFrom=2025-03-01&dateTo=2026-11-03' });
      await waitFor(() => expect(screen.getByTestId('DynamicReportPanel__dateFrom')).toHaveValue('2026-07-01'));
    });

    it('offers Grupo / Epígrafe / Cuenta / Subcuenta and hides the legacy-only Epígrafe and Desglose', async () => {
      renderBs();
      await waitFor(() => expect(bsQueries()).toHaveLength(1));
      const options = [...screen.getByTestId('DynamicReportPanel__level').querySelectorAll('option')].map((o) => [o.value, o.textContent]);
      expect(options).toEqual([['G', 'Grupo'], ['P', 'Epígrafe'], ['C', 'Cuenta'], ['S', 'Subcuenta']]);
    });

    it('the comparison options name the date they compare with, from the contract modes', async () => {
      renderBs();
      await waitFor(() => expect(bsQueries()).toHaveLength(1));
      const options = [...screen.getByTestId('DynamicReportPanel__compare').querySelectorAll('option')].map((o) => [o.value, o.textContent]);
      expect(options).toEqual([
        ['', 'dynamicReportNoComparison'],
        ['same-last-year', 'dynamicReportSameDateLastYear:03/11/2025'],
        ['previous', 'dynamicReportPreviousFiscalYearClose:30/06/2026'],
      ]);
      // Moving Hasta moves the compared dates.
      fireEvent.click(screen.getByTestId('DynamicReportPanel__shortcut-lastMonthEnd'));
      await waitFor(() => expect(screen.getByTestId('DynamicReportPanel__compare').textContent).toContain('dynamicReportSameDateLastYear:31/10/2025'));
    });
  });

  describe('the tree', () => {
    it('folds by Grupo (indent 0), Epígrafe (indent 1) and Cuenta, from the contract options', async () => {
      renderBs();
      await waitFor(() => expect(ids()).toEqual(['A1', 'A2', '213', '281', 'P1', 'P2', '129'])); // default: Cuenta
      fireEvent.change(screen.getByTestId('DynamicReportPanel__level'), { target: { value: 'G' } });
      await waitFor(() => expect(ids()).toEqual(['A1', 'P1']));
      fireEvent.change(screen.getByTestId('DynamicReportPanel__level'), { target: { value: 'P' } });
      await waitFor(() => expect(ids()).toEqual(['A1', 'A2', 'P1', 'P2']));
      fireEvent.change(screen.getByTestId('DynamicReportPanel__level'), { target: { value: 'C' } });
      await waitFor(() => expect(ids()).toEqual(['A1', 'A2', '213', '281', 'P1', 'P2', '129']));
      expect(bsQueries()).toHaveLength(1); // folding never asks again
    });

    it('a contra account keeps its negative sign in the cell', async () => {
      renderBs();
      const contra = await openNode('281');
      expect(contra.getAllByTestId('DynamicReportTable__cellLedger')[0]).toHaveTextContent('-300');
    });

    it('has no KPI strip and no bars, and a variation carries no trend colour', async () => {
      renderBs();
      await waitFor(() => expect(ids()).toContain('213'));
      expect(screen.queryByTestId('DynamicReportKpis')).toBeNull();
      fireEvent.change(screen.getByTestId('DynamicReportPanel__compare'), { target: { value: 'same-last-year' } });
      await waitFor(() => expect(screen.getAllByTestId('DynamicReportTable__variation').length).toBeGreaterThan(0));
      for (const cell of screen.getAllByTestId('DynamicReportTable__variation')) expect(cell.className).not.toMatch(/destructive|success/);
    });

    it('a comparison names its single date in the header and chip, and sends no request', async () => {
      renderBs();
      await waitFor(() => expect(ids()).toContain('213'));
      fireEvent.change(screen.getByTestId('DynamicReportPanel__compare'), { target: { value: 'previous' } });
      await waitFor(() => expect(screen.getByTestId('DynamicReportTable__comparedLabel')).toHaveTextContent('(30/06/2026)'));
      expect(screen.getByTestId('DynamicReportView__chip-compare')).toHaveTextContent('30/06/2026');
      expect(screen.getByTestId('DynamicReportView__chip-compare')).not.toHaveTextContent('–');
      expect(bsQueries()).toHaveLength(1);
    });
  });

  describe('the balance check', () => {
    it('balanced: one success line', async () => {
      renderBs();
      expect(await screen.findByTestId('DynamicReportBalance__ok')).toHaveTextContent('dynamicReportSheetBalanced');
    });

    it('unbalanced: an alert with the assets, the equity and the difference', async () => {
      queryAnswer = bsAnswer({ balanced: false, activo: 1000, pnPasivo: 987.5, diff: 12.5 });
      renderBs();
      const alert = await screen.findByTestId('DynamicReportBalance__error');
      expect(alert).toHaveAttribute('role', 'alert');
      expect(alert).toHaveTextContent('dynamicReportSheetUnbalanced');
      expect(alert).toHaveTextContent('dynamicReportSheetDiff:1.000,00,987,50,12,50');
    });

    it('with a contact filter the mismatch is only a note; with a product filter it adds the opening-balance note', async () => {
      queryAnswer = bsAnswer({ balanced: false, activo: 1000, pnPasivo: 987.5, diff: 12.5 });
      renderBs();
      await screen.findByTestId('DynamicReportBalance__error');
      fireEvent.click(screen.getByTestId('DynamicReportPanel__bPartnerId'));
      const note = await screen.findByTestId('DynamicReportBalance__partial');
      expect(note).toHaveTextContent('dynamicReportSheetPartial');
      expect(note).not.toHaveTextContent('dynamicReportSheetProductNote');
      expect(screen.queryByTestId('DynamicReportBalance__error')).toBeNull();
      fireEvent.click(screen.getByTestId('DynamicReportPanel__productId'));
      await waitFor(() => expect(screen.getByTestId('DynamicReportBalance__partial')).toHaveTextContent('dynamicReportSheetProductNote'));
    });

    it('no balance in the answer (a core without balanceCheck): no line at all', async () => {
      queryAnswer = (params) => json({ kind: 'tree', periods: [{ idx: 0, dateFrom: params.dateFrom, dateTo: params.dateTo, partial: false }], hiddenCount: 0, rows: BS_ROWS });
      renderBs();
      await waitFor(() => expect(ids()).toContain('213'));
      expect(screen.queryByTestId('DynamicReportBalance__ok')).toBeNull();
      expect(screen.queryByTestId('DynamicReportBalance__error')).toBeNull();
    });
  });

  describe('the ledger of an account', () => {
    const lines = (rowsOfLedger, opening) => ({ kind: 'rows', rows: rowsOfLedger, openingRows: [{ value: '213', openingtotal: opening }] });
    const LINE = { value: '213', dateacct: '2026-09-14T22:00:00.000Z', fact_acct_group_id: 'G1', groupbyname: 'Acme', amtacctdr: 1500, amtacctcr: 0 };

    it('reads from Desde to Hasta with the opening entry, and its closing matches the amount clicked', async () => {
      ledgerAnswer = () => lines([LINE], -500); // -500 + 1500 = 1000 = the 213 amount
      renderBs();
      const leaf = await openNode('213');
      fireEvent.click(leaf.getByTestId('DynamicReportTable__ledger'));
      await waitFor(() => expect(queriesTo('report-general-ledger')).toHaveLength(1));
      expect(queriesTo('report-general-ledger')[0]).toMatchObject({ accountId: '213', dateFrom: '2026-07-01', dateTo: '2026-11-03', openingEntryAmount: 'true' });
      expect(await screen.findByTestId('DynamicDrillPanel__closingCheck')).toHaveTextContent('dynamicReportClosingMatches');
    });

    it('says so when the closing differs from the amount clicked', async () => {
      ledgerAnswer = () => lines([LINE], 0); // 1500 against 1000
      renderBs();
      const leaf = await openNode('213');
      fireEvent.click(leaf.getByTestId('DynamicReportTable__ledger'));
      expect(await screen.findByTestId('DynamicDrillPanel__closingCheck')).toHaveTextContent('dynamicReportClosingDiffers');
    });

    it('a Desde edited inside the year is where the ledger starts', async () => {
      ledgerAnswer = () => lines([LINE], -500);
      renderBs();
      await waitFor(() => expect(ids()).toContain('213'));
      fireEvent.change(screen.getByTestId('DynamicReportPanel__dateFrom'), { target: { value: '2026-09-15' } });
      fireEvent.click((await openNode('213')).getByTestId('DynamicReportTable__ledger'));
      await waitFor(() => expect(queriesTo('report-general-ledger')).toHaveLength(1));
      expect(queriesTo('report-general-ledger')[0]).toMatchObject({ dateFrom: '2026-09-15', dateTo: '2026-11-03' });
    });

    it('the amount cell of the current column honours Desde too, not only the account name', async () => {
      ledgerAnswer = () => lines([LINE], -500);
      renderBs();
      await waitFor(() => expect(ids()).toContain('213'));
      fireEvent.change(screen.getByTestId('DynamicReportPanel__dateFrom'), { target: { value: '2026-09-15' } });
      fireEvent.click((await openNode('213')).getAllByTestId('DynamicReportTable__cellLedger')[0]);
      await waitFor(() => expect(queriesTo('report-general-ledger')).toHaveLength(1));
      expect(queriesTo('report-general-ledger')[0]).toMatchObject({ dateFrom: '2026-09-15', dateTo: '2026-11-03' });
    });

    it('a compared cell opens the ledger up to its one-day date, from the start of that fiscal year', async () => {
      ledgerAnswer = () => lines([LINE], -500);
      renderBs();
      await waitFor(() => expect(ids()).toContain('213'));
      fireEvent.change(screen.getByTestId('DynamicReportPanel__compare'), { target: { value: 'previous' } });
      const leaf = await openNode('213');
      fireEvent.click(leaf.getAllByTestId('DynamicReportTable__cellLedger')[1]); // [current, compared]
      await waitFor(() => expect(queriesTo('report-general-ledger')).toHaveLength(1));
      expect(queriesTo('report-general-ledger')[0]).toMatchObject({ dateFrom: '2025-07-01', dateTo: '2026-06-30' });
    });
  });

  describe('the result (129) panel', () => {
    const resultRow = () => openNode('129');
    const openResult = async () => {
      fireEvent.click((await resultRow()).getByTestId('DynamicReportTable__ledger'));
      return screen.findByTestId('DynamicResultPanel');
    };

    it('opens the result panel, not the ledger, with posted, calculated and the amount in the report', async () => {
      renderBs();
      const panel = await openResult();
      expect(panel).toBeInTheDocument();
      expect(screen.getByTestId('SheetTitle__result')).toHaveTextContent('129 - Resultados del ejercicio');
      expect(screen.getByTestId('DynamicResultPanel__posted')).toHaveTextContent('0,00');
      expect(screen.getByTestId('DynamicResultPanel__onTheFly')).toHaveTextContent('37.504,00');
      expect(screen.getByTestId('DynamicResultPanel__total')).toHaveTextContent('37.504,00');
      expect(queriesTo('report-general-ledger')).toHaveLength(0);
    });

    it('"Open Profit and Loss" goes to the P&L from the start of the fiscal year of Hasta, with the org', async () => {
      renderBs();
      await openResult();
      const href = new URL(screen.getByTestId('DynamicResultPanel__openPnl').getAttribute('href'), 'http://x');
      expect(href.pathname).toMatch(/\/report-viewer$/);
      expect(Object.fromEntries(href.searchParams)).toEqual({ report: 'profit-loss', category: 'finance', dateFrom: '2026-07-01', dateTo: '2026-11-03', orgId: 'O1' });
    });

    it('carries the contact and product filters into the P&L link', async () => {
      renderBs();
      await waitFor(() => expect(ids()).toContain('129'));
      fireEvent.click(screen.getByTestId('DynamicReportPanel__bPartnerId'));
      fireEvent.click(screen.getByTestId('DynamicReportPanel__productId'));
      await waitFor(() => expect(bsQueries().at(-1)).toMatchObject({ bPartnerId: 'B1', productId: 'B1' }));
      await openResult();
      const href = new URL(screen.getByTestId('DynamicResultPanel__openPnl').getAttribute('href'), 'http://x');
      expect(href.searchParams.get('bPartnerId')).toBe('B1');
      expect(href.searchParams.get('productId')).toBe('B1');
    });

    it('emits report_drilldown with type "result"', async () => {
      renderBs();
      await openResult();
      expect(sent('report_drilldown')).toContainEqual(expect.objectContaining({ type: 'result', outcome: 'success' }));
    });

    it('the ledger button closes the panel and opens the ledger of the posted part', async () => {
      ledgerAnswer = () => ({ kind: 'rows', rows: [], openingRows: [] });
      renderBs();
      await openResult();
      fireEvent.click(screen.getByTestId('DynamicResultPanel__openLedger'));
      await waitFor(() => expect(queriesTo('report-general-ledger')).toHaveLength(1));
      expect(queriesTo('report-general-ledger')[0]).toMatchObject({ accountId: '129', dateTo: '2026-11-03' });
      await waitFor(() => expect(screen.queryByTestId('DynamicResultPanel')).toBeNull());
      // The ledger holds only the posted part (0): its closing is compared with that, not with the 37.504 the row shows.
      expect(await screen.findByTestId('DynamicDrillPanel__closingCheck')).toHaveTextContent('dynamicReportClosingMatches');
    });

    it('without access to the General Ledger the panel still opens, but has no ledger button', async () => {
      renderBs({ reportAccess: { 'balance-sheet': 'full' } });
      await openResult();
      expect(screen.queryByTestId('DynamicResultPanel__openLedger')).toBeNull();
    });

    it('a compared cell explains the compared figures (cells[i].result.sly / .prev) at their own date', async () => {
      renderBs();
      await waitFor(() => expect(ids()).toContain('129'));
      fireEvent.change(screen.getByTestId('DynamicReportPanel__compare'), { target: { value: 'previous' } });
      fireEvent.click((await resultRow()).getAllByTestId('DynamicReportTable__cellLedger')[1]);
      await screen.findByTestId('DynamicResultPanel');
      expect(screen.getByTestId('DynamicResultPanel__posted')).toHaveTextContent('15.000,00');
      expect(screen.getByTestId('DynamicResultPanel__onTheFly')).toHaveTextContent('5.000,00');
      const href = new URL(screen.getByTestId('DynamicResultPanel__openPnl').getAttribute('href'), 'http://x');
      expect(href.searchParams.get('dateTo')).toBe('2026-06-30');
      expect(href.searchParams.get('dateFrom')).toBe('2025-07-01');
    });

    it('a compared cell under same-date-last-year uses the sly figures', async () => {
      renderBs();
      await waitFor(() => expect(ids()).toContain('129'));
      fireEvent.change(screen.getByTestId('DynamicReportPanel__compare'), { target: { value: 'same-last-year' } });
      fireEvent.click((await resultRow()).getAllByTestId('DynamicReportTable__cellLedger')[1]);
      await screen.findByTestId('DynamicResultPanel');
      expect(screen.getByTestId('DynamicResultPanel__onTheFly')).toHaveTextContent('24.811,00');
      expect(screen.getByTestId('DynamicResultPanel__posted')).toHaveTextContent('0,00');
    });
  });

  describe('folded rows (ETP-6083: sub-accounts hidden by Cuenta / Epígrafe / Grupo)', () => {
    // 129 and 213 are parents at the default level: their leaf accounts (12901000 carries the result) are hidden.
    const FOLDED_ROWS = [
      BS_ROWS[0], BS_ROWS[1],
      row({ node_id: '213', parentId: 'A2', elementlevel: 'C', value: '213', name: 'Maquinaria', sign: 'D', group: 'Activo' }, ONE_DAY(1000, 900, 800)),
      row({ node_id: '2130', parentId: '213', elementlevel: 'S', value: '21300', name: 'Maquinaria a', sign: 'D', group: 'Activo' }, ONE_DAY(600, 500, 400)),
      row({ node_id: '2131', parentId: '213', elementlevel: 'S', value: '21310', name: 'Maquinaria b', sign: 'D', group: 'Activo' }, ONE_DAY(400, 400, 400)),
      BS_ROWS[4], BS_ROWS[5],
      row({ node_id: '129', parentId: 'P2', elementlevel: 'C', value: '129', name: 'Resultados del ejercicio', sign: 'C', group: 'Pasivo' }, ONE_DAY(37504, 24811, 20000)),
      row({ node_id: '12901', parentId: '129', elementlevel: 'S', value: '12901000', name: 'Resumen', sign: 'C', group: 'Pasivo', result: { onTheFly: 37504, posted: 0 } }, RESULT_CELL),
    ];
    beforeEach(() => { queryAnswer = (params) => json({ kind: 'tree', periods: [{ idx: 0, dateFrom: params.dateFrom, dateTo: params.dateTo, partial: false }], hiddenCount: 0, rows: FOLDED_ROWS, balance: BALANCED }); });

    it('a folded row whose hidden account carries the result opens the result panel, at every fold level', async () => {
      renderBs();
      for (const level of ['C', 'P', 'G']) {
        fireEvent.change(screen.getByTestId('DynamicReportPanel__level'), { target: { value: level } });
        const id = { C: '129', P: 'P2', G: 'P1' }[level];
        fireEvent.click((await openNode(id)).getByTestId('DynamicReportTable__ledger'));
        await screen.findByTestId('DynamicResultPanel');
        expect(screen.getByTestId('DynamicResultPanel__onTheFly')).toHaveTextContent('37.504,00');
        expect(screen.getByTestId('DynamicResultPanel__posted')).toHaveTextContent('0,00');
        expect(screen.getByTestId('DynamicResultPanel__total')).toHaveTextContent('37.504,00');
        fireEvent.keyDown(screen.getByTestId('DynamicResultPanel'), { key: 'Escape' });
        await waitFor(() => expect(screen.queryByTestId('DynamicResultPanel')).toBeNull());
      }
    });

    it('a folded account opens the ledger of its sub-accounts as a code range', async () => {
      ledgerAnswer = () => ({ kind: 'rows', rows: [], openingRows: [] });
      renderBs();
      fireEvent.click((await openNode('213')).getByTestId('DynamicReportTable__ledger'));
      await waitFor(() => expect(queriesTo('report-general-ledger')).toHaveLength(1));
      expect(queriesTo('report-general-ledger')[0]).toMatchObject({ accountId: '', fromAccountId: '21300', toAccountId: '21310', dateTo: '2026-11-03' });
    });

    it('a row that holds the result and other accounts opens the ledger, compared without the calculated part', async () => {
      // P1 = 129's 37.504 + a capital account with 100 posted.
      const mixed = FOLDED_ROWS.map((r) => (r.node_id === 'P1' || r.node_id === 'P2' ? { ...r, amount: 37604, cells: [{ ...ONE_DAY(37604, 24811, 20000) }] } : r));
      mixed.push(row({ node_id: '100', parentId: 'P2', elementlevel: 'C', value: '100', name: 'Capital', sign: 'C', group: 'Pasivo' }, ONE_DAY(100, 100, 100)));
      queryAnswer = (params) => json({ kind: 'tree', periods: [{ idx: 0, dateFrom: params.dateFrom, dateTo: params.dateTo, partial: false }], hiddenCount: 0, rows: mixed, balance: BALANCED });
      ledgerAnswer = () => ({ kind: 'rows', rows: [], openingRows: [{ openingtotal: -100 }] });
      renderBs();
      fireEvent.change(screen.getByTestId('DynamicReportPanel__level'), { target: { value: 'G' } });
      fireEvent.click((await openNode('P1')).getByTestId('DynamicReportTable__ledger'));
      await waitFor(() => expect(queriesTo('report-general-ledger')).toHaveLength(1));
      expect(queriesTo('report-general-ledger')[0]).toMatchObject({ accountId: '', fromAccountId: '100', toAccountId: '12901000' });
      expect(screen.queryByTestId('DynamicResultPanel')).toBeNull();
      expect(await screen.findByTestId('DynamicDrillPanel__closingCheck')).toHaveTextContent('dynamicReportClosingMatches'); // 100 = 37.604 - 37.504
      expect(screen.getByTestId('DynamicDrillPanel__calculatedNote')).toBeInTheDocument();
    });

    it('a heading with no account under it stays plain text', async () => {
      renderBs();
      expect((await openNode('A1')).queryByTestId('DynamicReportTable__ledger')).toBeNull();
    });
  });

  describe('Profit & Loss is unchanged', () => {
    it('keeps Mes / Trimestre / Año, the period chip and the plain Desde, and opens no result panel', async () => {
      queryAnswer = () => json({ kind: 'tree', periods: TOTAL_PERIOD, rows: withVariation(TREE) }); // the P&L answer, not the Balance's
      renderView();
      await waitFor(() => expect(queries()).toHaveLength(1));
      for (const kind of ['month', 'quarter', 'year']) expect(screen.getByTestId(`DynamicReportPanel__shortcut-${kind}`)).toBeInTheDocument();
      expect(screen.queryByTestId('DynamicReportPanel__shortcut-today')).toBeNull();
      expect(screen.queryByTestId('DynamicReportPanel__ledgerStartHint')).toBeNull();
      expect(screen.getByTestId('DynamicReportView__chip-period')).toHaveTextContent('dynamicReportPeriodChip');
      expect(screen.queryByTestId('DynamicReportBalance__ok')).toBeNull();
      const options = [...screen.getByTestId('DynamicReportPanel__level').querySelectorAll('option')].map((o) => o.value);
      expect(options).toEqual(['E', 'C', 'S']);
      // A row is explained only when it carries a `result`: the P&L ledger link opens the ledger.
      fireEvent.click(screen.getByTestId('DynamicReportPanel__expandAll'));
      fireEvent.click(await screen.findByTestId('DynamicReportTable__ledger'));
      await waitFor(() => expect(queriesTo('report-general-ledger')).toHaveLength(1));
      expect(screen.queryByTestId('DynamicResultPanel')).toBeNull();
      expect(queriesTo('report-general-ledger')[0].openingEntryAmount).toBeUndefined();
    });
  });
});

describe('DynamicReportBalance — both balance shapes (ETP-6083, ETP-6084)', () => {
  it('Trial Balance shape: balanced, out of balance (alert) and partial (note) with its two differences', () => {
    const { rerender } = render(<DynamicReportBalance balance={{ balanced: true, debitCreditDiff: 0, closingDiff: 0 }} />);
    expect(screen.getByTestId('DynamicReportBalance__ok')).toHaveTextContent('dynamicReportBalanced');
    const off = { balanced: false, debitCreditDiff: 12.5, closingDiff: 3 };
    rerender(<DynamicReportBalance balance={off} />);
    expect(screen.getByTestId('DynamicReportBalance__error')).toHaveTextContent('dynamicReportUnbalanced');
    expect(screen.getByTestId('DynamicReportBalance__error')).toHaveTextContent('dynamicReportBalanceDiff:12,50,3,00');
    rerender(<DynamicReportBalance balance={off} partial />);
    expect(screen.getByTestId('DynamicReportBalance__partial')).toHaveTextContent('dynamicReportBalancePartial');
    expect(screen.queryByTestId('DynamicReportBalance__error')).toBeNull();
  });

  it('Balance Sheet shape: its own keys, and the product note only when partial AND product-filtered', () => {
    const off = { balanced: false, activo: 10, pnPasivo: 7, diff: 3 };
    const { rerender } = render(<DynamicReportBalance balance={off} productFiltered />);
    expect(screen.getByTestId('DynamicReportBalance__error')).toHaveTextContent('dynamicReportSheetUnbalanced');
    expect(screen.getByTestId('DynamicReportBalance__error')).not.toHaveTextContent('dynamicReportSheetProductNote'); // not partial: an error
    rerender(<DynamicReportBalance balance={off} partial />);
    expect(screen.getByTestId('DynamicReportBalance__partial')).toHaveTextContent('dynamicReportSheetPartial');
    expect(screen.getByTestId('DynamicReportBalance__partial')).not.toHaveTextContent('dynamicReportSheetProductNote');
    rerender(<DynamicReportBalance balance={off} partial productFiltered />);
    expect(screen.getByTestId('DynamicReportBalance__partial')).toHaveTextContent('dynamicReportSheetProductNote');
    rerender(<DynamicReportBalance balance={{ balanced: true, activo: 5, pnPasivo: 5, diff: 0 }} />);
    expect(screen.getByTestId('DynamicReportBalance__ok')).toHaveTextContent('dynamicReportSheetBalanced');
  });
});
