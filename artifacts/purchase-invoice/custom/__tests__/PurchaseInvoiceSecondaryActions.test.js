import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'PurchaseInvoiceSecondaryActions.jsx'), 'utf8');

// ETP-5260 — Clone and "Enviar a SIF" used to render inline in
// PurchaseInvoiceTopbar (topbarRight, to the RIGHT of Save/Confirm). Both
// moved here (topbarSecondary, LEFT of Save/Confirm) — see
// PurchaseInvoiceTopbar.vitest.jsx's regression guard ("never renders a clone
// button or a send-to-sif button").
describe('PurchaseInvoiceSecondaryActions', () => {
  it('exports a default function component named PurchaseInvoiceSecondaryActions', () => {
    assert.match(src, /export default function PurchaseInvoiceSecondaryActions/);
  });

  it('delegates to the shared DocumentSecondaryActions component', () => {
    assert.match(src, /import DocumentSecondaryActions from '@\/windows\/custom\/shared\/DocumentSecondaryActions'/);
    assert.match(src, /<DocumentSecondaryActions/);
  });

  it('forwards windowName="purchase-invoice"', () => {
    assert.match(src, /windowName="purchase-invoice"/);
  });

  it('reuses the cloneInvoiceError / invoiceProcessing i18n keys PurchaseInvoiceTopbar used inline before ETP-5260', () => {
    assert.match(src, /clone=\{\{ errorKey: 'cloneInvoiceError', processingKey: 'invoiceProcessing' \}\}/);
  });

  it('has no showSend/onSendClick prop wiring — this window has no generic "send by email" here', () => {
    assert.doesNotMatch(src, /showSend=/);
    assert.doesNotMatch(src, /onSendClick=/);
  });

  it('renders SendToSifButton as a child, after Clone, matching the DF "Enviar" position', () => {
    assert.match(src, /import SendToSifButton from '@\/windows\/custom\/shared\/SendToSifButton\.jsx'/);
    const cloneIdx = src.indexOf('clone={{');
    const childIdx = src.indexOf('<SendToSifButton');
    assert.ok(cloneIdx !== -1 && childIdx !== -1 && cloneIdx < childIdx);
  });

  it('gates SendToSifButton on the invoice status via the status prop', () => {
    assert.match(src, /<SendToSifButton[\s\S]*?status=\{data\?\.documentStatus\}/);
  });
});
