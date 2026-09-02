import { Fragment, useState, useEffect } from 'react';
import { ArrowUpRight, ArrowLeftRight, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useUI, useLocaleSwitch } from '@/i18n';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { MoneyAmount } from '@/components/ui/money-amount';
import { formatCalendarDate } from '@/lib/dateOnly.js';
import { MovementStatusBadge } from './MovementStatusBadge';
import { PostingStatusDot } from './PostingStatusDot';
import { MovementRowKebab } from './MovementRowKebab';
import { getContractGridColumns, getContractPanelFields } from '@/components/financial-accounts/contractColumns';
import { SortableHeaderLabel, SortableHeaderSegments } from '@/components/financial-accounts/SortableHeaderLabel.jsx';
import { MOVEMENT_STATUS_CONFIG, DRAFT } from './movementStatusConfig';
import { ChipSelect } from '@/components/forms/fields';
import { useDimensionLookup } from '@/hooks/useMovementLookups';
import { useUpdateMovement, buildDimensionUpdatePayload } from '@/hooks/useCreateMovement';
import { translateBackendError } from '@/lib/backendErrors.js';

// ETP-5101 — the "Más información" panel's editable dimension fields. Only these three:
// FinancialAccountTransactionsHandler#applyEditableDimensions (the backend `update` action)
// only accepts glItemId/projectId/costcenterId/productId — organization/activity/campaign/
// salesregion/user1/user2 have no write path at all, server-side, regardless of document
// status, and this window's own contract never configures them in the panel anyway (checked
// artifacts/financial-account/contract.json: only product/project/costCenter carry
// `dimensionsPanel: true`).
const EDITABLE_DIMENSION_KEYS = new Set(['project', 'costcenter', 'product']);
const DIMENSION_ID_FIELD = { project: 'projectId', costcenter: 'costcenterId', product: 'productId' };

// Per-dimension lookup hooks, module-scope like NewTransactionModal's own (function
// declarations are hoisted, so each is a valid custom hook usable directly by ChipSelect) —
// deliberately a separate copy rather than importing NewTransactionModal's, since those are
// not exported and this is a different, narrower editing surface (see buildDimensionUpdatePayload).
function useCostcenterLookup(query) { return useDimensionLookup(query, 'costcenter'); }
function useProjectLookup(query) { return useDimensionLookup(query, 'project'); }
function useProductLookup(query) { return useDimensionLookup(query, 'product'); }
const DIMENSION_LOOKUPS = { project: useProjectLookup, costcenter: useCostcenterLookup, product: useProductLookup };

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
function formatDate(isoString, bcpLocale) {
  return formatCalendarDate(isoString, bcpLocale);
}

const SKELETON_ROWS = [1, 2, 3, 4, 5];

// Contract-driven columns: which data columns appear, their order and
// visibility come from decisions.json → contract.json (entity `transaction`,
// fields with grid:true + gridOrder). HOW each cell renders stays here, in the
// MOVEMENT_CELL_RENDERERS registry below. Synthetic columns (Amount, Balance)
// and structural ones (expand, checkbox, kebab) are fixed.
const CONTRACT_COLUMNS = getContractGridColumns('transaction');

// Stable cell keys for skeleton rows (same order/length as the header columns).
const SKELETON_COL_KEYS = [
  'expand', 'select', ...CONTRACT_COLUMNS.map((c) => c.name), 'amount', 'balance', 'kebab',
];
const COL_COUNT = SKELETON_COL_KEYS.length;

/**
 * Renderer registry — contract field name → { labelKey, headClass?, renderCell }.
 * `renderCell(movement, ctx)` receives the helpers built inside the component.
 * A contract field with no registry entry falls back to plain text via the
 * field name as row key (and the contract label as header).
 */
