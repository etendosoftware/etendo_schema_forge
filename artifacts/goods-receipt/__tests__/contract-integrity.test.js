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

describe('goods-receipt contract integrity (ETP-4671 stock defaults)', () => {
  it('overrides movementQuantity.defaultValue to 1 in the contract, not the raw AD default of 0', () => {
    const movementQuantity = lineField('movementQuantity');
    assert.ok(movementQuantity, 'movementQuantity field must remain present in the contract');
    assert.equal(movementQuantity.defaultValue, '1');
    assert.equal(
      movementQuantity.derivation.source,
      '0',
      'the raw AD computed default stays 0 — only defaultValue must reflect the decisions.json override',
    );
  });

  it('generates movementQuantity with defaultValue: 1 in GoodsReceiptLineForm.jsx', () => {
    const fieldBlock = lineFormSrc.match(/\{ key: 'movementQuantity'[\s\S]*?\}/);
    assert.ok(fieldBlock, 'expected movementQuantity field block in GoodsReceiptLineForm.jsx');
    assert.match(fieldBlock[0], /defaultValue: '1'/);
  });

  it('generates movementQuantity with defaultValue: 1 in the addLineFields entry of GoodsReceiptPage.jsx', () => {
    const addLineBlock = pageSrc.match(/addLineFields:goodsReceiptLine[\s\S]*?@sf-generated-end/);
    assert.ok(addLineBlock, 'expected addLineFields block in GoodsReceiptPage.jsx');
    const fieldBlock = addLineBlock[0].match(/\{ key: 'movementQuantity'[\s\S]*?\}/);
    assert.ok(fieldBlock, 'expected movementQuantity entry in addLineFields');
    assert.match(fieldBlock[0], /defaultValue: 1/);
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
