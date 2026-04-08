import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const STATUS_LABELS = {
  CO: 'Completed', DR: 'Draft', VO: 'Voided', CL: 'Closed',
};

const STATUS_BADGE = {
  CO: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CL: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  DR: 'bg-gray-50 text-gray-600 border-gray-200',
  VO: 'bg-red-50 text-red-700 border-red-200',
};

const CHIP_ICONS = {
  order: (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
    </svg>
  ),
  shipment: (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="3" width="22" height="5" rx="1" />
      <path d="M1 8l2 13h18l2-13" />
    </svg>
  ),
  invoice: (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="13" y2="17" />
    </svg>
  ),
};

function neoBase(apiBaseUrl) {
  return (apiBaseUrl || '').replace(/\/[^/]+$/, '');
}

function formatAmount(val, currency) {
  if (val == null) return '';
  const num = typeof val === 'string' ? parseFloat(val) : val;
  const formatted = num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${formatted} ${currency}` : formatted;
}

function DocChip({ icon, iconColor, title, amount, currency, status, onClick }) {
  const badgeClass = STATUS_BADGE[status] || 'bg-gray-50 text-gray-600 border-gray-200';
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-border/40 rounded-full bg-white hover:bg-muted/30 transition-colors text-sm cursor-pointer"
      style={{ borderWidth: '0.5px' }}
    >
      <span className={`shrink-0 ${iconColor}`}>{icon}</span>
      <span className="font-medium text-foreground/80">{title}</span>
      {amount != null && (
        <span className="text-xs text-muted-foreground tabular-nums">{formatAmount(amount, currency)}</span>
      )}
      {status && (
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${badgeClass}`} style={{ borderWidth: '0.5px' }}>
          {STATUS_LABELS[status] || status}
        </span>
      )}
    </button>
  );
}

export default function RelatedDocuments({ recordId, data, token, apiBaseUrl }) {
  const [order, setOrder] = useState(null);
  const [shipments, setShipments] = useState([]);
  const [originalInvoices, setOriginalInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!recordId || !data) { setLoading(false); return; }
    const orderId = data.salesOrder;
    const base = neoBase(apiBaseUrl);
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
    const promises = [];

    if (orderId) {
      promises.push(
        fetch(`${base}/sales-order/header/${orderId}`, { headers })
          .then(r => r.ok ? r.json() : null)
          .then(j => { setOrder(j?.response?.data?.[0] || null); })
          .catch(() => setOrder(null))
      );

      const criteria = JSON.stringify([{ fieldName: 'salesOrder', operator: 'equals', value: orderId }]);
      const params = new URLSearchParams({ criteria, _limit: '50' });
      promises.push(
        fetch(`${base}/goods-shipment/goodsShipment?${params}`, { headers })
          .then(r => r.ok ? r.json() : { response: { data: [] } })
          .then(j => setShipments(j.response?.data || []))
          .catch(() => setShipments([]))
      );

      // If this is a credit note, fetch original invoices from the same order
      const isCreditNote = data['transactionDocument$_identifier']?.toLowerCase().includes('credit');
      if (isCreditNote) {
        const invCriteria = JSON.stringify([{ fieldName: 'salesOrder', operator: 'equals', value: orderId }]);
        const invParams = new URLSearchParams({ criteria: invCriteria, _limit: '50' });
        promises.push(
          fetch(`${base}/sales-invoice/header?${invParams}`, { headers })
            .then(r => r.ok ? r.json() : { response: { data: [] } })
            .then(j => {
              const invoices = (j.response?.data || []).filter(inv => inv.id !== recordId);
              setOriginalInvoices(invoices);
            })
            .catch(() => setOriginalInvoices([]))
        );
      }
    }

    if (promises.length === 0) { setLoading(false); return; }
    Promise.all(promises).then(() => setLoading(false));
  }, [recordId, data, token, apiBaseUrl]);

  if (loading) return <span className="text-xs text-muted-foreground">Loading...</span>;

  const chips = [];

  if (order) {
    chips.push(
      <DocChip
        key="order"
        icon={CHIP_ICONS.order}
        iconColor="text-amber-600"
        title={`Order #${order.documentNo}`}
        amount={order.grandTotalAmount}
        currency={order['currency$_identifier']}
        status={order.documentStatus}
        onClick={() => navigate(`/sales-order/${order.id}`)}
      />
    );
  }

  for (const s of shipments) {
    chips.push(
      <DocChip
        key={`ship-${s.id}`}
        icon={CHIP_ICONS.shipment}
        iconColor="text-blue-600"
        title={`Shipment #${s.documentNo}`}
        status={s.documentStatus}
        onClick={() => navigate(`/goods-shipment/${s.id}`)}
      />
    );
  }

  for (const inv of originalInvoices) {
    chips.push(
      <DocChip
        key={`inv-${inv.id}`}
        icon={CHIP_ICONS.invoice}
        iconColor="text-violet-600"
        title={`Invoice #${inv.documentNo}`}
        amount={inv.grandTotalAmount}
        currency={inv['currency$_identifier']}
        status={inv.documentStatus}
        onClick={() => navigate(`/sales-invoice/${inv.id}`)}
      />
    );
  }

  if (chips.length === 0) {
    return <span className="text-xs text-muted-foreground/50">No related documents</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips}
    </div>
  );
}
