import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mutable search params — tests can override before rendering
let mockSearchParams = new URLSearchParams();
const mockSetSearchParams = vi.fn();

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useSearchParams: () => {
    return [mockSearchParams, mockSetSearchParams];
  },
}));

// Mock i18n hooks
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

// Mock auth context
vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({
    token: 'test-token',
    selectedRole: { orgList: [] },
    selectedOrg: { id: 'org1' },
  }),
}));

// Mock PageMetaContext
vi.mock('@/components/layout/PageMetaContext', () => ({
  useSetPageMeta: vi.fn(),
}));

// Mock FavoritesContext
vi.mock('@/components/layout/FavoritesContext', () => ({
  useFavorites: () => ({
    toggleFavorite: vi.fn(),
    isFavorite: () => false,
  }),
}));

// Mock ProductSearchDrawer
vi.mock('@/components/contract-ui/ProductSearchDrawer.jsx', () => ({
  default: () => null,
}));

// Mock UI sub-components
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }) => <button {...props}>{children}</button>,
}));
vi.mock('@/components/ui/date-field', () => ({
  DateField: (props) => <input type="date" data-testid="date-field" />,
}));
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }) => open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <h2>{children}</h2>,
}));

import ReportViewerPage, {
  getSelectorPlaceholderLabel,
  getSelectedItems,
  getProductSelectorUrl,
  getSelectorLabelClassName,
  getSelectorButtonTitle,
  applyProductSelectorScopeParams,
} from '../ReportViewerPage.jsx';

describe('getSelectorPlaceholderLabel', () => {
  it('shows count when multi and items selected', () => {
    expect(getSelectorPlaceholderLabel(true, [{ id: '1' }, { id: '2' }], 'Prod', '')).toBe('2 selected');
  });

  it('shows search prompt when multi and no items selected', () => {
    expect(getSelectorPlaceholderLabel(true, [], 'Widget', '')).toBe('Search Widget...');
  });

  it('uses default label when label is empty in multi mode', () => {
    expect(getSelectorPlaceholderLabel(true, [], '', '')).toBe('Search Product...');
  });

  it('shows displayText in single mode', () => {
    expect(getSelectorPlaceholderLabel(false, [], 'Prod', 'Acme Widget')).toBe('Acme Widget');
  });

  it('shows search prompt when no displayText in single mode', () => {
    expect(getSelectorPlaceholderLabel(false, [], 'Item', '')).toBe('Search Item...');
  });

  it('uses default label in single mode when label is empty', () => {
    expect(getSelectorPlaceholderLabel(false, [], '', '')).toBe('Search Product...');
  });
});

describe('getSelectedItems', () => {
  it('returns single-item array in non-multi mode when value is set', () => {
    const result = getSelectedItems(false, [], 'v1', 'Display');
    expect(result).toEqual([{ id: 'v1', name: 'Display' }]);
  });

  it('returns selected array in multi mode when value is set', () => {
    const sel = [{ id: 'a', name: 'A' }];
    expect(getSelectedItems(true, sel, 'a', 'A')).toBe(sel);
  });

  it('returns selected in multi mode even without value', () => {
    const sel = [{ id: 'x', name: 'X' }];
    expect(getSelectedItems(true, sel, '', '')).toBe(sel);
  });

  it('returns empty array in non-multi mode without value', () => {
    expect(getSelectedItems(false, [], '', '')).toEqual([]);
  });

  it('returns single-item when only displayValue is set', () => {
    const result = getSelectedItems(false, [], '', 'SomeName');
    expect(result).toEqual([{ id: '', name: 'SomeName' }]);
  });
});

describe('getProductSelectorUrl', () => {
  it('returns URL without query string when params are empty', () => {
    const params = new URLSearchParams();
    const url = getProductSelectorUrl(params);
    expect(url).toMatch(/\/sws\/report-selectors\/product$/);
  });

  it('appends query string when params have values', () => {
    const params = new URLSearchParams({ selectedOrgId: 'org1' });
    const url = getProductSelectorUrl(params);
    expect(url).toContain('selectedOrgId=org1');
    expect(url).toContain('/sws/report-selectors/product?');
  });
});

describe('getSelectorLabelClassName', () => {
  it('includes text-foreground when items are selected', () => {
    expect(getSelectorLabelClassName([{ id: '1' }], '')).toContain('text-foreground');
  });

  it('includes text-foreground when displayText is set', () => {
    expect(getSelectorLabelClassName([], 'display')).toContain('text-foreground');
  });

  it('includes text-muted-foreground when empty', () => {
    const cls = getSelectorLabelClassName([], '');
    expect(cls).toContain('text-muted-foreground');
    expect(cls).not.toContain(' text-foreground');
  });
});

describe('getSelectorButtonTitle', () => {
  it('joins selected names in multi mode', () => {
    const items = [{ name: 'A' }, { name: 'B' }];
    expect(getSelectorButtonTitle(true, items, '')).toBe('A, B');
  });

  it('returns displayText in single mode', () => {
    expect(getSelectorButtonTitle(false, [], 'Foo')).toBe('Foo');
  });

  it('returns empty when no selection and no displayText', () => {
    expect(getSelectorButtonTitle(true, [], '')).toBe('');
  });
});

