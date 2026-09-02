import { useState, useEffect } from 'react';
import { useUI } from '@/i18n';
import { getProgressTone } from '@/lib/progressTone';
import { TONE_STYLES } from '@/components/ui/status-tag-tokens.js';
import { useApiFetch } from '@/auth/useApiFetch.js';

const CRITERIA = (field, value) =>
  encodeURIComponent(JSON.stringify([{ fieldName: field, operator: 'equals', value }]));

export default function PurchaseOrderDraftChips({ data, recordId, token, apiBaseUrl }) {
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
  // Empty base ON PURPOSE: every URL below is already absolute, and several address a
  // DIFFERENT spec than this window's. resolveApiUrl only skips the prefix when the path
  // starts with that same base, so a configured base turns a cross-spec call into
  // /sws/neo/<this>/sws/neo/<other>/... and a 404.
  const apiFetch = useApiFetch('');

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
      <ProgressBadge label={ui('poAllReceived')} pct={receivedPct} />
      <ProgressBadge label={ui('poAllInvoiced')} pct={invoicedPct} />
    </>
  );
}

function ProgressBadge({ label, pct }) {
  const tone = getProgressTone(pct);
  const palette = TONE_STYLES[tone];
  const safePct = Number.isFinite(pct) ? Math.max(0, Math.min(1, pct)) : 0;
  const percent = Math.round(safePct * 100);
  return (
    <span
      data-testid="order-progress-badge"
      data-tone={tone}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '4px 12px', borderRadius: 6,
        fontSize: 12, fontWeight: 500,
        background: palette.background,
        color: palette.color,
      }}
    >
      {label}
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{percent}%</span>
    </span>
  );
}
