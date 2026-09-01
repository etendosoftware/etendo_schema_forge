import { Fragment, useState } from 'react';
import { ChevronDown, Scale } from 'lucide-react';
import { useUI, useLocaleSwitch } from '@/i18n';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusTag } from '@/components/ui/status-tag';
import { MoneyAmount } from '@/components/ui/money-amount';
import { formatDate } from '@/lib/formatSigned';
import { getContractGridColumns } from '@/components/financial-accounts/contractColumns';
import { SortableHeaderLabel } from '@/components/financial-accounts/SortableHeaderLabel.jsx';
import { ClearedItemsInline } from './ClearedItemsInline.jsx';

/**
 * Read-only list of the reconciliation documents of an account (ETP-4795) — Classic's
 * "Reconciliations" tab. Expanding a row reveals its cleared items.
 *
 * Layout is a CSS grid rather than a `<table>` so the expanded accordion row can span every
 * column, exactly like `StatementsTable` (statements → lines) in this same window.
 *
 * Data columns come from the contract (`decisions.json` → `reconciliations`).
 */

const GRID_CLASS = 'grid gap-4';
// Structural lead: the chevron. No checkbox — nothing here is selectable, the tab is read-only.
const LEAD_TRACKS = '28px';

const CELL_RENDERERS = {
  documentNo: {
    width: 'minmax(120px,0.9fr)',
    labelKey: 'financeAccountReconciliationsColDocumentNo',
    render: (r) => (
      <span className="whitespace-nowrap font-semibold text-[hsl(var(--foreground))]">
        {r.documentNo || '—'}
      </span>
    ),
  },
  transactionDate: {
    width: 'minmax(110px,0.8fr)',
    labelKey: 'financeAccountReconciliationsColCloseDate',
    render: (r, ctx) => <span className="whitespace-nowrap">{formatDate(r.transactionDate, ctx.bcpLocale)}</span>,
  },
  startingbalance: {
    width: 'minmax(120px,0.9fr)',
    labelKey: 'financeAccountReconciliationsColStartingBalance',
    // Numeric, so the comparator orders 9 before 10 instead of lexicographically.
    sortValue: (r) => Number(r.startingbalance) || 0,
    render: (r, ctx) => (
      <MoneyAmount
        value={Number(r.startingbalance) || 0}
        currency={ctx.currency}
        tone="neutral"
        className="text-right tabular-nums"
        data-testid="MoneyAmount__d80a75" />
    ),
  },
  endingBalance: {
    width: 'minmax(120px,0.9fr)',
    labelKey: 'financeAccountReconciliationsColEndingBalance',
    sortValue: (r) => Number(r.endingBalance) || 0,
    render: (r, ctx) => (
      <MoneyAmount
        value={Number(r.endingBalance) || 0}
        currency={ctx.currency}
        tone="neutral"
        className="text-right font-semibold tabular-nums"
        data-testid="MoneyAmount__d80a75" />
    ),
  },
  // The pills are wrapped in a <span>: a StatusTag placed directly as a grid child inherits
  // `justify-self: stretch` and its background fills the whole track instead of hugging the text.
  documentStatus: {
    width: 'minmax(140px,1fr)',
    labelKey: 'financeAccountReconciliationsColStatus',
    // Sorts by the translated pill text, not the raw code: 'CO'/'DR'/'VO' order alphabetically
    // as Completado/Borrador/Anulado in neither language.
    sortValue: (r, ctx) => ctx.ui(`financeAccountReconciliationsDocStatus_${r.documentStatus}`) || r.documentStatus,
    render: (r, ctx) => (
      <span>
        <StatusTag
          tone={r.documentStatus === 'CO' ? 'success' : 'neutral'}
          label={ctx.ui(`financeAccountReconciliationsDocStatus_${r.documentStatus}`) || r.documentStatus || '—'}
          data-testid="StatusTag__d80a75" />
      </span>
    ),
  },
  posted: {
    width: 'minmax(170px,1.2fr)',
    labelKey: 'financeAccountReconciliationsColPosted',
    sortValue: (r, ctx) => ctx.postedLabel(r.posted),
    render: (r, ctx) => (
      <span>
        <StatusTag
          tone={postedTone(r.posted)}
          label={ctx.postedLabel(r.posted)}
          data-testid="StatusTag__d80a75" />
      </span>
    ),
  },
};

