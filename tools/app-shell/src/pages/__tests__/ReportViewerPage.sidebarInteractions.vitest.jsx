// Coverage-recovery suite (ETP-4346 batch 2, part 2): targets the remaining
// reachable ReportSidebar interaction branches (select onChange, boolean
// checkbox toggle via row click + direct checkbox click, date field onChange)
// and the ReportList "click a card to open the viewer" navigation path — all
// left uncovered by the pre-existing ReportViewerPage suites.

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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
  DateField: ({ value, onChange, className }) => (
    <input
      type="date"
      data-testid="date-field"
      className={className}
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <h2>{children}</h2>,
}));

import ReportViewerPage from '../ReportViewerPage.jsx';

function makeReportsListResponse(reports) {
  return { ok: true, json: () => Promise.resolve(reports) };
}

describe('ReportViewerPage — ReportList card click navigates into the viewer', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
    mockSetSearchParams.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls setSearchParams with the report id when a report card is clicked', async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn().mockResolvedValue(makeReportsListResponse([
      { id: 'report-42', title: { en_US: 'Clickable Report' }, type: 'listing', outputs: ['pdf'] },
    ]));

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('Clickable Report')).toBeInTheDocument());

    await user.click(screen.getByText('Clickable Report'));

    expect(mockSetSearchParams).toHaveBeenCalled();
    const passedParams = mockSetSearchParams.mock.calls[0][0];
    expect(passedParams.get('report')).toBe('report-42');
  });
});

describe('ReportViewerPage — ReportSidebar select / boolean / date interactions', () => {
  const SELECT_REPORT = {
    id: 'report-select',
    title: { en_US: 'Select Report' },
    type: 'listing',
    outputs: ['pdf'],
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

  const BOOLEAN_REPORT = {
    id: 'report-bool',
    title: { en_US: 'Boolean Report' },
    type: 'listing',
    outputs: ['pdf'],
    parameters: [
      { name: 'showAll', type: 'boolean', label: { en_US: 'Show All' }, section: 'options' },
    ],
  };

  const DATE_REPORT = {
    id: 'report-date',
    title: { en_US: 'Date Report' },
    type: 'listing',
    outputs: ['pdf'],
    parameters: [
      { name: 'dateFrom', type: 'date', label: { en_US: 'Date From' }, section: 'primary', required: true },
    ],
  };

  beforeEach(() => {
    mockSetSearchParams.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('changes the select value via onChange', async () => {
    mockSearchParams = new URLSearchParams({ report: 'report-select' });
    const user = userEvent.setup();
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/reports') return Promise.resolve(makeReportsListResponse([SELECT_REPORT]));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
    });

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('Group By')).toBeInTheDocument());

    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'category');
    expect(select).toHaveValue('category');
  });

  it('toggles a boolean parameter by clicking the row container', async () => {
    mockSearchParams = new URLSearchParams({ report: 'report-bool' });
    const user = userEvent.setup();
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/reports') return Promise.resolve(makeReportsListResponse([BOOLEAN_REPORT]));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
    });

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('Show All')).toBeInTheDocument());

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeChecked();

    // Click the surrounding row (not the checkbox itself) to exercise the div's onClick toggle
    await user.click(screen.getByText('Show All'));
    expect(checkbox).toBeChecked();

    // Clicking again toggles it back off
    await user.click(screen.getByText('Show All'));
    expect(checkbox).not.toBeChecked();
  });

  it('toggles a boolean parameter by clicking the checkbox directly (stops row propagation)', async () => {
    mockSearchParams = new URLSearchParams({ report: 'report-bool' });
    const user = userEvent.setup();
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/reports') return Promise.resolve(makeReportsListResponse([BOOLEAN_REPORT]));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
    });

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('Show All')).toBeInTheDocument());

    const checkbox = screen.getByRole('checkbox');
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  it('changes a date field value and clears the required error on change', async () => {
    mockSearchParams = new URLSearchParams({ report: 'report-date' });
    const user = userEvent.setup();
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/reports') return Promise.resolve(makeReportsListResponse([DATE_REPORT]));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
    });

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('Date From')).toBeInTheDocument());

    // Submitting with the required date empty shows the error
    await user.click(screen.getByText('runReport'));
    await waitFor(() => expect(screen.getByText('required')).toBeInTheDocument());

    // Setting a value should clear the error (handleChange clears errors[name] when value is truthy)
    const dateField = screen.getByTestId('date-field');
    await user.type(dateField, '2024-01-15');

    await waitFor(() => {
      expect(screen.queryByText('required')).not.toBeInTheDocument();
    });
  });
});
