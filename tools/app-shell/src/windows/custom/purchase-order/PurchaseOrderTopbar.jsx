function percentPill(label, value) {
  const n = typeof value === 'string' ? parseFloat(value) : (value ?? 0);
  const pct = Math.round(n);
  const full = pct >= 100;
  const bg = full ? '#d1fae5' : '#f3f4f6';
  const color = full ? '#065f46' : '#374151';
  const dot = full ? '#10b981' : '#9ca3af';

  return (
    <span
      className="inline-flex items-center gap-1.5 text-[13px] font-medium"
      style={{ padding: '4px 12px', borderRadius: '6px', backgroundColor: bg, color }}
    >
      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dot }} />
      {label}
      <span style={{ opacity: 0.4 }}>&middot;</span>
      <span className="font-semibold tabular-nums">{pct}%</span>
    </span>
  );
}

export default function PurchaseOrderTopbar({ data }) {
  if (!data || data.documentStatus !== 'CO') return null;

  return (
    <>
      {percentPill('Delivery Status', data.deliveryStatusPurchase)}
      {percentPill('Invoice Status', data.invoiceStatus)}
    </>
  );
}
