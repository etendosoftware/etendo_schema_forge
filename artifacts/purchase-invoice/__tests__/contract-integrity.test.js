import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const contract = JSON.parse(
  readFileSync(join(__dirname, '..', 'contract.json'), 'utf8'),
);
const headerFormSrc = readFileSync(
  join(__dirname, '..', 'generated', 'web', 'purchase-invoice', 'HeaderForm.jsx'),
  'utf8',
);

const windowContract = contract.frontendContract.window;
const header = contract.frontendContract.entities.header;

function headerField(name) {
  return header.fields.find((field) => field.name === name);
}

describe('purchase-invoice contract integrity (ETP-3778 SIF regressions)', () => {
  it('keeps POReference relabeled as Document No. in window labelOverrides', () => {
    assert.equal(windowContract.labelOverrides.es_ES.POReference, 'Nº documento');
    assert.equal(windowContract.labelOverrides.en_US.POReference, 'Document No.');
  });

  it('keeps documentNo hidden from the purchase header and grid surfaces', () => {
    const documentNo = headerField('documentNo');
    assert.ok(documentNo, 'documentNo field must remain present in the contract');
    assert.equal(documentNo.form, false);
    assert.equal(documentNo.grid, false);
    assert.match(documentNo.label, /Document No\./);
  });

  it('keeps POReference editable in the contract and positioned as the second principal field', () => {
    const orderReference = headerField('orderReference');
    assert.ok(orderReference, 'orderReference field must remain present in the contract');
    assert.equal(orderReference.column, 'POReference');
    assert.equal(orderReference.visibility, 'editable');
    assert.equal(orderReference.form, true);
    assert.equal(orderReference.seq, 20);
    assert.equal(orderReference.readOnlyLogic, undefined);
  });

  it('keeps the generated HeaderForm order as Business Partner, POReference, Invoice Date', () => {
    const keys = [...headerFormSrc.matchAll(/key: '([^']+)'/g)].map((match) => match[1]);
    assert.deepEqual(keys.slice(0, 3), ['businessPartner', 'orderReference', 'invoiceDate']);
  });

  it('does not generate documentNo as a visible HeaderForm field', () => {
    assert.doesNotMatch(headerFormSrc, /key: 'documentNo'/);
  });

  it('does not generate readOnlyLogic for orderReference in HeaderForm', () => {
    const orderReferenceBlock = headerFormSrc.match(/\{ key: 'orderReference'[\s\S]*?\}/);
    assert.ok(orderReferenceBlock, 'expected orderReference field block in HeaderForm.jsx');
    assert.doesNotMatch(orderReferenceBlock[0], /readOnlyLogic/);
  });

  it('keeps purchase SII and SIF status fields included in the header contract', () => {
    const expectedNames = [
      'aeatsiiClaveTipoFc',
      'aeatsiiDescripcionSii',
      'aeatsiiEjercicio',
      'aeatsiiEstado',
      'aeatsiiFechaRegCont',
      'aeatsiiIsauthorization',
      'aeatsiiIssent',
      'aeatsiiPeriodo',
      'aeatsiiPurDescription',
      'etsgDateOperation',
      'etvfacInvoiceStatus',
      'tbaiIssent',
    ];

    for (const name of expectedNames) {
      const field = headerField(name);
      assert.ok(field, `header contract must include ${name}`);
      assert.notEqual(field.visibility, 'discarded', `${name} must not be discarded`);
      assert.equal(field.form, false, `${name} must stay out of the main header form`);
    }
  });
});
