import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUI } from '@/i18n';
import {
  DocChip, RelatedDocumentsShell, docChipProps,
  fetchByCriteria, fetchChild, fetchById,
} from '@/components/related-documents';

// Pre-existing divergence (ETP-3878 F10): this window renders goods-receipt
// chips with the `receipt` icon, while purchase-invoice uses `shipment`.
// Preserved via iconKey override below.
const RELATED_SPECS = [
  { key: 'goods-receipt', type: 'receipt', iconKey: 'receipt', specName: 'goods-receipt', entityName: 'goodsReceipt', filterColumn: 'salesOrder' },
  { key: 'purchase-invoice', type: 'invoice', specName: 'purchase-invoice', entityName: 'header', filterColumn: 'salesOrder' },
];

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
      chips.push(
        <DocChip
          key={`${spec.key}-${row.id}`}
          {...docChipProps({ type: spec.type, doc: row, ui, navigate, iconKey: spec.iconKey })}
          data-testid="DocChip__4efe59" />
      );
    }
  }

  for (const p of payments) {
    chips.push(
      <DocChip
        key={`payment-${p.id}`}
        {...docChipProps({ type: 'payment', doc: p, ui, navigate })}
        data-testid="DocChip__4efe59" />
    );
  }

  return (
    <RelatedDocumentsShell
      loading={loading}
      onRefresh={() => setRefreshKey(k => k + 1)}
      data-testid="RelatedDocumentsShell__4efe59">
      {chips}
    </RelatedDocumentsShell>
  );
}
