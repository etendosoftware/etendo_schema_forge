import { useUI } from '@/i18n';
import { getProgressTone } from '@/lib/progressTone';
import { TONE_STYLES } from '@/components/ui/status-tag-tokens.js';

export default function GoodsReceiptDraftChips({ data }) {
  const ui = useUI();

  const invoicedPct = (Number(data?.invoiceStatus) || 0) / 100;
  if (invoicedPct <= 0) return null;

  return <ProgressBadge label={ui('poAllInvoiced')} pct={invoicedPct} />;
}

function ProgressBadge({ label, pct }) {
  const tone = getProgressTone(pct);
  const palette = TONE_STYLES[tone];
  const safePct = Number.isFinite(pct) ? Math.max(0, Math.min(1, pct)) : 0;
  const percent = Math.round(safePct * 100);
  return (
    <span
      data-testid="goods-receipt-invoice-badge"
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
