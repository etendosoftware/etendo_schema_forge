import { useState, useEffect } from 'react';
import { useUI } from '@/i18n';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { jsonHeaders } from '@/lib/sessionHeaders.js';

// Radix Select has no empty-string value, so the picker uses '__empty__' as its
// placeholder sentinel — translate it back to '' before it reaches priceListId,
// and back to the sentinel when feeding the current value into the Select.
const EMPTY_SENTINEL = '__empty__';
export const resolvePriceListValue = (val) => (val === EMPTY_SENTINEL ? '' : val);
export const toPriceListSelectValue = (id) => id || EMPTY_SENTINEL;

/**
 * Shared price-list fetch + selection state for any confirmation flow that lets
 * the user pick the sales/purchase tariff applied to a generated invoice.
 * Originally built for CreateInvoiceConfirmModal (ETP-4028 — the "Crear factura"
 * button on an already-completed shipment/receipt) and extracted here so
 * ConfirmInOutModal (ETP-4942 — the toggle in the pre-completion confirm popup)
 * can reuse the exact same fetch/filter/default-selection behavior instead of a
 * second hand-rolled copy of the `/price-list/priceList` call.
 *
 * Fetches `GET {base}/price-list/priceList` once per `enabled` activation,
 * filters by `active !== false && salesPriceList === isSOTrx`, and auto-selects
 * the tariff flagged `default` (or the first match).
 *
 * @param enabled — gate: skips the fetch entirely while false, so the network
 *   call and the loading spinner only ever appear when the picker is actually
 *   shown by the caller.
 * @param base — NEO API root (e.g. `/sws/neo/goods-shipment`), the same value
 *   every caller already derives from its own `apiBaseUrl` — passed in rather
 *   than recomputed here so this hook has a single job (fetch/filter/default)
 *   and no opinion on that derivation.
 *
 * ETP-4576 — it used to take a `headers` prop that had to carry `Authorization`, and
 * keyed its effect on that header's value. Neither is available under the cookie
 * session: the credential is resolved by the shared builders at request time, so the
 * read below builds its own and the effect keys on the inputs it actually depends on.
 */
export function usePriceListPicker({ enabled, isSOTrx = true, base }) {
  const [priceLists, setPriceLists] = useState([]);
  const [priceListId, setPriceListId] = useState('');
  const [loading, setLoading] = useState(!!enabled);

  useEffect(() => {
    if (!enabled || !base) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`${base}/price-list/priceList?_startRow=0&_endRow=200`, {
          headers: jsonHeaders(),
          credentials: 'include',
        });
        if (!res.ok || cancelled) return;
        const all = (await res.json())?.response?.data || [];
        const matches = all.filter(p => p.active !== false && p.salesPriceList === isSOTrx);
        if (cancelled) return;
        setPriceLists(matches);
        const preferred = matches.find(p => p.default) || matches[0];
        if (preferred) setPriceListId(preferred.id);
      } catch { /* silent */ } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [enabled, isSOTrx, base]);

  return { priceLists, priceListId, setPriceListId, loading };
}

/**
 * Presentational tariff `<Select>` — label + dropdown, shared by every modal
 * that uses {@link usePriceListPicker}. `idPrefix` controls both the DOM id
 * and every data-testid, so each caller keeps its own stable selectors.
 */
export function PriceListSelectField({ priceLists, priceListId, onChange, loading, idPrefix }) {
  const ui = useUI();
  const placeholder = loading ? ui('loading') : ui('noPriceListsAvailable');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label htmlFor={idPrefix} style={{ fontSize: 12, fontWeight: 500, color: 'hsl(var(--muted-foreground))' }}>
        {ui('salesPriceListField')}
      </label>
      <Select
        value={toPriceListSelectValue(priceListId)}
        onValueChange={val => onChange(resolvePriceListValue(val))}
        disabled={loading || priceLists.length === 0}
        data-testid={`Select__${idPrefix}`}
      >
        <SelectTrigger id={idPrefix} data-testid={`${idPrefix}-select`}>
          <SelectValue placeholder={placeholder} data-testid={`SelectValue__${idPrefix}`} />
        </SelectTrigger>
        <SelectContent data-testid={`SelectContent__${idPrefix}`}>
          {loading && (
            <SelectItem value={EMPTY_SENTINEL} data-testid={`SelectItem__${idPrefix}-loading`}>{ui('loading')}</SelectItem>
          )}
          {!loading && priceLists.length === 0 && (
            <SelectItem value={EMPTY_SENTINEL} data-testid={`SelectItem__${idPrefix}-empty`}>{ui('noPriceListsAvailable')}</SelectItem>
          )}
          {priceLists.map(p => (
            <SelectItem key={p.id} value={p.id} data-testid={`option-${idPrefix}-${p.id}`}>{p['name'] ?? p.id}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
