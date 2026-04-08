import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const STATUS_LABELS = {
  CO: 'Completed', DR: 'Draft', VO: 'Voided', CL: 'Closed',
  RPPC: 'Received', RPR: 'Received', PWNC: 'Pending', RDNC: 'Deposited',
};

const STATUS_BADGE = {
  CO: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CL: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  RPPC: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  RPR: 'bg-blue-50 text-blue-700 border-blue-200',
  RDNC: 'bg-blue-50 text-blue-700 border-blue-200',
  DR: 'bg-gray-50 text-gray-600 border-gray-200',
  PWNC: 'bg-amber-50 text-amber-700 border-amber-200',
  VO: 'bg-red-50 text-red-700 border-red-200',
};

const CHIP_ICONS = {
  order: (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
    </svg>
  ),
  invoice: (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6M8 13h8M8 17h8M8 9h2" />
    </svg>
  ),
  returnReceipt: (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M9 17H4a2 2 0 01-2-2V5a2 2 0 012-2h16a2 2 0 012 2v10a2 2 0 01-2 2h-5" />
      <path d="M12 15l-3 3 3 3" />
      <path d="M9 18h8" />
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
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!recordId || !data) { setLoading(false); return; }
    const orderId = data.salesOrder;
    if (!orderId) { setLoading(false); return; }

    const base = neoBase(apiBaseUrl);
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

    const orderPromise = fetch(`${base}/sales-order/header/${orderId}`, { headers })
      .then(r => r.ok ? r.json() : null)
      .then(j => j?.response?.data?.[0] || null)
      .catch(() => null);

    const criteria = JSON.stringify([{ fieldName: 'salesOrder', operator: 'equals', value: orderId }]);
    const params = new URLSearchParams({ criteria, _limit: '50' });
    const invoicePromise = fetch(`${base}/sales-invoice/header?${params}`, { headers })
      .then(r => r.ok ? r.json() : { response: { data: [] } })
      .then(j => j.response?.data || [])
      .catch(() => []);

    Promise.all([orderPromise, invoicePromise]).then(([o, inv]) => {
      setOrder(o);
      setInvoices(inv);
      setLoading(false);
    });
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

  for (const inv of invoices) {
    chips.push(
      <DocChip
        key={`inv-${inv.id}`}
        icon={CHIP_ICONS.invoice}
        iconColor="text-purple-600"
        title={`Invoice #${inv.documentNo}`}
        amount={inv.grandTotalAmount}
        currency={inv['currency$_identifier']}
        status={inv.documentStatus}
        onClick={() => navigate(`/sales-invoice/${inv.id}`)}
      />
    );
  }

  // Return receipts — populated after backend implementation of createReturn action.
  // The shipment data may contain _returnReceipts set by the page after the wizard succeeds.
  const returnReceipts = data?._returnReceipts || [];
  for (const ret of returnReceipts) {
    chips.push(
      <DocChip
        key={`return-${ret.returnReceiptId}`}
        icon={CHIP_ICONS.returnReceipt}
        iconColor="text-amber-600"
        title={`Return #${ret.returnReceiptDocNo}`}
        status={ret.returnReceiptStatus}
        onClick={ret.returnReceiptId ? () => navigate(`/goods-shipment/${ret.returnReceiptId}`) : undefined}
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
