import { toast } from 'sonner';
import { translateBackendError } from '@/lib/backendErrors.js';

const BANK_CONNECTION_TIMEOUT = 'BANK_CONNECTION_TIMEOUT';

/**
 * ETP-6154 — the ONE place that turns a PSD2 bank-sync outcome into a toast.
 *
 * It replaces three hand-copied handlers (the accounts list row, the Edit account modal and the
 * Imported statements tab) that had drifted apart: the list announced a WARNING with `toast.info`
 * and the statements tab showed `BANK_CONNECTION_TIMEOUT` raw. Every sync entry point now reports
 * through here, via `BankSyncContext`.
 *
 * Why the message is translated at all: every string the bridge relays ORIGINATES IN THE BACKEND —
 * com.etendoerp.psd2's AD_MESSAGE catalog, whose es_ES rows carry the English text unless the
 * separate `.es_es` pack was imported (ETP-4891) — so it goes through the frontend translation map.
 * `BANK_CONNECTION_TIMEOUT` (the client's own timeout sentinel) is mapped there too, and so are
 * the codes `BANK_SYNC_LOCK_UNAVAILABLE` (a retryable refusal) and
 * `BANK_SYNC_DUPLICATE_CHECK_FAILED` (on an ERROR or WARNING result: some transactions were
 * skipped because the duplicate check failed).
 *
 * Precedence, the same for every code: a message that the map knows word for word is shown in its
 * own translation; any other prose (English, or already translated by the server) gives way to the
 * code's label, so the raw text of a coded result is never shown.
 */

/**
 * Translates the message (or, when there is none, the code) of a bank-sync outcome.
 *
 * @param {string|null|undefined} message prose relayed by the bridge, or an Error message
 * @param {string|null|undefined} code stable failure code, when the bridge sent one
 * @param {Function} ui the `ui` function from `useUI()`
 * @returns {string|null|undefined} the text to show; falsy when there is nothing to say
 */
export function translateBankSyncMessage(message, code, ui) {
  const raw = message || code;
  if (!raw) return raw;
  const translated = translateBackendError(raw, ui, code ? { code } : {});
  // Protocol tokens must never reach the user. translateBackendError hands the input back when the
  // label it maps to is missing from the dictionary, so the guard is repeated here: the timeout
  // sentinel still gets its own label, and a bare code yields nothing (the caller's generic text).
  if (translated === BANK_CONNECTION_TIMEOUT) return ui('financeAccountsBankConnectionTimeout');
  if (!message && translated === code) return null;
  return translated;
}

/**
 * Shows the toast for a FINISHED sync — or, for `IN_PROGRESS`, the notice that one is already
 * running and this request joined it.
 *
 * - `ERROR` → `toast.error`
 * - `WARNING` → `toast.warning` (ETP-5181: the sync completed, but something needs the user's
 *   attention — typically an import range reaching past the provider's max fetch interval — which
 *   `toast.info` under-sells)
 * - `IN_PROGRESS` → `toast.info` with our own wording, never the bridge's
 * - anything else (`OK`, a missing status) → `toast.success`
 *
 * @param {{status?: string, message?: string, code?: string}|null|undefined} result
 * @param {Function} ui the `ui` function from `useUI()`
 */
export function notifyBankSyncResult(result, ui) {
  const status = result?.status;
  if (status === 'IN_PROGRESS') {
    toast.info(ui('financeAccountsBankSyncInProgress'));
    return;
  }
  const msg = translateBankSyncMessage(result?.message, result?.code, ui);
  if (status === 'ERROR') {
    toast.error(msg || ui('financeAccountsBankConnectionSyncError'));
  } else if (status === 'WARNING') {
    toast.warning(msg || ui('financeAccountsBankConnectionSyncDone'));
  } else {
    toast.success(msg || ui('financeAccountsBankConnectionSyncDone'));
  }
}

/**
 * Shows the toast for a sync request that THREW (network failure, HTTP error, client timeout)
 * instead of answering with a status.
 *
 * @param {Error|null|undefined} err
 * @param {Function} ui the `ui` function from `useUI()`
 */
export function notifyBankSyncError(err, ui) {
  notifyBankSyncResult({ status: 'ERROR', message: err?.message, code: err?.code }, ui);
}
