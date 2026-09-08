import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import {
  applyStatementMapping,
  buildStatementCreatePayload,
  buildStatementEntries,
  buildStatementMapping,
  buildStatementPreview,
  localizeFields,
  normalizeStatementDate,
  sendableEntries,
  toPayloadLine,
  validateStatementRow,
} from '../bankStatementImportPipeline.js';
import { parseDelimited } from '@etendosoftware/app-shell-core/lib/import/parseDelimited.js';
import { BANK_STATEMENT_IMPORT_FIELDS } from '../bankStatementImportFields.js';
import { normalizeStatementDate as canonicalNormalizeStatementDate } from '../statementDate.js';

/**
 * ETP-4954 — the browser-side half of the bank-statement import.
 *
 * The file used to be shipped to `?action=preview` as base64 and parsed in Java; it is now
 * parsed, mapped and validated here so its rows can be reviewed before anything is sent.
 * These tests pin the pure transformations that make up that chain. The mapping/review React
 * state lives in `useStatementImportReview.js` and the wizard in `ImportStatementModal.jsx`,
 * both covered from `ImportStatementModal.vitest.jsx`.
 *
 * `ui` is the session translator; a key-returning stub keeps every assertion locale-free.
 */
const ui = (key) => key;

/**
 * `normalizeStatementDate` now lives in `statementDate.js` (so the row validator can use it
 * without an import cycle) and is re-exported here because it is part of this module's public
 * surface. Its own behaviour is covered in `statementDate.vitest.js`; this only pins the
 * re-export, so a caller importing it from the pipeline keeps working.
 */
describe('normalizeStatementDate re-export', () => {
  it('is re-exported from the pipeline and is the same function statementDate.js exports', () => {
    assert.equal(typeof normalizeStatementDate, 'function');
    assert.equal(normalizeStatementDate, canonicalNormalizeStatementDate);
    assert.equal(normalizeStatementDate('01/08/2026'), '2026-08-01');
  });
});

describe('validateStatementRow — the amount rule', () => {
  const row = (over) => ({ date: '01/08/2026', reference: 'R1', description: 'D', bpartnerName: '', out: '', in: '', ...over });
  const targetsOf = (result) => result.errors.map((e) => e.target);

  it('accepts a line carrying one positive amount', () => {
    assert.deepEqual(validateStatementRow(row({ in: '150,00' }), ui).errors, []);
    assert.equal(validateStatementRow(row({ in: '150,00' }), ui).valid, true);
    assert.deepEqual(validateStatementRow(row({ out: '3.500,00' }), ui).errors, []);
  });

  // The QA case: `Salida=-50 / Entrada=-20` used to import silently and was then displayed
  // as a nonsensical `Entrada +30`, because the reading path collapses the pair to `cr - dr`.
  it('rejects a line with BOTH amounts negative, flagging each offending cell', () => {
    const result = validateStatementRow(row({ out: '-50', in: '-20' }), ui);
    assert.equal(result.valid, false);
    assert.deepEqual(targetsOf(result), ['out', 'in']);
  });

  it('rejects a line with one negative side, flagging only that cell', () => {
    assert.deepEqual(targetsOf(validateStatementRow(row({ out: '-50' }), ui)), ['out']);
    assert.deepEqual(targetsOf(validateStatementRow(row({ in: '-20' }), ui)), ['in']);
  });

  // The case that was silently NETTED before ETP-4954: one side positive, the other
  // negative. The row has a positive amount, so a "needs an amount" check alone would pass
  // it; the negative side then cancelled part of it on read.
  it('rejects opposite signs (out=50 / in=-20) — the silently-netted case', () => {
    const result = validateStatementRow(row({ out: '50', in: '-20' }), ui);
    assert.equal(result.valid, false);
    assert.deepEqual(targetsOf(result), ['in']);
  });

  it('rejects a line with no amount at all, and does not double-report it', () => {
    // Only ONE error: two messages for one cause read as two problems to fix.
    assert.deepEqual(targetsOf(validateStatementRow(row(), ui)), ['in']);
    assert.deepEqual(targetsOf(validateStatementRow(row({ out: '0', in: '0,00' }), ui)), ['in']);
  });

  it('does not add a "no amount" error on top of a negative one', () => {
    // A negative pair also has no positive amount; the negative message is the actionable one.
    const result = validateStatementRow(row({ out: '-50', in: '-20' }), ui);
    assert.equal(result.errors.length, 2, 'exactly one error per negative cell, and nothing else');
  });

  // The generic numeric check owns a non-numeric cell. Flagging it again from the amount rule
  // would show the same cell twice in the review queue.
  it('reports a non-numeric amount once, from the numeric check only', () => {
    const result = validateStatementRow(row({ out: 'abc', in: '-20' }), ui);
    assert.equal(result.valid, false);
    assert.deepEqual(targetsOf(result), ['out']);
    // Specifically NOT the negative-amount message, even though `in` is negative.
    assert.equal(result.errors.length, 1);
  });

  it('requires the date, which is the one required field', () => {
    assert.deepEqual(targetsOf(validateStatementRow(row({ date: '', in: '10' }), ui)), ['date']);
    // A blank reference / description / partner name is legitimate.
    assert.deepEqual(
      validateStatementRow({ date: '01/08/2026', in: '10' }, ui).errors,
      [],
    );
  });

  it('localizes its messages through the injected translator', () => {
    const translate = (key) => (key === 'financeAccountStatementsImportErrorNegativeAmount'
      ? 'Los importes no pueden ser negativos.'
      : key);
    const [error] = validateStatementRow(row({ out: '-50' }), translate).errors;
    assert.equal(error.message, 'Los importes no pueden ser negativos.');
  });
});

