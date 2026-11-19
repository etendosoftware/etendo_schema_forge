import { LockSimpleIcon } from '@phosphor-icons/react';
import { TONE_STYLES, BASE_STYLE } from '@/components/ui/status-tag-tokens';
import { RATE_STATUS } from './conversionRatesModel.js';

/**
 * ETP-6365 — the small visual pieces the Currency Conversion window repeats on the cards, the
 * group headers and the rows. Colours come from the shared status-tag tone tokens (the same map
 * `StatusTag` renders), so the badges match every other status pill of the app.
 */

const PILL_STYLE = { ...BASE_STYLE, fontWeight: 500, gap: 4 };

/** Origin pill: "Automática" (downloaded, `info` tone) / "Manual" (`warning` tone). */
export function OriginBadge({ automatic, ui, 'data-testid': testId }) {
  const tone = automatic ? 'info' : 'warning';
  return (
    <span style={{ ...PILL_STYLE, ...TONE_STYLES[tone] }} data-testid={testId}>
      {ui(automatic ? 'convRateOriginAuto' : 'convRateOriginManual')}
    </span>
  );
}

const STATUS_TONE = {
  [RATE_STATUS.CURRENT]: { tone: 'success', key: 'convRateStatusCurrent' },
  [RATE_STATUS.POSTED]: { tone: 'warning', key: 'convRateStatusPosted' },
  [RATE_STATUS.UNUSED]: { tone: 'neutral', key: 'convRateStatusUnused' },
};

/**
 * Status pill of a history row: Vigente / Usado en contabilidad / No usado, with a lock when
 * the rate already has posted documents (`etgoUsedInAccounting`).
 */
export function RateStatusBadge({ status, locked, ui, 'data-testid': testId }) {
  const def = STATUS_TONE[status];
  if (!def) return null;
  return (
    <span
      style={{ ...PILL_STYLE, ...TONE_STYLES[def.tone] }}
      data-status={status}
      data-locked={locked ? 'true' : undefined}
      data-testid={testId}>
      {locked && (
        <LockSimpleIcon
          className="h-3 w-3"
          aria-label={ui('convRateLockedHint')}
          data-testid="LockSimpleIcon__convrate" />
      )}
      {ui(def.key)}
    </span>
  );
}

/** Currency symbol chip ("$", "£", "CHF"…) in front of the ISO code. */
export function CurrencySymbolChip({ symbol, ui }) {
  return (
    <span
      title={ui('convRateSymbol')}
      className="inline-flex h-7 min-w-7 items-center justify-center rounded-lg border border-border bg-muted px-1.5 text-sm font-semibold text-muted-foreground">
      {symbol}
    </span>
  );
}
