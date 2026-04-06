import { useState, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';

function formatPrice(v) {
  if (v === null || v === undefined) return '—';
  return Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function PriceCard({ label, description, value, editing, draft, onDraftChange, onKeyDown }) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing) setTimeout(() => inputRef.current?.select(), 0);
  }, [editing]);

  return (
    <div className="flex-1 rounded-xl border border-gray-200 bg-white p-4 min-w-[200px]">
      <div className="flex items-start justify-between mb-1">
        <span className="text-sm font-semibold text-gray-800">{label}</span>
        <span className="text-[11px] font-semibold bg-gray-900 text-white px-2 py-0.5 rounded-full">Main</span>
      </div>
      <p className="text-xs text-gray-400 mb-3 leading-snug">{description}</p>
      <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
        <div className="text-[11px] text-gray-400 mb-1">Principal price</div>
        {editing ? (
          <input
            ref={inputRef}
            type="number"
            step="0.01"
            value={draft}
            onChange={e => onDraftChange(e.target.value)}
            onKeyDown={onKeyDown}
            className="w-full text-2xl font-bold text-gray-900 bg-transparent border-0 outline-none focus:ring-0 p-0"
            autoFocus
          />
        ) : (
          <div className="text-2xl font-bold text-gray-900">{formatPrice(value)}</div>
        )}
      </div>
    </div>
  );
}

export default function ProductPriceBar({ data, token, apiBaseUrl }) {
  const recordId = data?.id;
  const [priceRows, setPriceRows] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saleDraft, setSaleDraft] = useState('');
  const [purchaseDraft, setPurchaseDraft] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!recordId || !token) return;
    fetch(`${apiBaseUrl}/price?parentId=${recordId}&_startRow=0&_endRow=200`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => (r.ok ? r.json() : null))
      .then(d => setPriceRows(d?.response?.data ?? []))
      .catch(() => setPriceRows([]));
  }, [recordId, token, apiBaseUrl]);

  if (!priceRows || priceRows.length === 0) return null;

  const saleRow = priceRows.find(
    r => r['priceListVersion$salesPriceList'] === true || r['priceListVersion$salesPriceList'] === 'true'
  ) ?? priceRows[0] ?? null;

  const purchaseRow = priceRows.find(
    r => r['priceListVersion$salesPriceList'] === false || r['priceListVersion$salesPriceList'] === 'false'
  ) ?? null;

  // When no dedicated purchase row exists, fall back to listPrice from the sale row
  const purchaseValue = purchaseRow ? purchaseRow.standardPrice : saleRow?.listPrice ?? null;
  const purchaseIsFallback = !purchaseRow && !!saleRow; // using saleRow.listPrice

  const startEdit = () => {
    setSaleDraft(saleRow?.standardPrice != null ? String(saleRow.standardPrice) : '');
    setPurchaseDraft(purchaseValue != null ? String(purchaseValue) : '');
    setEditing(true);
  };

  const cancel = () => setEditing(false);

  const save = async () => {
    setSaving(true);
    try {
      const patches = [];
      if (saleRow?.id) {
        const v = parseFloat(saleDraft);
        if (!isNaN(v)) patches.push(
          fetch(`${apiBaseUrl}/price/${saleRow.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ fieldValues: { PriceStd: String(v) } }),
          })
        );
      }
      const purchaseTargetId = purchaseRow?.id ?? saleRow?.id;
      const purchaseColumn = purchaseRow ? 'PriceStd' : 'PriceList';
      if (purchaseTargetId) {
        const v = parseFloat(purchaseDraft);
        if (!isNaN(v)) patches.push(
          fetch(`${apiBaseUrl}/price/${purchaseTargetId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ fieldValues: { [purchaseColumn]: String(v) } }),
          })
        );
      }
      await Promise.all(patches);
      // Refresh prices
      const res = await fetch(`${apiBaseUrl}/price?parentId=${recordId}&_startRow=0&_endRow=200`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        setPriceRows(d?.response?.data ?? []);
      }
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') cancel();
    if (e.key === 'Enter') save();
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 mb-2">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-sm font-semibold text-gray-800">Pricing</div>
          <div className="text-xs text-gray-400 mt-0.5">
            Solo se configura un precio principal de venta y uno de compra, tomando como referencia Holded.
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          {editing ? (
            <>
              <button
                onClick={cancel}
                disabled={saving}
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="text-xs px-3 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-gray-700 transition-colors flex items-center gap-1.5"
              >
                {saving && <Loader2 size={11} className="animate-spin" />}
                Save pricing
              </button>
            </>
          ) : (
            <button
              onClick={startEdit}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 transition-colors font-medium"
            >
              Edit pricing
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-3">
        {saleRow && (
          <PriceCard
            label="Precio de venta"
            description="Precio principal visible para venta, siguiendo la lógica de Holded."
            value={saleRow.standardPrice}
            editing={editing}
            draft={saleDraft}
            onDraftChange={setSaleDraft}
            onKeyDown={handleKeyDown}
          />
        )}
        {saleRow && (
          <PriceCard
            label="Precio de compra"
            description={purchaseIsFallback ? 'Precio de lista de la misma tarifa.' : 'Precio principal visible para compra.'}
            value={purchaseValue}
            editing={editing}
            draft={purchaseDraft}
            onDraftChange={setPurchaseDraft}
            onKeyDown={handleKeyDown}
          />
        )}
      </div>
    </div>
  );
}