/**
 * ETP-4954 (product decision) — the third clause of the amount rule: EXACTLY ONE SIDE.
 *
 * > A statement line must carry an amount on exactly one side: at least one amount above zero,
 * > no amount below zero, and NEVER both sides filled.
 *
 * "Never both" is the clause that arrived with no coverage whatsoever — the whole suite stayed
 * green when it was added, which means no existing case ever fed the validator a
 * both-sides-positive line. Two concrete regressions live behind it, and both were reachable
 * from a perfectly ordinary CSV where a bank exported the Salida and the Entrada columns
 * independently:
 *
 *  - `Salida=100 / Entrada=30` imported and then DISPLAYED as −70,00 €, because the read path
 *    collapses the pair into `cramount - dramount`. A movement in no statement.
 *  - `Salida=50 / Entrada=50` imported and then read back as 0,00 € — precisely the state the
 *    both-zero guard exists to reject, arriving through another door.
 *
 * Rejecting rather than netting is what separates this from `ReactivationSupport`
 * (`applyBankStatementAmounts`), which already refuses to leave both sides filled but nets them
 * onto one side and calls it "Classic's sign normalization": reactivation merges two records
 * that were one movement to begin with, whereas an imported row with both sides filled is a
 * file the user has to fix.
 */
describe('validateStatementRow — exactly one side', () => {
  const row = (over) => ({ date: '01/08/2026', reference: 'R1', description: 'D', bpartnerName: '', out: '', in: '', ...over });
  const targetsOf = (result) => result.errors.map((e) => e.target);

  it('rejects both sides filled, flagging BOTH cells', () => {
    const result = validateStatementRow(row({ out: '100,00', in: '30,00' }), ui);
    assert.equal(result.valid, false);
    assert.deepEqual(targetsOf(result), ['out', 'in']);
  });

  it('rejects both sides filled whichever side is the larger one', () => {
    const result = validateStatementRow(row({ out: '30,00', in: '100,00' }), ui);
    assert.equal(result.valid, false);
    assert.deepEqual(targetsOf(result), ['out', 'in']);
  });

  // The case that MOTIVATED the rule: two equal sides clear every other check (both above
  // zero, neither below it), so the line persisted — and then read back as 0,00 €.
  it('rejects two equal sides, which used to persist and then read back as 0,00 €', () => {
    const result = validateStatementRow(row({ out: '50,00', in: '50,00' }), ui);
    assert.equal(result.valid, false);
    assert.deepEqual(targetsOf(result), ['out', 'in']);
  });

  // ── The discriminators ──────────────────────────────────────────────────────
  // Without these the rule could just as well read "reject any two non-blank amount cells",
  // which would reject the template's own sample row (`150,00` out / `0,00` in) and every
  // ordinary line a bank exports with an explicit zero on the unused side.

  it('accepts one side filled and the other blank, in both directions', () => {
    assert.equal(validateStatementRow(row({ out: '100,00' }), ui).valid, true);
    assert.equal(validateStatementRow(row({ in: '100,00' }), ui).valid, true);
  });

  it('accepts one side filled and an EXPLICIT zero on the other — a zero is not an amount', () => {
    for (const zero of ['0', '0,00', '0.00']) {
      assert.deepEqual(validateStatementRow(row({ out: '150,00', in: zero }), ui).errors, [],
        `out=150,00 / in=${zero} must be accepted`);
      assert.deepEqual(validateStatementRow(row({ out: zero, in: '150,00' }), ui).errors, [],
        `out=${zero} / in=150,00 must be accepted`);
    }
  });

  it('reports one cause, not two — no "needs a positive amount" on top', () => {
    const result = validateStatementRow(row({ out: '100,00', in: '30,00' }), ui);
    assert.equal(result.errors.length, 2, 'exactly one error per flagged cell, and nothing else');
    for (const error of result.errors) {
      // `ui` echoes the key, so `t` falls back to the English default — which is what makes
      // the three messages distinguishable here. "needs a positive amount" must not appear.
      assert.match(error.message, /not in both/i);
      assert.doesNotMatch(error.message, /positive amount/i);
      assert.doesNotMatch(error.message, /negative/i);
    }
  });

  it('lets the negative rule win when both sides are filled and one is negative', () => {
    const result = validateStatementRow(row({ out: '100,00', in: '-30,00' }), ui);
    assert.deepEqual(targetsOf(result), ['in']);
    assert.match(result.errors[0].message, /negative/i);
    assert.doesNotMatch(result.errors[0].message, /not in both/i);
  });

  it('keeps a both-filled row out of what gets sent, and counts it as discarded', () => {
    const entries = buildStatementEntries([
      row({ description: 'INGRESO', in: '100' }),
      row({ description: 'AMBAS', out: '100', in: '30' }),
    ], ui);
    assert.deepEqual(sendableEntries(entries).map((e) => e.row.description), ['INGRESO']);
    const preview = buildStatementPreview(entries);
    assert.equal(preview.lineCount, 1);
    assert.equal(preview.discardedLines, 1);
    const payload = buildStatementCreatePayload({
      accountId: 'acc-1', file: { name: 'extracto.csv' }, entries, name: 'extracto',
    });
    assert.equal(payload.lines.length, 1);
    // Specifically: no line carrying BOTH amounts ever reaches `?action=create`, which is the
    // shape `BankStatementsHandler.createLines` now answers 400 to.
    assert.deepEqual(payload.lines.filter((l) => l.in > 0 && l.out > 0), []);
  });

  // The whole file being both-filled is the one where the wizard must not offer a send at all:
  // every row is invalid, so there is nothing to preview.
  it('leaves nothing sendable when every row is filled on both sides', () => {
    const entries = buildStatementEntries([
      row({ out: '100', in: '30' }),
      row({ out: '50', in: '50' }),
    ], ui);
    assert.deepEqual(sendableEntries(entries), []);
    assert.equal(buildStatementPreview(entries).discardedLines, 2);
  });

  it('documents what a both-filled line would have become in the payload', () => {
    // `toPayloadLine` is unconditional by design — it is only ever reached through
    // `sendableEntries`. This pins WHAT the validator is protecting: an `in`/`out` pair the
    // read path collapses to 30 − 100 = −70, a movement that appears in no statement.
    const line = toPayloadLine(row({ out: '100', in: '30' }));
    assert.equal(line.in - line.out, -70);
  });

  it('localizes the both-amounts message through the injected translator', () => {
    const translate = (key) => (key === 'financeAccountStatementsImportErrorBothAmounts'
      ? 'Una linea lleva importe en Salida o en Entrada, no en ambas.'
      : key);
    const result = validateStatementRow(row({ out: '100', in: '30' }), translate);
    assert.deepEqual(result.errors.map((e) => e.message), [
      'Una linea lleva importe en Salida o en Entrada, no en ambas.',
      'Una linea lleva importe en Salida o en Entrada, no en ambas.',
    ]);
  });
});

