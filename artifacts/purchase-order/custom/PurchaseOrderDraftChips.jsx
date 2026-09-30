import { useState, useEffect } from 'react';
import { useUI } from '@/i18n';
import ProgressFieldBadge from '@/windows/custom/shared/ProgressFieldBadge';
import { useApiFetch } from '@/auth/useApiFetch.js';

const CRITERIA = (field, value) =>
  encodeURIComponent(JSON.stringify([{ fieldName: field, operator: 'equals', value }]));

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

    const base = (apiBaseUrl || '').replace(/\/[^/]+$/, '');

    Promise.all([
      apiFetch(`${base}/purchase-invoice/header?criteria=${CRITERIA('salesOrder', recordId)}&_limit=50`)
        .then(r => r.ok ? r.json() : null)
        .then(j => j?.response?.data ?? [])
        .catch(() => []),
      apiFetch(`${apiBaseUrl}/lines?parentId=${recordId}&_startRow=0&_endRow=999`)
        .then(r => r.ok ? r.json() : null)
        .then(j => j?.response?.data ?? [])
        .catch(() => []),
    ]).then(([invoices, orderLines]) => {
      if (cancelled) return;

      const invoicesComplete = invoices.filter(i => i.documentStatus === 'CO');

      const qtyOrdered   = orderLines.reduce((s, l) => s + (Number(l.orderedQuantity)   || 0), 0);
      const qtyDelivered = orderLines.reduce((s, l) => s + (Number(l.deliveredQuantity) || 0), 0);

      const totalOrder    = Number(data?.grandTotalAmount) || 0;
      const totalInvoiced = invoicesComplete.reduce((s, i) => s + (Number(i.grandTotalAmount) || 0), 0);

      const receivedPct = qtyOrdered > 0 ? qtyDelivered / qtyOrdered : 0;
      const invoicedPct = totalOrder > 0 ? totalInvoiced / totalOrder : 0;

      setState({ receivedPct, invoicedPct });
    });

    return () => { cancelled = true; };
  }, [isCompleted, recordId, token, apiBaseUrl, refreshKey, data?.grandTotalAmount]);

  if (!isCompleted || !state) return null;

  const { receivedPct, invoicedPct } = state;

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
        value={Number.isFinite(invoicedPct) ? invoicedPct * 100 : 0}
        label={ui('poAllInvoiced')}
        testId="order-progress-badge"
      />
    </>
  );
}
