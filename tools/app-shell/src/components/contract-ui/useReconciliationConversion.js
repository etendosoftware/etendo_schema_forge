import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUI } from '@/i18n';
import { formatCurrency } from '@/lib/formatCurrency';
import {
  conversionDefaults,
  conversionEligibility,
  conversionPayloadFields,
  fxDifference,
  fxOutcome,
  onActualEdit,
  onConvertedEdit,
  onRateEdit,
  outstandingSum,
  referenceRate,
  remainderAmount,
  validateConversion,
} from './reconciliationConversionMath.js';

/** Footer notice per outcome: the difference is named as a gain or a loss, never as a bare sign. */
const FX_NOTICE_KEY = {
  gain: 'financeReconcileBarFxGainAtBankRate',
  loss: 'financeReconcileBarFxLossAtBankRate',
};

/**
 * State of the bank-rate conversion offered by the reconciliation payment-method modal (ETP-5657).
 *
 * The computed defaults (Classic parity: pay everything outstanding, book what the bank sent) are
 * derived from the selection on every render; only what the USER changed is stored, tagged with
 * the selection it was made for. A different line, a different selection or reloaded outstanding
 * amounts therefore fall back to fresh defaults without an effect, and `reset()` does the same on
 * demand (the panel calls it whenever the modal opens or closes, and after a reconcile). The
 * window's read-only tier force-closes the modal without going through the panel's close, so the
 * hook drops the edits itself when that tier switches on — a hidden modal keeps no stale figures.
 *
 * The panel footer is NOT driven by these edits: while selecting it keeps its own invoice-rate
 * totals and only gets `footer.fxNotice`, the exchange difference reconciling at the bank rate
 * would book with the DEFAULT figures.
 *
 * `payloadFields` is null — the backend runs its default invoice-rate path — only when the
 * conversion does not apply. While it applies, the three fields are always sent (Classic parity:
 * there is no way back to the invoice rate from this modal; the user lowers the amount or edits the
 * rate instead).
 *
 * Lives outside `ReconciliationSplitPanel` on purpose: the panel sits at Sonar's
 * cognitive-complexity ceiling (javascript:S3776), so it only reads what this hook returns.
 *
 * @param {object} args
 * @param {boolean} args.invoiceMode the right panel lists invoices
 * @param {boolean} args.isReconciledLine the selected line is already reconciled
 * @param {Array<object>} args.candidates every candidate row of the right panel, in request order
 * @param {Set<string>} args.selectedOpIds the checked candidate ids
 * @param {string} args.accountCurrency the financial account's ISO code
 * @param {number} args.lineAmount the line's signed PENDING amount (the remainder of a partial line)
 * @param {boolean} [args.windowReadOnly] ETP-5457 read-only tier: the modal is kept shut, so its
 *   edits are dropped
 * @returns {{
 *   eligible: boolean, active: boolean, valid: boolean,
 *   fields: object, handlers: object,
 *   payloadFields: {actualPayment: string, conversionRate: string, convertedAmount: string}|null,
 *   footer: {fxNotice: string|null},
 *   reset: () => void,
 * }}
 */
export function useReconciliationConversion({
  invoiceMode, isReconciledLine, candidates, selectedOpIds, accountCurrency, lineAmount,
  windowReadOnly = false,
}) {
  const ui = useUI();
  // Same filter and order as the `invoices` array of the reconcile payload: the backend allocates
  // the amount to pay over the invoices in that order, so the FX preview must follow it too.
  const invoices = useMemo(
    () => (candidates || []).filter((c) => selectedOpIds.has(c.id) && c.kind === 'invoice'),
    [candidates, selectedOpIds],
  );
  const { eligible, invoiceCurrency } = conversionEligibility({
    invoiceMode, isReconciledLine, invoices, accountCurrency, lineAmount,
  });
  const lineAbs = Math.abs(Number(lineAmount) || 0);
  const outstanding = useMemo(() => outstandingSum(invoices), [invoices]);
  const active = eligible && outstanding > 0 && lineAbs > 0;

  const signature = `${lineAbs}|${outstanding}|${invoices.map((c) => c.id).join(',')}`;
  const defaults = useMemo(
    () => conversionDefaults({ outstanding, lineAbs }),
    [outstanding, lineAbs],
  );
  /** @type {[{signature: string, state: object}|null, Function]} */
  const [override, setOverride] = useState(null);
  const state = override?.signature === signature ? override.state : defaults;

  const update = useCallback((edit) => {
    setOverride((prev) => ({
      signature,
      state: edit(prev?.signature === signature ? prev.state : defaults),
    }));
  }, [signature, defaults]);

  // MaskedAmountInput reports (clean, parsed) on every keystroke.
  const handlers = useMemo(() => ({
    onActualChange: (_clean, parsed) => update((s) => onActualEdit(s, parsed)),
    onRateChange: (clean, parsed) => update((s) => onRateEdit(s, parsed, clean)),
    onConvertedChange: (_clean, parsed) => update((s) => onConvertedEdit(s, parsed)),
  }), [update]);

  const reset = useCallback(() => setOverride(null), []);
  useEffect(() => {
    if (windowReadOnly) setOverride(null);
  }, [windowReadOnly]);

  const validation = validateConversion(state, { outstanding, lineAbs });
  const isReceipt = Number(lineAmount) >= 0;
  // The invoice rate of what THIS amount settles (paid-weighted), so a partial payment over several
  // invoices is compared against the invoices it actually pays.
  const reference = referenceRate(invoices, state.actual);
  // Figures derived from an invalid form are noise (a negative amount, a zero rate), so the
  // exchange difference and the remainder are only offered while the form is valid.
  const fx = reference == null || !validation.valid ? null : fxDifference(state, invoices);

  // The footer keeps the panel's own invoice-rate totals while selecting; it only announces what
  // reconciling at the bank rate WOULD book, from the defaults — never from the modal's edits.
  // Null when a candidate has no rate (nothing to compare against) or the gap is negligible.
  const defaultOutcome = active ? fxOutcome(fxDifference(defaults, invoices), isReceipt) : null;
  const fxNotice = defaultOutcome
    ? ui(FX_NOTICE_KEY[defaultOutcome.kind], {
      amount: formatCurrency(accountCurrency, defaultOutcome.amount),
    })
    : null;

  return {
    eligible,
    active,
    valid: !active || validation.valid,
    fields: {
      isReceipt,
      invoiceCurrency,
      accountCurrency,
      statementAmount: lineAbs,
      outstanding,
      actual: state.actual,
      // The typed text while the user owns the rate, so the field never re-renders what they typed.
      rate: state.rateText ?? state.rate,
      converted: state.converted,
      reference,
      fxDifference: fx,
      fxOutcome: fxOutcome(fx, isReceipt),
      remainder: validation.valid ? remainderAmount(state, lineAbs) : 0,
      errors: {
        actual: validation.actualInvalid,
        rate: validation.rateInvalid,
        converted: validation.convertedInvalid,
      },
    },
    handlers,
    payloadFields: active ? conversionPayloadFields(state) : null,
    footer: { fxNotice },
    reset,
  };
}
