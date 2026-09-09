import { Fragment, useState } from 'react';
import { ArrowUpRight, Layers } from 'lucide-react';
import { useUI, useLocaleSwitch } from '@/i18n';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { formatCalendarDate } from '@/lib/dateOnly.js';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusTag } from '@/components/ui/status-tag';
import { cn } from '@/lib/utils';
import { useBankStatementLines } from '@/hooks/useBankStatementLines';
import { ReconciledTxnsModal } from './ReconciledTxnsModal';
import { getContractGridColumns } from '@/components/financial-accounts/contractColumns';

// Layout for the `mini` variant of the lines table. The DATA columns come from
// the window contract (entity `bankStatementLines`); the synthetic tail (match
// pill, transaction chip, flexible spacer) stays fixed. Grid template built
// dynamically and applied inline (Tailwind can't JIT a dynamic class).
//   <contract columns> · 136 status pill (+ pending-amount caption for PARTIAL) · 120 txn chip
// No trailing spacer: the description column (2fr) absorbs the leftover width.
const MINI_GRID_CLASS = 'grid gap-3';
const MINI_TAIL_TRACKS = '136px 120px';

// Contract field name → width + i18n header + cell renderer. Amount OUT/IN are
// derived from the signed `line.amount`, so dramount/cramount render the split.
const LINE_CELL_RENDERERS = {
  transactionDate: {
    width: '100px',
    labelKey: 'financeAccountStatementLinesColDate',
    render: (line, ctx) => <span className="whitespace-nowrap text-[hsl(var(--foreground))]">{formatDate(line.date, ctx.bcpLocale)}</span>,
  },
  description: {
    width: 'minmax(220px,2fr)',
    labelKey: 'financeAccountStatementLinesColDescription',
    render: (line) => (
      <span className={cn('truncate', line.description ? 'text-[hsl(var(--muted-foreground))]' : 'text-[hsl(var(--text-disabled))]')} title={line.description || ''}>
        {line.description || '—'}
      </span>
    ),
  },
  bpartnername: {
    width: 'minmax(140px,1fr)',
    labelKey: 'financeAccountStatementLinesColBpartner',
    render: (line) => (
      <span className={cn('truncate', line.bpartnerName ? 'text-[hsl(var(--muted-foreground))]' : 'text-[hsl(var(--text-disabled))]')} title={line.bpartnerName || ''}>
        {line.bpartnerName || '—'}
      </span>
    ),
  },
  businessPartner: {
    width: 'minmax(140px,1fr)',
    labelKey: 'financeAccountStatementLinesColContact',
    render: (line) => (
      <span className={cn('truncate', line.bpartnerFkName ? 'text-[hsl(var(--muted-foreground))]' : 'text-[hsl(var(--text-disabled))]')} title={line.bpartnerFkName || ''}>
        {line.bpartnerFkName || '—'}
      </span>
    ),
  },
  gLItem: {
    width: 'minmax(140px,1fr)',
    labelKey: 'financeAccountStatementLinesColGlItem',
    render: (line) => (
      <span className={cn('truncate', line.glItemName ? 'text-[hsl(var(--muted-foreground))]' : 'text-[hsl(var(--text-disabled))]')} title={line.glItemName || ''}>
        {line.glItemName || '—'}
      </span>
    ),
  },
  referenceNo: {
    width: 'minmax(120px,1fr)',
    labelKey: 'financeAccountStatementLinesColReference',
    render: (line) => (
      <span className={cn('truncate', line.reference ? 'text-[hsl(var(--muted-foreground))]' : 'text-[hsl(var(--text-disabled))]')} title={line.reference || ''}>
        {line.reference || '—'}
      </span>
    ),
  },
  dramount: {
    width: '110px',
    labelKey: 'financeAccountStatementLinesColDramount',
    render: (line, ctx) => {
      const amount = Number(line.amount) || 0;
      const out = amount < 0 ? -amount : 0;
      return (
        <span className="text-right tabular-nums">
          <AmountCell
            value={out}
            sign="−"
            toneClass="font-semibold text-destructive"
            currency={ctx.currency}
            data-testid="AmountCell__10cf4a" />
        </span>
      );
    },
  },
  cramount: {
    width: '110px',
    labelKey: 'financeAccountStatementLinesColCramount',
    render: (line, ctx) => {
      const amount = Number(line.amount) || 0;
      const inn = amount > 0 ? amount : 0;
      return (
        <span className="text-right tabular-nums">
          <AmountCell
            value={inn}
            sign="+"
            toneClass="font-semibold text-status-success-foreground"
            currency={ctx.currency}
            data-testid="AmountCell__10cf4a" />
        </span>
      );
    },
  },
};

