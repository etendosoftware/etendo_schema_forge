import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const STATUS_LABELS = {
  CO: 'Completed', DR: 'Draft', VO: 'Voided', CL: 'Closed',
  RPPC: 'Payment Cleared', PPM: 'Payment Made', PWNC: 'Pending', RDNC: 'Deposited',
};

const STATUS_BADGE = {
  CO: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CL: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  DR: 'bg-gray-50 text-gray-600 border-gray-200',
  VO: 'bg-red-50 text-red-700 border-red-200',
};

const CHIP_ICONS = {
  orders: (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path d="M9 14l2 2 4-4" />
    </svg>
  ),
  invoices: (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6M8 13h8M8 17h8M8 9h2" />
    </svg>
  ),
};

const CHIP_COLORS = {
  orders: 'text-blue-600',
  invoices: 'text-purple-600',
};

function neoBase(apiBaseUrl) {
  return (apiBaseUrl || '').replace(/\/[^/]+$/, '');
}

function fetchByCriteria(specName, entityName, fieldName, value, token, apiBaseUrl) {
  const base = neoBase(apiBaseUrl);
  const criteria = JSON.stringify([{ fieldName, operator: 'equals', value }]);
  const params = new URLSearchParams({ criteria, _limit: '50' });
  return fetch(`${base}/${specName}/${entityName}?${params}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
    .then(r => r.ok ? r.json() : { response: { data: [] } })
    .then(j => j.response?.data || [])
    .catch(() => []);
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
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!recordId) return;
    setLoading(true);
    // Find invoices linked to the same Purchase Order as this Goods Receipt
    const orderId = data?.salesOrder;
    if (orderId) {
      fetchByCriteria('purchase-invoice', 'header', 'salesOrder', orderId, token, apiBaseUrl)
        .then(rows => setInvoices(rows))
        .finally(() => setLoading(false));
    } else {
      setInvoices([]);
      setLoading(false);
    }
  }, [recordId, data?.salesOrder, token, apiBaseUrl]);

  if (loading) {
    return <span className="text-xs text-muted-foreground">Loading...</span>;
  }

  const chips = [];

  // Purchase Order from header data
  const orderId = data?.salesOrder;
  const orderLabel = data?.['salesOrder$_identifier'];
  if (orderId) {
    chips.push(
      <DocChip
        key="purchase-order"
        icon={CHIP_ICONS.orders}
        iconColor={CHIP_COLORS.orders}
        title={orderLabel || `Order ${orderId}`}
        onClick={() => navigate(`/purchase-order/${orderId}`)}
      />
    );
  }

  // Purchase Invoices linked to this receipt
  for (const inv of invoices) {
    chips.push(
      <DocChip
        key={`invoice-${inv.id}`}
        icon={CHIP_ICONS.invoices}
        iconColor={CHIP_COLORS.invoices}
        title={`Invoice #${inv.documentNo}`}
        amount={inv.grandTotalAmount}
        currency={inv['currency$_identifier']}
        status={inv.documentStatus}
        onClick={() => navigate(`/purchase-invoice/${inv.id}`)}
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
