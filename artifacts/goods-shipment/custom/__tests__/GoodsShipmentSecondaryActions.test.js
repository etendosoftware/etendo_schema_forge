import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'GoodsShipmentSecondaryActions.jsx'), 'utf8');

// ETP-5260 — the Send button itself moved here from GoodsShipmentActions.jsx
// (topbarRight). See GoodsShipmentActions.test.js's "SendDocumentModal
// integration" describe block for the sibling coverage of the modal that
// remains in topbarRight (it carries the client-rendered delivery-note PDF
// context this shared component does not have).
describe('GoodsShipmentSecondaryActions', () => {
  it('exports a default function component named GoodsShipmentSecondaryActions', () => {
    assert.match(src, /export default function GoodsShipmentSecondaryActions/);
  });

  it('delegates to the shared DocumentSecondaryActions component', () => {
    assert.match(src, /import DocumentSecondaryActions from '@\/windows\/custom\/shared\/DocumentSecondaryActions'/);
    assert.match(src, /<DocumentSecondaryActions/);
  });

  it('forwards windowName="goods-shipment"', () => {
    assert.match(src, /windowName="goods-shipment"/);
  });

  // Unlike purchase-order/sales-order/sales-quotation (auto-navigate to the
  // new record), goods-shipment keeps its pre-ETP-5260 "review then click
  // through" clone UX via CloneOrderModal's own routePrefix "State 2".
  it('clones via headerEntity=goodsShipment with routePrefix (not the default auto-navigate UX)', () => {
    assert.match(src, /clone=\{\{ headerEntity: 'goodsShipment', routePrefix: '\/goods-shipment\/' \}\}/);
  });

  it('gates Send on isCompleted (documentStatus === CO), matching GoodsShipmentActions\' own gate (ETP-4717)', () => {
    assert.match(src, /const isCompleted = props\.data\?\.documentStatus === 'CO'/);
    assert.match(src, /showSend=\{isCompleted\}/);
  });

  it('dispatches the goods-shipment:open-send-modal window event on Send click', () => {
    assert.match(
      src,
      /onSendClick=\{\(\) => window\.dispatchEvent\(new CustomEvent\('goods-shipment:open-send-modal'\)\)\}/,
    );
  });
});
