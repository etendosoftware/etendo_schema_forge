import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { ClipboardList, FileText } from 'lucide-react';

/**
 * Confirmation modal for Sales Quotation.
 *
 * Flow:
 *  1. Modal opens with options (quotation stays in DR).
 *  2. On confirm: DocAction=CO → create document → reactivate to Draft.
 *  3. Shows success state with navigation to created document.
 */
export default function QuotationConfirmModal({
  quotationId,
  data,
  token,
  apiBaseUrl,
  onClose,
}) {
  const [selected, setSelected] = useState('order');
  const [loading, setLoading] = useState(false);
  const [createdDoc, setCreatedDoc] = useState(null);
  const [error, setError] = useState(null);
  const [lineCount, setLineCount] = useState(null);

  const entityUrl = `${apiBaseUrl}/quotation`;
  const headers = useMemo(() => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }), [token]);

  const [freshData, setFreshData] = useState(null);

  const fmtNum = (v) =>
    v != null && v !== ''
      ? Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : '-';

  // Fetch fresh record + line count on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [recRes, linesRes] = await Promise.all([
          fetch(`${entityUrl}/${quotationId}`, { headers }),
          fetch(`${apiBaseUrl}/quotationLine?parentId=${quotationId}&_startRow=0&_endRow=999`, { headers }),
        ]);
        if (cancelled) return;
        if (recRes.ok) {
          const recJson = await recRes.json();
          const rec = recJson?.response?.data?.[0] ?? recJson;
          setFreshData(rec);
        }
        if (linesRes.ok) {
          const linesJson = await linesRes.json();
          setLineCount(linesJson?.response?.data?.length ?? 0);
        }
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [quotationId, entityUrl, apiBaseUrl, headers]);

  // Use fresh data when available, fallback to prop data
  const d = freshData || data || {};
  const documentNo = d.documentNo || '';
  const bpName = d['businessPartner$_identifier'] || '';
  const grandTotal = d.grandTotalAmount ?? d.grandTotal ?? '';
  const totalLines = d.summedLineAmount ?? d.totalLines ?? grandTotal;
  const currency = d['currency$_identifier'] || '';

  const alreadyProcessed = data?.documentStatus === 'CO';

  const handleConfirm = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      // Step 1: Process DocAction=CO (skip if already confirmed)
      if (!alreadyProcessed) {
        const processRes = await fetch(
          `${entityUrl}/${quotationId}/action/DocAction`,
          { method: 'POST', headers, body: JSON.stringify({ fieldValues: {} }) },
        );
        if (!processRes.ok) {
          const err = await processRes.json().catch(() => null);
          throw new Error(err?.response?.message || err?.message || `Process failed (${processRes.status})`);
        }
      }

      // Step 2: Create the document
      const baseNeoUrl = apiBaseUrl.replace(/\/sales-quotation$/, '');

      if (selected === 'order') {
        const res = await fetch(
          `${entityUrl}/${quotationId}/action/Convertquotation`,
          { method: 'POST', headers, body: JSON.stringify({ fieldValues: {} }) },
        );
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          throw new Error(
            'El presupuesto fue procesado pero no se pudo crear el pedido. '
            + (err?.response?.message || err?.message || `Error (${res.status})`)
          );
        }

        // Fetch created order by quotation link
        const criteria = JSON.stringify([{ fieldName: 'quotation', operator: 'equals', value: quotationId }]);
        const orderRes = await fetch(
          `${baseNeoUrl}/sales-order/header?${new URLSearchParams({ criteria, _limit: '5' })}`,
          { headers },
        );
        if (orderRes.ok) {
          const orderJson = await orderRes.json();
          const rows = orderJson?.response?.data ?? [];
          if (rows.length > 0) {
            const order = rows[0];

            // Step 3: If order was auto-completed, reactivate to Draft
            let finalStatus = order.documentStatus;
            if (order.documentStatus === 'CO') {
              try {
                const reactRes = await fetch(
                  `${baseNeoUrl}/sales-order/header/${order.id}/action/DocAction`,
                  { method: 'POST', headers, body: JSON.stringify({ docAction: 'RE' }) },
                );
                if (reactRes.ok) finalStatus = 'DR';
              } catch { /* best-effort */ }
            }

            const status = finalStatus === 'DR' ? 'Draft' : 'Completed';
            setCreatedDoc({
              type: 'order', id: order.id,
              documentNo: order.documentNo,
              total: `${fmtNum(order.grandTotalAmount ?? order.grandTotal)} ${currency}`,
              status,
            });
            return;
          }
        }
        setCreatedDoc({ type: 'order', id: null, documentNo: '?', total: '', status: 'Draft' });

      } else {
        // TODO: The createDraftInvoice endpoint for quotations may not exist yet.
        const res = await fetch(
          `${entityUrl}/${quotationId}/action/createDraftInvoice`,
          { method: 'POST', headers, body: JSON.stringify({ fieldValues: {} }) },
        );
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          throw new Error(
            'El presupuesto fue procesado pero no se pudo crear la factura. '
            + (err?.response?.message || err?.message || `Error (${res.status})`)
          );
        }
        setCreatedDoc({ type: 'invoice', id: null, documentNo: '?', total: '', status: '' });
      }
    } catch (err) {
      setError(err.message || 'Ocurrió un error');
    } finally {
      setLoading(false);
    }
  };

  const primaryLabel = selected === 'order'
    ? 'Confirmar → Pedido de venta'
    : 'Confirmar → Factura';

  const handleGoToDoc = () => {
    if (!createdDoc?.id) { handleCloseAfterCreate(); return; }
    const basePath = window.location.pathname.replace(/\/sales-quotation\/.*$/, '');
    const target = createdDoc.type === 'order' ? 'sales-order' : 'sales-invoice';
    window.location.href = `${basePath}/${target}/${createdDoc.id}`;
  };

  // After creating a document, reload the page to refresh state (badge, readonly, etc.)
  const handleCloseAfterCreate = () => {
    onClose();
    window.location.reload();
  };

  // ── Success state ──────────────────────────────────────────
  if (createdDoc) {
    const docLabel = createdDoc.type === 'order' ? 'Pedido creado' : 'Factura creada';
    const goLabel = createdDoc.type === 'order' ? 'Ver pedido →' : 'Ver factura →';
    const isDraft = createdDoc.status === 'Draft';
    const badgeColor = isDraft ? { bg: '#FEF3C7', text: '#92400E' } : { bg: '#ECFDF5', text: '#059669' };
    const badgeLabel = isDraft ? 'Draft' : 'Completed';

    return (
      <div style={overlayStyle}>
        <div onClick={e => e.stopPropagation()} style={{ ...cardStyle, width: 400 }}>
          <div style={{ padding: '28px 24px', textAlign: 'center' }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%', margin: '0 auto 14px',
              background: '#ECFDF5',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div style={{ fontSize: 15, fontWeight: 500, color: '#111827' }}>
              {docLabel}
            </div>
            <div style={{ fontSize: 12, color: '#6B7280', marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {createdDoc.documentNo && <span>Order #{createdDoc.documentNo}</span>}
              {createdDoc.total && <><span style={{ color: '#D1D5DB' }}>·</span> <span>{createdDoc.total}</span></>}
              <span style={{
                fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 99,
                background: badgeColor.bg, color: badgeColor.text,
              }}>
                {badgeLabel}
              </span>
            </div>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8,
            padding: '12px 16px', borderTop: '0.5px solid #E5E7EB',
          }}>
            <button type="button" onClick={handleCloseAfterCreate} style={btnSecondary}>
              Cerrar
            </button>
            {createdDoc.id && (
              <button type="button" onClick={handleGoToDoc} style={btnPrimary}>
                {goLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Selection state ────────────────────────────────────────
  return (
    <div onClick={onClose} style={overlayStyle}>
      <div onClick={e => e.stopPropagation()} style={cardStyle}>

        {/* Blue card header */}
        <div style={{ padding: '14px 16px 0', position: 'relative' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              position: 'absolute', top: 10, right: 12,
              fontSize: 18, lineHeight: 1, padding: '2px 6px', borderRadius: 4,
              background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF',
            }}
          >
            &times;
          </button>
          <div style={{ fontSize: 10, color: '#9CA3AF', letterSpacing: '0.04em', marginBottom: 8 }}>
            Quotation #{documentNo}
          </div>
          <div style={{
            background: '#E6F1FB', border: '0.5px solid #B5D4F4', borderRadius: 10,
            padding: '14px 16px', marginBottom: 14,
          }}>
            <div style={{ fontSize: 11, color: '#185FA5' }}>
              {bpName}
            </div>
            <div style={{ fontSize: 28, fontWeight: 500, color: '#042C53', lineHeight: 1, marginTop: 4, marginBottom: 6 }}>
              {fmtNum(grandTotal)} {currency}
            </div>
            <div style={{ fontSize: 11, color: '#185FA5' }}>
              {lineCount != null ? lineCount : '...'} líneas <span style={{ color: '#85B7EB' }}>·</span> Subtotal <span style={{ fontWeight: 500, color: '#042C53' }}>{fmtNum(totalLines)} {currency}</span>
            </div>
          </div>
        </div>

        {/* Options */}
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8, borderBottom: '0.5px solid #E5E7EB' }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#6B7280', marginBottom: 2 }}>
            ¿Cómo querés confirmar?
          </div>
          <OptionCard
            selected={selected === 'order'}
            onClick={() => setSelected('order')}
            icon={<ClipboardList size={16} />}
            title="Crear pedido de venta"
            badge="Recomendado"
            subtitle="Para productos con stock, entregas o pedidos con múltiples envíos."
          />
          <OptionCard
            selected={false}
            onClick={() => {}}
            icon={<FileText size={16} />}
            title="Facturar directamente"
            subtitle="Próximamente — por ahora, creá el pedido y facturá desde ahí."
            disabled
          />
        </div>

        {/* Error */}
        {error && (
          <div style={{ padding: '8px 16px', fontSize: 12, color: '#DC2626', background: '#FEF2F2', borderTop: '0.5px solid #FECACA' }}>
            {error}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, padding: '12px 16px' }}>
          <button type="button" onClick={onClose} disabled={loading}
            style={{ ...btnSecondary, opacity: loading ? 0.5 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}>
            Cancelar
          </button>
          <button type="button" onClick={handleConfirm} disabled={loading}
            style={{
              ...btnPrimary,
              opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
            {loading && (
              <svg style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }}
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
            )}
            {loading ? 'Procesando...' : primaryLabel}
          </button>
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    </div>
  );
}

/* ── Option card ───────────────────────────────────────────────── */

function OptionCard({ selected, onClick, icon, title, badge, subtitle, disabled }) {
  return (
    <div
      onClick={disabled ? undefined : onClick}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        border: selected ? '2px solid #3B82F6' : '0.5px solid #E5E7EB',
        borderRadius: 8, padding: selected ? '11px 13px' : '12px 14px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: selected ? '#EFF6FF' : '#fff',
        opacity: disabled ? 0.5 : 1,
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      <div style={{
        width: 32, height: 32, borderRadius: 6, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: selected ? '#fff' : '#F3F4F6',
        color: selected ? '#2563EB' : '#6B7280',
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: selected ? '#2563EB' : '#111827' }}>
            {title}
          </span>
          {badge && (
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 99,
              background: '#ECFDF5', color: '#059669',
              letterSpacing: '0.3px',
            }}>
              {badge}
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: '#6B7280', marginTop: 3, lineHeight: 1.4 }}>
          {subtitle}
        </div>
      </div>
      <div style={{
        width: 18, height: 18, borderRadius: '50%', flexShrink: 0, marginTop: 2,
        border: selected ? 'none' : '1.5px solid #D1D5DB',
        background: selected ? '#3B82F6' : '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {selected && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
      </div>
    </div>
  );
}

/* ── Shared styles ─────────────────────────────────────────────── */

const overlayStyle = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  backgroundColor: 'rgba(0,0,0,0.3)',
};

const cardStyle = {
  width: 480, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
  overflow: 'hidden', borderRadius: 12, backgroundColor: '#fff',
  boxShadow: '0 8px 30px rgba(0,0,0,0.12)', border: '0.5px solid #E5E7EB',
};

const btnSecondary = {
  fontSize: 12, padding: '7px 14px', borderRadius: 6,
  border: '1px solid #D1D5DB', background: 'transparent', color: '#6B7280', cursor: 'pointer',
};

const btnPrimary = {
  fontSize: 12, fontWeight: 500, padding: '7px 16px', borderRadius: 6,
  border: 'none', background: '#185FA5', color: '#fff', cursor: 'pointer',
};