/**
 * The date rule.
 *
 * The generic `validateRow` can only ask whether a required cell is BLANK, and `31/02/2026` is
 * not blank — so an unparseable date used to pass every check and only fail later, inside
 * `toPayloadLine`, where it turned into the literal string `"nullT00:00:00Z"` in the
 * `?action=create` payload. A silently corrupt line, invisible to the user, in the one field
 * the whole statement is ordered by.
 */
describe('validateStatementRow — the date rule', () => {
  const row = (over) => ({ date: '01/08/2026', reference: 'R1', description: 'D', bpartnerName: '', out: '', in: '10', ...over });
  const targetsOf = (result) => result.errors.map((e) => e.target);

  it('accepts every date shape the parser understands', () => {
    for (const date of ['01/08/2026', '01-08-2026', '2026-08-01', '1.8.2026', '01/08/26']) {
      assert.deepEqual(validateStatementRow(row({ date }), ui).errors, [], `${date} must be accepted`);
    }
  });

  // The row that was previously reported as Correcta and then imported corrupt.
  it('rejects a well-formed but impossible date, against the date cell', () => {
    const result = validateStatementRow(row({ date: '31/02/2026' }), ui);
    assert.equal(result.valid, false);
    assert.deepEqual(targetsOf(result), ['date']);
  });

  it('rejects an impossible date in ISO form too', () => {
    assert.deepEqual(targetsOf(validateStatementRow(row({ date: '2026-02-31' }), ui)), ['date']);
  });

  it('rejects a cell that is not a date at all', () => {
    assert.deepEqual(targetsOf(validateStatementRow(row({ date: 'basura' }), ui)), ['date']);
  });

  // A blank date is the REQUIRED error, not the invalid-date one. Two messages on one cell for
  // one cause read as two problems to fix.
  it('reports a blank date once, as the required error only', () => {
    // Distinct sentinels per key, because both messages land on the same cell — with a
    // key-echoing translator both fall back to their own English default and a test could not
    // tell them apart.
    const translate = (key) => ({
      importErrorRequiredGeneric: '[required]',
      financeAccountStatementsImportErrorInvalidDate: '[invalid-date]',
    })[key] ?? key;
    const result = validateStatementRow(row({ date: '' }), translate);
    assert.deepEqual(targetsOf(result), ['date']);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].message, '[required]');
  });

  // The non-numeric-amount bail-out must not swallow an error already found: a row with both
  // problems has to show both, or fixing the amount silently reveals a second failure.
  it('reports the date error alongside a non-numeric amount', () => {
    const result = validateStatementRow(row({ date: '31/02/2026', in: 'abc' }), ui);
    assert.equal(result.valid, false);
    assert.deepEqual(targetsOf(result).sort(), ['date', 'in']);
  });

  // The "needs a positive amount" check keys off whether an AMOUNT error was found, not off
  // whether the error list happens to be empty — otherwise a bad date silently suppressed it.
  it('reports the date error alongside a missing amount', () => {
    const result = validateStatementRow(row({ date: '31/02/2026', out: '', in: '' }), ui);
    assert.deepEqual(targetsOf(result).sort(), ['date', 'in']);
  });

  it('reports the date error alongside a negative amount', () => {
    const result = validateStatementRow(row({ date: 'basura', in: '-20' }), ui);
    assert.deepEqual(targetsOf(result).sort(), ['date', 'in']);
  });

  it('localizes the invalid-date message through the injected translator', () => {
    const translate = (key) => (key === 'financeAccountStatementsImportErrorInvalidDate'
      ? 'La fecha no es válida.'
      : key);
    const [error] = validateStatementRow(row({ date: '31/02/2026' }), translate).errors;
    assert.equal(error.message, 'La fecha no es válida.');
  });

  // The payload builder is the place the old bug actually surfaced; an invalid date must never
  // reach it, but pinning what it produces documents WHY the check above has to exist.
  it('documents what an unvalidated bad date would have written into the payload', () => {
    assert.equal(toPayloadLine({ date: '31/02/2026', in: '10' }).date, 'nullT00:00:00Z');
  });
});

