import { AlertTriangle } from 'lucide-react';
import { useUI } from '@/i18n';
import { ACCOUNT_TYPE } from './tokens';
import { canConnectToSaltEdge } from './saltEdgeEligibility.js';

/**
 * Inline secondary line under the account name.
 *
 * - Cash accounts (`type=C`) never show a sync line per Figma `3012:25602`.
 * - Accounts with an active bank connection (`bankConnected === true`) show
 *   "Sincronizado hace X" in green.
 * - Pending accounts surface a warning treatment.
 * - Default state (no connection data, as in T1 before ETP-4097) renders the
 *   underlined "Conectar banco" CTA per Figma — inert in T1.
 */
export function SyncStatusInline({ account, onConnect }) {
  const ui = useUI();

  if (!account || account.type === ACCOUNT_TYPE.CASH) {
    return null;
  }

  if (account.bankConnectionPending) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-[var(--status-warning-fg)]">
        <AlertTriangle className="h-3 w-3" data-testid="AlertTriangle__8e9c56" />
        {ui('financeAccountsSyncPending')}
      </span>
    );
  }

  if (account.bankConnected === true) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-[var(--status-success-fg)]">
        <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[var(--status-success-fg)]" aria-hidden="true" />
        {ui('financeAccountsSyncedJustNow')}
      </span>
    );
  }

  // ETP-4896: Salt Edge is contracted for Spain only. A non-ES account shows no connect link at
  // all — this cell is a bare inline affordance with nowhere to explain a disabled state, so the
  // rule is surfaced (with its reason) in the edit modal instead, next to the Country field.
  // Rule owned by saltEdgeEligibility.js.
  if (!canConnectToSaltEdge(account)) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onConnect?.(); }}
      data-testid={`account-sync-connect-${account.id}`}
      className="w-fit text-sm font-medium leading-6 text-[hsl(var(--foreground))] underline underline-offset-2"
    >
      {ui('financeAccountsConnectBank')}
    </button>
  );
}
