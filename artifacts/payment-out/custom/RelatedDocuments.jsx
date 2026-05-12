import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DocChip, RelatedDocumentsShell, STATUS_KEYS, CHIP_ICONS, CHIP_COLORS, neoBase, fetchById } from '@/components/related-documents';
import { useUI } from '@/i18n';

/**
 * RelatedDocuments for Payment Out.
 *
 * Resolves linked purchase invoices via:
 *   scheduleDetail.invoicePaymentSchedule → GET /purchase-invoice/paymentPlan/{id} → invoice ID
 * Then fetches the invoice header for documentStatus badge.
 */
export default function RelatedDocuments({ recordId, data, token, apiBaseUrl }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const navigate = useNavigate();
  const ui = useUI();

  useEffect(() => {
    if (!recordId || !token || !apiBaseUrl) { setLoading(false); return; }
    setLoading(true);

    const base = neoBase(apiBaseUrl);
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    (async () => {
      try {
        // Step 1: Get schedule details for this payment
        const detailRes = await fetch(
          `${base}/payment-out/finPaymentScheduleDetail?parentId=${recordId}&_startRow=0&_endRow=100`,
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
          const row = await fetchById('purchase-invoice', 'paymentPlan', schedId, token, apiBaseUrl);
          if (row?.invoice && !invoiceMap.has(row.invoice)) {
            const ident = row['invoice$_identifier'] || '';
            const docNo = ident.split(' - ')[0] || '';
            invoiceMap.set(row.invoice, { id: row.invoice, docNo });
          }
        }));

        if (invoiceMap.size === 0) { setDocs([]); setLoading(false); return; }

        // Step 3: Fetch invoice headers for status badge
        const invoices = [...invoiceMap.values()];
        await Promise.all(invoices.map(async (inv) => {
          const row = await fetchById('purchase-invoice', 'header', inv.id, token, apiBaseUrl);
          if (row) {
            inv.documentStatus = row.documentStatus;
            inv.grandTotal = row.grandTotalAmount;
            inv.currency = row['currency$_identifier'];
          }
        }));

        setDocs(invoices);
      } catch { /* silent */ }
      finally { setLoading(false); }
    })();
  }, [recordId, token, apiBaseUrl, refreshKey]);

  return (
    <RelatedDocumentsShell loading={loading} onRefresh={() => setRefreshKey(k => k + 1)}>
      {docs.map(inv => (
        <DocChip
          key={inv.id}
          icon={CHIP_ICONS.invoice}
          iconColor={CHIP_COLORS.invoice}
          title={ui('invoiceDoc', { number: inv.docNo })}
          amount={inv.grandTotal}
          currency={inv.currency}
          status={inv.documentStatus}
          statusLabel={ui(STATUS_KEYS[inv.documentStatus] || inv.documentStatus)}
          onClick={() => navigate(`/purchase-invoice/${inv.id}`)}
        />
      ))}
    </RelatedDocumentsShell>
  );
}
