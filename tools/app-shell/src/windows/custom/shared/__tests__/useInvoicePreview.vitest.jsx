// Mocks must come before imports (Vitest hoisting)
//
// ETP-4315 follow-up (2026-08-18) — pdfCacheConfig ({ tableName: 'C_Invoice',
// storeCondition: invoiceData?.documentStatus !== 'DR' }) is computed and passed
// to useInvoicePdf INSIDE useInvoicePreview.js, not inside InvoicePreview.jsx
// (which only calls useInvoicePreview and never sees the cache config itself).
// InvoicePreview.vitest.jsx mocks useInvoicePreview.js wholesale, so it cannot
// exercise this wiring — this dedicated hook-level test file is the correct
// place to cover it (no pre-existing test file covered useInvoicePreview.js).

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('../useInvoicePdf.js', () => ({
  useInvoicePdf: vi.fn(() => ({ pdfUrl: null, pdfBlob: null, loading: false, error: null })),
}));

vi.mock('@/windows/custom/fiscal-config/useFiscalConfig.js', () => ({
  useFiscalConfig: () => ({ profile: null }),
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ token: 'tok', selectedOrg: { id: 'org-1' } }),
}));

vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: () => vi.fn(() => Promise.resolve({ ok: true, json: async () => ({ response: { data: [] } }) })),
}));

vi.mock('../sifSending.js', () => ({
  getPendingSifTargets: () => ({ sendSii: false, sendTbai: false }),
  getSifBodyKey: () => null,
}));

vi.mock('@/lib/statusBadge.js', () => ({
  getStatusBadgeProps: () => ({}),
  statusLabel: (status) => status,
}));

import { renderHook } from '@testing-library/react';
import { useInvoicePreview } from '../useInvoicePreview.js';
import { useInvoicePdf } from '../useInvoicePdf.js';

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
    useInvoicePdf.mockReturnValue({ pdfUrl: null, pdfBlob: null, loading: false, error: null });
  });

  function lastCacheConfig() {
    const calls = vi.mocked(useInvoicePdf).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    return calls[calls.length - 1][3];
  }

  it('passes { tableName: "C_Invoice", storeCondition: false } when the invoice is DR (draft)', () => {
    renderUseInvoicePreview({ invoice: { ...defaultInvoice, documentStatus: 'DR' } });
    expect(lastCacheConfig()).toEqual({ tableName: 'C_Invoice', storeCondition: false });
  });

  it('passes { tableName: "C_Invoice", storeCondition: true } when the invoice is CO (non-draft)', () => {
    renderUseInvoicePreview({ invoice: { ...defaultInvoice, documentStatus: 'CO' } });
    expect(lastCacheConfig()).toEqual({ tableName: 'C_Invoice', storeCondition: true });
  });

  it('passes recordId/apiBaseUrl as null to useInvoicePdf for the purchase-invoice branch (hook never renders a sales PDF)', () => {
    renderUseInvoicePreview({ specName: 'purchase-invoice', invoice: { ...defaultInvoice, documentStatus: 'CO' } });
    const calls = vi.mocked(useInvoicePdf).mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall[0]).toBeNull();
    expect(lastCall[1]).toBeNull();
    // cacheConfig is still computed unconditionally (harmless — usePdfGenerator
    // never fires its effect without a recordId/apiBaseUrl anyway).
    expect(lastCall[3]).toEqual({ tableName: 'C_Invoice', storeCondition: true });
  });
});
