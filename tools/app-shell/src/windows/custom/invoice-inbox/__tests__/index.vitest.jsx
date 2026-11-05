// @covers tools/app-shell/src/windows/custom/invoice-inbox/index.jsx
import { render, screen } from '@testing-library/react';

let mockCapabilities = {};
let mockTier = 'full';
let mockAuth = {};
const mockWindowIds = [];

vi.mock('@etendosoftware/app-shell-core/auth', () => ({ useAuthOptional: () => mockAuth }));
vi.mock('@/auth/AuthContext.jsx', () => ({ useWindowAccess: (id) => { mockWindowIds.push(id); return mockTier; } }));
vi.mock('@/hooks/useCapabilitiesSafe.js', () => ({ useCapabilitiesSafe: () => mockCapabilities }));
vi.mock('@/components/access/ProcessAccessGuard.jsx', () => ({
  AccessDeniedMessage: () => <div data-testid="window-access-denied" />,
}));
vi.mock('../InvoiceInboxPage.jsx', () => ({ default: (props) => <div data-testid="inbox-page" data-api={props.apiBaseUrl} /> }));

import InvoiceInboxRoute, { INVOICE_INBOX_WINDOW_ID } from '../index.jsx';

beforeEach(() => {
  mockCapabilities = { invoiceInbox: true };
  mockTier = 'full';
  mockAuth = { accessLoaded: true };
  mockWindowIds.length = 0;
});

const renderRoute = () => render(<InvoiceInboxRoute apiBaseUrl="/sws/neo/invoice-inbox" />);

describe('InvoiceInbox route guard', () => {
  it('renders the page, forwarding props, when the capability is on and the window access is granted', () => {
    renderRoute();
    expect(screen.getByTestId('inbox-page')).toHaveAttribute('data-api', '/sws/neo/invoice-inbox');
    expect(mockWindowIds).toContain(INVOICE_INBOX_WINDOW_ID);
    expect(INVOICE_INBOX_WINDOW_ID).toBe('81AC659E93504927B459E0CAE80CE923');
  });

  it('denies access without the invoiceInbox capability', () => {
    mockCapabilities = { invoiceInbox: false };
    renderRoute();
    expect(screen.getByTestId('window-access-denied')).toBeInTheDocument();
    expect(screen.queryByTestId('inbox-page')).toBeNull();
  });

  it('fails closed when the capability key is absent', () => {
    mockCapabilities = {};
    renderRoute();
    expect(screen.getByTestId('window-access-denied')).toBeInTheDocument();
  });

  it('denies access when the window access tier is none', () => {
    mockTier = 'none';
    renderRoute();
    expect(screen.getByTestId('window-access-denied')).toBeInTheDocument();
    expect(screen.queryByTestId('inbox-page')).toBeNull();
  });

  it('an admin without the capability is still denied (capability is its own axis)', () => {
    mockCapabilities = { isAdminOrClientAdmin: true };
    renderRoute();
    expect(screen.getByTestId('window-access-denied')).toBeInTheDocument();
  });

  it('shows a loading state, not access denied, while the access maps are loading', () => {
    mockAuth = { accessLoaded: false };
    mockCapabilities = {};
    renderRoute();
    expect(screen.getByTestId('invoice-inbox-access-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('window-access-denied')).toBeNull();
    expect(screen.queryByTestId('inbox-page')).toBeNull();
  });

  it('fails closed once loaded', () => {
    mockAuth = { accessLoaded: true };
    mockCapabilities = {};
    renderRoute();
    expect(screen.getByTestId('window-access-denied')).toBeInTheDocument();
    expect(screen.queryByTestId('invoice-inbox-access-loading')).toBeNull();
  });

  it('treats a missing accessLoaded (no AuthProvider / older core) as loaded', () => {
    mockAuth = undefined;
    renderRoute();
    expect(screen.getByTestId('inbox-page')).toBeInTheDocument();
  });
});
