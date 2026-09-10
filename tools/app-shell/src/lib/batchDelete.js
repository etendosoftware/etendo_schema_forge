import { toast } from 'sonner';

import { apiFetch } from '@etendosoftware/app-shell-core/auth/api';
import { translateBackendError } from '@/lib/backendErrors.js';
/**
 * ETP-4656 — shared, UI-agnostic core of the "checkbox selection → confirm →
 * batch delete → 3-outcome toast" pattern. Extracted once a 4th consumer
 * appeared (Financial Accounts main list, Movements tab, Statements tab —
 * ListView's `useBulkRowDelete` was the 1st) to stop copy-pasting the same
 * ~20 lines of Promise.allSettled triage + toast-outcome selection.
 *
 * Deliberately plain functions (no React, no dialog/selection state) so each
 * caller keeps full control of its own selection-state UI and `deleteOneFn`
 * (a REST DELETE for grid rows, `archiveAccount()` for financial accounts,
 * etc.) — see `useBatchDeleteDialog.jsx` for the React wrapper that adds the
 * confirm dialog + pending/deleting state on top of these.
 */

/**
 * Runs `deleteOneFn` for every item in parallel via `Promise.allSettled` and
 * partitions the original items back into `succeeded`/`failed` by index —
 * `Promise.allSettled` always preserves input order in its results array
 * regardless of which promise actually resolves first, so this is safe even
 * when requests settle out of order.
 *
 * Also returns `errors`, the rejection reason of each failure aligned with `failed` — without it
 * the outcome toast can only ever count failures, never say WHY (ETP-5085), and a user who
 * bulk-deletes a single undeletable row reads "None of the 1 selected could be deleted" with no
 * hint that the row is a funds-transfer leg. Purely additive: existing callers destructure
 * `succeeded`/`failed` and are unaffected.
 *
 * @param {Array<T>} items
 * @param {(item: T) => Promise<any>} deleteOneFn - must throw/reject on failure.
 * @returns {Promise<{succeeded: Array<T>, failed: Array<T>, errors: Array<any>}>}
 * @template T
 */
export async function runBatchDelete(items, deleteOneFn) {
  const results = await Promise.allSettled(items.map((item) => deleteOneFn(item)));
  const succeeded = [];
  const failed = [];
  const errors = [];
  results.forEach((result, idx) => {
    if (result.status === 'fulfilled') succeeded.push(items[idx]);
    else {
      failed.push(items[idx]);
      errors.push(result.reason);
    }
  });
  return { succeeded, failed, errors };
}

/**
 * Deletes selected child rows using the detail entity's configured endpoint.
 * Selection state and outcome handling remain with the calling component.
 */
export function deleteSelectedChildRows({ selectedChildRows, api, detailEntity, apiBaseUrl, token }) {
  return runBatchDelete(selectedChildRows, (row) => {
    const childUrl = api?.crud?.[detailEntity]?.detailUrl?.replace('{id}', row.id)
      || `${apiBaseUrl}/${detailEntity}/${row.id}`;
    return apiFetch(childUrl, { method: 'DELETE', baseUrl: '', token }).then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return row;
    });
  });
}

/** A bare `HTTP 409` / `409 Conflict` tells the user nothing they can act on, so it never qualifies
 *  as a reason — the counter-only message is better than a status code.
 *
 *  The second alternative covers the "one word plus the status" shape a message extractor emits
 *  when it could not find a message at all: `extractErrorMessage` (useEntity.js) ends in
 *  `` `${translate('error', 'Error')} ${res.status}` ``, i.e. literally "Error 404" for a 4xx with a
 *  non-JSON body such as a container error page. That reads as a reason to this helper but says
 *  nothing to the user, and — since no locale defines an `error` key — it is not even translated.
 *  ETP-5111 made this reachable app-wide by wiring `errors` through `useBulkRowDelete`, so it is
 *  screened here, once, rather than in each caller. A genuine business sentence never consists of a
 *  single word followed by a three-digit number and nothing else.
 *
 *  Both alternatives are anchored independently — `^` binds inside each, not across the `|` — so
 *  the second cannot match a status code buried mid-sentence. `/i` is needed only by the first
 *  alternative's `HTTP` literal; the second is all character classes, which fold no case. No `g`
 *  flag, deliberately: this is used with `.test()`, which would carry `lastIndex` between calls. */
