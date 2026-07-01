import { Fragment, useState } from 'react';
import { ChevronDown, FileText, Pencil, Trash2 } from 'lucide-react';
import { useUI, useLocaleSwitch } from '@/i18n';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { StatusTag } from '@/components/ui/status-tag';
import { cn } from '@/lib/utils';
import { StatementLinesInline } from './StatementLinesInline';
import { StatementRowKebab } from './StatementRowKebab';
import { getContractGridColumns } from '@/components/financial-accounts/contractColumns';

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
    render: (s) => <span className="whitespace-nowrap font-semibold text-[#121217]">{s.documentNo || '—'}</span>,
  },
  name: {
    width: 'minmax(0,1.6fr)',
    labelKey: 'financeAccountStatementsColName',
    render: (s, ctx) => <span className="truncate text-[#121217]">{ctx.displayName(s)}</span>,
  },
  fileName: {
    width: 'minmax(0,1fr)',
    labelKey: 'financeAccountStatementsColFileName',
    render: (s) => (
      s.fileName ? (
        <span
          className="inline-flex max-w-full items-center truncate rounded-lg bg-[#F5F7F9] px-2 py-1 text-xs text-[#3F3F50]"
          title={s.fileName}
        >
          {s.fileName}
        </span>
      ) : (
        <span className="text-[#A8AAB8]">—</span>
      )
    ),
  },
  notes: {
    width: 'minmax(0,1fr)',
    labelKey: 'financeAccountStatementsColNotes',
    render: (s) => (
      <span className={cn('truncate', s.notes ? 'text-[#121217]' : 'text-[#A8AAB8]')} title={s.notes || ''}>
        {s.notes || '—'}
      </span>
    ),
  },
  importdate: {
    width: '116px',
    labelKey: 'financeAccountStatementsColImportDate',
    render: (s, ctx) => <span className="whitespace-nowrap text-[#121217]">{formatDate(s.importDate, ctx.bcpLocale)}</span>,
  },
  transactionDate: {
    width: '116px',
    labelKey: 'financeAccountStatementsColTransactionDate',
    render: (s, ctx) => <span className="whitespace-nowrap text-[#121217]">{formatDate(s.transactionDate, ctx.bcpLocale)}</span>,
  },
};

const STATEMENT_COLUMNS = getContractGridColumns('importedBankStatements');

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

