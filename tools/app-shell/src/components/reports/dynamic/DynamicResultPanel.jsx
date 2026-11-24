import { ArrowSquareOutIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useUI, useLocaleSwitch } from '@/i18n';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { formatCalendarDate } from '@/lib/dateOnly.js';
import { fiscalYearStart } from './dynamicDates.js';
import { resultReportUrl } from './drillDown.js';

const amount = (v) => formatCurrency(null, v);

/**
 * ETP-6083: the `{ onTheFly, posted }` of the clicked cell. The core puts it on `cells[i].result` (the compared amounts under
 * `.sly` / `.prev`); a plain answer has only the row's own `result`.
 */
export function resultParts(row, { pos = 0, which = 'current', mode = 'none' } = {}) {
  const cell = row?.cells?.[pos]?.result;
  if (which === 'compared') return cell?.[mode] ?? null;
  return cell ?? (pos === 0 ? row?.result ?? null : null);
}

/**
 * ETP-6083 — the income-summary row of a balance (the result of the year): its amount is the posted part plus the part
 * not yet regularized, calculated on the fly from the P&L accounts. This panel says which is which, as of the date of
 * the clicked cell, and opens the P&L for that year so the calculated part can be checked against it.
 */
export default function DynamicResultPanel({ info, years = [], state, pickers = [], onOpenLedger, onClose }) {
  const ui = useUI();
  const { locale } = useLocaleSwitch();
  const parts = info ? resultParts(info.row, info) : null;
  const to = info?.range?.to ?? state.dateTo;
  const fmt = (d) => formatCalendarDate(d, locale.replace('_', '-'));
  const open = Boolean(info);
  const pickerValue = (name) => (pickers.some((p) => p.name === name) ? state[name] : '');
  const basePath = window.location.pathname.replace(/\/[^/]*$/, ''); // same pattern as the report viewer's new-tab link
  const href = open ? resultReportUrl({ basePath, from: fiscalYearStart(years, to), to, orgId: state.orgId, bPartnerId: pickerValue('bPartnerId'), productId: pickerValue('productId') }) : '#';
  const rows = parts ? [
    ['posted', 'dynamicReportResultPosted', parts.posted],
    ['onTheFly', 'dynamicReportResultOnTheFly', parts.onTheFly],
  ] : [];
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()} data-testid="Sheet__result">
      <SheetContent side="right" className="w-[90vw] sm:max-w-md flex flex-col gap-3" data-testid="DynamicResultPanel">
        <SheetTitle className="text-base" data-testid="SheetTitle__result">{info ? `${info.row.value} - ${info.row.name}` : ''}</SheetTitle>
        <SheetDescription className="text-xs" data-testid="SheetDescription__result">
          {ui('dynamicReportResultIntro', { date: fmt(to) })}
        </SheetDescription>
        {parts ? (
          <dl className="grid grid-cols-1 gap-2 text-sm" data-testid="DynamicResultPanel__parts">
            {rows.map(([key, labelKey, value]) => (
              <div key={key} className="flex items-baseline justify-between gap-4 rounded-lg border border-border/40 px-3 py-2">
                <dt className="text-muted-foreground">{ui(labelKey)}</dt>
                <dd className="font-semibold tabular-nums" data-testid={`DynamicResultPanel__${key}`}>{amount(value)}</dd>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-4 px-3 py-1 border-t border-border">
              <dt>{ui('dynamicReportResultTotal')}</dt>
              <dd className="font-semibold tabular-nums" data-testid="DynamicResultPanel__total">{amount(info.amount)}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="DynamicResultPanel__none">{ui('noResults')}</p>
        )}
        <p className="text-xs text-muted-foreground">{ui('dynamicReportResultNote')}</p>
        <div className="flex flex-col gap-2 items-start">
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md border border-input bg-background text-sm hover:bg-muted"
            data-testid="DynamicResultPanel__openPnl"
          >
            <ArrowSquareOutIcon className="w-4 h-4" data-testid="ExternalLink__result" />{ui('dynamicReportOpenPnl')}
          </a>
          {onOpenLedger && info && (
            <Button variant="ghost" className="h-9 text-sm" onClick={() => onOpenLedger(info.row, info.range, parts?.posted ?? null)} data-testid="DynamicResultPanel__openLedger">
              {ui('dynamicReportResultPostedLedger')}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
