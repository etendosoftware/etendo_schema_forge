/**
 * Pure derivations for the cash-close screen (ETP-4795).
 *
 * Everything the panel shows beyond raw user input is computed here, so the arithmetic that
 * actually carries risk — signs, the balanced/unbalanced threshold, which rows the two filters
 * hide, and es-ES amount parsing — is unit-testable without mounting React.
 *
 * The screen's own state is only: `marked` (Set of movement ids), `statementDate` (ISO
 * `yyyy-mm-dd`), `declared` (number), `hideCleared`, `hideAfter` and `search`. Nothing derived
 * from those is ever stored.
 */

/**
 * A close is treated as balanced when the difference is under half a cent. Deliberately tighter
 * than the reconciliation panel's own `RECONCILE_TOLERANCE` (0.01): that one decides whether a
 * SELECTION may be reconciled, this one only decides whether a difference transaction has to be
 * posted at all. The backend applies the same threshold (`CashCloseHandler.DIFF_TOLERANCE`).
 */
export const CASH_CLOSE_TOLERANCE = 0.005;

/**
 * Parses an amount typed in es-ES notation (`"1.234,56"` → `1234.56`).
 *
 * Mirrors `parseEur` from `components/payment/paymentData.js` — thousands dots are dropped and
 * the comma is the decimal separator. A plain `"12.50"` (no comma, single dot with 1-2 trailing
 * digits) is also accepted as 12.5, so a user typing on a numeric keypad is not silently read as
 * 1250.
 *
 * @param {string|number|null|undefined} raw
 * @returns {number} the parsed amount, or 0 when unparseable
 */
export function parseDeclaredAmount(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
  if (raw == null) return 0;
  const text = String(raw).trim();
  if (text === '') return 0;

  const hasComma = text.includes(',');
  // Without a comma, a single dot followed by 1-2 digits is a decimal point, not a thousands
  // separator ("12.50" → 12.5); anything else ("1.234") is thousands grouping.
  const decimalDotOnly = !hasComma && /^-?\d+\.\d{1,2}$/.test(text);
  const normalized = decimalDotOnly
    ? text
    : text.replace(/\./g, '').replace(',', '.');

  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : 0;
}

/** Inflow part of a signed movement amount (0 for an outflow). */
export function inflowOf(movement) {
  const amount = Number(movement?.amount) || 0;
  return amount > 0 ? amount : 0;
}

/** Outflow part of a signed movement amount, as a NEGATIVE number (0 for an inflow). */
export function outflowOf(movement) {
  const amount = Number(movement?.amount) || 0;
  return amount < 0 ? amount : 0;
}

/**
 * The date part of a movement's ISO timestamp, for comparison against `statementDate`.
 * Compares the `yyyy-mm-dd` prefixes as strings — the backend emits UTC-midnight timestamps, so
 * building a `Date` here would reintroduce the local-timezone off-by-one that
 * `lib/dateOnly.js` exists to avoid.
 */
export function movementDateKey(movement) {
  return String(movement?.transactionDate ?? '').slice(0, 10);
}

/** True when the movement is dated strictly after the close date. */
export function isAfterStatementDate(movement, statementDate) {
  const key = movementDateKey(movement);
  if (!key || !statementDate) return false;
  return key > statementDate;
}

/**
 * Rows the two toggles and the search box leave visible.
 *
 * - `hideCleared` drops the already-ticked rows, so the user can "empty" the list as they go.
 * - `hideAfter` drops movements dated after the close date (on by default).
 * - `search` matches, case-insensitively, against contact, description and payment reference.
 */
export function visibleMovements(movements, { marked, statementDate, hideCleared, hideAfter, search }) {
  const needle = String(search ?? '').trim().toLowerCase();
  return (movements ?? []).filter((m) => {
    if (hideCleared && marked?.has(m.id)) return false;
    if (hideAfter && isAfterStatementDate(m, statementDate)) return false;
    if (!needle) return true;
    return [m.partnerName, m.description, m.documentNo]
      .some((field) => String(field ?? '').toLowerCase().includes(needle));
  });
}

/** How many movements are dated after the close date (drives the amber banner's count). */
export function countAfterStatementDate(movements, statementDate) {
  return (movements ?? []).filter((m) => isAfterStatementDate(m, statementDate)).length;
}

/**
 * The whole live summary in one pass: the marked inflow/outflow totals, the resulting calculated
 * balance, the difference against what the user declared, and whether that difference is small
 * enough to need no adjustment transaction.
 *
 * `difference = declared - calculated`, i.e. POSITIVE when the drawer holds more cash than the
 * books say (a surplus, posted as a deposit) and NEGATIVE when it holds less (a shortage, posted
 * as a withdrawal). The backend derives the transaction direction from the same sign.
 *
 * @param {Array} movements every pending movement (not just the visible ones — the filters must
 *   never change the arithmetic)
 * @param {{ marked: Set<string>, openingBalance: number, declared: number }} input
 */
export function summarize(movements, { marked, openingBalance, declared }) {
  const cleared = (movements ?? []).filter((m) => marked?.has(m.id));

  const markedIn = round2(cleared.reduce((acc, m) => acc + inflowOf(m), 0));
  const markedOut = round2(cleared.reduce((acc, m) => acc + outflowOf(m), 0));
  const opening = Number(openingBalance) || 0;
  const calculated = round2(opening + markedIn + markedOut);
  const declaredValue = Number(declared) || 0;
  const difference = round2(declaredValue - calculated);

  return {
    clearedCount: cleared.length,
    pendingCount: (movements ?? []).length - cleared.length,
    openingBalance: opening,
    markedIn,
    markedOut,
    calculated,
    declared: declaredValue,
    difference,
    balanced: Math.abs(difference) < CASH_CLOSE_TOLERANCE,
  };
}

/** Rounds to cents, killing the float noise that `0.1 + 0.2` style sums accumulate. */
export function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/** Select-all tri-state for the header/filter-bar checkbox, over the VISIBLE rows. */
export function selectionState(visible, marked) {
  const total = (visible ?? []).length;
  if (total === 0) return { allSelected: false, someSelected: false };
  const selected = visible.filter((m) => marked?.has(m.id)).length;
  return {
    allSelected: selected === total,
    someSelected: selected > 0 && selected < total,
  };
}

/**
 * Next `marked` set after clicking "select all": clears the visible rows when they are all
 * ticked already, otherwise adds every visible row. Rows hidden by the filters keep their
 * current state either way — the toggle must never silently untick something off-screen.
 */
export function toggleAllVisible(visible, marked) {
  const next = new Set(marked ?? []);
  const { allSelected } = selectionState(visible, next);
  (visible ?? []).forEach((m) => {
    if (allSelected) next.delete(m.id);
    else next.add(m.id);
  });
  return next;
}

/** Next `marked` set after clicking one row. */
export function toggleOne(marked, id) {
  const next = new Set(marked ?? []);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}