const MOVEMENT_CELL_RENDERERS = {
  transactionDate: {
    labelKey: 'financeAccountMovementsColDate',
    // The ISO string, not the dd/mm/yyyy the cell shows — that would sort by day-of-month.
    sortValue: (m) => m.date,
    renderCell: (m, ctx) => (
      <TableCell
        className="whitespace-nowrap text-sm leading-5 text-[hsl(var(--foreground))]"
        data-testid="TableCell__ae5a16">
        {formatDate(m.date, ctx.bcpLocale)}
      </TableCell>
    ),
  },
  documentNo: {
    labelKey: 'financeAccountMovementsColDocument',
    sortValue: (m) => m.documentNo,
    renderCell: (m, ctx) => (
      <TableCell
        className="whitespace-nowrap text-sm font-semibold leading-5"
        data-testid="TableCell__ae5a16">
        {m.paymentId ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); ctx.openPayment(m); }}
            className="inline-flex items-center gap-1 text-[hsl(var(--foreground))] underline decoration-[hsl(var(--border-control))] underline-offset-4 hover:decoration-[hsl(var(--foreground))]"
          >
            {m.documentNo}
            <ArrowUpRight className="h-3 w-3" data-testid="ArrowUpRight__ae5a16" />
          </button>
        ) : (
          <span className="text-[hsl(var(--foreground))]">{m.documentNo}</span>
        )}
      </TableCell>
    ),
  },
  businessPartner: {
    labelKey: 'financeAccountMovementsColContact',
    sortValue: (m) => m.contact,
    renderCell: (m) => (
      <TableCell
        className="text-sm leading-5 text-[hsl(var(--foreground))]"
        data-testid="TableCell__ae5a16">{m.contact}</TableCell>
    ),
  },
  description: {
    labelKey: 'financeAccountMovementsColDescription',
    sortValue: (m) => m.description,
    renderCell: (m) => (
      <TableCell
        className="max-w-[200px] truncate text-sm text-[hsl(var(--foreground))]"
        data-testid="TableCell__ae5a16">{m.description}</TableCell>
    ),
  },
  status: {
    labelKey: 'financeAccountMovementsColStatus',
    // The translated badge text, so the two user-facing states group the way they read. The raw
    // code would scatter them: every non-RPPC code collapses into "Sin conciliar" on screen.
    sortValue: (m, ctx) => ctx.getStatusLabel(m),
    renderCell: (m) => (
      <TableCell data-testid="TableCell__ae5a16">
        <MovementStatusBadge status={m.paymentStatus} processed={m.processed} data-testid="MovementStatusBadge__ae5a16" />
      </TableCell>
    ),
  },
  transactionType: {
    labelKey: 'financeAccountMovementsColType',
    sortValue: (m, ctx) => ctx.getTrxTypeLabel(m),
    // The cell stacks the transaction type over the posting status, so its header splits into
    // two independently sortable segments ("Tipo & Contabilizado") — the hand-rolled equivalent
    // of the `multiField` decorator the Cuentas list uses for "Tipo & IBAN". `posted` is not a
    // contract grid column of its own; it only ever appears inside this cell.
    parts: [
      { key: 'transactionType', labelKey: 'financeAccountMovementsColType' },
      {
        key: 'posted',
        labelKey: 'financeAccountMovementsColPosted',
        // The translated PostingStatusDot text, so the two states group the way they read.
        // Only 'Y' is posted; every other code renders as "Sin contabilizar".
        sortValue: (m, ctx) => ctx.getPostedLabel(m),
      },
    ],
    renderCell: (m, ctx) => (
      <TableCell data-testid="TableCell__ae5a16">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm leading-5 text-[hsl(var(--foreground))]">{ctx.getTrxTypeLabel(m)}</span>
          <PostingStatusDot posted={m.posted} data-testid="PostingStatusDot__ae5a16" />
        </div>
      </TableCell>
    ),
  },
  gLItem: {
    labelKey: 'financeAccountMovementsColGlItem',
    sortValue: (m) => m.glItem,
    renderCell: (m) => (
      <TableCell
        className="max-w-[180px] truncate text-sm text-[hsl(var(--foreground))]"
        data-testid="TableCell__ae5a16">{m.glItem || '—'}</TableCell>
    ),
  },
};

function renderContractCell(col, movement, ctx) {
  const renderer = MOVEMENT_CELL_RENDERERS[col.name];
  if (renderer) return <Fragment key={col.name} data-testid="Fragment__ae5a16">{renderer.renderCell(movement, ctx)}</Fragment>;
  return (
    <TableCell
      key={col.name}
      className="text-sm leading-5 text-[hsl(var(--foreground))]"
      data-testid="TableCell__ae5a16">
      {movement[col.name] ?? '—'}
    </TableCell>
  );
}

