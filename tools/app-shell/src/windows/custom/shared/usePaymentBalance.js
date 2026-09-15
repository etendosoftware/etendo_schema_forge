import { useCallback, useEffect, useMemo, useState } from 'react';
// Relative, NOT the '@/' alias: this module is covered by a plain `node --test` suite
// (`__tests__/usePaymentBalance.test.js`, matched by the root package.json glob), and node does
// not resolve Vite path aliases — the same constraint currencyFormatConfig.js documents for its
// own imports (ETP-5022).
import { formatCurrency } from '../../../lib/formatCurrency.js';
import { parseAmountInput } from '../../../lib/parseAmountInput.js';

// ─── plain amount helpers (instance-configured format, no currency symbol) ───
// These render/read the amount fields of the "Nuevo cobro/pago" modal. They route through the
// CANONICAL currency helpers (formatCurrency / parseLocaleNumber), so the modal reads and writes
// amounts in the SAME convention as the rest of the app — comma as the decimal separator under the
// shipped es-ES config.
//
// They used to be hardcoded en-US ("6,420.00"), which silently reinterpreted a Spanish-typed
// amount: `50,50` had its comma stripped as if it were a thousands separator and parsed as 5050,
// so a cobro of fifty-euros-fifty was applied as five-thousand-and-fifty — a ~100x error the UI
// then offered to refund or leave as customer credit, with no warning (ETP-5107 QA round 2).

const TOLERANCE = 0.001;
const STEP = 100;
// Stable reference for the "no usedSources" default — a fresh [] literal on every render (e.g.
// `payment?.creditSourcesUsed || []`) would change identity each time and re-trigger the seed
// effect below in a loop.
const EMPTY_USED_SOURCES = [];

/** Rounds to 2 decimals, avoiding binary float drift. */
export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Formats a number as a plain amount in the instance-configured format, no symbol:
 * "6.420,00" under the shipped es-ES separators.
 */
export function formatPlain(n) {
  // formatCurrency returns '—' for a non-finite value, so coerce first — these fields must always
  // show a real amount (the pre-existing contract: NaN/Infinity/undefined all render as zero).
  return formatCurrency(undefined, Number.isFinite(n) ? n : 0);
}

/**
 * Parses an amount string produced by `formatPlain` (or typed into one of the modal's amount
 * fields) into a number, or null if blank/invalid.
 *
 * Uses the STRUCTURAL parser (`lib/parseAmountInput.js`), not the config-driven
 * `parseLocaleNumber`: this field carries thousands separators from `formatPlain`, and it has no
 * live masking, so a rule that always read '.' as grouping would turn a typed `75.50` into 7550.
 *
 * Not for exchange RATES. A rate arrives canonical dot-decimal from the backend and a value like
 * `1.500` legitimately means one-point-five there, which the structural rule would read as 1500
 * (three digits after a lone separator = grouping). Rates parse with `parseLocaleNumber` — see
 * `NewPaymentEntryModal.jsx`.
 */
export function parsePlain(str) {
  const n = parseAmountInput(str);
  // parseAmountInput returns null for blank and NaN for unparseable; this hook's callers only
  // distinguish "no number" from a number, so both collapse to null.
  return Number.isFinite(n) ? n : null;
}

/** Finds the usedSources entry (if any) matching a credit/abono source by its kind + id. */
function findUsedSource(usedSources, s) {
  return usedSources.find(u => (
    (s.kind === 'credit' && u.kind === 'credit' && u.paymentId === s.paymentId)
    || (s.kind === 'abono' && u.kind === 'abono' && u.psdId === s.psdId)
  ));
}

/**
 * Builds the consumable credit lines, re-checking (and pre-filling the used amount of) any
 * source the payment being edited already consumes — so re-opening a draft restores its
 * previous credit selection instead of always starting unchecked.
 */
function seedLines(sources, usedSources) {
  return sources.map(s => {
    const used = findUsedSource(usedSources, s);
    const use = used ? round2(Math.min(Number(used.use) || 0, s.avail)) : 0;
    return { ...s, sel: !!used, use, useStr: formatPlain(use) };
  });
}

/**
 * usePaymentBalance — encapsulates the cuadre (balancing) logic of the
 * "Nuevo cobro/pago" modal, isolated from the DOM so it can be unit-tested.
 *
 * @param {object}   params
 * @param {number}   params.total    invoice outstanding amount (the target to cover)
 * @param {'in'|'out'} params.dir    'in' = cobro (receipt), 'out' = pago (payment)
 * @param {Array}    params.sources  consumable credit/abono sources:
 *                                   { id, kind:'credit'|'abono', doc, date, note, avail, psdId?, paymentId? }
 * @param {Array}    params.usedSources  (edit mode only) sources the draft already consumes:
 *                                   { kind:'credit'|'abono', paymentId?, psdId?, use }
 * @param {boolean}  params.canLeaveCredit  whether an overpayment may be left as customer
 *                                   credit — the modal passes `isReceipt && invoiceInOrgCurrency`.
 *                                   When false the only excess resolution is adjusting the amount
 *                                   ("Igualar"), so any excess blocks confirmation.
 *
 * Returns the editable amount (number + es-ES string), the credit lines with
 * selection/usage, the derived totals, and the mutators the modal wires to the UI.
 */
