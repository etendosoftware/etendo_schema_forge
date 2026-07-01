import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/contract-ui';
import { AddLineButton } from '@/components/ui/add-line-button';
import { useUI, useMenuLabel } from '@/i18n';
import { Trash2, X } from 'lucide-react';

function ConfirmDeleteModal({ onConfirm, onCancel }) {
  const ui = useUI();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative bg-white rounded-xl shadow-lg border border-border/60 w-[22rem] p-6">
        <button onClick={onCancel} className="absolute top-3 right-3 h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" data-testid="X__a2df7f" />
        </button>
        <h3 className="text-[15px] font-semibold text-foreground mb-2">{ui('deleteRecord')}</h3>
        <p className="text-sm text-muted-foreground mb-5">
          {ui('deleteConfirmMessage')}
        </p>
        <div className="flex items-center justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-sm font-medium rounded-md border hover:bg-accent transition-colors">{ui('cancel')}</button>
          <button onClick={onConfirm} className="px-3 py-1.5 text-sm font-medium rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors">{ui('delete')}</button>
        </div>
      </div>
    </div>
  );
}

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
  const tMenu = useMenuLabel();
  const columns = useMemo(() => [
    { key: 'product', column: 'M_Product_ID', type: 'string', label: ui('product') },
    { key: 'standardPrice', column: 'PriceStd', type: 'amount', label: ui('unitPrice') },
    { key: 'listPrice', type: 'amount', label: ui('listPrice') },
  ], [ui]);
  const addRowFields = useMemo(() => [
    { key: 'product', column: 'M_Product_ID', type: 'search', label: ui('product'), required: true, lookup: true, reference: 'Product', inputMode: 'search' },
    { key: 'standardPrice', column: 'PriceStd', type: 'number', label: ui('unitPrice'), required: true },
    { key: 'listPrice', column: 'PriceList', type: 'number', label: ui('listPrice'), required: true },
  ], [ui]);
  const [versionId, setVersionId] = useState(null);
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);
  const [selectedLine, setSelectedLine] = useState(null);
  const [edits, setEdits] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);

  const headers = useMemo(() => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }), [token]);

  const parentId = data?.id || (recordId !== 'new' ? recordId : null);
  const selectorContext = useMemo(() => (versionId ? { parentId: versionId } : {}), [versionId]);

  // The price list GET response carries the single version id under `priceListVersion`
  // (injected by PriceListHeaderHandler.afterHandle). One list = one version, enforced
  // by PriceListVersionEventHandler — no need to fetch and pick versions[0].
  const versionFromRecord = data?.priceListVersion || null;

  const loadProductPrices = useCallback(async () => {
    if (!parentId || !token || !apiBaseUrl) {
      setVersionId(null); setLines([]); setLoading(false); return;
    }
    if (!versionFromRecord) {
      setVersionId(null); setLines([]); setLoading(false); return;
    }
    setLoading(true); setError(null);
    try {
      setVersionId(versionFromRecord);
      const lineRes = await fetch(`${apiBaseUrl}/productPrice?parentId=${versionFromRecord}&_startRow=0&_endRow=200`, { headers });
      if (!lineRes.ok) throw new Error(await readErrorMessage(lineRes));
      setLines(rowsFrom(await lineRes.json()));
      setLoading(false);
    } catch (err) {
      setError(err?.message || ui('priceLoadError'));
      setVersionId(null); setLines([]); setLoading(false);
    }
  }, [apiBaseUrl, headers, parentId, token, versionFromRecord]);

  useEffect(() => {
    // loadProductPrices handles its own errors; catch is a safety net for unexpected throws.
    loadProductPrices().catch(() => setError(ui('priceLoadError')));
  }, [loadProductPrices]);

  const canAddProducts = !!editing && !!versionId;

  const closeSidePanel = useCallback(() => {
    setClosing(true);
    setTimeout(() => { setSelectedLine(null); setClosing(false); }, 200);
  }, []);

  const handleRowClick = useCallback((row) => {
    setAdding(false);
    setSelectedLine(row);
    setClosing(false);
    setEdits({ standardPrice: row.standardPrice ?? '', listPrice: row.listPrice ?? '' });
  }, []);

  const handleAdd = useCallback(async (lineData) => {
    if (!versionId) { toast.error('This price list has no hidden version available yet'); return false; }
    if (!lineData.product) { toast.error('Product is required'); return false; }
    const res = await fetch(`${apiBaseUrl}/productPrice`, {
      method: 'POST', headers,
      body: JSON.stringify({
        priceListVersion: versionId,
        product: lineData.product,
        standardPrice: toNumber(lineData.standardPrice),
        listPrice: toNumber(lineData.listPrice),
        priceLimit: 0,
      }),
    });
    if (!res.ok) { toast.error(await readErrorMessage(res)); return false; }
    toast.success('Product added');
    setAdding(false);
    await loadProductPrices();
    return true;
  }, [apiBaseUrl, headers, loadProductPrices, versionId]);

  const handleSaveEdit = useCallback(async () => {
    if (!selectedLine) return;
    setSaving(true);
    try {
      const res = await fetch(`${apiBaseUrl}/productPrice/${selectedLine.id}`, {
        method: 'PATCH', headers,
        body: JSON.stringify({
          standardPrice: toNumber(edits.standardPrice),
          listPrice: toNumber(edits.listPrice),
        }),
      });
      if (!res.ok) { toast.error(await readErrorMessage(res)); return; }
      toast.success('Price updated');
      closeSidePanel();
      await loadProductPrices();
    } finally { setSaving(false); }
  }, [apiBaseUrl, closeSidePanel, edits, headers, loadProductPrices, selectedLine]);

  const handleDelete = useCallback(async () => {
    if (!selectedLine) return;
    setSaving(true);
    try {
      const res = await fetch(`${apiBaseUrl}/productPrice/${selectedLine.id}`, {
        method: 'DELETE', headers,
      });
      if (!res.ok) { toast.error(await readErrorMessage(res)); return; }
      toast.success('Product price deleted');
      setConfirmDelete(false);
      closeSidePanel();
      await loadProductPrices();
    } finally { setSaving(false); }
  }, [apiBaseUrl, closeSidePanel, headers, loadProductPrices, selectedLine]);

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
      <div className="flex items-start gap-4">
        {/* Table */}
        <div className="flex-1 min-w-0">
          {!versionId && !loading ? (
            <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
              {ui('priceListNoVersion')}
            </div>
          ) : (
            <DataTable
              entity="productPrice"
              data={lines}
              columns={columns}
              filters={['product']}
              selectable={true}
              loading={loading}
              showFooterTotals={false}
              token={token}
              apiBaseUrl={apiBaseUrl}
              selectorContext={selectorContext}
              selectedId={selectedLine?.id}
              onRowClick={handleRowClick}
              addRow={canAddProducts ? {
                active: adding,
                fields: addRowFields,
                onAdd: handleAdd,
                onCancel: () => setAdding(false),
                catalogs: {},
              } : undefined}
              data-testid="DataTable__a2df7f" />
          )}

          {canAddProducts && !adding && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '0.5px solid var(--color-border-tertiary, #e5e7eb)', padding: '10px 16px' }}>
              <AddLineButton
                onClick={() => { setAdding(true); closeSidePanel(); }}
                label={ui('addEntity', { label: tMenu('Product') })}
                data-testid="AddLineButton__a2df7f" />
            </div>
          )}
        </div>

        {/* Side panel: edit selected line */}
        {(selectedLine || closing) && (
          <div className={`w-[26rem] shrink-0 border-l border-border pl-4 self-stretch overflow-hidden ${closing ? 'sidebar-slide-out' : 'sidebar-slide-in'}`}>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-foreground">{ui('priceDetail')}</span>
              <button
                onClick={closeSidePanel}
                className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-3.5 w-3.5" data-testid="X__a2df7f" />
              </button>
            </div>

            <div className="space-y-3">
              {/* Product (read-only) */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">{ui('product')}</label>
                <div className="h-8 rounded-md border border-input bg-muted/30 px-2 text-sm flex items-center text-foreground">
                  {selectedLine?.['product$_identifier'] || selectedLine?.product || '—'}
                </div>
              </div>

              {/* Unit Price */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">{ui('unitPrice')}</label>
                <input
                  type="number"
                  step="0.01"
                  value={edits.standardPrice}
                  disabled={!editing}
                  onChange={e => setEdits(prev => ({ ...prev, standardPrice: e.target.value }))}
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-muted/30 disabled:text-muted-foreground"
                />
              </div>

              {/* List Price */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">{ui('listPrice')}</label>
                <input
                  type="number"
                  step="0.01"
                  value={edits.listPrice}
                  disabled={!editing}
                  onChange={e => setEdits(prev => ({ ...prev, listPrice: e.target.value }))}
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-muted/30 disabled:text-muted-foreground"
                />
              </div>
            </div>

            {editing && (
              <div className="flex items-center gap-2 mt-5 pt-4 border-t border-border/40">
                <button
                  disabled={saving}
                  onClick={handleSaveEdit}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {ui('save')}
                </button>
                <button
                  onClick={closeSidePanel}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md border hover:bg-accent"
                >
                  {ui('cancel')}
                </button>
                <button
                  disabled={saving}
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-destructive/40 text-destructive hover:bg-destructive/10 disabled:opacity-50 ml-auto"
                >
                  <Trash2 className="h-3.5 w-3.5" data-testid="Trash2__a2df7f" />
                  {ui('delete')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      {confirmDelete && (
        <ConfirmDeleteModal
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
          data-testid="ConfirmDeleteModal__a2df7f" />
      )}
    </div>
  );
}
