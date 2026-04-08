import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const STATUS_LABELS = {
  CO: 'Completed', DR: 'Draft', VO: 'Voided', CL: 'Closed',
  PPM: 'Payment Made', PWNC: 'Pending', RDNC: 'Deposited', RPPC: 'Payment Cleared',
};

const STATUS_BADGE = {
  CO: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CL: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PPM: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  RPPC: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  DR: 'bg-gray-50 text-gray-600 border-gray-200',
  PWNC: 'bg-amber-50 text-amber-700 border-amber-200',
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
  receipts: (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="3" width="22" height="5" rx="1" />
      <path d="M1 8l2 13h18l2-13" />
    </svg>
  ),
  payments: (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10" />
      <path d="M16 8h-4a2 2 0 100 4h2a2 2 0 110 4H8M12 6v2m0 8v2" />
    </svg>
  ),
};

const CHIP_COLORS = {
  orders: 'text-blue-600',
  receipts: 'text-teal-600',
  payments: 'text-emerald-600',
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

function fetchChild(specName, entityName, parentId, token, apiBaseUrl) {
  const base = neoBase(apiBaseUrl);
  return fetch(`${base}/${specName}/${encodeURIComponent(entityName)}?parentId=${parentId}&_limit=50`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
    .then(r => r.ok ? r.json() : { response: { data: [] } })
    .then(j => j.response?.data || [])
    .catch(() => []);
}

async function fetchPayments(invoiceId, token, apiBaseUrl) {
  const plans = await fetchChild('purchase-invoice', 'paymentPlan', invoiceId, token, apiBaseUrl);
  if (plans.length === 0) return [];
  const detailResults = await Promise.all(
    plans.map(plan => fetchChild('purchase-invoice', 'paymentDetails', plan.id, token, apiBaseUrl))
  );
  const seen = new Set();
  const paymentIds = detailResults.flat()
    .filter(d => d.payment && !seen.has(d.payment))
    .map(d => { seen.add(d.payment); return d.payment; });
  if (paymentIds.length === 0) return [];
  const base = neoBase(apiBaseUrl);
  const results = await Promise.all(paymentIds.map(id =>
    fetch(`${base}/payment-out/finPayment/${id}`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
      .then(r => r.ok ? r.json() : null)
      .then(j => j?.response?.data?.[0] || null)
      .catch(() => null)
  ));
  return results.filter(Boolean);
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
  const [receipts, setReceipts] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!recordId) return;
    setLoading(true);
    const orderId = data?.salesOrder;
    const receiptPromise = orderId
      ? fetchByCriteria('goods-receipt', 'goodsReceipt', 'salesOrder', orderId, token, apiBaseUrl)
      : Promise.resolve([]);
    Promise.all([receiptPromise, fetchPayments(recordId, token, apiBaseUrl)])
      .then(([receiptRows, paymentResults]) => {
        setReceipts(receiptRows);
        setPayments(paymentResults);
      })
      .finally(() => setLoading(false));
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

  // Goods Receipts linked to the same PO
  for (const r of receipts) {
    chips.push(
      <DocChip
        key={`receipt-${r.id}`}
        icon={CHIP_ICONS.receipts}
        iconColor={CHIP_COLORS.receipts}
        title={`Receipt #${r.documentNo}`}
        status={r.documentStatus}
        onClick={() => navigate(`/goods-receipt/${r.id}`)}
      />
    );
  }

  // Payments linked to this invoice
  for (const p of payments) {
    chips.push(
      <DocChip
        key={`payment-${p.id}`}
        icon={CHIP_ICONS.payments}
        iconColor={CHIP_COLORS.payments}
        title={`Payment #${p.documentNo || p.id}`}
        amount={p.amount}
        currency={p['currency$_identifier']}
        status={p.status}
        onClick={() => navigate(`/payment-out/${p.id}`)}
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