// Accounting dimension key → i18n label key, for the "more info" panel.
const DIMENSION_LABEL_KEYS = {
  organization: 'financeAccountMovementsDimOrganization',
  bpartner: 'financeAccountMovementsDimBpartner',
  project: 'financeAccountMovementsDimProject',
  costcenter: 'financeAccountMovementsDimCostcenter',
  product: 'financeAccountMovementsDimProduct',
  activity: 'financeAccountMovementsDimActivity',
  campaign: 'financeAccountMovementsDimCampaign',
  salesregion: 'financeAccountMovementsDimSalesregion',
  user1: 'financeAccountMovementsDimUser1',
  user2: 'financeAccountMovementsDimUser2',
};

// The contract's field names (camelCase, from the AD/Etendo model) don't always
// match the backend payload's `dimensions` keys (lowercase, from
// FinancialAccountTransactionsHandler's DIM_* constants) — alias the ones that differ.
const DIMENSION_PAYLOAD_KEY_ALIASES = {
  costCenter: 'costcenter',
  salesCampaign: 'campaign',
  salesRegion: 'salesregion',
  stDimension: 'user1',
  ndDimension: 'user2',
};

/**
 * Bespoke renderers for "more info" panel fields that are NOT accounting dimensions —
 * same split of responsibility as MOVEMENT_CELL_RENDERERS for the grid: decisions.json
 * decides WHICH fields appear and in what order, this registry decides HOW they render.
 * A panel field with no entry here is treated as an accounting dimension (read-only
 * input, gated by the chart-of-accounts config).
 */
const MOVEMENT_PANEL_RENDERERS = {
  // Funds-transfer counterpart. One slot covers BOTH directions: the backend collapses
  // em_etgo_finacc_trans_dest / em_aprm_finacc_trans_origin into the same transfer* props
  // and flags which side this row is on, so the source (BPW) row shows the destination
  // account and the destination (BPD) row shows the origin.
  eTGOFinaccTransDest: {
    isVisible: (m) => Boolean(m.transferTxnId),
    labelKey: (m) => (m.transferDirection === 'in'
      ? 'financeAccountMovementsTransferFrom'
      : 'financeAccountMovementsTransferTo'),
    render: (m, ctx) => (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); ctx.openTransferCounterpart(m); }}
        data-testid={`movement-transfer-link-${m.id}`}
        className="inline-flex h-10 items-center gap-1 self-start text-sm font-semibold text-[hsl(var(--foreground))] underline decoration-[hsl(var(--border-control))] underline-offset-4 hover:decoration-[hsl(var(--foreground))]"
      >
        {m.transferAccountName || m.transferTxnId}
        <ArrowUpRight className="h-3 w-3" data-testid="ArrowUpRight__ae5a16" />
      </button>
    ),
  },
};

// Which fields the "more info" panel shows, and in what order, comes from
// decisions.json → contract.json (entity `transaction`, fields with
// `dimensionsPanel: true`, sorted by `seq`) — same contract-driven pattern as
// CONTRACT_COLUMNS above.
const PANEL_FIELDS = getContractPanelFields('transaction');

// The accounting-dimension subset (everything without a bespoke renderer), keyed the way
// the backend payload keys them. Only these are gated by the chart-of-accounts config;
// a bespoke field like the transfer link must NOT be hidden by an unrelated dimension setup.
const DISPLAYED_DIMENSIONS = PANEL_FIELDS
  .filter((f) => !MOVEMENT_PANEL_RENDERERS[f.name])
  .map((f) => DIMENSION_PAYLOAD_KEY_ALIASES[f.name] ?? f.name.toLowerCase());

