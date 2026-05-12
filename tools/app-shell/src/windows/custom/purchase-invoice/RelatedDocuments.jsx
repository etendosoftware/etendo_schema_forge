import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUI } from '@/i18n';
import {
  DocChip, RelatedDocumentsShell, STATUS_KEYS, CHIP_ICONS, CHIP_COLORS,
  fetchByCriteria, fetchChild, fetchById,
} from '@/components/related-documents';

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
  const results = await Promise.all(
    paymentIds.map(id => fetchById('payment-out', 'finPayment', id, token, apiBaseUrl))
  );
  return results.filter(Boolean);
}

export default function RelatedDocuments({ recordId, data, token, apiBaseUrl }) {
  const [purchaseOrder, setPurchaseOrder] = useState(null);
  const [receipts, setReceipts] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const navigate = useNavigate();
  const ui = useUI();

  useEffect(() => {
    if (!recordId) return;
    setLoading(true);
    const orderId = data?.salesOrder;
    const orderPromise = orderId
      ? fetchById('purchase-order', 'header', orderId, token, apiBaseUrl).catch(() => null)
      : Promise.resolve(null);
    const receiptPromise = orderId
      ? fetchByCriteria('goods-receipt', 'goodsReceipt', 'salesOrder', orderId, token, apiBaseUrl)
      : Promise.resolve([]);
    Promise.all([orderPromise, receiptPromise, fetchPayments(recordId, token, apiBaseUrl)])
      .then(([orderResult, receiptRows, paymentResults]) => {
        setPurchaseOrder(orderResult);
        setReceipts(receiptRows);
        setPayments(paymentResults);
      })
      .finally(() => setLoading(false));
  }, [recordId, data?.salesOrder, token, apiBaseUrl, refreshKey]);

  const chips = [];

  if (purchaseOrder) {
    chips.push(
      <DocChip
        key="purchase-order"
        icon={CHIP_ICONS.order}
        iconColor={CHIP_COLORS.order}
        title={ui('orderDoc', { number: purchaseOrder.documentNo })}
        amount={purchaseOrder.grandTotalAmount}
        currency={purchaseOrder['currency$_identifier']}
        status={purchaseOrder.documentStatus}
        statusLabel={ui(STATUS_KEYS[purchaseOrder.documentStatus] || purchaseOrder.documentStatus)}
        onClick={() => navigate(`/purchase-order/${purchaseOrder.id}`)}
      />
    );
  }

  // Goods Receipts linked to the same PO
  for (const r of receipts) {
    chips.push(
      <DocChip
        key={`receipt-${r.id}`}
        icon={CHIP_ICONS.shipment}
        iconColor={CHIP_COLORS.shipment}
        title={ui('receiptDoc', { number: r.documentNo })}
        status={r.documentStatus}
        statusLabel={ui(STATUS_KEYS[r.documentStatus] || r.documentStatus)}
        onClick={() => navigate(`/goods-receipt/${r.id}`)}
      />
    );
  }

  // Payments linked to this invoice
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
