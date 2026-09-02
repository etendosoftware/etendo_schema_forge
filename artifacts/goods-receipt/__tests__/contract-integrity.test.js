import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const contract = JSON.parse(
  readFileSync(join(__dirname, '..', 'contract.json'), 'utf8'),
);
const lineFormSrc = readFileSync(
  join(__dirname, '..', 'generated', 'web', 'goods-receipt', 'GoodsReceiptLineForm.jsx'),
  'utf8',
);
const pageSrc = readFileSync(
  join(__dirname, '..', 'generated', 'web', 'goods-receipt', 'GoodsReceiptPage.jsx'),
  'utf8',
);

const header = contract.frontendContract.entities.goodsReceipt;
const lines = contract.frontendContract.entities.goodsReceiptLine;

function headerField(name) {
  return header.fields.find((field) => field.name === name);
}

function lineField(name) {
  return lines.fields.find((field) => field.name === name);
}

describe('goods-receipt contract integrity (ETP-5062 manual-add safety default)', () => {
  it('does not override movementQuantity.defaultValue — it matches the raw AD default of 0', () => {
    // ETP-4671 had deliberately overridden this to "1" (with its own dedicated regression
    // test, since removed). ETP-5062 reverses that: a manually-added shipment/receipt line
    // must always start at 0 — the risk of an accidental full-stock movement outweighs the
    // convenience of a non-zero starting value. See GoodsShipmentLineHandlerTest's
    // testAfterCalloutStripsStockDerivedMovementQuantity for the shipment-side counterpart.
    const movementQuantity = lineField('movementQuantity');
    assert.ok(movementQuantity, 'movementQuantity field must remain present in the contract');
    assert.equal(movementQuantity.defaultValue, '0');
    assert.equal(movementQuantity.derivation.source, '0');
  });

  it('generates movementQuantity with defaultValue: 0 in GoodsReceiptLineForm.jsx', () => {
    const fieldBlock = lineFormSrc.match(/\{ key: 'movementQuantity'[\s\S]*?\}/);
    assert.ok(fieldBlock, 'expected movementQuantity field block in GoodsReceiptLineForm.jsx');
    assert.match(fieldBlock[0], /defaultValue: '0'/);
  });

  it('generates movementQuantity with defaultValue: 0 in the addLineFields entry of GoodsReceiptPage.jsx', () => {
    const addLineBlock = pageSrc.match(/addLineFields:goodsReceiptLine[\s\S]*?@sf-generated-end/);
    assert.ok(addLineBlock, 'expected addLineFields block in GoodsReceiptPage.jsx');
    const fieldBlock = addLineBlock[0].match(/\{ key: 'movementQuantity'[\s\S]*?\}/);
    assert.ok(fieldBlock, 'expected movementQuantity entry in addLineFields');
    assert.match(fieldBlock[0], /defaultValue: 0/);
  });

  it('keeps movementDate defaulting to the current date via @#Date@, not the stale @Today@ token', () => {
    const movementDate = headerField('movementDate');
    assert.ok(movementDate, 'movementDate field must remain present in the contract');
    assert.equal(movementDate.defaultValue, '@#Date@');
    assert.equal(movementDate.derivation.source, '@#Date@');
    assert.notEqual(movementDate.defaultValue, '@Today@');
  });

  it('keeps movementQuantity locked once the receipt is processed or UOM management applies', () => {
    const movementQuantity = lineField('movementQuantity');
    assert.equal(
      movementQuantity.readOnlyLogic.js,
      "record['processed'] === true || record['uomManagement'] === 'Y'",
    );
  });
});
