import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUI } from '@/i18n';
import {
  DocChip, RelatedDocumentsShell, docChipProps,
  fetchByCriteria, fetchChild, fetchById,
} from '@/components/related-documents';
import { getApSubtype } from '@generated/purchase-invoice/custom/purchaseInvoiceSubtype.js';

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

async function fetchLinkedReturnDeliveries(invoiceId, token, apiBaseUrl) {
  const lines = await fetchChild('purchase-invoice', 'lines', invoiceId, token, apiBaseUrl);
  const shipmentLineIds = [...new Set(lines.filter(l => l.goodsShipmentLine).map(l => l.goodsShipmentLine))];
  if (shipmentLineIds.length === 0) return [];
  const lineRecords = await Promise.all(
    shipmentLineIds.map(id => fetchById('return-to-vendor-shipment', 'returnToVendorShipmentLine', id, token, apiBaseUrl))
  );
  const shipmentIds = [...new Set(lineRecords.filter(Boolean).map(l => l.parentId || l.inOut).filter(Boolean))];
  if (shipmentIds.length === 0) return [];
  const results = await Promise.all(
    shipmentIds.map(id => fetchById('return-to-vendor-shipment', 'returnToVendorShipment', id, token, apiBaseUrl))
  );
  return results.filter(Boolean);
}

export default function RelatedDocuments({ recordId, data, token, apiBaseUrl, docsRefreshSignal }) {
  const [purchaseOrder, setPurchaseOrder] = useState(null);
  const [receipts, setReceipts] = useState([]);
  const [payments, setPayments] = useState([]);
  const [returnDeliveries, setReturnDeliveries] = useState([]);
  const [originInvoice, setOriginInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const navigate = useNavigate();
  const ui = useUI();

  // ETP-4737: resolved via getApSubtype — NOT a hardcoded doc-type-name Set. A
  // fixed name Set silently misses any new document type sharing the same
  // category (this is exactly how this check missed "Factura Rectificativa
  // (compras)" until this fix; see PurchaseInvoiceHeaderTable.jsx for the same fix).
  const apSubtype = getApSubtype(data);
  const isReturn = apSubtype === 'RECTIFICATIVA';

  useEffect(() => {
    if (!recordId) return;
    setLoading(true);

    let promise;
    if (isReturn) {
      promise = Promise.all([
        fetchLinkedReturnDeliveries(recordId, token, apiBaseUrl).catch(() => []),
        fetchPayments(recordId, token, apiBaseUrl),
      ]).then(([deliveries, paymentResults]) => {
        setReturnDeliveries(deliveries);
        setPayments(paymentResults);
        setPurchaseOrder(null);
        setReceipts([]);
      });
    } else {
      const orderId = data?.salesOrder;
      const orderPromise = orderId
        ? fetchById('purchase-order', 'header', orderId, token, apiBaseUrl).catch(() => null)
        : Promise.resolve(null);
      const backendReceipts = Array.isArray(data?.linkedReceipts) ? data.linkedReceipts : null;
      const fallbackReceiptPromise = orderId
        ? fetchByCriteria('goods-receipt', 'goodsReceipt', 'salesOrder', orderId, token, apiBaseUrl)
        : Promise.resolve([]);
      const receiptPromise = backendReceipts !== null
        ? Promise.resolve(backendReceipts)
        : fallbackReceiptPromise;
      promise = Promise.all([orderPromise, receiptPromise, fetchPayments(recordId, token, apiBaseUrl)])
        .then(([orderResult, receiptRows, paymentResults]) => {
          setPurchaseOrder(orderResult);
          setReceipts(receiptRows);
          setPayments(paymentResults);
          setReturnDeliveries([]);
        });
    }
    // ETP-4737: `originInvoice` is set when this rectificativa was created via the
    // "Import from Source Invoice" popup (manual correction) — independent of the
    // isReturn branch above (which covers the auto-generated-from-Albarán case).
    // Server injects just the id (+ _identifier), not the full record, so fetch it here.
    const originInvoicePromise = data?.originInvoice
      ? fetchById('purchase-invoice', 'header', data.originInvoice, token, apiBaseUrl).catch(() => null)
      : Promise.resolve(null);
    promise = Promise.all([promise, originInvoicePromise]).then(([, originResult]) => {
      setOriginInvoice(originResult);
    });
    promise.finally(() => setLoading(false));
  }, [recordId, apSubtype, data?.salesOrder, data?.linkedReceipts, data?.originInvoice, token, apiBaseUrl, refreshKey, docsRefreshSignal]);

  const chips = [];

  for (const rd of returnDeliveries) {
    chips.push(
      <DocChip
        key={`return-delivery-${rd.id}`}
        {...docChipProps({ type: 'return-to-vendor', doc: rd, ui, navigate })}
        data-testid="DocChip__bb79ed" />
    );
  }

  if (purchaseOrder) {
    chips.push(
      <DocChip
        key="purchase-order"
        {...docChipProps({ type: 'order', doc: purchaseOrder, ui, navigate })}
        data-testid="DocChip__bb79ed" />
    );
  }

  for (const r of receipts) {
    chips.push(
      <DocChip
        key={`receipt-${r.id}`}
        {...docChipProps({ type: r.isReturn ? 'return-to-vendor' : 'receipt', doc: r, ui, navigate })}
        data-testid="DocChip__bb79ed" />
    );
  }

  if (originInvoice) {
    chips.push(
      <DocChip
        key="origin-invoice"
        {...docChipProps({ type: 'invoice', doc: originInvoice, ui, navigate })}
        data-testid="DocChip__bb79ed" />
    );
  }

  for (const p of payments) {
    chips.push(
      <DocChip
        key={`payment-${p.id}`}
        {...docChipProps({ type: 'payment', doc: p, ui, navigate })}
        data-testid="DocChip__bb79ed" />
    );
  }

  return (
    <RelatedDocumentsShell
      loading={loading}
      onRefresh={() => setRefreshKey(k => k + 1)}
      data-testid="RelatedDocumentsShell__bb79ed">
      {chips}
    </RelatedDocumentsShell>
  );
}
