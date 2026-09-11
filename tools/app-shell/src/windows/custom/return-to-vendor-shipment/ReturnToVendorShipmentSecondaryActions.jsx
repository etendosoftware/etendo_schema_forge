import DocumentSecondaryActions from '@/windows/custom/shared/DocumentSecondaryActions';

/**
 * Adapts the shared `DocumentSecondaryActions` group to return-to-vendor-shipment
 * (ETP-5260 defect fix). Wired as `topbarSecondary` from
 * `windows/custom/return-to-vendor-shipment/index.jsx`, passed through
 * `ReturnWindowShell`'s `...pageProps` and the generated
 * `ReturnToVendorShipmentPage`'s own `{...props}` spread (both forward unknown
 * props unchanged, so no generator/decisions.json change was needed).
 *
 * Only Copy link — this window has no Clone or Send in its secondary group.
 * `clone: false` and `showSend: false` (the `DocumentSecondaryActions`
 * defaults) are passed explicitly so a future reader does not have to check
 * the defaults to know that's deliberate.
 *
 * ETP-4933 ZONE — `ConfirmWithCreditButtonBase` (a PRIMARY action available in
 * Borrador) stays in `topbarRight` via `ConfirmWithCreditButton.jsx`, to the
 * RIGHT of Save/Confirm. Do NOT move it into this component.
 */
export default function ReturnToVendorShipmentSecondaryActions(props) {
  return (
    <DocumentSecondaryActions
      {...props}
      windowName="return-to-vendor-shipment"
      clone={false}
      showSend={false}
      data-testid="ReturnToVendorShipmentSecondaryActions" />
  );
}
