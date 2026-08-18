import { Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { useUI, useLocaleSwitch } from '@/i18n';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { MoneyAmount } from '@/components/ui/money-amount';
import { formatDate } from '@/lib/formatSigned';
import { getContractGridColumns } from '@/components/financial-accounts/contractColumns';
import { useClearedItems } from '@/hooks/useReconciliationList';

/**
 * The cleared items of one reconciliation (ETP-4795) — Classic's "Cleared items" child tab.
 *
 * Mounted only while its accordion row is open, so the query fires lazily per expanded row instead
 * of N+1 up front. Same lifecycle as `StatementLinesInline`, which this mirrors.
 *
 * Columns come from the contract (`decisions.json` → `clearedItems`), so reordering or dropping one
 * is a decisions change, not a JSX change.
 */

const GRID_CLASS = 'grid gap-3';

// Per-field width + i18n header + cell renderer, keyed by CONTRACT field name. The renderer
// decouples that name from the key the generic CRUD returns, and from the `$_identifier` suffix
// NEO uses to carry a foreign key's display label.
const CELL_RENDERERS = {
  transactionDate: {
    width: '104px',
    labelKey: 'financeAccountClearedItemsColDate',
    render: (r, ctx) => <span className="whitespace-nowrap">{formatDate(r.transactionDate, ctx.bcpLocale)}</span>,
  },
  description: {
    width: 'minmax(0,1fr)',
    labelKey: 'financeAccountClearedItemsColDescription',
    render: (r) => (
      <span className="truncate" title={r.description || ''}>{r.description || '—'}</span>
    ),
  },
  financialAccountTransaction: {
    width: '96px',
    labelKey: 'financeAccountClearedItemsColTransaction',
    // A movement has no short identifier of its own — everything that names it (date, amount,
    // description, payment) is already a column here, and its full identifier just repeats them.
    // So instead of inventing a label this is an icon link that jumps to the movement in the
    // Movements tab; the full identifier stays available as the tooltip.
    render: (r, ctx) => {
      if (!r.financialAccountTransaction) {
        return <span className="text-[hsl(var(--text-disabled))]">—</span>;
      }
      return (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); ctx.openMovement(r); }}
          title={identifierOf(r, 'financialAccountTransaction')}
          aria-label={ctx.ui('financeAccountClearedItemsOpenMovement')}
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[hsl(var(--border-control))] bg-card text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"
        >
          <ArrowUpRight className="h-3.5 w-3.5" data-testid="ArrowUpRight__9d6ccb" />
        </button>
      );
    },
  },
  payment: {
    width: '120px',
    labelKey: 'financeAccountClearedItemsColPayment',
    // Document number only, as a link to the payment window — same affordance as the Movements
    // grid's "Pago" column. The full identifier ("1000123 - 06-08-2026 - Empresa … - 87.12")
    // never fit and repeated data already shown in the other columns.
    render: (r, ctx) => {
      const docNo = paymentDocumentNo(r);
      if (!r.payment) return <span className="text-[hsl(var(--text-disabled))]">—</span>;
      return (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); ctx.openPayment(r); }}
          className="inline-flex items-center gap-1 truncate font-semibold text-[hsl(var(--foreground))] underline decoration-[hsl(var(--border-control))] underline-offset-4 hover:decoration-[hsl(var(--foreground))]"
        >
          {docNo}
          <ArrowUpRight className="h-3 w-3 shrink-0" data-testid="ArrowUpRight__9d6ccb" />
        </button>
      );
    },
  },
  currency: {
    width: '72px',
    labelKey: 'financeAccountClearedItemsColCurrency',
    render: (r) => <span>{identifierOf(r, 'currency')}</span>,
  },
  transactionType: {
    width: '120px',
    labelKey: 'financeAccountClearedItemsColType',
    render: (r, ctx) => <span className="truncate">{ctx.trxTypeLabel(r.transactionType)}</span>,
  },
  gLItem: {
    width: 'minmax(120px,0.7fr)',
    labelKey: 'financeAccountClearedItemsColGlItem',
    render: (r) => <span className="truncate">{identifierOf(r, 'gLItem')}</span>,
  },
};

const COLUMNS = getContractGridColumns('clearedItems');
// Structural tail: the signed amount. Deposit and withdrawal are separate AD fields, but a single
// signed figure (green in / red out) is what the Movements grid shows and what reads best here —
// and a net is a derived value, so it cannot be a contract column. Same reason StatementsTable
// keeps its computed aggregates as fixed tail tracks.
// Flexible, not fixed: with only description and G/L item taking `fr` shares, description soaked
// up all the leftover width while the amount stayed cramped. Giving the amount its own share caps
// description AND leaves the number room to grow — a six-figure total must never wrap or clip.
const TAIL_TRACKS = 'minmax(150px,0.6fr)';
const GRID_STYLE = {
  gridTemplateColumns: [
    ...COLUMNS.map((c) => CELL_RENDERERS[c.name]?.width ?? 'minmax(0,1fr)'),
    TAIL_TRACKS,
  ].join(' '),
};
const SKELETON_CELL_KEYS = [...COLUMNS.map((c) => `c_${c.name}`), 'amount'];
const SKELETON_ROWS = [1, 2, 3];

/** Signed amount of a cleared item: deposit minus withdrawal. */
function signedAmount(row) {
  return (Number(row.depositAmount) || 0) - (Number(row.paymentAmount) || 0);
}

