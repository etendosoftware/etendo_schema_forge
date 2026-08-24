import GeneratedApp from '@generated/payment-in/generated/web/payment-in/index.jsx';

/**
 * Payment In's only reason to exist as a custom wrapper: `saveActionsFirst`, which puts
 * **Guardar** to the left of **Confirmar** so the primary action is the right-most button.
 * Order only — this window does not opt into `saveBeforeProcesses` (its header has no editable
 * form to flush). Mirrors `custom/payment-out/index.jsx`.
 */
export default function PaymentInWindow(props) {
  return (
    <GeneratedApp
      {...props}
      saveActionsFirst
      data-testid="GeneratedApp__payment-in" />
  );
}
