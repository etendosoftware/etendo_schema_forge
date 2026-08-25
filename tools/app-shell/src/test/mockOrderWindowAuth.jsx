// ETP-4888 — shared mock factories for the @/auth/AuthContext.jsx +
// useFiscalConfig.js pair that sales-order/purchase-order/sales-invoice/
// purchase-invoice's own index.vitest.jsx all need identically:
//
// index.jsx wires useTaxSifLineRowActions(), which reads selectedOrg from
// useAuth() and also calls useFiscalConfig(), whose own useApiFetch() resolves
// to the package-internal AuthContext (a different module instance than the
// '@/auth/AuthContext.jsx' alias), so mocking useAuth alone isn't enough — it
// still throws "useAuth must be used within AuthProvider". Mocking
// useFiscalConfig.js itself sidesteps that mismatch entirely.
//
// Vitest hoists vi.mock(path, factory) calls above imports, and a factory may
// only reference module-scope bindings declared in the SAME file (not values
// imported from elsewhere) — so this module cannot export the vi.mock() call
// itself. Instead it exports plain factory-builder functions; each test file
// still declares its own `vi.mock('@/auth/AuthContext.jsx', () => ...)` call
// (satisfying hoisting) and passes in its own mutable getter/setter closures
// so each suite keeps independent control over its own mock state (e.g.
// `currentWindowAccessTier`, `fiscalProfile`) even if both files' suites ever
// run in the same worker. Mirrors the established @/test/mockUseApiFetch.js
// convention: plain, non-mocked helper module, one factory per concern.

/**
 * Builds the mock module body for '@/auth/AuthContext.jsx'.
 * @param {() => string} getWindowAccessTier - returns the current tier
 *   ('full' | 'read-only' | 'none'); read lazily so tests can mutate the
 *   backing variable between renders.
 */
export function createAuthContextMock(getWindowAccessTier) {
  return {
    useAuth: () => ({ selectedOrg: { id: 'org-1' }, logout: vi.fn() }),
    useWindowAccess: () => getWindowAccessTier(),
    WindowAccessGuard: (props) => (
      <div data-testid="window-access-guard" data-window-id={props.windowId} />
    ),
  };
}

/**
 * Builds the mock module body for
 * '@/windows/custom/fiscal-config/useFiscalConfig.js'.
 * @param {() => (string|null)} getFiscalProfile - returns the current profile
 *   ('verifactu' | null); read lazily so tests can mutate the backing
 *   variable between renders.
 */
export function createFiscalConfigMock(getFiscalProfile) {
  return {
    useFiscalConfig: vi.fn(() => ({ profile: getFiscalProfile() })),
  };
}
