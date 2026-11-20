import { Fragment } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableRow,
} from '@/components/ui/table';
import { RowExpandToggle } from '@/components/contract-ui/RowExpandToggle.jsx';
import { ListModalRowActions } from '@/components/contract-ui/ListModalRowActions.jsx';
import { ListProgressBar } from '@/components/contract-ui/ListProgressBar.jsx';
import { ROW_LIFT_SHADOW, ROW_LIFT_HOVER_NO_BORDERS } from '@/components/contract-ui/rowVisuals.js';
import { OriginBadge, RateStatusBadge, CurrencySymbolChip } from './ConversionRateBadges.jsx';
import { formatRate } from './conversionRatesFormat.js';
import {
  displayValidTo, formatWallClock, formatWallClockDate, isEditableRate, nowWallClock, wallClockDate, wallClockTime,
} from './conversionRatesModel.js';

/** Expand toggle + the five data columns + actions. */
const COL_COUNT = 7;

/**
 * Per-currency column header row, with the header look of MovementsTable / StatementsTable
 * (40px, 12px semibold foreground labels).
 */
const SUB_HEADER_ROW = 'h-10 hover:bg-transparent [&_th]:h-10 [&_th]:text-xs [&_th]:font-semibold [&_th]:leading-4 [&_th]:text-foreground';

/**
 * Currency (parent) row, MovementsTable's expandable-row recipe: card background, lifted with a
 * shadow on hover, the whole row toggles; while open it keeps the design's muted background.
 */
function currencyRowClassName(expanded) {
  return [
    'group relative cursor-pointer transition-shadow',
    expanded ? 'z-20 bg-muted hover:bg-muted' : 'bg-card hover:bg-card hover:z-10 hover:shadow-lg',
  ].join(' ');
}

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

function CurrencyRow({ entry, orgIso, expanded, onToggle, onNewRate, ui }) {
  const iso = entry.isoCode;
  const subtitle = currencySubtitle(entry, ui);
  return (
    <TableRow
      className={currencyRowClassName(expanded)}
      onClick={onToggle}
      data-expanded={expanded ? 'true' : 'false'}
      data-testid={`convrate-currency-${iso}`}>
      <TableCell className="w-10" data-testid="TableCell__convrate-toggle">
        <RowExpandToggle
          expanded={expanded}
          onToggle={onToggle}
          stopPropagation
          iconTestId={`convrate-currency-toggle-icon-${iso}`}
          data-testid={`convrate-currency-toggle-${iso}`} />
      </TableCell>
      <TableCell colSpan={COL_COUNT - 1} className="whitespace-normal" data-testid="TableCell__convrate-currency">
        <div className="flex items-center gap-2.5 text-foreground">
          <CurrencySymbolChip
            symbol={entry.symbol || iso}
            ui={ui}
            data-testid="CurrencySymbolChip__c0495c" />
          <span className="font-semibold">{iso}</span>
          {entry.name && <span className="text-muted-foreground">{entry.name}</span>}
          <OriginBadge automatic={entry.automatic} ui={ui} data-testid={`convrate-currency-origin-${iso}`} />
          <span className="flex-1" />
          {entry.rate != null && (
            <span className="flex flex-col items-end leading-tight">
              <span className="font-semibold" data-testid={`convrate-currency-rate-${iso}`}>
                {ui('convRateHeaderRate', { org: orgIso, rate: formatRate(entry.rate), symbol: entry.symbol || iso })}
              </span>
              {subtitle && (
                <span className="text-xs text-muted-foreground" data-testid={`convrate-currency-subtitle-${iso}`}>{subtitle}</span>
              )}
            </span>
          )}
          <span className="ml-5 flex w-24 justify-end">
            {!entry.automatic && (
              <Button
                type="button"
                variant="link"
                onClick={(e) => {
                  e.stopPropagation();
                  onNewRate(entry);
                }}
                className="h-auto whitespace-nowrap p-0 text-[13px] font-medium"
                data-testid={`convrate-currency-new-rate-${iso}`}>
                {ui('convRateNewRateLink')}
              </Button>
            )}
          </span>
        </div>
      </TableCell>
    </TableRow>
  );
}

function RatesHeader({ entry, orgIso, ui }) {
  return (
    <TableRow className={SUB_HEADER_ROW} data-testid={`convrate-rates-header-${entry.isoCode}`}>
      <TableHead className="w-10" data-testid="TableHead__convrate-toggle" />
      <TableHead data-testid="TableHead__convrate-from">{ui('convRateValidFromDateTime')}</TableHead>
      <TableHead data-testid="TableHead__convrate-to">{ui('convRateValidToDateTime')}</TableHead>
      <TableHead className="text-right" data-testid="TableHead__convrate-rate">{ui('convRateOneOrg', { currency: orgIso })}</TableHead>
      <TableHead className="text-right" data-testid="TableHead__convrate-inverse">{ui('convRateInverseOf', { currency: entry.isoCode, org: orgIso })}</TableHead>
      <TableHead data-testid="TableHead__convrate-status">{ui('convRateStatus')}</TableHead>
      <TableHead className="w-[90px]" data-testid="TableHead__convrate-actions">
        <span className="sr-only">{ui('convRateActions')}</span>
      </TableHead>
    </TableRow>
  );
}

