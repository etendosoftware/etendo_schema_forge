import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DocChip, RelatedDocumentsShell, STATUS_KEYS, CHIP_ICONS, CHIP_COLORS, fetchById } from '@/components/related-documents';
import { useUI } from '@/i18n';

export default function RelatedDocuments({ recordId, data, token, apiBaseUrl }) {
  const [rma, setRma] = useState(null);
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const navigate = useNavigate();
  const ui = useUI();

  useEffect(() => {
    if (!recordId || !data) { setLoading(false); return; }
    setLoading(true);
    const rmaId = data.returnReason;
    const orderId = data.orderReference;

    const fetches = [];
    if (rmaId) {
      fetches.push(
        fetchById('return-to-vendor', 'header', rmaId, token, apiBaseUrl)
          .then(setRma)
          .catch(() => {})
      );
    }
    if (orderId) {
      fetches.push(
        fetchById('purchase-order', 'header', orderId, token, apiBaseUrl)
          .then(setOrder)
          .catch(() => {})
      );
    }

    if (fetches.length === 0) { setLoading(false); return; }
    Promise.all(fetches).finally(() => setLoading(false));
  }, [recordId, data, token, apiBaseUrl, refreshKey]);

  return (
    <RelatedDocumentsShell loading={loading} onRefresh={() => setRefreshKey(k => k + 1)}>
      {rma && (
        <DocChip
          key="rma"
          icon={CHIP_ICONS.order}
          iconColor={CHIP_COLORS.order}
          title={ui('returnDoc', { number: rma.documentNo })}
          status={rma.docStatus}
          statusLabel={ui(STATUS_KEYS[rma.docStatus] || rma.docStatus)}
          onClick={() => navigate(`/return-to-vendor/${rma.id}`)}
        />
      )}
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
          onClick={() => navigate(`/purchase-order/${order.id}`)}
        />
      )}
    </RelatedDocumentsShell>
  );
}
