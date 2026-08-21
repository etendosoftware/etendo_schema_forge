import PaymentConciliadoBadge from './PaymentConciliadoBadge';
import PaymentRetryTransferButton from './PaymentRetryTransferButton';

/**
 * The payment window's topbar slot. Each child decides on its own whether it applies, so exactly
 * one of them renders for any given payment: reconciled payments get the "Conciliado" badge,
 * a payment whose bank transfer was rejected gets the retry action, and everything else gets
 * nothing.
 */
export default function PaymentTopbarActions({ specName, entity, ...props }) {
  return (
    <>
      <PaymentConciliadoBadge {...props} data-testid="PaymentConciliadoBadge__f8cfae" />
      {/* `props` carries DetailView's apiBaseUrl, which the retry needs to reach NEO. */}
      <PaymentRetryTransferButton
        specName={specName}
        entity={entity}
        {...props}
        data-testid="PaymentRetryTransferButton__f8cfae" />
    </>
  );
}