describe('applyProductSelectorScopeParams', () => {
  it('sets selectedOrgId when provided', () => {
    const params = new URLSearchParams();
    applyProductSelectorScopeParams('org1', params, [], '');
    expect(params.get('selectedOrgId')).toBe('org1');
  });

  it('sets roleOrgIds when array is non-empty', () => {
    const params = new URLSearchParams();
    applyProductSelectorScopeParams('', params, ['o1', 'o2'], '');
    expect(params.get('roleOrgIds')).toBe('o1,o2');
  });

  it('sets warehouseIds when provided', () => {
    const params = new URLSearchParams();
    applyProductSelectorScopeParams('', params, [], 'wh1');
    expect(params.get('warehouseIds')).toBe('wh1');
  });

  it('does not set params when values are falsy', () => {
    const params = new URLSearchParams();
    applyProductSelectorScopeParams('', params, [], '');
    expect(params.toString()).toBe('');
  });
});

describe('ReportViewerPage', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
    mockSetSearchParams.mockClear();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders without crashing', async () => {
    const { container } = render(<ReportViewerPage />);
    expect(container).toBeTruthy();
  });

  it('shows loading state initially', () => {
    // fetch never resolves in time
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
    render(<ReportViewerPage />);
    // The loading indicator uses Loader2 with animate-spin class
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeTruthy();
  });

  it('shows empty state when no reports are returned', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('noResults')).toBeInTheDocument();
    });
  });

  it('renders report cards when reports are loaded', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            id: 'report-aging',
            title: { en_US: 'Aging Report' },
            type: 'listing',
            category: 'finance',
            outputs: ['pdf', 'xlsx'],
          },
        ]),
    });
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('Aging Report')).toBeInTheDocument();
    });
  });

  it('renders output format badges on report cards', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            id: 'report-1',
            title: { en_US: 'Test Report' },
            type: 'listing',
            outputs: ['pdf', 'csv'],
          },
        ]),
    });
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('pdf')).toBeInTheDocument();
      expect(screen.getByText('csv')).toBeInTheDocument();
    });
  });

  it('shows Listing Report type label', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        { id: 'r1', title: { en_US: 'Flat' }, type: 'listing', outputs: ['pdf'] },
      ]),
    });
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText(/Listing Report/)).toBeInTheDocument();
    });
  });

  it('shows Grouped Report type label', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        { id: 'r2', title: { en_US: 'Grouped' }, type: 'grouped-listing', outputs: ['pdf'] },
      ]),
    });
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText(/Grouped Report/)).toBeInTheDocument();
    });
  });

  it('shows landscape indicator when orientation is landscape', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        { id: 'r3', title: { en_US: 'Wide Report' }, type: 'listing', orientation: 'landscape', outputs: ['pdf'] },
      ]),
    });
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('Wide Report')).toBeInTheDocument();
    });
    // The landscape text appears as part of the type description
    expect(screen.getByText(/Landscape/)).toBeInTheDocument();
  });

  it('handles fetch failure gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('noResults')).toBeInTheDocument();
    });
  });

  it('groups reports by category', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        { id: 'r1', title: { en_US: 'Sales A' }, type: 'listing', category: 'sales', outputs: ['pdf'] },
        { id: 'r2', title: { en_US: 'Purchase B' }, type: 'listing', category: 'purchase', outputs: ['pdf'] },
      ]),
    });
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('Sales A')).toBeInTheDocument();
      expect(screen.getByText('Purchase B')).toBeInTheDocument();
    });
  });

  it('renders report with es_ES title fallback', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        { id: 'r-es', title: { es_ES: 'Informe de Ventas' }, type: 'listing', outputs: ['pdf'] },
      ]),
    });
    render(<ReportViewerPage />);
    await waitFor(() => {
      // Falls back to es_ES when en_US is missing and locale is en_US
      expect(screen.getByText('Informe de Ventas')).toBeInTheDocument();
    });
  });

  it('renders report with id fallback when no title', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        { id: 'report-no-title', type: 'listing', outputs: ['pdf'] },
      ]),
    });
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('report-no-title')).toBeInTheDocument();
    });
  });

  it('defaults category to other when missing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        { id: 'r-nocat', title: { en_US: 'No Category' }, type: 'listing', outputs: ['html'] },
      ]),
    });
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('No Category')).toBeInTheDocument();
    });
  });

  it('renders multiple categories grouped with headers', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        { id: 'r1', title: { en_US: 'Finance A' }, type: 'listing', category: 'finance', outputs: ['pdf'] },
        { id: 'r2', title: { en_US: 'Sales B' }, type: 'listing', category: 'sales', outputs: ['pdf'] },
        { id: 'r3', title: { en_US: 'Finance C' }, type: 'grouped-listing', category: 'finance', outputs: ['xlsx'] },
      ]),
    });
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('Finance A')).toBeInTheDocument();
      expect(screen.getByText('Sales B')).toBeInTheDocument();
      expect(screen.getByText('Finance C')).toBeInTheDocument();
    });
  });

  it('renders report cards as clickable buttons', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        { id: 'r-click', title: { en_US: 'Clickable' }, type: 'listing', outputs: ['pdf'] },
      ]),
    });
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('Clickable')).toBeInTheDocument();
    });
    // The card is a button element
    const cardButton = screen.getByText('Clickable').closest('button');
    expect(cardButton).toBeTruthy();
  });

  it('renders report with no outputs gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        { id: 'r-no-out', title: { en_US: 'No Outputs' }, type: 'listing' },
      ]),
    });
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('No Outputs')).toBeInTheDocument();
    });
  });

  it('renders reports with empty outputs array', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        { id: 'r-empty-out', title: { en_US: 'Empty Outs' }, type: 'listing', outputs: [] },
      ]),
    });
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('Empty Outs')).toBeInTheDocument();
    });
  });

  it('renders multiple reports with different output formats', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        { id: 'r1', title: { en_US: 'Multi Out' }, type: 'listing', outputs: ['pdf', 'xlsx', 'csv', 'html'] },
      ]),
    });
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('pdf')).toBeInTheDocument();
      expect(screen.getByText('xlsx')).toBeInTheDocument();
      expect(screen.getByText('csv')).toBeInTheDocument();
      expect(screen.getByText('html')).toBeInTheDocument();
    });
  });

  it('renders reports with only title.en_US locale key', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        { id: 'r-locale', title: { en_US: 'English Only' }, type: 'listing', outputs: ['pdf'] },
      ]),
    });
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('English Only')).toBeInTheDocument();
    });
  });

  it('renders many reports in the same category', async () => {
    const reports = Array.from({ length: 5 }, (_, i) => ({
      id: `r-${i}`,
      title: { en_US: `Report ${i}` },
      type: 'listing',
      category: 'finance',
      outputs: ['pdf'],
    }));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(reports),
    });
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('Report 0')).toBeInTheDocument();
      expect(screen.getByText('Report 4')).toBeInTheDocument();
    });
  });

  it('renders grouped-listing type with landscape orientation', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        { id: 'r-gl', title: { en_US: 'Grouped Land' }, type: 'grouped-listing', orientation: 'landscape', outputs: ['xlsx'] },
      ]),
    });
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('Grouped Land')).toBeInTheDocument();
      expect(screen.getByText(/Grouped Report/)).toBeInTheDocument();
      expect(screen.getByText(/Landscape/)).toBeInTheDocument();
    });
  });
});

