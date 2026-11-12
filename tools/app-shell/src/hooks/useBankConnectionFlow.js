import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import { translateBackendError } from '@/lib/backendErrors.js';
import { useBankConnectionActions, launchSaltEdgePopup } from './useBankConnectionActions';
import { usePsd2ImportSettingsFlag } from './usePsd2ImportSettingsFlag.js';

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
 *   confirmSelection: (saltEdgeAccountId: string,
 *     importSettings: { importFromDate: string, statementGrouping: string }) => Promise<void>,
 *   cancelSelection: () => void,
 * }}
 */
/**
 * ETP-5179 — i18n key per empty-list reason reported by the bridge.
 *
 * `noAccounts` is deliberately absent: the bank returned nothing at all, which the generic label
 * already describes. Any reason not listed here (an older or newer backend) also degrades to it.
 */
const NO_ACCOUNTS_REASON_KEYS = {
  currencyMismatch: 'financeAccountsBankConnectionNoAccountsCurrency',
  typeMismatch: 'financeAccountsBankConnectionNoAccountsType',
  allLinked: 'financeAccountsBankConnectionNoAccountsAllLinked',
};

/** Maps the bridge's empty-list diagnosis to a user-facing i18n message. */
function noAccountsMessage(emptyReason, accountCurrency, ui) {
  const key = NO_ACCOUNTS_REASON_KEYS[emptyReason];
  const generic = 'financeAccountsBankConnectionNoAccounts';
  if (!key) return ui(generic);
  if (emptyReason !== 'currencyMismatch') return ui(key);
  // The bridge guards the currency with isNotBlank and omits the field when it resolves to
  // nothing, so a currencyMismatch can in principle arrive without one. Mirror that guard here:
  // useUI interpolates with String.replace, which would render a literal "undefined" inside the
  // sentence. A correct generic message beats a specific one with a hole in it.
  if (!accountCurrency) return ui(generic);
  return ui(key, { currency: accountCurrency });
}

/** The text of every warning advisory a link/createAndLink response carries (ETP-6151). */
function linkAdvisories(result) {
  const messages = Array.isArray(result?.messages) ? result.messages : [];
  return messages
    .filter((m) => String(m?.type || '').toLowerCase() === 'warning' && m?.text)
    .map((m) => m.text);
}

/** Maps a connect-flow error to a user-facing i18n message. */
function connectErrorMessage(err, ui) {
  if (err.message === 'POPUP_BLOCKED') return ui('financeAccountsBankConnectionPopupBlocked');
  if (err.message === 'BANK_CONNECTION_TIMEOUT') return ui('financeAccountsBankConnectionTimeout');
  return err.message || ui('financeAccountsBankConnectionConnectError');
}

export function useBankConnectionFlow({ onDone } = {}) {
  const ui = useUI();
  const { connect, fetchAccounts, link, createAndLink } = useBankConnectionActions();
  // ETP-6151 — flag `psd2-statement-import-settings`. Off: the link payload carries only the
  // account, no bank limit reaches the modal and no advisory toast is shown, as before.
  const importSettingsEnabled = usePsd2ImportSettingsFlag();
  const [connecting, setConnecting] = useState(false);
  const [selection, setSelection] = useState(null);

  const applyLink = useCallback(async (ctx, connectionId, saltEdgeAccountId, importSettings) => {
    // ETP-6151 — the bridge requires both and stores them in the same transaction as the link, so
    // no sync (not even the scheduled one) can run on the new connection without a lower bound.
    const { importFromDate, statementGrouping } = importSettings ?? {};
    const settingsPayload = importSettingsEnabled ? { importFromDate, statementGrouping } : {};
    try {
      const result = ctx.mode === 'create'
        ? await createAndLink({
          type: ctx.type, connectionId, saltEdgeAccountId, ...settingsPayload,
        })
        : await link({
          financialAccountId: ctx.account.id, connectionId, saltEdgeAccountId, ...settingsPayload,
        });
      if (result?.warning) {
        // ETP-4406/ETP-4891 warning surface: com.etendoerp.psd2 ships ~108 AD_Message rows with no
        // real es_ES translation (the trl row is a verbatim copy of the English text — see
        // backendErrors.js's PSD2_IBANAutoFillFailed entry), so Core always resolves English here
        // regardless of session locale. Route it through the same frontend translation map every
        // other untranslated backend message already uses instead of toasting it raw.
        toast.warning(translateBackendError(result.warning, ui));
      }
      // ETP-6151 — the bridge's non-blocking advisories (NeoHints, already localized), e.g. the
      // "Importar desde" date reaches further back than this bank serves. The modal can only warn
      // before confirming when `accounts` published the bank's limit, which it does not for a bank
      // never linked on this instance; this covers that case after the link.
      if (importSettingsEnabled) {
        linkAdvisories(result).forEach((text) => toast.warning(translateBackendError(text, ui)));
      }
      toast.success(ui('financeAccountsBankConnectionSuccess'));
      onDone?.();
    } catch (err) {
      // The bridge's 400s (missing/invalid import date or grouping, inverted range) are mapped in
      // backendErrors.js; anything unmapped is shown as the bridge wrote it.
      // Flag off: the raw message, as before ETP-6151.
      const message = importSettingsEnabled && err.message
        ? translateBackendError(err.message, ui)
        : err.message;
      toast.error(message || ui('financeAccountsBankConnectionLinkError'));
    }
  }, [createAndLink, link, onDone, ui, importSettingsEnabled]);

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
      const {
        accounts, providerName, providerLogoUrl, emptyReason, accountCurrency, maxFetchInterval,
      } = await fetchAccounts(connectionId, type, accountId);
      if (accounts.length === 0) {
        toast.error(noAccountsMessage(emptyReason, accountCurrency, ui));
        return;
      }
      // Always show the selection modal — even with a single account — so the user explicitly
      // confirms which account to link rather than it being linked silently.
      // `maxFetchInterval` lets the modal warn before confirming when "Importar desde" reaches
      // further back than this bank serves (ETP-6151).
      setSelection({
        ...ctx, connectionId, accounts, providerName, providerLogoUrl,
        ...(importSettingsEnabled ? { maxFetchInterval } : {}),
      });
    } catch (err) {
      toast.error(err.message || ui('financeAccountsBankConnectionConnectError'));
    } finally {
      setConnecting(false);
    }
  }, [connect, fetchAccounts, applyLink, ui, importSettingsEnabled]);

  const startConnect = useCallback((account) => run({ mode: 'link', account }), [run]);
  const startCreate = useCallback((type) => run({ mode: 'create', type }), [run]);

  const confirmSelection = useCallback(async (saltEdgeAccountId, importSettings) => {
    if (!selection) return;
    const ctx = selection;
    setSelection(null);
    await applyLink(ctx, ctx.connectionId, saltEdgeAccountId, importSettings);
  }, [selection, applyLink]);

  const cancelSelection = useCallback(() => setSelection(null), []);

  return { startConnect, startCreate, connecting, selection, confirmSelection, cancelSelection };
}
