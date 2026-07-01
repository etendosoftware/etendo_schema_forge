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
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: line.matched ? '#26A95F' : '#D1D4DB' }}
                  aria-label={line.matched ? ui('financeAccountStatementLinesMatchedYes') : ui('financeAccountStatementLinesMatchedNo')}
                />
              </TableCell>
            </TableRow>
          ),
        })}
      </TableBody>
    </Table>
  );
}