/** NEO returns a foreign key as a raw id plus a `<field>$_identifier` display label. */
function identifierOf(row, field) {
  return row[`${field}$_identifier`] || '—';
}

/**
 * The payment's document number, extracted from its NEO identifier.
 *
 * FIN_Payment's identifier concatenates its identifier columns with " - "
 * ("1000123 - 06-08-2026 - Empresa Cajas S.A - 87.12"); the document number is the first segment.
 * The view this entity is built on (`FIN_ReconciliationLine_v`) carries only the payment's id, not
 * its documentno, so there is nothing cleaner to read. Falls back to the whole identifier if the
 * split yields nothing.
 */
function paymentDocumentNo(row) {
  const identifier = row['payment$_identifier'] || '';
  const [first] = identifier.split(' - ');
  return first?.trim() || identifier || '—';
}

/**
 * Which payment window to open. The view has no `isreceipt`, so the direction is derived from the
 * transaction type — the same rule the reconciliation backend uses when a payment is absent:
 * BPD (BP Deposit) is money in, BPW is money out, and anything else falls back to the amounts.
 */
function isReceiptRow(row) {
  if (row.transactionType === 'BPD') return true;
  if (row.transactionType === 'BPW') return false;
  return (Number(row.depositAmount) || 0) >= (Number(row.paymentAmount) || 0);
}

/** The signed amount cell: green with a leading + for money in, red with a − for money out. */
function AmountCell({ row, currency }) {
  const amount = signedAmount(row);
  if (amount === 0) {
    return <span className="text-right text-[hsl(var(--text-disabled))]">—</span>;
  }
  return (
    <MoneyAmount
      value={amount}
      currency={currency}
      tone="auto"
      className="text-right font-semibold tabular-nums"
      data-testid="MoneyAmount__9d6ccb" />
  );
}

export function ClearedItemsInline({ reconciliationId, currency = 'EUR' }) {
  const ui = useUI();
  const navigate = useNavigate();
  const { locale: appLocale } = useLocaleSwitch();
  const bcpLocale = (appLocale || 'es_ES').replace('_', '-');
  const { items, loading } = useClearedItems(reconciliationId);

  const cellCtx = {
    ui,
    bcpLocale,
    currency,
    trxTypeLabel: (code) => ui(`financeAccountClearedItemsTrxType_${code}`) || code || '—',
    openPayment: (row) => {
      if (!row.payment) return;
      navigate(`/${isReceiptRow(row) ? 'payment-in' : 'payment-out'}/${row.payment}`);
    },
    // Search-only navigation: we are already inside this account's window, and its deep-link
    // effect reacts to searchParams changes (not just mount), so this switches tab and highlights
    // the row without remounting the window.
    openMovement: (row) => {
      if (!row.financialAccountTransaction) return;
      navigate(`?tab=movements&txn=${encodeURIComponent(row.financialAccountTransaction)}`);
    },
  };

  return (
    <div
      className="rounded-lg border border-[hsl(var(--border-subtle))] bg-card shadow-[0px_1px_2px_hsl(var(--foreground)_/_0.05)]"
      data-testid="cleared-items-inline"
    >
      {/* Same header treatment as the parent table and the Movements grid. */}
      <div
        role="row"
        style={GRID_STYLE}
        className={cn(
          GRID_CLASS,
          'h-10 items-center border-b border-[hsl(var(--border-subtle))] px-4',
          'text-xs font-semibold leading-4 text-[hsl(var(--foreground))]',
        )}
      >
        {COLUMNS.map((col) => (
          <span key={col.name}>
            {CELL_RENDERERS[col.name] ? ui(CELL_RENDERERS[col.name].labelKey) : col.label}
          </span>
        ))}
        <span className="text-right">{ui('financeAccountClearedItemsColAmount')}</span>
      </div>
      {renderBody({ loading, items, ui, currency, cellCtx })}
    </div>
  );
}

/** Extracted so the loading / empty / rows branching isn't a nested ternary (Sonar). */
function renderBody({ loading, items, ui, currency, cellCtx }) {
  if (loading) {
    return SKELETON_ROWS.map((n) => (
      <div
        key={n}
        role="row"
        style={GRID_STYLE}
        className={cn(GRID_CLASS, 'border-b border-[hsl(var(--border-subtle))] px-4 py-2.5 last:border-b-0')}
      >
        {SKELETON_CELL_KEYS.map((k) => <Skeleton key={k} className="h-4 w-full" data-testid="Skeleton__9d6ccb" />)}
      </div>
    ));
  }
  if (items.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
        {ui('financeAccountClearedItemsEmpty')}
      </p>
    );
  }
  return items.map((row) => (
    <div
      key={row.id}
      role="row"
      style={GRID_STYLE}
      className={cn(
        GRID_CLASS,
        'items-center border-b border-[hsl(var(--border-subtle))] px-4 py-2.5 text-[13px] text-[hsl(var(--foreground))] last:border-b-0',
      )}
      data-testid={`cleared-item-row-${row.id}`}
    >
      {COLUMNS.map((col) => {
        const renderer = CELL_RENDERERS[col.name];
        return (
          <Fragment key={col.name} data-testid="Fragment__9d6ccb">
            {renderer
              ? renderer.render(row, cellCtx)
              : <span className="truncate">{row[col.name] ?? '—'}</span>}
          </Fragment>
        );
      })}
      <AmountCell row={row} currency={currency} data-testid="AmountCell__9d6ccb" />
    </div>
  ));
}