const COLUMNS = getContractGridColumns('reconciliations');
const GRID_STYLE = {
  gridTemplateColumns: [
    LEAD_TRACKS,
    ...COLUMNS.map((c) => CELL_RENDERERS[c.name]?.width ?? 'minmax(0,1fr)'),
  ].join(' '),
};
const SKELETON_CELL_KEYS = ['chev', ...COLUMNS.map((c) => `c_${c.name}`)];
const SKELETON_ROWS = [1, 2, 3, 4];

/**
 * `Posted` carries the accounting state. Only 'Y' is genuinely posted; 'N' is pending and every
 * other code is a blocked/error variant, so anything unknown reads as a warning rather than
 * silently looking fine.
 */
function postedTone(posted) {
  if (posted === 'Y') return 'success';
  if (posted === 'N') return 'neutral';
  return 'warning';
}

function amountAligned(name) {
  return name === 'startingbalance' || name === 'endingBalance';
}

/**
 * Sort accessors for this grid, keyed by contract field name.
 *
 * Exported so the TAB can own the sort state: its toolbar hosts the "Ordenar por" popover, and
 * the toolbar is a sibling of this table, not a child. Same split as ListView/DataTable — the
 * container owns the state, the grid receives it. Each accessor comes from the renderer that
 * draws the cell, so the order always matches what is on screen.
 */
export function buildReconciliationSortAccessors(cellCtx) {
  return Object.fromEntries(
    COLUMNS
      .filter((c) => CELL_RENDERERS[c.name]?.sortValue)
      .map((c) => [c.name, (row) => CELL_RENDERERS[c.name].sortValue(row, cellCtx)]),
  );
}

/** The sortable columns, for the toolbar popover's menu. */
export function buildReconciliationSortColumns(ui) {
  return COLUMNS.map((col) => ({
    key: col.name,
    label: CELL_RENDERERS[col.name] ? ui(CELL_RENDERERS[col.name].labelKey) : col.label,
  }));
}

export function ReconciliationListTable({
  reconciliations, loading, currency = 'EUR',
  sortKey = null, sortDirection = 'asc', onSort,
}) {
  const ui = useUI();
  const { locale: appLocale } = useLocaleSwitch();
  const bcpLocale = (appLocale || 'es_ES').replace('_', '-');
  const [openId, setOpenId] = useState(null);
  const toggle = (id) => setOpenId((prev) => (prev === id ? null : id));

  const cellCtx = {
    ui,
    bcpLocale,
    currency,
    // The label set of the accounting status, keyed by the raw `Posted` code.
    postedLabel: (posted) => ui(`financeAccountReconciliationsPosted_${posted}`) || posted || '—',
  };


  // Only the true initial fetch (no rows yet) wipes the body into skeleton rows below. A later
  // refresh already has rows to show, so it stays smooth via this opacity dim instead — same
  // reasoning as MovementsTable / StatementsTable / ListView's own ownScroll gate.
  const dimWhileRefreshing = loading && reconciliations.length > 0
    ? 'opacity-70 transition-opacity duration-200'
    : 'transition-opacity duration-200';

  return (
    // Full-bleed like the Imported Statements grid: no card border/radius, the rows' own bottom
    // borders carry the structure.
    <div role="table" className={cn('w-full', dimWhileRefreshing)} data-testid="reconciliation-list-table">
      {/* Header styled like the Movements table: sentence case, semibold, foreground colour —
          not the uppercase muted small-caps used elsewhere. */}
      <div
        role="row"
        style={GRID_STYLE}
        className={cn(
          GRID_CLASS,
          'items-center border-b border-[hsl(var(--border-subtle))] bg-card px-4',
          'h-10 text-xs font-semibold leading-4 text-[hsl(var(--foreground))]',
        )}
      >
        <span aria-hidden="true" />
        {COLUMNS.map((col) => (
          <span key={col.name} className={amountAligned(col.name) ? 'text-right' : undefined}>
            <SortableHeaderLabel
              label={CELL_RENDERERS[col.name] ? ui(CELL_RENDERERS[col.name].labelKey) : col.label}
              sortKey={col.name}
              activeKey={sortKey}
              direction={sortDirection}
              onSort={onSort}
              align={amountAligned(col.name) ? 'right' : undefined}
              data-testid="SortableHeaderLabel__d80a75" />
          </span>
        ))}
      </div>
      {renderBody({ loading, reconciliations, ui, currency, cellCtx, openId, toggle })}
    </div>
  );
}

