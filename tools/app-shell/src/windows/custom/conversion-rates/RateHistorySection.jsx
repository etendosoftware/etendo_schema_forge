import { CaretDownIcon, CaretRightIcon } from '@phosphor-icons/react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { DateField } from '@/components/ui/date-field';
import { ListModalRowActions } from '@/components/contract-ui/ListModalRowActions.jsx';
import { ListProgressBar } from '@/components/contract-ui/ListProgressBar.jsx';
import { OriginBadge, RateStatusBadge, CurrencySymbolChip } from './ConversionRateBadges.jsx';
import { formatRate } from './CurrentRatesSection.jsx';
import {
  PERIODS, ORIGINS, STATUSES, displayValidTo, formatWallClock, isEditableRate, hasHiddenRows,
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
  UNUSED: 'convRateStatusUnused',
  POSTED: 'convRateStatusPosted',
};
const ALL = '__all__';

function FilterSelect({ id, label, value, onChange, options, minWidth, testId }) {
  return (
    <div className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">
      <span id={id}>{label}</span>
      <Select value={value} onValueChange={onChange} data-testid={`Select__${testId}`}>
        <SelectTrigger
          aria-labelledby={id}
          className="h-[34px] text-[13px] text-foreground"
          style={{ minWidth }}
          data-testid={testId}>
          <SelectValue data-testid={`SelectValue__${testId}`} />
        </SelectTrigger>
        <SelectContent data-testid={`SelectContent__${testId}`}>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} data-testid={`${testId}-option-${o.value}`}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function HistoryFilters({ filters, onChange, currencies, ui }) {
  const currencyOptions = [
    { value: ALL, label: ui('convRateAllFeminine') },
    ...currencies.map((c) => ({ value: c.currencyId, label: c.isoCode })),
  ];
  return (
    <div id="convrate-history-filters" className="flex flex-wrap items-end gap-2" data-testid="convrate-history-filters">
      <FilterSelect
        id="convrate-filter-currency-label"
        label={ui('convRateCurrency')}
        value={filters.currencyId ?? ALL}
        onChange={(v) => onChange({ currencyId: v === ALL ? null : v })}
        options={currencyOptions}
        minWidth={150}
        testId="convrate-filter-currency"
        data-testid="FilterSelect__afdfa2" />
      <FilterSelect
        id="convrate-filter-period-label"
        label={ui('convRatePeriod')}
        value={filters.period}
        onChange={(v) => onChange({ period: v })}
        options={PERIODS.map((p) => ({ value: p, label: ui(PERIOD_LABEL[p]) }))}
        minWidth={150}
        testId="convrate-filter-period"
        data-testid="FilterSelect__afdfa2" />
      {filters.period === 'custom' && (
        <>
          <div className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">
            <span>{ui('convRatePeriodFrom')}</span>
            <div className="w-[150px]">
              <DateField
                value={filters.customFrom ?? ''}
                onChange={(iso) => onChange({ customFrom: iso || null })}
                data-testid="convrate-filter-custom-from" />
            </div>
          </div>
          <div className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">
            <span>{ui('convRatePeriodTo')}</span>
            <div className="w-[150px]">
              <DateField
                value={filters.customTo ?? ''}
                onChange={(iso) => onChange({ customTo: iso || null })}
                data-testid="convrate-filter-custom-to" />
            </div>
          </div>
        </>
      )}
      <FilterSelect
        id="convrate-filter-origin-label"
        label={ui('convRateOrigin')}
        value={filters.origin}
        onChange={(v) => onChange({ origin: v })}
        options={ORIGINS.map((o) => ({ value: o, label: ui(ORIGIN_LABEL[o]) }))}
        minWidth={130}
        testId="convrate-filter-origin"
        data-testid="FilterSelect__afdfa2" />
      <FilterSelect
        id="convrate-filter-status-label"
        label={ui('convRateStatus')}
        value={filters.status}
        onChange={(v) => onChange({ status: v })}
        options={STATUSES.map((s) => ({ value: s, label: ui(STATUS_LABEL[s]) }))}
        minWidth={130}
        testId="convrate-filter-status"
        data-testid="FilterSelect__afdfa2" />
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
            <button
              type="button"
              onClick={() => onNewRate(group.currencyId)}
              className="ml-4 whitespace-nowrap text-[13px] font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded"
              data-testid={`convrate-group-new-rate-${iso}`}>
              {ui('convRateNewRateLink')}
            </button>
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
          locked={row.etgoUsedInAccounting === true}
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
            <button
              type="button"
              onClick={onToggleShowAll}
              className="font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded"
              data-testid="convrate-history-show-all">
              {ui(showAll ? 'convRateShowRecent' : 'convRateShowAll')}
            </button>
          </span>
        )}
      </div>
    </section>
  );
}

export default RateHistorySection;