describe('applyStatementMapping', () => {
  it('re-keys each row from file header to import target', () => {
    const mapped = applyStatementMapping(
      [{ Fecha: '01/08/2026', Entrada: '10' }],
      { Fecha: 'date', Entrada: 'in' },
    );
    assert.deepEqual(mapped, [{ date: '01/08/2026', in: '10' }]);
  });

  // An unmapped column is data the user chose not to import; carrying it through would put
  // it in front of `validateRow`, which knows nothing about it.
  it('drops a column the user left unmapped', () => {
    const mapped = applyStatementMapping(
      [{ A: '1', B: '2', C: '3' }],
      { A: 'date', B: null, C: 'in' },
    );
    assert.deepEqual(mapped, [{ date: '1', in: '3' }]);
  });

  it('fills a mapped target whose cell is missing from the row with an empty string', () => {
    assert.deepEqual(
      applyStatementMapping([{ A: '1' }], { A: 'date', B: 'in' }),
      [{ date: '1', in: '' }],
    );
  });

  it('returns one mapped row per source row, in order', () => {
    const mapped = applyStatementMapping(
      [{ A: '1' }, { A: '2' }, { A: '3' }],
      { A: 'reference' },
    );
    assert.deepEqual(mapped, [{ reference: '1' }, { reference: '2' }, { reference: '3' }]);
  });
});

/**
 * A structurally-blank row is SKIPPED, not reported.
 *
 * `parseDelimited` already drops a genuinely empty LINE, but a row of empty cells (`,,,,,`, or a
 * spreadsheet row the user cleared while Excel kept it in the sheet's used range) survives
 * parsing. Reported as an error it put "missing date" and "no amount" in the review queue for a
 * row that is not there — noise the user cannot act on, on a file they will swear is clean. Both
 * flows this replaces skip it: `GenericCsvBankStatementImporter.isBlankRow` skipped it on import
 * and `BankStatementsHandler.isBlankLine` still skips it on write.
 */
