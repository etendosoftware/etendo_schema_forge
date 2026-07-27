import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { useUI } from '@/i18n';

const QTY_OPTIONS = [
  { value: 'N', key: 'qtyNotZero' },
  { value: '=', key: 'qtyZero' },
  { value: '<', key: 'qtyLessZero' },
  { value: '>', key: 'qtyGreaterZero' },
];

export default function InventoryCreateListModal({ inventoryId, warehouseId, apiBaseUrl, token, onClose, onSuccess }) {
  const ui = useUI();
  const [productValue, setProductValue] = useState('%');
  const [categoryId, setCategoryId] = useState('');
  const [qtyRange, setQtyRange] = useState('N');
  const [categories, setCategories] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  const headers = useMemo(
    () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }),
    [token],
  );

  useEffect(() => {
    fetch(`${base}/product/product/selectors/M_Product_Category_ID?_startRow=0&_endRow=500`, { headers })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((j) => setCategories(j?.items || []))
      .catch(() => {});
  }, [base, headers]);

  const handleGenerate = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const body = {
        ProductValue: productValue || '%',
        QtyRange: qtyRange,
      };
      if (categoryId) {
        body.M_Product_Category_ID = categoryId;
      }
      const res = await fetch(`${apiBaseUrl}/inventory/${inventoryId}/action/generateList`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.response?.message || `${ui('errorGeneratingList')} (${res.status})`);
      }
      onSuccess();
    } catch (err) {
      toast.error(err.message || ui('errorGeneratingList'));
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = {
    width: '100%',
    fontSize: 13,
    padding: '7px 10px',
    border: '0.5px solid hsl(var(--card))',
    borderRadius: 6,
    outline: 'none',
    color: 'hsl(var(--foreground))',
    background: 'hsl(var(--card))',
    boxSizing: 'border-box',
  };

  const labelStyle = {
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--status-info-bg)',
    marginBottom: 6,
    display: 'block',
  };

  const fieldStyle = { marginBottom: 16 };

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'hsl(var(--foreground) / 0.3)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 420,
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 12,
          backgroundColor: 'hsl(var(--card))',
          boxShadow: '0 8px 30px hsl(var(--foreground) / 0.12)',
          border: '0.5px solid hsl(var(--card))',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid hsl(var(--card))', background: 'hsl(var(--card))' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'hsl(var(--foreground))' }}>
              {ui('createInventoryCountList')}
            </span>
            <button
              type="button"
              onClick={onClose}
              style={{ fontSize: 18, lineHeight: 1, padding: '2px 6px', borderRadius: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--muted-foreground))' }}
            >
              &times;
            </button>
          </div>
        </div>

        {/* Form */}
        <div style={{ padding: '20px 16px 4px' }}>
          {/* Product Search Key */}
          <div style={fieldStyle}>
            <label style={labelStyle}>{ui('productSearchKey')}</label>
            <input
              type="text"
              value={productValue}
              onChange={(e) => setProductValue(e.target.value)}
              placeholder="%"
              style={inputStyle}
            />
          </div>

          {/* Product Category */}
          <div style={fieldStyle}>
            <label style={labelStyle}>{ui('productCategory')}</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="">{ui('allCategories')}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label || c.name || c.id}
                </option>
              ))}
            </select>
          </div>

          {/* Inventory Quantity */}
          <div style={{ ...fieldStyle, marginBottom: 20 }}>
            <label style={labelStyle}>{ui('inventoryQuantity')}</label>
            <select
              value={qtyRange}
              onChange={(e) => setQtyRange(e.target.value)}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              {QTY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {ui(opt.key)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8,
            background: 'hsl(var(--card))', borderTop: '1px solid hsl(var(--card))', padding: '10px 16px',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              fontSize: 13, padding: '6px 14px', borderRadius: 6,
              border: '1px solid hsl(var(--card))', background: 'transparent',
              color: 'hsl(var(--muted))', cursor: 'pointer',
            }}
          >
            {ui('cancel')}
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={submitting}
            style={{
              fontSize: 13, fontWeight: 500, padding: '6px 14px', borderRadius: 6,
              border: 'none', background: 'hsl(var(--foreground))', color: 'hsl(var(--card))',
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.5 : 1,
            }}
          >
            {submitting ? ui('generating') : ui('generate')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
