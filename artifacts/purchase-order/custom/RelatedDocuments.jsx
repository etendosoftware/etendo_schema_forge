import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUI } from '@/i18n';
import {
  DocChip, RelatedDocumentsShell, STATUS_KEYS, CHIP_ICONS, CHIP_COLORS,
  fetchByCriteria, fetchChild, fetchById,
} from '@/components/related-documents';

const RELATED_SPECS = [
  {
    key: 'goods-receipt',
    icon: 'receipt',
    specName: 'goods-receipt',
    entityName: 'goodsReceipt',
    filterColumn: 'salesOrder',
    route: '/goods-receipt',
    titleKey: 'receiptDoc',
    format: (row) => ({
      title: row.documentNo,
      date: row.movementDate,
      status: row.documentStatus,
    }),
  },
  {
    key: 'purchase-invoice',
    icon: 'invoice',
    specName: 'purchase-invoice',
    entityName: 'header',
    filterColumn: 'salesOrder',
    route: '/purchase-invoice',
    titleKey: 'invoiceDoc',
    format: (row) => ({
      title: row.documentNo,
      date: row.invoiceDate,
      amount: row.grandTotalAmount,
      currency: row['currency$_identifier'],
      status: row.documentStatus,
    }),
  },
];

async function fetchPayments(orderId, token, apiBaseUrl) {
  const plans = await fetchChild('purchase-order', 'paymentPlan', orderId, token, apiBaseUrl);
  if (plans.length === 0) return [];
  const detailResults = await Promise.all(
    plans.map(plan => fetchChild('purchase-order', 'paymentDetails', plan.id, token, apiBaseUrl))
  );
  const seen = new Set();
  const paymentIds = detailResults.flat()
    .filter(d => d.payment && !seen.has(d.payment))
    .map(d => { seen.add(d.payment); return d.payment; });
  if (paymentIds.length === 0) return [];
  const results = await Promise.all(
    paymentIds.map(id => fetchById('payment-out', 'finPayment', id, token, apiBaseUrl))
  );
  return results.filter(Boolean);
}

export default function RelatedDocuments({ recordId, data, token, apiBaseUrl }) {
  const [related, setRelated] = useState({});
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const navigate = useNavigate();
  const ui = useUI();

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
  }, [recordId, token, apiBaseUrl, refreshKey]);

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
          title={ui(spec.titleKey, { number: f.title })}
          amount={f.amount}
          currency={f.currency}
          status={f.status}
          statusLabel={ui(STATUS_KEYS[f.status] || f.status)}
          onClick={() => navigate(`${spec.route}/${row.id}`)}
        />
      );
    }
  }

  for (const p of payments) {
    chips.push(
      <DocChip
        key={`payment-${p.id}`}
        icon={CHIP_ICONS.payment}
        iconColor={CHIP_COLORS.payment}
        title={ui('paymentDoc', { number: p.documentNo || p.id })}
        amount={p.amount}
        currency={p['currency$_identifier']}
        status={p.status}
        statusLabel={ui(STATUS_KEYS[p.status] || p.status)}
        onClick={() => navigate(`/payment-out/${p.id}`)}
      />
    );
  }

  return (
    <RelatedDocumentsShell loading={loading} onRefresh={() => setRefreshKey(k => k + 1)}>
      {chips}
    </RelatedDocumentsShell>
  );
}
