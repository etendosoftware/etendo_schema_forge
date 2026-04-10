import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DocChip, RelatedDocumentsShell, STATUS_KEYS, CHIP_ICONS, CHIP_COLORS, fetchByCriteria, fetchById } from '@/components/related-documents';
import { useUI } from '@/i18n';

export default function RelatedDocuments({ recordId, data, token, apiBaseUrl }) {
  const [order, setOrder] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const ui = useUI();

  useEffect(() => {
    if (!recordId || !data) { setLoading(false); return; }
    const orderId = data.salesOrder;
    if (!orderId) { setLoading(false); return; }

    Promise.all([
      fetchById('sales-order', 'header', orderId, token, apiBaseUrl),
      fetchByCriteria('sales-invoice', 'header', 'salesOrder', orderId, token, apiBaseUrl),
    ]).then(([o, inv]) => {
      setOrder(o);
      setInvoices(inv);
      setLoading(false);
    });
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

  for (const inv of invoices) {
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

  // Return receipts — populated after backend implementation of createReturn action.
  const returnReceipts = data?._returnReceipts || [];
  for (const ret of returnReceipts) {
    chips.push(
      <DocChip
        key={`return-${ret.returnReceiptId}`}
        icon={CHIP_ICONS.returnDoc}
        iconColor={CHIP_COLORS.returnDoc}
        title={ui('returnDoc', { number: ret.returnReceiptDocNo })}
        status={ret.returnReceiptStatus}
        statusLabel={ui(STATUS_KEYS[ret.returnReceiptStatus] || ret.returnReceiptStatus)}
        onClick={ret.returnReceiptId ? () => navigate(`/goods-shipment/${ret.returnReceiptId}`) : undefined}
      />
    );
  }

  return (
    <RelatedDocumentsShell loading={loading}>
      {chips}
    </RelatedDocumentsShell>
  );
}
