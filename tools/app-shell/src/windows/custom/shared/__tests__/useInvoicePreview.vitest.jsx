/**
 * Hook-level tests for useInvoicePreview.
 *
 * Two independent concerns share this file because both live in the hook and neither is reachable
 * from InvoicePreview.vitest.jsx, which mocks useInvoicePreview.js wholesale:
 *
 *   1. pdfCacheConfig, computed here and handed to useInvoicePdf (ETP-4315 follow-up).
 *   2. How much of the invoice is still free to pay (ETP-4895). A draft payment does not lower the
 *      invoice's outstanding, so the raw outstanding over-states what a new payment may take:
 *      confirming both drafts would over-pay the invoice. This is the arithmetic behind the
 *      preview's "Registrar pago" button and the payment modal's default amount.
 *
 * Mocks must come before imports (Vitest hoisting).
 */
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('../useInvoicePdf.js', () => ({
  useInvoicePdf: vi.fn(() => ({ pdfUrl: null, pdfBlob: null, loading: false, error: null })),
}));

const useFiscalConfigMock = vi.fn(() => ({ profile: null, tbaiRecord: null }));
vi.mock('@/windows/custom/fiscal-config/useFiscalConfig.js', () => ({
  useFiscalConfig: (...args) => useFiscalConfigMock(...args),
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ token: 'tok', selectedOrg: { id: 'org-1' } }),
}));

// Shared by both suites: the pdf tests only need it not to blow up, the free-to-allocate ones
// drive it per case through stubApi.
const apiFetch = vi.fn();
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => apiFetch }));

const getPendingSifTargetsMock = vi.fn(() => ({ sendSii: false, sendTbai: false }));
vi.mock('../sifSending.js', () => ({
  getPendingSifTargets: (...args) => getPendingSifTargetsMock(...args),
  getSifBodyKey: () => null,
}));

vi.mock('@/lib/statusBadge.js', () => ({
  getStatusBadgeProps: () => ({}),
  statusLabel: (status) => status,
}));

import { renderHook, waitFor } from '@testing-library/react';
import { useInvoicePreview } from '../useInvoicePreview.js';
import { useInvoicePdf } from '../useInvoicePdf.js';

/** Every endpoint answers with an empty list unless a test says otherwise. */
function emptyResponse() {
  return Promise.resolve({ ok: true, json: async () => ({ response: { data: [] } }) });
}

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockImplementation(() => emptyResponse());
});

// ─── pdfCacheConfig wiring ───────────────────────────────────────────────────
//
// ETP-4315 follow-up (2026-08-18) — pdfCacheConfig ({ tableName: 'C_Invoice',
// storeCondition: invoiceData?.documentStatus !== 'DR' }) is computed and passed
// to useInvoicePdf INSIDE useInvoicePreview.js, not inside InvoicePreview.jsx
// (which only calls useInvoicePreview and never sees the cache config itself).

const defaultInvoice = {
  id: 'inv-1',
  documentNo: 'INV-001',
  documentStatus: 'CO',
  grandTotalAmount: 1000,
  'businessPartner$_identifier': 'Acme Corp',
};

function renderUseInvoicePreview(overrides = {}) {
  const props = {
    invoice: defaultInvoice,
    apiBaseUrl: '/api/sales-invoice',
    specName: 'sales-invoice',
    ...overrides,
  };
  return renderHook(() => useInvoicePreview(props));
}

