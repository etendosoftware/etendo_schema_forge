import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'InvoiceHeaderTable.jsx'), 'utf8');

describe('Purchase InvoiceHeaderTable — columns', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function InvoiceHeaderTable/);
  });

  it('defines base columns with correct AD bindings', () => {
    assert.match(src, /key: 'invoiceDate',\s*column: 'DateInvoiced'/);
    assert.match(src, /key: 'orderReference',\s*column: 'POReference'/);
    assert.match(src, /key: 'businessPartner',\s*column: 'C_BPartner_ID'/);
    assert.match(src, /key: 'documentStatus',\s*column: 'DocStatus'/);
    assert.match(src, /key: 'grandTotalAmount',\s*column: 'GrandTotal'/);
    assert.match(src, /key: 'outstandingAmount',\s*column: 'OutstandingAmt'/);
  });

  it('renders delivery status as a percent progress bar', () => {
    assert.match(src, /key: 'eTGODeliveryStatus'[\s\S]*?type: 'percent'/);
  });
});

// ── ETP-4125: fiscal status read directly from row data ──────────────────────
// Risk: regression to batch GET hook would silently reintroduce the nginx URL
// length issue (403 on 53+ invoices). This file is used by the generated
// HeaderPage (detail view); the list view uses PurchaseInvoiceHeaderTable.

describe('Purchase InvoiceHeaderTable — fiscal status columns (ETP-4125)', () => {
  it('does NOT import useInvoiceListFiscalStatus (batch hook eliminated)', () => {
    assert.doesNotMatch(src, /useInvoiceListFiscalStatus/,
      'The batch-fetch hook was removed in ETP-4125 to fix nginx URL-length errors');
  });

  it('reads SII status directly from row.aeatsiiEstado', () => {
    assert.match(src, /row\.aeatsiiEstado/,
      'SII status must come from the row field, not a separate fetch');
  });

  it('does not render a Verifactu column (purchase invoices only have SII)', () => {
    assert.doesNotMatch(src, /row\.etvfacInvoiceStatus/,
      'Verifactu is sales-only — purchase invoices must not render an etvfacInvoiceStatus column');
  });

  it('does not maintain a statusMap or fiscalLoading variable', () => {
    assert.doesNotMatch(src, /statusMap/);
    assert.doesNotMatch(src, /fiscalLoading/);
  });

  it('does not hold a token prop (no auth header needed for inline fields)', () => {
    assert.doesNotMatch(src, /const\s*\{[^}]*\btoken\b/,
      'token prop was removed when the batch fetch was eliminated');
  });
});
