// ETP-5516: the report catalog gallery renders one width-driven `GalleryGrid` per category
// (shared with the Products gallery) instead of viewport-breakpoint `grid-cols-*` classes, so
// the column count follows the container width and no card goes below the 220 px minimum.
// jsdom does no layout: the real column count per viewport / rail state is guarded by
// e2e/tests/flows/platform/gallery-min-width.mocked.spec.js.

import { render, screen, waitFor, within } from '@testing-library/react';
import { mockFullReportAccess } from './reportViewerTestHelpers.js';

let mockSearchParams = new URLSearchParams();
const mockSetSearchParams = vi.fn();

vi.mock('react-router-dom', () => ({
  useSearchParams: () => [mockSearchParams, mockSetSearchParams],
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({
    token: 'test-token',
    selectedRole: { orgList: [] },
    selectedOrg: { id: 'org1' },
  }),
  useWindowAccess: () => 'full',
  WindowAccessGuard: (props) => (
    <div data-testid="window-access-guard" data-window-id={props.windowId} />
  ),
}));

// See reportViewerTestHelpers.js (mockFullReportAccess) for the ETP-5402 rationale.
vi.mock('@/lib/rolesApi.js', () => ({
  fetchMyReportAccess: () => Promise.resolve({ reportAccess: mockFullReportAccess }),
}));

vi.mock('@/components/layout/PageMetaContext', () => ({
  useSetPageMeta: vi.fn(),
}));

vi.mock('@/components/layout/FavoritesContext', () => ({
  useFavorites: () => ({
    toggleFavorite: vi.fn(),
    isFavorite: () => false,
  }),
}));

vi.mock('@/components/contract-ui/ProductSearchDrawer.jsx', () => ({
  default: () => null,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }) => <button {...props}>{children}</button>,
}));
vi.mock('@/components/ui/date-field', () => ({
  DateField: () => <input type="date" data-testid="date-field" />,
}));
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <h2>{children}</h2>,
}));

import ReportViewerPage from '../ReportViewerPage.jsx';
import { GALLERY_GRID_TEMPLATE_COLUMNS } from '@/components/ui/gallery-grid';

const VIEW_MODE_KEY = 'viewMode:report-catalog';
const BREAKPOINT_COLS = /(?:^|\s)(?:sm|md|lg|xl|2xl):grid-cols-/;

const SALES_REPORTS = [
  { id: 'gg-sales-1', title: { en_US: 'Sales One' }, type: 'listing', category: 'sales', outputs: ['pdf'] },
  { id: 'gg-sales-2', title: { en_US: 'Sales Two' }, type: 'listing', category: 'sales', outputs: ['pdf'] },
  { id: 'gg-sales-3', title: { en_US: 'Sales Three' }, type: 'listing', category: 'sales', outputs: ['pdf'] },
];
const PURCHASE_REPORTS = [
  { id: 'gg-purchase-1', title: { en_US: 'Purchase One' }, type: 'listing', category: 'purchases', outputs: ['pdf'] },
];

function mockCatalog(reports) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: () => Promise.resolve(reports) });
}

async function renderCatalog(reports) {
  mockCatalog(reports);
  const view = render(<ReportViewerPage />);
  await waitFor(() => expect(screen.getByText(reports[0].title.en_US)).toBeInTheDocument());
  return view;
}

describe('ReportViewerPage — report gallery grid (ETP-5516)', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
    mockSetSearchParams.mockClear();
    localStorage.removeItem(VIEW_MODE_KEY);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem(VIEW_MODE_KEY);
  });

  it('renders every report card inside a gallery-grid with the shared track template', async () => {
    await renderCatalog(SALES_REPORTS);
    const grid = screen.getByTestId('gallery-grid');
    expect(grid.style.gridTemplateColumns).toBe(GALLERY_GRID_TEMPLATE_COLUMNS);
    expect(grid.children).toHaveLength(SALES_REPORTS.length);
    for (const report of SALES_REPORTS) {
      expect(within(grid).getByText(report.title.en_US)).toBeInTheDocument();
    }
  });

  it('renders one gallery-grid per category, each holding only its own cards', async () => {
    await renderCatalog([...SALES_REPORTS, ...PURCHASE_REPORTS]);
    const grids = screen.getAllByTestId('gallery-grid');
    expect(grids).toHaveLength(2);

    const salesGrid = grids.find((g) => within(g).queryByText('Sales One'));
    const purchaseGrid = grids.find((g) => within(g).queryByText('Purchase One'));
    expect(salesGrid.children).toHaveLength(SALES_REPORTS.length);
    expect(purchaseGrid.children).toHaveLength(PURCHASE_REPORTS.length);
    // A short category keeps the same width-driven template (auto-fill keeps empty tracks).
    expect(purchaseGrid.style.gridTemplateColumns).toBe(GALLERY_GRID_TEMPLATE_COLUMNS);
  });

  it('carries no viewport-breakpoint column classes in the gallery', async () => {
    const { container } = await renderCatalog([...SALES_REPORTS, ...PURCHASE_REPORTS]);
    for (const el of container.querySelectorAll('[class]')) {
      expect(el.getAttribute('class')).not.toMatch(BREAKPOINT_COLS);
    }
  });

  it('renders a single report inside a gallery-grid', async () => {
    await renderCatalog(PURCHASE_REPORTS);
    expect(screen.getByTestId('gallery-grid').children).toHaveLength(1);
  });

  it('renders no gallery-grid when the catalog is empty', async () => {
    mockCatalog([]);
    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('noResults')).toBeInTheDocument());
    expect(screen.queryByTestId('gallery-grid')).not.toBeInTheDocument();
  });

  it('renders no gallery-grid in list view mode', async () => {
    localStorage.setItem(VIEW_MODE_KEY, 'list');
    await renderCatalog(SALES_REPORTS);
    expect(screen.queryByTestId('gallery-grid')).not.toBeInTheDocument();
  });
});
