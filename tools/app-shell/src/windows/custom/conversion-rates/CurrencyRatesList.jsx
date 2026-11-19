import { Fragment } from 'react';
import { CaretDownIcon, CaretRightIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { ListModalRowActions } from '@/components/contract-ui/ListModalRowActions.jsx';
import { ListProgressBar } from '@/components/contract-ui/ListProgressBar.jsx';
import { OriginBadge, RateStatusBadge, CurrencySymbolChip } from './ConversionRateBadges.jsx';
import { formatRate } from './conversionRatesFormat.js';
import {
  displayValidTo, formatWallClock, formatWallClockDate, isEditableRate, nowWallClock, wallClockDate, wallClockTime,
} from './conversionRatesModel.js';

const COL_COUNT = 6;

/** Second line of a currency header: last download (automatic) or start of the rate in force (manual). */
export function currencySubtitle(entry, ui, today = wallClockDate(nowWallClock())) {
  if (entry.automatic) {
    if (!entry.lastDownloadAt) return '';
    const time = wallClockTime(entry.lastDownloadAt);
    return wallClockDate(entry.lastDownloadAt) === today
      ? ui('convRateDownloadedToday', { time })
      : ui('convRateDownloadedOn', { date: formatWallClockDate(entry.lastDownloadAt), time });
  }
  return entry.validFrom ? ui('convRateSince', { date: formatWallClock(entry.validFrom) }) : '';
}

function CurrencyHeader({ entry, orgIso, expanded, onToggle, onNewRate, ui }) {
  const iso = entry.isoCode;
  const subtitle = currencySubtitle(entry, ui);
  return (
    <tr className={`border-t border-border ${expanded ? 'bg-muted/60' : 'bg-card'}`} data-testid={`convrate-currency-${iso}`}>
      <td colSpan={COL_COUNT} className="px-[18px] py-2.5">
        <div className="flex items-center">
          <button
            type="button"
            aria-expanded={expanded}
            onClick={onToggle}
            className="flex flex-1 items-center gap-2.5 rounded bg-transparent p-0 text-left text-[13px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            data-testid={`convrate-currency-toggle-${iso}`}>
            <span className="inline-flex text-muted-foreground">
              {expanded
                ? <CaretDownIcon className="h-4 w-4" aria-hidden="true" data-testid="CaretDownIcon__convrate" />
                : <CaretRightIcon className="h-4 w-4" aria-hidden="true" data-testid="CaretRightIcon__convrate" />}
            </span>
            <CurrencySymbolChip
              symbol={entry.symbol || iso}
              ui={ui}
              data-testid="CurrencySymbolChip__c0495c" />
            <span className="text-sm font-semibold">{iso}</span>
            {entry.name && <span className="text-muted-foreground">{entry.name}</span>}
            <OriginBadge automatic={entry.automatic} ui={ui} data-testid={`convrate-currency-origin-${iso}`} />
            <span className="flex-1" />
            {entry.rate != null && (
              <span className="flex flex-col items-end leading-tight">
                <span className="text-sm font-semibold" data-testid={`convrate-currency-rate-${iso}`}>
                  {ui('convRateHeaderRate', { org: orgIso, rate: formatRate(entry.rate), symbol: entry.symbol || iso })}
                </span>
                {subtitle && (
                  <span className="text-xs text-muted-foreground" data-testid={`convrate-currency-subtitle-${iso}`}>{subtitle}</span>
                )}
              </span>
            )}
          </button>
          <span className="ml-5 flex w-24 justify-end">
            {!entry.automatic && (
              <Button
                type="button"
                variant="link"
                onClick={() => onNewRate(entry)}
                className="h-auto whitespace-nowrap p-0 text-[13px] font-medium"
                data-testid={`convrate-currency-new-rate-${iso}`}>
                {ui('convRateNewRateLink')}
              </Button>
            )}
          </span>
        </div>
      </td>
    </tr>
  );
}

function RatesHeader({ entry, orgIso, ui }) {
  return (
    <tr className="bg-card text-xs text-muted-foreground">
      <th scope="col" className="py-2 pl-11 pr-3 text-left font-medium">{ui('convRateValidFromDateTime')}</th>
      <th scope="col" className="px-3 py-2 text-left font-medium">{ui('convRateValidToDateTime')}</th>
      <th scope="col" className="px-3 py-2 text-right font-medium">{ui('convRateOneOrg', { currency: orgIso })}</th>
      <th scope="col" className="px-3 py-2 text-right font-medium">{ui('convRateInverseOf', { currency: entry.isoCode, org: orgIso })}</th>
      <th scope="col" className="px-3 py-2 text-left font-medium">{ui('convRateStatus')}</th>
      <th scope="col" className="w-[90px] px-[18px] py-2"><span className="sr-only">{ui('convRateActions')}</span></th>
    </tr>
  );
}

function RateRow({ row, symbol, orgSymbol, onEdit, onDelete, deleting, ui }) {
  const validTo = displayValidTo(row);
  return (
    <tr className="group/row border-t border-border/60 bg-card hover:shadow-[0_2px_8px_rgba(29,31,36,0.10)]" data-testid={`convrate-row-${row.id}`}>
      <td className="py-[11px] pl-11 pr-3">{formatWallClock(row.validFromDate)}</td>
      <td className={`px-3 py-[11px]${validTo ? '' : ' text-muted-foreground'}`}>{validTo ?? '—'}</td>
      <td className="px-3 py-[11px] text-right tabular-nums">
        {formatRate(row.multipleRateBy)}
        {' '}
        <span className="text-muted-foreground">{symbol}</span>
      </td>
      <td className="px-3 py-[11px] text-right tabular-nums">
        {formatRate(row.divideRateBy)}
        {' '}
        <span className="text-muted-foreground">{orgSymbol}</span>
      </td>
      <td className="px-3 py-[11px]">
        <RateStatusBadge status={row.etgoRateStatus} ui={ui} data-testid={`convrate-row-status-${row.id}`} />
      </td>
      <td className="w-[90px] px-[18px] py-1.5 text-right">
        {isEditableRate(row) && (
          <ListModalRowActions
            row={row}
            onEdit={onEdit}
            onDelete={onDelete}
            deleting={deleting}
            className="justify-end"
            editLabel={ui('convRateEditAction')}
            deleteLabel={ui('convRateDeleteAction')}
            testIdPrefix="convrate"
            ui={ui}
            data-testid="ListModalRowActions__c0495c" />
        )}
      </td>
    </tr>
  );
}

/**
 * ETP-6365 v3 — "Divisas y tasas": ONE accordion list, a row per currency that has rates
 * (chevron, symbol, ISO, name, origin; on the right the forward rate in force and when it was
 * downloaded or since when it applies; "+ Nueva tasa" on manual currencies). Expanding a currency
 * shows every rate of the period: Válido desde, Válido hasta, `1 EUR =`, `1 <ISO> = EUR`
 * (`divideRateBy`), Estado and the hover actions of manual rows.
 */
export function CurrencyRatesList({
  entries, orgIso, orgSymbol, expanded, onToggle, loading, loaded, error,
  onNewRate, onEdit, onDelete, deletingId, ui,
}) {
  return (
    <section
      aria-label={ui('convRateListRegion')}
      className="flex flex-col rounded-[10px] border border-border bg-card"
      data-testid="convrate-list">
      {loading && loaded ? <ListProgressBar testId="convrate-list-progress" data-testid="ListProgressBar__c0495c" /> : null}
      <div
        tabIndex={0}
        role="region"
        aria-label={ui('convRateListRegion')}
        className="max-h-[620px] overflow-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        data-testid="convrate-list-scroll">
        <table className="w-full min-w-[880px] border-collapse text-[13px]" data-testid="convrate-list-table">
          <tbody>
            {entries.map((entry) => {
              const isOpen = expanded.has(entry.currencyId);
              const symbol = entry.symbol || entry.isoCode;
              return (
                <Fragment key={entry.currencyId}>
                  <CurrencyHeader
                    entry={entry}
                    orgIso={orgIso}
                    expanded={isOpen}
                    onToggle={() => onToggle(entry.currencyId)}
                    onNewRate={onNewRate}
                    ui={ui}
                    data-testid="CurrencyHeader__c0495c" />
                  {isOpen && <RatesHeader entry={entry} orgIso={orgIso} ui={ui} data-testid="RatesHeader__c0495c" />}
                  {isOpen && entry.rows.map((row) => (
                    <RateRow
                      key={row.id}
                      row={row}
                      symbol={symbol}
                      orgSymbol={orgSymbol}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      deleting={deletingId === row.id}
                      ui={ui}
                      data-testid="RateRow__c0495c" />
                  ))}
                  {isOpen && entry.rows.length === 0 && (
                    <tr>
                      <td colSpan={COL_COUNT} className="py-3 pl-11 pr-3 text-muted-foreground" data-testid={`convrate-currency-empty-${entry.isoCode}`}>
                        {ui('convRateNoRatesInPeriod')}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {!loading && entries.length === 0 && (
              <tr>
                <td colSpan={COL_COUNT} className="px-[18px] py-6 text-center text-muted-foreground" data-testid={error ? 'convrate-list-error' : 'convrate-list-empty'}>
                  {error ? ui('convRateLoadError') : ui('convRateListEmpty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default CurrencyRatesList;
