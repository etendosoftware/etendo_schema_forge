import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mutable search params — tests can override before rendering
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

// Mutable selectedOrg — tests reassign this before/after render() to simulate
// a mid-session org switch (ETP-5013 follow-up: orgId is always shown in the
// filters summary, using the ACTIVE org's real name via `_display_orgId`).
let mockSelectedOrg = { id: 'org1', name: 'GOOrganization' };

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({
    token: 'test-token',
    selectedRole: { orgList: [] },
    get selectedOrg() { return mockSelectedOrg; },
  }),
}));

vi.mock('@/components/layout/PageMetaContext', () => ({
  useSetPageMeta: vi.fn(),
}));

vi.mock('@/components/layout/FavoritesContext', () => ({
  useFavorites: () => ({ toggleFavorite: vi.fn(), isFavorite: () => false }),
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

// Report with an `orgId` search parameter (mirrors real report contracts —
// e.g. Trial Balance, General Ledger — every one of which is scoped to an
// organization).
const ORG_REPORT = {
  id: 'report-with-org',
  title: { en_US: 'Org Scoped Report' },
  type: 'listing',
  category: 'finance',
  outputs: ['pdf'],
  parameters: [
    { name: 'orgId', type: 'search', selector: 'org', label: { en_US: 'Organization' }, section: 'primary' },
    { name: 'dateFrom', type: 'date', label: { en_US: 'Date From' }, section: 'primary' },
  ],
};

function mockReportsApiFetch(renderCapture) {
  globalThis.fetch = vi.fn().mockImplementation((url, opts) => {
    if (typeof url === 'string' && url === '/api/reports') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([ORG_REPORT]) });
    }
    if (typeof url === 'string' && url.includes('/render')) {
      if (renderCapture) renderCapture(JSON.parse(opts.body));
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve('<html><body>ok</body></html>'),
        blob: () => Promise.resolve(new Blob(['pdf-data'], { type: 'application/pdf' })),
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
  });
}

describe('ReportViewerPage — orgId always visible in filters summary (ETP-5013 follow-up)', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams({ report: 'report-with-org' });
    mockSetSearchParams.mockClear();
    mockSelectedOrg = { id: 'org1', name: 'GOOrganization' };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('seeds _display_orgId with the active org name on mount', async () => {
    let capturedBody = null;
    mockReportsApiFetch((body) => { capturedBody = body; });

    const user = userEvent.setup();
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('PDF')).toBeInTheDocument();
    });
    await user.click(screen.getByText('PDF'));

    await waitFor(() => {
      expect(capturedBody).toBeTruthy();
    });
    expect(capturedBody.params.orgId).toBe('org1');
    expect(capturedBody.params._display_orgId).toBe('GOOrganization');
  });

  it('updates _display_orgId to the new org name when the active organization changes mid-session', async () => {
    let capturedBody = null;
    mockReportsApiFetch((body) => { capturedBody = body; });

    const user = userEvent.setup();
    const { rerender } = render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('PDF')).toBeInTheDocument();
    });

    // Simulate switching the active organization mid-session.
    mockSelectedOrg = { id: 'org2', name: 'Second Org' };
    rerender(<ReportViewerPage />);

    await user.click(screen.getByText('PDF'));
    await waitFor(() => {
      expect(capturedBody).toBeTruthy();
    });
    expect(capturedBody.params.orgId).toBe('org2');
    // Must reflect the NEW org's name — not stay pegged to the previous one,
    // and not fall back to an empty string either.
    expect(capturedBody.params._display_orgId).toBe('Second Org');
  });

  // NOTE (verified against the actual implementation, not the assumption in
  // the task description): the orgId-sync useEffect in ReportViewer runs on
  // mount too (React effects always fire after the first commit) and
  // unconditionally overwrites BOTH `orgId` and `_display_orgId` with the
  // active session org whenever they don't already match `selectedOrgId` —
  // it does not special-case "the URL already provided a value". So a
  // deep-linked `orgId` that differs from the currently active session org
  // is silently replaced by the session's org on the very first render, and
  // a deep-linked `_display_orgId` is replaced by the session org's name.
  // This documents the real, current behavior — flagged separately as a
  // discrepancy from the described intent (see PR notes), not something to
  // "fix" by editing the test to a value the code doesn't actually produce.
  it('a deep-linked orgId/_display_orgId is overwritten by the active session org on mount (documented current behavior)', async () => {
    mockSearchParams = new URLSearchParams({
      report: 'report-with-org',
      orgId: 'org-deep-link',
      _display_orgId: 'Deep Link Org',
    });
    let capturedBody = null;
    mockReportsApiFetch((body) => { capturedBody = body; });

    const user = userEvent.setup();
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('PDF')).toBeInTheDocument();
    });
    await user.click(screen.getByText('PDF'));

    await waitFor(() => {
      expect(capturedBody).toBeTruthy();
    });
    expect(capturedBody.params.orgId).toBe('org1');
    expect(capturedBody.params._display_orgId).toBe('GOOrganization');
  });

  it('preserves a deep-linked _display_orgId when the deep-linked orgId already matches the active session org', async () => {
    // The orgId-sync effect only overwrites when `prev.orgId !== selectedOrgId`;
    // when the deep-linked orgId already agrees with the session, the effect's
    // `setParams` bails out (`return prev`) and never touches `_display_orgId`
    // — so a custom deep-linked display name (e.g. from a different locale's
    // cached label) survives untouched.
    mockSearchParams = new URLSearchParams({
      report: 'report-with-org',
      orgId: 'org1',
      _display_orgId: 'Custom Deep Link Name',
    });
    let capturedBody = null;
    mockReportsApiFetch((body) => { capturedBody = body; });

    const user = userEvent.setup();
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('PDF')).toBeInTheDocument();
    });
    await user.click(screen.getByText('PDF'));

    await waitFor(() => {
      expect(capturedBody).toBeTruthy();
    });
    expect(capturedBody.params.orgId).toBe('org1');
    expect(capturedBody.params._display_orgId).toBe('Custom Deep Link Name');
  });

  it('falls back to an empty _display_orgId when the active org has no name yet', async () => {
    mockSelectedOrg = { id: 'org1', name: '' };
    let capturedBody = null;
    mockReportsApiFetch((body) => { capturedBody = body; });

    const user = userEvent.setup();
    render(<ReportViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('PDF')).toBeInTheDocument();
    });
    await user.click(screen.getByText('PDF'));

    await waitFor(() => {
      expect(capturedBody).toBeTruthy();
    });
    expect(capturedBody.params.orgId).toBe('org1');
    expect(capturedBody.params._display_orgId).toBe('');
  });
});