describe('applyStatementMapping — structurally-blank rows', () => {
  const HEADERS = ['Fecha', 'Nº de referencia', 'Descripción', 'Nombre del contacto', 'Salida', 'Entrada'];

  /** The real path a CSV upload takes: parse → auto-map → re-key. */
  function importCsv(csv) {
    const { headers, rows } = parseDelimited(csv);
    const { mapping } = buildStatementMapping(headers, ui);
    return { mapping, mapped: applyStatementMapping(rows, mapping) };
  }

  it('drops rows of empty cells, interleaved and trailing, keeping only the real ones', () => {
    const csv = [
      HEADERS.join(','),
      ',,,,,',
      '01/08/2026,R1,D1,BP1,,100',
      ',,,,,',
      '02/08/2026,R2,D2,BP2,50,',
      ',,,,,',
      ',,,,,',
    ].join('\n');

    const { mapped } = importCsv(csv);
    assert.equal(mapped.length, 2, 'only the two real rows may survive');
    assert.deepEqual(mapped.map((r) => r.reference), ['R1', 'R2']);
  });

  // The point of the skip: a blank row must never reach the review queue as a problem to fix.
  it('leaves the review queue with zero errors for a file padded with blank rows', () => {
    const csv = [HEADERS.join(','), ',,,,,', '01/08/2026,R1,D1,BP1,,100', ',,,,,'].join('\n');
    const { mapped } = importCsv(csv);
    const entries = buildStatementEntries(mapped, ui);
    assert.equal(entries.length, 1);
    assert.deepEqual(entries.flatMap((e) => e.errors), [], 'a blank row is not an error');
    assert.deepEqual(entries.map((e) => e.valid), [true]);
  });

  // A row of cells that are merely WHITESPACE is the same thing to the user — and to
  // `isBlankLine` on the backend.
  it('treats whitespace-only cells as blank', () => {
    assert.deepEqual(
      applyStatementMapping(
        [{ A: '  ', B: '\t' }, { A: '01/08/2026', B: '10' }],
        { A: 'date', B: 'in' },
      ),
      [{ date: '01/08/2026', in: '10' }],
    );
  });

  // Blankness is judged AFTER mapping, on purpose: a column the user chose to ignore must not
  // keep an otherwise-empty row alive. Measured: 2 rows in, 1 out.
  it('judges blankness after mapping, so an unmapped column cannot keep a row alive', () => {
    const rows = [
      { Fecha: '', Entrada: '', Notas: 'una nota que no se importa' },
      { Fecha: '01/08/2026', Entrada: '10', Notas: '' },
    ];
    const mapped = applyStatementMapping(rows, { Fecha: 'date', Entrada: 'in', Notas: null });
    assert.equal(mapped.length, 1, 'the row whose only content sits in an unmapped column is dropped');
    assert.deepEqual(mapped, [{ date: '01/08/2026', in: '10' }]);
  });

  // The discriminator that stops the filter from being too aggressive: ANY mapped cell with a
  // value keeps the row, so it still gets validated instead of silently vanishing. A row with a
  // date and no amount, or an amount and no date, is a row the user has to be shown.
  it('keeps a row with a value in any single mapped cell, and still validates it', () => {
    const dateOnly = applyStatementMapping(
      [{ Fecha: '01/08/2026', Salida: '', Entrada: '' }],
      { Fecha: 'date', Salida: 'out', Entrada: 'in' },
    );
    assert.equal(dateOnly.length, 1, 'a row carrying only a date must NOT be skipped');
    assert.deepEqual(
      buildStatementEntries(dateOnly, ui)[0].errors.map((e) => e.target),
      ['in'],
      'it must reach the review queue as a missing-amount error',
    );

    const amountOnly = applyStatementMapping(
      [{ Fecha: '', Salida: '', Entrada: '10' }],
      { Fecha: 'date', Salida: 'out', Entrada: 'in' },
    );
    assert.equal(amountOnly.length, 1, 'a row carrying only an amount must NOT be skipped');
    assert.deepEqual(
      buildStatementEntries(amountOnly, ui)[0].errors.map((e) => e.target),
      ['date'],
    );

    // Even a lone description — the least meaningful cell there is — keeps the row, because
    // guessing that the user meant to delete it is not this function's call.
    const descriptionOnly = applyStatementMapping(
      [{ Descripción: 'un concepto suelto' }],
      { Descripción: 'description' },
    );
    assert.equal(descriptionOnly.length, 1);
    assert.equal(buildStatementEntries(descriptionOnly, ui)[0].valid, false);
  });

  // A skipped-blank row never became an entry, so it must not inflate the count of rows the
  // user is knowingly leaving behind — that number only covers invalid or explicitly skipped
  // rows, and a padded file would otherwise report discards the user cannot find.
  it('does not count skipped-blank rows as discarded lines in the preview', () => {
    const csv = [
      HEADERS.join(','),
      ',,,,,',
      '01/08/2026,R1,D1,BP1,,100',
      ',,,,,',
      '02/08/2026,R2,D2,BP2,-5,',
      ',,,,,',
    ].join('\n');

    const { mapped } = importCsv(csv);
    const entries = buildStatementEntries(mapped, ui);
    const preview = buildStatementPreview(entries);
    assert.equal(preview.lineCount, 1);
    // Exactly one: the negative-amount row. The three blank rows are not discards.
    assert.equal(preview.discardedLines, 1);
  });

  it('reports no discarded lines at all for a clean file padded with blank rows', () => {
    const csv = [HEADERS.join(','), '01/08/2026,R1,D1,BP1,,100', ',,,,,', ',,,,,'].join('\n');
    const { mapped } = importCsv(csv);
    const preview = buildStatementPreview(buildStatementEntries(mapped, ui));
    assert.equal(preview.lineCount, 1);
    assert.equal(preview.discardedLines, 0);
  });

  it('returns an empty list for a file whose every row is blank', () => {
    const csv = [HEADERS.join(','), ',,,,,', ',,,,,'].join('\n');
    const { mapped } = importCsv(csv);
    assert.deepEqual(mapped, []);
    assert.equal(buildStatementPreview(buildStatementEntries(mapped, ui)).discardedLines, 0);
  });

  /**
   * The file that auto-matched NOTHING — the one case the blank-row filter got wrong.
   *
   * With no column mapped there are no mapped cells, so "every mapped cell is blank" is
   * vacuously true of every row and the filter dropped the whole file: measured on this
   * fixture, 4 rows parsed and 0 survived. The mapping step then showed an empty queue, which
   * reads as "this file has no data" when the real answer is "tell me which column is which" —
   * and a file whose headers match none of the aliases is precisely the file the mapping step
   * exists for. So with nothing mapped the rows are returned unfiltered and fail validation
   * instead, which is a message the user can act on.
   *
   * Seven foreign English headers a real bank export carries, none of them an alias of any
   * field, `;`-delimited the way a European export is written.
   */
  describe('a file whose columns auto-matched none of the fields', () => {
    const FOREIGN_HEADERS = ['Booking Date', 'Value Date', 'Counterparty', 'Payment Details', 'Debit', 'Credit', 'Balance'];
    const FOREIGN_CSV = [
      FOREIGN_HEADERS.join(';'),
      '01/08/2026;01/08/2026;ACME Ltd;Incoming transfer;;100,00;1.100,00',
      '02/08/2026;02/08/2026;Globex;Card payment;250,00;;850,00',
      '03/08/2026;03/08/2026;Initech;Direct debit;1.234,50;;-384,50',
      '04/08/2026;04/08/2026;Umbrella;Salary;;2.000,00;1.615,50',
    ].join('\n');

    /** The mapping the user builds by hand once the modal tells them nothing matched. */
    const HAND_MAPPING = {
      'Booking Date': 'date',
      'Value Date': null,
      Counterparty: 'bpartnerName',
      'Payment Details': 'description',
      Debit: 'out',
      Credit: 'in',
      Balance: null,
    };

    const parsed = () => parseDelimited(FOREIGN_CSV);

    it('auto-matches none of its seven headers — the premise of every case below', () => {
      const { headers, rows, delimiter } = parsed();
      assert.equal(delimiter, ';');
      assert.deepEqual(headers, FOREIGN_HEADERS);
      assert.equal(rows.length, 4);
      const { mapping, unmappedTargets } = buildStatementMapping(headers, ui);
      assert.deepEqual(Object.values(mapping), new Array(7).fill(null), '0 of 7 headers may match');
      assert.deepEqual(unmappedTargets.sort(), ['bpartnerName', 'date', 'description', 'in', 'out', 'reference']);
    });

    // The regression: 4 rows parsed must still be 4 rows after mapping, not 0.
    it('keeps every row when nothing is mapped yet', () => {
      const { headers, rows } = parsed();
      const { mapping } = buildStatementMapping(headers, ui);
      const mapped = applyStatementMapping(rows, mapping);
      assert.equal(mapped.length, rows.length, 'the review queue must not be emptied by the blank-row filter');
      assert.equal(mapped.length, 4);
    });

    // Kept is not enough: the rows have to SAY something. An empty queue and a queue of rows
    // with no actionable error are the same dead end to the user.
    it('shows those rows as actionable errors rather than as nothing at all', () => {
      const { headers, rows } = parsed();
      const { mapping } = buildStatementMapping(headers, ui);
      const entries = buildStatementEntries(applyStatementMapping(rows, mapping), ui);

      assert.equal(entries.length, 4);
      assert.deepEqual(entries.map((e) => e.valid), [false, false, false, false]);
      for (const entry of entries) {
        const targets = entry.errors.map((e) => e.target).sort();
        // The date is required and absent, and no side carries a positive amount — the two
        // things the user fixes by telling the modal which column is which.
        assert.deepEqual(targets, ['date', 'in']);
      }
      // Nothing is silently sent, and nothing is silently gone: all four are shown as discards.
      const preview = buildStatementPreview(entries);
      assert.equal(preview.lineCount, 0);
      assert.equal(preview.discardedLines, 4);
    });

    // The second half of the two-phase behaviour the mapping step relies on: the SAME parsed
    // rows, re-mapped by hand, become a clean import. Nothing had to be re-uploaded.
    it('validates cleanly once the columns are mapped by hand', () => {
      const { rows } = parsed();
      const mapped = applyStatementMapping(rows, HAND_MAPPING);
      const entries = buildStatementEntries(mapped, ui);

      assert.equal(mapped.length, 4);
      assert.deepEqual(entries.flatMap((e) => e.errors), []);
      assert.deepEqual(entries.map((e) => e.valid), [true, true, true, true]);

      const preview = buildStatementPreview(entries);
      assert.equal(preview.lineCount, rows.length);
      assert.equal(preview.discardedLines, 0);
      assert.equal(preview.periodFrom, '2026-08-01');
      assert.equal(preview.periodTo, '2026-08-04');
      // The unmapped `Balance` column never reached the payload, negative values and all.
      assert.deepEqual(preview.lines.map((l) => l.cramount), [100, 0, 0, 2000]);
      assert.deepEqual(preview.lines.map((l) => l.dramount), [0, 250, 1234.5, 0]);
    });

    // The discriminator that stops the guard from becoming a blanket "never filter": the
    // moment ONE column is mapped, the blank-row filter is back on and judges the row by that
    // column alone. Here only `Credit` is mapped, and the two rows blank in it are dropped.
    it('still filters blank rows as soon as a single column is mapped', () => {
      const { rows } = parsed();
      const mapped = applyStatementMapping(rows, { ...HAND_MAPPING, 'Booking Date': null, Counterparty: null, 'Payment Details': null, Debit: null });
      assert.equal(mapped.length, 2, 'the rows with no Credit value must still be dropped');
      assert.deepEqual(mapped, [{ in: '100,00' }, { in: '2.000,00' }]);
    });

    it('filters a row blank in the one mapped column, whatever its other cells hold', () => {
      assert.deepEqual(
        applyStatementMapping(
          [{ A: '', B: 'no se importa' }, { A: '10', B: '' }],
          { A: 'in', B: null },
        ),
        [{ in: '10' }],
      );
    });
  });
});

