import { useCallback } from 'react';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { buildUrlWithParams } from '@/lib/buildUrlWithParams.js';
import { SEARCH_POPUP_PAGE_SIZE } from './SearchPopup.jsx';

/**
 * The label a selector item is shown with — the same fallback chain the lookup fields use when
 * they store the picked item's `$_identifier`.
 *
 * @param {{label?: string, name?: string, _identifier?: string, id: string}} item
 * @returns {string}
 */
export function selectorItemLabel(item) {
  return item.label || item.name || item._identifier || item.id;
}

/**
 * The `SearchPopup` page loader over an account field's NEO selector (`.../selectors/{column}`):
 * server-side search (`q`) and paging (`limit` / `offset`), each item named with
 * `selectorItemLabel`. The ValidCombination selector already lists posting accounts only
 * (`PostingAccountCombinationSelectorPolicy` in com.etendoerp.go).
 *
 * Shared by `AccountLookupPopup` (the `account` lookup drawer) and by any `AccountSelect` fed by
 * a selector instead of a static catalog (its `loadPage` prop) — ETP-5791.
 *
 * @param {string|null} selectorUrl — the field's selector endpoint (absolute or `/sws/...`)
 * @param {object} [selectorContext] — extra query params sent with every request
 * @returns {(query: string, offset: number, signal?: AbortSignal) => Promise<{items: object[], hasMore: boolean}>}
 */
export function useAccountSelectorPages(selectorUrl, selectorContext) {
  const apiFetch = useApiFetch();
  return useCallback(async (query, offset, signal) => {
    if (!selectorUrl) return { items: [], hasMore: false };
    const params = { ...(selectorContext || {}), limit: SEARCH_POPUP_PAGE_SIZE, offset };
    if (query) params.q = query;
    const res = await apiFetch(buildUrlWithParams(selectorUrl, params), { baseUrl: '', signal });
    if (!res.ok) throw new Error(`Account selector request failed: ${res.status}`);
    const data = await res.json();
    const raw = Array.isArray(data) ? data : (data?.items ?? []);
    return {
      items: raw.map((item) => ({ ...item, name: selectorItemLabel(item) })),
      hasMore: Array.isArray(data) ? false : Boolean(data?.hasMore),
    };
  }, [selectorUrl, selectorContext, apiFetch]);
}
