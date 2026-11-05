import { Button } from '@/components/ui/button';
import { DateField } from '@/components/ui/date-field';
import { PopupMultiSelector } from '@/pages/ReportViewerPage.jsx';
import { useUI } from '@/i18n';
import { cn } from '@/lib/utils';

const SHORTCUTS = [
  ['month', 'dynamicReportMonth'],
  ['quarter', 'dynamicReportQuarter'],
  ['year', 'dynamicReportYear'],
];
const COMPARISONS = [
  ['', 'dynamicReportNoComparison'],
  ['same-last-year', 'dynamicReportSamePeriodLastYear'],
  ['previous', 'dynamicReportPreviousPeriod'],
];

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
 */
export default function DynamicReportPanel({
  state, onChange, onShortcut, onPickYear, onLevel, onExpandAll, onCollapseAll, onReset,
  shortcut, yearId, years, orgs, splitDimensions, levelOptions, label, sectionLabel, noFiscalYear,
}) {
  const ui = useUI();
  return (
    <aside className="w-72 shrink-0 flex flex-col bg-card border-r border-border/30 overflow-y-auto" data-testid="DynamicReportPanel">
      <div className="px-3 pt-3">
        <h2 className="text-sm font-semibold">{ui('customizeReport')}</h2>
        <p className="text-xs text-muted-foreground mt-1">{ui('dynamicReportLiveHint')}</p>
      </div>

      <Section title={sectionLabel('periodo')} data-testid="Section__f52339">
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs">{label('dateFrom')}
            <DateField value={state.dateFrom} onChange={(v) => onChange({ dateFrom: v })} data-testid="DynamicReportPanel__dateFrom" />
          </label>
          <label className="text-xs">{label('dateTo')}
            <DateField value={state.dateTo} onChange={(v) => onChange({ dateTo: v })} data-testid="DynamicReportPanel__dateTo" />
          </label>
        </div>
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
        {['bPartnerId', 'productId'].map((name) => (
          <div key={name} className="text-xs">
            <span>{label(name)}</span>
            <PopupMultiSelector
              key={state[name] ? 'set' : 'empty'}
              selector={name === 'bPartnerId' ? 'bpartner' : 'product'}
              label={label(name)}
              value={state[name]}
              displayValue={state[`_display_${name}`]}
              onChange={(ids, names) => onChange({ [name]: ids, [`_display_${name}`]: names })}
              data-testid={`DynamicReportPanel__${name}`}
            />
          </div>
        ))}
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
        <label className="text-xs">{ui('dynamicReportSplitBy')}
          <select className={selectClass} value={state.splitBy} onChange={(e) => onChange({ splitBy: e.target.value })} data-testid="DynamicReportPanel__splitBy">
            <option value="">{ui('dynamicReportNoSplit')}</option>
            {splitDimensions.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </label>
      </Section>

      <Section title={sectionLabel('comparacion')} data-testid="Section__f52339">
        <select className={selectClass} value={state.compare} onChange={(e) => onChange({ compare: e.target.value })} aria-label={label('compareTo')} data-testid="DynamicReportPanel__compare">
          {COMPARISONS.map(([value, key]) => <option key={value} value={value}>{ui(key)}</option>)}
        </select>
      </Section>

      <div className="px-3 py-3 border-t border-border/40">
        <Button variant="outline" className="w-full h-9 text-sm" onClick={onReset} data-testid="DynamicReportPanel__reset">{ui('resetFilters')}</Button>
      </div>
    </aside>
  );
}