describe('useInvoicePreview — pdfCacheConfig wiring into useInvoicePdf (ETP-4315 follow-up)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetch.mockImplementation(() => emptyResponse());
    useInvoicePdf.mockReturnValue({ pdfUrl: null, pdfBlob: null, loading: false, error: null });
  });

  function lastCacheConfig() {
    const calls = vi.mocked(useInvoicePdf).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    return calls[calls.length - 1][3];
  }

  it('passes { tableName: "C_Invoice", storeCondition: false } when the invoice is DR (draft)', () => {
    renderUseInvoicePreview({ invoice: { ...defaultInvoice, documentStatus: 'DR' } });
    expect(lastCacheConfig()).toEqual({ tableName: 'C_Invoice', storeCondition: false, recordUpdated: null });
  });

  it('passes { tableName: "C_Invoice", storeCondition: true } when the invoice is CO (non-draft)', () => {
    renderUseInvoicePreview({ invoice: { ...defaultInvoice, documentStatus: 'CO' } });
    expect(lastCacheConfig()).toEqual({ tableName: 'C_Invoice', storeCondition: true, recordUpdated: null });
  });

  // ETP-4787 — the invoice's own `updated` rides along so usePdfGenerator can discard a
  // cached attachment older than the last edit (the Verifactu QR is written after
  // completion, which is exactly how a cached PDF ends up missing it).
  it("forwards the invoice's `updated` as recordUpdated", () => {
    renderUseInvoicePreview({
      invoice: { ...defaultInvoice, documentStatus: 'CO', updated: '2026-08-24T12:15:30+02:00' },
    });
    expect(lastCacheConfig().recordUpdated).toBe('2026-08-24T12:15:30+02:00');
  });

  it('passes recordId/apiBaseUrl as null to useInvoicePdf for the purchase-invoice branch (hook never renders a sales PDF)', () => {
    renderUseInvoicePreview({ specName: 'purchase-invoice', invoice: { ...defaultInvoice, documentStatus: 'CO' } });
    const calls = vi.mocked(useInvoicePdf).mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall[0]).toBeNull();
    expect(lastCall[1]).toBeNull();
    // cacheConfig is still computed unconditionally (harmless — usePdfGenerator
    // never fires its effect without a recordId/apiBaseUrl anyway).
    expect(lastCall[3]).toEqual({ tableName: 'C_Invoice', storeCondition: true, recordUpdated: null });
  });
});

// ─── free-to-allocate gating (ETP-4895) ──────────────────────────────────────

const INVOICE = { id: 'inv-1', documentStatus: 'CO', grandTotalAmount: '500.00' };

/** paymentPlan answers with one installment, invoicePayments with whatever the case needs. */
function stubApi({ outstanding, payments }) {
  apiFetch.mockImplementation((url) => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      response: {
        data: String(url).includes('/paymentPlan')
          ? [{ id: 'i1', outstandingAmount: outstanding }]
          : payments,
      },
    }),
  }));
}

function renderPreview() {
  return renderHook(() => useInvoicePreview({
    invoice: INVOICE, apiBaseUrl: 'http://host/sws/neo/purchase-invoice', specName: 'purchase-invoice',
  }));
}

describe('useInvoicePreview — free-to-allocate gating', () => {
  it('offers the whole outstanding when no draft reserves any of it', async () => {
    stubApi({ outstanding: '500.00', payments: [] });
    const { result } = renderPreview();
    await waitFor(() => expect(result.current.loadingPayments).toBe(false));

    expect(result.current.freeToAllocate).toBe(500);
    expect(result.current.canAddPayment).toBe(true);
    expect(result.current.addPaymentBlockedByDraft).toBe(false);
  });

  it('blocks a new payment when the drafts already reserve the whole outstanding', async () => {
    stubApi({
      outstanding: '500.00',
      payments: [{ id: 'p1', amount: '500.00', status: 'RPAP', processed: false }],
    });
    const { result } = renderPreview();
    await waitFor(() => expect(result.current.loadingPayments).toBe(false));

    expect(result.current.freeToAllocate).toBe(0);
    expect(result.current.canAddPayment).toBe(false);
    // Blocked, not "takes no payments": the invoice is still completed and still owes 500.
    expect(result.current.addPaymentBlockedByDraft).toBe(true);
  });

  it('leaves the remainder open when a draft only covers part of the invoice', async () => {
    stubApi({
      outstanding: '500.00',
      payments: [{ id: 'p1', amount: '200.00', status: 'RPAP', processed: false }],
    });
    const { result } = renderPreview();
    await waitFor(() => expect(result.current.loadingPayments).toBe(false));

    expect(result.current.freeToAllocate).toBe(300);
    expect(result.current.canAddPayment).toBe(true);
    expect(result.current.addPaymentBlockedByDraft).toBe(false);
  });

  it('ignores confirmed payments, which the outstanding already accounts for', async () => {
    // 300 of the 500 was paid and confirmed: the plan reports 200 outstanding, and that 200 is
    // fully free — subtracting the confirmed payment again would block a legitimate payment.
    stubApi({
      outstanding: '200.00',
      payments: [{ id: 'p1', amount: '300.00', status: 'RPPC', processed: true }],
    });
    const { result } = renderPreview();
    await waitFor(() => expect(result.current.loadingPayments).toBe(false));

    expect(result.current.freeToAllocate).toBe(200);
    expect(result.current.canAddPayment).toBe(true);
  });
});

