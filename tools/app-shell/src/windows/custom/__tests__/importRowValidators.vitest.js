import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { runImportRowValidator } from '@etendosoftware/app-shell-core/lib/import/rowValidators.js';
import '../contacts/contactsImportDescriptor.js';
import '../product/productImportDescriptor.js';
// Imported for its registration side effect: the module registers `bank-statement` on load,
// the same way the two descriptors above do.
import '../financial-account/bankStatementImportFields.js';

/**
 * ETP-4996 — the AD-coded columns are checked while the user is still REVIEWING the file.
 *
 * Before this, `resolveCodedCellOrThrow` only ran inside `buildOperations`, i.e. at send
 * time: a mistyped "Persona Fisica" showed up in the Correctas tab, and the user found out
 * it was wrong only after confirming the import. These tests pin the review-time half; the
 * send-time half keeps its own coverage in the descriptor tests.
 */
describe('contacts row validator', () => {
  it('accepts a row whose coded cells are blank — blank falls back to the AD default', () => {
    // The ETP-4995 blocker in miniature: an empty cell is "the row says nothing", never
    // an error. If this regresses, the downloaded template stops importing again.
    assert.deepEqual(runImportRowValidator('contacts', { name: 'Acme', taxID: 'B1' }), []);
    assert.deepEqual(runImportRowValidator('contacts', { oBTIKTaxIDKey: '', etgoIsperson: '   ' }), []);
  });

  it('accepts the human words a user actually types, accent- and case-insensitively', () => {
    assert.deepEqual(runImportRowValidator('contacts', { oBTIKTaxIDKey: 'NIF', etgoIsperson: 'Empresa' }), []);
    assert.deepEqual(runImportRowValidator('contacts', { oBTIKTaxIDKey: 'cif/nif', etgoIsperson: 'persona fisica' }), []);
  });

  it('accepts the raw AD code, so a CSV exported from Etendo round-trips', () => {
    assert.deepEqual(runImportRowValidator('contacts', { oBTIKTaxIDKey: '1', etgoIsperson: 'N' }), []);
  });

  it('reports an unrecognized Tax ID Type against its own column', () => {
    const errors = runImportRowValidator('contacts', { oBTIKTaxIDKey: 'Ni idea' });
    assert.deepEqual(errors.map((e) => e.target), ['oBTIKTaxIDKey']);
    // The message must name what the column accepts — otherwise the user only learns
    // that the value was rejected, never which ones would have worked.
    assert.match(errors[0].message, /NIF/);
  });

  it('reports an unrecognized contact type against its own column', () => {
    const errors = runImportRowValidator('contacts', { etgoIsperson: 'Marciano' });
    assert.deepEqual(errors.map((e) => e.target), ['etgoIsperson']);
  });

  it('reports both coded columns at once when both are wrong', () => {
    const errors = runImportRowValidator('contacts', { oBTIKTaxIDKey: 'xx', etgoIsperson: 'yy' });
    assert.deepEqual(errors.map((e) => e.target), ['oBTIKTaxIDKey', 'etgoIsperson']);
  });

  it('localizes the message through the injected translate', () => {
    const translate = (key, params) => (key === 'importErrorInvalidCodedValue'
      ? `"${params.value}" no es válido para "${params.field}".`
      : key);
    const [error] = runImportRowValidator('contacts', { etgoIsperson: 'Marciano' }, { translate });
    assert.match(error.message, /^"Marciano" no es válido para/);
  });
});

describe('product row validator', () => {
  it('accepts a blank or valid product type', () => {
    assert.deepEqual(runImportRowValidator('product', { searchKey: 'SKU-1', name: 'Widget' }), []);
    assert.deepEqual(runImportRowValidator('product', { productType: 'Servicio' }), []);
    assert.deepEqual(runImportRowValidator('product', { productType: 'S' }), []);
  });

  it('reports an unrecognized product type against its own column', () => {
    const errors = runImportRowValidator('product', { productType: 'Cosa rara' });
    assert.deepEqual(errors.map((e) => e.target), ['productType']);
  });

  it('leaves price columns alone — they are covered generically by isNumeric', () => {
    // Prices are declared `isNumeric: true` in decisions.json, so `validateRow` checks
    // them. Duplicating that here would let the two drift apart.
    assert.deepEqual(runImportRowValidator('product', { salesPrice: 'abc' }), []);
  });
});

/**
 * ETP-4954 — the bank-statement amount rule, checked while the user is still REVIEWING.
 *
 * > A line is valid when it carries at least one amount ABOVE zero and NO amount BELOW zero.
 *
 * Rejecting negatives outright is a deliberate divergence from Etendo Classic: money in
 * belongs in Entrada and money out in Salida, and a sign never substitutes for the column.
 * Before this, a row with `Salida=-50 / Entrada=-20` imported silently and was then displayed
 * as a nonsensical `Entrada +30` — the reading path collapses the pair to `cr - dr`. Running
 * here rather than only at send time is what turns those rows into something the user can
 * fix: they land in the Errores tab with the offending cell flagged.
 */
