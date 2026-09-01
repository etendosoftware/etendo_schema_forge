import { Fragment, useState } from 'react';
import { ChevronDown, FileText, Pencil, Trash2 } from 'lucide-react';
import { useUI, useLocaleSwitch } from '@/i18n';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { StatusTag } from '@/components/ui/status-tag';
import { cn } from '@/lib/utils';
import { StatementLinesInline } from './StatementLinesInline';
import { StatementRowKebab } from './StatementRowKebab';
import { getContractGridColumns } from '@/components/financial-accounts/contractColumns';
import { SortableHeaderLabel } from '@/components/financial-accounts/SortableHeaderLabel.jsx';
import { isDraftStatement } from './statementStatus.js';

// ─────────────────────────────────────────────────────────────────────────────
// Layout — grid (NOT <table>) so the expanded accordion row can span all cols.
// The DATA columns (which/order/visibility) come from the window contract
// (entity `importedBankStatements`); the structural lead (chevron + checkbox)
// and the synthetic tail (lines, out, in, status, spacer) are fixed because
// they are computed aggregates, not declarable AD fields. The grid template is
// built dynamically and applied inline (Tailwind can't JIT a dynamic class).
//   28 chevron · 36 checkbox · <contract columns> · 64 lines · 100 out ·
//   100 in · 120 status · minmax(36,auto) spacer (actions float as overlay)
// ─────────────────────────────────────────────────────────────────────────────
const GRID_CLASS = 'grid gap-3';
const LEAD_TRACKS = '28px 36px';
const TAIL_TRACKS = '64px 100px 100px 120px minmax(36px,auto)';

// Contract-driven data columns → per-field width + i18n header + cell renderer.
// The contract field name (e.g. `importdate`) is decoupled from the data key
// the handler returns (e.g. `s.importDate`) by the renderer, exactly like the
// Movements grid.
const STATEMENT_CELL_RENDERERS = {
  documentNo: {
    width: '100px',
    labelKey: 'financeAccountStatementsColDocumentNo',
    render: (s) => <span className="whitespace-nowrap font-semibold text-[hsl(var(--foreground))]">{s.documentNo || '—'}</span>,
  },
  name: {
    width: 'minmax(0,1.6fr)',
    labelKey: 'financeAccountStatementsColName',
    // Sorts by what the cell shows, which for a nameless statement is the formatted
    // periodFrom–periodTo range, not the empty `name`.
    sortValue: (s, ctx) => ctx.displayName(s),
    render: (s, ctx) => <span className="truncate text-[hsl(var(--foreground))]">{ctx.displayName(s)}</span>,
  },
  fileName: {
    width: 'minmax(0,1fr)',
    labelKey: 'financeAccountStatementsColFileName',
    render: (s) => (
      s.fileName ? (
        <span
          className="inline-flex max-w-full items-center truncate rounded-lg bg-[hsl(var(--muted))] px-2 py-1 text-xs text-[hsl(var(--muted-foreground))]"
          title={s.fileName}
        >
          {s.fileName}
        </span>
      ) : (
        <span className="text-[hsl(var(--text-disabled))]">—</span>
      )
    ),
  },
  notes: {
    width: 'minmax(0,1fr)',
    labelKey: 'financeAccountStatementsColNotes',
    render: (s) => (
      <span className={cn('truncate', s.notes ? 'text-[hsl(var(--foreground))]' : 'text-[hsl(var(--text-disabled))]')} title={s.notes || ''}>
        {s.notes || '—'}
      </span>
    ),
  },
  importdate: {
    width: '116px',
    labelKey: 'financeAccountStatementsColImportDate',
    // The ISO string, not the formatted date: `formatDate` yields dd/mm/yyyy, which would sort
    // by day-of-month. Lexicographic order on ISO-8601 is chronological.
    sortValue: (s) => s.importDate,
    render: (s, ctx) => <span className="whitespace-nowrap text-[hsl(var(--foreground))]">{formatDate(s.importDate, ctx.bcpLocale)}</span>,
  },
  transactionDate: {
    width: '116px',
    labelKey: 'financeAccountStatementsColTransactionDate',
    sortValue: (s) => s.transactionDate,
    render: (s, ctx) => <span className="whitespace-nowrap text-[hsl(var(--foreground))]">{formatDate(s.transactionDate, ctx.bcpLocale)}</span>,
  },
};

