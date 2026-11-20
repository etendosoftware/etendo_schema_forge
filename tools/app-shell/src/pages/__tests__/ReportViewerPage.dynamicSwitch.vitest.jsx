// @covers tools/app-shell/src/pages/ReportViewerPage.jsx
// @covers tools/app-shell/src/components/reports/dynamic/dynamicReports.js
// @covers tools/app-shell/src/components/reports/dynamic/DynamicReportBadge.jsx
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DYNAMIC_REPORT_IDS, opensDynamicView } from '@/components/reports/dynamic/dynamicReports.js';

let mockSearchParams = new URLSearchParams();
let lastView = null;
const setSearchParamsSpy = vi.fn();
// Stateful, so picking a report from the list re-renders the page like the router would.
vi.mock('react-router-dom', async () => {
  const { useState } = await import('react');
  return {
    useSearchParams: () => {
      const [value, set] = useState(mockSearchParams);
      return [value, (next, opts) => { setSearchParamsSpy(next, opts); set(next); }];
    },
  };
});
// The view itself is covered in its own suite; here only what the page hands it.
vi.mock('@/components/reports/dynamic/DynamicReportView.jsx', () => ({
  default: (props) => {
    lastView = props;
    const { report, source, search, onBack } = props;
    return (
    <div data-testid="DynamicReportView" data-source={source} data-search={search}>
      <h2 data-testid="DynamicReportView__title">{report.title.en_US}</h2>
      <button type="button" data-testid="DynamicReportView__back" onClick={onBack}>back</button>
    </div>
    );
  },
}));
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));
vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ token: 't', selectedRole: { orgList: [] }, selectedOrg: { id: 'org1' } }),
  useWindowAccess: () => 'full',
  WindowAccessGuard: () => null,
}));
vi.mock('@/components/layout/PageMetaContext', () => ({ useSetPageMeta: vi.fn() }));
vi.mock('@/components/layout/FavoritesContext', () => ({ useFavorites: () => ({ toggleFavorite: vi.fn(), isFavorite: () => false }) }));
vi.mock('@/lib/rolesApi.js', () => ({
  fetchMyReportAccess: () => Promise.resolve({ reportAccess: { 'profit-loss': 'full', 'sales-report': 'full', 'report-trial-balance': 'full' } }),
}));
let mockFlagOn = false;
vi.mock('@/lib/flags', async (importOriginal) => ({
  ...(await importOriginal()),
  useFeatureFlag: (key) => (key === 'dynamic-reports' || key === 'dynamic-balance-reports' ? mockFlagOn : false),
}));

import ReportViewerPage from '../ReportViewerPage.jsx';

const REPORTS = [
  { id: 'profit-loss', title: { en_US: 'Profit & Loss' }, type: 'grouped', category: 'finance', outputs: ['pdf'], parameters: [] },
  { id: 'sales-report', title: { en_US: 'Sales Report' }, type: 'grouped', category: 'finance', outputs: ['pdf'], parameters: [] },
  { id: 'report-trial-balance', title: { en_US: 'Trial Balance' }, type: 'listing', category: 'finance', outputs: ['pdf'], parameters: [] },
];

function open(reportId) {
  mockSearchParams = new URLSearchParams(`report=${reportId}`);
  return render(<ReportViewerPage />);
}

