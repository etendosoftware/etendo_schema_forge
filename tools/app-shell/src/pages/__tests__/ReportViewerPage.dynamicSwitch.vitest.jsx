// @covers tools/app-shell/src/pages/ReportViewerPage.jsx
// @covers tools/app-shell/src/components/reports/dynamic/dynamicReports.js
import { render, screen, waitFor } from '@testing-library/react';
import { DYNAMIC_REPORT_IDS, opensDynamicView } from '@/components/reports/dynamic/dynamicReports.js';

let mockSearchParams = new URLSearchParams();
vi.mock('react-router-dom', () => ({ useSearchParams: () => [mockSearchParams, vi.fn()] }));
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
  fetchMyReportAccess: () => Promise.resolve({ reportAccess: { 'profit-loss': 'full', 'balance-sheet': 'full' } }),
}));
let mockFlagOn = false;
vi.mock('@/lib/flags', async (importOriginal) => ({
  ...(await importOriginal()),
  useFeatureFlag: (key) => (key === 'dynamic-reports' ? mockFlagOn : false),
}));

import ReportViewerPage from '../ReportViewerPage.jsx';

const REPORTS = [
  { id: 'profit-loss', title: { en_US: 'Profit & Loss' }, type: 'grouped', category: 'finance', outputs: ['pdf'], parameters: [] },
  { id: 'balance-sheet', title: { en_US: 'Balance Sheet' }, type: 'grouped', category: 'finance', outputs: ['pdf'], parameters: [] },
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

  it('flag on: a report without a dynamic view keeps the old viewer', async () => {
    mockFlagOn = true;
    open('balance-sheet');
    await waitFor(() => expect(screen.getByTestId('action-cancel')).toBeInTheDocument());
    expect(screen.queryByTestId('DynamicReportView')).not.toBeInTheDocument();
  });
});

describe('opensDynamicView', () => {
  it('needs both the flag and a listed report', () => {
    expect([...DYNAMIC_REPORT_IDS]).toEqual(['profit-loss']);
    expect(opensDynamicView('profit-loss', true)).toBe(true);
    expect(opensDynamicView('profit-loss', false)).toBe(false);
    expect(opensDynamicView('balance-sheet', true)).toBe(false);
    expect(opensDynamicView(null, true)).toBe(false);
  });
});