export function usePaymentBalance({
  total, dir = 'in', sources = [], usedSources = EMPTY_USED_SOURCES, canLeaveCredit = false,
}) {
  const applied = round2(total);
  const isReceipt = dir === 'in';

  const [amount, setAmount] = useState(applied);
  const [amountStr, setAmountStr] = useState(formatPlain(applied));
  const [lines, setLines] = useState(() => seedLines(sources, usedSources));
  // 'credit' = leave the overpayment as customer credit, 'refund' = give change back, null = unresolved.
  const [excessMode, setExcessMode] = useState(null);
  // "Dar vuelto" (refund) and "Dejar a crédito" (credit) share the SAME gate: both are offered only
  // when the invoice is in the org currency (canLeaveCredit). A foreign-currency receipt — and any
  // payment — gets neither; the only resolution there is adjusting the amount ("Igualar").
  const canRefund = canLeaveCredit;

  // Credit/abono sources arrive asynchronously (fetched after mount); re-seed the
  // consumable lines whenever they change so the section appears once data loads.
  // usedSources (only present in edit mode) re-checks the lines the draft already
  // consumed, restoring the selection/amount it had when it was last saved.
  useEffect(() => {
    setLines(seedLines(sources, usedSources));
  }, [sources, usedSources]);

  const usedCredit = useMemo(
    () => round2(lines.reduce((acc, l) => acc + (l.sel ? l.use : 0), 0)),
    [lines],
  );

  const funds = round2(amount + usedCredit);
  const diff = round2(funds - applied);
  const isExcess = diff > TOLERANCE;
  const isPartial = diff < -TOLERANCE;
  const isExact = !isExcess && !isPartial;

  // An overpayment is resolved by giving change back ("Dar vuelto") or leaving it as customer
  // credit ("Dejar a crédito") — BOTH gated on the invoice being in the org currency
  // (canLeaveCredit). Foreign-currency receipts and all payments get neither, so any excess
  // blocks confirmation and "Igualar"/adjust is the only path there.
  const excessResolved = canLeaveCredit && (excessMode === 'credit' || excessMode === 'refund');
  const excessUnresolved = isExcess && !excessResolved;
  const canConfirm = !excessUnresolved && amount >= 0;

  // ── amount input ──────────────────────────────────────────────────────────
  const onAmountChange = useCallback((str) => {
    setAmountStr(str);
    const n = parsePlain(str);
    setAmount(n == null ? 0 : n);
  }, []);

  const onAmountBlur = useCallback(() => {
    setAmountStr(prev => formatPlain(parsePlain(prev) ?? 0));
  }, []);

  // ── credit lines ──────────────────────────────────────────────────────────
  // Selecting a line consumes only what the invoice still needs (capped to its
  // available amount) and lowers the cash amount so credit + cash == the invoice
  // total (no artificial excess). Deselecting returns that amount to cash.
  const toggleLine = useCallback((id) => {
    const target = lines.find(l => l.id === id);
    if (!target) return;
    const usedByOthers = lines.reduce(
      (acc, l) => acc + (l.sel && l.id !== id ? l.use : 0), 0);

    let nextUse;
    let next;
    if (target.sel) {
      nextUse = 0;
      next = lines.map(l => (l.id === id ? { ...l, sel: false, use: 0, useStr: formatPlain(0) } : l));
    } else {
      const need = round2(Math.max(0, applied - usedByOthers));
      nextUse = round2(Math.min(target.avail, need));
      next = lines.map(l => (l.id === id ? { ...l, sel: true, use: nextUse, useStr: formatPlain(nextUse) } : l));
    }
    setLines(next);

    // keep the payment balanced: cash covers whatever the credits don't.
    const newCash = round2(Math.max(0, applied - usedByOthers - nextUse));
    setAmount(newCash);
    setAmountStr(formatPlain(newCash));
  }, [lines, applied]);

  const stepLine = useCallback((id, delta) => {
    setLines(prev => prev.map(l =>
      l.id === id
        ? { ...l, use: round2(Math.max(0, Math.min(l.avail, l.use + delta))) }
        : l));
  }, []);

  // ── direct line-amount editing (typed input, replaces the +/- stepper) ─────
  // Mirrors onAmountChange/onAmountBlur: keep the raw typed string live while
  // editing, and only clamp/round/reformat on blur so the cursor doesn't jump
  // mid-keystroke.
  const onLineUseChange = useCallback((id, str) => {
    setLines(prev => prev.map(l => (l.id === id ? { ...l, useStr: str } : l)));
  }, []);

  const onLineUseBlur = useCallback((id) => {
    setLines(prev => prev.map(l => {
      if (l.id !== id) return l;
      const clamped = round2(Math.max(0, Math.min(l.avail, parsePlain(l.useStr) ?? 0)));
      return { ...l, use: clamped, useStr: formatPlain(clamped) };
    }));
  }, []);

  // ── equalize ("Igualar") ──────────────────────────────────────────────────
  // Set the cash amount so that cash + used credit exactly covers the invoice.
  const equalize = useCallback(() => {
    setExcessMode(null);
    setLines(prevLines => {
      const used = prevLines.reduce((acc, l) => acc + (l.sel ? l.use : 0), 0);
      const next = round2(Math.max(0, applied - used));
      setAmount(next);
      setAmountStr(formatPlain(next));
      return prevLines;
    });
  }, [applied]);

  // The credit sources actually consumed, for the confirm/save payload.
  const consumedSources = useMemo(
    () => lines
      .filter(l => l.sel && l.use > 0)
      .map(l => ({ kind: l.kind, paymentId: l.paymentId, psdId: l.psdId, use: round2(l.use) })),
    [lines],
  );

  return {
    // editable amount
    amount, amountStr, onAmountChange, onAmountBlur,
    // credit lines
    lines, toggleLine, stepLine, onLineUseChange, onLineUseBlur, consumedSources,
    // derived totals
    applied, usedCredit, funds, diff,
    isExcess, isPartial, isExact,
    excessAmount: isExcess ? diff : 0,
    missingAmount: isPartial ? round2(-diff) : 0,
    // excess resolution
    excessMode, setExcessMode,
    excessUnresolved, canConfirm, canRefund,
    // actions
    equalize, STEP,
  };
}
