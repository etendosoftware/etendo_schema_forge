import { useEffect } from 'react';
import { useUI } from '@/i18n';
import { PSD2_CONNECTION_KEY } from '@/hooks/usePsd2Actions';

/**
 * Throwaway page the Salt Edge popup is returned to after the bank authentication
 * ({@code return_to} = this route). It relays the {@code connection_id} back to the opener
 * window (the Accounts UI) via {@code postMessage} and {@code localStorage}, then closes itself.
 * The native account-selection + linking happen in the opener, not here.
 */
export default function Psd2CallbackPage() {
  const ui = useUI();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connectionId = params.get('connection_id') || params.get('connectionId');
    if (connectionId) {
      try {
        localStorage.setItem(PSD2_CONNECTION_KEY, connectionId);
      } catch { /* ignore */ }
      try {
        if (window.opener) {
          window.opener.postMessage(
            { type: 'psd2-connected', connectionId },
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
      <p className="text-base font-medium text-[#121217]">{ui('financeAccountsPsd2CallbackDone')}</p>
      <p className="text-sm text-[#6C6C89]">{ui('financeAccountsPsd2CallbackClose')}</p>
    </div>
  );
}
