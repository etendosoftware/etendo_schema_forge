import { useCallback, useEffect, useMemo, useState } from 'react';
import { InlineLinesPanel } from '@/components/contract-ui';
import { useUI } from '@/i18n';

import { useApiFetch } from '@/auth/useApiFetch.js';
// ETP-4592: product-price lines cannot be deleted from this tab (products are
// added to a tariff from the product record itself). InlineLinesPanel has no
// prop to hide just the row-delete icon — it renders unconditionally alongside
// the pencil regardless of whether `onDeleteRow` is passed — and this component
// intentionally does not modify that shared generic component. Scoping this CSS
// rule to `.price-list-lines` keeps the change local to this custom window
// instead of touching InlineLinesPanel's markup for every other window that
// uses it. `nth-child(2)` targets the trash button's position (pencil is
// always first) inside the panel's per-row action strip.
//
// Fragility note: the test suite mocks InlineLinesPanel entirely (see
// __tests__), so nothing here catches a future rename/reorder of that
// component's `line-actions` markup silently un-hiding this button again —
// re-check this selector by hand if InlineLinesPanel's action-strip layout
// ever changes.
const HIDE_ROW_DELETE_STYLE = `
  .price-list-lines [data-testid="line-actions"] > div > button:nth-child(2) {
    display: none;
  }
`;

function rowsFrom(json) {
  return json?.response?.data ?? (Array.isArray(json) ? json : []);
}

async function readErrorMessage(res) {
  try {
    const json = await res.json();
    return json?.response?.error?.message || json?.response?.message || json?.error?.message || json?.message || `Error ${res.status}`;
  } catch { return `Error ${res.status}`; }
}

function toNumber(value) {
  if (value === '' || value == null) return 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function PriceListProductPrices({ recordId, data, token, apiBaseUrl, editing }) {
  const ui = useUI();
  const columns = useMemo(() => [
    { key: 'product', column: 'M_Product_ID', type: 'string', label: ui('product'), readOnly: true, required: true },
    // noTrailing: without it, InlineLinesPanel treats the last 'amount' column as the one
    // that disappears on hover/edit to make room for the action strip. That's fine when
    // there are other columns to fall back on, but here listPrice is the ONLY data column
    // besides read-only product — hiding it made it look uneditable (the pencil rendered
    // where the value used to be, with no visible input to type into).
    { key: 'listPrice', type: 'amount', label: ui('listPrice'), noTrailing: true, required: true },
  ], [ui]);
  const [versionId, setVersionId] = useState(null);
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const apiFetch = useApiFetch(apiBaseUrl);

  const parentId = data?.id || (recordId !== 'new' ? recordId : null);
  const selectorContext = useMemo(() => (versionId ? { parentId: versionId } : {}), [versionId]);

  // The price list GET response carries the single version id under `priceListVersion`
  // (injected by PriceListHeaderHandler.afterHandle). One list = one version, enforced
  // by PriceListVersionEventHandler — no need to fetch and pick versions[0].
  const versionFromRecord = data?.priceListVersion || null;

  const loadProductPrices = useCallback(async () => {
    if (!parentId || !apiBaseUrl) {
      setVersionId(null); setLines([]); setLoading(false); return;
    }
    if (!versionFromRecord) {
      setVersionId(null); setLines([]); setLoading(false); return;
    }
    setLoading(true); setError(null);
    try {
      setVersionId(versionFromRecord);
      const lineRes = await apiFetch(`/productPrice?parentId=${versionFromRecord}&_startRow=0&_endRow=200`);
      if (!lineRes.ok) throw new Error(await readErrorMessage(lineRes));
      setLines(rowsFrom(await lineRes.json()));
      setLoading(false);
    } catch (err) {
      setError(err?.message || ui('priceLoadError'));
      setVersionId(null); setLines([]); setLoading(false);
    }
  }, [apiBaseUrl, apiFetch, parentId, token, versionFromRecord]);

  useEffect(() => {
    // loadProductPrices handles its own errors; catch is a safety net for unexpected throws.
    loadProductPrices().catch(() => setError(ui('priceLoadError')));
  }, [loadProductPrices]);

  // Autosave for a single inline-edited cell (InlineLinesPanel calls this on blur).
  // Throwing on failure lets InlineLinesPanel show the error toast itself; on
  // success it shows its own "saved" toast, so this stays silent on the happy path.
  const handleUpdateRow = useCallback(async (row, fieldKey, value) => {
    const res = await apiFetch(`/productPrice/${row.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ [fieldKey]: toNumber(value) }),
    });
    if (!res.ok) throw new Error(await readErrorMessage(res));
    // Server response wins over the optimistic value when present (mirrors
    // DetailView's buildInlineRowUpdateHandler) — NEO Headless may round/normalize
    // the stored amount, and the client-typed value would otherwise silently drift.
    const updated = await res.json().catch(() => null);
    const serverValue = updated?.response?.data?.[0]?.[fieldKey];
    const nextValue = serverValue !== undefined ? serverValue : toNumber(value);
    setLines(prev => prev.map(l => (l.id === row.id ? { ...l, [fieldKey]: nextValue } : l)));
  }, [apiFetch]);

  if (!parentId) {
    return (
      <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
        {ui('priceListSaveFirst')}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>
      )}
      <div className="flex-1 min-w-0">
        {!versionId && !loading ? (
          <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
            {ui('priceListNoVersion')}
          </div>
        ) : (
          <div className="price-list-lines">
            <style>{HIDE_ROW_DELETE_STYLE}</style>
            <InlineLinesPanel
              entity="productPrice"
              data={lines}
              columns={columns}
              token={token}
              apiBaseUrl={apiBaseUrl}
              selectorContext={selectorContext}
              isDocumentReadOnly={!editing}
              onUpdateRow={handleUpdateRow}
              data-testid="InlineLinesPanel__a2df7f" />
          </div>
        )}
      </div>
    </div>
  );
}