function renderBody({ loading, movements, ui, renderRow }) {
  // Only the true initial fetch (no rows yet) wipes the body into skeleton rows. A later
  // refresh — the toolbar's refresh button, or reload() after an edit — already has rows to
  // show, so it stays smooth via the opacity dim on the table wrapper instead (mirrors
  // ListView's own `hook.loading && hook.items.length === 0` gate for the same reason).
  if (loading && movements.length === 0) {
    return SKELETON_ROWS.map((n) => (
      <TableRow key={n} data-testid="TableRow__ae5a16">
        {SKELETON_COL_KEYS.map((colKey) => (
          <TableCell key={colKey} data-testid="TableCell__ae5a16">
            <Skeleton className="h-4 w-full" data-testid="Skeleton__ae5a16" />
          </TableCell>
        ))}
      </TableRow>
    ));
  }
  if (movements.length === 0) {
    return (
      <TableRow className="hover:bg-transparent" data-testid="TableRow__ae5a16">
        <TableCell colSpan={COL_COUNT} className="py-16" data-testid="TableCell__ae5a16">
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(var(--muted))]">
              <ArrowLeftRight className="h-5 w-5 text-[hsl(var(--text-disabled))]" data-testid="ArrowLeftRight__ae5a16" />
            </div>
            <p className="text-sm font-medium text-[hsl(var(--foreground))]">
              {ui('financeAccountMovementsEmpty')}
            </p>
            <p className="max-w-sm text-sm text-[hsl(var(--muted-foreground))]">
              {ui('financeAccountMovementsEmptyHint')}
            </p>
          </div>
        </TableCell>
      </TableRow>
    );
  }
  return movements.map(renderRow);
}

// Exported so the tab can build the sort context with the same label resolver the cells use.
export function useTrxTypeLabel() {
  const ui = useUI();
  return (movement) =>
    movement.typeLabel ||
    (movement.trxType === 'BPD' ? ui('financeAccountMovementsTypeBPD') : null) ||
    (movement.trxType === 'BPW' ? ui('financeAccountMovementsTypeBPW') : null) ||
    (movement.trxType === 'BF' ? ui('financeAccountMovementsTypeBF') : null) ||
    movement.trxType ||
    '—';
}

/** One "more info" cell: label on top, value below. */
function PanelField({ label, children }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium leading-6 text-[hsl(var(--foreground))]">{label}</span>
      {children}
    </div>
  );
}

/**
 * "More info" panel — the fields declared for this panel in the window contract,
 * in their declared order, rendered in a 4-column grid with an elevated surface.
 *
 * Accounting dimensions follow the chart of accounts: an enabled one is shown even
 * when empty, like Classic. The business partner is excluded — it already has its
 * own "Contacto" column. Fields with a MOVEMENT_PANEL_RENDERERS entry (e.g. the
 * funds-transfer link) render through it and are gated by their own `isVisible`.
 *
 * ETP-5101 — Project/Cost center/Product (EDITABLE_DIMENSION_KEYS) render as live
 * `ChipSelect` pickers, auto-saving on change via `ctx.updateMovement`, whenever
 * `ctx.canEditDimensions(movement)` is true (GL transaction, not posted — mirrors
 * MovementRowKebab's own `canEdit`). Every other dimension — and these same three
 * once posted, or on a payment-linked movement — stays the original disabled/readOnly
 * display; there is no backend write path for the others regardless of status (see
 * EDITABLE_DIMENSION_KEYS above).
 */
