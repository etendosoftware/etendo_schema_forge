import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUI } from '@/i18n';
import {
  DocChip, RelatedDocumentsShell, STATUS_KEYS, CHIP_ICONS, CHIP_COLORS,
  neoBase, fetchById,
} from '@/components/related-documents';

async function fetchLinkedDocuments(recordId, token, apiBaseUrl) {
  const base = neoBase(apiBaseUrl);
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const linesRes = await fetch(`${base}/payment-out/lines?parentId=${recordId}&_limit=50`, { headers });
  const lines = linesRes.ok
    ? (await linesRes.json())?.response?.data || []
    : [];

  const seen = new Set();
  const result = [];

  for (const line of lines) {
    // Invoice payment schedule -> fetch schedule to get invoice ID
    const schedId = line.invoicePaymentSchedule;
    if (schedId && !seen.has(`inv-sched-${schedId}`)) {
      seen.add(`inv-sched-${schedId}`);
      try {
        const sched = await fetchById('purchase-invoice', 'paymentPlan', schedId, token, apiBaseUrl);
        const invId = sched?.invoice;
        if (invId && !seen.has(`inv-${invId}`)) {
          seen.add(`inv-${invId}`);
          const inv = await fetchById('purchase-invoice', 'header', invId, token, apiBaseUrl);
          if (inv) result.push({ type: 'invoice', ...inv });
        }
      } catch { /* silent */ }
    }

    // Order payment schedule -> fetch schedule to get order ID
    const orderSchedId = line.orderPaymentSchedule;
    if (orderSchedId && !seen.has(`ord-sched-${orderSchedId}`)) {
      seen.add(`ord-sched-${orderSchedId}`);
      try {
        const sched = await fetchById('purchase-order', 'paymentPlan', orderSchedId, token, apiBaseUrl);
        const ordId = sched?.salesOrder || sched?.order;
        if (ordId && !seen.has(`ord-${ordId}`)) {
          seen.add(`ord-${ordId}`);
          const ord = await fetchById('purchase-order', 'header', ordId, token, apiBaseUrl);
          if (ord) result.push({ type: 'order', ...ord });
        }
      } catch { /* silent */ }
    }
  }

  return result;
}

export default function RelatedDocuments({ recordId, data, token, apiBaseUrl }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const navigate = useNavigate();
  const ui = useUI();

  useEffect(() => {
    if (!recordId) return;
    setLoading(true);
    fetchLinkedDocuments(recordId, token, apiBaseUrl)
      .then(setDocs)
      .catch(() => setDocs([]))
      .finally(() => setLoading(false));
  }, [recordId, token, apiBaseUrl, refreshKey]);

  const chips = [];

  for (const doc of docs) {
    if (doc.type === 'order') {
      chips.push(
        <DocChip
          key={`order-${doc.id}`}
          icon={CHIP_ICONS.order}
          iconColor={CHIP_COLORS.order}
          title={ui('orderDoc', { number: doc.documentNo })}
          amount={doc.grandTotalAmount}
          currency={doc['currency$_identifier']}
          status={doc.documentStatus}
          statusLabel={ui(STATUS_KEYS[doc.documentStatus] || doc.documentStatus)}
          onClick={() => navigate(`/purchase-order/${doc.id}`)}
        />
      );
    } else {
      chips.push(
        <DocChip
          key={`invoice-${doc.id}`}
          icon={CHIP_ICONS.invoice}
          iconColor={CHIP_COLORS.invoice}
          title={ui('invoiceDoc', { number: doc.documentNo })}
          amount={doc.grandTotalAmount}
          currency={doc['currency$_identifier']}
          status={doc.documentStatus}
          statusLabel={ui(STATUS_KEYS[doc.documentStatus] || doc.documentStatus)}
          onClick={() => navigate(`/purchase-invoice/${doc.id}`)}
        />
      );
    }
  }

  return (
    <RelatedDocumentsShell loading={loading} onRefresh={() => setRefreshKey(k => k + 1)}>
      {chips}
    </RelatedDocumentsShell>
  );
}
