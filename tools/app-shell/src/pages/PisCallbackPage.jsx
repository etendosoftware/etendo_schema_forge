import { useEffect } from 'react';
import { useUI } from '@/i18n';

/**
 * Throwaway page the Salt Edge PIS popup is returned to after the user authorizes the bank
 * transfer ({@code return_to} = this route, set by the Etendo Go PIS bridge). Unlike the AIS
 * connect callback it needs no account-selection modal — the "Add payment" modal already polls
 * the payment status and shows the success toast. So this page just relays a completion signal to
 * the opener and closes itself, keeping the user on the invoice instead of the Classic-styled
 * shared bank-auth result page.
 */
export default function PisCallbackPage() {
  const ui = useUI();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentId = params.get('payment_id') || params.get('paymentId');
    const errorClass = params.get('error_class') || params.get('errorClass');
    try {
      if (window.opener) {
        window.opener.postMessage(
          { type: 'pis-completed', paymentId, errorClass: errorClass || null },
          window.location.origin,
        );
      }
    } catch { /* ignore */ }
    const timer = setTimeout(() => {
      try { window.close(); } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 p-8 text-center">
      <p className="text-base font-medium text-[hsl(var(--foreground))]">{ui('paymentRegistered')}</p>
      <p className="text-sm text-[hsl(var(--muted-foreground))]">{ui('financeAccountsPsd2CallbackClose')}</p>
    </div>
  );
}
