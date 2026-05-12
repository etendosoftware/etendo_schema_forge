import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DocChip, RelatedDocumentsShell, STATUS_KEYS, CHIP_ICONS, CHIP_COLORS, fetchById } from '@/components/related-documents';
import { useUI } from '@/i18n';

export default function RelatedDocuments({ recordId, data, token, apiBaseUrl }) {
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const navigate = useNavigate();
  const ui = useUI();

  useEffect(() => {
    if (!recordId || !data) { setLoading(false); return; }
    setLoading(true);
    const receiptId = data.originalReceipt;
    if (!receiptId) { setLoading(false); return; }

    fetchById('goods-receipt', 'header', receiptId, token, apiBaseUrl)
      .then((r) => {
        setReceipt(r);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [recordId, data, token, apiBaseUrl, refreshKey]);

  return (
    <RelatedDocumentsShell loading={loading} onRefresh={() => setRefreshKey(k => k + 1)}>
      {receipt && (
        <DocChip
          key="receipt"
          icon={CHIP_ICONS.receipt}
          iconColor={CHIP_COLORS.receipt}
          title={ui('receiptDoc', { number: receipt.documentNo })}
          status={receipt.documentStatus}
          statusLabel={ui(STATUS_KEYS[receipt.documentStatus] || receipt.documentStatus)}
          onClick={() => navigate(`/goods-receipt/${receipt.id}`)}
        />
      )}
    </RelatedDocumentsShell>
  );
}
