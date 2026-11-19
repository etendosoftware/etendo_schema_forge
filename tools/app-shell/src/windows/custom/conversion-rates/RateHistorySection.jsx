import { Button } from '@/components/ui/button';
import { CaretDownIcon, CaretRightIcon } from '@phosphor-icons/react';
import { DistinctValuesFilter } from '@etendosoftware/app-shell-core/components/ui/distinct-values-filter.jsx';
import { DateField } from '@/components/ui/date-field';
import { ListModalRowActions } from '@/components/contract-ui/ListModalRowActions.jsx';
import { ListProgressBar } from '@/components/contract-ui/ListProgressBar.jsx';
import { OriginBadge, RateStatusBadge, CurrencySymbolChip } from './ConversionRateBadges.jsx';
import { formatRate } from './CurrentRatesSection.jsx';
import {
  PERIODS, ORIGINS, STATUSES, DEFAULT_PERIOD, displayValidTo, formatWallClock, isEditableRate, hasHiddenRows,
} from './conversionRatesModel.js';

const PERIOD_LABEL = {
  last30: 'convRatePeriodLast30',
  thisMonth: 'convRatePeriodThisMonth',
  thisYear: 'convRatePeriodThisYear',
  custom: 'convRatePeriodCustom',
};
const ORIGIN_LABEL = { all: 'convRateAllMasculine', auto: 'convRateOriginAuto', manual: 'convRateOriginManual' };
const STATUS_LABEL = {
  all: 'convRateAllMasculine',
  CURRENT: 'convRateStatusCurrent',
  HISTORIC: 'convRateStatusHistoric',
};
/**
 * One history filter: a caption over the app's shared list filter (`DistinctValuesFilter`, the
 * one Not Posted Documents and the advanced filters use), which opens on the committed value.
 * `allLabel` null = no "all" row (Periodo always has a value).
 */
function HistoryFilter({ caption, value, onChange, codes, labelFor, allLabel, testId, ui }) {
  return (
    <div className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">
      <span>{caption}</span>
      <DistinctValuesFilter
        value={value}
        onChange={onChange}
        codes={codes}
        labelFor={labelFor}
        allLabel={allLabel}
        heading={caption}
        searchable={false}
        searchPlaceholder={ui('searchValues')}
        popoverWidth="w-56"
        triggerTestId={testId}
        data-testid={`DistinctValuesFilter__${testId}`} />
    </div>
  );
}

function HistoryFilters({ filters, onChange, currencies, ui }) {
  const isoById = new Map(currencies.map((c) => [c.currencyId, c.isoCode]));
  const nonAll = (list) => list.filter((code) => code !== 'all');
  return (
    <div id="convrate-history-filters" className="flex flex-wrap items-end gap-2" data-testid="convrate-history-filters">
      <HistoryFilter
        caption={ui('convRateCurrency')}
        value={filters.currencyId}
        onChange={(v) => onChange({ currencyId: v || null })}
        codes={currencies.map((c) => c.currencyId)}
        labelFor={(id) => isoById.get(id) ?? id}
        allLabel={ui('convRateAllFeminine')}
        testId="convrate-filter-currency"
        ui={ui}
        data-testid="HistoryFilter__afdfa2" />
      <HistoryFilter
        caption={ui('convRatePeriod')}
        value={filters.period}
        onChange={(v) => onChange({ period: v || DEFAULT_PERIOD })}
        codes={[...PERIODS]}
        labelFor={(p) => ui(PERIOD_LABEL[p])}
        allLabel={null}
        testId="convrate-filter-period"
        ui={ui}
        data-testid="HistoryFilter__afdfa2" />
      {filters.period === 'custom' && (
        <>
          <div className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">
            <span>{ui('convRatePeriodFrom')}</span>
            <div className="w-[160px]">
              <DateField
                value={filters.customFrom ?? ''}
                onChange={(iso) => onChange({ customFrom: iso || null })}
                data-testid="convrate-filter-custom-from" />
            </div>
          </div>
          <div className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">
            <span>{ui('convRatePeriodTo')}</span>
            <div className="w-[160px]">
              <DateField
                value={filters.customTo ?? ''}
                onChange={(iso) => onChange({ customTo: iso || null })}
                data-testid="convrate-filter-custom-to" />
            </div>
          </div>
        </>
      )}
      <HistoryFilter
        caption={ui('convRateOrigin')}
        value={filters.origin === 'all' ? null : filters.origin}
        onChange={(v) => onChange({ origin: v || 'all' })}
        codes={nonAll(ORIGINS)}
        labelFor={(o) => ui(ORIGIN_LABEL[o])}
        allLabel={ui('convRateAllMasculine')}
        testId="convrate-filter-origin"
        ui={ui}
        data-testid="HistoryFilter__afdfa2" />
      <HistoryFilter
        caption={ui('convRateStatus')}
        value={filters.status === 'all' ? null : filters.status}
        onChange={(v) => onChange({ status: v || 'all' })}
        codes={nonAll(STATUSES)}
        labelFor={(st) => ui(STATUS_LABEL[st])}
        allLabel={ui('convRateAllMasculine')}
        testId="convrate-filter-status"
        ui={ui}
        data-testid="HistoryFilter__afdfa2" />
    </div>
  );
}

