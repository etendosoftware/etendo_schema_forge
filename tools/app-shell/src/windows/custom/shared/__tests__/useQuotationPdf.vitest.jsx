// @covers tools/app-shell/src/windows/custom/shared/useQuotationPdf.js
// Mocks must come before imports (Vitest hoisting)

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('../documentPdf.js', () => ({
  fetchJson: vi.fn(),
  fetchAll: vi.fn(),
  fetchOptionalJson: vi.fn(),
  fetchDocumentAssets: vi.fn(() => Promise.resolve({ companyLogoDataUrl: null, partnerLocation: null })),
  sortDocumentLines: vi.fn((lines) => [...lines]),
  buildCompanyFields: vi.fn(() => ({})),
  buildDocumentPdfLabels: vi.fn((ui, overrides) => ({ ...overrides, taxId: 'invoicePdfTaxId' })),
  computeDiscountBreakdown: vi.fn(() => ({ grossAmount: 0, discountPerProduct: 0, totalDiscountAmt: 0, productNetAmount: 0 })),
  useDocumentPdf: vi.fn(() => ({ pdfUrl: null, pdfBlob: null, loading: false, error: null })),
}));

import { renderHook } from '@testing-library/react';
import { quotationNotesAndRejectReason, useQuotationPdf } from '../useQuotationPdf.js';
import { buildDocumentPdfLabels, useDocumentPdf } from '../documentPdf.js';

describe('useQuotationPdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDocumentPdf.mockReturnValue({ pdfUrl: null, pdfBlob: null, loading: false, error: null });
    buildDocumentPdfLabels.mockImplementation((ui, overrides) => ({ ...overrides, taxId: 'invoicePdfTaxId' }));
  });

  it('calls useDocumentPdf with the passed quotationId, apiBaseUrl, and token', () => {
    renderHook(() => useQuotationPdf('q-1', '/api', 'tok'));
    expect(useDocumentPdf).toHaveBeenCalledWith(
      'q-1',
      '/api',
      'tok',
      expect.any(Function),
      expect.any(Object),
      null,
      'sales-quotation',
    );
  });

  it('calls buildDocumentPdfLabels with quotation-specific i18n keys', () => {
    renderHook(() => useQuotationPdf('q-1', '/api', 'tok'));
    expect(buildDocumentPdfLabels).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        title: 'quotationPdfTitle',
        documentNo: 'quotationPdfDocumentNo',
        documentSection: 'quotationPdfSection',
        date: 'quotationPdfDate',
        colQty: 'quotationPdfColQty',
      }),
    );
  });

  it('includes validUntil label in the overrides passed to buildDocumentPdfLabels', () => {
    renderHook(() => useQuotationPdf('q-1', '/api', 'tok'));
    expect(buildDocumentPdfLabels).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        validUntil: 'quotationPdfValidUntil',
      }),
    );
  });

  it('returns the result of useDocumentPdf', () => {
    useDocumentPdf.mockReturnValue({ pdfUrl: 'blob:q-test', pdfBlob: new Blob(), loading: false, error: null });
    const { result } = renderHook(() => useQuotationPdf('q-1', '/api', 'tok'));
    expect(result.current.pdfUrl).toBe('blob:q-test');
    expect(result.current.pdfBlob).toBeInstanceOf(Blob);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('passes null quotationId through to useDocumentPdf when quotationId is null', () => {
    renderHook(() => useQuotationPdf(null, '/api', 'tok'));
    expect(useDocumentPdf).toHaveBeenCalledWith(
      null,
      '/api',
      'tok',
      expect.any(Function),
      expect.any(Object),
      null,
      'sales-quotation',
    );
  });
});

// The rejected quotation prints exactly one "Motivo" line: the tenant's reason when the seller set
// one, else the customer's portal reason read from the line the portal appended to the notes. That
// line always leaves the notes, so the observations never say the reason twice.
describe('quotationNotesAndRejectReason', () => {
  const PORTAL_ES = 'Rechazado por el cliente desde el portal. Motivo: Precio demasiado alto.';
  const PORTAL_EN = 'Rejected by the customer from the portal. Reason: Delivery too late.';

  it.each([
    [
      'CJ + portal line: the reason comes from the note, which leaves the notes',
      { documentStatus: 'CJ', description: `Gracias por la oferta\n${PORTAL_ES}` },
      { notes: 'Gracias por la oferta', rejectReason: 'Precio demasiado alto' },
    ],
    [
      'CJ + portal line + tenant reason: only the portal reason, the internal one is never printed',
      { documentStatus: 'CJ', description: `Gracias\n${PORTAL_ES}`, 'rejectReason$_identifier': 'Competencia' },
      { notes: 'Gracias', rejectReason: 'Precio demasiado alto' },
    ],
    [
      'CJ + "Otros: <text>": the free text is the reason',
      { documentStatus: 'CJ', description: 'Rechazado por el cliente desde el portal. Motivo: Otros: Ya no lo necesitamos.' },
      { notes: null, rejectReason: 'Otros: Ya no lo necesitamos' },
    ],
    [
      'CJ + the English portal line',
      { documentStatus: 'CJ', description: PORTAL_EN },
      { notes: null, rejectReason: 'Delivery too late' },
    ],
    [
      'CJ with only a tenant reason: the notes stay as they are and no reason is printed',
      { documentStatus: 'CJ', description: 'Nota interna', 'rejectReason$_identifier': 'Competencia' },
      { notes: 'Nota interna', rejectReason: null },
    ],
    [
      'not rejected: the notes are untouched, portal line included, and there is no reason',
      { documentStatus: 'UE', description: PORTAL_ES, 'rejectReason$_identifier': 'Competencia' },
      { notes: PORTAL_ES, rejectReason: null },
    ],
    ['CJ with an empty description', { documentStatus: 'CJ', description: '' }, { notes: null, rejectReason: null }],
    ['CJ with no description', { documentStatus: 'CJ', description: null }, { notes: null, rejectReason: null }],
    ['not rejected with no description', { documentStatus: 'CO', description: null }, { notes: null, rejectReason: null }],
  ])('%s', (_label, header, expected) => {
    expect(quotationNotesAndRejectReason(header)).toEqual(expected);
  });
});
