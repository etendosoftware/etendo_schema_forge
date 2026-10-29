import { useEffect, useState } from 'react';
import { Loader2, LifeBuoy } from 'lucide-react';
import { useUI } from '@/i18n';
import { detectBasePath } from '@/lib/neoBaseUrl.js';
import {
  SUPPORT_HANDOFF_FAILURES,
  completeSupportHandoff,
  redeemPendingSupportTicket,
} from '@/lib/supportSession.js';

/**
 * ETP-5351 — where Classic's "Acceder como soporte" lands: `<app>/support-access#t=<ticket>`.
 *
 * The ticket was already taken out of the URL by `bootSupportSession` (main.jsx), before this page
 * rendered; this only redeems it and, on success, enters the app as the environment login does.
 * Every refusal — invalid, expired, already used, or no ticket at all (a reload of this page) —
 * reads the same: telling them apart would only help someone probing tickets.
 */
export default function SupportAccessPage() {
  const ui = useUI();
  const [failure, setFailure] = useState(null);

  useEffect(() => {
    let active = true;
    redeemPendingSupportTicket().then((result) => {
      if (result.ok) {
        // Deliberately not gated on `active`: the ticket is spent, so this session is the only
        // one there will be, whatever happened to this component meanwhile.
        completeSupportHandoff(result.data, { routerBase: detectBasePath().routerBase });
        return;
      }
      if (active) setFailure(result.reason);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!failure) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center"
        role="status"
        data-testid="support-access-redeeming"
      >
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" data-testid="Loader2__5351a1" />
        <p className="text-sm text-muted-foreground">{ui('supportAccessRedeeming')}</p>
      </div>
    );
  }

  const messageKey = failure === SUPPORT_HANDOFF_FAILURES.failed
    ? 'supportAccessFailedMessage'
    : 'supportAccessExpiredMessage';

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-2 p-6 text-center"
      role="alert"
      data-testid="support-access-error"
    >
      <span className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <LifeBuoy className="h-5 w-5" data-testid="LifeBuoy__5351a1" />
      </span>
      <p className="text-base font-medium text-foreground" data-testid="support-access-error-title">
        {ui('supportAccessUnavailableTitle')}
      </p>
      <p className="max-w-sm text-sm text-muted-foreground" data-testid="support-access-error-message">
        {ui(messageKey)}
      </p>
    </div>
  );
}
