/**
 * The one amount parser for bank statements — shared by the manual form, the CSV import and the
 * Excel import, so no two of them can disagree about what a cell is worth.
 *
 * ## The rule
 *
 * 1. A cell carrying **both** separators is unambiguous: the rightmost one is the decimal.
 *    `1.234,56` and `1,234.56` both read 1234.56, so a file exported under either convention
 *    imports correctly under the other.
 * 2. A cell carrying **one** separator followed by exactly **three** digits is read as a
 *    thousands separator: `1.234` and `1,234` are 1234, `12.345` is 12345, `1.500` is 1500.
 * 3. Anything else reads the separator as decimal: `1800.25`, `99,90`, `1.23`, `1.2345`.
 *
 * ## Why the digit count, and not the instance's decimal convention
 *
 * Deciding by convention — a lone `.` groups in Spanish, decimates in English, which is exactly
 * what Etendo Classic does — is wrong HERE, and the reason is that three sources share this
 * parser and only one of them writes in a declared convention:
 *
 *  - a **CSV** cell is text a bank wrote, e.g. `1.234` for 1234;
 *  - an **xlsx** numeric cell is a real number that `parseXlsx` stringifies with `String(value)`,
 *    so 1800.25 arrives as the canonical dot-decimal `"1800.25"`;
 *  - the **manual grid** carries whatever the user typed, e.g. `1500.50`.
 *
 * `1.234` and `1800.25` are structurally identical strings needing opposite readings, so no
 * single convention can serve both: applying the Spanish one turned every Excel amount into
 * 180025 and every typed `1500.50` into 150050. The digit count separates them, because money
 * carries at most two decimals — three digits after a lone separator is grouping, two is a
 * fraction. Classic never faces this: it only ever reads CSV text, told in advance which
 * convention that file uses (`CsvConfiguration`, defaulting to comma-decimal).
 *
 * ## What this fixes, and where it still differs from Classic
 *
 * Rule 2 is the fix for a silent 1000x corruption (ETP-4954 follow-up): a lone separator used
 * to be a decimal point unconditionally, so `1.234` became 1.234 and rendered — after rounding
 * to two decimals — as `1,23 €`. Every amount written with a thousands separator and no
 * decimals was divided by a thousand, with nothing flagging it.
 *
 * Measured against `Utility.stringToBigDecimal` on its default separator, we now agree with
 * Classic on `1.234`, `12.345`, `1.500`, `1.234,56` and `99,90`, and diverge deliberately on
 * three cells:
 *
 * | cell | Classic | here | why ours |
 * |---|---|---|---|
 * | `1,234.56` | 1.234 | 1234.56 | Classic stops at the first char its locale cannot read |
 * | `1.23` | 123 | 1.23 | two digits is a fraction; 123 is an artifact of forcing a convention |
 * | `1,234` | 1.234 | 1234 | money has no third decimal |
 *
 * ## The residual risk, stated plainly
 *
 * A genuine three-decimal value (`1.234` meaning one and 234 thousandths) reads as 1234. That
 * is the right trade for bank statements, where amounts carry two decimals, and the review queue
 * renders the PARSED amount rather than the raw cell so the interpretation is visible before the
 * user confirms.
 *
 * Blank, invalid and numeric are kept distinct because the import pipeline needs all three: a
 * blank amount cell is legitimate (a line is an inflow OR an outflow, never both), while a cell
 * reading "abc" is a row error the review queue has to surface BEFORE the send.
 */

/** Every occurrence of `ch`, which may be a regex metacharacter, removed from `s`. */
function stripAll(s, ch) {
  return s.split(ch).join('');
}

/**
 * @param {unknown} raw Raw cell text or typed input.
 * @returns {number|null} the parsed number, `null` for a blank cell, `NaN` when unparseable.
 */
/** Exactly three digits, i.e. a thousands group. */
const GROUP_RE = /^\d{3}$/;

/**
 * True when `sep` is acting as a thousands separator in `s`.
 *
 * Every group after the first must be a full three digits, and the leading part must not be a
 * lone zero — `0.500` is not a grouped number (grouping never follows a bare 0), so it reads as
 * 0.5. `1.234.567` qualifies; `1.234.56` does not, and falls through to rule 3, where its LAST
 * separator becomes the decimal point.
 */
function isThousands(s, sep) {
  const parts = s.split(sep);
  if (parts.length < 2) return false;
  if (!parts.slice(1).every((p) => GROUP_RE.test(p))) return false;
  return !/^-?0$/.test(parts[0]);
}

export function parseStatementAmount(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  let normalized = s;
  if (hasComma && hasDot) {
    // Rule 1 — the rightmost separator is the decimal one.
    normalized = s.lastIndexOf(',') > s.lastIndexOf('.')
      ? stripAll(s, '.').replace(',', '.')
      : stripAll(s, ',');
  } else if (hasComma || hasDot) {
    const sep = hasComma ? ',' : '.';
    if (isThousands(s, sep)) {
      // Rule 2.
      normalized = stripAll(s, sep);
    } else {
      // Rule 3 — the LAST occurrence is the decimal point, any earlier ones group.
      //
      // The "earlier ones group" half only applies when the cell really is a grouped number
      // with a decimal tail (`1.234.56` → 1234.56). `1,2,3` is not a number at all, and
      // salvaging it into 12.3 would import garbage silently, so it is left as-is for the
      // digits check below to reject.
      const parts = s.split(sep);
      const grouped = parts.length === 2 || parts.slice(1, -1).every((p) => GROUP_RE.test(p));
      const idx = s.lastIndexOf(sep);
      normalized = grouped
        ? `${stripAll(s.slice(0, idx), sep)}.${s.slice(idx + 1)}`
        : s;
    }
  }

  const n = parseFloat(normalized);
  // `parseFloat` stops at the first character it cannot read, so "12x" would yield 12. A cell
  // must be a number in full or not at all — a partially-readable amount is a row error, which
  // is also what Classic does (its DecimalFormat throws rather than salvaging a prefix).
  return Number.isFinite(n) && /^-?\d*\.?\d*$/.test(normalized) ? n : NaN;
}

/**
 * The manual form's view of an amount: a finite number, with blank and unparseable both
 * collapsing to 0. The grid has no place to show a per-cell error, so an unreadable amount
 * reads as "no amount on this side" and the line then fails `isLineComplete`.
 */
export function parseAmount(v) {
  const n = parseStatementAmount(v);
  return Number.isFinite(n) ? n : 0;
}

/** True when the cell holds something that is not a number. A blank cell counts as valid. */
export function isInvalidStatementAmount(raw) {
  return Number.isNaN(parseStatementAmount(raw));
}
