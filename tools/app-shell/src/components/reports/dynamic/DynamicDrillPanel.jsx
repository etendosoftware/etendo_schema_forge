import { useMemo, useState } from 'react';
import { ChevronRight, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useUI, useLocaleSwitch } from '@/i18n';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { formatCalendarDate } from '@/lib/dateOnly.js';
import { cn } from '@/lib/utils';
import { reportDocumentUrl } from '@/components/reports/reportDocumentUrl.js';
import { useReportQuery } from './useReportQuery.js';
import {
  ENTRY_REPORT_ID, ENTRY_REQUIRED_PARAMS, LEDGER_REPORT_ID, entryDocument, entryParams, filterLedgerRows,
  ledgerParams, ledgerSummary, sqlDateDay,
} from './drillDown.js';

const amount = (v) => formatCurrency(null, v);
const cell = 'px-2 py-1.5';
const num = `${cell} text-right tabular-nums`;

function useErrorText(error, errorCode) {
  const ui = useUI();
  if (!error) return null;
  if (errorCode === 'network') return error;
  return ui(errorCode === 'org_access_denied' ? 'dynamicReportErrorOrgAccess' : 'dynamicReportErrorGeneric');
}

function Status({ loading, error, errorCode, empty }) {
  const ui = useUI();
  const errorText = useErrorText(error, errorCode);
  if (errorText) return <p role="alert" className="text-sm text-destructive" data-testid="DynamicDrillPanel__error">{errorText}</p>;
  if (loading && empty) return <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" data-testid="DynamicDrillPanel__loading" />;
  if (empty) return <p className="text-sm text-muted-foreground" data-testid="DynamicDrillPanel__empty">{ui('noResults')}</p>;
  return null;
}