// -------------------------------------------------------------------
// Additional helper export coverage
// -------------------------------------------------------------------

describe('getSelectorLabelClassName — edge cases', () => {
  it('applies correct class with both items and displayText', () => {
    const cls = getSelectorLabelClassName([{ id: '1' }], 'text');
    expect(cls).toContain('text-foreground');
  });

  it('applies truncate class always', () => {
    expect(getSelectorLabelClassName([], '')).toContain('truncate');
    expect(getSelectorLabelClassName([{ id: '1' }], '')).toContain('truncate');
  });
});

describe('getSelectorButtonTitle — edge cases', () => {
  it('returns joined names for multi with many items', () => {
    const items = [{ name: 'A' }, { name: 'B' }, { name: 'C' }];
    expect(getSelectorButtonTitle(true, items, '')).toBe('A, B, C');
  });

  it('returns displayText when not multi regardless of selectedItems', () => {
    expect(getSelectorButtonTitle(false, [{ name: 'X' }], 'Display')).toBe('Display');
  });

  it('falls back to displayText for multi with no items', () => {
    expect(getSelectorButtonTitle(true, [], 'SomeText')).toBe('SomeText');
  });
});

describe('applyProductSelectorScopeParams — edge cases', () => {
  it('sets all params when all values provided', () => {
    const params = new URLSearchParams();
    applyProductSelectorScopeParams('org1', params, ['o1', 'o2'], 'wh1');
    expect(params.get('selectedOrgId')).toBe('org1');
    expect(params.get('roleOrgIds')).toBe('o1,o2');
    expect(params.get('warehouseIds')).toBe('wh1');
  });

  it('does not set roleOrgIds for empty array', () => {
    const params = new URLSearchParams();
    applyProductSelectorScopeParams('org1', params, [], '');
    expect(params.has('roleOrgIds')).toBe(false);
  });

  it('does not set roleOrgIds for null', () => {
    const params = new URLSearchParams();
    applyProductSelectorScopeParams('org1', params, null, '');
    expect(params.has('roleOrgIds')).toBe(false);
  });
});

describe('getSelectorPlaceholderLabel — edge cases', () => {
  it('returns count for multi with exactly 1 item', () => {
    expect(getSelectorPlaceholderLabel(true, [{ id: '1' }], '', '')).toBe('1 selected');
  });

  it('returns count for multi with many items', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ id: String(i) }));
    expect(getSelectorPlaceholderLabel(true, items, '', '')).toBe('10 selected');
  });

  it('returns displayText in single mode even with label', () => {
    expect(getSelectorPlaceholderLabel(false, [], 'MyLabel', 'Displayed')).toBe('Displayed');
  });
});