function formatMoney(amount, currency, bcpLocale) {
  if (amount == null) return '—';
  try {
    return new Intl.NumberFormat(bcpLocale, {
      style: 'currency', currency,
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(Number(amount));
  } catch {
    return `${Number(amount).toFixed(2)} ${currency}`;
  }
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
export function StatementsTable({
  statements, loading, currency = 'EUR', actions = null,
  selectedIds = new Set(), onSelectionChange = () => {},
}) {
  const ui = useUI();
  const { locale: appLocale } = useLocaleSwitch();
  const bcpLocale = (appLocale || 'es_ES').replace('_', '-');
  const [openId, setOpenId] = useState(null);
  const toggle = (id) => setOpenId((prev) => (prev === id ? null : id));

  // Selection over the currently rendered rows, mirroring the Movements tab.
  const allSelected = statements.length > 0 && statements.every((s) => selectedIds.has(s.id));
  const someSelected = statements.some((s) => selectedIds.has(s.id)) && !allSelected;
  const handleSelectAll = () => {
    if (allSelected) {
      statements.forEach((s) => onSelectionChange(s.id));
    } else {
      statements.filter((s) => !selectedIds.has(s.id)).forEach((s) => onSelectionChange(s.id));
    }
  };

  return (
    <div role="table" className="w-full">
      {/* Header — same style as MovementsTable headers (xs / semibold / #121217). */}
      <div
        role="row"
        style={GRID_STYLE}
        className={cn(
          GRID_CLASS,
          'h-10 items-center border-b border-[#E8EAEF] px-4 text-xs font-semibold leading-4 text-[#121217]',
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
            {STATEMENT_CELL_RENDERERS[col.name] ? ui(STATEMENT_CELL_RENDERERS[col.name].labelKey) : col.label}
          </span>
        ))}
        <span>{ui('financeAccountStatementsColLines')}</span>
        <span>{ui('financeAccountStatementsColOut')}</span>
        <span>{ui('financeAccountStatementsColIn')}</span>
        <span>{ui('financeAccountStatementsColStatus')}</span>
        <span aria-hidden="true" />
      </div>
      {/* Body */}
      {renderBody({
        loading, statements, ui, currency, bcpLocale, openId, toggle, actions,
        selectedIds, onSelectionChange,
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
  selectedIds, onSelectionChange,
}) {
  if (loading) {
    return [1, 2, 3, 4, 5].map((n) => (
      <div key={n} role="row" style={GRID_STYLE} className={cn(GRID_CLASS, 'border-b border-[#F0F2F5] px-4 py-3')}>
        {SKELETON_CELL_KEYS.map((k) => (
          <Skeleton key={k} className="h-4 w-full" data-testid="Skeleton__3acaeb" />
        ))}
      </div>
    ));
  }
  if (statements.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F5F7F9]">
          <FileText className="h-5 w-5 text-[#828FA3]" data-testid="FileText__3acaeb" />
        </div>
        <p className="text-sm font-medium text-[#121217]">
          {ui('financeAccountStatementsEmpty')}
        </p>
        <p className="max-w-sm text-sm text-[#6C6C89]">
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
        data-testid="StatementRow__3acaeb" />
    );
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Internals
// ─────────────────────────────────────────────────────────────────────────────
// Trailing per-row actions: Edit + Delete reveal on hover (drafts only, mirroring
// the sales-order grid), with the kebab in the middle holding Procesar / Reactivar.
function RowActions({ statement: s, actions, ui }) {
  const isDraft = s.status === 'DRAFT' || s.processed === 'N';
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
          className={cn(iconBtn, 'text-[#828FA3] hover:bg-[#E8EAEF] hover:text-[#121217]')}
        >
          <Pencil className="h-4 w-4" data-testid="Pencil__3acaeb" />
        </button>
      ) : null}
      <StatementRowKebab
        statement={s}
        onProcess={actions.onProcess}
        onReactivate={actions.onReactivate}
        data-testid="StatementRowKebab__3acaeb" />
      {isDraft ? (
        <button
          type="button"
          data-testid={`statement-row-delete-${s.id}`}
          aria-label={ui('financeAccountStatementsRowDelete')}
          title={ui('financeAccountStatementsRowDelete')}
          onClick={(e) => { e.stopPropagation(); actions.onDelete(s); }}
          className={cn(iconBtn, 'text-[#D50B3E] hover:bg-[#FBE9EE] hover:text-[#A3082F]')}
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

function StatementRow({
  statement: s, currency, bcpLocale, ui, open, onToggle, actions, selected, onSelectionChange,
}) {
  // Context handed to the contract-column cell renderers.
  const cellCtx = { ui, bcpLocale, displayName: (st) => statementDisplayName(st, bcpLocale) };

  return (
    <>
      <div
        role="row"
        data-testid={`statement-row-${s.id}`}
        style={GRID_STYLE}
        className={cn(
          GRID_CLASS,
          'group relative cursor-pointer items-center bg-white px-4 py-3 text-sm transition-shadow',
          open ? 'bg-white' : 'hover:z-10 hover:bg-white hover:shadow-lg',
        )}
        onClick={onToggle}
      >
        <button
          type="button"
          aria-label={open ? ui('financeAccountStatementsCollapseAria') : ui('financeAccountStatementsExpandAria')}
          aria-expanded={open}
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-[#D1D4DB] bg-white text-[#6C6C89] transition-transform hover:bg-[#F5F7F9] hover:text-[#121217]"
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
                : <span className="truncate text-[#121217]">{s[col.name] ?? '—'}</span>}
            </Fragment>
          );
        })}
        <span className="text-right tabular-nums text-[#121217]">{s.lineCount ?? 0}</span>
        <span className={cn('text-right tabular-nums font-semibold', Number(s.totalOut) > 0 ? 'text-[#D50B3E]' : 'text-[#A8AAB8]')}>
          {Number(s.totalOut) > 0 ? `−${formatMoney(s.totalOut, currency, bcpLocale)}` : '—'}
        </span>
        <span className={cn('text-right tabular-nums font-semibold', Number(s.totalIn) > 0 ? 'text-[#17663A]' : 'text-[#A8AAB8]')}>
          {Number(s.totalIn) > 0 ? `+${formatMoney(s.totalIn, currency, bcpLocale)}` : '—'}
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
            className="absolute right-3 top-1/2 z-10 flex -translate-y-1/2 items-center gap-0.5 rounded-lg bg-white px-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            <RowActions statement={s} actions={actions} ui={ui} data-testid="RowActions__3acaeb" />
          </div>
        ) : null}
      </div>
      {open ? (
        <div className="relative z-10 border-b border-[#E8EAEF] bg-[#F5F7F9] px-11 pb-8 pt-3 shadow-[0px_10px_15px_-3px_rgba(18,18,23,0.08),0px_4px_6px_-2px_rgba(18,18,23,0.05)]">
          <StatementLinesInline
            statementId={s.id}
            currency={currency}
            data-testid="StatementLinesInline__3acaeb" />
        </div>
      ) : (
        <div className="border-b border-[#F0F2F5]" aria-hidden="true" />
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