function DimensionsPanel({ movement, ui, visible, ctx }) {
  const dims = movement.dimensions || {};
  const editable = ctx.canEditDimensions(movement);

  const saveDimension = async (idField, row) => {
    try {
      await ctx.updateMovement(buildDimensionUpdatePayload(movement, ctx.accountCurrencyId, {
        [idField]: row?.id ?? null,
      }));
      ctx.onReload?.();
    } catch (err) {
      toast.error(translateBackendError(err.message, ui) || ui('financeAccountTxRowDimensionUpdateError'));
    }
  };

  return (
    <div className="grid grid-cols-1 gap-5 pl-16 pr-[52px] pb-8 pt-3 sm:grid-cols-2 lg:grid-cols-4">
      {PANEL_FIELDS.map((field) => {
        const custom = MOVEMENT_PANEL_RENDERERS[field.name];
        if (custom) {
          if (!custom.isVisible(movement)) return null;
          return (
            <PanelField key={field.name} label={ui(custom.labelKey(movement))} data-testid="PanelField__ae5a16">
              {custom.render(movement, ctx)}
            </PanelField>
          );
        }
        const key = DIMENSION_PAYLOAD_KEY_ALIASES[field.name] ?? field.name.toLowerCase();
        if (!visible.includes(key)) return null;
        if (editable && EDITABLE_DIMENSION_KEYS.has(key)) {
          const idField = DIMENSION_ID_FIELD[key];
          const currentId = movement[idField];
          return (
            <PanelField key={field.name} label={ui(DIMENSION_LABEL_KEYS[key] ?? key)} data-testid="PanelField__ae5a16">
              <ChipSelect
                value={currentId ? { id: currentId, name: dims[key] } : null}
                onChange={(row) => saveDimension(idField, row)}
                useLookup={DIMENSION_LOOKUPS[key]}
                testId={`movement-dimension-${key}`}
                data-testid={`ChipSelect__${key}`} />
            </PanelField>
          );
        }
        return (
          <PanelField key={field.name} label={ui(DIMENSION_LABEL_KEYS[key] ?? key)} data-testid="PanelField__ae5a16">
            <Input
              className="items-center"
              value={dims[key] || ''}
              disabled
              readOnly
              data-testid="Input__ae5a16" />
          </PanelField>
        );
      })}
    </div>
  );
}

/**
 * Table of account movements. Each row has a chevron (left) that expands a
 * "more info" panel with the accounting dimensions, plus a selection checkbox.
 *
 * @param {{
 *   movements: Array<object>;
 *   loading: boolean;
 *   enabledDimensions?: string[];
 *   selectedIds: Set<string>;
 *   onSelectionChange: (id: string) => void;
 * }} props
 */
/**
 * The sort context every `sortValue` reads: the label helpers that turn a raw code into the text
 * the cell actually shows.
 *
 * Exported with the two builders below so the TAB can own the sort state — its toolbar hosts the
 * "Ordenar por" popover and is this table's sibling, not its child. Same split as
 * ListView/DataTable: the container owns the state, the grid receives it.
 */
export function buildMovementSortCtx(ui, getTrxTypeLabel) {
  return {
    getTrxTypeLabel,
    // Mirrors MovementStatusBadge: `processed === false` is a Draft whatever the raw code says,
    // because a reactivated transaction keeps RPR/PPM but is a draft again.
    getStatusLabel: (m) => {
      const config = m.processed === false ? DRAFT : MOVEMENT_STATUS_CONFIG[m.paymentStatus];
      return config ? ui(config.labelKey) : '';
    },
    // Mirrors PostingStatusDot: only 'Y' is posted.
    getPostedLabel: (m) => (m.posted === 'Y'
      ? ui('financeAccountMovementsPosted')
      : ui('financeAccountMovementsNotPosted')),
  };
}

/**
 * Sort accessors, keyed by the key each header segment issues.
 *
 * `Balance` is deliberately absent and its header renders non-clickable: it is a RUNNING
 * balance, `currentbalance − SUM(subsequent)` over `statementdate ASC, line ASC`. It is
 * order-dependent by construction, so reordering by anything else makes it meaningless.
 */
export function buildMovementSortAccessors(sortCtx) {
  return {
    ...Object.fromEntries(
      CONTRACT_COLUMNS
        .filter((c) => MOVEMENT_CELL_RENDERERS[c.name]?.sortValue)
        .map((c) => [c.name, (row) => MOVEMENT_CELL_RENDERERS[c.name].sortValue(row, sortCtx)]),
    ),
    // A multi-segment header contributes one accessor per segment; the host column's own key
    // already came from the loop above.
    ...Object.fromEntries(
      CONTRACT_COLUMNS
        .flatMap((c) => MOVEMENT_CELL_RENDERERS[c.name]?.parts ?? [])
        .filter((part) => part.sortValue)
        .map((part) => [part.key, (row) => part.sortValue(row, sortCtx)]),
    ),
    amount: (m) => Number(m.amount) || 0,
  };
}

