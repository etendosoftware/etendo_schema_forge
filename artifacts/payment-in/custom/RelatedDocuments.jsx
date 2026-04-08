import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const STATUS_BADGE = {
  CO: { label: 'Complete', bg: '#d1fae5', color: '#065f46' },
  DR: { label: 'Draft', bg: '#f3f4f6', color: '#374151' },
  VO: { label: 'Voided', bg: '#fee2e2', color: '#991b1b' },
  CL: { label: 'Closed', bg: '#f3f4f6', color: '#374151' },
};

const CHIP_ICONS = {
  invoice: (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="13" y2="17" />
    </svg>
  ),
  order: (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
    </svg>
  ),
};

/**
 * RelatedDocuments for Payment In.
 *
 * Resolves linked invoices via:
 *   scheduleDetail.invoicePaymentSchedule → GET /sales-invoice/paymentPlan/{id} → invoice ID + identifier
 * Then fetches the invoice header for documentStatus badge.
 */
export default function RelatedDocuments({ recordId, data, token, apiBaseUrl }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!recordId || !token || !apiBaseUrl) { setLoading(false); return; }

    const base = (apiBaseUrl || '').replace(/\/[^/]+$/, '');
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    (async () => {
      try {
        // Step 1: Get schedule details for this payment
        const detailRes = await fetch(
          `${base}/payment-in/finPaymentScheduleDetail?parentId=${recordId}&_startRow=0&_endRow=100`,
          { headers },
        );
        if (!detailRes.ok) { setLoading(false); return; }
        const details = (await detailRes.json())?.response?.data || [];

        // Collect unique invoicePaymentSchedule IDs
        const scheduleIds = [...new Set(
          details.map(d => d.invoicePaymentSchedule).filter(Boolean)
        )];

        if (scheduleIds.length === 0) { setDocs([]); setLoading(false); return; }

        // Step 2: Resolve each schedule ID to an invoice via paymentPlan getById
        const invoiceMap = new Map();
        await Promise.all(scheduleIds.map(async (schedId) => {
          try {
            const res = await fetch(`${base}/sales-invoice/paymentPlan/${schedId}`, { headers });
            if (!res.ok) return;
            const row = (await res.json())?.response?.data?.[0];
            if (row?.invoice && !invoiceMap.has(row.invoice)) {
              // invoice$_identifier format: "docNo - date - amount"
              const ident = row['invoice$_identifier'] || '';
              const docNo = ident.split(' - ')[0] || '';
              invoiceMap.set(row.invoice, { id: row.invoice, docNo });
            }
          } catch { /* silent */ }
        }));

        if (invoiceMap.size === 0) { setDocs([]); setLoading(false); return; }

        // Step 3: Fetch invoice headers for status badge (in parallel)
        const invoices = [...invoiceMap.values()];
        await Promise.all(invoices.map(async (inv) => {
          try {
            const res = await fetch(`${base}/sales-invoice/header/${inv.id}`, { headers });
            if (!res.ok) return;
            const row = (await res.json())?.response?.data?.[0];
            if (row) {
              inv.documentStatus = row.documentStatus;
              inv.grandTotal = row.grandTotalAmount;
              inv.currency = row['currency$_identifier'];
            }
          } catch { /* silent */ }
        }));

        setDocs(invoices);
      } catch { /* silent */ }
      finally { setLoading(false); }
    })();
  }, [recordId, token, apiBaseUrl]);

  if (loading) return <span className="text-xs text-muted-foreground">Loading...</span>;

  if (docs.length === 0) {
    return <span className="text-xs text-muted-foreground/50">No related documents</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {docs.map(inv => {
        const badge = STATUS_BADGE[inv.documentStatus] || { label: inv.documentStatus, bg: '#f3f4f6', color: '#374151' };
        return (
          <button
            key={inv.id}
            type="button"
            onClick={() => navigate(`/sales-invoice/${inv.id}`)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-border/40 rounded-full bg-white hover:bg-muted/30 transition-colors text-sm cursor-pointer"
            style={{ borderWidth: '0.5px' }}
          >
            <span className="shrink-0 text-violet-600">{CHIP_ICONS.invoice}</span>
            <span className="font-medium text-foreground/80">Invoice #{inv.docNo}</span>
            {inv.documentStatus && (
              <span
                className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: badge.bg, color: badge.color }}
              >
                {badge.label}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