/**
 * A rate row: the shared "Fila" lift of the app's lists (DataTable `lift-always`, the document
 * lines) — transparent at rest; on hover an opaque card background, Shadows/lg raised over the
 * next row and no separators — on every row, automatic or manual. Only a manual row adds the
 * hover Modificar / Eliminar of `ListModalRowActions` (the Condiciones de pago row actions).
 */
const RATE_ROW = [
  'group/row relative transition-none hover:z-10 hover:bg-card [--row-hover-bg:hsl(var(--card))]',
  ROW_LIFT_SHADOW,
  ROW_LIFT_HOVER_NO_BORDERS,
].join(' ');

function RateRow({ row, symbol, orgSymbol, onEdit, onDelete, deleting, ui }) {
  const validTo = displayValidTo(row);
  return (
    <TableRow className={RATE_ROW} data-testid={`convrate-row-${row.id}`}>
      <TableCell className="w-10" data-testid="TableCell__convrate-indent" />
      <TableCell data-testid="TableCell__convrate-from">{formatWallClock(row.validFromDate)}</TableCell>
      <TableCell className={validTo ? undefined : 'text-muted-foreground'} data-testid="TableCell__convrate-to">{validTo ?? '—'}</TableCell>
      <TableCell className="text-right tabular-nums" data-testid="TableCell__convrate-rate">
        {formatRate(row.multipleRateBy)}
        {' '}
        <span className="text-muted-foreground">{symbol}</span>
      </TableCell>
      <TableCell className="text-right tabular-nums" data-testid="TableCell__convrate-inverse">
        {formatRate(row.divideRateBy)}
        {' '}
        <span className="text-muted-foreground">{orgSymbol}</span>
      </TableCell>
      <TableCell data-testid="TableCell__convrate-status">
        <RateStatusBadge status={row.etgoRateStatus} ui={ui} data-testid={`convrate-row-status-${row.id}`} />
      </TableCell>
      <TableCell className="w-[90px] py-1.5 text-right" data-testid="TableCell__convrate-actions">
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
      </TableCell>
    </TableRow>
  );
}

/**
 * ETP-6365 v3 — "Divisas y tasas": ONE accordion list, a row per currency that has rates
 * (expand toggle, symbol, ISO, name, origin; on the right the forward rate in force and when it
 * was downloaded or since when it applies; "+ Nueva tasa" on manual currencies). Expanding a
 * currency shows every rate of the period under its own column header row: Válido desde, Válido
 * hasta, `1 EUR =`, `1 <ISO> = EUR` (`divideRateBy`), Estado and the hover actions of manual rows.
 *
 * Built like MovementsTable: the shared `Table` / `TableBody` / `TableRow` / `TableHead` /
 * `TableCell` primitives (`@/components/ui/table`) and the shared `RowExpandToggle` (vertical,
 * the orientation of MovementsTable / StatementsTable) in a leading 40px column; sub-rows are
 * plain `TableRow`s under the parent, inside the shared `Card` (rounded bordered container).
 */
export function CurrencyRatesList({
  entries, orgIso, orgSymbol, expanded, onToggle, loading, loaded, error,
  onNewRate, onEdit, onDelete, deletingId, ui,
}) {
  const dimWhileRefreshing = loading && loaded ? 'opacity-70 transition-opacity duration-200' : 'transition-opacity duration-200';
  return (
    <>
      {loading && loaded ? <ListProgressBar testId="convrate-list-progress" data-testid="ListProgressBar__c0495c" /> : null}
      <Card className="overflow-hidden" data-testid="convrate-list-card">
        <Table aria-label={ui('convRateListRegion')} className={`min-w-[880px] text-sm ${dimWhileRefreshing}`} data-testid="convrate-list-table">
          <TableBody data-testid="TableBody__convrate">
            {entries.map((entry) => {
              const isOpen = expanded.has(entry.currencyId);
              const symbol = entry.symbol || entry.isoCode;
              return (
                <Fragment key={entry.currencyId}>
                  <CurrencyRow
                    entry={entry}
                    orgIso={orgIso}
                    expanded={isOpen}
                    onToggle={() => onToggle(entry.currencyId)}
                    onNewRate={onNewRate}
                    ui={ui}
                    data-testid="CurrencyRow__c0495c" />
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
                    <TableRow className="hover:bg-transparent" data-testid="TableRow__convrate-empty-period">
                      <TableCell colSpan={COL_COUNT} className="whitespace-normal pl-[52px] text-muted-foreground" data-testid={`convrate-currency-empty-${entry.isoCode}`}>
                        {ui('convRateNoRatesInPeriod')}
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
            {!loading && entries.length === 0 && (
              <TableRow className="hover:bg-transparent" data-testid="TableRow__convrate-empty">
                <TableCell colSpan={COL_COUNT} className="whitespace-normal py-16 text-center text-muted-foreground" data-testid={error ? 'convrate-list-error' : 'convrate-list-empty'}>
                  {error ? ui('convRateLoadError') : ui('convRateListEmpty')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}

export default CurrencyRatesList;
