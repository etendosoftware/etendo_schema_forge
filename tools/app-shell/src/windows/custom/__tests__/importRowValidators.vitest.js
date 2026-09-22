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
    assert.deepEqual(runImportRowValidator('contacts', { name: 'Acme', taxID: 'B12345674' }), []);
    assert.deepEqual(runImportRowValidator('contacts', { name: 'Acme', oBTIKTaxIDKey: '', etgoIsperson: '   ' }), []);
  });

  it('accepts the human words a user actually types, accent- and case-insensitively', () => {
    assert.deepEqual(runImportRowValidator('contacts', { name: 'Acme', oBTIKTaxIDKey: 'NIF', etgoIsperson: 'Empresa' }), []);
    assert.deepEqual(runImportRowValidator('contacts', { oBTIKTaxIDKey: 'cif/nif', etgoIsperson: 'persona fisica', etgoFirstname: 'Ana', etgoLastname: 'Gil' }), []);
  });

  it('accepts the raw AD code, so a CSV exported from Etendo round-trips', () => {
    assert.deepEqual(runImportRowValidator('contacts', { name: 'Acme', oBTIKTaxIDKey: '1', etgoIsperson: 'N' }), []);
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

  it('requires both first name and last name for a person during review', () => {
    const errors = runImportRowValidator('contacts', { etgoIsperson: 'Persona', etgoFirstname: 'Ana' });
    assert.deepEqual(errors.map((e) => e.target), ['etgoLastname']);
    assert.match(errors[0].message, /first name and last name/i);
  });

  it('accepts a company legal name or derives one from both person-name columns', () => {
    assert.deepEqual(runImportRowValidator('contacts', { etgoIsperson: 'Empresa', name: 'ACME SL' }), []);
    assert.deepEqual(runImportRowValidator('contacts', { etgoIsperson: 'Empresa', etgoFirstname: 'Ana', etgoLastname: 'Gil' }), []);
  });

  /**
   * ETP-5350 — the CIF/NIF is checked in the review, not left to the server's 400 at confirm.
   * `taxIdValidation.js` is the browser mirror of `SpanishTaxIdValidator.java` and the Contacts
   * form used it all along; the import simply never called it. Both live failures are pinned
   * here: a wrong check digit, and the 18-character value produced by editing a cell inline.
   */
  it('reports a tax id whose check digit does not match, against its own column', () => {
    const errors = runImportRowValidator('contacts', { taxID: 'B65241890' });
    assert.deepEqual(errors.map((e) => e.target), ['taxID']);
    assert.match(errors[0].message, /check digit/i);
  });

  it('reports a tax id that is not a NIF, CIF or NIE at all', () => {
    const errors = runImportRowValidator('contacts', { taxID: 'B65241890B65241895' });
    assert.deepEqual(errors.map((e) => e.target), ['taxID']);
    assert.match(errors[0].message, /NIF, CIF or NIE/i);
  });

  it('accepts the three valid shapes, and the separators a human types', () => {
    for (const taxID of ['B12345674', '12345678Z', 'X1234567L', ' b12345674 ', 'B-1234567-4']) {
      assert.deepEqual(runImportRowValidator('contacts', { taxID }), [],
        `${taxID} should be accepted`);
    }
  });

  /**
   * The column is `required: true`, which `validateRow` enforces on its own. Reporting the
   * blank here too would put two messages on one cell.
   */
  it('leaves a blank tax id to the required-field check, reporting nothing itself', () => {
    assert.deepEqual(runImportRowValidator('contacts', { taxID: '' }), []);
    assert.deepEqual(runImportRowValidator('contacts', { taxID: '   ' }), []);
    assert.deepEqual(runImportRowValidator('contacts', {}), []);
  });

  it('reports the tax id alongside the coded columns rather than masking them', () => {
    const errors = runImportRowValidator('contacts',
      { taxID: 'nope', oBTIKTaxIDKey: 'xx', etgoIsperson: 'yy' });
    assert.deepEqual(errors.map((e) => e.target), ['taxID', 'oBTIKTaxIDKey', 'etgoIsperson']);
  });

  it('localizes the tax id message through the injected translate', () => {
    const translate = (key) => (key === 'taxIdInvalidCheckDigit'
      ? 'El dígito de control no coincide. Revisa el número.' : key);
    const [error] = runImportRowValidator('contacts', { taxID: 'B65241890' }, { translate });
    assert.equal(error.message, 'El dígito de control no coincide. Revisa el número.');
  });

  it('falls back to English when the dictionary echoes the key back', () => {
    const [error] = runImportRowValidator('contacts', { taxID: 'B65241890' },
      { translate: (key) => key });
    assert.match(error.message, /check digit/i);
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

  /**
   * ETP-5350 — the three costing mistakes `validateRow` structurally cannot see.
   *
   * `isNumeric` already covers "abc" in the cost cell and neither costing column is required,
   * so what is left is a negative cost, an unparseable date, and a date with no cost.
   */
  describe('cost and starting date (ETP-5350)', () => {
    it('accepts a row with neither, with only a cost, or with both', () => {
      assert.deepEqual(runImportRowValidator('product', { searchKey: 'SKU-1', name: 'Widget' }), []);
      assert.deepEqual(runImportRowValidator('product', { cost: '7,40' }), []);
      assert.deepEqual(runImportRowValidator('product', { cost: '7,40', costStartingDate: '01/08/2026' }), []);
      // Zero is a legitimate standard cost, not a missing one.
      assert.deepEqual(runImportRowValidator('product', { cost: '0' }), []);
    });

    it('leaves a non-numeric cost to isNumeric, like the price columns', () => {
      assert.deepEqual(runImportRowValidator('product', { cost: 'abc' }), []);
    });

    it('reports a negative cost against the cost column', () => {
      // ProductCostingHandler refuses it (ERR_costingCostNegative). Caught here, it is a cell
      // the user can fix; left to the handler, it is a 400 after they confirmed.
      const errors = runImportRowValidator('product', { cost: '-5' });
      assert.deepEqual(errors.map((e) => e.target), ['cost']);
    });

    it('reports an impossible date, which nothing generic can reject', () => {
      // `31/02/2026` is not blank, so `required` says nothing about it, and it is not a number,
      // so `isNumeric` says nothing either. Without this it reached the send as a bad payload.
      const errors = runImportRowValidator('product', { cost: '10', costStartingDate: '31/02/2026' });
      assert.deepEqual(errors.map((e) => e.target), ['costStartingDate']);
    });

    it('fails a starting date with no cost instead of silently dropping it', () => {
      // A date alone cannot create an M_Costing row, so `buildCostOperation` returns null and
      // the value vanishes: no error, no warning, product imported, cost nowhere. That is the
      // silent-drop class this codebase has already removed twice (ETP-4997, then the province
      // predicate one level above it).
      const errors = runImportRowValidator('product', { costStartingDate: '01/08/2026' });
      assert.deepEqual(errors.map((e) => e.target), ['cost']);
    });

    it('reports the date problem alone when the date is both invalid and unaccompanied', () => {
      // Two messages on one row for one mistake is noise: fixing the date is the only
      // instruction that makes sense while the date is unreadable.
      const errors = runImportRowValidator('product', { costStartingDate: 'no es fecha' });
      assert.deepEqual(errors.map((e) => e.target), ['costStartingDate']);
    });
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
 * ETP-4954 (product decision) — the third half of the amount rule: EXACTLY ONE SIDE.
 *
 * > A statement line must carry an amount on exactly one side: at least one amount above zero,
 * > no amount below zero, and NEVER both sides filled.
 *
 * The "never both" clause is the one that had no coverage at all: the full suite passed with
 * zero failures when it was added, which means nothing anywhere exercised a both-sides-positive
 * line. Before it, `Salida=100 / Entrada=30` imported and was then displayed as −70,00 € — a
 * movement that appears in no statement, because the read path collapses the pair into
 * `cramount - dramount` — and `Salida=50 / Entrada=50` imported and read back as 0,00 €, which
 * is exactly what the both-zero guard exists to prevent, arriving through another door.
 *
 * It is not an invention either: `ReactivationSupport.applyBankStatementAmounts` already
 * refuses to leave both sides filled, netting them onto one side under "Classic's sign
 * normalization". The import path rejects rather than nets, because an inbound row with both
 * sides filled is bad input the user has to fix, not two records being merged.
 */
describe('bank-statement row validator — exactly one side', () => {
  const targetsOf = (errors) => errors.map((e) => e.target);

  it('rejects both sides filled, flagging BOTH cells — the user has to choose one', () => {
    const errors = runImportRowValidator('bank-statement', { out: '100,00', in: '30,00' });
    assert.deepEqual(targetsOf(errors), ['out', 'in']);
    assert.match(errors[0].message, /not in both/i);
    assert.match(errors[1].message, /not in both/i);
  });

  it('rejects both sides filled whichever side is the larger one', () => {
    const errors = runImportRowValidator('bank-statement', { out: '30,00', in: '100,00' });
    assert.deepEqual(targetsOf(errors), ['out', 'in']);
    assert.match(errors[0].message, /not in both/i);
  });

  /**
   * The case that MOTIVATED the rule. Two equal sides survive every other check — both amounts
   * are above zero and neither is below it — so the line persisted, and the read path then
   * collapsed it to `50 - 50 = 0`: a statement line displaying 0,00 €, the very state the
   * both-zero guard rejects at the front door. Nothing else in this suite reaches it.
   */
  it('rejects two equal sides, which used to persist and then read back as 0,00 €', () => {
    const errors = runImportRowValidator('bank-statement', { out: '50,00', in: '50,00' });
    assert.deepEqual(targetsOf(errors), ['out', 'in']);
    assert.match(errors[0].message, /not in both/i);
  });

  // ── The discriminators ──────────────────────────────────────────────────────
  // Without these, the rule could just as well be "reject any two non-blank amount cells",
  // which would reject the template's own sample row (`150,00` / `0,00`) and every ordinary
  // line a bank exports with an explicit zero on the unused side.

  it('accepts one side filled and the other blank, in both directions', () => {
    assert.deepEqual(runImportRowValidator('bank-statement', { out: '100,00', in: '' }), []);
    assert.deepEqual(runImportRowValidator('bank-statement', { out: '', in: '100,00' }), []);
    assert.deepEqual(runImportRowValidator('bank-statement', { in: '100,00' }), []);
    assert.deepEqual(runImportRowValidator('bank-statement', { out: '100,00' }), []);
  });

  it('accepts one side filled and an EXPLICIT zero on the other — a zero is not an amount', () => {
    assert.deepEqual(runImportRowValidator('bank-statement', { out: '150,00', in: '0' }), []);
    assert.deepEqual(runImportRowValidator('bank-statement', { out: '150,00', in: '0,00' }), []);
    assert.deepEqual(runImportRowValidator('bank-statement', { out: '0', in: '150,00' }), []);
    assert.deepEqual(runImportRowValidator('bank-statement', { out: '0,00', in: '150,00' }), []);
    // `0.00` too: the parser reads a lone separator with two trailing digits as a decimal, so a
    // template filled in by an English-convention spreadsheet must not trip the rule either.
    assert.deepEqual(runImportRowValidator('bank-statement', { out: '150.00', in: '0.00' }), []);
  });

  it('reports one cause, not two: a both-filled row never also says "needs a positive amount"', () => {
    const errors = runImportRowValidator('bank-statement', { out: '100,00', in: '30,00' });
    assert.equal(errors.length, 2, 'exactly one error per flagged cell, and nothing else');
    for (const error of errors) {
      assert.doesNotMatch(error.message, /positive amount/i);
      assert.doesNotMatch(error.message, /negative/i);
    }
  });

  it('lets the negative rule win when both sides are filled and one is negative', () => {
    // One cause, and the actionable one: the sign is what the user has to fix first.
    const errors = runImportRowValidator('bank-statement', { out: '100,00', in: '-30,00' });
    assert.deepEqual(targetsOf(errors), ['in']);
    assert.match(errors[0].message, /negative/i);
  });

  it('localizes the both-amounts message through the injected translate', () => {
    const translate = (key) => (key === 'financeAccountStatementsImportErrorBothAmounts'
      ? 'Una linea lleva importe en Salida o en Entrada, no en ambas.'
      : key);
    const errors = runImportRowValidator(
      'bank-statement', { out: '100,00', in: '30,00' }, { translate },
    );
    assert.deepEqual(errors.map((e) => e.message), [
      'Una linea lleva importe en Salida o en Entrada, no en ambas.',
      'Una linea lleva importe en Salida o en Entrada, no en ambas.',
    ]);
  });

  it('still reports the date error alongside a both-filled row', () => {
    const errors = runImportRowValidator(
      'bank-statement', { date: '31/02/2026', out: '100,00', in: '30,00' },
    );
    assert.deepEqual(targetsOf(errors), ['date', 'out', 'in']);
  });

  it('says nothing extra when a both-filled row also has a non-numeric cell', () => {
    // The generic numeric check owns that cell; the amount rule bails out before it runs.
    assert.deepEqual(runImportRowValidator('bank-statement', { out: 'abc', in: '30,00' }), []);
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
