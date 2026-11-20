import { CaretLeftIcon, CaretRightIcon, SlidersHorizontalIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { DateField } from '@/components/ui/date-field';
import { PopupMultiSelector } from '@/pages/ReportViewerPage.jsx';
import { MAX_PICKER_IDS } from './reportUrlState.js';
import { useUI } from '@/i18n';
import { cn } from '@/lib/utils';

const SHORTCUTS = [
  ['month', 'dynamicReportMonth'],
  ['quarter', 'dynamicReportQuarter'],
  ['year', 'dynamicReportYear'],
];
// ETP-6083: the end-date shortcuts a contract offers on Hasta (`dateTo.shortcuts`).
const END_SHORTCUTS = {
  today: 'dynamicReportToday',
  lastMonthEnd: 'dynamicReportLastMonthEnd',
  lastQuarterEnd: 'dynamicReportLastQuarterEnd',
  lastFiscalYearEnd: 'dynamicReportLastFiscalYearEnd',
};
const COMPARISONS = [
  ['', 'dynamicReportNoComparison'],
  ['same-last-year', 'dynamicReportSamePeriodLastYear'],
  ['previous', 'dynamicReportPreviousPeriod'],
];

const COLUMN_OPTIONS = [
  ['total', 'dynamicReportColumnsTotal'],
  ['month', 'dynamicReportColumnsMonth'],
  ['quarter', 'dynamicReportColumnsQuarter'],
];

const PANEL_ID = 'dynamic-report-panel';
const DEFAULT_PICKERS = Object.freeze([{ name: 'bPartnerId', selector: 'bpartner' }, { name: 'productId', selector: 'product' }]);
// An account range bound is one account; every other filter takes a list.
const maxItemsOf = (selector) => (selector === 'account' ? 1 : MAX_PICKER_IDS);
const selectClass = 'w-full h-9 rounded-lg border border-[hsl(var(--border-control))] bg-card px-2 text-sm';

function Section({ title, children }) {
  return (
    <section className="flex flex-col gap-2 border-t border-border/40 px-3 py-3 first:border-t-0">
      <h3 className="text-xs font-semibold text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

/**
 * ETP-6080 — "Personalizar informe" for the dynamic view: every control applies on change (there is
 * no "Generar informe"). Labels come from the report contract (`label(name)`, `sectionLabel(id)`)
 * where it has them. The org picker only shows when the role reaches more than one organization.
 *
 * ETP-6084: the filters (`pickers`), the option toggles (`toggles`) and the grouping options (`groupByOptions`)
 * come from the report's contract; the defaults are the P&L's own (contact and product, nothing else).
 */
export default function DynamicReportPanel({
  state, onChange, onShortcut, onPickYear, onLevel, onExpandAll, onCollapseAll, onReset,
  shortcut, yearId, years, orgs, splitDimensions, levelOptions, label, sectionLabel, noFiscalYear, selectorOf, endShortcuts = null, ledgerStart = false, compareOptions = null, endShortcutDates = {},
  offers = { columns: true, compare: true, splitBy: true }, pickers = DEFAULT_PICKERS, toggles = [], groupByOptions = null, collapsed = false, onToggleCollapsed, activeFilterCount = 0, collapseRef, expandRef,
}) {
  const ui = useUI();
  const toggleLabel = ui(collapsed ? 'dynamicReportShowPanel' : 'dynamicReportHidePanel');
  if (collapsed) {
    // Desktop: a narrow strip; mobile: a bar across the top. Both keep the filters one click away.
    return (
      <aside className="shrink-0 flex md:flex-col items-center gap-2 bg-card border-b md:border-b-0 md:border-r border-border/30 px-3 py-2 md:w-10 md:px-0 md:py-3" data-testid="DynamicReportPanel__strip">
        <button
          type="button"
          ref={expandRef}
          aria-expanded={false}
          aria-label={toggleLabel}
          title={toggleLabel}
          className="relative h-8 w-8 md:w-8 max-md:w-full max-md:justify-start max-md:gap-2 rounded-lg flex items-center justify-center hover:bg-muted focus-visible:outline focus-visible:outline-2"
          onClick={() => onToggleCollapsed?.(false)}
          data-testid="DynamicReportPanel__expand"
        >
          <CaretRightIcon className="w-4 h-4 hidden md:block" data-testid="ChevronRight__panel" />
          <SlidersHorizontalIcon className="w-4 h-4 md:hidden" data-testid="SlidersHorizontal__panel" />
          {activeFilterCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-foreground text-background text-[10px] leading-4 text-center" aria-label={ui('dynamicReportActiveFilters', { count: activeFilterCount })} data-testid="DynamicReportPanel__activeCount">
              {activeFilterCount}
            </span>
          )}
          <span className="text-xs font-semibold md:hidden">{ui('customizeReport')}</span>
        </button>
      </aside>
    );
  }
  return (
    <aside id={PANEL_ID} className="w-full md:w-72 shrink-0 flex flex-col bg-card border-b md:border-b-0 md:border-r border-border/30 overflow-y-auto max-h-[60vh] md:max-h-none" data-testid="DynamicReportPanel">
      <div className="px-3 pt-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{ui('customizeReport')}</h2>
          <p className="text-xs text-muted-foreground mt-1">{ui('dynamicReportLiveHint')}</p>
        </div>
        {onToggleCollapsed && (
          <button
            type="button"
            ref={collapseRef}
            aria-expanded
            aria-controls={PANEL_ID}
            aria-label={toggleLabel}
            title={toggleLabel}
            className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted focus-visible:outline focus-visible:outline-2"
            onClick={() => onToggleCollapsed(true)}
            data-testid="DynamicReportPanel__collapse"
          >
            <CaretLeftIcon className="w-4 h-4" data-testid="ChevronLeft__panel" />
          </button>
        )}
      </div>

      <Section title={sectionLabel('periodo')} data-testid="Section__f52339">
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs">{ledgerStart ? ui('dynamicReportLedgerStart') : label('dateFrom')}
            <DateField value={state.dateFrom} onChange={(v) => onChange({ dateFrom: v })} data-testid="DynamicReportPanel__dateFrom" />
          </label>
          <label className="text-xs">{label('dateTo')}
            <DateField value={state.dateTo} onChange={(v) => onChange({ dateTo: v })} data-testid="DynamicReportPanel__dateTo" />
          </label>
        </div>
        {ledgerStart && <p className="text-xs text-muted-foreground" data-testid="DynamicReportPanel__ledgerStartHint">{ui('dynamicReportLedgerStartHint')}</p>}
        {endShortcuts ? (
          <div className="grid grid-cols-2 gap-1" role="group">
            {endShortcuts.filter((kind) => END_SHORTCUTS[kind]).map((kind) => (
              <button
                key={kind}
                type="button"
                aria-pressed={shortcut === kind}
                disabled={!endShortcutDates[kind]}
                className={cn('py-1 px-1 text-xs rounded-lg border border-border disabled:opacity-50', shortcut === kind && 'bg-foreground text-background')}
                onClick={() => onShortcut(kind)}
                data-testid={`DynamicReportPanel__shortcut-${kind}`}
              >
                {ui(END_SHORTCUTS[kind])}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex rounded-lg border border-border overflow-hidden" role="group">
          {SHORTCUTS.map(([kind, key]) => (
            <button
              key={kind}
              type="button"
              aria-pressed={shortcut === kind}
              className={cn('flex-1 py-1 text-xs border-r border-border last:border-r-0', shortcut === kind && 'bg-foreground text-background')}
              onClick={() => onShortcut(kind)}
              data-testid={`DynamicReportPanel__shortcut-${kind}`}
            >
              {ui(key)}
            </button>
          ))}
          </div>
        )}
        {years.length > 0 && (
          <label className="text-xs">{ui('dynamicReportFiscalYear')}
            <select
              className={selectClass}
              value={yearId ?? ''}
              onChange={(e) => onPickYear(years.find((y) => y.id === e.target.value))}
              data-testid="DynamicReportPanel__year"
            >
              <option value="">{ui('selectPlaceholder')}</option>
              {years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
            </select>
          </label>
        )}
        {noFiscalYear && <p className="text-xs text-muted-foreground" data-testid="DynamicReportPanel__noFiscalYear">{ui('dynamicReportNoFiscalYear')}</p>}
      </Section>

      <Section title={ui('filters')} data-testid="Section__f52339">
        {orgs.length > 1 && (
          <label className="text-xs">{label('orgId')}
            <select className={selectClass} value={state.orgId} onChange={(e) => onChange({ orgId: e.target.value })} data-testid="DynamicReportPanel__org">
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
        )}
        {pickers.map(({ name, selector }) => {
          const named = state[`_display_${name}`] ? '-named' : '';
          return (
          <div key={name} className="text-xs">
            <span>{label(name)}</span>
            <PopupMultiSelector
              // Remounts when the restored names land (the selector seeds its chips from props only once).
              key={`${state[name] ? 'set' : 'empty'}${named}`}
              selector={selectorOf?.(name) ?? selector}
              label={label(name)}
              value={state[name]}
              displayValue={state[`_display_${name}`]}
              displayNames={state[`_names_${name}`]}
              maxItems={maxItemsOf(selector)}
              onChange={(ids, names, list) => onChange({ [name]: ids, [`_display_${name}`]: names, [`_names_${name}`]: list })}
              data-testid={`DynamicReportPanel__${name}`}
            />
          </div>
          );
        })}
      </Section>

      <Section title={sectionLabel('agrupacion')} data-testid="Section__f52339">
        <label className="text-xs">{label('accountLevel')}
          <select className={selectClass} value={state.level} onChange={(e) => onLevel(e.target.value)} data-testid="DynamicReportPanel__level">
            {levelOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <div className="flex gap-2">
          <Button variant="outline" className="h-8 px-2 text-xs" onClick={onExpandAll} data-testid="DynamicReportPanel__expandAll">{ui('expandAll')}</Button>
          <Button variant="outline" className="h-8 px-2 text-xs" onClick={onCollapseAll} data-testid="DynamicReportPanel__collapseAll">{ui('collapseAll')}</Button>
        </div>
        {groupByOptions && <label className="text-xs">{label('groupBy')}
          <select className={selectClass} value={state.groupBy ?? ''} onChange={(e) => onChange({ groupBy: e.target.value })} data-testid="DynamicReportPanel__groupBy">
            {!groupByOptions.some((o) => o.value === '') && <option value="">{ui('dynamicReportNoGrouping')}</option>}
            {groupByOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>}
        {offers.splitBy && <label className="text-xs">{ui('dynamicReportSplitBy')}
          <select className={selectClass} value={state.splitBy} onChange={(e) => onChange({ splitBy: e.target.value })} data-testid="DynamicReportPanel__splitBy">
            <option value="">{ui('dynamicReportNoSplit')}</option>
            {splitDimensions.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </label>}
      </Section>

      {toggles.length > 0 && <Section title={sectionLabel('opciones') || ui('dynamicReportOptions')} data-testid="Section__f52339">
        {toggles.map((name) => (
          <label key={name} className="flex items-start gap-2 text-xs">
            <input type="checkbox" className="mt-0.5" checked={Boolean(state[name])} onChange={(e) => onChange({ [name]: e.target.checked })} data-testid={`DynamicReportPanel__toggle-${name}`} />
            <span>{label(name)}</span>
          </label>
        ))}
      </Section>}

      {(offers.columns || offers.compare) && <Section title={sectionLabel('comparacion') || ui('dynamicReportComparison')} data-testid="Section__f52339">
        {offers.columns && <label className="text-xs">{ui('dynamicReportColumns')}
          <select className={selectClass} value={state.columns} onChange={(e) => onChange({ columns: e.target.value })} data-testid="DynamicReportPanel__columns">
            {COLUMN_OPTIONS.map(([value, key]) => <option key={value} value={value}>{ui(key)}</option>)}
          </select>
        </label>}
        {offers.compare && <select className={selectClass} value={state.compare} onChange={(e) => onChange({ compare: e.target.value })} aria-label={label('compareTo')} data-testid="DynamicReportPanel__compare">
          {(compareOptions ?? COMPARISONS.map(([value, key]) => [value, ui(key)])).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
        </select>}
        {offers.compare && offers.movements && state.compare && (
          <label className="flex items-start gap-2 text-xs">
            <input type="checkbox" className="mt-0.5" checked={Boolean(state.compareMovements)} onChange={(e) => onChange({ compareMovements: e.target.checked })} data-testid="DynamicReportPanel__compareMovements" />
            <span>{ui('dynamicReportCompareMovements')}</span>
          </label>
        )}
      </Section>}

      <div className="px-3 py-3 border-t border-border/40">
        <Button variant="outline" className="w-full h-9 text-sm" onClick={onReset} data-testid="DynamicReportPanel__reset">{ui('resetFilters')}</Button>
      </div>
    </aside>
  );
}
