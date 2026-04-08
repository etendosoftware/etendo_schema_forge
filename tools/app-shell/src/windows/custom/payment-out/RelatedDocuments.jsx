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
  invoices: (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6M8 13h8M8 17h8M8 9h2" />
    </svg>
  ),
  orders: (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path d="M9 14l2 2 4-4" />
    </svg>
  ),
};

const CHIP_COLORS = {
  invoices: 'text-purple-600',
  orders: 'text-blue-600',
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
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!recordId) return;
    setLoading(true);
    const base = neoBase(apiBaseUrl);
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    // Fetch payment lines, then resolve linked invoices/orders via their payment schedules
    fetch(`${base}/payment-out/lines?parentId=${recordId}&_limit=50`, { headers })
      .then(r => r.ok ? r.json() : { response: { data: [] } })
      .then(j => j.response?.data || [])
      .then(async (lines) => {
        const seen = new Set();
        const result = [];

        for (const line of lines) {
          // Invoice payment schedule → fetch the schedule to get invoice ID
          const schedId = line.invoicePaymentSchedule;
          if (schedId && !seen.has(`inv-sched-${schedId}`)) {
            seen.add(`inv-sched-${schedId}`);
            try {
              const res = await fetch(`${base}/purchase-invoice/paymentPlan/${schedId}`, { headers });
              if (res.ok) {
                const sched = (await res.json())?.response?.data?.[0];
                const invId = sched?.invoice;
                if (invId && !seen.has(`inv-${invId}`)) {
                  seen.add(`inv-${invId}`);
                  const invRes = await fetch(`${base}/purchase-invoice/header/${invId}`, { headers });
                  if (invRes.ok) {
                    const inv = (await invRes.json())?.response?.data?.[0];
                    if (inv) result.push({ type: 'invoice', ...inv });
                  }
                }
              }
            } catch { /* silent */ }
          }

          // Order payment schedule → fetch the schedule to get order ID
          const orderSchedId = line.orderPaymentSchedule;
          if (orderSchedId && !seen.has(`ord-sched-${orderSchedId}`)) {
            seen.add(`ord-sched-${orderSchedId}`);
            try {
              const res = await fetch(`${base}/purchase-order/paymentPlan/${orderSchedId}`, { headers });
              if (res.ok) {
                const sched = (await res.json())?.response?.data?.[0];
                const ordId = sched?.salesOrder || sched?.order;
                if (ordId && !seen.has(`ord-${ordId}`)) {
                  seen.add(`ord-${ordId}`);
                  const ordRes = await fetch(`${base}/purchase-order/header/${ordId}`, { headers });
                  if (ordRes.ok) {
                    const ord = (await ordRes.json())?.response?.data?.[0];
                    if (ord) result.push({ type: 'order', ...ord });
                  }
                }
              }
            } catch { /* silent */ }
          }
        }

        setDocs(result);
      })
      .catch(() => setDocs([]))
      .finally(() => setLoading(false));
  }, [recordId, token, apiBaseUrl]);

  if (loading) {
    return <span className="text-xs text-muted-foreground">Loading...</span>;
  }

  const chips = [];

  for (const doc of docs) {
    if (doc.type === 'order') {
      chips.push(
        <DocChip
          key={`order-${doc.id}`}
          icon={CHIP_ICONS.orders}
          iconColor={CHIP_COLORS.orders}
          title={`Order #${doc.documentNo}`}
          amount={doc.grandTotalAmount}
          currency={doc['currency$_identifier']}
          status={doc.documentStatus}
          onClick={() => navigate(`/purchase-order/${doc.id}`)}
        />
      );
    } else {
      chips.push(
        <DocChip
          key={`invoice-${doc.id}`}
          icon={CHIP_ICONS.invoices}
          iconColor={CHIP_COLORS.invoices}
          title={`Invoice #${doc.documentNo}`}
          amount={doc.grandTotalAmount}
          currency={doc['currency$_identifier']}
          status={doc.documentStatus}
          onClick={() => navigate(`/purchase-invoice/${doc.id}`)}
        />
      );
    }
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
