import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'OrderCreateInvoice.jsx'), 'utf8');

describe('OrderCreateInvoice', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function OrderCreateInvoice/);
  });

  it('accepts data, recordId, token, and apiBaseUrl props', () => {
    assert.match(src, /\{\s*data.*recordId.*token.*apiBaseUrl\s*\}/);
  });

  it('only shows Create Invoice button when document is completed', () => {
    assert.match(src, /isCompleted/);
    assert.match(src, /documentStatus\s*===\s*'CO'/);
  });

  it('creates draft invoice via POST to sales-order action endpoint', () => {
    assert.match(src, /sales-order\/header\/.*\/action\/createDraftInvoice/);
    assert.match(src, /method:\s*'POST'/);
  });

  it('includes a SendDocumentButton for sending orders', () => {
    assert.match(src, /SendDocumentButton/);
    assert.match(src, /SendDocumentModal/);
  });

  it('renders InvoicePreviewModal via createPortal', () => {
    assert.match(src, /createPortal/);
    assert.match(src, /InvoicePreviewModal/);
  });

  it('passes documentType Order to SendDocumentModal', () => {
    assert.match(src, /documentType="Order"/);
  });

  it('checks for existing draft invoices in preview modal', () => {
    assert.match(src, /checkDraftInvoice/);
    assert.match(src, /existingDraft/);
  });

  it('calculates invoiceable quantities (delivered/ordered minus invoiced)', () => {
    assert.match(src, /orderedQuantity/);
    assert.match(src, /deliveredQuantity/);
    assert.match(src, /invoicedQuantity/);
    assert.match(src, /qtyToInvoice/);
  });

  it('uses toast for invoice creation feedback', () => {
    assert.match(src, /toast\.custom|toast\.success|toast\.error/);
  });

  it('navigates to invoice detail after creation', () => {
    assert.match(src, /sales-invoice\//);
    assert.match(src, /View Invoice/);
  });
});
