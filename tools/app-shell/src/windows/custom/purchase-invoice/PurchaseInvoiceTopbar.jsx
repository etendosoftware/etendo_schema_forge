import DocumentStatusPill from '@/components/contract-ui/DocumentStatusPill.jsx';

function fmt(val, curr) {
  const n = typeof val === 'string' ? parseFloat(val) : (val ?? 0);
  const s = n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return curr ? `${s} ${curr}` : s;
}

export default function PurchaseInvoiceTopbar({ data }) {
  if (!data) return null;

  const docStatus = data.documentStatus;
  const currency = data['currency$_identifier'] || '';
  const grandTotal = data.grandTotalAmount ?? 0;
  const outstanding = data.outstandingAmount ?? grandTotal;
  const totalPaid = grandTotal - outstanding;
  const isFullyPaid = data.paymentComplete === true || data.paymentComplete === 'Y' || outstanding <= 0;

  return (
    <>
      <DocumentStatusPill data={data} />

      {/* Payment Status pill — only show for completed invoices */}
      {docStatus === 'CO' && (
        isFullyPaid ? (
          <span
            className="inline-flex items-center gap-1.5 text-[13px] font-medium"
            style={{ padding: '4px 12px', borderRadius: '6px', backgroundColor: '#d1fae5', color: '#065f46' }}
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#10b981' }} />
            Paid
            <span style={{ opacity: 0.4 }}>&middot;</span>
            <span className="font-semibold tabular-nums">{fmt(totalPaid, currency)}</span>
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1.5 text-[13px] font-medium"
            style={{ padding: '4px 12px', borderRadius: '6px', backgroundColor: '#fef3c7', color: '#78350f' }}
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#f59e0b' }} />
            Pending
            <span style={{ opacity: 0.4 }}>&middot;</span>
            <span className="font-semibold tabular-nums">{fmt(outstanding, currency)}</span>
          </span>
        )
      )}
    </>
  );
}