describe('bank-statement row validator', () => {
  const targetsOf = (errors) => errors.map((e) => e.target);

  it('accepts a line carrying one positive amount on either side', () => {
    assert.deepEqual(runImportRowValidator('bank-statement', { out: '', in: '150,00' }), []);
    assert.deepEqual(runImportRowValidator('bank-statement', { out: '3.500,00', in: '' }), []);
  });

  // The QA case.
  it('rejects both amounts negative, flagging each offending cell', () => {
    const errors = runImportRowValidator('bank-statement', { out: '-50', in: '-20' });
    assert.deepEqual(targetsOf(errors), ['out', 'in']);
    assert.match(errors[0].message, /negative/i);
  });

  it('rejects one negative side, flagging only that cell', () => {
    assert.deepEqual(targetsOf(runImportRowValidator('bank-statement', { out: '-50', in: '' })), ['out']);
    assert.deepEqual(targetsOf(runImportRowValidator('bank-statement', { out: '', in: '-20' })), ['in']);
  });

  // The case that was silently NETTED: the row DOES carry a positive amount, so a
  // "needs an amount" check alone waves it through, and the negative side then cancelled
  // part of it on read.
  it('rejects opposite signs (out=50 / in=-20) — the silently-netted case', () => {
    assert.deepEqual(targetsOf(runImportRowValidator('bank-statement', { out: '50', in: '-20' })), ['in']);
  });

  it('rejects a line with no amount at all, blank or zero, with a single error', () => {
    const blank = runImportRowValidator('bank-statement', { out: '', in: '' });
    assert.deepEqual(targetsOf(blank), ['in']);
    assert.match(blank[0].message, /positive amount/i);
    assert.deepEqual(targetsOf(runImportRowValidator('bank-statement', { out: '0', in: '0,00' })), ['in']);
  });

  it('does not stack a "no amount" error on top of the negative ones', () => {
    // A negative pair also has no positive amount; two messages for one cause read as two
    // problems to fix.
    assert.equal(runImportRowValidator('bank-statement', { out: '-50', in: '-20' }).length, 2);
  });

  // The generic `isNumeric` check in `validateRow` owns a non-numeric cell. Flagging it again
  // here would show the same cell twice in the review queue.
  it('leaves a non-numeric amount alone — and then reports nothing else for that row', () => {
    assert.deepEqual(runImportRowValidator('bank-statement', { out: 'abc', in: '-20' }), []);
    assert.deepEqual(runImportRowValidator('bank-statement', { out: 'abc', in: '' }), []);
  });

  it('ignores the non-amount columns entirely', () => {
    assert.deepEqual(runImportRowValidator('bank-statement', { date: '', reference: '', in: '10' }), []);
  });

  it('localizes the message through the injected translate', () => {
    const translate = (key) => (key === 'financeAccountStatementsImportErrorNegativeAmount'
      ? 'Los importes no pueden ser negativos.'
      : key);
    const [error] = runImportRowValidator('bank-statement', { out: '-50' }, { translate });
    assert.equal(error.message, 'Los importes no pueden ser negativos.');
  });

  it('falls back to English when no translator is injected', () => {
    const [error] = runImportRowValidator('bank-statement', { out: '-50' });
    assert.match(error.message, /Salida/);
  });
});

/**
 * ETP-4954 — the date half of the same validator.
 *
 * `validateRow`'s required check only asks whether a cell is BLANK, and `31/02/2026` is not
 * blank: an unparseable date passed every generic check and only failed later inside
 * `toPayloadLine`, where it became the literal string `"nullT00:00:00Z"` in the
 * `?action=create` payload. Catching it here is what puts it in front of the user as a fixable
 * cell instead of a silently corrupt line.
 */
describe('bank-statement row validator — dates', () => {
  const targetsOf = (errors) => errors.map((e) => e.target);
  const row = (over) => ({ date: '01/08/2026', out: '', in: '10', ...over });

  it('accepts every date shape the parser understands', () => {
    for (const date of ['01/08/2026', '01-08-2026', '2026-08-01', '1.8.2026', '01/08/26']) {
      assert.deepEqual(runImportRowValidator('bank-statement', row({ date })), [],
        `${date} must be accepted`);
    }
  });

  it('rejects a well-formed but impossible date, against the date cell', () => {
    const errors = runImportRowValidator('bank-statement', row({ date: '31/02/2026' }));
    assert.deepEqual(targetsOf(errors), ['date']);
    assert.match(errors[0].message, /date/i);
  });

  it('rejects an impossible date in ISO form too', () => {
    assert.deepEqual(targetsOf(runImportRowValidator('bank-statement', row({ date: '2026-02-31' }))), ['date']);
  });

  it('rejects a cell that is not a date at all', () => {
    assert.deepEqual(targetsOf(runImportRowValidator('bank-statement', row({ date: 'basura' }))), ['date']);
  });

  // Blank is the required check's business — `validateRow` owns it. Reporting it here too would
  // flag the same cell twice in the review queue.
  it('says nothing about a blank date', () => {
    assert.deepEqual(runImportRowValidator('bank-statement', row({ date: '' })), []);
    assert.deepEqual(runImportRowValidator('bank-statement', row({ date: '   ' })), []);
  });

  // The non-numeric-amount bail-out must not swallow an error already found.
  it('still reports the date error when an amount is non-numeric', () => {
    assert.deepEqual(
      targetsOf(runImportRowValidator('bank-statement', row({ date: '31/02/2026', in: 'abc' }))),
      ['date'],
    );
  });

  // The "needs a positive amount" check keys off whether an AMOUNT error was found, not off
  // whether the error list happens to be empty.
  it('reports both the date error and the missing-amount error', () => {
    assert.deepEqual(
      targetsOf(runImportRowValidator('bank-statement', row({ date: '31/02/2026', out: '', in: '' }))).sort(),
      ['date', 'in'],
    );
  });

  it('reports both the date error and a negative-amount error', () => {
    assert.deepEqual(
      targetsOf(runImportRowValidator('bank-statement', row({ date: 'basura', in: '-20' }))).sort(),
      ['date', 'in'],
    );
  });

  it('localizes the invalid-date message through the injected translate', () => {
    const translate = (key) => (key === 'financeAccountStatementsImportErrorInvalidDate'
      ? 'La fecha no es válida.'
      : key);
    const [error] = runImportRowValidator('bank-statement', row({ date: '31/02/2026' }), { translate });
    assert.equal(error.message, 'La fecha no es válida.');
  });
});
