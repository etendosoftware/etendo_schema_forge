import DocumentSecondaryActions from '@/windows/custom/shared/DocumentSecondaryActions';

/**
 * Adapts the shared `DocumentSecondaryActions` group to purchase-invoice (ETP-5260).
 * Wired as `topbarRight`'s replacement slot from
 * `windows/custom/purchase-invoice/index.jsx` (this window is on the "Camino B"
 * prop-hardcoded path, see the plan doc), rendering Copy link -> Clone to the
 * LEFT of Save/Confirm — see the classification comment near `DetailView.jsx`'s
 * `topbarSecondary`/`topbarRight` render for the primary/secondary split
 * rationale.
 *
 * Clone reuses the `cloneInvoiceError` / `invoiceProcessing` i18n keys that
 * `PurchaseInvoiceTopbar` used inline before ETP-5260 (its `titleKey`/`bodyKey`/
 * `actionLabelKey` props were never actually read by `CloneOrderModal` — dead
 * props, not carried over here).
 *
 * The fiscal send action (send invoice to SII / Batuz) used to render here,
 * after Clone. ETP-5700 removed it from the form topbar: in the form view it
 * lives only in the kebab (`SifSendMenuItem`, `window.customComponents.
 * moreMenuContent`), whose modal is hosted by `SifSendModalHost`.
 *
 * The payment-status badge stays in `PurchaseInvoiceTopbar` (topbarRight),
 * unaffected by this migration — it is a primary/status indicator that
 * belongs at the extreme right, after Save/Confirm.
 */
export default function PurchaseInvoiceSecondaryActions(props) {
  return (
    <DocumentSecondaryActions
      {...props}
      windowName="purchase-invoice"
      clone={{ errorKey: 'cloneInvoiceError', processingKey: 'invoiceProcessing' }}
      data-testid="PurchaseInvoiceSecondaryActions" />
  );
}
