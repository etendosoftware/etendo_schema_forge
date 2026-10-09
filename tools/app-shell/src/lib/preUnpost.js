/**
 * ETP-5302 — single home for the "reactivating a posted document reverses its accounting
 * first" rule.
 *
 * The rule is declared per window in `decisions.json` as `preUnpost: true` on the
 * `reactivate` menu action (sales-invoice, purchase-invoice, amortization). It used to be
 * implemented ONLY in the detail kebab (`DetailMoreActionsMenu.jsx`, and duplicated across
 * its two branches), so the SAME action behaved differently depending on where the user
 * ran it: reactivating a posted invoice from the form unposted it and succeeded, while
 * reactivating it from the list's bulk bar sent a bare `docAction: 'RE'` and the backend
 * rejected it with "Factura contabilizada". Two implementations of one rule is what let
 * them diverge, so there is now exactly one.
 *
 * Scope: this module covers the unpost step INSIDE a reactivation only. A standalone
 * "Descontabilizar" (unpost and stay Completed) is a separate, explicit menu/bulk action —
 * offered by the albarán windows and, since ETP-5692, by sales-invoice and purchase-invoice
 * too — that calls the same `unpost` endpoint directly and never goes through here. `isPosted`
 * below is the shared posted predicate both kinds of action gate on.
 *
 * Deliberately NOT a hook: `BulkDocumentAction` is rendered inside a `bulkActions` slot
 * that `ListView` invokes as a plain function call, so anything reached from there must
 * stay hook-free (see the ETP-5209 note in BulkDocumentAction.jsx).
 */

/** The AD "Posted status" domain stores `Y` for posted; every other value is not posted. */
export const isPosted = (row) => row?.posted === 'Y' || row?.posted === true;

/**
 * Reverses the accounting of an already-posted record before a reactivation runs.
 *
 * @param {object}   params
 * @param {string}   params.recordId  record to unpost
 * @param {object}   params.record    row/header data, read only for its `posted` flag
 * @param {boolean}  params.enabled   the action's `preUnpost` flag
 * @param {function} params.execute   `useNeoAction().execute` — resolves `{success, message}`
 * @returns {Promise<{ran: boolean, success: boolean, message?: string, messageKeys?: string[],
 *   messageParams?: object}>}
 *   `ran: false` when the step did not apply (not enabled, or the record was not posted);
 *   callers treat that as success and carry on to the document action. A failure carries the
 *   backend's `messageKeys` / `messageParams` (ETP-5692), so the caller translates the refusal by
 *   identity — pass `preUnpostErrorIdentity(result)` as `translateBackendError`'s options.
 */
export async function runPreUnpost({ recordId, record, enabled, execute }) {
  if (!enabled || !isPosted(record)) return { ran: false, success: true };
  const result = await execute(recordId, 'unpost');
  return {
    ran: true,
    success: Boolean(result?.success),
    message: result?.message,
    ...(result?.messageKeys ? { messageKeys: result.messageKeys } : {}),
    ...(result?.messageParams ? { messageParams: result.messageParams } : {}),
  };
}

/**
 * The `translateBackendError` options of a failed `runPreUnpost` (ETP-5692). A stale screen can
 * still show an invoice as posted after it was unposted elsewhere; its unpost is then refused with
 * a plain-English sentence whose only translatable part is the key.
 *
 * @param {{messageKeys?: string[], messageParams?: object}} pre the `runPreUnpost` result
 * @returns {{messageKeys?: string[], messageParams?: object}}
 */
export const preUnpostErrorIdentity = (pre) => ({
  messageKeys: pre?.messageKeys,
  messageParams: pre?.messageParams,
});