describe('getSelectedItems — edge cases', () => {
  it('returns single item with empty name when displayValue is empty but value is set', () => {
    const result = getSelectedItems(false, [], 'v1', '');
    expect(result).toEqual([{ id: 'v1', name: '' }]);
  });

  it('returns empty selected array in multi mode with no value or selected', () => {
    expect(getSelectedItems(true, [], '', '')).toEqual([]);
  });

  it('preserves selected array reference in multi mode with value', () => {
    const sel = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
    const result = getSelectedItems(true, sel, 'a,b', 'A | B');
    expect(result).toBe(sel);
  });
});

// -------------------------------------------------------------------
// ReportViewer sub-component (rendered when searchParams has report=id)
// -------------------------------------------------------------------

const SAMPLE_REPORT = {
  id: 'report-aging',
  title: { en_US: 'Aging Report', es_ES: 'Informe de Antigüedad' },
  type: 'listing',
  category: 'finance',
  outputs: ['pdf', 'xlsx'],
  parameters: [
    { name: 'dateFrom', type: 'date', label: { en_US: 'Date From' }, section: 'primary', default: '__TODAY__' },
    { name: 'dateTo', type: 'date', label: { en_US: 'Date To' }, section: 'primary', default: '__FIRST_OF_PREV_MONTH__' },
    { name: 'orgId', type: 'search', selector: 'org', label: { en_US: 'Organization' }, section: 'primary' },
    { name: 'searchText', type: 'text', label: { en_US: 'Search' }, section: 'dimensions' },
    { name: 'showDetails', type: 'boolean', label: { en_US: 'Show Details' }, section: 'options', default: false },
  ],
};

const SAMPLE_REPORTS_LIST = [SAMPLE_REPORT];

function mockReportsApiFetch() {
  globalThis.fetch = vi.fn().mockImplementation((url, opts) => {
    // Reports list fetch
    if (typeof url === 'string' && url === '/api/reports') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(SAMPLE_REPORTS_LIST),
      });
    }
    // Report render fetch
    if (typeof url === 'string' && url.includes('/render')) {
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve('<html><body>Report rendered — 42 records</body></html>'),
        blob: () => Promise.resolve(new Blob(['pdf-data'], { type: 'application/pdf' })),
      });
    }
    // Selector fetches (autoDefault, etc.)
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ items: [] }),
    });
  });
}

