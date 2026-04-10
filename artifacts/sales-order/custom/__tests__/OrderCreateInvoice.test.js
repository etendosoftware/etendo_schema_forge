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

  it('renders Confirmar button for draft orders', () => {
    assert.match(src, /isDraft/);
    assert.match(src, /documentStatus\s*===\s*'DR'/);
    assert.match(src, /Confirmar/);
  });

  it('uses createPortal for modal rendering', () => {
    assert.match(src, /createPortal/);
    assert.match(src, /document\.body/);
  });

  it('ConfirmModal has three radio options', () => {
    assert.match(src, /Solo confirmar/);
    assert.match(src, /Confirmar y crear albarán/);
    assert.match(src, /Confirmar y facturar/);
  });

  it('confirms order via documentAction endpoint', () => {
    assert.match(src, /action\/documentAction/);
    assert.match(src, /action:\s*['"]CO['"]/);
    assert.match(src, /method:\s*'POST'/);
  });

  it('creates shipment via createShipment action', () => {
    assert.match(src, /action\/createShipment/);
  });

  it('creates draft invoice via createDraftInvoice action', () => {
    assert.match(src, /action\/createDraftInvoice/);
  });

  it('fetches all linked invoices via listInvoices action', () => {
    assert.match(src, /listInvoices/);
    assert.match(src, /action\/listInvoices/);
  });

  it('only shows completed-order UI when document is completed', () => {
    assert.match(src, /isCompleted/);
    assert.match(src, /documentStatus\s*===\s*'CO'/);
  });

  it('shows DraftChip pills for pending draft documents', () => {
    assert.match(src, /DraftChip/);
    assert.match(src, /shipmentsDraft/);
    assert.match(src, /invoiceDraft/);
  });

  it('calculates pending quantity and amount', () => {
    assert.match(src, /qtyOrdered/);
    assert.match(src, /qtyDelivered/);
    assert.match(src, /qtyPending/);
    assert.match(src, /totalPending/);
  });

  it('shows dynamic Gestionar button — draft-aware (needsShip/needsInvoice)', () => {
    // Button only appears when pending AND no existing draft covers the action
    assert.match(src, /needsShip/);
    assert.match(src, /needsInvoice/);
    assert.match(src, /shipmentsDraft\.length === 0/);
    assert.match(src, /!invoiceDraft/);
    assert.match(src, /Gestionar envío y factura/);
    assert.match(src, /Gestionar envío/);
    assert.match(src, /Gestionar factura/);
  });

  it('dispatches document-created event after creating a doc', () => {
    assert.match(src, /sales-order:document-created/);
    assert.match(src, /dispatchEvent/);
  });

  it('navigates to shipment and invoice detail after creation', () => {
    assert.match(src, /\/goods-shipment\//);
    assert.match(src, /\/sales-invoice\//);
  });

  it('scrolls ActionsModal to the relevant section when opened from a chip', () => {
    assert.match(src, /actionsScroll|scrollTo/);
    assert.match(src, /scrollIntoView/);
  });
});