const LINE_COLUMNS = getContractGridColumns('bankStatementLines');

// Amount columns are pushed to the end so the order matches the Figma:
//   …Nº Referencia · Estado · Transacción · Salida · Entrada
const AMOUNT_COLS = new Set(['dramount', 'cramount']);
const LEAD_COLUMNS = LINE_COLUMNS.filter((c) => !AMOUNT_COLS.has(c.name));
const AMOUNT_COLUMNS = LINE_COLUMNS.filter((c) => AMOUNT_COLS.has(c.name));

const MINI_GRID_TEMPLATE = [
  ...LEAD_COLUMNS.map((c) => LINE_CELL_RENDERERS[c.name]?.width ?? 'minmax(140px,1fr)'),
  MINI_TAIL_TRACKS, // Estado · Transacción
  ...AMOUNT_COLUMNS.map((c) => LINE_CELL_RENDERERS[c.name]?.width ?? '110px'),
].join(' ');
const MINI_GRID_STYLE = { gridTemplateColumns: MINI_GRID_TEMPLATE };

// Stable keys for the skeleton cells (contract columns + match + txn).
const SKELETON_CELL_KEYS = [...LINE_COLUMNS.map((c) => `c_${c.name}`), 'matched', 'txns'];

// kind → (StatusTag tone, i18n key). Three states: fully reconciled, not reconciled at all, or
// PARTIAL — a line that was matched against less than its full amount (e.g. one invoice smaller
// than the line) and got split by Core into a reconciled portion + a pending remainder, which
// BankStatementsSupport.mergeMatchGroups re-collapses into this single row (ETP-4502 iteration 4,
// mirroring how Holded shows "X pending" on a partially-matched movement instead of a second row).
const MATCH_TONE = {
  reconciled: { tone: 'success', labelKey: 'financeAccountStatementLinesStatusReconciled' },
  partial:    { tone: 'warning', labelKey: 'financeAccountStatementLinesStatusPartial' },
  pending:    { tone: 'warning', labelKey: 'financeAccountStatementLinesStatusUnmatched' },
};

// Backend `reconcileStatus` ("RECONCILED"/"PARTIAL"/"PENDING") → local pill kind. Falls back to
// the plain `matched` boolean for any row that predates the field (defensive, not expected once
// this ships).
function matchKindFor(line) {
  const byStatus = { RECONCILED: 'reconciled', PARTIAL: 'partial', PENDING: 'pending' };
  return byStatus[line.reconcileStatus] ?? (line.matched ? 'reconciled' : 'pending');
}

function MatchPill({ kind, ui }) {
  const entry = MATCH_TONE[kind] ?? MATCH_TONE.pending;
  return (
    <StatusTag
      tone={entry.tone}
      label={ui(entry.labelKey)}
      data-testid="StatusTag__10cf4a" />
  );
}

// "Transacción" cell: shows the reconciled movement(s) of the line. None → "—";
// exactly one → a chip with its payment number; several → a "N transacciones"
// chip. Any chip opens the ReconciledTxnsModal. Built array-first so a future
// 1:N reconciliation needs no UI change.
function TxnChip({ line, ui, onOpen }) {
  const txns = line.txns || [];
  if (txns.length === 0) {
    return <span className="text-[hsl(var(--text-disabled))]">—</span>;
  }
  const multi = txns.length > 1;
  return (
    <button
      type="button"
      data-testid={`statement-line-txn-${line.id}`}
      onClick={() => onOpen(line)}
      className={cn(
        'inline-flex h-6 max-w-full items-center gap-1.5 rounded-full bg-[hsl(var(--muted))] px-2 text-xs font-normal text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]',
        multi && 'font-medium',
      )}
    >
      {multi ? <Layers className="h-3.5 w-3.5 flex-none text-[hsl(var(--text-disabled))]" data-testid="Layers__10cf4a" /> : <ArrowUpRight className="h-3.5 w-3.5 flex-none text-[hsl(var(--text-disabled))]" data-testid="ArrowUpRight__10cf4a" />}
      <span className="truncate">
        {multi ? ui('financeAccountStatementLinesTxnChipMulti', { count: txns.length }) : txns[0].documentNo}
      </span>
    </button>
  );
}