const STATEMENT_COLUMNS = getContractGridColumns('importedBankStatements');

// The synthetic tail (lines / out / in / status). Not declarable AD fields — they are computed
// aggregates the handler attaches to each row — but they travel WITH the row, so sorting them
// client-side is exactly as correct as sorting a contract column.
//
// `numeric` right-aligns the HEADER to match the cell underneath, which has always been
// `text-right tabular-nums`. This grid is hand-rolled, so it does not inherit the generic
// DataTable rule that right-aligns a header whose column type is in `NUMERIC_FIELD_TYPES` — the
// labels were left-aligned over right-aligned figures. Same fix already applied in Movimientos
// and Reconciliaciones (`amountAligned` there); `align="right"` also flips the sort arrow to the
// label's left, so the arrow stays on the outside edge in both directions.
const TAIL_SORT = {
  lines: { labelKey: 'financeAccountStatementsColLines', value: (s) => Number(s.lineCount) || 0, numeric: true },
  out: { labelKey: 'financeAccountStatementsColOut', value: (s) => Number(s.totalOut) || 0, numeric: true },
  in: { labelKey: 'financeAccountStatementsColIn', value: (s) => Number(s.totalIn) || 0, numeric: true },
  status: { labelKey: 'financeAccountStatementsColStatus', value: (s) => s.status },
};

// Inline grid-template-columns: lead + one track per contract column + tail.
const GRID_TEMPLATE = [
  LEAD_TRACKS,
  ...STATEMENT_COLUMNS.map((c) => STATEMENT_CELL_RENDERERS[c.name]?.width ?? 'minmax(0,1fr)'),
  TAIL_TRACKS,
].join(' ');
const GRID_STYLE = { gridTemplateColumns: GRID_TEMPLATE };

// Stable keys for the skeleton cells (lead + contract columns + tail).
const SKELETON_CELL_KEYS = [
  'chev', 'select',
  ...STATEMENT_COLUMNS.map((c) => `c_${c.name}`),
  'lines', 'out', 'in', 'status', 'spacer',
];

