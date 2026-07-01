import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'ImportFromReturnShipmentModal.jsx'), 'utf8');

describe('ImportFromReturnShipmentModal', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function ImportFromReturnShipmentModal/);
  });

  it('delegates to the shared ImportLinesModal and forwards parent props', () => {
    assert.match(src, /from '@\/components\/contract-ui\/ImportLinesModal'/);
    assert.match(src, /function ImportFromReturnShipmentModal\(props\)/);
    assert.match(src, /<ImportLinesModal[\s\S]*\{\.\.\.props\}/);
  });

  it('fetches customer returns and existing invoice lines in parallel', () => {
    assert.match(src, /Promise\.all/);
    assert.match(src, /return-from-customer\/customerReturn/);
    assert.match(src, /sales-invoice\/lines\?parentId=/);
  });

  it('filters returns by CO status and matching business partner', () => {
    assert.match(src, /documentStatus\s*===\s*'CO'/);
    assert.match(src, /businessPartner\s*===\s*bpId/);
  });

  it('tracks already-imported return lines via mInoutlineId', () => {
    assert.match(src, /alreadyImportedReturnLines/);
    assert.match(src, /mInoutlineId/);
  });

  it('excludes returns whose lines are fully invoiced elsewhere', () => {
    assert.match(src, /invoicedElsewhere/);
    assert.match(src, /invoicedElsewhere\.has/);
  });

  it('wires the return-shipment-specific i18n keys', () => {
    assert.match(src, /titleKey="importFromReturnShipment"/);
    assert.match(src, /searchPlaceholderKey="searchReturnShipment"/);
    assert.match(src, /emptyMessageKey="noReturnShipmentsForCustomer"/);
    assert.match(src, /noSearchResultsKey="noReturnShipmentsMatchSearch"/);
    assert.match(src, /successMessageKey="linesImportedFromReturnShipment"/);
  });

  it('fetches return shipment lines on expand', () => {
    assert.match(src, /fetchLines/);
    assert.match(src, /return-from-customer\/customerReturnLine\?parentId=/);
  });

  it('marks lines as already imported via goodsShipmentLine', () => {
    assert.match(src, /_alreadyImported/);
    assert.match(src, /alreadyImportedReturnLines\?\.has\(l\.goodsShipmentLine\)/);
  });

  it('negates quantity for ARI_RM return invoice lines', () => {
    assert.match(src, /-Math\.abs\(qty\)/);
    assert.match(src, /negQty/);
    assert.match(src, /invoicedQuantity:\s*negQty/);
  });

  it('passes mInoutlineId to link invoice line back to the return shipment line', () => {
    assert.match(src, /mInoutlineId:\s*line\.goodsShipmentLine/);
  });

  it('injects fetch/build callbacks so the shared modal can drive line selection', () => {
    assert.match(src, /fetchDocuments=\{fetchDocuments\}/);
    assert.match(src, /fetchLines=\{fetchLines\}/);
    assert.match(src, /getDocDisplay=\{getDocDisplay\}/);
    assert.match(src, /buildLineBody=\{buildLineBody\}/);
  });
});
