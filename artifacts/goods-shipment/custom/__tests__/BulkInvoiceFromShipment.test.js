import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'BulkInvoiceFromShipment.jsx'), 'utf8');

describe('BulkInvoiceFromShipment', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function BulkInvoiceFromShipment/);
  });

  it('accepts selectedRows, clearSelection, token, apiBaseUrl and refresh props', () => {
    assert.match(
      src,
      /export default function BulkInvoiceFromShipment\(\{\s*selectedRows,\s*clearSelection,\s*token,\s*apiBaseUrl,\s*refresh\s*\}\)/,
    );
  });

  it('filters invoiceable rows by documentStatus CO and not completely invoiced', () => {
    assert.match(src, /documentStatus\s*===\s*'CO'/);
    assert.match(src, /completelyInvoiced\s*!==\s*true/);
  });

  it('checks all selected shipments belong to the same business partner', () => {
    assert.match(src, /invoiceableRows\.every\(r\s*=>\s*r\.businessPartner\s*===\s*firstBp\)/);
  });

  it('returns null when no rows are selected', () => {
    assert.match(src, /selectedRows\.length\s*<\s*1.*return null/s);
  });

  it('renders a BulkInvoiceModal via createPortal', () => {
    assert.match(src, /createPortal/);
    assert.match(src, /BulkInvoiceModal/);
  });

  it('fetches shipment lines from goods-shipment API', () => {
    assert.match(src, /goods-shipment\/goodsShipmentLine\?parentId=/);
  });

  it('fetches order line prices for unit price enrichment', () => {
    assert.match(src, /sales-order\/lines\?parentId=/);
  });

  it('checks for existing draft invoices before creation', () => {
    assert.match(src, /action\/checkDraftInvoice/);
  });

  it('creates draft invoice via action endpoint', () => {
    assert.match(src, /action\/createDraftInvoice/);
  });

  it('supports line selection toggle and quantity editing', () => {
    assert.match(src, /toggleLine/);
    assert.match(src, /setLineQuantities/);
  });

  it('uses toast notifications for success and error feedback', () => {
    assert.match(src, /toast\.success|toast\.custom|toast\.error/);
  });

  it('supports collapse/expand per shipment', () => {
    assert.match(src, /toggleCollapse/);
    assert.match(src, /collapsed/);
  });

  // ETP-5302 — this action used to close the modal and clear the selection but never
  // refetch (and never reload either), so the shipments it had just invoiced kept
  // showing a stale invoicing status with nothing on screen hinting they were out of
  // date. `refresh` comes from ListView's `bulkActions` slot context, the same one
  // BulkDocumentAction and the kebab menu now use.
  describe('ETP-5302 — refetches the list after a successful bulk invoice', () => {
    it('invokes refresh (in addition to clearSelection) from the modal onSuccess', () => {
      assert.match(
        src,
        /onSuccess=\{\(\)\s*=>\s*\{[\s\S]*?clearSelection\(\);[\s\S]*?refresh\?\.\(\);[\s\S]*?\}\}/,
      );
    });

    it('calls refresh optionally so a host that supplies no refresh cannot crash', () => {
      assert.match(src, /refresh\?\.\(\)/);
      assert.doesNotMatch(src, /[^?.]\brefresh\(\)/);
    });

    it('still closes the modal on success', () => {
      assert.match(src, /onSuccess=\{\(\)\s*=>\s*\{\s*setShowModal\(false\);/);
    });

    it('does not refetch on a plain cancel/close (nothing changed server-side)', () => {
      assert.match(src, /onClose=\{\(\)\s*=>\s*setShowModal\(false\)\}/);
    });

    it('the modal reports success through onSuccess after the create call', () => {
      assert.match(src, /onSuccess\(\);/);
    });
  });

  describe('ETP-4028 — currencyCheck (mixed-currency selections block bulk invoicing)', () => {
    it('computes currencyCheck as a useMemo mirroring the bpCheck shape', () => {
      assert.match(src, /const currencyCheck = useMemo\(\(\) => \{/);
    });

    it('returns { same: false } when there are no invoiceable rows', () => {
      assert.match(
        src,
        /const currencyCheck = useMemo\(\(\) => \{\s*\n\s*if \(invoiceableRows\.length === 0\) return \{ same: false \};/,
      );
    });

    it('derives allSame by comparing every row.etgoCurrency to the first row', () => {
      assert.match(src, /const firstCurrency = invoiceableRows\[0\]\.etgoCurrency;/);
      assert.match(
        src,
        /const allSame = invoiceableRows\.every\(r => r\.etgoCurrency === firstCurrency\);/,
      );
    });

    it('requires currencyCheck.same (in addition to bpCheck.same) for canCreate', () => {
      assert.match(
        src,
        /const canCreate = invoiceableCount > 0 && bpCheck\.same && currencyCheck\.same;/,
      );
    });

    it('shows the selectShipmentsSameCurrency tooltip only when the BP check passes but currency differs', () => {
      assert.match(
        src,
        /!bpCheck\.same\s*\n\s*\?\s*ui\('selectShipmentsSameCustomer'\)\s*\n\s*:\s*!currencyCheck\.same\s*\n\s*\?\s*ui\('selectShipmentsSameCurrency'\)/,
      );
    });
  });
});
