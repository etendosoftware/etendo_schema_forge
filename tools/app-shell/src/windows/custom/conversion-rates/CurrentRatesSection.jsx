import { Button } from '@/components/ui/button';
import { formatGroupedNumber } from '@/lib/formatCurrency.js';
import { OriginBadge, CurrencySymbolChip } from './ConversionRateBadges.jsx';
import {
  formatWallClock, formatWallClockDate, wallClockDate, wallClockTime, nowWallClock,
} from './conversionRatesModel.js';

/** Rates are shown with 4 decimals everywhere in this window (story ETP-6365). */
export const RATE_DIGITS = { minimumFractionDigits: 4, maximumFractionDigits: 4 };

export function formatRate(value) {
  return formatGroupedNumber(value, RATE_DIGITS);
}

/** Footer line of an automatic card: when the downloader last brought its rate. */
function autoFooter(rate, ui) {
  if (!rate.lastDownloadAt) return ui('convRateAutoDefault');
  const time = wallClockTime(rate.lastDownloadAt);
  if (wallClockDate(rate.lastDownloadAt) === wallClockDate(nowWallClock())) {
    return ui('convRateAutoDownloadedToday', { time });
  }
  return ui('convRateAutoDownloadedOn', { date: formatWallClockDate(rate.lastDownloadAt), time });
}

function RateCard({ rate, orgIso, ui, onNewRate }) {
  const automatic = rate.origin === 'AUTO';
  const iso = rate.isoCode;
  return (
    <article
      className="flex shrink-0 basis-[300px] snap-start flex-col gap-2.5 rounded-xl border border-border bg-card px-[18px] py-4"
      data-testid={`convrate-card-${iso}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <CurrencySymbolChip
            symbol={rate.symbol || iso}
            ui={ui}
            data-testid="CurrencySymbolChip__d6554a" />
          <span className="text-lg font-semibold">{iso}</span>
          <span className="truncate text-xs text-muted-foreground">{rate.name}</span>
        </div>
        <OriginBadge automatic={automatic} ui={ui} data-testid={`convrate-card-origin-${iso}`} />
      </div>
      <div className="rounded-lg bg-muted/60 px-3 py-2.5">
        <div className="text-xs text-muted-foreground">{ui('convRateOneOrg', { currency: orgIso })}</div>
        <div className="text-xl font-semibold" data-testid={`convrate-card-rate-${iso}`}>
          {formatRate(rate.rate)}
          {' '}
          <span className="text-[13px] font-medium text-muted-foreground">{iso}</span>
        </div>
      </div>
      {automatic ? (
        <div className="text-xs text-muted-foreground" data-testid={`convrate-card-footer-${iso}`}>
          {autoFooter(rate, ui)}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span data-testid={`convrate-card-footer-${iso}`}>
            {ui('convRateManualSince', { date: formatWallClock(rate.validFrom) })}
          </span>
          <Button
            type="button"
            onClick={() => onNewRate(rate)}
            variant="link"
            className="h-auto p-0 text-xs shrink-0 whitespace-nowrap font-medium"
            data-testid={`convrate-card-new-rate-${iso}`}>
            {ui('convRateNewRateLink')}
          </Button>
        </div>
      )}
    </article>
  );
}

/**
 * "Vigentes hoy": one card per currency with a rate in force now, in ONE horizontally
 * scrolling row (scroll-snap). Automatic cards say when the downloader last ran; manual cards
 * say since when the rate applies and offer "+ Nueva tasa".
 */
export function CurrentRatesSection({ rates, orgIso, loading, ui, onNewRate }) {
  const todayText = formatWallClockDate(nowWallClock());
  return (
    <section aria-labelledby="convrate-current-title" className="flex flex-col gap-3" data-testid="convrate-current">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <h2 id="convrate-current-title" className="m-0 text-base font-semibold">{ui('convRateCurrentTitle')}</h2>
        <span className="flex-1 text-[13px] text-muted-foreground">
          {ui('convRateCurrentSubtitle', { date: todayText, currency: orgIso ?? '' })}
        </span>
        <span className="text-xs text-muted-foreground" data-testid="convrate-current-count">
          {ui(rates.length === 1 ? 'convRateCurrentCountOne' : 'convRateCurrentCount', { count: rates.length })}
        </span>
      </div>
      <div
        role="region"
        aria-label={ui('convRateCurrentRegion')}
        // Focusable so the keyboard can scroll the row sideways.
        tabIndex={0}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded-xl"
        data-testid="convrate-current-cards">
        {rates.map((rate) => (
          <RateCard
            key={rate.currencyId}
            rate={rate}
            orgIso={orgIso}
            ui={ui}
            onNewRate={onNewRate}
            data-testid="RateCard__d6554a" />
        ))}
        {!loading && rates.length === 0 && (
          <p className="text-sm text-muted-foreground" data-testid="convrate-current-empty">{ui('convRateCurrentEmpty')}</p>
        )}
      </div>
    </section>
  );
}
