/**
 * Rules-of-Hooks regression for `ManageDocsLauncher` (ETP-5295) — sales-order twin.
 *
 * ## Which file this tests, and why it lives here
 *
 * `artifacts/sales-order/custom/OrderCreateInvoice.jsx`, imported below through
 * `@generated/...` — the same module the list-view row kebab's "Gestionar envío/factura"
 * action mounts. It lives under `tools/app-shell/src/` because vitest's `include` is
 * `src/**\/*.vitest.{js,jsx}` relative to `tools/app-shell`: a `.vitest.jsx` placed next to the
 * component under `artifacts/` would never be collected (see the sibling
 * `OrderCreateInvoice.confirmModalLifecycle.vitest.jsx`, which documents the same constraint
 * for `ConfirmModal`).
 *
 * ## The bug
 *
 * `ManageDocsLauncher` used to compute `nothingToManage` and register its auto-close
 * `useEffect` AFTER an early `if (!fetched) return <Spinner/>`. React calls hooks in the same
 * fixed order and count on every render; skipping a hook on the first (loading) render and
 * registering it only once `fetched` resolves makes React see a different hook count between
 * renders and throw "Rendered more hooks than during the previous render." — with no
 * ErrorBoundary anywhere in the app to catch it, this crashed the whole SPA to a blank page,
 * confirmed live via browser reproduction.
 *
 * The fix (26aacff58) hoists every hook above any early return and guards the derived values
 * against `fetched` being null instead. The two tests below exercise exactly the transition
 * that used to crash: loading → resolved-with-nothing-pending (closes silently) and
 * loading → resolved-with-something-pending (opens `CreateDocsModal`). A third test pins the
 * regression class itself by asserting no "Rendered more hooks" console error is ever logged.
 */

import { render, screen, act, waitFor } from '@testing-library/react';

// ── Mocks (before the import under test) ─────────────────────────────────────────────────

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => key,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), custom: vi.fn(), dismiss: vi.fn() },
}));

// ETP-5024 — headers for this module go through the shared `buildHeaders()` helper.
vi.mock('@/auth/api.js', () => ({
  buildHeaders: (token) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }),
}));

vi.mock('@/components/contract-ui/SendDocumentModal', () => ({
  default: () => <div data-testid="send-document-modal" />,
  SendDocumentButton: () => <button type="button" data-testid="send-document-button" />,
}));

vi.mock('@/components/contract-ui', () => ({
  ConfirmResultModal: () => <div data-testid="confirm-result-modal" />,
}));

vi.mock('@/components/contract-ui/CopyRecordLinkButton', () => ({
  default: () => <button type="button" data-testid="copy-record-link" />,
}));

vi.mock('@/components/contract-ui/CloneOrderModal', () => ({
  default: () => <div data-testid="clone-order-modal" />,
}));

vi.mock('@/lib/surveys/survey-state.js', () => ({ incrementSurveyCounter: vi.fn() }));
vi.mock('@/lib/surveys/survey-engine.js', () => ({ emitSurveyTrigger: vi.fn() }));
vi.mock('@/windows/custom/shared/useOrderPdf.js', () => ({
  useOrderPdf: () => ({ pdfUrl: null, loading: false }),
}));
vi.mock('@/lib/observability/health-events.js', () => ({
  trackTransactionPosted: vi.fn(),
  trackDocumentCreated: vi.fn(),
}));
vi.mock('@/lib/formatCurrency.js', () => ({
  formatCurrency: (_currency, value) => `${Number(value || 0).toFixed(2)} €`,
}));

import { ManageDocsLauncher } from '@generated/sales-order/custom/OrderCreateInvoice';

// ── Helpers ──────────────────────────────────────────────────────────────────────────────

const ORDER = (overrides = {}) => ({
  id: 'so-launcher-1',
  documentNo: 'SO/0002',
  documentStatus: 'CO',
  grandTotalAmount: 0,
  'currency$_identifier': 'EUR',
  'businessPartner$_identifier': 'Cliente E2E, S.L.',
  ...overrides,
});

const baseProps = {
  orderId: 'so-launcher-1',
  apiBaseUrl: '/sws/neo/sales-order',
  token: 'tok',
};

