import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DocChip, RelatedDocumentsShell, STATUS_KEYS, CHIP_ICONS, CHIP_COLORS, fetchByCriteria } from '@/components/related-documents';
import { useUI } from '@/i18n';

export default function RelatedDocuments({ recordId, data, token, apiBaseUrl }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const navigate = useNavigate();
  const ui = useUI();

  useEffect(() => {
    if (!recordId) return;
    setLoading(true);
    const orderId = data?.salesOrder;
    if (orderId) {
      fetchByCriteria('purchase-invoice', 'header', 'salesOrder', orderId, token, apiBaseUrl)
        .then(rows => setInvoices(rows))
        .finally(() => setLoading(false));
    } else {
      setInvoices([]);
      setLoading(false);
    }
  }, [recordId, data?.salesOrder, token, apiBaseUrl, refreshKey]);

  const chips = [];

  // Purchase Order from header data
  const orderId = data?.salesOrder;
  const orderLabel = data?.['salesOrder$_identifier'];
  if (orderId) {
    chips.push(
      <DocChip
        key="purchase-order"
        icon={CHIP_ICONS.order}
        iconColor={CHIP_COLORS.order}
        title={orderLabel || ui('orderDoc', { number: orderId })}
        onClick={() => navigate(`/purchase-order/${orderId}`)}
      />
    );
  }

  // Purchase Invoices linked to this receipt
  for (const inv of invoices) {
    chips.push(
      <DocChip
        key={`invoice-${inv.id}`}
        icon={CHIP_ICONS.invoice}
        iconColor={CHIP_COLORS.invoice}
        title={ui('invoiceDoc', { number: inv.documentNo })}
        amount={inv.grandTotalAmount}
        currency={inv['currency$_identifier']}
        status={inv.documentStatus}
        statusLabel={ui(STATUS_KEYS[inv.documentStatus] || inv.documentStatus)}
        onClick={() => navigate(`/purchase-invoice/${inv.id}`)}
      />
    );
  }

  return (
    <RelatedDocumentsShell loading={loading} onRefresh={() => setRefreshKey(k => k + 1)}>
      {chips}
    </RelatedDocumentsShell>
  );
}