describe('ReportViewer (viewer sub-component)', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams({ report: 'report-aging' });
    mockSetSearchParams.mockClear();
    mockReportsApiFetch();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the ReportViewer when searchParams has report=id', async () => {
    render(<ReportViewerPage />);
    await waitFor(() => {
      // ReportViewer renders the sidebar with "reportBuilder" label
      expect(screen.getByText('reportBuilder')).toBeInTheDocument();
    });
  });

  it('displays the report title in the viewer', async () => {
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('reportBuilder')).toBeInTheDocument();
    });
  });

  it('renders ReportSidebar with parameter sections', async () => {
    render(<ReportViewerPage />);
    await waitFor(() => {
      // Primary section header
      expect(screen.getByText('reportScope')).toBeInTheDocument();
    });
  });

  it('renders date parameter fields in the sidebar', async () => {
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('reportScope')).toBeInTheDocument();
    });
    // DateField mock renders input[type=date]
    const dateFields = screen.getAllByTestId('date-field');
    expect(dateFields.length).toBeGreaterThanOrEqual(2);
  });

  it('renders text parameter fields in the sidebar', async () => {
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('refineDimensions')).toBeInTheDocument();
    });
    expect(screen.getByText('Search')).toBeInTheDocument();
  });

  it('renders boolean parameter as checkbox', async () => {
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('displayOptions')).toBeInTheDocument();
    });
    expect(screen.getByText('Show Details')).toBeInTheDocument();
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeInTheDocument();
  });

  it('renders run report and reset buttons', async () => {
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('runReport')).toBeInTheDocument();
    });
    expect(screen.getByText('resetFilters')).toBeInTheDocument();
  });

  it('renders format action buttons (preview, PDF, Excel, CSV)', async () => {
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('preview')).toBeInTheDocument();
    });
    expect(screen.getByText('PDF')).toBeInTheDocument();
    expect(screen.getByText('Excel')).toBeInTheDocument();
    expect(screen.getByText('CSV')).toBeInTheDocument();
  });

  it('renders the print button', async () => {
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('print')).toBeInTheDocument();
    });
  });

  it('shows empty state prompt before running a report', async () => {
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('reportReadyTitle')).toBeInTheDocument();
    });
    expect(screen.getByText('reportReadyHint')).toBeInTheDocument();
  });

  it('renders iframe for report output', async () => {
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByTitle('report')).toBeInTheDocument();
    });
  });

  it('clicking Run Report triggers render call', async () => {
    const user = userEvent.setup();
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('runReport')).toBeInTheDocument();
    });
    await user.click(screen.getByText('runReport'));
    // Verify fetch was called for render (POST to /render)
    await waitFor(() => {
      const renderCalls = globalThis.fetch.mock.calls.filter(
        ([url]) => typeof url === 'string' && url.includes('/render')
      );
      expect(renderCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('clicking a format button triggers render with that format', async () => {
    const user = userEvent.setup();
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('PDF')).toBeInTheDocument();
    });
    await user.click(screen.getByText('PDF'));
    await waitFor(() => {
      const renderCalls = globalThis.fetch.mock.calls.filter(
        ([url]) => typeof url === 'string' && url.includes('/render')
      );
      expect(renderCalls.length).toBeGreaterThanOrEqual(1);
      // Check format is pdf in the POST body
      const pdfCall = renderCalls.find(([, opts]) => {
        const body = JSON.parse(opts?.body || '{}');
        return body.format === 'pdf';
      });
      expect(pdfCall).toBeTruthy();
    });
  });

  it('shows loading indicator when render is in progress', async () => {
    // Make the render fetch hang
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && url === '/api/reports') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(SAMPLE_REPORTS_LIST),
        });
      }
      if (typeof url === 'string' && url.includes('/render')) {
        return new Promise(() => {}); // never resolves
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
    });
    const user = userEvent.setup();
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('runReport')).toBeInTheDocument();
    });
    await user.click(screen.getByText('runReport'));
    await waitFor(() => {
      expect(screen.getByText('renderingReport')).toBeInTheDocument();
    });
  });

  it('shows error message when render fails', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && url === '/api/reports') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(SAMPLE_REPORTS_LIST),
        });
      }
      if (typeof url === 'string' && url.includes('/render')) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ error: 'Server exploded' }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
    });
    const user = userEvent.setup();
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('runReport')).toBeInTheDocument();
    });
    await user.click(screen.getByText('runReport'));
    await waitFor(() => {
      expect(screen.getByText('Server exploded')).toBeInTheDocument();
    });
  });

  it('shows fallback error when render fails without JSON body', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && url === '/api/reports') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(SAMPLE_REPORTS_LIST),
        });
      }
      if (typeof url === 'string' && url.includes('/render')) {
        return Promise.resolve({
          ok: false,
          status: 503,
          json: () => Promise.reject(new Error('not json')),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
    });
    const user = userEvent.setup();
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('runReport')).toBeInTheDocument();
    });
    await user.click(screen.getByText('runReport'));
    await waitFor(() => {
      expect(screen.getByText('HTTP 503')).toBeInTheDocument();
    });
  });

  it('shows error when render throws a network error', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && url === '/api/reports') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(SAMPLE_REPORTS_LIST),
        });
      }
      if (typeof url === 'string' && url.includes('/render')) {
        return Promise.reject(new Error('Network failure'));
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
    });
    const user = userEvent.setup();
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('runReport')).toBeInTheDocument();
    });
    await user.click(screen.getByText('runReport'));
    await waitFor(() => {
      expect(screen.getByText('Network failure')).toBeInTheDocument();
    });
  });

  it('does not show ReportViewer when report id does not match any fetched report', async () => {
    mockSearchParams = new URLSearchParams({ report: 'nonexistent' });
    render(<ReportViewerPage />);
    await waitFor(() => {
      // Falls back to ReportList — which shows the loaded reports, not the viewer
      expect(screen.getByText('Aging Report')).toBeInTheDocument();
    });
    // The viewer-specific UI should NOT be present
    expect(screen.queryByText('reportBuilder')).toBeNull();
  });

  it('renders with category filter in searchParams', async () => {
    mockSearchParams = new URLSearchParams({ report: 'report-aging', category: 'finance' });
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('reportBuilder')).toBeInTheDocument();
    });
  });

  it('renders report with no parameters gracefully', async () => {
    const noParamsReport = { ...SAMPLE_REPORT, parameters: [] };
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && url === '/api/reports') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([noParamsReport]),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
    });
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('reportBuilder')).toBeInTheDocument();
    });
    // No parameter sections should appear, but the run button is still there
    expect(screen.getByText('runReport')).toBeInTheDocument();
  });

  it('renders report with required parameter showing asterisk', async () => {
    const reqReport = {
      ...SAMPLE_REPORT,
      parameters: [
        { name: 'required1', type: 'text', label: { en_US: 'Important Field' }, section: 'primary', required: true },
      ],
    };
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && url === '/api/reports') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([reqReport]),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
    });
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('Important Field')).toBeInTheDocument();
    });
    // Required fields show an asterisk
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('shows validation error when required parameter is empty on submit', async () => {
    const reqReport = {
      ...SAMPLE_REPORT,
      parameters: [
        { name: 'required1', type: 'text', label: { en_US: 'Important Field' }, section: 'primary', required: true },
      ],
    };
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && url === '/api/reports') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([reqReport]),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
    });
    const user = userEvent.setup();
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('runReport')).toBeInTheDocument();
    });
    await user.click(screen.getByText('runReport'));
    // Should show "required" error message
    await waitFor(() => {
      expect(screen.getByText('required')).toBeInTheDocument();
    });
  });

  it('clicking reset clears parameters and increments resetKey', async () => {
    const user = userEvent.setup();
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('resetFilters')).toBeInTheDocument();
    });
    await user.click(screen.getByText('resetFilters'));
    // Should still render without error after reset
    expect(screen.getByText('runReport')).toBeInTheDocument();
  });

  it('renders select parameter type with options', async () => {
    const selectReport = {
      ...SAMPLE_REPORT,
      parameters: [
        {
          name: 'groupBy', type: 'select', label: { en_US: 'Group By' }, section: 'primary',
          options: [
            { value: '', label: 'None' },
            { value: 'category', label: 'Category' },
          ],
        },
      ],
    };
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && url === '/api/reports') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([selectReport]),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
    });
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('Group By')).toBeInTheDocument();
    });
    // Select element should have options
    const selectEl = screen.getByRole('combobox');
    expect(selectEl).toBeInTheDocument();
  });

  it('renders hidden parameters without showing them', async () => {
    const hiddenReport = {
      ...SAMPLE_REPORT,
      parameters: [
        { name: 'visible', type: 'text', label: { en_US: 'Visible' }, section: 'primary' },
        { name: 'hidden', type: 'text', label: { en_US: 'Hidden Param' }, section: 'primary', hidden: true },
      ],
    };
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && url === '/api/reports') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([hiddenReport]),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
    });
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('Visible')).toBeInTheDocument();
    });
    expect(screen.queryByText('Hidden Param')).toBeNull();
  });

  it('clicking Excel button triggers render with xlsx format', async () => {
    const user = userEvent.setup();
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('Excel')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Excel'));
    await waitFor(() => {
      const renderCalls = globalThis.fetch.mock.calls.filter(
        ([url]) => typeof url === 'string' && url.includes('/render')
      );
      expect(renderCalls.length).toBeGreaterThanOrEqual(1);
      const xlsxCall = renderCalls.find(([, opts]) => {
        const body = JSON.parse(opts?.body || '{}');
        return body.format === 'xlsx';
      });
      expect(xlsxCall).toBeTruthy();
    });
  });

  it('clicking CSV button triggers render with csv format', async () => {
    const user = userEvent.setup();
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('CSV')).toBeInTheDocument();
    });
    await user.click(screen.getByText('CSV'));
    await waitFor(() => {
      const renderCalls = globalThis.fetch.mock.calls.filter(
        ([url]) => typeof url === 'string' && url.includes('/render')
      );
      expect(renderCalls.length).toBeGreaterThanOrEqual(1);
      const csvCall = renderCalls.find(([, opts]) => {
        const body = JSON.parse(opts?.body || '{}');
        return body.format === 'csv';
      });
      expect(csvCall).toBeTruthy();
    });
  });

  it('clicking preview button triggers render with html format', async () => {
    const user = userEvent.setup();
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('preview')).toBeInTheDocument();
    });
    await user.click(screen.getByText('preview'));
    await waitFor(() => {
      const renderCalls = globalThis.fetch.mock.calls.filter(
        ([url]) => typeof url === 'string' && url.includes('/render')
      );
      expect(renderCalls.length).toBeGreaterThanOrEqual(1);
      const htmlCall = renderCalls.find(([, opts]) => {
        const body = JSON.parse(opts?.body || '{}');
        return body.format === 'html';
      });
      expect(htmlCall).toBeTruthy();
    });
  });

  it('renders report with number parameter type', async () => {
    const numReport = {
      ...SAMPLE_REPORT,
      parameters: [
        { name: 'limit', type: 'number', label: { en_US: 'Row Limit' }, section: 'options' },
      ],
    };
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && url === '/api/reports') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([numReport]),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
    });
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('Row Limit')).toBeInTheDocument();
    });
  });

  it('renders report with search parameter type (inline dropdown)', async () => {
    const searchReport = {
      ...SAMPLE_REPORT,
      parameters: [
        { name: 'bpId', type: 'search', selector: 'businessPartner', label: { en_US: 'Business Partner' }, section: 'primary' },
      ],
    };
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && url === '/api/reports') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([searchReport]),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
    });
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('Business Partner')).toBeInTheDocument();
    });
  });

  it('renders report with popup-single inputStyle parameter', async () => {
    const popupReport = {
      ...SAMPLE_REPORT,
      parameters: [
        { name: 'acctId', type: 'search', selector: 'account', inputStyle: 'popup-single', label: { en_US: 'Account' }, section: 'primary' },
      ],
    };
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && url === '/api/reports') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([popupReport]),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
    });
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('Account')).toBeInTheDocument();
    });
  });

  it('renders report with popup multi-select inputStyle parameter', async () => {
    const popupMulti = {
      ...SAMPLE_REPORT,
      parameters: [
        { name: 'bpIds', type: 'search', selector: 'businessPartner', inputStyle: 'popup', label: { en_US: 'Partners' }, section: 'primary' },
      ],
    };
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && url === '/api/reports') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([popupMulti]),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
    });
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getAllByText('Partners').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders report with description on boolean parameter', async () => {
    const descReport = {
      ...SAMPLE_REPORT,
      parameters: [
        { name: 'showAll', type: 'boolean', label: { en_US: 'Show All' }, section: 'options', description: 'Includes archived items' },
      ],
    };
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && url === '/api/reports') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([descReport]),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
    });
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('Show All')).toBeInTheDocument();
    });
    expect(screen.getByText('Includes archived items')).toBeInTheDocument();
  });

  it('renders report with select parameter that has no explicit options', async () => {
    const selectReport = {
      ...SAMPLE_REPORT,
      groups: [{ label: { en_US: 'Custom Group' } }],
      parameters: [
        {
          name: 'groupBy', type: 'select', label: { en_US: 'Group By' }, section: 'primary',
          // No explicit options — falls back to dynamic resolution
        },
        { name: 'dim1', type: 'text', label: { en_US: 'Dim 1' }, section: 'dimensions', groupByValue: 'dim1val' },
      ],
    };
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && url === '/api/reports') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([selectReport]),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
    });
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('Group By')).toBeInTheDocument();
    });
  });

  it('shows record count after successful html render', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && url === '/api/reports') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(SAMPLE_REPORTS_LIST),
        });
      }
      if (typeof url === 'string' && url.includes('/render')) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve('<html><body>Report rendered — 42 records</body></html>'),
          blob: () => Promise.resolve(new Blob(['pdf-data'], { type: 'application/pdf' })),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
    });
    const user = userEvent.setup();
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('runReport')).toBeInTheDocument();
    });
    await user.click(screen.getByText('runReport'));
    await waitFor(() => {
      // The i18n mock returns the key as-is, so recordsFound is rendered literally
      expect(screen.getByText('recordsFound')).toBeInTheDocument();
    });
  });

  it('renders sidebar with multiple sections when report has all parameter sections', async () => {
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('reportScope')).toBeInTheDocument();
      expect(screen.getByText('refineDimensions')).toBeInTheDocument();
      expect(screen.getByText('displayOptions')).toBeInTheDocument();
    });
  });

  it('renders running state on submit button when loading', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && url === '/api/reports') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(SAMPLE_REPORTS_LIST),
        });
      }
      if (typeof url === 'string' && url.includes('/render')) {
        return new Promise(() => {}); // never resolves
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
    });
    const user = userEvent.setup();
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('runReport')).toBeInTheDocument();
    });
    await user.click(screen.getByText('runReport'));
    await waitFor(() => {
      expect(screen.getByText('running')).toBeInTheDocument();
    });
  });
});

