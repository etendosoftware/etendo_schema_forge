import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUI } from '@/i18n';
import {
  DocChip, RelatedDocumentsShell, docChipProps,
  neoBase, fetchById,
} from '@/components/related-documents';

async function resolveLinkedInvoice(seen, schedId, token, apiBaseUrl, result) {
  seen.add(`inv-sched-${schedId}`);
  try {
    const sched = await fetchById('purchase-invoice', 'paymentPlan', schedId, token, apiBaseUrl);
    const invId = sched?.invoice;
    if (invId && !seen.has(`inv-${invId}`)) {
      seen.add(`inv-${invId}`);
      const inv = await fetchById('purchase-invoice', 'header', invId, token, apiBaseUrl);
      if (inv) result.push({type: 'invoice', ...inv});
    }
  } catch { /* silent */
  }
}

async function resolveLinkedOrder(seen, orderSchedId, token, apiBaseUrl, result) {
  seen.add(`ord-sched-${orderSchedId}`);
  try {
    const sched = await fetchById('purchase-order', 'paymentPlan', orderSchedId, token, apiBaseUrl);
    const ordId = sched?.salesOrder || sched?.order;
    if (ordId && !seen.has(`ord-${ordId}`)) {
      seen.add(`ord-${ordId}`);
      const ord = await fetchById('purchase-order', 'header', ordId, token, apiBaseUrl);
      if (ord) result.push({type: 'order', ...ord});
    }
  } catch { /* silent */
  }
}

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
      await resolveLinkedInvoice(seen, schedId, token, apiBaseUrl, result);
    }

    // Order payment schedule -> fetch schedule to get order ID
    const orderSchedId = line.orderPaymentSchedule;
    if (orderSchedId && !seen.has(`ord-sched-${orderSchedId}`)) {
      await resolveLinkedOrder(seen, orderSchedId, token, apiBaseUrl, result);
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
    const chipType = doc.type === 'order' ? 'order' : 'invoice';
    const keyPrefix = doc.type === 'order' ? 'order' : 'invoice';
    chips.push(
      <DocChip
        key={`${keyPrefix}-${doc.id}`}
        {...docChipProps({ type: chipType, doc, ui, navigate })}
        data-testid="DocChip__99828b" />
    );
  }

  return (
    <RelatedDocumentsShell
      loading={loading}
      onRefresh={() => setRefreshKey(k => k + 1)}
      data-testid="RelatedDocumentsShell__99828b">
      {chips}
    </RelatedDocumentsShell>
  );
}
