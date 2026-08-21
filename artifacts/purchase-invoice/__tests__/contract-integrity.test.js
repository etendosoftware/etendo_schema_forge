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
  });

  // ETP-4918: this assertion used to be `readOnlyLogic === undefined`, which held only while
  // the extraction ran against an instance where C_Invoice.POReference carried no readOnlyLogic.
  // The SII module patches that Core column with "@EM_Aeatsii_Issent@='Y' & @IsSOTrx@='N'"
  // (lock the supplier reference once the invoice has been declared to the tax authority), so on
  // any SII-enabled instance the contract now carries it — and dropping it would be the bug, not
  // keeping it. What ETP-3778 actually needed to guarantee is narrower and still holds: no
  // client-side lock is compiled for this field. @IsSOTrx@ is a session variable, so the
  // expression is classified non-evaluable, js stays null, and enforcement is left to the server.
  it('delegates the POReference readOnly rule to the server instead of compiling a client lock', () => {
    const orderReference = headerField('orderReference');
    const readOnlyLogic = orderReference.readOnlyLogic;
    assert.ok(readOnlyLogic, 'the AD readOnlyLogic must reach the contract, not be silenced');
    assert.equal(readOnlyLogic.evaluable, false);
    assert.equal(readOnlyLogic.reason, 'session-variable');
    assert.equal(readOnlyLogic.js, null, 'a session variable must never be compiled to client JS');
  });

  it('keeps the generated HeaderForm order as Business Partner, Transaction Document, Document No. first', () => {
    const keys = [...headerFormSrc.matchAll(/key: '([^']+)'/g)].map((match) => match[1]);
    assert.deepEqual(keys.slice(0, 3), ['businessPartner', 'transactionDocument', 'orderReference']);
  });

  it('does not generate documentNo as a visible HeaderForm field', () => {
    assert.doesNotMatch(headerFormSrc, /key: 'documentNo'/);
  });

  // ETP-4918: same rewrite as above. The old assertion banned the substring "readOnlyLogic",
  // which the server-delegation marker `readOnlyLogicReason` now trips on. The behaviour worth
  // pinning is that no evaluated lock is emitted — i.e. no `readOnlyLogic: (record) => ...`
  // closure — and that the field is instead marked as server-governed.
  it('emits no compiled readOnlyLogic closure for orderReference in HeaderForm', () => {
    const orderReferenceBlock = headerFormSrc.match(/\{ key: 'orderReference'[\s\S]*?\}/);
    assert.ok(orderReferenceBlock, 'expected orderReference field block in HeaderForm.jsx');
    assert.doesNotMatch(orderReferenceBlock[0], /readOnlyLogic:/);
    assert.match(orderReferenceBlock[0], /readOnlySource: 'server'/);
    assert.match(orderReferenceBlock[0], /readOnlyLogicReason: 'session-variable'/);
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
    ];

    for (const name of expectedNames) {
      const field = headerField(name);
      assert.ok(field, `header contract must include ${name}`);
      assert.notEqual(field.visibility, 'discarded', `${name} must not be discarded`);
      assert.equal(field.form, false, `${name} must stay out of the main header form`);
    }
  });

  it('discards tbaiIssent from the frontend contract now that TbaiConfigSequenceHandler chains TBAI sequencing on the backend (ETP-4401)', () => {
    assert.equal(
      headerField('tbaiIssent'),
      undefined,
      'tbaiIssent must be absent from frontendContract.entities.header (discarded fields are excluded from the frontend contract)',
    );

    const backendHeader = contract.backendContract.entities.header;
    const backendTbaiIssent = backendHeader.fields.find((field) => field.name === 'tbaiIssent');
    assert.ok(
      backendTbaiIssent,
      'tbaiIssent must still be present in backendContract.entities.header (discarded fields remain in the backend contract)',
    );
    assert.equal(
      backendTbaiIssent.visibility,
      'discarded',
      'tbaiIssent must be tagged visibility: "discarded" in the backend contract',
    );
  });
});
