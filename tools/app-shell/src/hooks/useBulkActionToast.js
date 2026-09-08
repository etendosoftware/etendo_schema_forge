import { useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';

const STORAGE_KEY = 'bulkActionResult';

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

function showBulkActionToast(ui, result) {
  const { ok, omitted, failed } = normalizeBulkActionResult(result);
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
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeBulkActionResult(result)));
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
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    sessionStorage.removeItem(STORAGE_KEY);
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