describe('ReportViewerPage — dynamic-reports switch (ETP-6080)', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: () => Promise.resolve(REPORTS) });
  });
  afterEach(() => vi.restoreAllMocks());

  it('flag on: Profit & Loss opens the dynamic view', async () => {
    mockFlagOn = true;
    open('profit-loss');
    expect(await screen.findByTestId('DynamicReportView')).toBeInTheDocument();
    expect(screen.getByTestId('DynamicReportView__title')).toHaveTextContent('Profit & Loss');
  });

  it('flag off: Profit & Loss opens the old viewer', async () => {
    mockFlagOn = false;
    open('profit-loss');
    await waitFor(() => expect(screen.getByTestId('action-cancel')).toBeInTheDocument());
    expect(screen.queryByTestId('DynamicReportView')).not.toBeInTheDocument();
  });

  it('flag on: the Trial Balance opens the dynamic view only when its descriptor carries tree "chart"; otherwise (or flag off) the old viewer (ETP-6084)', async () => {
    const chart = { ...REPORTS[2], tree: 'chart' };
    mockFlagOn = true;
    globalThis.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([REPORTS[0], REPORTS[1], chart]) });
    open('report-trial-balance');
    expect(await screen.findByTestId('DynamicReportView')).toBeInTheDocument();
    cleanup();
    // An older core: no `tree` in the descriptor, so the old viewer.
    open('report-trial-balance');
    cleanup();
    globalThis.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(REPORTS) });
    open('report-trial-balance');
    await waitFor(() => expect(screen.getByTestId('action-cancel')).toBeInTheDocument());
    expect(screen.queryByTestId('DynamicReportView')).not.toBeInTheDocument();
    cleanup();
    mockFlagOn = false;
    globalThis.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([REPORTS[0], REPORTS[1], chart]) });
    open('report-trial-balance');
    await waitFor(() => expect(screen.getByTestId('action-cancel')).toBeInTheDocument());
    expect(screen.queryByTestId('DynamicReportView')).not.toBeInTheDocument();
  });

  it('flag on: a report without a dynamic view keeps the old viewer', async () => {
    mockFlagOn = true;
    open('sales-report');
    await waitFor(() => expect(screen.getByTestId('action-cancel')).toBeInTheDocument());
    expect(screen.queryByTestId('DynamicReportView')).not.toBeInTheDocument();
  });
});

describe('ReportViewerPage — how the dynamic view was opened (F10 source)', () => {
  beforeEach(() => {
    mockFlagOn = true;
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: () => Promise.resolve(REPORTS) });
  });
  afterEach(() => vi.restoreAllMocks());

  it('a URL that already names the report is a deep link', async () => {
    open('profit-loss');
    expect(await screen.findByTestId('DynamicReportView')).toHaveAttribute('data-source', 'deep_link');
  });

  it('a report picked from the list was opened from the menu', async () => {
    mockSearchParams = new URLSearchParams('category=finance');
    render(<ReportViewerPage />);
    fireEvent.click(await screen.findByText('Profit & Loss'));
    expect(await screen.findByTestId('DynamicReportView')).toHaveAttribute('data-source', 'menu');
  });
});

describe('ReportViewerPage — the catalog marks interactive reports', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: () => Promise.resolve(REPORTS) });
    mockSearchParams = new URLSearchParams('category=finance');
  });
  afterEach(() => vi.restoreAllMocks());

  it('flag on: only the report with an interactive view carries the tag', async () => {
    mockFlagOn = true;
    render(<ReportViewerPage />);
    await screen.findByText('Sales Report');
    const tags = screen.getAllByTestId('DynamicReportBadge');
    expect(tags).toHaveLength(1); // the Trial Balance's descriptor here has no `tree`: not interactive
    expect(tags[0].closest('button')).toHaveTextContent('Profit & Loss');
    expect(tags[0]).toHaveAttribute('aria-label', 'dynamicReportBadge: dynamicReportBadgeHint');
  });

  it('flag off: no report carries the tag', async () => {
    mockFlagOn = false;
    render(<ReportViewerPage />);
    await screen.findByText('Sales Report');
    expect(screen.queryByTestId('DynamicReportBadge')).toBeNull();
  });
});

