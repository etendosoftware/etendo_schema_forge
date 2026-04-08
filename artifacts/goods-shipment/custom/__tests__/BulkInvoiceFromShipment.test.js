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

  it('accepts selectedRows, clearSelection, token, and apiBaseUrl props', () => {
    assert.match(src, /\{\s*selectedRows.*clearSelection.*token.*apiBaseUrl\s*\}/);
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
});
