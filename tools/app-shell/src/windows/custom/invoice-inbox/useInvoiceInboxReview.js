import { useCallback, useEffect, useRef, useState } from 'react';
import { isNetworkError } from '@etendosoftware/app-shell-core/auth';
import { fetchReview } from './invoiceInboxApi.js';
import { reviewErrorKey } from './invoiceInboxReviewModel.js';

function isAbort(err) {
  return err?.name === 'AbortError';
}

/**
 * ETP-6050 — loads the document the review panel shows (`GET /header/{id}/action/review`).
 *
 * `review` is the last answer for the CURRENT `id` (it is cleared the moment `id` changes, so the
 * panel never shows the previous document under the new header). An answer that arrives after the
 * id changed or the panel closed is ignored (abort + request token). A failure leaves
 * `errorKey` (a `genericLabels` key, translated by the code: a 409 `processing` while the
 * document is still being read, `not_found`, `feature_disabled`…) or `errorText` (a network error,
 * whose message is already translated); `reload` retries.
 *
 * @param {Function} apiFetch from `useApiFetch(apiBaseUrl)`
 * @param {string|null} id document to read; null keeps the hook idle
 * @returns {{review: object|null, loading: boolean, errorKey: string|null,
 *   errorText: string|null, reload: () => void}}
 */
export function useInvoiceInboxReview(apiFetch, id) {
  const [state, setState] = useState({ id: null, review: null, loading: false, errorKey: null, errorText: null });
  const abortRef = useRef(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    if (!id) {
      abortRef.current = null;
      setState({ id: null, review: null, loading: false, errorKey: null, errorText: null });
      return;
    }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState({ id, review: null, loading: true, errorKey: null, errorText: null });
    try {
      const outcome = await fetchReview(apiFetch, id, ctrl.signal);
      if (abortRef.current !== ctrl) return;
      if (outcome.status === 'ok') {
        setState({ id, review: outcome.review, loading: false, errorKey: null, errorText: null });
      } else {
        setState({ id, review: null, loading: false, errorKey: reviewErrorKey(outcome.code), errorText: null });
      }
    } catch (err) {
      if (isAbort(err) || abortRef.current !== ctrl) return;
      const errorText = isNetworkError(err) ? err.message : null;
      setState({ id, review: null, loading: false, errorKey: errorText ? null : reviewErrorKey(null), errorText });
    }
  }, [apiFetch, id]);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  // A render between a new `id` and the effect must not show the previous document.
  const current = state.id === id;
  return {
    review: current ? state.review : null,
    loading: Boolean(id) && (!current || state.loading),
    errorKey: current ? state.errorKey : null,
    errorText: current ? state.errorText : null,
    reload: load,
  };
}
