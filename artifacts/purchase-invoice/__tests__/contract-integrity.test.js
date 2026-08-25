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

  // ETP-4933's regen surfaced a readOnlyLogic on orderReference that did not exist in the
  // previous contract: the AD now locks POReference once the invoice has been submitted to
  // the AEAT SII (`@EM_Aeatsii_Issent@='Y' & @IsSOTrx@='N'`). Confirmed correct with Gremiger
  // (author of the original ETP-3778 guards): this does NOT conflict with ETP-3778
  // (docs/generated-custom-windows/purchase-invoice.md:222, "correct the supplier reference
  // on a completed invoice without reactivating it") — the AD rule says nothing about
  // `processed`/`documentStatus`, so a completed-but-not-yet-declared invoice stays fully
  // editable. Only SII submission locks it. Do NOT "fix" this back to
  // `readOnlyLogic === undefined`, and do NOT let it drift into an unconditional read-only
  // (e.g. by adding a `processed` clause) — either would silently reopen the case ETP-3778
  // fixed, or silently break the new SII-lock requirement.
  it('keeps POReference editable while not yet declared to the SII, locked once aeatsiiIssent is true (ETP-3778 + AD rule confirmed by Gremiger)', () => {
    const orderReference = headerField('orderReference');
    assert.ok(orderReference, 'orderReference field must remain present in the contract');
    assert.equal(orderReference.column, 'POReference');
    assert.equal(orderReference.visibility, 'editable');
    assert.equal(orderReference.form, true);
    assert.equal(orderReference.seq, 20);
    assert.ok(orderReference.readOnlyLogic, 'orderReference must carry the SII-submission readOnlyLogic');
    assert.equal(orderReference.readOnlyLogic.raw, "@EM_Aeatsii_Issent@='Y' & @IsSOTrx@='N'");
    assert.equal(
      orderReference.readOnlyLogic.js,
      "record['aeatsiiIssent'] === true && record['salesTransaction'] !== true",
    );
    // Completion alone (`processed`/`documentStatus`) must NOT appear in the condition —
    // that is precisely the "editable when completed" half of the invariant.
    assert.doesNotMatch(orderReference.readOnlyLogic.js, /processed|documentStatus/);
  });

  it('keeps the generated HeaderForm order as Business Partner, Transaction Document, Document No. first', () => {
    const keys = [...headerFormSrc.matchAll(/key: '([^']+)'/g)].map((match) => match[1]);
    assert.deepEqual(keys.slice(0, 3), ['businessPartner', 'transactionDocument', 'orderReference']);
  });

  it('does not generate documentNo as a visible HeaderForm field', () => {
    assert.doesNotMatch(headerFormSrc, /key: 'documentNo'/);
  });

  // Mirrors the contract assertion above, against the generated HeaderForm.jsx this
  // time: the AD-driven readOnlyLogic must actually reach the generated field block,
  // not just the contract.
  it('generates the SII-submission readOnlyLogic for orderReference in HeaderForm, not a broader one', () => {
    const orderReferenceBlock = headerFormSrc.match(/\{ key: 'orderReference'[\s\S]*?\},/);
    assert.ok(orderReferenceBlock, 'expected orderReference field block in HeaderForm.jsx');
    assert.match(
      orderReferenceBlock[0],
      /readOnlyLogic: \(record\) => record\['aeatsiiIssent'\] === true && record\['salesTransaction'\] !== true/,
    );
    // Completion alone must not lock it — this stays the "editable when completed" half.
    assert.doesNotMatch(orderReferenceBlock[0], /record\['processed'\]|record\['documentStatus'\]/);
  });

  it('keeps purchase SII and SIF status fields included in the header contract', () => {
    // ETP-4783: aeatsiiEjercicio, aeatsiiPeriodo, aeatsiiPurDescription removed (discarded — never had values in GO)
    // ETP-4783: SII fields rendered by SifTab.jsx custom component — must stay out of the generated header form
    const expectedNames = [
      'aeatsiiClaveTipoFc',
      'aeatsiiEstado',
      'aeatsiiIsauthorization',
      'aeatsiiIssent',
      'aeatsiiDescripcionSii',
      'aeatsiiFechaRegCont',
      'aeatsiiErrorRegistral',
      'etsgDateOperation',
      'etvfacInvoiceStatus',
    ];

    for (const name of expectedNames) {
      const field = headerField(name);
      assert.ok(field, `header contract must include ${name}`);
      assert.notEqual(field.visibility, 'discarded', `${name} must not be discarded`);
      assert.equal(field.form, false, `${name} must stay out of the generated header form (rendered by SifTab)`);
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
