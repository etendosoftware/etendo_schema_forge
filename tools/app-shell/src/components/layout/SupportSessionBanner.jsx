import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LifeBuoy, Loader2, LogOut } from 'lucide-react';
import { whenSessionRevokeSettles } from '@etendosoftware/app-shell-core/auth';
import { Button } from '@/components/ui/button';
import { useLocaleSwitch, useUI } from '@/i18n';
import { useLogout } from '@/auth/useLogout.js';
import { useSupportSession } from '@/hooks/useSupportSession.js';
import { formatSupportExpiry } from '@/lib/supportSession.js';
import { cn } from '@/lib/utils.js';

/**
 * ETP-5351 — the strip that says, on every screen, that this is not the customer: who the operator
 * is acting as, in which company, and until when. Renders nothing outside a support session.
 *
 * Not dismissible on purpose. It is the only on-screen trace that the changes being made will be
 * signed by "Soporte Etendo", so it cannot be closed the way an `InfoBanner` can; it reuses that
 * banner's `status-info` tokens and the full-width strip layout of the trial indicator (TopBar).
 *
 * "Salir" is the ordinary logout. It waits for the server to revoke the session before closing the
 * tab — closing first could cancel the revoke and leave the support session alive until it
 * expires. The tab Classic opened can be closed by script; one opened any other way cannot, so the
 * login page is reached first and stays as the fallback.
 */
export function SupportSessionBanner({ className }) {
  const { isSupportMode, supportSession } = useSupportSession();
  // Split so that outside a support session — every session but one — the banner reads nothing
  // but the store: no router, locale or logout wiring is touched where it renders nothing.
  if (!isSupportMode) return null;
  return <SupportSessionStrip supportSession={supportSession} className={className} data-testid="SupportSessionStrip__5351b2" />;
}

function SupportSessionStrip({ supportSession, className }) {
  const ui = useUI();
  const { locale } = useLocaleSwitch();
  const navigate = useNavigate();
  const logout = useLogout();
  const [leaving, setLeaving] = useState(false);

  const clientName = supportSession?.clientName;
  const expiry = formatSupportExpiry(supportSession?.expiresAt, locale);

  const handleExit = async () => {
    setLeaving(true);
    logout();
    await whenSessionRevokeSettles();
    navigate('/login', { replace: true });
    window.close();
  };

  return (
    <div
      role="region"
      aria-label={ui('supportModeBannerLabel')}
      className={cn(
        'flex w-full shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2 text-sm sm:px-6',
        'border-status-info-border bg-status-info text-status-info-foreground',
        className,
      )}
      data-testid="support-mode-banner"
    >
      {/* 375px: the expiry drops under the message instead of squeezing it; side by side from sm. */}
      <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
        <LifeBuoy className="mt-0.5 h-4 w-4 shrink-0 sm:mt-0" aria-hidden="true" data-testid="LifeBuoy__5351b2" />
        <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
          <p className="min-w-0 break-words font-semibold" data-testid="support-mode-banner-message">
            {clientName
              ? ui('supportModeBannerMessage', { clientName })
              : ui('supportModeBannerMessageNoClient')}
          </p>
          {expiry && (
            <span className="shrink-0 text-xs" data-testid="support-mode-banner-expiry">
              {ui('supportModeBannerExpiry', { time: expiry })}
            </span>
          )}
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleExit}
        disabled={leaving}
        className="shrink-0"
        data-testid="support-mode-exit"
      >
        {leaving
          ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" data-testid="Loader2__5351b2" />
          : <LogOut className="h-3.5 w-3.5 mr-2" data-testid="LogOut__5351b2" />}
        {ui('supportModeExit')}
      </Button>
    </div>
  );
}

export default SupportSessionBanner;