/** Extracted so the loading / empty / rows branching isn't a nested ternary (Sonar). */
function renderBody({ loading, reconciliations, ui, currency, cellCtx, openId, toggle }) {
  if (loading && reconciliations.length === 0) {
    return SKELETON_ROWS.map((n) => (
      <div
        key={n}
        role="row"
        style={GRID_STYLE}
        className={cn(GRID_CLASS, 'border-b border-[hsl(var(--border-subtle))] px-4 py-3')}
      >
        {SKELETON_CELL_KEYS.map((k) => <Skeleton key={k} className="h-4 w-full" data-testid="Skeleton__d80a75" />)}
      </div>
    ));
  }
  if (reconciliations.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(var(--muted))]">
          <Scale
            className="h-5 w-5 text-[hsl(var(--text-disabled))]"
            data-testid="Scale__d80a75" />
        </div>
        <p className="text-sm font-medium text-[hsl(var(--foreground))]">
          {ui('financeAccountReconciliationsEmpty')}
        </p>
        <p className="max-w-sm text-sm text-[hsl(var(--muted-foreground))]">
          {ui('financeAccountReconciliationsEmptyHint')}
        </p>
      </div>
    );
  }
  return reconciliations.map((row) => (
    <ReconciliationRow
      key={row.id}
      row={row}
      currency={currency}
      cellCtx={cellCtx}
      ui={ui}
      open={openId === row.id}
      onToggle={() => toggle(row.id)}
      data-testid="ReconciliationRow__d80a75" />
  ));
}

function ReconciliationRow({ row, currency, cellCtx, ui, open, onToggle }) {
  return (
    <>
      <div
        role="row"
        style={GRID_STYLE}
        className={cn(
          GRID_CLASS,
          'group relative cursor-pointer items-center bg-card px-4 py-3 text-sm transition-shadow',
          open ? 'bg-card' : 'hover:z-10 hover:bg-card hover:shadow-lg',
        )}
        onClick={onToggle}
        data-testid={`reconciliation-row-${row.id}`}
      >
        <button
          type="button"
          aria-label={open
            ? ui('financeAccountReconciliationsCollapseAria')
            : ui('financeAccountReconciliationsExpandAria')}
          aria-expanded={open}
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-[hsl(var(--border-control))] bg-card text-[hsl(var(--muted-foreground))] transition-transform hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"
          style={{ transform: open ? 'rotate(180deg)' : undefined }}
        >
          <ChevronDown className="h-4 w-4" data-testid="ChevronDown__d80a75" />
        </button>
        {COLUMNS.map((col) => {
          const renderer = CELL_RENDERERS[col.name];
          return (
            <Fragment key={col.name} data-testid="Fragment__d80a75">
              {renderer
                ? renderer.render(row, cellCtx)
                : <span className="truncate">{row[col.name] ?? '—'}</span>}
            </Fragment>
          );
        })}
      </div>
      {open ? (
        // Symmetric py-3: the inner grid already ends on its own border, so the 32px bottom pad
        // this started with (copied from StatementsTable) just read as a dead band under the last
        // cleared item.
        (<div className="relative z-10 border-b border-[hsl(var(--border-subtle))] bg-[hsl(var(--muted))] px-11 py-3 shadow-[0px_10px_15px_-3px_hsl(var(--foreground)_/_0.08),0px_4px_6px_-2px_hsl(var(--foreground)_/_0.05)]">
          <ClearedItemsInline
            reconciliationId={row.id}
            currency={currency}
            data-testid="ClearedItemsInline__d80a75" />
        </div>)
      ) : (
        <div className="border-b border-[hsl(var(--border-subtle))]" aria-hidden="true" />
      )}
    </>
  );
}
