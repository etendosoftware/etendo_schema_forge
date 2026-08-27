// ETP-4941 — end-to-end coverage gap closer.
//
// The pre-existing useInvoicePdf.test.js (node:test) only asserts on SOURCE TEXT
// (e.g. `assert.match(src, /productCode: resolveProductCode\(l\)/)`) — it never
// actually EXECUTES buildInvoiceData() with real line data. Unlike buildOrderData()
// (exported from documentPdf.js, exercised directly in
// documentPdf.buildOrderData.vitest.jsx), buildInvoiceData() is a private,
// unexported function inside useInvoicePdf.js, so the only way to prove its
// runtime wiring is correct is to drive it through the public useInvoicePdf()
// hook end-to-end.
//
// This file does NOT mock documentPdf.js or pdfUtils.js — it lets the real
// buildInvoiceData -> resolveProductCode -> renderDocumentPdf -> renderPdf chain
// run, and intercepts only the network boundary (global fetch), capturing the
// exact payload jsreport would receive. This directly proves AC2 from the
// ticket: "Factura de Venta con dos líneas de producto con SKUs distintos →
// cada fila muestra el SKU correspondiente."

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

import { renderHook, waitFor } from '@testing-library/react';
import { useInvoicePdf } from '../useInvoicePdf.js';

const API_BASE = 'https://api.example/sws/neo/sales-invoice';
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

describe('useInvoicePdf — end-to-end productCode wiring (ETP-4941)', () => {
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
      if (u.includes('/sales-invoice/header/')) {
        return jsonResponse({ response: { data: [header] } });
      }
      if (u.includes('/sales-invoice/lines')) {
        return jsonResponse({ response: { data: lines } });
      }
      if (u.endsWith('/session')) {
        return jsonResponse({ response: { data: {} } });
      }
      if (u.includes('/jsreport/api/report')) {
        jsreportCalls.push(JSON.parse(opts.body));
        return jsonResponse({});
      }
      // Any other URL (e.g. locationAddress, image) — not exercised in this
      // fixture set; fail loudly instead of silently mis-mocking.
      throw new Error(`Unexpected fetch in test: ${u}`);
    });
  }

  it('AC2: two lines with distinct SKUs — each row carries its own product SKU', async () => {
    mockNetwork({
      header: {
        documentNo: 'INV-001',
        grandTotalAmount: 25,
        summedLineAmount: 25,
        businessPartner$_identifier: 'ACME Corp',
      },
      lines: [
        { lineNo: 1, invoicedQuantity: 2, unitPrice: 10, lineNetAmount: 20, 'product$_value': 'MON-24HD', product$_identifier: 'Monitor 24" HD' },
        { lineNo: 2, invoicedQuantity: 1, unitPrice: 5, lineNetAmount: 5, 'product$_value': 'KEYB-01', product$_identifier: 'Keyboard' },
      ],
    });

    const { result } = renderHook(() => useInvoicePdf('inv-1', API_BASE, TOKEN));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeNull();
    expect(jsreportCalls).toHaveLength(1);
    const { lines: renderedLines } = jsreportCalls[0].data;
    expect(renderedLines).toHaveLength(2);
    expect(renderedLines[0].productCode).toBe('MON-24HD');
    expect(renderedLines[1].productCode).toBe('KEYB-01');
    // Never the line number/index (the original ETP-4941 bug).
    expect(renderedLines[0].productCode).not.toBe(renderedLines[0].lineNo);
    expect(renderedLines[1].productCode).not.toBe(renderedLines[1].lineNo);
  });

  it('falls back to "—" (never the line number) when a line has no SKU', async () => {
    mockNetwork({
      header: { documentNo: 'INV-002', grandTotalAmount: 5, summedLineAmount: 5 },
      lines: [
        { lineNo: 7, invoicedQuantity: 1, unitPrice: 5, lineNetAmount: 5, product$_identifier: 'No-SKU Product' },
      ],
    });

    const { result } = renderHook(() => useInvoicePdf('inv-2', API_BASE, TOKEN));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const { lines: renderedLines } = jsreportCalls[0].data;
    expect(renderedLines[0].productCode).toBe('—');
    expect(renderedLines[0].productCode).not.toBe('7');
  });

  it('mixed lines (direct productCode, product$_value-only, and no-SKU) resolve independently with no cross-line leakage', async () => {
    mockNetwork({
      header: { documentNo: 'INV-003', grandTotalAmount: 30, summedLineAmount: 30 },
      lines: [
        { lineNo: 1, invoicedQuantity: 1, unitPrice: 10, lineNetAmount: 10, productCode: 'DIRECT-A' },
        { lineNo: 2, invoicedQuantity: 1, unitPrice: 10, lineNetAmount: 10, 'product$_value': 'VALUE-B' },
        { lineNo: 3, invoicedQuantity: 1, unitPrice: 10, lineNetAmount: 10 },
      ],
    });

    const { result } = renderHook(() => useInvoicePdf('inv-3', API_BASE, TOKEN));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const { lines: renderedLines } = jsreportCalls[0].data;
    expect(renderedLines[0].productCode).toBe('DIRECT-A');
    expect(renderedLines[1].productCode).toBe('VALUE-B');
    expect(renderedLines[2].productCode).toBe('—');
  });
});
