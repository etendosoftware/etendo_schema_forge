import { useCallback } from 'react';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { buildUrlWithParams } from '@/lib/buildUrlWithParams.js';
import { SearchPopup, SEARCH_POPUP_PAGE_SIZE } from './SearchPopup.jsx';

/**
 * The label a selector item is shown with — the same fallback chain the lookup fields use when
 * they store the picked item's `$_identifier`.
 *
 * @param {{label?: string, name?: string, _identifier?: string, id: string}} item
 */
function selectorItemLabel(item) {
  return item.label || item.name || item._identifier || item.id;
}

/**
 * AccountLookupPopup — the `account` entry of the lookup drawer registry (`lookupDrawers.js`):
 * a lookup field declared with `"lookupDrawer": "account"` opens the shared `SearchPopup` over
 * the field's server selector instead of the product search drawer.
 *
 * ETP-5681: the G/L journal line Account column. The product drawer it used before was built for
 * products (images, prices, stock) and cut long account names off; this popup is the one the
 * report filters already use for "Desde la cuenta" and shows each `"code - name"` in full.
 *
 * Same props contract as every registry drawer. `onSelect` receives the raw selector item, so the
 * caller keeps reading `_identifier` / `_aux` from it as it does for the product drawer.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {(item: object) => void} props.onSelect
 * @param {string} props.selectorUrl — the field's NEO selector endpoint
 * @param {object} [props.selectorContext] — extra query params (parent context) for every request
 * @param {string} [props.title]
 */
export default function AccountLookupPopup({ open, onClose, onSelect, selectorUrl, selectorContext, title }) {
  const apiFetch = useApiFetch();

  const loadPage = useCallback(async (query, offset, signal) => {
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

  return (
    <SearchPopup
      open={open}
      onClose={onClose}
      onSelect={onSelect}
      loadPage={loadPage}
      title={title}
      data-testid="account-lookup-popup"
    />
  );
}