/**
 * Formats a business date for display, via the canonical `formatCalendarDate`.
 *
 * It reads the leading `yyyy-MM-dd` and builds the Date with the LOCAL-time
 * constructor, so the calendar day survives regardless of the host's offset —
 * and regardless of whether the payload carries a zone suffix.
 *
 * This used to be `new Date(iso)` + `Intl.DateTimeFormat(..., timeZone: 'UTC')`,
 * on the premise that the backend always sent UTC midnight. ETP-5100 removed
 * that premise (NEO now emits the civil `yyyy-MM-dd'T'HH:mm:ss` in the server's
 * own zone), and the two UTC assumptions then stacked instead of cancelling:
 * `new Date("2026-09-01T22:59:10")` parses as LOCAL, and rendering that instant
 * back in UTC pushed it to 02/09. Going through the shared helper removes the
 * assumption entirely rather than swapping it for the opposite one.
 */
function formatDate(iso, bcpLocale) {
  return formatCalendarDate(iso, bcpLocale);
}

function formatMoney(amount, currency) {
  return formatCurrency(currency, amount);
}

/**
 * "mini" variant of the lines table rendered inside an expanded accordion row
 * of {@link StatementsTable}. Layout matches the approved Option C handoff:
 *
 *   ┌───────────────────────────────────────────────────────────┐
 *   │ [list] Líneas del extracto (N)   [filter] [link] actions │
 *   ├───────────────────────────────────────────────────────────┤
 *   │ Nº · Fecha · Descripción · Contraparte · Salida · Entrada · Estado │
 *   ├───────────────────────────────────────────────────────────┤
 *   │ Mostrando N de N líneas.        Abrir extracto completo ↗ │
 *   └───────────────────────────────────────────────────────────┘
 *
 * Reconciliation actions ("Conciliar todas", per-line approve) are placeholders
 * until T6/T7 — the buttons render disabled with a coming-soon tooltip.
 */
