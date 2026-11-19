import { StatusTag } from '@/components/ui/status-tag';
import { RATE_STATUS } from './conversionRatesModel.js';

/**
 * ETP-6365 — the small visual pieces the Currency Conversion window repeats on the cards, the
 * group headers and the rows. The pills are the app's shared `StatusTag` (tone tokens), wrapped
 * in a span only to carry the test id (StatusTag does not forward one).
 */

/** Origin pill: "Automática" (downloaded, `info` tone) / "Manual" (`warning` tone). */
export function OriginBadge({ automatic, ui, 'data-testid': testId }) {
  return (
    <span className="inline-flex" data-testid={testId}>
      <StatusTag
        tone={automatic ? 'info' : 'warning'}
        label={ui(automatic ? 'convRateOriginAuto' : 'convRateOriginManual')}
        data-testid="StatusTag__convrate-origin" />
    </span>
  );
}

const STATUS_TONE = {
  [RATE_STATUS.CURRENT]: { tone: 'success', key: 'convRateStatusCurrent' },
  [RATE_STATUS.HISTORIC]: { tone: 'neutral', key: 'convRateStatusHistoric' },
};

/** Status pill of a history row: Vigente (rules now) / Histórico (no longer rules). */
export function RateStatusBadge({ status, ui, 'data-testid': testId }) {
  const def = STATUS_TONE[status];
  if (!def) return null;
  return (
    <span className="inline-flex" data-status={status} data-testid={testId}>
      <StatusTag tone={def.tone} label={ui(def.key)} data-testid="StatusTag__convrate-status" />
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
