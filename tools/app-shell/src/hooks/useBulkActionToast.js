import { useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import { translateBackendError } from '@/lib/backendErrors.js';

const STORAGE_KEY = 'bulkActionResult';

/**
 * Same guard as `lib/listViewSession.js`: with site data blocked (strict private
 * mode, corporate policy) reading the `sessionStorage` ACCESSOR throws, not just
 * its methods. This hook runs inside ListView's render tree, so an unguarded
 * access takes the whole grid down instead of degrading to "no persisted toast".
 */
function session() {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function normalizeBulkActionResult(result) {
  return {
    ok: Number(result?.ok || 0),
    // ETP-5209 — rows pre-blocked by a `rowFilter` (not eligible, never sent to the
    // API) are reported separately from `failed` (rows the API actually rejected).
    // Consumers that never pass a `rowFilter` (the pre-existing book/reactivate
    // actions) simply never populate this, so it normalizes to an empty array.
    omitted: Array.isArray(result?.omitted) ? result.omitted : [],
    failed: Array.isArray(result?.failed) ? result.failed : [],
  };
}

// ETP-5302 — exported so a caller that already holds a `useUI()` result can show the
// toast immediately, without mounting `useBulkActionToast()` itself. Mounting the hook
// just to reach `showResult` also installs its sessionStorage-draining effect, which
// re-runs whenever `ui` changes identity and would consume the caller's own persisted
// result before a fallback reload could hand it to the next mount.
export function showBulkActionToast(ui, result) {
  const { ok, omitted, failed } = normalizeBulkActionResult(result);

  // ETP-5316 — exactly one record was selected (nothing else attempted, nothing
  // omitted) and its confirmation failed. The generic "0 processed / 1 failed"
  // summary hides the one thing the user needs — the real backend error — so show
  // it directly instead of the templated count message. `ok > 0` or
  // `omitted.length > 0` means more than one row was actually selected, so those
  // stay on the generic/mixed path below.
  if (failed.length === 1 && ok === 0 && omitted.length === 0) {
    // `messageKeys` (ETP-5316) lets a core document-action failure be resolved by AD_MESSAGE key
    // rather than by its text — the text carries AD line numbers (10, 20, 30…) that match no
    // literal and point at nothing the user can find in the document. Absent against a backend
    // that does not send them, in which case this is the pre-existing text-only translation.
    toast.error(
      translateBackendError(failed[0].message, ui, { messageKeys: failed[0].messageKeys })
      || ui('actionFailed'),
    );
    return;
  }

  // Backward compatible: when nothing was omitted (every consumer that doesn't pass
  // a `rowFilter`, plus a clean run of one that does), the message stays the plain
  // 2-number "processExecuted" wording — no redundant "0 omitted" clause cluttering
  // the common case.
  const msg = omitted.length === 0
    ? ui('processExecuted')
      .replace('{ok}', String(ok))
      .replace('{failed}', String(failed.length))
    : ui('processExecutedWithOmitted')
      .replace('{ok}', String(ok))
      .replace('{omitted}', String(omitted.length))
      .replace('{failed}', String(failed.length));
  // ETP-5316 QA rejection — a mass/multi-record action must NEVER surface a
  // per-row backend error as toast `description`: it doesn't scale past a
  // handful of rows and the raw messages (e.g. line-number references) aren't
  // locatable in the document from a toast anyway. Only the exact single-record
  // fast path above may show a real backend error; every multi/mixed case below
  // stays the plain generic count summary, no description.
  if (failed.length === 0 && omitted.length === 0) {
    toast.success(msg);
  } else if (failed.length > 0 && ok === 0 && omitted.length === 0) {
    // Nothing was skipped and nothing succeeded — every attempted row genuinely
    // errored. Same "hard failure" case the original 2-number logic covered.
    toast.error(msg);
  } else {
    // Everything else is a mix: some ok/omitted/failed combination that is neither
    // a clean full success nor a hard full failure — including the "0 ok, some
    // omitted, 0 failed" case (nothing eligible, but nothing genuinely errored).
    toast.warning(msg);
  }
}

export function persistBulkActionResult(result) {
  const store = session();
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(normalizeBulkActionResult(result)));
  } catch {
    // Quota exceeded or storage blocked — the toast just won't survive the
    // navigation. Never a reason to fail the bulk action that already ran.
  }
}

export function useBulkActionToast() {
  const ui = useUI();

  const showResult = useCallback((result, { persist = false } = {}) => {
    if (persist) {
      persistBulkActionResult(result);
    }
    showBulkActionToast(ui, result);
  }, [ui]);

  useEffect(() => {
    const store = session();
    if (!store) return;
    let stored;
    try {
      stored = store.getItem(STORAGE_KEY);
      if (!stored) return;
      store.removeItem(STORAGE_KEY);
    } catch {
      // Storage unreadable: there is no pending toast to replay. Returning here
      // is what keeps the failure local instead of unmounting the list.
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(stored);
    } catch {
      return;
    }
    showBulkActionToast(ui, parsed);
  }, [ui]);

  return { showResult };
}