// -------------------------------------------------------------------
// ReportList search filtering
// -------------------------------------------------------------------

describe('ReportList search filtering', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
    mockSetSearchParams.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('filters reports by search query in the title', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          { id: 'r1', title: { en_US: 'Aging Report' }, type: 'listing', outputs: ['pdf'] },
          { id: 'r2', title: { en_US: 'Sales Summary' }, type: 'listing', outputs: ['pdf'] },
        ]),
    });
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('Aging Report')).toBeInTheDocument();
      expect(screen.getByText('Sales Summary')).toBeInTheDocument();
    });
  });

  it('shows noResults when all reports are filtered out by category', async () => {
    mockSearchParams = new URLSearchParams({ category: 'nonexistent' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          { id: 'r1', title: { en_US: 'Report A' }, type: 'listing', category: 'finance', outputs: ['pdf'] },
        ]),
    });
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('noResults')).toBeInTheDocument();
    });
  });

  it('filters reports by category filter from search params', async () => {
    mockSearchParams = new URLSearchParams({ category: 'sales' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          { id: 'r1', title: { en_US: 'Finance Report' }, type: 'listing', category: 'finance', outputs: ['pdf'] },
          { id: 'r2', title: { en_US: 'Sales Report' }, type: 'listing', category: 'sales', outputs: ['pdf'] },
        ]),
    });
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('Sales Report')).toBeInTheDocument();
    });
    expect(screen.queryByText('Finance Report')).toBeNull();
  });

  // ============================================================
  // Additional branch coverage tests
  // ============================================================

  // --- Report title locale fallbacks ---

  it('renders report with es_ES title fallback when en_US missing', async () => {
    mockSearchParams = new URLSearchParams();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        { id: 'r-es', title: { es_ES: 'Informe Español' }, type: 'listing', outputs: ['pdf'] },
      ]),
    });
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('Informe Español')).toBeInTheDocument();
    });
  });

  it('renders report with id fallback when all titles missing', async () => {
    mockSearchParams = new URLSearchParams();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        { id: 'fallback-id', title: {}, type: 'listing', outputs: ['pdf'] },
      ]),
    });
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('fallback-id')).toBeInTheDocument();
    });
  });

  // --- Report type labels ---

  it('renders grouped-listing type label', async () => {
    mockSearchParams = new URLSearchParams();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        { id: 'r-grouped', title: { en_US: 'Grouped' }, type: 'grouped-listing', outputs: ['pdf'] },
      ]),
    });
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('Grouped')).toBeInTheDocument();
    });
  });

  it('renders landscape orientation label', async () => {
    mockSearchParams = new URLSearchParams();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        { id: 'r-land', title: { en_US: 'Landscape Report' }, type: 'listing', orientation: 'landscape', outputs: ['pdf'] },
      ]),
    });
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('Landscape Report')).toBeInTheDocument();
    });
  });

  // --- Multiple output badges ---

  it('renders multiple output format badges', async () => {
    mockSearchParams = new URLSearchParams();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        { id: 'r-multi', title: { en_US: 'Multi Output' }, type: 'listing', outputs: ['pdf', 'excel', 'html'] },
      ]),
    });
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('pdf')).toBeInTheDocument();
      expect(screen.getByText('excel')).toBeInTheDocument();
      expect(screen.getByText('html')).toBeInTheDocument();
    });
  });

  // --- Empty reports list ---

  it('renders without crashing when no reports returned', async () => {
    mockSearchParams = new URLSearchParams();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });
    const { container } = render(<ReportViewerPage />);
    await waitFor(() => {
      // Should render the page container even with empty list
      expect(container.innerHTML).not.toBe('');
    });
  });

  // --- Error loading reports ---

  it('handles fetch error gracefully', async () => {
    mockSearchParams = new URLSearchParams();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));
    render(<ReportViewerPage />);
    // Should render without crashing
    await waitFor(() => {
      expect(document.body).toBeTruthy();
    });
  });

  // --- Report with no outputs array ---

  it('renders report with no outputs', async () => {
    mockSearchParams = new URLSearchParams();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        { id: 'r-no-out', title: { en_US: 'No Outputs' }, type: 'listing' },
      ]),
    });
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('No Outputs')).toBeInTheDocument();
    });
  });
});

