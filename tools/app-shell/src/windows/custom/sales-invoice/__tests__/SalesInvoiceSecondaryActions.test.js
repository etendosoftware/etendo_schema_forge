import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'SalesInvoiceSecondaryActions.jsx'), 'utf8');

// ETP-5260 — Clone and Send both moved here from SalesInvoiceTopbar/
// InvoiceTopbarExtra (topbarRight). See InvoiceTopbarExtra.test.js's "detects
// draft status but no longer renders a SendDocumentButton itself" regression
// guard for the sibling coverage. The payment-status badge and SendToSifButton
// stay in InvoiceTopbarExtra (topbarRight) — this component does not touch them.
describe('SalesInvoiceSecondaryActions', () => {
  it('exports a default function component named SalesInvoiceSecondaryActions', () => {
    assert.match(src, /export default function SalesInvoiceSecondaryActions/);
  });

  it('delegates to the shared DocumentSecondaryActions component', () => {
    assert.match(src, /import DocumentSecondaryActions from '@\/windows\/custom\/shared\/DocumentSecondaryActions'/);
    assert.match(src, /<DocumentSecondaryActions/);
  });

  it('forwards windowName="sales-invoice"', () => {
    assert.match(src, /windowName="sales-invoice"/);
  });

  it('reuses the cloneInvoiceError / invoiceProcessing i18n keys SalesInvoiceTopbar used inline before ETP-5260', () => {
    assert.match(src, /clone=\{\{ errorKey: 'cloneInvoiceError', processingKey: 'invoiceProcessing' \}\}/);
  });

  it('gates Send on isCompleted (documentStatus === CO) — this is the ETP-5260 follow-up defect fix (showSend was previously never wired)', () => {
    assert.match(src, /const isCompleted = props\.data\?\.documentStatus === 'CO'/);
    assert.match(src, /showSend=\{isCompleted\}/);
  });

  it('dispatches the sales-invoice:open-send-modal window event on Send click', () => {
    assert.match(
      src,
      /onSendClick=\{\(\) => window\.dispatchEvent\(new CustomEvent\('sales-invoice:open-send-modal'\)\)\}/,
    );
  });

  it('does not render the payment-status badge or SendToSifButton — both stay in InvoiceTopbarExtra (topbarRight)', () => {
    assert.doesNotMatch(src, /<SendToSifButton/);
    assert.doesNotMatch(src, /data-testid="payment-status-badge"/);
  });
});
