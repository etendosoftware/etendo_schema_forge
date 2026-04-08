import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const STATUS_LABELS = {
  CO: 'Completed', DR: 'Draft', VO: 'Voided', CL: 'Closed',
  RPPC: 'Payment Cleared', PPM: 'Payment Made', PWNC: 'Pending', RDNC: 'Deposited',
};

const STATUS_BADGE = {
  CO: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CL: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  RPPC: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PPM: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  DR: 'bg-gray-50 text-gray-600 border-gray-200',
  PWNC: 'bg-amber-50 text-amber-700 border-amber-200',
  VO: 'bg-red-50 text-red-700 border-red-200',
};

const CHIP_ICONS = {
  receipts: (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="3" width="22" height="5" rx="1" />
      <path d="M1 8l2 13h18l2-13" />
    </svg>
  ),
  invoices: (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6M8 13h8M8 17h8M8 9h2" />
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
  receipts: 'text-blue-600',
  invoices: 'text-purple-600',
  payments: 'text-emerald-600',
};

const RELATED_SPECS = [
  {
    key: 'goods-receipt',
    label: 'Receipts',
    icon: 'receipts',
    specName: 'goods-receipt',
    entityName: 'goodsReceipt',
    filterColumn: 'salesOrder',
    route: '/goods-receipt',
    format: (row) => ({
      title: `Receipt #${row.documentNo}`,
      date: row.movementDate,
      status: row.documentStatus,
    }),
  },
  {
    key: 'purchase-invoice',
    label: 'Invoices',
    icon: 'invoices',
    specName: 'purchase-invoice',
    entityName: 'header',
    filterColumn: 'salesOrder',
    route: '/purchase-invoice',
    format: (row) => ({
      title: `Invoice #${row.documentNo}`,
      date: row.invoiceDate,
      amount: row.grandTotalAmount,
      currency: row['currency$_identifier'],
      status: row.documentStatus,
    }),
  },
];

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

async function fetchPayments(orderId, token, apiBaseUrl) {
  const plans = await fetchChild('purchase-order', 'Payment Plan', orderId, token, apiBaseUrl);
  if (plans.length === 0) return [];
  const detailResults = await Promise.all(
    plans.map(plan => fetchChild('purchase-order', 'Payment Details', plan.id, token, apiBaseUrl))
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
  const [related, setRelated] = useState({});
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!recordId) return;
    setLoading(true);
    const specPromises = RELATED_SPECS.map(s =>
      fetchByCriteria(s.specName, s.entityName, s.filterColumn, recordId, token, apiBaseUrl)
        .then(rows => ({ key: s.key, rows }))
    );
    Promise.all([Promise.all(specPromises), fetchPayments(recordId, token, apiBaseUrl)])
      .then(([specResults, paymentResults]) => {
        const map = {};
        for (const r of specResults) map[r.key] = r.rows;
        setRelated(map);
        setPayments(paymentResults);
        setLoading(false);
      });
  }, [recordId, token, apiBaseUrl]);

  if (loading) {
    return <span className="text-xs text-muted-foreground">Loading...</span>;
  }

  const chips = [];

  for (const spec of RELATED_SPECS) {
    const rows = related[spec.key] || [];
    for (const row of rows) {
      const f = spec.format(row);
      chips.push(
        <DocChip
          key={`${spec.key}-${row.id}`}
          icon={CHIP_ICONS[spec.icon]}
          iconColor={CHIP_COLORS[spec.icon]}
          title={f.title}
          amount={f.amount}
          currency={f.currency}
          status={f.status}
          onClick={() => navigate(`${spec.route}/${row.id}`)}
        />
      );
    }
  }

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