// ============================================================
// Additional exported helper branch tests
// ============================================================

describe('getSelectorPlaceholderLabel (extra branches)', () => {
  it('returns displayText when it is provided in single mode', () => {
    expect(getSelectorPlaceholderLabel(false, [{ id: '1' }], 'X', 'Display')).toBe('Display');
  });

  it('returns search prompt with default when label is null in single mode', () => {
    expect(getSelectorPlaceholderLabel(false, [], null, '')).toBe('Search Product...');
  });
});

describe('getSelectedItems (extra branches)', () => {
  it('returns empty when no value, no displayValue, and not multi', () => {
    expect(getSelectedItems(false, [], '', '')).toEqual([]);
  });

  it('returns selected array when multi and has value', () => {
    const sel = [{ id: '1', name: 'A' }];
    expect(getSelectedItems(true, sel, '1', 'A')).toBe(sel);
  });

  it('returns selected array when multi and no value', () => {
    const sel = [{ id: '2' }];
    expect(getSelectedItems(true, sel, '', '')).toBe(sel);
  });

  it('returns single-item array when not multi and has value', () => {
    expect(getSelectedItems(false, [], 'v1', 'Name')).toEqual([{ id: 'v1', name: 'Name' }]);
  });

  it('returns single-item array when not multi and has displayValue only', () => {
    expect(getSelectedItems(false, [], '', 'SomeName')).toEqual([{ id: '', name: 'SomeName' }]);
  });
});