const OPAQUE_REASON_RE = /^(HTTP\s*)?\d{3}\b|^\S+\s+\d{3}$/i;

/**
 * Is this rejection the backend REFUSING the delete for a stated business reason, as opposed to
 * something merely going wrong?
 *
 * Only a 4xx qualifies. `Promise.allSettled` catches every rejection alike — a dropped connection,
 * a `TypeError` from a bug in `deleteOneFn`, a 500 whose message is by design a log pointer
 * ("Please check logs for details") — and none of those say anything a user can act on; surfacing
 * their text would be worse than the count alone. A 4xx is the one case where the server answered
 * "no, because …" on purpose, so it requires `deleteOneFn` to reject with an error carrying
 * `status` (as `useCreateMovement.postAction` does).
 */
function isBusinessRejection(err) {
  return typeof err?.status === 'number' && err.status >= 400 && err.status < 500;
}

/**
 * The ONE reason to show alongside a failure count, or `null` when there isn't a single clear one.
 *
 * Reasons are translated through the same `translateBackendError` the per-row surfaces use, then
 * deduplicated: a batch that failed for several different reasons cannot be summarised in one
 * sentence, so it keeps the plain counter message rather than picking an arbitrary failure and
 * implying it explains all of them.
 */
function commonFailureReason(ui, errors) {
  const list = errors || [];
  if (!list.length) return null;
  const reasons = new Set();
  for (const err of list) {
    if (!isBusinessRejection(err)) return null;
    const raw = err.message?.trim();
    if (!raw || OPAQUE_REASON_RE.test(raw)) return null;
    reasons.add(translateBackendError(raw, ui));
  }
  return reasons.size === 1 ? [...reasons][0] : null;
}

/**
 * Fires exactly ONE toast for a batch-delete outcome, per the ETP-4656
 * Confluence design doc's 3-outcome table (not two stacked success+error
 * toasts — that was the older pattern every consumer, including
 * `DetailView.jsx`'s primary/secondary line-delete handlers, has since been
 * migrated to this shared helper):
 *   - all succeeded  -> success: "{count} deleted successfully."
 *   - partial        -> warning (single combined message): "X of Y deleted. Z could not be deleted."
 *   - all failed     -> error: "None of the X selected could be deleted."
 *
 * ETP-5085 added the missing half of the failure branches: **why**. ETP-5111 then narrowed it to
 * the only case where one sentence can honestly speak for the whole batch: a selection of exactly
 * ONE record, where the backend's own reason REPLACES the counter message ("None of the 1 selected
 * record(s) could be deleted" is a worse way of saying a sentence the backend already wrote).
 * From two records up, the toast is counters-only — appending a single reason to a multi-row batch
 * implied it explained every failure, and the user cannot tell which row it belonged to. Backends
 * that answer with a status code and nothing else keep the counter-only wording either way.
 *
 * Reuses the exact same i18n keys everywhere this fires so every bulk-delete
 * surface in the app reads identically.
 *
 * @param {(key: string, params?: object) => string} ui
 * @param {{succeeded: Array<any>, failed: Array<any>, total: number, errors?: Array<any>}} outcome
 */
export function toastBatchDeleteOutcome(ui, { succeeded, failed, total, errors }) {
  if (failed.length === 0) {
    toast.success(ui('bulkDeleteAllSucceeded', { count: succeeded.length }));
    return;
  }
  if (succeeded.length === 0) {
    // The reason is offered ONLY for a one-record selection (ETP-5111) — see the note above.
    const reason = total === 1 ? commonFailureReason(ui, errors) : null;
    toast.error(reason || ui('bulkDeleteAllFailed', { count: total }));
    return;
  }
  // A partial outcome implies at least two records, so it is always counters-only.
  toast.warning(ui('bulkDeletePartialFailure', {
    succeeded: succeeded.length, total, failed: failed.length,
  }));
}
