import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import { SquareCheckbox } from '@/windows/custom/shared/SquareCheckbox';

// Codes match the backend AD process param `QtyRange` — do NOT change them.
const QTY_OPTIONS = [
  { value: '<', key: 'qtyLessZero' },
  { value: '>', key: 'qtyGreaterZero' },
  { value: '=', key: 'qtyZero' },
  { value: 'N', key: 'qtyNotZero' },
];

/**
 * "Generate lines automatically" modal for physical-inventory lines.
 * Submits to the NeoHandler @Named("inventory") action `generateLines`
 * (ETP-4528). Modeled on InventoryCreateListModal's shell (createPortal
 * overlay, backdrop-click close, header/body/footer) but trimmed to
 * exactly the 3 fields this feature needs.
 */
export default function GenerateLinesModal({ recordId, apiBaseUrl, token, onClose, onRefresh }) {
  const ui = useUI();
  const [categoryId, setCategoryId] = useState('');
  const [qtyRange, setQtyRange] = useState('N');
  const [resetBookQty, setResetBookQty] = useState(false);
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
      // Omit M_Product_Category_ID entirely when "all categories" is selected.
      // Sending JSON null would reach the handler as the literal string "null"
      // (Jettison optString quirk) and filter to a non-existent category.
      const payload = {
        QtyRange: qtyRange,
        regularization: resetBookQty ? 'Y' : 'N',
      };
      if (categoryId) {
        payload.M_Product_Category_ID = categoryId;
      }
      const res = await fetch(`${apiBaseUrl}/inventory/${recordId}/action/generateLines`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        toast.error(err?.message || err?.response?.message || ui('errorGeneratingList'));
        setSubmitting(false);
        return;
      }
      await res.json().catch(() => null);
      toast.success(ui('linesGeneratedAutomatically'));
      onRefresh?.();
      onClose();
    } catch {
      toast.error(ui('errorGeneratingList'));
      setSubmitting(false);
    }
  };

  const inputStyle = {
    width: '100%',
    fontSize: 13,
    padding: '7px 10px',
    border: '0.5px solid #E5E7EB',
    borderRadius: 6,
    outline: 'none',
    color: '#111827',
    background: '#fff',
    boxSizing: 'border-box',
  };

  const labelStyle = {
    fontSize: 13,
    fontWeight: 500,
    color: '#374151',
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
        backgroundColor: 'rgba(0,0,0,0.3)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 420,
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 12,
          backgroundColor: '#fff',
          boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
          border: '0.5px solid #E5E7EB',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #E5E7EB', background: '#F9FAFB' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
              {ui('generateLinesAutomatically')}
            </span>
            <button
              type="button"
              onClick={onClose}
              style={{ fontSize: 18, lineHeight: 1, padding: '2px 6px', borderRadius: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}
            >
              &times;
            </button>
          </div>
        </div>

        {/* Form */}
        <div style={{ padding: '20px 16px 4px' }}>
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
          <div style={fieldStyle}>
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

          {/* Set Book Quantity to zero */}
          <div style={{ ...fieldStyle, marginBottom: 20 }}>
            <SquareCheckbox
              label={ui('setBookQuantityToZero')}
              checked={resetBookQty}
              onChange={setResetBookQty}
              data-testid="GenerateLinesModal__resetBookQty"
            />
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8,
            background: '#F8F9FA', borderTop: '1px solid #E5E7EB', padding: '10px 16px',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              fontSize: 13, padding: '6px 14px', borderRadius: 6,
              border: '1px solid #E5E7EB', background: 'transparent',
              color: '#6B7280', cursor: 'pointer',
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
              border: 'none', background: '#18181b', color: '#fff',
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