export function StatementLinesInline({ statementId, currency = 'EUR', refreshToken = 0 }) {
  const ui = useUI();
  const { locale: appLocale } = useLocaleSwitch();
  const bcpLocale = (appLocale || 'es_ES').replace('_', '-');
  // `refreshToken` is bumped by the tab after any statement mutation — without it these lines
  // are fetched once per statementId and never again, so an edit made in the modal above left
  // the expanded row showing the old amounts (ETP-4921). See useBankStatementLines.
  const { lines, loading } = useBankStatementLines(statementId, refreshToken);
  const [txnLine, setTxnLine] = useState(null);

  return (
    <>
      <div className="overflow-hidden rounded-lg border border-[hsl(var(--border-subtle))] bg-card shadow-[0_1px_2px_hsl(var(--foreground) / 0.05)]">
        {/* Column header — same style as the parent Statements table headers. */}
        <div
          style={MINI_GRID_STYLE}
          className={cn(
            // Same recipe as the parent Statements table header (h-10 items-center) — centered.
            MINI_GRID_CLASS,
            'h-10 items-center border-b border-[hsl(var(--border-subtle))] px-3 text-xs font-semibold leading-4 text-[hsl(var(--foreground))]',
          )}
        >
          {LEAD_COLUMNS.map((col) => (
            <span key={col.name} className="truncate">
              {LINE_CELL_RENDERERS[col.name] ? ui(LINE_CELL_RENDERERS[col.name].labelKey) : col.label}
            </span>
          ))}
          <span className="truncate">{ui('financeAccountStatementLinesColMatched')}</span>
          <span className="truncate">{ui('financeAccountStatementLinesColTransaction')}</span>
          {/* Right-aligned to match the cells underneath, which are already `text-right
              tabular-nums`. This grid is hand-rolled, so it does not inherit the generic
              DataTable rule that right-aligns a numeric column's header — the Salida / Entrada
              labels sat left of their own figures. */}
          {AMOUNT_COLUMNS.map((col) => (
            <span key={col.name} className="truncate text-right">
              {LINE_CELL_RENDERERS[col.name] ? ui(LINE_CELL_RENDERERS[col.name].labelKey) : col.label}
            </span>
          ))}
        </div>
        {/* Body */}
        {renderBody({ loading, lines, ui, currency, bcpLocale, onOpenTxns: setTxnLine })}
      </div>
      {txnLine ? (
        <ReconciledTxnsModal
          line={txnLine}
          currency={currency}
          onClose={() => setTxnLine(null)}
          data-testid="ReconciledTxnsModal__10cf4a" />
      ) : null}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Body renderer extracted to avoid the nested ternary Sonar flagged on the
// previous loading / empty / rows branching.
// ─────────────────────────────────────────────────────────────────────────────
function renderBody({ loading, lines, ui, currency, bcpLocale, onOpenTxns }) {
  if (loading) {
    return [1, 2, 3].map((n) => (
      <div key={n} style={MINI_GRID_STYLE} className={cn(MINI_GRID_CLASS, 'items-center border-b border-[hsl(var(--border-subtle))] px-3 py-2.5')}>
        {SKELETON_CELL_KEYS.map((k) => (
          <Skeleton key={k} className="h-4 w-full" data-testid="Skeleton__10cf4a" />
        ))}
      </div>
    ));
  }
  if (lines.length === 0) {
    return (
      <div className="px-3 py-8 text-center text-sm text-[hsl(var(--muted-foreground))]" role="row">
        {ui('financeAccountStatementLinesEmpty')}
      </div>
    );
  }
  return lines.map((line) => (
    <LineRow
      key={line.id}
      line={line}
      ui={ui}
      currency={currency}
      bcpLocale={bcpLocale}
      onOpenTxns={onOpenTxns}
      data-testid="LineRow__10cf4a" />
  ));
}

// Single row of the lines table — split out so we can render the amount
// columns with simple if/else branching instead of nested ternaries.
function LineRow({ line, ui, currency, bcpLocale, onOpenTxns }) {
  const matchKind = matchKindFor(line);
  const cellCtx = { ui, currency, bcpLocale };
  const pendingAmountLabel = matchKind === 'partial'
    ? ui('financeAccountStatementLinesPendingAmount', {
      amount: formatMoney(Math.abs(Number(line.pendingAmount) || 0), currency),
    })
    : null;
  return (
    <div
      data-testid={`statement-line-row-${line.id}`}
      style={MINI_GRID_STYLE}
      className={cn(
        MINI_GRID_CLASS,
        'items-center border-b border-[hsl(var(--border-subtle))] px-3 py-2.5 text-sm transition-colors last:border-0 hover:bg-[hsl(var(--muted))]',
      )}
    >
      {/* Lead data columns (contract order, minus the amount columns) */}
      {LEAD_COLUMNS.map((col) => {
        const renderer = LINE_CELL_RENDERERS[col.name];
        return (
          <Fragment key={col.name} data-testid="Fragment__10cf4a">
            {renderer
              ? renderer.render(line, cellCtx)
              : <span className="truncate text-[hsl(var(--muted-foreground))]">{line[col.name] ?? '—'}</span>}
          </Fragment>
        );
      })}
      <span className="flex min-w-0 flex-col items-start gap-0.5" data-testid="MatchCell__10cf4a">
        <MatchPill kind={matchKind} ui={ui} data-testid="MatchPill__10cf4a" />
        {matchKind === 'partial' ? (
          <span
            className="max-w-full truncate text-[11px] leading-none text-[hsl(var(--muted-foreground))]"
            title={pendingAmountLabel}
            data-testid="statement-line-pending-amount"
          >
            {pendingAmountLabel}
          </span>
        ) : null}
      </span>
      <span className="min-w-0"><TxnChip line={line} ui={ui} onOpen={onOpenTxns} data-testid="TxnChip__10cf4a" /></span>
      {/* Amount columns last, matching the Figma column order */}
      {AMOUNT_COLUMNS.map((col) => {
        const renderer = LINE_CELL_RENDERERS[col.name];
        return (
          <Fragment key={col.name} data-testid="Fragment__10cf4a">
            {renderer
              ? renderer.render(line, cellCtx)
              : <span className="truncate text-[hsl(var(--muted-foreground))]">{line[col.name] ?? '—'}</span>}
          </Fragment>
        );
      })}
    </div>
  );
}

function AmountCell({ value, sign, toneClass, currency }) {
  if (value > 0) {
    return <span className={toneClass}>{sign}{formatMoney(value, currency)}</span>;
  }
  return <span className="text-[hsl(var(--text-disabled))]">—</span>;
}
