import { useEffect } from 'react';
import { useUI } from '@/i18n';
import { BANK_CONNECTION_KEY } from '@/hooks/useBankConnectionActions';

/**
 * Throwaway page the Salt Edge popup is returned to after the bank authentication
 * ({@code return_to} = this route). It relays the {@code connection_id} back to the opener
 * window (the Accounts UI) via {@code postMessage} and {@code localStorage}, then closes itself.
 * The native account-selection + linking happen in the opener, not here.
 */
export default function BankConnectionCallbackPage() {
  const ui = useUI();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connectionId = params.get('connection_id') || params.get('connectionId');
    if (connectionId) {
      try {
        localStorage.setItem(BANK_CONNECTION_KEY, connectionId);
      } catch { /* ignore */ }
      try {
        if (window.opener) {
          window.opener.postMessage(
            { type: 'bank-connection-connected', connectionId },
            window.location.origin,
          );
        }
      } catch { /* ignore */ }
    }
    const timer = setTimeout(() => {
      try { window.close(); } catch { /* ignore */ }
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 p-8 text-center">
      <p className="text-base font-medium text-[hsl(var(--foreground))]">{ui('financeAccountsBankConnectionCallbackDone')}</p>
      <p className="text-sm text-[hsl(var(--muted-foreground))]">{ui('financeAccountsBankConnectionCallbackClose')}</p>
    </div>
  );
}
