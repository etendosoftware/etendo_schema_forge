import { useUI } from '@/i18n';
import { getProgressTone } from '@/lib/progressTone';
import { TONE_STYLES } from '@/components/ui/status-tag-tokens.js';

export default function GoodsShipmentBillingBadge({ data }) {
  const ui = useUI();

  const rawPct = data?.invoiceStatus != null ? Number(data.invoiceStatus) : 0;
  if (rawPct <= 0) return null;
  const pct = Math.max(0, Math.min(100, rawPct)) / 100;
  const tone = getProgressTone(pct);
  const palette = TONE_STYLES[tone];
  const percent = Math.round(pct * 100);

  return (
    <span
      data-testid="billing-badge"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '4px 12px', borderRadius: 6,
        fontSize: 12, fontWeight: 500,
        background: palette.background,
        color: palette.color,
      }}
    >
      {ui('invoiced')}
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{percent}%</span>
    </span>
  );
}
