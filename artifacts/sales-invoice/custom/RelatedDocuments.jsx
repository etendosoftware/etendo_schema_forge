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
  const navigate = useNavigate();
  const ui = useUI();

  useEffect(() => {
    if (!recordId || !data) { setLoading(false); return; }
    const orderId = data.salesOrder;
    const promises = [];

    if (orderId) {
      promises.push(
        fetchById('sales-order', 'header', orderId, token, apiBaseUrl)
          .then(d => setOrder(d))
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
    }

    if (promises.length === 0) { setLoading(false); return; }
    Promise.all(promises).then(() => setLoading(false));
  }, [recordId, data, token, apiBaseUrl]);

  const chips = [];

  if (order) {
    chips.push(
      <DocChip
        key="order"
        icon={CHIP_ICONS.order}
        iconColor={CHIP_COLORS.order}
        title={ui('orderDoc', { number: order.documentNo })}
        amount={order.grandTotalAmount}
        currency={order['currency$_identifier']}
        status={order.documentStatus}
        statusLabel={ui(STATUS_KEYS[order.documentStatus] || order.documentStatus)}
        onClick={() => navigate(`/sales-order/${order.id}`)}
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
    <RelatedDocumentsShell loading={loading}>
      {chips}
    </RelatedDocumentsShell>
  );
}
