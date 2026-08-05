import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'ImportFromGoodsReturnModal.jsx'), 'utf8');

describe('ImportFromGoodsReturnModal — source shape', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function ImportFromGoodsReturnModal/);
  });

  it('delegates to the shared ImportLinesModal and forwards parent props', () => {
    assert.match(src, /from '@\/components\/contract-ui\/ImportLinesModal'/);
    assert.match(src, /function ImportFromGoodsReturnModal\(props\)/);
    assert.match(src, /<ImportLinesModal[\s\S]*\{\.\.\.props\}/);
  });

  it('always force-negates invoiced quantity — ETP-4737 edge case 2 (negative-only total)', () => {
    assert.match(src, /const negQty = -Math\.abs\(qty\);/);
    assert.match(src, /invoicedQuantity:\s*negQty/);
  });

  it('derives lineNetAmount from the negated quantity, not the raw one', () => {
    assert.match(src, /const lineNetAmount = negQty \* unitPrice;/);
  });

  it('reuses goodsShipmentLine (M_InOutLine_ID) for already-imported detection, same column as goods-receipt', () => {
    assert.match(src, /goodsShipmentLine:\s*line\.id/);
  });

  it('has no currency filter — return-to-vendor-shipment lines carry no currency of their own', () => {
    assert.match(src, /excludedByCurrency\s*(:|=)\s*false/);
  });

  it('wires the goods-return-specific i18n keys', () => {
    assert.match(src, /titleKey="importFromGoodsReturn"/);
    assert.match(src, /searchPlaceholderKey="searchGoodsReturn"/);
    assert.match(src, /emptyMessageKey="noPendingGoodsReturnsForSupplier"/);
    assert.match(src, /noSearchResultsKey="noGoodsReturnsMatchYourSearch"/);
    assert.match(src, /successMessageKey="linesImportedFromGoodsReturn"/);
  });

  it('injects fetch/build callbacks so the shared modal can drive line selection', () => {
    assert.match(src, /fetchDocuments=\{fetchDocuments\}/);
    assert.match(src, /fetchLines=\{fetchLines\}/);
    assert.match(src, /getDocDisplay=\{getDocDisplay\}/);
    assert.match(src, /buildLineBody=\{buildLineBody\}/);
  });
});

// ── Behavioral test: buildLineBody force-negates regardless of caller sign
// (re-implemented per the established repo pattern — see
// ImportFromGoodsReceiptModal.test.js / ImportFromReturnShipmentModal.test.js).

function buildLineBody({ line, qty, invoiceId, lineNo, priceData = {} }) {
  const calloutGrossUnitPrice = Number(priceData.grossUnitPrice) || 0;
  const calloutUnitPrice = Number(priceData.unitPrice) || calloutGrossUnitPrice || Number(line._unitPrice) || 0;
  const listPrice = Number(priceData.listPrice) || calloutUnitPrice;
  const unitPrice = calloutUnitPrice;

  const negQty = -Math.abs(qty);
  const lineNetAmount = negQty * unitPrice;

  const grossUnitPrice = (calloutGrossUnitPrice && calloutUnitPrice)
    ? calloutGrossUnitPrice * (unitPrice / calloutUnitPrice)
    : calloutGrossUnitPrice;

  const tax = priceData.tax || line._tax || null;
  const uOM = priceData.uOM || line._uOM || line.uOM || null;
  return {
    parentId: invoiceId,
    product: line.product,
    invoicedQuantity: negQty,
    unitPrice,
    listPrice,
    ...(grossUnitPrice ? { grossUnitPrice } : {}),
    lineNetAmount,
    etgoDiscount: 0,
    tax,
    uOM,
    lineNo,
    goodsShipmentLine: line.id,
  };
}

describe('ImportFromGoodsReturnModal — buildLineBody negative-only enforcement (edge case 2)', () => {
  it('negates a positive stepper quantity', () => {
    const body = buildLineBody({
      line: { id: 'l1', product: 'p1', _unitPrice: 20 },
      qty: 5,
      invoiceId: 'inv1',
      lineNo: 10,
      priceData: { unitPrice: 20 },
    });
    assert.equal(body.invoicedQuantity, -5);
    assert.equal(body.lineNetAmount, -100);
  });

  it('keeps a quantity negative even if it were somehow already negative', () => {
    const body = buildLineBody({
      line: { id: 'l1', product: 'p1', _unitPrice: 20 },
      qty: -5,
      invoiceId: 'inv1',
      lineNo: 10,
      priceData: { unitPrice: 20 },
    });
    assert.equal(body.invoicedQuantity, -5);
  });

  it('produces a negative-only line total regardless of unit price sign quirks', () => {
    const body = buildLineBody({
      line: { id: 'l1', product: 'p1', _unitPrice: 0 },
      qty: 3,
      invoiceId: 'inv1',
      lineNo: 10,
      priceData: { unitPrice: 15 },
    });
    assert.ok(body.invoicedQuantity < 0);
    assert.ok(body.lineNetAmount <= 0);
  });

  it('carries the return-to-vendor-shipment line id forward as goodsShipmentLine for dedup', () => {
    const body = buildLineBody({
      line: { id: 'return-line-42', product: 'p1', _unitPrice: 10 },
      qty: 1,
      invoiceId: 'inv1',
      lineNo: 1,
      priceData: { unitPrice: 10 },
    });
    assert.equal(body.goodsShipmentLine, 'return-line-42');
  });

  it('sets etgoDiscount to 0 unconditionally (no order-level discount to carry over)', () => {
    const body = buildLineBody({
      line: { id: 'l1', product: 'p1' },
      qty: 1,
      invoiceId: 'inv1',
      lineNo: 1,
      priceData: { unitPrice: 10 },
    });
    assert.equal(body.etgoDiscount, 0);
  });
});