/** Builds a `fetch` mock that answers the three lookups by URL shape, in any call order. */
function mockFetch({ shipments = [], orderLines = [], invoices = [] } = {}) {
  return vi.fn((url) => {
    let data = [];
    if (url.includes('goods-shipment')) data = shipments;
    else if (url.includes('/lines?')) data = orderLines;
    else if (url.includes('action/listInvoices')) data = invoices;
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data } }) });
  });
}

const HOOKS_ORDER_REGEXP = /Rendered more hooks|change in the order of Hooks/;

describe('ManageDocsLauncher — Rules-of-Hooks regression (ETP-5295)', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.restoreAllMocks();
  });

  function assertNoHooksOrderViolation() {
    const offending = consoleErrorSpy.mock.calls.find((args) =>
      args.some((a) => HOOKS_ORDER_REGEXP.test(String(a))),
    );
    expect(
      offending,
      `console.error logged a Rules-of-Hooks violation: ${JSON.stringify(offending)}`,
    ).toBeUndefined();
  }

  it('renders the loading spinner while `fetched` is still null, without crashing', async () => {
    globalThis.fetch = vi.fn(() => new Promise(() => {})); // never resolves
    const onClose = vi.fn();

    await act(async () => {
      render(<ManageDocsLauncher {...baseProps} data={ORDER()} onClose={onClose} onCreated={vi.fn()} />);
    });

    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    assertNoHooksOrderViolation();
  });

  // This is the exact transition that used to crash: on the render right after `fetched`
  // resolves, the old code added a hook (the auto-close effect) that had not run on the
  // loading render — "Rendered more hooks than during the previous render."
  it('closes silently once fetch resolves with nothing pending (nothingToManage)', async () => {
    globalThis.fetch = mockFetch({ shipments: [], orderLines: [], invoices: [] });
    const onClose = vi.fn();

    await act(async () => {
      render(
        <ManageDocsLauncher
          {...baseProps}
          data={ORDER({ grandTotalAmount: 0 })}
          onClose={onClose}
          onCreated={vi.fn()}
        />,
      );
    });

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('sales-order-manage-docs-modal')).not.toBeInTheDocument();
    assertNoHooksOrderViolation();
  });

  it('renders CreateDocsModal once fetch resolves with something pending, without crashing', async () => {
    globalThis.fetch = mockFetch({
      shipments: [],
      orderLines: [{ orderedQuantity: 10, deliveredQuantity: 0 }],
      invoices: [],
    });
    const onClose = vi.fn();

    await act(async () => {
      render(
        <ManageDocsLauncher
          {...baseProps}
          data={ORDER({ grandTotalAmount: 500 })}
          onClose={onClose}
          onCreated={vi.fn()}
        />,
      );
    });

    await waitFor(() =>
      expect(screen.getByTestId('sales-order-manage-docs-modal')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('sales-order-manage-shipment-card')).toBeInTheDocument();
    expect(screen.getByText('soManageDocsTitle')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    assertNoHooksOrderViolation();
  });

  // ETP-5295 QA gap — sales-order twin of the purchase-order network-error test. The
  // loading→resolved transition guarded by the Rules-of-Hooks fix is exercised above only for
  // the happy (fetch resolves) path; the component's own `catch` block (falling back to empty
  // shipments/invoices/orderLines) is the OTHER way `fetched` transitions from null to
  // non-null, through the exact same hook-ordering path the fix targeted. A rejected
  // `Promise.all` (network error / one of the 3 endpoints down) must resolve to the same
  // "nothing pending" outcome as an empty-but-successful fetch, without resurrecting the
  // "Rendered more hooks" crash this whole file guards against.
  it('falls back to empty state and closes silently when the fetch rejects (network error)', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('network down')));
    const onClose = vi.fn();

    await act(async () => {
      render(
        <ManageDocsLauncher
          {...baseProps}
          data={ORDER({ grandTotalAmount: 0 })}
          onClose={onClose}
          onCreated={vi.fn()}
        />,
      );
    });

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('sales-order-manage-docs-modal')).not.toBeInTheDocument();
    assertNoHooksOrderViolation();
  });
});
