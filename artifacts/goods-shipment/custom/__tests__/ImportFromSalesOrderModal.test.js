import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'ImportFromSalesOrderModal.jsx'), 'utf8');

describe('ImportFromSalesOrderModal', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function ImportFromSalesOrderModal/);
  });

  it('delegates to the shared ImportLinesModal', () => {
    assert.match(src, /import ImportLinesModal from '@\/components\/contract-ui\/ImportLinesModal'/);
    assert.match(src, /<ImportLinesModal/);
  });

  describe('ETP-4028 — currency-aware fetchDocuments', () => {
    it('fetches the current shipment header to read its currency', () => {
      assert.match(src, /goods-shipment\/goodsShipment\/\$\{shipmentId\}/);
      assert.match(src, /shipmentCurrency\s*=\s*\(await headerRes\.json\(\)\)\?\.response\?\.data\?\.\[0\]\?\.etgoCurrency/);
    });

    it('computes status/BP/pending-delivery candidates before applying the currency filter', () => {
      assert.match(
        src,
        /const candidates = all\.filter\(o =>\s*\n\s*o\.documentStatus === 'CO'\s*\n\s*&& o\.businessPartner === bpId\s*\n\s*&& Number\(o\.deliveryStatus \?\? 100\) < 100,?\s*\n\s*\);/,
      );
    });

    it('filters candidates by matching currency only when a shipment currency was resolved', () => {
      assert.match(
        src,
        /documents = shipmentCurrency \? candidates\.filter\(o => o\.currency === shipmentCurrency\) : candidates;/,
      );
    });

    it('flags excludedByCurrency only when eligible candidates exist but none match currency', () => {
      assert.match(
        src,
        /excludedByCurrency = !!shipmentCurrency && documents\.length === 0 && candidates\.length > 0;/,
      );
    });

    it('returns documents, sharedContext, and excludedByCurrency from fetchDocuments', () => {
      assert.match(src, /return \{ documents, sharedContext: \{ draftInfo \}, excludedByCurrency \};/);
    });
  });

  it('passes noSalesOrdersMatchShipmentCurrency as the noCurrencyMatchMessageKey', () => {
    assert.match(src, /noCurrencyMatchMessageKey="noSalesOrdersMatchShipmentCurrency"/);
  });
});
