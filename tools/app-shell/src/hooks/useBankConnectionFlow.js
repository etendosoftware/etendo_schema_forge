import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import { useBankConnectionActions, launchSaltEdgePopup } from './useBankConnectionActions';

/**
 * Orchestrates the Salt Edge connect flow for both entry cases, keeping the popup open inside the
 * triggering user gesture (required so the browser does not block it):
 *
 *  - {@code startConnect(account)} — case 1: link the chosen bank account to an existing FA.
 *  - {@code startCreate(type)} — case 2: create the FA from the chosen bank account, then link.
 *
 * After the popup authenticates and relays the connection id, the found bank accounts are fetched
 * and filtered by the bridge: 0 → error toast, 1 → linked automatically, >1 → the native selection
 * modal is opened ({@code selection}) and {@code confirmSelection} finishes the link.
 *
 * @param {{ onDone?: () => void }} options callback fired after a successful link/create
 * @returns {{
 *   startConnect: (account: object) => Promise<void>,
 *   startCreate: (type: string) => Promise<void>,
 *   connecting: boolean,
 *   selection: object|null,
 *   confirmSelection: (saltEdgeAccountId: string) => Promise<void>,
 *   cancelSelection: () => void,
 * }}
 */
/** Maps a connect-flow error to a user-facing i18n message. */
function connectErrorMessage(err, ui) {
  if (err.message === 'POPUP_BLOCKED') return ui('financeAccountsBankConnectionPopupBlocked');
  if (err.message === 'BANK_CONNECTION_TIMEOUT') return ui('financeAccountsBankConnectionTimeout');
  return err.message || ui('financeAccountsBankConnectionConnectError');
}

export function useBankConnectionFlow({ onDone } = {}) {
  const ui = useUI();
  const { connect, fetchAccounts, link, createAndLink } = useBankConnectionActions();
  const [connecting, setConnecting] = useState(false);
  const [selection, setSelection] = useState(null);

  const applyLink = useCallback(async (ctx, connectionId, saltEdgeAccountId) => {
    try {
      const result = ctx.mode === 'create'
        ? await createAndLink({ type: ctx.type, connectionId, saltEdgeAccountId })
        : await link({ financialAccountId: ctx.account.id, connectionId, saltEdgeAccountId });
      if (result?.warning) {
        toast.warning(result.warning);
      }
      toast.success(ui('financeAccountsBankConnectionSuccess'));
      onDone?.();
    } catch (err) {
      toast.error(err.message || ui('financeAccountsBankConnectionLinkError'));
    }
  }, [createAndLink, link, onDone, ui]);

  const run = useCallback(async (ctx) => {
    let connectionId;
    setConnecting(true);
    try {
      // Existing account (case 1): pass its id so the bridge preselects the account's known bank.
      const connectAccountId = ctx.mode === 'link' ? ctx.account.id : undefined;
      connectionId = await launchSaltEdgePopup(() => connect(connectAccountId));
    } catch (err) {
      setConnecting(false);
      toast.error(connectErrorMessage(err, ui));
      return;
    }
    if (!connectionId) {
      // User closed the popup without finishing — nothing was created (case 2) or linked (case 1).
      setConnecting(false);
      return;
    }
    try {
      const type = ctx.mode === 'create' ? ctx.type : ctx.account.type;
      const accountId = ctx.mode === 'link' ? ctx.account.id : undefined;
      const { accounts, providerName, providerLogoUrl } = await fetchAccounts(connectionId, type, accountId);
      if (accounts.length === 0) {
        toast.error(ui('financeAccountsBankConnectionNoAccounts'));
        return;
      }
      // Always show the selection modal — even with a single account — so the user explicitly
      // confirms which account to link rather than it being linked silently.
      setSelection({ ...ctx, connectionId, accounts, providerName, providerLogoUrl });
    } catch (err) {
      toast.error(err.message || ui('financeAccountsBankConnectionConnectError'));
    } finally {
      setConnecting(false);
    }
  }, [connect, fetchAccounts, applyLink, ui]);

  const startConnect = useCallback((account) => run({ mode: 'link', account }), [run]);
  const startCreate = useCallback((type) => run({ mode: 'create', type }), [run]);

  const confirmSelection = useCallback(async (saltEdgeAccountId) => {
    if (!selection) return;
    const ctx = selection;
    setSelection(null);
    await applyLink(ctx, ctx.connectionId, saltEdgeAccountId);
  }, [selection, applyLink]);

  const cancelSelection = useCallback(() => setSelection(null), []);

  return { startConnect, startCreate, connecting, selection, confirmSelection, cancelSelection };
}