describe('buildStatementMapping', () => {
  const ES_HEADERS = ['Fecha', 'Nº de referencia', 'Descripción', 'Nombre del contacto', 'Salida', 'Entrada'];
  // The canonical headers the pre-ETP-4954 importer accepted, and what a CSV exported from
  // the statements list carries. A file that imported before this change must still auto-map.
  const EN_HEADERS = ['Transaction Date', 'Reference No.', 'Description', 'Business Partner Name', 'Amount OUT', 'Amount IN'];

  it('auto-matches the Spanish headers onto every target', () => {
    const { mapping, unmappedTargets } = buildStatementMapping(ES_HEADERS, ui);
    assert.deepEqual(mapping, {
      Fecha: 'date',
      'Nº de referencia': 'reference',
      Descripción: 'description',
      'Nombre del contacto': 'bpartnerName',
      Salida: 'out',
      Entrada: 'in',
    });
    assert.deepEqual(unmappedTargets, []);
  });

  it('auto-matches the legacy English canonical headers onto every target', () => {
    const { mapping, unmappedTargets } = buildStatementMapping(EN_HEADERS, ui);
    assert.deepEqual(mapping, {
      'Transaction Date': 'date',
      'Reference No.': 'reference',
      Description: 'description',
      'Business Partner Name': 'bpartnerName',
      'Amount OUT': 'out',
      'Amount IN': 'in',
    });
    assert.deepEqual(unmappedTargets, []);
  });

  it('matches accent- and case-insensitively', () => {
    const { mapping } = buildStatementMapping(['FECHA', 'descripcion', '  Entrada  '], ui);
    assert.equal(mapping.FECHA, 'date');
    assert.equal(mapping.descripcion, 'description');
    assert.equal(mapping['  Entrada  '], 'in');
  });

  // The downloaded template marks required columns with a trailing `*`. The marker must not
  // survive into matching, or the very template the modal hands out would fail to map its own
  // required column — the ETP-4995 class of bug.
  it('still maps a template header carrying the required marker', () => {
    const { mapping } = buildStatementMapping(['Fecha *', 'Salida', 'Entrada'], ui);
    assert.equal(mapping['Fecha *'], 'date');
  });

  it('leaves an unrecognized header unmapped and reports the fields with no column', () => {
    const { mapping, unmappedTargets } = buildStatementMapping(['Fecha', 'Otra cosa'], ui);
    assert.equal(mapping['Otra cosa'], null);
    assert.deepEqual(unmappedTargets.sort(), ['bpartnerName', 'description', 'in', 'out', 'reference']);
  });

  it('carries the localized fields, which the mapping UI and the review queue render', () => {
    const { localizedFields } = buildStatementMapping(ES_HEADERS, ui);
    assert.deepEqual(localizedFields.map((f) => f.target), ['date', 'reference', 'description', 'bpartnerName', 'out', 'in']);
  });
});

