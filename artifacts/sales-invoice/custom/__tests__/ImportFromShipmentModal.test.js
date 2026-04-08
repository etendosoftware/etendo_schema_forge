import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'ImportFromShipmentModal.jsx'), 'utf8');

describe('ImportFromShipmentModal', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function ImportFromShipmentModal/);
  });

  it('accepts invoiceId, bpId, base, headers, onClose, and onSuccess props', () => {
    assert.match(src, /\{\s*invoiceId.*bpId.*base.*headers.*onClose.*onSuccess\s*\}/);
  });

  it('fetches shipments and existing invoice lines in parallel', () => {
    assert.match(src, /Promise\.all/);
    assert.match(src, /goods-shipment\/goodsShipment/);
    assert.match(src, /sales-invoice\/lines\?parentId=/);
  });

  it('filters shipments by CO status, matching business partner, and not fully invoiced', () => {
    assert.match(src, /documentStatus\s*===\s*'CO'/);
    assert.match(src, /businessPartner\s*===\s*bpId/);
    assert.match(src, /completelyInvoiced\s*!==\s*true/);
  });

  it('tracks already-imported shipment lines and order lines', () => {
    assert.match(src, /alreadyImported/);
    assert.match(src, /goodsShipmentLine/);
    assert.match(src, /salesOrderLine/);
  });

  it('supports search filtering by document number', () => {
    assert.match(src, /search/);
    assert.match(src, /documentNo.*toLowerCase.*includes/s);
  });

  it('fetches shipment lines on expand with order line price enrichment', () => {
    assert.match(src, /fetchLines/);
    assert.match(src, /goods-shipment\/goodsShipmentLine\?parentId=/);
    assert.match(src, /sales-order\/lines\?parentId=/);
  });

  it('marks lines as already imported and disables their selection', () => {
    assert.match(src, /_alreadyImported/);
    assert.match(src, /disabled.*imported/s);
  });

  it('creates invoice lines via POST to sales-invoice/lines', () => {
    assert.match(src, /sales-invoice\/lines/);
    assert.match(src, /method:\s*'POST'/);
  });

  it('uses toast for success, warning, and error feedback', () => {
    assert.match(src, /toast\.success/);
    assert.match(src, /toast\.warning/);
    assert.match(src, /toast\.error/);
  });

  it('supports line and shipment level toggle selection', () => {
    assert.match(src, /toggleLine/);
    assert.match(src, /toggleShipment/);
  });
});