/** The sortable columns, flattened over multi-segment headers, for the toolbar popover's menu. */
export function buildMovementSortColumns(ui) {
  return [
    ...CONTRACT_COLUMNS.flatMap((col) => {
      const renderer = MOVEMENT_CELL_RENDERERS[col.name];
      if (renderer?.parts) {
        return renderer.parts.map((part) => ({ key: part.key, label: ui(part.labelKey) }));
      }
      return [{ key: col.name, label: renderer ? ui(renderer.labelKey) : col.label }];
    }),
    { key: 'amount', label: ui('financeAccountMovementsColAmount') },
  ];
}

/**
 * ETP-5030 — resolves the movement row's classes so exactly ONE background
 * utility is ever emitted, mirroring `computeRowClassName` in
 * components/contract-ui/InlineLinesPanel.jsx (the shared reference).
 *
 * Emitting two background classes on the same element does NOT let the "last
 * one wins": Tailwind resolves competing utilities by stylesheet order, not by
 * the order they appear in the attribute, so the row can silently render
 * unshaded. Hence the explicit if/else chain instead of appending a class.
 *
 * `hoverBackgroundClass` tracks the resting background for the same reason the
 * row already carried a `hover:bg-card`: TableRow's own base class is
 * `hover:bg-muted/50`, so without a `hover:` counterpart the tint vanishes the
 * moment the pointer is over the row — which is exactly when the user clicks
 * the checkbox, and precisely the "ticking it does nothing" bug being fixed.
 *
 * Selection outranks the deep-link highlight (consistent with the shared
 * components); the highlight keeps its own cue as a ring, which is box-shadow
 * and therefore costs no layout — the same move InlineLinesPanel made, and
 * already precedented on table rows by DataTable's `isSelectedLine`.
 */
function computeMovementRowClassName({ selected, highlighted, expanded, rowCanExpand }) {
  let backgroundClass;
  let hoverBackgroundClass;
  if (selected) {
    backgroundClass = 'bg-primary/5';
    hoverBackgroundClass = 'hover:bg-primary/5';
  } else if (highlighted) {
    backgroundClass = 'bg-[hsl(var(--muted))]';
    hoverBackgroundClass = 'hover:bg-[hsl(var(--muted))]';
  } else {
    backgroundClass = 'bg-card';
    hoverBackgroundClass = 'hover:bg-card';
  }
  return [
    'group relative transition-shadow',
    rowCanExpand ? 'cursor-pointer' : '',
    backgroundClass,
    hoverBackgroundClass,
    highlighted ? 'ring-1 ring-focus-ring' : '',
    expanded ? 'z-20 border-b-0 [&>td]:border-b-0' : 'hover:z-10 hover:shadow-lg',
  ].filter(Boolean).join(' ');
}

