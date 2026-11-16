// @covers tools/app-shell/src/components/reports/dynamic/DynamicReportView.jsx
// @covers tools/app-shell/src/components/reports/dynamic/DynamicReportPanel.jsx
// @covers tools/app-shell/src/components/reports/dynamic/DynamicReportTable.jsx
// @covers tools/app-shell/src/components/reports/dynamic/useReportDefaults.js
// @covers tools/app-shell/src/components/reports/dynamic/useAccountSplit.js
// @covers tools/app-shell/src/components/reports/dynamic/DynamicDrillPanel.jsx
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
  PopupMultiSelector: ({ label, onChange, 'data-testid': testId }) => (
    <button type="button" data-testid={testId} onClick={() => onChange('B1', 'Acme')}>{label}</button>
  ),
  buildReportFilename: (id, format) => `${id}.${format}`,
}));

import DynamicReportView from '../DynamicReportView.jsx';
import { LEDGER_LINE_CAP } from '../drillDown.js';

const REPORT = {
  id: 'profit-loss',
  category: 'finance',
  title: { es_ES: 'Pérdidas y Ganancias' },
  sections: [{ id: 'periodo', label: { es_ES: 'Periodo' } }, { id: 'agrupacion', label: { es_ES: 'Agrupación' } }, { id: 'comparacion', label: { es_ES: 'Comparación' } }],
  parameters: [
    { name: 'orgId', label: { es_ES: 'Organización' } },
    { name: 'dateFrom', label: { es_ES: 'Fecha de Inicio' } },
    { name: 'dateTo', label: { es_ES: 'Fecha de Fin' } },
    { name: 'bPartnerId', label: { es_ES: 'Contacto' } },
    { name: 'productId', label: { es_ES: 'Producto' } },
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
const renderView = (props = {}) => render(<DynamicReportView report={REPORT} onBack={vi.fn()} selectedOrgId="O1" reportAccess={FULL_ACCESS} {...props} />);
const rowIds = () => screen.queryAllByTestId('DynamicReportTable__row').map((r) => r.dataset.nodeId);

beforeEach(() => {
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
  it('with a split dimension, a leaf account lists its parts by that dimension', async () => {
    renderView();
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

  it('two changes inside the debounce: only the one whose request ran is reported', async () => {
    renderView();
    await waitFor(() => expect(sent('report_opened')).toHaveLength(1));
    fireEvent.click(screen.getByTestId('DynamicReportPanel__shortcut-month'));
    fireEvent.change(screen.getByTestId('DynamicReportPanel__compare'), { target: { value: 'previous' } });
    await waitFor(() => expect(queries()).toHaveLength(2)); // the opening one and the month shortcut
    await settle();
    // The comparison is emitted at once (no request to time); the period when its result lands.
    expect(sent('report_filter_applied').map((e) => e.type)).toEqual(['comparison', 'period']);
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
  const choose = (testId, value) => fireEvent.change(screen.getByTestId(testId), { target: { value } });
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
      await waitFor(() => expect(queries().at(-1)).toMatchObject({ columns: 'month', dateFrom: '2025-07-01', hiddenCount: '6' }));
      expect(queries().at(-1).periods.split(',')).toHaveLength(7);
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

    it('the hidden-periods note carries the count from the answer; none when nothing is hidden', async () => {
      await renderPeriods();
      expect(screen.queryByTestId('DynamicReportView__hiddenNote')).toBeNull();
      choose('DynamicReportPanel__year', 'Y25');
      choose('DynamicReportPanel__columns', 'month');
      expect(await screen.findByTestId('DynamicReportView__hiddenNote')).toHaveTextContent('dynamicReportHiddenPeriods:6');
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
      for (const format of ['xlsx', 'csv']) {
        const params = await exportAs(format);
        expect(params.periods.split(',')).toHaveLength(13);
        expect(params.hiddenCount).toBe('0');
        expect(params.compareMode).toBe('prev');
        expect(params.columns).toBe('month');
      }
    });

    it('compareMode follows the toggle, and is none without a comparison', async () => {
      await renderPeriods();
      expect((await exportAs('pdf')).compareMode).toBe('none');
      choose('DynamicReportPanel__compare', 'same-last-year');
      expect((await exportAs('csv')).compareMode).toBe('sly');
    });

    it('over 25 buckets Excel and CSV are disabled with a translated message; PDF still works; Total mode has no cap', async () => {
      await renderPeriods();
      choose('DynamicReportPanel__columns', 'month');
      fireEvent.change(screen.getByTestId('DynamicReportPanel__dateFrom'), { target: { value: '2020-01-01' } });
      await waitFor(() => expect(queries().at(-1)).toMatchObject({ columns: 'month', dateFrom: '2020-01-01' }));
      await settle();
      expect(screen.getByTestId('DynamicReportView__exportTooLong')).toHaveTextContent('dynamicReportExportTooLong');
      expect(screen.getByTestId('DynamicReportView__export-xlsx')).toBeDisabled();
      expect(screen.getByTestId('DynamicReportView__export-csv')).toBeDisabled();
      expect(screen.getByTestId('DynamicReportView__export-pdf')).toBeEnabled();
      expect((await exportAs('pdf')).periods.split(',')).toHaveLength(7);
      choose('DynamicReportPanel__columns', 'total');
      await waitFor(() => expect(screen.queryByTestId('DynamicReportView__exportTooLong')).toBeNull());
      expect(screen.getByTestId('DynamicReportView__export-xlsx')).toBeEnabled();
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
      expect([...subs].slice(0, 4).map((th) => th.textContent)).toEqual(['dynamicReportAmount', 'dynamicReportCompared', 'dynamicReportVariation', 'dynamicReportVariationPct']);
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
      await renderPeriods();
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
      await renderPeriods();
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
