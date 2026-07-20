import { useCallback, useEffect, useMemo, useState } from 'react';

// ─── es-ES plain number helpers (no currency symbol) ─────────────────────────
// The amount input shows a grouped es-ES number ("6.420,00") with the "€" suffix
// rendered separately, mirroring the design prototype's `fmtPlain`.

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

/** Inserts es-ES thousands separators without regex backtracking (ReDoS-safe). */
function groupThousands(intStr) {
  let out = '';
  for (let i = 0; i < intStr.length; i += 1) {
    if (i > 0 && (intStr.length - i) % 3 === 0) {
      out += '.';
    }
    out += intStr[i];
  }
  return out;
}

/** Formats a number as a plain es-ES amount: "6.420,00" (no symbol). */
export function formatPlain(n) {
  const value = Number.isFinite(n) ? n : 0;
  const neg = value < 0;
  const [intPart, decPart] = Math.abs(value).toFixed(2).split('.');
  return `${neg ? '-' : ''}${groupThousands(intPart)},${decPart}`;
}

/** Parses an es-ES amount string ("6.420,00") into a number, or null if blank/invalid. */
export function parsePlain(str) {
  if (str == null) return null;
  const trimmed = String(str).trim();
  if (trimmed === '') return null;
  const normalized = trimmed.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(normalized);
  return Number.isNaN(n) ? null : n;
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
  // 'credit' = leave overpayment as customer credit, null = unresolved.
  // (The "refund"/"dar vuelto" path was dropped — product decision, ETP-4504.)
  const [excessMode, setExcessMode] = useState(null);

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

  // An overpayment can only be left as customer credit when `canLeaveCredit` (receipt in the
  // org currency). Otherwise — payments, or a foreign-currency receipt — the only resolution
  // is adjusting the amount ("Igualar"), so any excess blocks confirmation outright.
  const excessUnresolved = isExcess && !(canLeaveCredit && excessMode === 'credit');
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
    excessUnresolved, canConfirm,
    // actions
    equalize, STEP,
  };
}
