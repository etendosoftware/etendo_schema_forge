// @covers tools/app-shell/src/windows/custom/remittance/index.jsx
// @covers artifacts/remittance/decisions.json
// Same shape as invoice-inbox/__tests__/index.vitest.jsx: both routes guard a window behind a
// per-account capability AND the role's window access.
import { render, screen } from '@testing-library/react';
import menuConfig from '../../../../menu.json';
import decisions from '@generated/remittance/decisions.json';
import enUS from '@/locales/en_US.json';
import esES from '@/locales/es_ES.json';
import esAR from '@/locales/es_AR.json';

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
vi.mock('@generated/remittance/generated/web/remittance/index.jsx', () => ({
  default: (props) => <div data-testid="remittance-app" data-api={props.apiBaseUrl} />,
}));

import RemittanceRoute, { REMITTANCE_WINDOW_ID } from '../index.jsx';

beforeEach(() => {
  mockCapabilities = { sepaRemittances: true };
  mockTier = 'full';
  mockAuth = { accessLoaded: true };
  mockWindowIds.length = 0;
});

const renderRoute = () => render(<RemittanceRoute apiBaseUrl="/sws/neo/remittance" />);

describe('Remittance route guard', () => {
  it('renders the generated window, forwarding props, when the capability is on and the window access is granted', () => {
    renderRoute();
    expect(screen.getByTestId('remittance-app')).toHaveAttribute('data-api', '/sws/neo/remittance');
    expect(screen.queryByTestId('window-access-denied')).toBeNull();
    expect(mockWindowIds).toContain(REMITTANCE_WINDOW_ID);
    expect(REMITTANCE_WINDOW_ID).toBe('FF8080812E71F7C7012E71FD0499001B');
  });

  it('checks the same window id the sidebar entry is gated by', () => {
    const item = menuConfig.menu.flatMap(group => group.items).find(entry => entry.name === 'remittance');
    expect(item.accessWindowId).toBe(REMITTANCE_WINDOW_ID);
    expect(item.capability).toBe('sepaRemittances');
  });

  it('denies access without the sepaRemittances capability', () => {
    mockCapabilities = { sepaRemittances: false };
    renderRoute();
    expect(screen.getByTestId('window-access-denied')).toBeInTheDocument();
    expect(screen.queryByTestId('remittance-app')).toBeNull();
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
    expect(screen.queryByTestId('remittance-app')).toBeNull();
  });

  it('renders the window for a read-only tier (only none is refused)', () => {
    mockTier = 'read-only';
    renderRoute();
    expect(screen.getByTestId('remittance-app')).toBeInTheDocument();
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
    expect(screen.getByTestId('remittance-access-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('window-access-denied')).toBeNull();
    expect(screen.queryByTestId('remittance-app')).toBeNull();
  });

  it('fails closed once loaded', () => {
    mockAuth = { accessLoaded: true };
    mockCapabilities = {};
    renderRoute();
    expect(screen.getByTestId('window-access-denied')).toBeInTheDocument();
    expect(screen.queryByTestId('remittance-access-loading')).toBeNull();
  });

  it('treats a missing accessLoaded (no AuthProvider / older core) as loaded', () => {
    mockAuth = undefined;
    renderRoute();
    expect(screen.getByTestId('remittance-app')).toBeInTheDocument();
  });
});

// The remittance status codes (Remittance_Status) are labelled through i18n keys declared in the
// window's decisions; the AD list ships English names only, so a missing key shows the raw key.
describe('Remittance status labels', () => {
  const statusKeys = Object.values(decisions.window.statusEnumLabels);

  it('declares a label for each remittance status code', () => {
    expect(Object.keys(decisions.window.statusEnumLabels).sort()).toEqual(['AN', 'CP', 'CT', 'PE', 'PP', 'PR', 'PT']);
  });

  it.each([['en_US', enUS], ['es_ES', esES], ['es_AR', esAR]])('every status label key exists in %s', (_loc, json) => {
    for (const key of statusKeys) expect(json.genericLabels[key], key).toEqual(expect.stringMatching(/\S/));
  });
});
