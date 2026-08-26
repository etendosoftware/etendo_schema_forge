// ETP-4941 — end-to-end coverage gap closer.
//
// Mirrors useInvoicePdf.productCode.vitest.jsx: the pre-existing
// useQuotationPdf.test.js (node:test) only asserts on SOURCE TEXT
// (e.g. `assert.match(src, /productCode: resolveProductCode\(l\)/)`) — it never
// actually EXECUTES buildQuotationData() with real line data. buildQuotationData()
// is a private, unexported function inside useQuotationPdf.js, so the only way
// to prove its runtime wiring is correct is to drive it through the public
// useQuotationPdf() hook end-to-end.
//
// This directly proves AC3 from the ticket: "Presupuesto de Venta con un
// producto sin SKU → la columna CÓD. queda vacía o muestra '—', no el número
// de línea."

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

import { renderHook, waitFor } from '@testing-library/react';
import { useQuotationPdf } from '../useQuotationPdf.js';

const API_BASE = 'https://api.example/sws/neo/sales-quotation';
const TOKEN = 'tok';

function jsonResponse(body, ok = true) {
  return Promise.resolve({
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    blob: () => Promise.resolve(new Blob(['%PDF-fake'], { type: 'application/pdf' })),
  });
}

describe('useQuotationPdf — end-to-end productCode wiring (ETP-4941)', () => {
  let jsreportCalls;
  let originalFetch;

  beforeEach(() => {
    jsreportCalls = [];
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockNetwork({ header, lines }) {
    globalThis.fetch = vi.fn((url, opts = {}) => {
      const u = String(url);
      if (u.includes('/sales-quotation/quotation/')) {
        return jsonResponse({ response: { data: [header] } });
      }
      if (u.includes('/sales-quotation/quotationLine')) {
        return jsonResponse({ response: { data: lines } });
      }
      if (u.endsWith('/session')) {
        return jsonResponse({ response: { data: {} } });
      }
      if (u.includes('/jsreport/api/report')) {
        jsreportCalls.push(JSON.parse(opts.body));
        return jsonResponse({});
      }
      throw new Error(`Unexpected fetch in test: ${u}`);
    });
  }

  it('AC3: a product with no SKU renders "—" in productCode, never the line number', async () => {
    mockNetwork({
      header: { documentNo: 'QUO-001', grandTotalAmount: 10, summedLineAmount: 10 },
      lines: [
        // No productCode, no product$_value — the AC's "producto sin SKU" case.
        { lineNo: 10, orderedQuantity: 1, unitPrice: 10, lineNetAmount: 10, product$_identifier: 'Unbranded Widget' },
      ],
    });

    const { result } = renderHook(() => useQuotationPdf('q-1', API_BASE, TOKEN));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeNull();
    expect(jsreportCalls).toHaveLength(1);
    const { lines: renderedLines } = jsreportCalls[0].data;
    expect(renderedLines).toHaveLength(1);
    expect(renderedLines[0].productCode).toBe('—');
    expect(renderedLines[0].productCode).not.toBe('10');
    expect(renderedLines[0].productCode).not.toBe(renderedLines[0].lineNo);
  });

  it('mixed lines (SKU present vs. absent) resolve independently — no state leaks between lines', async () => {
    mockNetwork({
      header: { documentNo: 'QUO-002', grandTotalAmount: 20, summedLineAmount: 20 },
      lines: [
        { lineNo: 1, orderedQuantity: 1, unitPrice: 10, lineNetAmount: 10, 'product$_value': 'SKU-X' },
        { lineNo: 2, orderedQuantity: 1, unitPrice: 10, lineNetAmount: 10 },
        { lineNo: 3, orderedQuantity: 1, unitPrice: 10, lineNetAmount: 10, 'product$_value': 'SKU-Z' },
      ],
    });

    const { result } = renderHook(() => useQuotationPdf('q-2', API_BASE, TOKEN));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const { lines: renderedLines } = jsreportCalls[0].data;
    expect(renderedLines[0].productCode).toBe('SKU-X');
    expect(renderedLines[1].productCode).toBe('—');
    expect(renderedLines[2].productCode).toBe('SKU-Z');
  });
});
