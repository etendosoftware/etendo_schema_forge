import { useUI } from '@/i18n';

function PercentPill({ label, value }) {
  const n = typeof value === 'string' ? parseFloat(value) : (value ?? 0);
  const pct = Math.round(n);
  const full = pct >= 100;
  const bg = full ? 'var(--status-success-bg)' : 'hsl(var(--muted))';
  const color = full ? 'var(--status-success-fg)' : 'hsl(var(--muted-foreground))';
  const dot = full ? 'var(--status-success-fg)' : 'hsl(var(--text-disabled))';

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
  const ui = useUI();
  if (!data || data.documentStatus !== 'CO') return null;

  return (
    <>
      <PercentPill
        label={ui('purchaseOrder.topbar.deliveryStatus')}
        value={data.deliveryStatusPurchase}
        data-testid="PercentPill__f94e17" />
      <PercentPill
        label={ui('purchaseOrder.topbar.invoiceStatus')}
        value={data.invoiceStatus}
        data-testid="PercentPill__f94e17" />
    </>
  );
}
