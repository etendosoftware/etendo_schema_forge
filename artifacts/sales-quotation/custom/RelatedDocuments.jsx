import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DocChip, RelatedDocumentsShell, STATUS_KEYS, CHIP_ICONS, CHIP_COLORS, fetchByCriteria } from '@/components/related-documents';
import { useUI } from '@/i18n';

export default function RelatedDocuments({ recordId, data, token, apiBaseUrl }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const ui = useUI();

  useEffect(() => {
    if (!recordId) { setLoading(false); return; }
    fetchByCriteria('sales-order', 'header', 'quotation', recordId, token, apiBaseUrl)
      .then(rows => { setOrders(rows); setLoading(false); })
      .catch(() => { setOrders([]); setLoading(false); });
  }, [recordId, token, apiBaseUrl]);

  return (
    <RelatedDocumentsShell loading={loading}>
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
    </RelatedDocumentsShell>
  );
}