const COL_COUNT = 6;

function GroupHeader({ group, info, orgIso, expanded, onToggle, onNewRate, ui }) {
  const iso = info?.isoCode ?? group.identifier;
  const automatic = info ? info.origin === 'AUTO' : group.rows[0]?.sMFCRSynced === true;
  const count = group.rows.length;
  return (
    <tr className="border-t border-border bg-muted/60" data-testid={`convrate-group-${iso}`}>
      <td colSpan={COL_COUNT} className="px-[18px] py-2">
        <div className="flex items-center">
          <button
            type="button"
            aria-expanded={expanded}
            onClick={onToggle}
            className="flex flex-1 items-center gap-2.5 bg-transparent p-0 text-left text-[13px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded"
            data-testid={`convrate-group-toggle-${iso}`}>
            <span className="inline-flex text-muted-foreground">
              {expanded
                ? <CaretDownIcon className="h-4 w-4" aria-hidden="true" data-testid="CaretDownIcon__convrate" />
                : <CaretRightIcon className="h-4 w-4" aria-hidden="true" data-testid="CaretRightIcon__convrate" />}
            </span>
            <CurrencySymbolChip
              symbol={info?.symbol || iso}
              ui={ui}
              data-testid="CurrencySymbolChip__afdfa2" />
            <span className="text-sm font-semibold">{iso}</span>
            {info?.name && <span className="text-muted-foreground">{info.name}</span>}
            <OriginBadge automatic={automatic} ui={ui} data-testid={`convrate-group-origin-${iso}`} />
            <span className="flex-1" />
            {info?.rate != null && (
              <span className="text-muted-foreground">
                {ui('convRateGroupCurrent', { org: orgIso, rate: formatRate(info.rate), currency: iso })}
              </span>
            )}
            <span className="text-muted-foreground" data-testid={`convrate-group-count-${iso}`}>
              {ui(count === 1 ? 'convRateGroupCountOne' : 'convRateGroupCount', { count })}
            </span>
          </button>
          {!automatic && (
            <Button
              type="button"
              onClick={() => onNewRate(group.currencyId)}
              variant="link"
              className="h-auto p-0 ml-4 whitespace-nowrap text-[13px] font-medium"
              data-testid={`convrate-group-new-rate-${iso}`}>
              {ui('convRateNewRateLink')}
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

function RateRow({ row, symbol, orgSymbol, onEdit, onDelete, deleting, ui }) {
  const validTo = displayValidTo(row);
  const editable = isEditableRate(row);
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
        <RateStatusBadge
          status={row.etgoRateStatus}
          ui={ui}
          data-testid={`convrate-row-status-${row.id}`} />
      </td>
      <td className="w-[90px] px-[18px] py-1.5 text-right">
        {editable && (
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
            data-testid="ListModalRowActions__afdfa2" />
        )}
      </td>
    </tr>
  );
}

/**
 * "Histórico": the forward rates grouped by currency (collapsible groups), with the filters
 * Moneda / Periodo / Origen / Estado that the page sends to the backend as criteria on real
 * columns. Each row carries its period's forward rate (`multipleRateBy`) and inverse
 * (`divideRateBy`); the inverse rows themselves are never listed.
 */
export function RateHistorySection({
  groups, currencyInfo, currencies, orgIso, orgSymbol, filters, onFiltersChange, filtersVisible,
  loading, loaded, error, showAll, onToggleShowAll, collapsed, onToggleGroup,
  onNewRate, onEdit, onDelete, deletingId, ui,
}) {
  const anyRows = groups.length > 0;
  return (
    <section
      aria-labelledby="convrate-history-title"
      className="flex flex-col rounded-[10px] border border-border bg-card"
      data-testid="convrate-history">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-[18px] py-3.5">
        <h2 id="convrate-history-title" className="m-0 text-base font-semibold">{ui('convRateHistoryTitle')}</h2>
        {filtersVisible && <HistoryFilters
          filters={filters}
          onChange={onFiltersChange}
          currencies={currencies}
          ui={ui}
          data-testid="HistoryFilters__afdfa2" />}
      </div>
      {loading && loaded ? <ListProgressBar testId="convrate-history-progress" data-testid="ListProgressBar__afdfa2" /> : null}
      <div
        tabIndex={0}
        role="region"
        aria-label={ui('convRateHistoryRegion')}
        className="max-h-[380px] overflow-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        data-testid="convrate-history-scroll">
        <table className="w-full min-w-[880px] border-collapse text-[13px]" data-testid="convrate-history-table">
          <thead className="sticky top-0 z-[1] bg-card shadow-[0_1px_0_hsl(var(--border))]">
            <tr className="text-muted-foreground">
              <th scope="col" className="py-2.5 pl-11 pr-3 text-left font-medium">{ui('convRateValidFromDateTime')}</th>
              <th scope="col" className="px-3 py-2.5 text-left font-medium">{ui('convRateValidToDateTime')}</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">{ui('convRateOneOrg', { currency: orgIso })}</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">{ui('convRateInverseHeader', { currency: orgIso })}</th>
              <th scope="col" className="px-3 py-2.5 text-left font-medium">{ui('convRateStatus')}</th>
              <th scope="col" className="w-[90px] px-[18px] py-2.5"><span className="sr-only">{ui('convRateActions')}</span></th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => {
              const info = currencyInfo.get(group.currencyId);
              const expanded = !collapsed.has(group.currencyId);
              const symbol = info?.symbol || info?.isoCode || group.identifier;
              return [
                <GroupHeader
                  key={`g-${group.currencyId}`}
                  group={group}
                  info={info}
                  orgIso={orgIso}
                  expanded={expanded}
                  onToggle={() => onToggleGroup(group.currencyId)}
                  onNewRate={onNewRate}
                  ui={ui}
                  data-testid="GroupHeader__afdfa2" />,
                ...(expanded ? group.visible.map((row) => (
                  <RateRow
                    key={row.id}
                    row={row}
                    symbol={symbol}
                    orgSymbol={orgSymbol}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    deleting={deletingId === row.id}
                    ui={ui}
                    data-testid="RateRow__afdfa2" />
                )) : []),
              ];
            })}
            {!loading && !anyRows && (
              <tr>
                <td colSpan={COL_COUNT} className="px-[18px] py-6 text-center text-muted-foreground" data-testid={error ? 'convrate-history-error' : 'convrate-history-empty'}>
                  {error ? ui('convRateLoadError') : ui('convRateHistoryEmpty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-[18px] py-3 text-xs text-muted-foreground">
        <span>{ui('convRateHistoryFooterNote')}</span>
        {(hasHiddenRows(groups) || showAll) && (
          <span data-testid="convrate-history-show-all-line">
            {ui(showAll ? 'convRateShowingAll' : 'convRateShowingRecent')}
            {' · '}
            <Button
              type="button"
              onClick={onToggleShowAll}
              variant="link"
              className="h-auto p-0 text-xs font-medium"
              data-testid="convrate-history-show-all">
              {ui(showAll ? 'convRateShowRecent' : 'convRateShowAll')}
            </Button>
          </span>
        )}
      </div>
    </section>
  );
}

export default RateHistorySection;