// ETP-5087: territory (from the active TBAI config) must be resolved and forwarded to
// getPendingSifTargets, and exposed on the hook's return value for InvoicePreview.jsx to
// thread into getInvoiceFiscalTargets/useFiscalStatus.
describe('useInvoicePreview — territory resolution and forwarding (ETP-5087)', () => {
  beforeEach(() => {
    getPendingSifTargetsMock.mockClear();
    apiFetch.mockImplementation(() => emptyResponse());
  });

  it('resolves territory from tbaiRecord.etsgSifTerritory and forwards it to getPendingSifTargets', async () => {
    useFiscalConfigMock.mockReturnValue({ profile: 'sii+tbai', tbaiRecord: { etsgSifTerritory: 'BIZKAIA' } });
    // NOTE: `invoice` must be a stable reference across re-renders — `useInvoicePreview` has
    // `useEffect(() => setInvoiceData(invoice), [invoice])`, so a fresh object literal created
    // inside the renderHook callback would re-trigger that effect on every render, looping forever.
    const props = { invoice: defaultInvoice, apiBaseUrl: '/api/purchase-invoice', specName: 'purchase-invoice' };
    const { result } = renderHook(() => useInvoicePreview(props));

    await waitFor(() => expect(result.current.loadingPayments).toBe(false));

    expect(result.current.territory).toBe('BIZKAIA');
    expect(getPendingSifTargetsMock).toHaveBeenCalledWith('purchase-invoice', 'sii+tbai', expect.anything(), 'BIZKAIA');
  });

  it('falls back to null territory when tbaiRecord is missing, without throwing', async () => {
    useFiscalConfigMock.mockReturnValue({ profile: 'sii+tbai', tbaiRecord: null });
    const props = { invoice: defaultInvoice, apiBaseUrl: '/api/purchase-invoice', specName: 'purchase-invoice' };
    const { result } = renderHook(() => useInvoicePreview(props));

    await waitFor(() => expect(result.current.loadingPayments).toBe(false));

    expect(result.current.territory).toBeNull();
    expect(getPendingSifTargetsMock).toHaveBeenCalledWith('purchase-invoice', 'sii+tbai', expect.anything(), null);
  });
});

// ETP-5087 follow-up: the org used to fetch fiscal config (SII/TBAI) must be the
// INVOICE's own org (invoiceData.adOrgId), not the top-nav org selector — a
// mismatch used to silently fetch the wrong config (or none).
const invoiceWithOrg = { ...defaultInvoice, adOrgId: 'ORG-INVOICE' };

describe('useInvoicePreview — org resolution (ETP-5087 follow-up)', () => {
  beforeEach(() => {
    useFiscalConfigMock.mockClear();
    apiFetch.mockImplementation(() => emptyResponse());
  });

  it('resolves fiscal config using the invoice adOrgId, not the selected org (useAuth mock returns org-1)', async () => {
    const props = { invoice: invoiceWithOrg, apiBaseUrl: '/api/purchase-invoice', specName: 'purchase-invoice' };
    const { result } = renderHook(() => useInvoicePreview(props));

    await waitFor(() => expect(result.current.loadingPayments).toBe(false));

    expect(result.current.orgId).toBe('ORG-INVOICE');
    expect(useFiscalConfigMock).toHaveBeenCalledWith('ORG-INVOICE', '/api/purchase-invoice');
  });

  it('falls back to the selected org (useAuth) when the invoice record has no adOrgId', async () => {
    const props = { invoice: defaultInvoice, apiBaseUrl: '/api/purchase-invoice', specName: 'purchase-invoice' };
    const { result } = renderHook(() => useInvoicePreview(props));

    await waitFor(() => expect(result.current.loadingPayments).toBe(false));

    expect(result.current.orgId).toBe('org-1');
    expect(useFiscalConfigMock).toHaveBeenCalledWith('org-1', '/api/purchase-invoice');
  });
});