function Ledger({ params, locale, dateText, onOpenEntry }) {
  const ui = useUI();
  const [search, setSearch] = useState('');
  const { data, loading, error, errorCode } = useReportQuery(LEDGER_REPORT_ID, params, { locale });
  const rows = data?.rows ?? [];
  const summary = useMemo(() => ledgerSummary(rows, data?.openingRows), [rows, data]);
  const shown = useMemo(() => filterLedgerRows(rows, search), [rows, search]);
  const totals = [
    ['opening', 'dynamicReportOpening', summary.opening],
    ['debit', 'dynamicReportDebit', summary.debit],
    ['credit', 'dynamicReportCredit', summary.credit],
    ['closing', 'dynamicReportClosing', summary.closing],
  ];
  return (
    <div className="flex flex-col gap-3 min-h-0" data-testid="DynamicDrillPanel__ledger">
      {data && (
        <dl className="grid grid-cols-4 gap-2 text-xs">
          {totals.map(([key, labelKey, value]) => (
            <div key={key} className="rounded-lg border border-border/40 p-2">
              <dt className="text-muted-foreground">{ui(labelKey)}</dt>
              <dd className="font-semibold tabular-nums" data-testid={`DynamicDrillPanel__${key}`}>{amount(value)}</dd>
            </div>
          ))}
        </dl>
      )}
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={ui('dynamicReportSearchLines')}
        aria-label={ui('dynamicReportSearchLines')}
        data-testid="DynamicDrillPanel__search"
      />
      <Status loading={loading} error={error} errorCode={errorCode} empty={!shown.length} />
      {shown.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground border-b border-border/40">
              <th className={`${cell} text-left`}>{ui('dynamicReportDate')}</th>
              <th className={`${cell} text-left`}>{ui('dynamicReportDescription')}</th>
              <th className={`${cell} text-right`}>{ui('dynamicReportDebit')}</th>
              <th className={`${cell} text-right`}>{ui('dynamicReportCredit')}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={`${r.fact_acct_group_id}-${i}`} className="border-b border-border/30 hover:bg-muted/40" data-testid="DynamicDrillPanel__ledgerRow">
                <td className={cell}>
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={() => onOpenEntry({ id: r.fact_acct_group_id, dateDisplay: dateText(r.dateacct) })}
                    data-testid="DynamicDrillPanel__openEntry"
                  >
                    {dateText(r.dateacct)}
                  </button>
                </td>
                <td className={cell}>{r.groupbyname}</td>
                <td className={num}>{amount(r.amtacctdr)}</td>
                <td className={num}>{amount(r.amtacctcr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Entry({ params, locale, accountValue }) {
  const ui = useUI();
  const { data, loading, error, errorCode } = useReportQuery(ENTRY_REPORT_ID, params, { locale, required: ENTRY_REQUIRED_PARAMS });
  const rows = data?.rows ?? [];
  const doc = entryDocument(rows);
  return (
    <div className="flex flex-col gap-3" data-testid="DynamicDrillPanel__entry">
      <Status loading={loading} error={error} errorCode={errorCode} empty={!rows.length} />
      {rows.length > 0 && (
        <>
          <p className="text-xs text-muted-foreground">{rows[0].document_type}</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b border-border/40">
                <th className={`${cell} text-left`}>{ui('dynamicReportConcept')}</th>
                <th className={`${cell} text-right`}>{ui('dynamicReportDebit')}</th>
                <th className={`${cell} text-right`}>{ui('dynamicReportCredit')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={`${r.account_no}-${i}`}
                  className={cn('border-b border-border/30', r.account_no === accountValue && 'bg-primary/10 font-semibold')}
                  data-source={r.account_no === accountValue || undefined}
                  data-testid="DynamicDrillPanel__entryRow"
                >
                  <td className={cell}>{r.account_no} - {r.account_name}</td>
                  <td className={num}>{amount(r.amtacctdr)}</td>
                  <td className={num}>{amount(r.amtacctcr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {doc ? (
            <Button
              variant="outline"
              className="self-start h-9 gap-1.5 text-sm"
              onClick={() => window.open(reportDocumentUrl(doc), '_blank')}
              data-testid="DynamicDrillPanel__openDocument"
            >
              <ExternalLink className="w-4 h-4" />{ui('dynamicReportOpenDocument')}
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground" data-testid="DynamicDrillPanel__noDocument">{ui('dynamicReportNoDocument')}</p>
          )}
        </>
      )}
    </div>
  );
}

/**
 * ETP-6080 F9 — the drill-down side panel: report › account (its ledger, with the view's period and
 * filters) › entry (the whole entry, source account highlighted) › document (new tab). Each crumb
 * goes back to its step. An entry whose table has no window mapped ends the drill-down there (Q5).
 */
export default function DynamicDrillPanel({ reportTitle, account, queryParams, onClose }) {
  const ui = useUI();
  const { locale } = useLocaleSwitch();
  const [entry, setEntry] = useState(null);
  const dateText = (raw) => (raw ? formatCalendarDate(sqlDateDay(raw), locale.replace('_', '-')) : '');
  const ledger = useMemo(() => account && ledgerParams(queryParams, account), [account, queryParams]);
  const entryQuery = useMemo(() => entry && entryParams(queryParams, entry.id), [entry, queryParams]);
  const close = () => { setEntry(null); onClose(); };

  const crumbs = [
    { key: 'report', label: reportTitle, go: close },
    account && { key: 'account', label: `${account.value} - ${account.name}`, go: entry ? () => setEntry(null) : null },
    entry && { key: 'entry', label: `${ui('dynamicReportEntry')} ${entry.dateDisplay}`, go: null },
  ].filter(Boolean);

  return (
    <Sheet open={Boolean(account)} onOpenChange={(open) => !open && close()}>
      <SheetContent side="right" className="w-[90vw] sm:max-w-2xl flex flex-col overflow-y-auto" data-testid="DynamicDrillPanel">
        <SheetTitle className="text-base">{crumbs[crumbs.length - 1].label}</SheetTitle>
        <SheetDescription asChild>
          <nav aria-label={ui('dynamicReportDrillPath')} className="flex flex-wrap items-center gap-1 text-xs">
            {crumbs.map((c, i) => (
              <span key={c.key} className="inline-flex items-center gap-1">
                {i > 0 && <ChevronRight className="w-3 h-3" />}
                {c.go
                  ? <button type="button" className="hover:underline" onClick={c.go} data-testid={`DynamicDrillPanel__crumb-${c.key}`}>{c.label}</button>
                  : <span aria-current="page" data-testid={`DynamicDrillPanel__crumb-${c.key}`}>{c.label}</span>}
              </span>
            ))}
          </nav>
        </SheetDescription>
        {account && !entry && <Ledger params={ledger} locale={locale} dateText={dateText} onOpenEntry={setEntry} />}
        {entry && <Entry key={entry.id} params={entryQuery} locale={locale} accountValue={account.value} />}
      </SheetContent>
    </Sheet>
  );
}