describe('localizeFields', () => {
  it('fills each label with the session-language header', () => {
    const fields = localizeFields((key) => `T:${key}`);
    assert.deepEqual(fields.map((f) => f.label), [
      'T:financeAccountStatementsManualColDate',
      'T:financeAccountStatementsManualColReference',
      'T:financeAccountStatementsManualColDesc',
      'T:financeAccountStatementsManualColContactName',
      'T:financeAccountStatementsManualColOut',
      'T:financeAccountStatementsManualColIn',
    ]);
  });

  // The English canonical headers stay reachable as aliases, which is what keeps a file written
  // with the pre-ETP-4954 headers auto-mapping after the switch to localized labels.
  it('keeps the legacy English canonical headers as aliases', () => {
    const fields = localizeFields((key) => `T:${key}`);
    assert.ok(fields[0].aliases.includes('Transaction Date'));
    assert.ok(fields.find((f) => f.target === 'in').aliases.includes('Amount IN'));
  });

  // With nothing to resolve the key with, the label degrades to the TARGET rather than to an
  // English string — there is no English string left to fall back to.
  it('degrades to the target when the translator resolves nothing', () => {
    assert.deepEqual(
      localizeFields(() => null).map((f) => f.label),
      ['date', 'reference', 'description', 'bpartnerName', 'out', 'in'],
    );
  });

  // The invariant the i18n quality gate now enforces: `label` is what `ImportColumnMapping` and
  // `ImportReviewQueue` RENDER, so it must always come from `labelKey` and never from a baked-in
  // English string. No field in the descriptor declares a `label` of its own.
  it('always derives the rendered label from labelKey, never from a baked-in English string', () => {
    for (const field of BANK_STATEMENT_IMPORT_FIELDS) {
      assert.equal(field.label, undefined, `${field.target} must not declare a hardcoded label`);
      assert.ok(field.labelKey, `${field.target} must declare a labelKey`);
    }
    assert.equal(localizeFields((key) => key)[0].label, 'financeAccountStatementsManualColDate');
  });
});

/**
 * Fixture rows in file-header-mapped shape, deliberately NOT in date order and with one
 * invalid row, so the preview's min/max, its renumbering and its discard count are all
 * exercised at once.
 */
function fixtureEntries() {
  const entries = buildStatementEntries([
    { date: '05/08/2026', reference: 'R1', description: 'D1', bpartnerName: 'BP1', out: '', in: '100,00' },
    { date: '01/08/2026', reference: '   ', description: 'D2', bpartnerName: '', out: '3.500,00', in: '' },
    { date: '10/08/2026', reference: 'R3', description: 'D3', bpartnerName: '', out: '-5', in: '' },
    { date: '03/08/2026', reference: 'R4', description: 'D4', bpartnerName: '', out: '', in: '20' },
  ], ui);
  // The user skipped the last row in the review queue.
  entries[3].status = 'skipped';
  return entries;
}

describe('buildStatementEntries / sendableEntries', () => {
  it('produces one entry per row with its validation result and a pending status', () => {
    const entries = fixtureEntries();
    assert.deepEqual(entries.map((e) => e.valid), [true, true, false, true]);
    assert.equal(entries[0].status, 'pending');
  });

  it('sends only the rows that are valid AND not skipped', () => {
    const sendable = sendableEntries(fixtureEntries());
    assert.deepEqual(sendable.map((e) => e.row.description), ['D1', 'D2']);
  });
});

describe('buildStatementPreview', () => {
  it('counts only the sendable rows', () => {
    const preview = buildStatementPreview(fixtureEntries());
    assert.equal(preview.lineCount, 2);
    assert.equal(preview.lines.length, 2);
  });

  // The behavioural change QA has to be told about: `discardedLines` now counts rows the user
  // is knowingly leaving behind (still invalid, or explicitly skipped) instead of rows the
  // backend silently dropped.
  it('counts invalid AND skipped rows as discarded', () => {
    assert.equal(buildStatementPreview(fixtureEntries()).discardedLines, 2);
  });

  it('reports no discarded lines when every row is sendable', () => {
    const entries = buildStatementEntries([{ date: '01/08/2026', in: '10' }], ui);
    assert.equal(buildStatementPreview(entries).discardedLines, 0);
  });

  // Lexicographic min/max is the correct comparison for `yyyy-MM-dd` and needs no `Date`.
  it('reports periodFrom / periodTo as the min and max ISO date of the SENDABLE rows', () => {
    const preview = buildStatementPreview(fixtureEntries());
    assert.equal(preview.periodFrom, '2026-08-01');
    // 10/08 belongs to the invalid row and 03/08 to the skipped one — neither may widen the
    // period, since neither is being sent.
    assert.equal(preview.periodTo, '2026-08-05');
  });

  it('reports a null period for a file with no usable date', () => {
    const preview = buildStatementPreview([]);
    assert.equal(preview.periodFrom, null);
    assert.equal(preview.periodTo, null);
    assert.equal(preview.lineCount, 0);
  });

  // The line numbering must be contiguous over what is actually sent: a gap would leave the
  // preview's row numbers disagreeing with the statement the user ends up with.
  it('numbers the lines contiguously from 1 over the sendable rows only', () => {
    const preview = buildStatementPreview(fixtureEntries());
    assert.deepEqual(preview.lines.map((l) => l.lineNo), [1, 2]);
  });

  it('renders each line in the shape the preview body reads', () => {
    const [first, second] = buildStatementPreview(fixtureEntries()).lines;
    assert.deepEqual(first, {
      lineNo: 1, date: '2026-08-05', description: 'D1', bpartnerName: 'BP1', cramount: 100, dramount: 0,
    });
    assert.deepEqual(second, {
      lineNo: 2, date: '2026-08-01', description: 'D2', bpartnerName: '', cramount: 0, dramount: 3500,
    });
  });
});

