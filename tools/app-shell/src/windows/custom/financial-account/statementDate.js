/**
 * The one date parser for bank-statement imports.
 *
 * Lives in its own module, apart from the pipeline that uses it, so the row validator in
 * `bankStatementImportFields.js` can reach it without an import cycle (the pipeline imports the
 * descriptor, so the descriptor cannot import the pipeline). Same split, and same reason, as
 * `statementAmount.js`.
 */

/**
 * Normalizes the date shapes a statement file can carry into `yyyy-MM-dd`.
 *
 * Four inputs have to land on the same day: `dd/MM/yyyy` (what a Spanish operator types and what
 * the template's example row shows), `dd-MM-yyyy` (what `parseXlsx` emits for a real Excel date
 * cell, matching the CSV export), `dd.MM.yyyy` (some bank exports), and a plain ISO `yyyy-MM-dd`.
 *
 * Day-first is the assumption for every separated form, because that is what all three of this
 * app's locales use and what the template documents. `01/08/2026` is therefore 1 August, never
 * 8 January.
 *
 * No `Date` is constructed for the calendar value, on purpose. `new Date('2026-08-01')` parses as
 * UTC midnight, and reading it back with local getters shifts the calendar day on any negative-UTC
 * host — the ETP-4031 / ETP-4850 bug class, which hit this very import flow. Working purely on the
 * string cannot shift a day. (`isRealDate` does build one, but only to count the days in a month,
 * and reads it back with UTC getters.)
 *
 * @returns {string|null} `yyyy-MM-dd`, or `null` when the cell is blank or unrecognizable.
 */
export function normalizeStatementDate(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  // A date cell may arrive with a time part (a spreadsheet formatted as date-time).
  const datePart = s.split(/[T ]/)[0];

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
  if (iso) {
    const [, y, m, d] = iso;
    return isRealDate(y, m, d) ? `${y}-${m}-${d}` : null;
  }

  const dayFirst = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})$/.exec(datePart);
  if (dayFirst) {
    const [, d, m, rawYear] = dayFirst;
    // A two-digit year is read as 20xx. Bank statements are contemporary documents, and the
    // alternative (a 19xx window) would silently misfile every one of them.
    const y = rawYear.length === 2 ? `20${rawYear}` : rawYear;
    const dd = d.padStart(2, '0');
    const mm = m.padStart(2, '0');
    return isRealDate(y, mm, dd) ? `${y}-${mm}-${dd}` : null;
  }
  return null;
}

/**
 * True when the cell holds something that is not a usable date. A blank cell counts as valid —
 * "the row says nothing about this field" is the required check's business, not this one's, the
 * same blank-is-not-invalid split `parseStatementAmount` draws.
 *
 * This exists because the generic `validateRow` can only ask whether a required cell is BLANK.
 * `31/02/2026` is not blank, so it passed every check and only failed later, in `toPayloadLine`,
 * where an unparseable date turned into the literal string `"nullT00:00:00Z"` in the payload.
 */
export function isInvalidStatementDate(raw) {
  const s = String(raw ?? '').trim();
  return s !== '' && normalizeStatementDate(s) === null;
}

/** Rejects 31 February and friends, so an impossible date fails its row instead of rolling over. */
function isRealDate(y, m, d) {
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}
