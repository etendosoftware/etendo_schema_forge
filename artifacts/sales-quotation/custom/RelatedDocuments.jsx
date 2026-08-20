import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DocChip, RelatedDocumentsShell, STATUS_KEYS, CHIP_ICONS, CHIP_COLORS, fetchByCriteria } from '@/components/related-documents';
import { useUI } from '@/i18n';

export default function RelatedDocuments({ recordId, data, apiBaseUrl }) {
  const [orders, setOrders] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const navigate = useNavigate();
  const ui = useUI();

  // ETP-4779 — QuotationConfirmModal dispatches this event right after
  // converting the quotation into a sales order / invoice (see
  // ../QuotationConfirmModal.jsx handleConfirm), mirroring the
  // sales-order:document-created / purchase-order:document-created convention
  // so this panel refetches automatically instead of requiring the manual 🔄
  // refresh button.
  useEffect(() => {
    const handler = () => setRefreshKey(k => k + 1);
    window.addEventListener('sales-quotation:document-created', handler);
    return () => window.removeEventListener('sales-quotation:document-created', handler);
  }, []);

  useEffect(() => {
    if (!recordId) { setLoading(false); return; }
    setLoading(true);
    Promise.all([
      fetchByCriteria('sales-order', 'header', 'quotation', recordId, apiBaseUrl)
        .catch(() => []),
      fetchByCriteria('sales-invoice', 'header', 'salesOrder', recordId, apiBaseUrl)
        .catch(() => []),
    ]).then(([orderRows, invoiceRows]) => {
      setOrders(orderRows);
      setInvoices(invoiceRows);
      setLoading(false);
    });
  }, [recordId, apiBaseUrl, refreshKey]);

  return (
    <RelatedDocumentsShell loading={loading} onRefresh={() => setRefreshKey(k => k + 1)}>
      {orders.map((row) => (
        <DocChip
          key={row.id}
          icon={CHIP_ICONS.order}
          iconColor={CHIP_COLORS.order}
          title={ui('orderDoc', { number: row.documentNo })}
          amount={row.grandTotalAmount}
          currency={row['currency$_identifier']}
          status={row.documentStatus}
          statusLabel={ui(STATUS_KEYS[row.documentStatus] || row.documentStatus)}
          onClick={() => navigate(`/sales-order/${row.id}`)}
        />
      ))}
      {invoices.map((row) => (
        <DocChip
          key={row.id}
          icon={CHIP_ICONS.invoice}
          iconColor={CHIP_COLORS.invoice}
          title={ui('invoiceDoc', { number: row.documentNo })}
          amount={row.grandTotalAmount}
          status={row.documentStatus}
          statusLabel={ui(STATUS_KEYS[row.documentStatus] || row.documentStatus)}
          onClick={() => navigate(`/sales-invoice/${row.id}`)}
        />
      ))}
    </RelatedDocumentsShell>
  );
}
