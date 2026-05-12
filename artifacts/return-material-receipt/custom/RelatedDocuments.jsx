import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DocChip, RelatedDocumentsShell, STATUS_KEYS, CHIP_ICONS, CHIP_COLORS, fetchById } from '@/components/related-documents';
import { useUI } from '@/i18n';

export default function RelatedDocuments({ recordId, data, token, apiBaseUrl }) {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const navigate = useNavigate();
  const ui = useUI();

  useEffect(() => {
    if (!recordId || !data) { setLoading(false); return; }
    setLoading(true);
    const orderId = data.salesOrder;
    if (!orderId) { setLoading(false); return; }

    fetchById('sales-order', 'header', orderId, token, apiBaseUrl)
      .then((o) => {
        setOrder(o);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [recordId, data, token, apiBaseUrl, refreshKey]);

  return (
    <RelatedDocumentsShell loading={loading} onRefresh={() => setRefreshKey(k => k + 1)}>
      {order && (
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
      )}
    </RelatedDocumentsShell>
  );
}
