// ETP-5013: ReportSidebar's "Generate Report" button is now disabled while
// any non-hidden required parameter is still empty (`hasAllRequiredFilled`),
// on top of the pre-existing `loading` guard. This suite covers the new
// gating logic in isolation, mirroring the mock setup already used by
// ReportViewerPage.sidebarInteractions.vitest.jsx for consistency.

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

const REQUIRED_TEXT_REPORT = {
  id: 'report-required-text',
  title: { en_US: 'Required Text Report' },
  type: 'listing',
  outputs: ['pdf'],
  parameters: [
    { name: 'accountName', type: 'text', label: { en_US: 'Account Name' }, section: 'primary', required: true },
  ],
};

const REQUIRED_IF_TEXT_REPORT = {
  id: 'report-required-if-text',
  title: { en_US: 'Required-If Text Report' },
  type: 'listing',
  outputs: ['pdf'],
  parameters: [
    { name: 'compareTo', type: 'toggle', label: { en_US: 'Compare To' }, section: 'options', default: false },
    {
      name: 'referenceYear',
      type: 'text',
      label: { en_US: 'Reference Year' },
      section: 'options',
      requiredIf: { param: 'compareTo', equals: 'true' },
    },
  ],
};

const REQUIRED_HIDDEN_REPORT = {
  id: 'report-required-hidden',
  title: { en_US: 'Required Hidden Report' },
  type: 'listing',
  outputs: ['pdf'],
  parameters: [
    { name: 'visibleField', type: 'text', label: { en_US: 'Visible Field' }, section: 'primary' },
    { name: 'hiddenRequiredField', type: 'text', label: { en_US: 'Hidden Required Field' }, section: 'primary', required: true, hidden: true },
  ],
};

const NO_REQUIRED_REPORT = {
  id: 'report-no-required',
  title: { en_US: 'No Required Report' },
  type: 'listing',
  outputs: ['pdf'],
  parameters: [
    { name: 'freeText', type: 'text', label: { en_US: 'Free Text' }, section: 'primary' },
  ],
};

describe('ReportViewerPage — ReportSidebar "Generate Report" button gating (hasAllRequiredFilled, ETP-5013)', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
    mockSetSearchParams.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('disables the button while a required parameter is empty', async () => {
    mockSearchParams = new URLSearchParams({ report: 'report-required-text' });
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/reports') return Promise.resolve(makeReportsListResponse([REQUIRED_TEXT_REPORT]));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
    });

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('Account Name')).toBeInTheDocument());

    expect(screen.getByText('runReport')).toBeDisabled();
  });

  it('enables the button once the required parameter has a value', async () => {
    mockSearchParams = new URLSearchParams({ report: 'report-required-text' });
    const user = userEvent.setup();
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/reports') return Promise.resolve(makeReportsListResponse([REQUIRED_TEXT_REPORT]));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
    });

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('Account Name')).toBeInTheDocument());
    expect(screen.getByText('runReport')).toBeDisabled();

    const [input] = screen.getAllByRole('textbox');
    await user.type(input, 'Acme');

    await waitFor(() => expect(screen.getByText('runReport')).not.toBeDisabled());
  });

  it('keeps the button enabled while a requiredIf gate does not apply', async () => {
    mockSearchParams = new URLSearchParams({ report: 'report-required-if-text' });
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/reports') return Promise.resolve(makeReportsListResponse([REQUIRED_IF_TEXT_REPORT]));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
    });

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('Compare To')).toBeInTheDocument());

    expect(screen.getByText('runReport')).not.toBeDisabled();
  });

  it('disables the button once the requiredIf gate applies and the field is empty, and re-enables once filled', async () => {
    mockSearchParams = new URLSearchParams({ report: 'report-required-if-text' });
    const user = userEvent.setup();
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/reports') return Promise.resolve(makeReportsListResponse([REQUIRED_IF_TEXT_REPORT]));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
    });

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('Compare To')).toBeInTheDocument());

    const toggle = screen.getByRole('switch');
    await user.click(toggle);

    await screen.findByText('Reference Year');
    await waitFor(() => expect(screen.getByText('runReport')).toBeDisabled());

    const yearInput = screen.getByRole('textbox');

    await user.type(yearInput, '2025');

    await waitFor(() => expect(screen.getByText('runReport')).not.toBeDisabled());
  });

  it('does not block the button on a required parameter that is hidden', async () => {
    mockSearchParams = new URLSearchParams({ report: 'report-required-hidden' });
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/reports') return Promise.resolve(makeReportsListResponse([REQUIRED_HIDDEN_REPORT]));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
    });

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('Visible Field')).toBeInTheDocument());

    expect(screen.queryByText('Hidden Required Field')).not.toBeInTheDocument();
    expect(screen.getByText('runReport')).not.toBeDisabled();
  });

  it('keeps the button disabled while loading, even with all required fields filled', async () => {
    mockSearchParams = new URLSearchParams({ report: 'report-no-required' });
    const user = userEvent.setup();
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && url === '/api/reports') {
        return Promise.resolve(makeReportsListResponse([NO_REQUIRED_REPORT]));
      }
      if (typeof url === 'string' && url.includes('/render')) {
        return new Promise(() => {}); // never resolves — keeps `loading: true`
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
    });

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('runReport')).toBeInTheDocument());
    expect(screen.getByText('runReport')).not.toBeDisabled();

    await user.click(screen.getByText('runReport'));

    await waitFor(() => expect(screen.getByText('running')).toBeInTheDocument());
    expect(screen.getByText('running')).toBeDisabled();
  });
});