describe('toPayloadLine', () => {
  // The column is mandatory in the DB and `**` is Etendo's own placeholder — what both the
  // manual form and the pre-ETP-4954 importer already stored.
  it('turns a blank reference into the ** placeholder', () => {
    assert.equal(toPayloadLine({ date: '01/08/2026', in: '10' }).reference, '**');
    assert.equal(toPayloadLine({ date: '01/08/2026', reference: '   ', in: '10' }).reference, '**');
  });

  it('keeps a real reference, trimmed', () => {
    assert.equal(toPayloadLine({ date: '01/08/2026', reference: ' R1 ', in: '10' }).reference, 'R1');
  });

  // A file carries the partner's NAME; resolving it to a record is the matching step's job.
  it('always sends a null bpartnerId and glItemId', () => {
    const line = toPayloadLine({ date: '01/08/2026', bpartnerName: 'Cliente', in: '10' });
    assert.equal(line.bpartnerId, null);
    assert.equal(line.glItemId, null);
    assert.equal(line.bpartnerName, 'Cliente');
  });

  it('normalizes the date to a UTC-midnight ISO instant', () => {
    assert.equal(toPayloadLine({ date: '01/08/2026', in: '10' }).date, '2026-08-01T00:00:00Z');
  });

  it('parses both amounts, defaulting a blank or unparseable side to 0', () => {
    const line = toPayloadLine({ date: '01/08/2026', out: '3.500,00', in: '' });
    assert.equal(line.out, 3500);
    assert.equal(line.in, 0);
    assert.equal(toPayloadLine({ date: '01/08/2026', in: 'abc' }).in, 0);
  });

  // The payload is where the 1000x corruption actually shipped: a lone separator used to read
  // as a decimal point unconditionally, so a `1.234` cell reached `?action=create` as 1.234 and
  // came back rendered as `1,23 €`. Pinning it here, not only in the parser's own suite, keeps
  // the wiring between the two honest.
  it('sends a lone-thousands-separator amount at full value, not divided by a thousand', () => {
    assert.equal(toPayloadLine({ date: '01/08/2026', in: '1.234' }).in, 1234);
    assert.equal(toPayloadLine({ date: '01/08/2026', out: '1.500' }).out, 1500);
  });

  // The xlsx path stringifies a real numeric cell with `String(value)`, so a dot-decimal
  // amount must survive the same parser that reads `1.234` as a grouped thousand.
  it('sends an xlsx-shaped dot-decimal amount unchanged', () => {
    assert.equal(toPayloadLine({ date: '01/08/2026', in: String(1800.25) }).in, 1800.25);
    assert.equal(toPayloadLine({ date: '01/08/2026', out: String(410.5) }).out, 410.5);
  });

  it('trims the free-text fields and defaults them to an empty string', () => {
    const line = toPayloadLine({ date: '01/08/2026', description: '  D  ', in: '10' });
    assert.equal(line.description, 'D');
    assert.equal(line.bpartnerName, '');
  });
});

describe('buildStatementCreatePayload', () => {
  const payloadOf = () => buildStatementCreatePayload({
    accountId: 'acc-1',
    file: { name: 'extracto.csv' },
    entries: fixtureEntries(),
    name: 'extracto',
  });

  it('carries the account, the name and the file name', () => {
    const payload = payloadOf();
    assert.equal(payload.accountId, 'acc-1');
    assert.equal(payload.name, 'extracto');
    assert.equal(payload.fileName, 'extracto.csv');
    assert.equal(payload.notes, '');
  });

  // An imported statement arrives processed, the same as before this change.
  it('asks the endpoint to process the statement', () => {
    assert.equal(payloadOf().process, true);
  });

  // The statement's transaction date is its LAST movement, which is what the list column and
  // the account's own ordering key off.
  it('sets transactionDate to the last movement date', () => {
    assert.equal(payloadOf().transactionDate, '2026-08-05T00:00:00Z');
  });

  it('falls back to today for a file with no usable date', () => {
    const payload = buildStatementCreatePayload({
      accountId: 'acc-1', file: { name: 'x.csv' }, entries: [], name: 'x',
    });
    assert.equal(payload.transactionDate, payload.importDate);
    assert.match(payload.transactionDate, /^\d{4}-\d{2}-\d{2}T00:00:00Z$/);
  });

  it('stamps importDate with the local calendar day, never a UTC one', () => {
    const now = new Date();
    const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    assert.equal(payloadOf().importDate, `${localToday}T00:00:00Z`);
  });

  it('sends only the sendable rows, as payload lines', () => {
    const { lines } = payloadOf();
    assert.equal(lines.length, 2);
    assert.deepEqual(lines[0], {
      date: '2026-08-05T00:00:00Z',
      reference: 'R1',
      description: 'D1',
      bpartnerName: 'BP1',
      bpartnerId: null,
      glItemId: null,
      in: 100,
      out: 0,
    });
    assert.deepEqual(lines[1].reference, '**');
    assert.deepEqual(lines[1].out, 3500);
  });

  it('tolerates a missing file', () => {
    const payload = buildStatementCreatePayload({
      accountId: 'acc-1', file: null, entries: fixtureEntries(), name: 'x',
    });
    assert.equal(payload.fileName, '');
  });
});
