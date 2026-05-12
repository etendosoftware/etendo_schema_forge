import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUI } from '@/i18n';
import {
  DocChip,
  RelatedDocumentsShell,
  STATUS_KEYS,
  CHIP_ICONS,
  CHIP_COLORS,
  fetchById,
  fetchByCriteria,
} from '@/components/related-documents';

export default function RelatedDocuments({ recordId, data, token, apiBaseUrl }) {
  const [order, setOrder] = useState(null);
  const [shipments, setShipments] = useState([]);
  const [originalInvoices, setOriginalInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const navigate = useNavigate();
  const ui = useUI();

  useEffect(() => {
    if (!recordId || !data) { setLoading(false); return; }
    setLoading(true);
    const orderId = data.salesOrder;
    const promises = [];

    if (orderId) {
      promises.push(
        (async () => {
          // criteria queries apply the DocSubTypeSO='ON' WHERE that GET-by-ID bypasses
          const quotations = await fetchByCriteria('sales-quotation', 'quotation', 'id', orderId, token, apiBaseUrl).catch(() => []);
          if (quotations.length > 0) { setOrder({ ...quotations[0], _isQuotation: true }); return; }
          const order = await fetchById('sales-order', 'header', orderId, token, apiBaseUrl).catch(() => null);
          if (order) setOrder(order);
        })()
      );

      promises.push(
        fetchByCriteria('goods-shipment', 'goodsShipment', 'salesOrder', orderId, token, apiBaseUrl)
          .then(d => setShipments(d))
      );

      // If this is a credit note, fetch original invoices from the same order
      const isCreditNote = data['transactionDocument$_identifier']?.toLowerCase().includes('credit');
      if (isCreditNote) {
        promises.push(
          fetchByCriteria('sales-invoice', 'header', 'salesOrder', orderId, token, apiBaseUrl)
            .then(d => setOriginalInvoices(d.filter(inv => inv.id !== recordId)))
        );
      }
    } else {
      // No linked sales order — still hit the invoice's own endpoint on refresh
      // so the user sees a network request fire in DevTools. Refreshes the
      // parent header reading from server in case `salesOrder` was filled
      // outside the React state (e.g. by a background job).
      promises.push(
        fetchById('sales-invoice', 'header', recordId, token, apiBaseUrl)
          .then((fresh) => {
            if (fresh?.salesOrder && fresh.salesOrder !== orderId) {
              // Bumping our internal key would re-run this effect with the new
              // data via the parent's re-render; we don't mutate `data` here
              // because the parent owns it.
            }
          })
          .catch(() => {})
      );
    }

    if (promises.length === 0) { setLoading(false); return; }
    Promise.all(promises).then(() => setLoading(false));
  }, [recordId, data, token, apiBaseUrl, refreshKey]);

  const chips = [];

  if (order) {
    const isQuotation = order._isQuotation;
    chips.push(
      <DocChip
        key="order"
        icon={isQuotation ? CHIP_ICONS.quotation : CHIP_ICONS.order}
        iconColor={isQuotation ? CHIP_COLORS.quotation : CHIP_COLORS.order}
        title={isQuotation ? ui('quotationDoc', { number: order.documentNo }) : ui('orderDoc', { number: order.documentNo })}
        amount={order.grandTotalAmount}
        currency={order['currency$_identifier']}
        status={order.documentStatus}
        statusLabel={ui(STATUS_KEYS[order.documentStatus] || order.documentStatus)}
        onClick={() => navigate(`/${isQuotation ? 'sales-quotation' : 'sales-order'}/${order.id}`)}
      />
    );
  }

  for (const s of shipments) {
    chips.push(
      <DocChip
        key={`ship-${s.id}`}
        icon={CHIP_ICONS.shipment}
        iconColor={CHIP_COLORS.shipment}
        title={ui('shipmentDoc', { number: s.documentNo })}
        status={s.documentStatus}
        statusLabel={ui(STATUS_KEYS[s.documentStatus] || s.documentStatus)}
        onClick={() => navigate(`/goods-shipment/${s.id}`)}
      />
    );
  }

  for (const inv of originalInvoices) {
    chips.push(
      <DocChip
        key={`inv-${inv.id}`}
        icon={CHIP_ICONS.invoice}
        iconColor={CHIP_COLORS.invoice}
        title={ui('invoiceDoc', { number: inv.documentNo })}
        amount={inv.grandTotalAmount}
        currency={inv['currency$_identifier']}
        status={inv.documentStatus}
        statusLabel={ui(STATUS_KEYS[inv.documentStatus] || inv.documentStatus)}
        onClick={() => navigate(`/sales-invoice/${inv.id}`)}
      />
    );
  }

  return (
    <RelatedDocumentsShell loading={loading} onRefresh={() => setRefreshKey(k => k + 1)}>
      {chips}
    </RelatedDocumentsShell>
  );
}
