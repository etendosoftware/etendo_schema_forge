// @covers tools/app-shell/src/windows/custom/shared/sifRequiredFields.js
//
// The one rule that says which SIF fields are mandatory, shared by the "Datos fiscales" step and
// the invoices' SIF tab. The matrix below is the contract: a field moves in or out of it only when
// a fiscal system starts or stops refusing the invoice for it.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isRectificationCodeField,
  isSifFieldRequired,
  missingRequiredSifFields,
} from '../sifRequiredFields.js';

const CONTEXTS = {
  none: {},
  rectificative: { rectificative: true },
  verifactu: { verifactu: true },
  both: { rectificative: true, verifactu: true },
};

// [field, none, rectificative, verifactu, both]
const MATRIX = [
  ['aeatsiiClaveTipo', true, true, true, true],
  ['aeatsiiClaveTipoFc', true, true, true, true],
  ['aeatsiiDescripcionSii', true, true, true, true],
  ['etvfacInvType', true, true, true, true],
  ['etvfacVerifacDesc', true, true, true, true],
  ['aeatsiiMotivoRectif', false, true, false, true],
  ['tbaiReverseinvoicecode', false, true, false, true],
  ['etsgDateOperation', false, false, true, true],
  // Deliberately NOT mandatory: only a non-blocking warning toast asks for it.
  ['aeatsiiCauseExemption', false, false, false, false],
  ['aeatsiiIsauthorization', false, false, false, false],
  ['etvfacSimpinvart7273', false, false, false, false],
  ['unknownField', false, false, false, false],
];

describe('isSifFieldRequired', () => {
  for (const [name, ...expected] of MATRIX) {
    Object.keys(CONTEXTS).forEach((ctx, i) => {
      it(`${name} is ${expected[i] ? '' : 'not '}required with context "${ctx}"`, () => {
        assert.equal(isSifFieldRequired(name, CONTEXTS[ctx]), expected[i]);
      });
    });
  }

  it('defaults to a non-rectificative invoice without VERI*FACTU when no context is given', () => {
    assert.equal(isSifFieldRequired('aeatsiiMotivoRectif'), false);
    assert.equal(isSifFieldRequired('etsgDateOperation'), false);
    assert.equal(isSifFieldRequired('aeatsiiClaveTipo'), true);
  });

  it('treats a non-true flag as off', () => {
    assert.equal(isSifFieldRequired('aeatsiiMotivoRectif', { rectificative: false }), false);
    assert.equal(isSifFieldRequired('etsgDateOperation', { verifactu: false }), false);
  });
});

describe('isRectificationCodeField', () => {
  it('flags the SII motive, the TicketBAI code and the VERI*FACTU type on a rectificative', () => {
    for (const name of ['aeatsiiMotivoRectif', 'tbaiReverseinvoicecode', 'etvfacInvType']) {
      assert.equal(isRectificationCodeField(name, { rectificative: true }), true, name);
    }
  });

  it('flags nothing on an ordinary invoice', () => {
    for (const name of ['aeatsiiMotivoRectif', 'tbaiReverseinvoicecode', 'etvfacInvType']) {
      assert.equal(isRectificationCodeField(name, { rectificative: false }), false, name);
      assert.equal(isRectificationCodeField(name), false, name);
    }
  });

  it('does not flag other mandatory fields even on a rectificative', () => {
    for (const name of ['aeatsiiClaveTipo', 'aeatsiiDescripcionSii', 'etvfacVerifacDesc', 'etsgDateOperation']) {
      assert.equal(isRectificationCodeField(name, { rectificative: true }), false, name);
    }
  });
});

describe('missingRequiredSifFields', () => {
  it('lists the mandatory fields left blank: null, undefined, empty and whitespace-only strings', () => {
    const names = ['aeatsiiClaveTipo', 'aeatsiiDescripcionSii', 'etvfacInvType', 'etvfacVerifacDesc'];
    const values = { aeatsiiClaveTipo: null, aeatsiiDescripcionSii: '   ', etvfacVerifacDesc: '' };
    assert.deepEqual(
      missingRequiredSifFields(names, values),
      ['aeatsiiClaveTipo', 'aeatsiiDescripcionSii', 'etvfacInvType', 'etvfacVerifacDesc'],
    );
  });

  it('keeps the order of the names given', () => {
    assert.deepEqual(
      missingRequiredSifFields(['etvfacInvType', 'aeatsiiClaveTipo'], {}),
      ['etvfacInvType', 'aeatsiiClaveTipo'],
    );
  });

  it('accepts any non-blank value, including false and 0', () => {
    const names = ['aeatsiiClaveTipo', 'aeatsiiDescripcionSii', 'etvfacInvType'];
    const values = { aeatsiiClaveTipo: 'F1', aeatsiiDescripcionSii: false, etvfacInvType: 0 };
    assert.deepEqual(missingRequiredSifFields(names, values), []);
  });

  it('only looks at the names shown: an empty mandatory field not listed is not missing', () => {
    assert.deepEqual(missingRequiredSifFields(['aeatsiiClaveTipo'], { aeatsiiClaveTipo: 'F1' }), []);
  });

  it('ignores blank fields that are not mandatory', () => {
    assert.deepEqual(
      missingRequiredSifFields(['aeatsiiCauseExemption', 'aeatsiiMotivoRectif', 'etsgDateOperation'], {}),
      [],
    );
  });

  it('applies the context: rectification codes on a rectificative, the date with VERI*FACTU', () => {
    const names = ['aeatsiiMotivoRectif', 'tbaiReverseinvoicecode', 'etsgDateOperation'];
    assert.deepEqual(
      missingRequiredSifFields(names, {}, { rectificative: true }),
      ['aeatsiiMotivoRectif', 'tbaiReverseinvoicecode'],
    );
    assert.deepEqual(missingRequiredSifFields(names, {}, { verifactu: true }), ['etsgDateOperation']);
  });

  it('tolerates null names and null values', () => {
    assert.deepEqual(missingRequiredSifFields(null, {}), []);
    assert.deepEqual(missingRequiredSifFields(undefined, undefined), []);
    assert.deepEqual(missingRequiredSifFields(['aeatsiiClaveTipo'], null), ['aeatsiiClaveTipo']);
  });
});
