import GeneratedApp from '@generated/payment-out/generated/web/payment-out/index.jsx';

/**
 * `saveActionsFirst` puts **Guardar** to the left of **Confirmar**, so the primary action is the
 * right-most button — the payment toolbar rendered them the other way round. Order only: this
 * window does not opt into `saveBeforeProcesses` (its header has no editable form to flush).
 */
export default function PaymentOutWindow(props) {
  return (
    <GeneratedApp
      {...props}
      secondaryTabs={[]}
      saveActionsFirst
      data-testid="GeneratedApp__608fd4" />
  );
}
