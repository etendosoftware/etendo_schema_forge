import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUI } from '@/i18n';

const CRITERIA = (field, value) =>
  encodeURIComponent(JSON.stringify([{ fieldName: field, operator: 'equals', value }]));

export default function OrderDraftChips({ data, recordId, token, apiBaseUrl }) {
  const navigate = useNavigate();
  const ui = useUI();
  const [state, setState] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const isCompleted = data?.documentStatus === 'CO';

  useEffect(() => {
    const handler = () => setRefreshKey(k => k + 1);
    window.addEventListener('sales-order:document-created', handler);
    return () => window.removeEventListener('sales-order:document-created', handler);
  }, []);

  useEffect(() => {
    if (!isCompleted || !recordId) return;
    let cancelled = false;

    const base = (apiBaseUrl || '').replace(/\/[^/]+$/, '');
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    Promise.all([
      fetch(`${base}/goods-shipment/goodsShipment?criteria=${CRITERIA('salesOrder', recordId)}&_limit=50`, { headers })
        .then(r => r.ok ? r.json() : null)
        .then(j => j?.response?.data ?? [])
        .catch(() => []),
      fetch(`${apiBaseUrl}/header/${recordId}/action/listInvoices`, { headers })
        .then(r => r.ok ? r.json() : null)
        .then(j => j?.response?.data ?? [])
        .catch(() => []),
      fetch(`${apiBaseUrl}/lines?parentId=${recordId}&_startRow=0&_endRow=999`, { headers })
        .then(r => r.ok ? r.json() : null)
        .then(j => j?.response?.data ?? [])
        .catch(() => []),
    ]).then(([shipments, invoices, orderLines]) => {
      if (cancelled) return;

      const shipmentsDraft    = shipments.filter(s => s.documentStatus === 'DR');
      const shipmentsComplete = shipments.filter(s => s.documentStatus === 'CO');
      const invoiceDraft      = invoices.find(i => i.documentStatus === 'DR') ?? null;
      const invoicesComplete  = invoices.filter(i => i.documentStatus === 'CO');

      const qtyOrdered   = orderLines.reduce((s, l) => s + (Number(l.orderedQuantity)   || 0), 0);
      const qtyDelivered = orderLines.reduce((s, l) => s + (Number(l.deliveredQuantity) || 0), 0);
      const qtyPending   = Math.max(0, qtyOrdered - qtyDelivered);

      const totalOrder    = Number(data?.grandTotalAmount) || 0;
      const totalInvoiced = invoicesComplete.reduce((s, i) => s + (Number(i.grandTotalAmount) || 0), 0);
      const totalPending  = Math.max(0, totalOrder - totalInvoiced);

      const allDelivered = qtyPending === 0 && shipmentsDraft.length === 0 && shipmentsComplete.length > 0;
      const allInvoiced  = totalPending < 0.01 && !invoiceDraft && invoicesComplete.length > 0;

      setState({ shipmentsDraft, invoiceDraft, allDelivered, allInvoiced });
    });

    return () => { cancelled = true; };
  }, [isCompleted, recordId, token, apiBaseUrl, refreshKey, data?.grandTotalAmount]);

  if (!isCompleted || !state) return null;

  const { shipmentsDraft, invoiceDraft, allDelivered, allInvoiced } = state;

  if (shipmentsDraft.length === 0 && !invoiceDraft && !allDelivered && !allInvoiced) return null;

  return (
    <>
      {/* Completion badges — same pill shape as ● Completado, secondary colors */}
      {allDelivered && <CompletionBadge label={ui('soAllDelivered')} />}
      {allInvoiced  && <CompletionBadge label={ui('soAllInvoiced')} />}

      {/* Draft chips — only visible when not yet complete */}
      {shipmentsDraft.length === 1 && (
        <DraftPill
          icon="🚚"
          label={ui('soShipmentSection')}
          sub={shipmentsDraft[0].documentNo || ui('soInDraft')}
          onClick={() => navigate(`/goods-shipment/${shipmentsDraft[0].id}`)}
        />
      )}
      {shipmentsDraft.length > 1 && (
        <DraftPill
          icon="🚚"
          label={ui('soNShipments', { count: shipmentsDraft.length })}
          sub={ui('soInDraft')}
          onClick={() => window.dispatchEvent(
            new CustomEvent('sales-order:open-actions-modal', { detail: { scrollTo: 'shipment' } })
          )}
        />
      )}
      {invoiceDraft && (
        <DraftPill
          icon="🧾"
          label={ui('soInvoiceSection')}
          sub={invoiceDraft.documentNo || ui('soInDraft')}
          onClick={() => navigate(`/sales-invoice/${invoiceDraft.id}`)}
        />
      )}
    </>
  );
}

function CompletionBadge({ label }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 12px', borderRadius: 6,
      fontSize: 12, fontWeight: 500,
      background: '#F3F4F6', color: '#374151',
      border: '1px solid #E5E7EB',
    }}>
      <span style={{ color: '#16A34A' }}>✓</span>
      {label}
    </span>
  );
}

function DraftPill({ icon, label, sub, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[13px] font-medium bg-amber-50 text-amber-800 hover:bg-amber-100 transition-colors"
      style={{ border: 'none', cursor: 'pointer' }}
    >
      <span className="w-2 h-2 rounded-full shrink-0 bg-amber-400" />
      {icon} {label}
      <span style={{ opacity: 0.4, margin: '0 1px' }}>·</span>
      <span className="font-semibold">{sub}</span>
    </button>
  );
}
