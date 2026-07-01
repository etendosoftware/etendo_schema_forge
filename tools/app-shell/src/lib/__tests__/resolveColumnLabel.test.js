import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveColumnLabel } from '../resolveColumnLabel.js';

const translate = (key) => {
  const dictionary = {
    C_BPartner_ID: 'Tercero',
    DateOrdered: 'Fecha de pedido',
    // AD-dictionary translation for the invoice doc-type column. This is the
    // value that ETP-4303 fix #3 had to outrank — see the regression block below.
    C_DocTypeTarget_ID: 'Documento transacción',
  };
  return dictionary[key] ?? null;
};

describe('resolveColumnLabel', () => {
  it('prefers col.labels for the active locale over everything else', () => {
    const col = {
      key: 'orderDate',
      column: 'DateOrdered',
      label: 'Order Date',
      labels: { es_ES: 'Fecha del pedido', en_US: 'Order Date (contract)' },
    };
    assert.equal(resolveColumnLabel(col, 'es_ES', translate), 'Fecha del pedido');
  });

  it('falls back to col.labels.en_US when the locale override is missing', () => {
    const col = {
      key: 'orderDate',
      column: 'DateOrdered',
      label: 'Order Date',
      labels: { en_US: 'Order Date (contract)' },
    };
    assert.equal(resolveColumnLabel(col, 'es_ES', translate), 'Order Date (contract)');
  });

  // Regression: i18n dictionary must win over the contract-embedded English label.
  // Before the fix, `col.label` was placed BEFORE `translate(col.column)` in the
  // fallback chain, so the English contract label silently overrode the Spanish
  // translation maintained in es_ES.json.
  it('prefers the i18n dictionary over col.label when col.labels is missing', () => {
    const col = {
      key: 'businessPartner',
      column: 'C_BPartner_ID',
      label: 'Business Partner',
    };
    assert.equal(resolveColumnLabel(col, 'es_ES', translate), 'Tercero');
  });

  it('falls back to col.label when the i18n dictionary has no entry', () => {
    const col = {
      key: 'unknown',
      column: 'UnknownColumn',
      label: 'Unknown Label',
    };
    assert.equal(resolveColumnLabel(col, 'es_ES', translate), 'Unknown Label');
  });

  it('falls back to col.key as last resort', () => {
    const col = { key: 'someKey', column: 'UnknownColumn' };
    assert.equal(resolveColumnLabel(col, 'es_ES', translate), 'someKey');
  });

  it('works when translate is not provided', () => {
    const col = { key: 'orderDate', column: 'DateOrdered', label: 'Order Date' };
    assert.equal(resolveColumnLabel(col, 'es_ES'), 'Order Date');
  });

  it('returns undefined for a null column', () => {
    assert.equal(resolveColumnLabel(null, 'es_ES', translate), undefined);
  });

  it('treats an empty translate result as a miss and falls back to col.label', () => {
    const emptyTranslate = () => null;
    const col = { key: 'orderDate', column: 'DateOrdered', label: 'Order Date' };
    assert.equal(resolveColumnLabel(col, 'es_ES', emptyTranslate), 'Order Date');
  });
});

// ── ETP-4303 fix #3: doc-type badge column header ────────────────────────────
// The invoice list doc-type column (key 'transactionDocument', AD column
// 'C_DocTypeTarget_ID') must read "Tipo de documento" / "Document Type", NOT the
// AD-dictionary translation "Documento transacción".
//
// Root cause this locks: a column that sets only `col.label` is shadowed by
// `translate(col.column)` (priority 3 > priority 4 in resolveColumnLabel), so the
// custom header was invisible. The fix sets `col.labels[locale]` (priority 1),
// which wins over the dictionary. These tests encode the documented priority
// order so the team understands WHY `labels` — not `label` — is required here.
describe('resolveColumnLabel — ETP-4303 doc-type column regression', () => {
  it('uses labels[es_ES] over the AD-dictionary translation for C_DocTypeTarget_ID', () => {
    const col = {
      key: 'transactionDocument',
      column: 'C_DocTypeTarget_ID',
      label: 'Tipo de documento',
      labels: { es_ES: 'Tipo de documento' },
    };
    // priority 1 (labels[locale]) beats priority 3 (translate → 'Documento transacción')
    assert.equal(resolveColumnLabel(col, 'es_ES', translate), 'Tipo de documento');
  });

  it('uses labels[en_US] over the AD-dictionary translation for C_DocTypeTarget_ID', () => {
    const col = {
      key: 'transactionDocument',
      column: 'C_DocTypeTarget_ID',
      label: 'Document Type',
      labels: { en_US: 'Document Type' },
    };
    assert.equal(resolveColumnLabel(col, 'en_US', translate), 'Document Type');
  });

  it('DOCUMENTS the bug: a column with ONLY `label` is still shadowed by the AD translation', () => {
    // This is the broken pre-fix shape — `label` is priority 4, below
    // translate() at priority 3 — so the dictionary value wins. This is why the
    // fix had to set `labels`. Locking this prevents anyone from "simplifying"
    // the fix back to a plain `label`.
    const col = {
      key: 'transactionDocument',
      column: 'C_DocTypeTarget_ID',
      label: 'Tipo de documento',
    };
    assert.equal(resolveColumnLabel(col, 'es_ES', translate), 'Documento transacción');
  });
});