// ETP-6239 — the dynamic view keeps its selections in the URL; they belong to that report only.
describe('ReportViewerPage — URL selections do not leak between reports (ETP-6239)', () => {
  beforeEach(() => {
    mockFlagOn = true;
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: () => Promise.resolve(REPORTS) });
  });
  afterEach(() => vi.restoreAllMocks());

  const LEAKY = 'report=profit-loss&category=finance&compare=same-last-year&columns=month&splitBy=product&dateFrom=2026-02-01&dateTo=2026-09-30';

  it('hands the view the current query string', async () => {
    mockSearchParams = new URLSearchParams(LEAKY);
    render(<ReportViewerPage />);
    expect((await screen.findByTestId('DynamicReportView')).dataset.search).toBe(LEAKY);
  });

  it('opening a dynamic report from the catalog starts with only the category and the report', async () => {
    mockSearchParams = new URLSearchParams('category=finance&dateFrom=2026-02-01&columns=month&compare=previous&foo=1');
    render(<ReportViewerPage />);
    fireEvent.click(await screen.findByText('Profit & Loss'));
    expect((await screen.findByTestId('DynamicReportView')).dataset.search).toBe('category=finance&report=profit-loss');
  });

  it('after Cancelar nothing but the category is left, so the next report opens clean', async () => {
    mockSearchParams = new URLSearchParams(LEAKY);
    render(<ReportViewerPage />);
    await screen.findByTestId('DynamicReportView');
    fireEvent.click(screen.getByTestId('DynamicReportView__back'));
    fireEvent.click(await screen.findByText('Profit & Loss'));
    expect((await screen.findByTestId('DynamicReportView')).dataset.search).toBe('category=finance&report=profit-loss');
  });

  it('the view writes its selections through the router, replacing the entry', async () => {
    mockSearchParams = new URLSearchParams('report=profit-loss&category=finance');
    render(<ReportViewerPage />);
    await screen.findByTestId('DynamicReportView');
    expect(lastView.onSearchChange).toBeInstanceOf(Function);
    setSearchParamsSpy.mockClear();
    act(() => lastView.onSearchChange('category=finance&compare=previous&report=profit-loss'));
    expect(setSearchParamsSpy).toHaveBeenCalledWith(expect.any(URLSearchParams), { replace: true });
    await waitFor(() => expect(screen.getByTestId('DynamicReportView').dataset.search).toBe('category=finance&compare=previous&report=profit-loss'));
  });
});

describe('opensDynamicView', () => {
  it('needs both the flag and a listed report', () => {
    expect([...DYNAMIC_REPORT_IDS]).toEqual(['profit-loss', 'report-trial-balance', 'balance-sheet']);
    const ALL = { 'dynamic-reports': true, 'dynamic-balance-reports': true };
    expect(opensDynamicView('report-trial-balance', ALL)).toBe(false); // needs tree: 'chart'
    expect(opensDynamicView('report-trial-balance', ALL, { tree: 'chart' })).toBe(true);
    expect(opensDynamicView('report-trial-balance', {}, { tree: 'chart' })).toBe(false);
    expect(opensDynamicView('profit-loss', ALL)).toBe(true);
    expect(opensDynamicView('profit-loss', {})).toBe(false);
    expect(opensDynamicView('sales-report', ALL)).toBe(false);
    expect(opensDynamicView(null, ALL)).toBe(false);
  });

  it('the P&L follows dynamic-reports, the Balance Sheet and the Trial Balance follow dynamic-balance-reports (ETP-6083)', () => {
    const pnlOnly = { 'dynamic-reports': true };
    const balancesOnly = { 'dynamic-balance-reports': true };
    expect(opensDynamicView('profit-loss', pnlOnly)).toBe(true);
    expect(opensDynamicView('profit-loss', balancesOnly)).toBe(false);
    expect(opensDynamicView('balance-sheet', pnlOnly)).toBe(false);
    expect(opensDynamicView('balance-sheet', balancesOnly)).toBe(true);
    expect(opensDynamicView('report-trial-balance', pnlOnly, { tree: 'chart' })).toBe(false);
    expect(opensDynamicView('report-trial-balance', balancesOnly, { tree: 'chart' })).toBe(true);
  });
});