// ─────────────────────────────────────────────────────────────────────────────
// Date / money formatting
// ─────────────────────────────────────────────────────────────────────────────
function formatDate(iso, bcpLocale) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(bcpLocale, {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(d);
}

function formatMoney(amount, currency) {
  if (amount == null) return '—';
  return formatCurrency(currency, amount);
}

// ─────────────────────────────────────────────────────────────────────────────
// Status pill — uses the shared StatusTag component so the chrome (radius,
// padding, font) matches every other status tag across the app (ETP-3835).
// Status → tone mapping:
//   PENDING    → neutral (no lines reconciled yet)
//   PARTIAL    → warning (some lines reconciled)
//   RECONCILED → success (all lines reconciled)
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_TO_TONE = {
  DRAFT: 'neutral',
  PENDING: 'info',
  PARTIAL: 'warning',
  RECONCILED: 'success',
};

const STATUS_TO_LABEL_KEY = {
  DRAFT:      'financeAccountStatementsStatusDraft',
  PENDING:    'financeAccountStatementsStatusPending',
  PARTIAL:    'financeAccountStatementsStatusPartial',
  RECONCILED: 'financeAccountStatementsStatusReconciled',
};

function StatusPill({ status, matched, total, ui }) {
  const tone = STATUS_TO_TONE[status] ?? 'neutral';
  const base = ui(STATUS_TO_LABEL_KEY[status] ?? STATUS_TO_LABEL_KEY.PENDING);
  const label = status === 'PARTIAL' ? `${base} ${matched}/${total}` : base;
  return <StatusTag tone={tone} label={label} data-testid="StatusTag__3acaeb" />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Imported Statements list with inline accordion (Opción C). Each row reveals
 * a card with the statement's lines.
 *
 * @param {{
 *   statements: Array<object>;
 *   loading: boolean;
 *   currency?: string;
 *   actions?: { onEdit: Function, onProcess: Function, onReactivate: Function, onDelete: Function };
 *   selectedIds?: Set<string>;
 *   onSelectionChange?: (id: string) => void;
 * }} props
 */
/**
 * Sort accessors for this grid.
 *
 * Exported with the builder below so the TAB can own the sort state — its toolbar hosts the
 * "Ordenar por" popover and is this table's sibling, not its child. Same split as
 * ListView/DataTable: the container owns the state, the grid receives it.
 *
 * @param {string} bcpLocale needed by the `name` accessor, whose cell falls back to a formatted
 *   periodFrom–periodTo range when the statement carries no name.
 */
export function buildStatementSortAccessors(bcpLocale) {
  const ctx = { displayName: (st) => statementDisplayName(st, bcpLocale) };
  return {
    ...Object.fromEntries(
      STATEMENT_COLUMNS
        .filter((c) => STATEMENT_CELL_RENDERERS[c.name]?.sortValue)
        .map((c) => [c.name, (row) => STATEMENT_CELL_RENDERERS[c.name].sortValue(row, ctx)]),
    ),
    ...Object.fromEntries(Object.entries(TAIL_SORT).map(([k, t]) => [k, t.value])),
  };
}

/** The sortable columns — contract ones plus the synthetic tail — for the toolbar popover. */
export function buildStatementSortColumns(ui) {
  return [
    ...STATEMENT_COLUMNS.map((col) => ({
      key: col.name,
      label: STATEMENT_CELL_RENDERERS[col.name]
        ? ui(STATEMENT_CELL_RENDERERS[col.name].labelKey)
        : col.label,
    })),
    ...Object.entries(TAIL_SORT).map(([key, tail]) => ({ key, label: ui(tail.labelKey) })),
  ];
}

export function StatementsTable({
  statements, loading, currency = 'EUR', actions = null,
  selectedIds = new Set(), onSelectionChange = () => {},
  sortKey = null, sortDirection = 'asc', onSort,
  // Bumped by the tab after any statement mutation, so an expanded row refetches its own lines
  // instead of keeping the ones fetched when it was first opened (ETP-4921). Purely a pass-down
  // to StatementLinesInline; nothing in this component reads it.
  linesRefreshToken = 0,
  // PSD2-connected account: its statements are read-only (ETP-4921). Pass-down to RowActions.
  bankConnected = false,
}) {
  const ui = useUI();
  const { locale: appLocale } = useLocaleSwitch();
  const bcpLocale = (appLocale || 'es_ES').replace('_', '-');
  const [openId, setOpenId] = useState(null);
  const toggle = (id) => setOpenId((prev) => (prev === id ? null : id));


  // Selection over the currently rendered rows, mirroring the Movements tab. Deliberately over
  // `statements`, not `sorted`: reordering the rows must not change what is selected.
  const allSelected = statements.length > 0 && statements.every((s) => selectedIds.has(s.id));
  const someSelected = statements.some((s) => selectedIds.has(s.id)) && !allSelected;
  const handleSelectAll = () => {
    if (allSelected) {
      statements.forEach((s) => onSelectionChange(s.id));
    } else {
      statements.filter((s) => !selectedIds.has(s.id)).forEach((s) => onSelectionChange(s.id));
    }
  };

  // Only the true initial fetch (no rows yet) wipes the body into skeleton rows below. A later
  // refresh already has rows to show, so it stays smooth via this opacity dim instead — same
  // reasoning as MovementsTable / ListView's own ownScroll gate.
  const dimWhileRefreshing = loading && statements.length > 0
    ? 'opacity-70 transition-opacity duration-200'
    : 'transition-opacity duration-200';

  return (
    <div role="table" className={cn('w-full', dimWhileRefreshing)}>
      {/* Header — same style as MovementsTable headers (xs / semibold / hsl(var(--foreground))). */}
      <div
        role="row"
        style={GRID_STYLE}
        className={cn(
          GRID_CLASS,
          'h-10 items-center border-b border-[hsl(var(--border-subtle))] px-4 text-xs font-semibold leading-4 text-[hsl(var(--foreground))]',
        )}
      >
        <span aria-hidden="true" />
        <span>
          <Checkbox
            checked={allSelected}
            indeterminate={someSelected}
            onChange={handleSelectAll}
            data-testid="Checkbox__3acaeb" />
        </span>
        {STATEMENT_COLUMNS.map((col) => (
          <span key={col.name}>
            <SortableHeaderLabel
              label={STATEMENT_CELL_RENDERERS[col.name] ? ui(STATEMENT_CELL_RENDERERS[col.name].labelKey) : col.label}
              sortKey={col.name}
              activeKey={sortKey}
              direction={sortDirection}
              onSort={onSort}
              data-testid="SortableHeaderLabel__3acaeb" />
          </span>
        ))}
        {Object.entries(TAIL_SORT).map(([key, tail]) => (
          <span key={key} className={tail.numeric ? 'text-right' : undefined}>
            <SortableHeaderLabel
              label={ui(tail.labelKey)}
              sortKey={key}
              activeKey={sortKey}
              direction={sortDirection}
              onSort={onSort}
              align={tail.numeric ? 'right' : undefined}
              data-testid="SortableHeaderLabel__3acaeb" />
          </span>
        ))}
        <span aria-hidden="true" />
      </div>
      {/* Body */}
      {renderBody({
        loading, statements, ui, currency, bcpLocale, openId, toggle, actions,
        selectedIds, onSelectionChange, linesRefreshToken, bankConnected,
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Body renderer extracted to avoid the nested ternary Sonar flagged on the
// previous loading / empty / rows branching.
// ─────────────────────────────────────────────────────────────────────────────
function renderBody({
  loading, statements, ui, currency, bcpLocale, openId, toggle, actions,
  selectedIds, onSelectionChange, linesRefreshToken = 0, bankConnected = false,
}) {
  if (loading && statements.length === 0) {
    return [1, 2, 3, 4, 5].map((n) => (
      <div key={n} role="row" style={GRID_STYLE} className={cn(GRID_CLASS, 'border-b border-[hsl(var(--border-subtle))] px-4 py-3')}>
        {SKELETON_CELL_KEYS.map((k) => (
          <Skeleton key={k} className="h-4 w-full" data-testid="Skeleton__3acaeb" />
        ))}
      </div>
    ));
  }
  if (statements.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(var(--muted))]">
          <FileText className="h-5 w-5 text-[hsl(var(--text-disabled))]" data-testid="FileText__3acaeb" />
        </div>
        <p className="text-sm font-medium text-[hsl(var(--foreground))]">
          {ui('financeAccountStatementsEmpty')}
        </p>
        <p className="max-w-sm text-sm text-[hsl(var(--muted-foreground))]">
          {ui('financeAccountStatementsEmptyHint')}
        </p>
      </div>
    );
  }
  return statements.map((s) => {
    const open = openId === s.id;
    return (
      <StatementRow
        key={s.id}
        statement={s}
        currency={currency}
        bcpLocale={bcpLocale}
        ui={ui}
        open={open}
        onToggle={() => toggle(s.id)}
        actions={actions}
        selected={selectedIds.has(s.id)}
        onSelectionChange={onSelectionChange}
        linesRefreshToken={linesRefreshToken}
        bankConnected={bankConnected}
        data-testid="StatementRow__3acaeb" />
    );
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Internals
// ─────────────────────────────────────────────────────────────────────────────
// Trailing per-row actions: Edit + Delete reveal on hover (drafts only, mirroring
// the sales-order grid), with the kebab in the middle holding Procesar / Reactivar.
//
// On a PSD2-connected account they never reveal at all (ETP-4921): its statements come from the
// bank and must not be hand-edited or deleted. They are hidden rather than shown disabled because
// that is what this row already does for a processed statement — the explanation lives on the
// kebab's disabled Reactivar, the one affordance that stays visible.
function RowActions({ statement: s, actions, ui, bankConnected = false }) {
  const isDraft = isDraftStatement(s) && !bankConnected;
  const iconBtn = 'inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors';
  return (
    <>
      {isDraft ? (
        <button
          type="button"
          data-testid={`statement-row-edit-${s.id}`}
          aria-label={ui('financeAccountStatementsRowEdit')}
          title={ui('financeAccountStatementsRowEdit')}
          onClick={(e) => { e.stopPropagation(); actions.onEdit(s); }}
          className={cn(iconBtn, 'text-[hsl(var(--text-disabled))] hover:bg-[hsl(var(--border-subtle))] hover:text-[hsl(var(--foreground))]')}
        >
          <Pencil className="h-4 w-4" data-testid="Pencil__3acaeb" />
        </button>
      ) : null}
      <StatementRowKebab
        statement={s}
        onProcess={actions.onProcess}
        onReactivate={actions.onReactivate}
        bankConnected={bankConnected}
        data-testid="StatementRowKebab__3acaeb" />
      {isDraft ? (
        <button
          type="button"
          data-testid={`statement-row-delete-${s.id}`}
          aria-label={ui('financeAccountStatementsRowDelete')}
          title={ui('financeAccountStatementsRowDelete')}
          onClick={(e) => { e.stopPropagation(); actions.onDelete(s); }}
          className={cn(iconBtn, 'text-[hsl(var(--destructive))] hover:bg-[var(--status-destructive-bg)] hover:text-[hsl(var(--destructive))]')}
        >
          <Trash2 className="h-4 w-4" data-testid="Trash2__3acaeb" />
        </button>
      ) : null}
    </>
  );
}

// The "Nombre" column shows the statement's own name. Manually-created and
// most imported statements carry a meaningful name; only fall back to the line
// date range (and finally an em dash) when no name is set. Used by the `name`
// contract-column renderer.
function statementDisplayName(s, bcpLocale) {
  return s.name
    || (s.periodFrom || s.periodTo ? formatRange(s.periodFrom, s.periodTo, bcpLocale) : '—');
}

/**
 * ETP-5030 — resolves the statement row's classes so exactly ONE background
 * utility is ever emitted, mirroring `computeRowClassName` in
 * components/contract-ui/InlineLinesPanel.jsx (the shared reference).
 *
 * The row previously hardcoded `bg-card` twice (base string AND the `open`
 * branch); appending a selected background alongside those would have competed
 * on the same CSS property, which Tailwind resolves by stylesheet order rather
 * than class order, so the row could render unshaded despite carrying the
 * class. Both hardcoded backgrounds are now folded into this one chain.
 *
 * `hoverBackgroundClass` tracks the resting background so the tint survives
 * hover — the pointer is over the row exactly when the user clicks the
 * checkbox, which is the "ticking it does nothing" bug being fixed here.
 */
function computeStatementRowClassName({ selected, open }) {
  const backgroundClass = selected ? 'bg-primary/5' : 'bg-card';
  const hoverBackgroundClass = selected ? 'hover:bg-primary/5' : 'hover:bg-card';
  return cn(
    GRID_CLASS,
    'group relative cursor-pointer items-center px-4 py-3 text-sm transition-shadow',
    backgroundClass,
    open ? '' : `hover:z-10 hover:shadow-lg ${hoverBackgroundClass}`,
  );
}

function StatementRow({
  statement: s, currency, bcpLocale, ui, open, onToggle, actions, selected, onSelectionChange,
  linesRefreshToken = 0, bankConnected = false,
}) {
  // Context handed to the contract-column cell renderers.
  const cellCtx = { ui, bcpLocale, displayName: (st) => statementDisplayName(st, bcpLocale) };

  return (
    <>
      <div
        role="row"
        data-testid={`statement-row-${s.id}`}
        style={GRID_STYLE}
        className={computeStatementRowClassName({ selected, open })}
        onClick={onToggle}
      >
        <button
          type="button"
          aria-label={open ? ui('financeAccountStatementsCollapseAria') : ui('financeAccountStatementsExpandAria')}
          aria-expanded={open}
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-[hsl(var(--border-control))] bg-card text-[hsl(var(--muted-foreground))] transition-transform hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"
          style={{ transform: open ? 'rotate(180deg)' : undefined }}
        >
          <ChevronDown className="h-4 w-4" data-testid="ChevronDown__3acaeb" />
        </button>
        <span onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={selected}
            onChange={() => onSelectionChange(s.id)}
            data-testid="Checkbox__3acaeb" />
        </span>
        {/* Contract-driven data columns (decisions.json → contract.json) */}
        {STATEMENT_COLUMNS.map((col) => {
          const renderer = STATEMENT_CELL_RENDERERS[col.name];
          return (
            <Fragment key={col.name} data-testid="Fragment__3acaeb">
              {renderer
                ? renderer.render(s, cellCtx)
                : <span className="truncate text-[hsl(var(--foreground))]">{s[col.name] ?? '—'}</span>}
            </Fragment>
          );
        })}
        <span className="text-right tabular-nums text-[hsl(var(--foreground))]">{s.lineCount ?? 0}</span>
        <span className={cn('text-right tabular-nums font-semibold', Number(s.totalOut) > 0 ? 'text-[hsl(var(--destructive))]' : 'text-[hsl(var(--text-disabled))]')}>
          {Number(s.totalOut) > 0 ? `−${formatMoney(s.totalOut, currency)}` : '—'}
        </span>
        <span className={cn('text-right tabular-nums font-semibold', Number(s.totalIn) > 0 ? 'text-[var(--status-success-fg)]' : 'text-[hsl(var(--text-disabled))]')}>
          {Number(s.totalIn) > 0 ? `+${formatMoney(s.totalIn, currency)}` : '—'}
        </span>
        <span>
          <StatusPill
            status={s.status}
            matched={s.matchedCount ?? 0}
            total={s.lineCount ?? 0}
            ui={ui}
            data-testid="StatusPill__3acaeb" />
        </span>
        <span aria-hidden="true" />
        {actions ? (
          <div
            className="absolute right-3 top-1/2 z-10 flex -translate-y-1/2 items-center gap-0.5 rounded-lg bg-card px-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            <RowActions statement={s} actions={actions} ui={ui} bankConnected={bankConnected} data-testid="RowActions__3acaeb" />
          </div>
        ) : null}
      </div>
      {open ? (
        <div className="relative z-10 border-b border-[hsl(var(--border-subtle))] bg-[hsl(var(--muted))] px-11 pb-8 pt-3 shadow-[0px_10px_15px_-3px_hsl(var(--foreground) / 0.08),0px_4px_6px_-2px_hsl(var(--foreground) / 0.05)]">
          <StatementLinesInline
            statementId={s.id}
            currency={currency}
            refreshToken={linesRefreshToken}
            data-testid="StatementLinesInline__3acaeb" />
        </div>
      ) : (
        <div className="border-b border-[hsl(var(--border-subtle))]" aria-hidden="true" />
      )}
    </>
  );
}

function formatRange(fromIso, toIso, bcpLocale) {
  const f = formatDate(fromIso, bcpLocale);
  const t = formatDate(toIso, bcpLocale);
  if (f === '—' && t === '—') return '—';
  if (f === t) return f;
  return `${f} ${'–'} ${t}`;
}
