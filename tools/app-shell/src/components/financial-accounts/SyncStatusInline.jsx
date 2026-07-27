import { AlertTriangle } from 'lucide-react';
import { useUI } from '@/i18n';
import { ACCOUNT_TYPE } from './tokens';

/**
 * Inline secondary line under the account name.
 *
 * - Cash accounts (`type=C`) never show a sync line per Figma `3012:25602`.
 * - Accounts with an active PSD2 connection (`psd2Connected === true`) show
 *   "Sincronizado hace X" in green.
 * - Pending accounts surface a warning treatment.
 * - Default state (no PSD2 data, as in T1 before ETP-4097) renders the
 *   underlined "Conectar PSD2" CTA per Figma — inert in T1.
 */
export function SyncStatusInline({ account, onConnect }) {
  const ui = useUI();

  if (!account || account.type === ACCOUNT_TYPE.CASH) {
    return null;
  }

  if (account.psd2Pending) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-[var(--status-warning-fg)]">
        <AlertTriangle className="h-3 w-3" data-testid="AlertTriangle__8e9c56" />
        {ui('financeAccountsSyncPending')}
      </span>
    );
  }

  if (account.psd2Connected === true) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-[var(--status-success-fg)]">
        <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[var(--status-success-fg)]" aria-hidden="true" />
        {ui('financeAccountsSyncedJustNow')}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onConnect?.(); }}
      data-testid={`account-sync-connect-${account.id}`}
      className="w-fit text-sm font-medium leading-6 text-[hsl(var(--foreground))] underline underline-offset-2"
    >
      {ui('financeAccountsConnectPsd2')}
    </button>
  );
}
