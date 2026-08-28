import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { normalizeCodedInput, resolveCodedValue, describeAcceptedValues, resolveCodedCellOrThrow } from '../codedValue.js';

// A miniature stand-in for a real AD reference list, shaped exactly like the tables the
// contacts/product descriptors declare.
const TYPES = {
  I: ['Articulo', 'Item'],
  S: ['Servicio', 'Service'],
};

describe('normalizeCodedInput', () => {
  it('strips accents, case and surrounding/collapsed whitespace', () => {
    assert.equal(normalizeCodedInput('  Artículo  '), 'articulo');
    assert.equal(normalizeCodedInput('PERSONA   FISICA'), 'persona fisica');
    assert.equal(normalizeCodedInput('Compañía'), 'compania');
  });

  it('treats null/undefined as an empty string rather than throwing', () => {
    assert.equal(normalizeCodedInput(null), '');
    assert.equal(normalizeCodedInput(undefined), '');
  });
});

describe('resolveCodedValue', () => {
  it('reports a blank cell distinctly from an invalid one', () => {
    // The whole point of the distinction: blank must fall back to the column default,
    // invalid must fail the row (ETP-4995's P0 was blank being treated as a real value).
    assert.deepEqual(resolveCodedValue('', TYPES), { status: 'blank' });
    assert.deepEqual(resolveCodedValue('   ', TYPES), { status: 'blank' });
    assert.deepEqual(resolveCodedValue(null, TYPES), { status: 'blank' });
    assert.deepEqual(resolveCodedValue('Suscripcion', TYPES), { status: 'invalid' });
  });

  it('matches a synonym regardless of case and accents', () => {
    assert.deepEqual(resolveCodedValue('servicio', TYPES), { status: 'resolved', code: 'S' });
    assert.deepEqual(resolveCodedValue('  ARTÍCULO ', TYPES), { status: 'resolved', code: 'I' });
  });

  it('always accepts the raw code itself, so an Etendo-exported CSV round-trips', () => {
    assert.deepEqual(resolveCodedValue('S', TYPES), { status: 'resolved', code: 'S' });
    assert.deepEqual(resolveCodedValue('s', TYPES), { status: 'resolved', code: 'S' });
  });

  it('accepts numeric-like codes as the numbers a spreadsheet produces', () => {
    // Spreadsheets hand back a number, not a string, for a column of 1..7 codes.
    const taxIdKeys = { 1: ['NIF'], 2: ['NOI'] };
    assert.deepEqual(resolveCodedValue(1, taxIdKeys), { status: 'resolved', code: '1' });
    assert.deepEqual(resolveCodedValue('NIF', taxIdKeys), { status: 'resolved', code: '1' });
  });
});

describe('describeAcceptedValues', () => {
  it('pairs each code with its primary label for the row-level error message', () => {
    assert.equal(describeAcceptedValues(TYPES), 'I (Articulo), S (Servicio)');
  });

  it('falls back to the bare code when a value has no synonyms', () => {
    assert.equal(describeAcceptedValues({ X: [], Y: undefined }), 'X, Y');
  });
});

describe('resolveCodedCellOrThrow', () => {
  const opts = { defaultCode: 'I', fieldLabelKey: 'importFieldProductType', fieldLabelFallback: 'Product Type' };

  it('returns the AD default for a blank cell', () => {
    assert.equal(resolveCodedCellOrThrow('', TYPES, opts), 'I');
  });

  it('returns the resolved code for a recognized value', () => {
    assert.equal(resolveCodedCellOrThrow('Service', TYPES, opts), 'S');
  });

  it('throws an English message naming the accepted values when no translator is given', () => {
    assert.throws(
      () => resolveCodedCellOrThrow('Suscripcion', TYPES, opts),
      /"Suscripcion" is not a valid value for "Product Type"\. Accepted values: I \(Articulo\), S \(Servicio\)\./,
    );
  });

  it('routes both the field label and the message through the translator when present', () => {
    const seen = [];
    const translate = (key, params) => {
      seen.push(key);
      if (key === 'importFieldProductType') return 'Tipo de producto';
      return `Valor "${params.value}" invalido para "${params.field}". Aceptados: ${params.accepted}.`;
    };
    assert.throws(
      () => resolveCodedCellOrThrow('Suscripcion', TYPES, { ...opts, translate }),
      /Valor "Suscripcion" invalido para "Tipo de producto"\./,
    );
    assert.deepEqual(seen, ['importFieldProductType', 'importErrorInvalidCodedValue']);
  });
});
