/**
 * ETP-5408 — `draftMode` prop shared by the two return windows
 * (return-material-receipt, return-to-vendor-shipment).
 *
 * "Confirmar" is the generic draftMode Confirm (saveActions.jsx), the same button
 * Facturas / Pedidos / Albaranes render. The values mirror decisions.json →
 * window.draftMode (emitted into the generated Page); the window's index.jsx
 * overrides that prop only to add `onConfirm`, which a JSON declaration cannot carry.
 * runDraftModeConfirm saves a dirty header first, then calls it; the window's
 * ConfirmWithCreditButton (topbarRight) listens for `confirmEventName` and opens
 * ConfirmInOutModal. `disableWhenEmpty` replaces the old `linesCount === 0` gate of
 * the hand-rolled button.
 *
 * The label is resolved here (`ui('confirm')`, "Confirmar"), the goods-receipt
 * pattern. Call it from inside the component and memoize on `ui` so the prop keeps
 * a stable identity across renders.
 *
 * @param {(key: string) => string} ui translator returned by `useUI()`
 * @param {string} confirmEventName window event ConfirmWithCreditButton listens for
 * @returns {object} the `draftMode` prop for ReturnWindowShell
 */
export function buildReturnDraftMode(ui, confirmEventName) {
  return {
    enabled: true,
    processField: 'documentAction',
    processValue: 'CO',
    label: ui('confirm'),
    disableWhenEmpty: true,
    onConfirm: () => window.dispatchEvent(new CustomEvent(confirmEventName)),
  };
}
