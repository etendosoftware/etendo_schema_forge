import { useState, useEffect } from 'react';
import { useUI } from '@/i18n';
import ProgressFieldBadge from '@/windows/custom/shared/ProgressFieldBadge';
import { useApiFetch } from '@/auth/useApiFetch.js';

// Get-by-id answers with the row inside `response.data` (a one-element array).
const headerRow = (payload) => {
  const rows = payload?.response?.data;
  return Array.isArray(rows) ? rows[0] : rows;
};

export default function PurchaseOrderDraftChips({ data, recordId, token, apiBaseUrl }) {
  // Empty base ON PURPOSE: every URL below is already absolute, and several address a
  // DIFFERENT spec than this window's. resolveApiUrl only skips the prefix when the path
  // starts with that same base, so a configured base turns a cross-spec call into
  // /sws/neo/<this>/sws/neo/<other>/... and a 404.
  const apiFetch = useApiFetch('');
  const ui = useUI();
  const [state, setState] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const isCompleted = data?.documentStatus === 'CO';

  useEffect(() => {
    const handler = () => setRefreshKey(k => k + 1);
    window.addEventListener('purchase-order:document-created', handler);
    return () => window.removeEventListener('purchase-order:document-created', handler);
  }, []);

  useEffect(() => {
    if (!isCompleted || !recordId) return;
    let cancelled = false;

    Promise.all([
      // Invoiced percentage: the stored computed column the list grid shows
      // (EM_ETGO_Invoice_Status), re-read from the header so both views share ONE source.
      // Never recompute it here from invoice amounts — that is what made grid and detail disagree.
      apiFetch(`${apiBaseUrl}/header/${recordId}`)
        .then(r => r.ok ? r.json() : null)
        .then(j => headerRow(j)?.eTGOInvoiceStatus)
        .catch(() => undefined),
      apiFetch(`${apiBaseUrl}/lines?parentId=${recordId}&_startRow=0&_endRow=999`)
        .then(r => r.ok ? r.json() : null)
        .then(j => j?.response?.data ?? [])
        .catch(() => []),
    ]).then(([freshInvoiceStatus, orderLines]) => {
      if (cancelled) return;

      const qtyOrdered   = orderLines.reduce((s, l) => s + (Number(l.orderedQuantity)   || 0), 0);
      const qtyDelivered = orderLines.reduce((s, l) => s + (Number(l.deliveredQuantity) || 0), 0);

      const receivedPct = qtyOrdered > 0 ? qtyDelivered / qtyOrdered : 0;

      // A failed re-read falls back to the record the page already holds: same column, possibly older.
      setState({ receivedPct, invoiceStatus: freshInvoiceStatus ?? data?.eTGOInvoiceStatus });
    });

    return () => { cancelled = true; };
  }, [isCompleted, recordId, token, apiBaseUrl, refreshKey, data?.eTGOInvoiceStatus]);

  if (!isCompleted || !state) return null;

  const { receivedPct, invoiceStatus } = state;

  return (
    <>
      <ProgressFieldBadge
        documentStatus={data?.documentStatus}
        value={Number.isFinite(receivedPct) ? receivedPct * 100 : 0}
        label={ui('poAllReceived')}
        testId="order-progress-badge"
      />
      <ProgressFieldBadge
        documentStatus={data?.documentStatus}
        value={invoiceStatus}
        label={ui('poAllInvoiced')}
        testId="order-progress-badge"
      />
    </>
  );
}