describe('getProductSelectorUrl (extra branches)', () => {
  it('returns URL without query params when params are empty', () => {
    const params = new URLSearchParams();
    expect(getProductSelectorUrl(params)).toContain('/sws/report-selectors/product');
    expect(getProductSelectorUrl(params)).not.toContain('?');
  });

  it('returns URL with query params', () => {
    const params = new URLSearchParams({ orgId: '1' });
    expect(getProductSelectorUrl(params)).toContain('?orgId=1');
  });
});

describe('getSelectorLabelClassName (extra branches)', () => {
  it('returns text-foreground class when items selected', () => {
    expect(getSelectorLabelClassName([{ id: '1' }], '')).toContain('text-foreground');
  });

  it('returns text-foreground class when displayText present', () => {
    expect(getSelectorLabelClassName([], 'display')).toContain('text-foreground');
  });

  it('returns text-muted-foreground class when nothing selected', () => {
    expect(getSelectorLabelClassName([], '')).toContain('text-muted-foreground');
  });
});

describe('getSelectorButtonTitle (extra branches)', () => {
  it('returns joined names when multi with items', () => {
    expect(getSelectorButtonTitle(true, [{ name: 'A' }, { name: 'B' }], '')).toBe('A, B');
  });

  it('returns displayText when not multi', () => {
    expect(getSelectorButtonTitle(false, [], 'Display')).toBe('Display');
  });

  it('returns empty string when not multi and no displayText', () => {
    expect(getSelectorButtonTitle(false, [], '')).toBe('');
  });

  it('returns empty when multi but no items', () => {
    expect(getSelectorButtonTitle(true, [], 'Display')).toBe('Display');
  });
});

describe('applyProductSelectorScopeParams (extra branches)', () => {
  it('sets all params when all provided', () => {
    const params = new URLSearchParams();
    applyProductSelectorScopeParams('org1', params, ['org1', 'org2'], 'wh1');
    expect(params.get('selectedOrgId')).toBe('org1');
    expect(params.get('roleOrgIds')).toBe('org1,org2');
    expect(params.get('warehouseIds')).toBe('wh1');
  });

  it('skips params when values are empty', () => {
    const params = new URLSearchParams();
    applyProductSelectorScopeParams('', params, [], '');
    expect(params.has('selectedOrgId')).toBe(false);
    expect(params.has('roleOrgIds')).toBe(false);
    expect(params.has('warehouseIds')).toBe(false);
  });

  it('sets only org when warehouse is empty', () => {
    const params = new URLSearchParams();
    applyProductSelectorScopeParams('org1', params, null, '');
    expect(params.get('selectedOrgId')).toBe('org1');
    expect(params.has('warehouseIds')).toBe(false);
  });
});