export function MovementsTable({
  movements, loading, enabledDimensions = [], selectedIds, onSelectionChange,
  highlightTxnId = null, onReload, onEdit, accountCurrencyId = null,
  sortKey = null, sortDirection = 'asc', onSort,
}) {
  const ui = useUI();
  const navigate = useNavigate();
  const { locale: appLocale } = useLocaleSwitch();
  const bcpLocale = (appLocale || 'es_ES').replace('_', '-');
  const getTrxTypeLabel = useTrxTypeLabel();
  const [expandedId, setExpandedId] = useState(null);
  const { updateMovement } = useUpdateMovement();
  // ETP-5101 — mirrors MovementRowKebab's own `canEdit` exactly (isGlTransaction && !isPosted):
  // the inline dimension pickers must never appear on a movement whose "Editar" action is
  // itself hidden, or the panel would offer editing the kebab already decided not to allow.
  const canEditDimensions = (movement) => !movement.paymentId && movement.posted !== 'Y';

  // The "more info" panel shows Proyecto / Centro de coste / Producto, but ONLY the ones actually
  // enabled in the chart of accounts (respects the org's accounting-dimension config).
  const displayedDims = DISPLAYED_DIMENSIONS.filter((k) => enabledDimensions.includes(k));
  const hasDimensions = displayedDims.length > 0;
  // Expandability is per ROW, not global: a transfer row has a counterpart link to show even when
  // the client has no accounting dimension enabled, and without this it would be unreachable.
  const canExpand = (movement) => hasDimensions || Boolean(movement?.transferTxnId);

  // Scroll the deep-linked transaction (from the reconciled-txns modal) into view once loaded and
  // expand it so its accounting dimensions are visible.
  useEffect(() => {
    if (!highlightTxnId) return;
    if (canExpand(movements.find((m) => m.id === highlightTxnId))) setExpandedId(highlightTxnId);
    const row = document.querySelector(`[data-testid="movement-row-${highlightTxnId}"]`);
    if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightTxnId, movements, hasDimensions]);

  const allSelected = movements.length > 0 && selectedIds.size === movements.length;
  const someSelected = selectedIds.size > 0 && !allSelected;
  const handleSelectAll = () => {
    if (allSelected) {
      movements.forEach((m) => onSelectionChange(m.id));
    } else {
      movements.filter((m) => !selectedIds.has(m.id)).forEach((m) => onSelectionChange(m.id));
    }
  };

  const toggleExpand = (id) => setExpandedId((prev) => (prev === id ? null : id));

  const openPayment = (movement) => {
    if (!movement.paymentId) return;
    const win = movement.paymentIsReceipt === 'Y' ? 'payment-in' : 'payment-out';
    navigate(`/${win}/${movement.paymentId}`);
  };

  // Jump to the paired transaction in the other financial account. `?txn=` is the same
  // deep-link the reconciled-txns modal uses, so the target row arrives highlighted and expanded.
  const openTransferCounterpart = (movement) => {
    if (!movement.transferAccountId || !movement.transferTxnId) return;
    navigate(`/financial-account/${movement.transferAccountId}?tab=movements&txn=${movement.transferTxnId}`);
  };

  // Helpers handed to the contract-column cell renderers.
  const cellCtx = {
    ui, bcpLocale, getTrxTypeLabel, openPayment, openTransferCounterpart,
    canEditDimensions, updateMovement, accountCurrencyId, onReload,
  };

  const renderRow = (movement) => {
    const expanded = expandedId === movement.id;
    const highlighted = highlightTxnId && movement.id === highlightTxnId;
    const rowCanExpand = canExpand(movement);
    return (
      <Fragment key={movement.id} data-testid="Fragment__ae5a16">
        <TableRow
          data-testid={`movement-row-${movement.id}`}
          className={computeMovementRowClassName({
            selected: selectedIds.has(movement.id),
            highlighted,
            expanded,
            rowCanExpand,
          })}
          onClick={() => { if (rowCanExpand) toggleExpand(movement.id); }}
        >
          {/* Expand chevron (circular button) */}
          <TableCell onClick={(e) => e.stopPropagation()} data-testid="TableCell__ae5a16">
            {rowCanExpand ? (
              <button
                type="button"
                aria-label={ui('financeAccountMovementsMoreInfo')}
                aria-expanded={expanded}
                data-testid={`movement-expand-${movement.id}`}
                onClick={() => toggleExpand(movement.id)}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-[hsl(var(--border-control))] bg-card text-[hsl(var(--muted-foreground))] transition-transform hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"
                style={{ transform: expanded ? 'rotate(180deg)' : undefined }}
              >
                <ChevronDown className="h-4 w-4" data-testid="ChevronDown__ae5a16" />
              </button>
            ) : null}
          </TableCell>

          {/* Selection checkbox */}
          <TableCell onClick={(e) => e.stopPropagation()} data-testid="TableCell__ae5a16">
            <Checkbox
              checked={selectedIds.has(movement.id)}
              onChange={() => onSelectionChange(movement.id)}
              data-testid="Checkbox__ae5a16" />
          </TableCell>

          {/* Contract-driven data columns (decisions.json → contract.json) */}
          {CONTRACT_COLUMNS.map((col) => renderContractCell(col, movement, cellCtx))}

          {/* Amount */}
          <TableCell className="text-right" data-testid="TableCell__ae5a16">
            <MoneyAmount
              value={movement.amount}
              currency={movement.currencyIso}
              tone="auto"
              className="text-sm font-semibold leading-5"
              data-testid="MoneyAmount__ae5a16" />
          </TableCell>

          {/* Balance */}
          <TableCell className="text-right" data-testid="TableCell__ae5a16">
            <MoneyAmount
              value={movement.balance}
              currency={movement.currencyIso}
              tone="neutral"
              className="text-sm font-semibold text-[hsl(var(--foreground))]"
              data-testid="MoneyAmount__ae5a16" />
          </TableCell>

          {/* Kebab — visible on row hover */}
          <TableCell onClick={(e) => e.stopPropagation()} data-testid="TableCell__ae5a16">
            <div className="opacity-0 transition-opacity group-hover:opacity-100">
              <MovementRowKebab movement={movement} onReload={onReload} onEdit={onEdit} data-testid="MovementRowKebab__ae5a16" />
            </div>
          </TableCell>
        </TableRow>
        {expanded ? (
          <TableRow
            className="relative z-10 border-b-0 bg-card shadow-lg [&>td]:border-b-0 hover:bg-card"
            data-testid={`movement-moreinfo-${movement.id}`}
          >
            <TableCell colSpan={COL_COUNT} className="p-0" data-testid="TableCell__ae5a16">
              <DimensionsPanel
                movement={movement}
                ui={ui}
                visible={displayedDims}
                ctx={cellCtx}
                data-testid="DimensionsPanel__ae5a16" />
            </TableCell>
          </TableRow>
        ) : null}
      </Fragment>
    );
  };

  const dimWhileRefreshing = loading && movements.length > 0
    ? 'opacity-70 transition-opacity duration-200'
    : 'transition-opacity duration-200';

  return (
    <TooltipProvider data-testid="TooltipProvider__ae5a16">
      <Table className={dimWhileRefreshing} data-testid="Table__ae5a16">
        <TableHeader data-testid="TableHeader__ae5a16">
          <TableRow
            className="h-10 [&_th]:text-xs [&_th]:font-semibold [&_th]:leading-4 [&_th]:text-[hsl(var(--foreground))]"
            data-testid="TableRow__ae5a16">
            <TableHead className="w-10" data-testid="TableHead__ae5a16" />
            <TableHead className="w-10" data-testid="TableHead__ae5a16">
              <Checkbox
                checked={allSelected}
                indeterminate={someSelected}
                onChange={handleSelectAll}
                data-testid="Checkbox__ae5a16" />
            </TableHead>
            {CONTRACT_COLUMNS.map((col) => {
              const renderer = MOVEMENT_CELL_RENDERERS[col.name];
              return (
                <TableHead key={col.name} data-testid="TableHead__ae5a16">
                  {renderer?.parts ? (
                    <SortableHeaderSegments
                      parts={renderer.parts.map((part) => ({ key: part.key, label: ui(part.labelKey) }))}
                      activeKey={sortKey}
                      direction={sortDirection}
                      onSort={onSort}
                      data-testid="SortableHeaderSegments__ae5a16" />
                  ) : (
                    <SortableHeaderLabel
                      label={renderer ? ui(renderer.labelKey) : col.label}
                      sortKey={col.name}
                      activeKey={sortKey}
                      direction={sortDirection}
                      onSort={onSort}
                      data-testid="SortableHeaderLabel__ae5a16" />
                  )}
                </TableHead>
              );
            })}
            <TableHead className="text-right" data-testid="TableHead__ae5a16">
              <SortableHeaderLabel
                label={ui('financeAccountMovementsColAmount')}
                sortKey="amount"
                activeKey={sortKey}
                direction={sortDirection}
                onSort={onSort}
                align="right"
                data-testid="SortableHeaderLabel__ae5a16" />
            </TableHead>
            {/* No onSort: the running balance only means anything in the backend's own order. */}
            <TableHead className="text-right" data-testid="TableHead__ae5a16">{ui('financeAccountMovementsColBalance')}</TableHead>
            <TableHead className="w-10" data-testid="TableHead__ae5a16" />
          </TableRow>
        </TableHeader>
        <TableBody data-testid="TableBody__ae5a16">
          {renderBody({
            loading,
            movements,
            ui,
            renderRow,
          })}
        </TableBody>
      </Table>
    </TooltipProvider>
  );
}
