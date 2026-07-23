import { useUI, useLocaleSwitch } from '@/i18n';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { MoneyAmount } from '@/components/ui/money-amount';
import { StatusTag } from '@/components/ui/status-tag';

// reconcileStatus ("RECONCILED"/"PARTIAL"/"PENDING") → StatusTag tone + i18n key. Mirrors
// StatementLinesInline's MATCH_TONE — PARTIAL is a line matched against less than its full
// amount (Core split it into a reconciled portion + a pending remainder, re-collapsed here into
// one row by BankStatementsSupport.mergeMatchGroups). Falls back to the plain `matched` boolean
// for rows predating the field.
const STATUS_TONE = {
  RECONCILED: { tone: 'success', labelKey: 'financeAccountStatementLinesStatusReconciled' },
  PARTIAL:    { tone: 'warning', labelKey: 'financeAccountStatementLinesStatusPartial' },
  PENDING:    { tone: 'warning', labelKey: 'financeAccountStatementLinesStatusUnmatched' },
};

function statusEntryFor(line) {
  return STATUS_TONE[line.reconcileStatus]
    ?? (line.matched ? STATUS_TONE.RECONCILED : STATUS_TONE.PENDING);
}

// Status pill + (for PARTIAL) the pending-amount caption, e.g. "46,76 € por conciliar".
function MatchCell({ line, ui, currency, bcpLocale }) {
  const entry = statusEntryFor(line);
  const isPartial = line.reconcileStatus === 'PARTIAL';
  return (
    <div className="flex flex-col items-start gap-0.5" data-testid="MatchCell__2364e3">
      <StatusTag tone={entry.tone} label={ui(entry.labelKey)} data-testid="StatusTag__2364e3" />
      {isPartial ? (
        <span
          className="whitespace-nowrap text-[11px] text-[#828FA3]"
          data-testid="statement-line-pending-amount"
        >
          {ui('financeAccountStatementLinesPendingAmount', {
            amount: formatMoney(Math.abs(Number(line.pendingAmount) || 0), currency, bcpLocale),
          })}
        </span>
      ) : null}
    </div>
  );
}

function formatDate(isoString, bcpLocale) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(bcpLocale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

function formatMoney(amount, currency, bcpLocale) {
  try {
    return new Intl.NumberFormat(bcpLocale, {
      style: 'currency', currency,
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(Number(amount));
  } catch {
    return `${Number(amount).toFixed(2)} ${currency}`;
  }
}

const SKELETON_ROWS = [1, 2, 3, 4, 5];
const SKELETON_COL_KEYS = ['lineno', 'date', 'description', 'reference', 'bpartner', 'amount', 'matched'];

function renderBody({ loading, lines, emptyLabel, renderRow }) {
  if (loading) {
    return SKELETON_ROWS.map((n) => (
      <TableRow key={n} data-testid="TableRow__2364e3">
        {SKELETON_COL_KEYS.map((k) => (
          <TableCell key={k} data-testid="TableCell__2364e3">
            <Skeleton className="h-4 w-full" data-testid="Skeleton__2364e3" />
          </TableCell>
        ))}
      </TableRow>
    ));
  }
  if (lines.length === 0) {
    return (
      <TableRow data-testid="TableRow__2364e3">
        <TableCell
          colSpan={7}
          className="py-16 text-center text-sm text-[#6c6c89]"
          data-testid="TableCell__2364e3">
          {emptyLabel}
        </TableCell>
      </TableRow>
    );
  }
  return lines.map(renderRow);
}

/**
 * @param {{ lines: Array<object>; loading: boolean; currency?: string }} props
 */
export function StatementLinesTable({ lines, loading, currency = 'EUR' }) {
  const ui = useUI();
  const { locale: appLocale } = useLocaleSwitch();
  const bcpLocale = (appLocale || 'es_ES').replace('_', '-');

  return (
    <Table data-testid="Table__2364e3">
      <TableHeader data-testid="TableHeader__2364e3">
        <TableRow
          className="h-10 [&_th]:text-xs [&_th]:font-semibold [&_th]:leading-4 [&_th]:text-[#121217]"
          data-testid="TableRow__2364e3">
          <TableHead data-testid="TableHead__2364e3">{ui('financeAccountStatementLinesColLineNo')}</TableHead>
          <TableHead data-testid="TableHead__2364e3">{ui('financeAccountStatementLinesColDate')}</TableHead>
          <TableHead data-testid="TableHead__2364e3">{ui('financeAccountStatementLinesColDescription')}</TableHead>
          <TableHead data-testid="TableHead__2364e3">{ui('financeAccountStatementLinesColReference')}</TableHead>
          <TableHead data-testid="TableHead__2364e3">{ui('financeAccountStatementLinesColBpartner')}</TableHead>
          <TableHead data-testid="TableHead__2364e3">{ui('financeAccountStatementLinesColAmount')}</TableHead>
          <TableHead data-testid="TableHead__2364e3">{ui('financeAccountStatementLinesColMatched')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody data-testid="TableBody__2364e3">
        {renderBody({
          loading,
          lines,
          emptyLabel: ui('financeAccountStatementLinesEmpty'),
          renderRow: (line) => (
            <TableRow
              key={line.id}
              data-testid={`statement-line-row-${line.id}`}
              className="bg-white"
            >
              <TableCell className="text-sm text-[#6c6c89]" data-testid="TableCell__2364e3">{line.lineNo}</TableCell>
              <TableCell
                className="whitespace-nowrap text-sm text-[#121217]"
                data-testid="TableCell__2364e3">
                {formatDate(line.date, bcpLocale)}
              </TableCell>
              <TableCell
                className="max-w-[220px] truncate text-sm text-[#121217]"
                data-testid="TableCell__2364e3">
                {line.description || '—'}
              </TableCell>
              <TableCell className="text-sm text-[#121217]" data-testid="TableCell__2364e3">{line.reference || '—'}</TableCell>
              <TableCell className="text-sm text-[#121217]" data-testid="TableCell__2364e3">{line.bpartnerName || '—'}</TableCell>
              <TableCell className="text-right" data-testid="TableCell__2364e3">
                <MoneyAmount
                  value={line.amount}
                  currency={currency}
                  tone="auto"
                  className="text-sm font-semibold"
                  data-testid="MoneyAmount__2364e3" />
              </TableCell>
              <TableCell data-testid="TableCell__2364e3">
                <MatchCell line={line} ui={ui} currency={currency} bcpLocale={bcpLocale} data-testid="MatchCell__wrap" />
              </TableCell>
            </TableRow>
          ),
        })}
      </TableBody>
    </Table>
  );
}
