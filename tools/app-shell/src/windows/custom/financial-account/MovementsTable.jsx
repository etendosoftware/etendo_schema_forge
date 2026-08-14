import { Fragment, useState, useEffect } from 'react';
import { ArrowUpRight, ArrowLeftRight, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
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
import { MovementStatusBadge } from './MovementStatusBadge';
import { PostingStatusDot } from './PostingStatusDot';
import { MovementRowKebab } from './MovementRowKebab';
import { getContractGridColumns, getContractPanelFields } from '@/components/financial-accounts/contractColumns';

/**
 * Formats an ISO date string using the user's locale. The movement date is a
 * date-only value the backend sends as UTC midnight (e.g. "2026-06-10T00:00:00Z"),
 * so it MUST be formatted in UTC — otherwise a negative-offset timezone (e.g.
 * UTC-3) shifts it to the previous calendar day (showing 09/06 for a 10/06 date).
 */
function formatDate(isoString, bcpLocale) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(bcpLocale, {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC',
  }).format(d);
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
    renderCell: (m) => (
      <TableCell
        className="text-sm leading-5 text-[hsl(var(--foreground))]"
        data-testid="TableCell__ae5a16">{m.contact}</TableCell>
    ),
  },
  description: {
    labelKey: 'financeAccountMovementsColDescription',
    renderCell: (m) => (
      <TableCell
        className="max-w-[200px] truncate text-sm text-[hsl(var(--foreground))]"
        data-testid="TableCell__ae5a16">{m.description}</TableCell>
    ),
  },
  status: {
    labelKey: 'financeAccountMovementsColStatus',
    renderCell: (m) => (
      <TableCell data-testid="TableCell__ae5a16">
        <MovementStatusBadge status={m.paymentStatus} processed={m.processed} data-testid="MovementStatusBadge__ae5a16" />
      </TableCell>
    ),
  },
  transactionType: {
    labelKey: 'financeAccountMovementsColType',
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
  if (loading) {
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

function useTrxTypeLabel() {
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
 * Accounting dimensions render as disabled form fields (same look as a read-only
 * field in the document forms) and follow the chart of accounts: an enabled one is
 * shown even when empty, like Classic. The business partner is excluded — it already
 * has its own "Contacto" column. Fields with a MOVEMENT_PANEL_RENDERERS entry (e.g.
 * the funds-transfer link) render through it and are gated by their own `isVisible`.
 */
function DimensionsPanel({ movement, ui, visible, ctx }) {
  const dims = movement.dimensions || {};

  return (
    <div className="grid grid-cols-1 gap-5 pl-16 pr-[52px] pb-8 pt-3 sm:grid-cols-2 lg:grid-cols-4">
      {PANEL_FIELDS.map((field) => {
        const custom = MOVEMENT_PANEL_RENDERERS[field.name];
        if (custom) {
          if (!custom.isVisible(movement)) return null;
          return (
            <PanelField key={field.name} label={ui(custom.labelKey(movement))}>
              {custom.render(movement, ctx)}
            </PanelField>
          );
        }
        const key = DIMENSION_PAYLOAD_KEY_ALIASES[field.name] ?? field.name.toLowerCase();
        if (!visible.includes(key)) return null;
        return (
          <PanelField key={field.name} label={ui(DIMENSION_LABEL_KEYS[key] ?? key)}>
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
export function MovementsTable({ movements, loading, enabledDimensions = [], selectedIds, onSelectionChange, highlightTxnId = null, onReload, onEdit }) {
  const ui = useUI();
  const navigate = useNavigate();
  const { locale: appLocale } = useLocaleSwitch();
  const bcpLocale = (appLocale || 'es_ES').replace('_', '-');
  const getTrxTypeLabel = useTrxTypeLabel();
  const [expandedId, setExpandedId] = useState(null);
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
  const cellCtx = { ui, bcpLocale, getTrxTypeLabel, openPayment, openTransferCounterpart };

  const renderRow = (movement) => {
    const expanded = expandedId === movement.id;
    const highlighted = highlightTxnId && movement.id === highlightTxnId;
    const rowCanExpand = canExpand(movement);
    return (
      <Fragment key={movement.id} data-testid="Fragment__ae5a16">
        <TableRow
          data-testid={`movement-row-${movement.id}`}
          className={`group relative transition-shadow ${rowCanExpand ? 'cursor-pointer' : ''} ${
            highlighted ? 'bg-[hsl(var(--muted))]' : 'bg-card'
          } ${
            expanded
              ? 'z-20 border-b-0 [&>td]:border-b-0 hover:bg-card'
              : 'hover:z-10 hover:bg-card hover:shadow-lg'
          }`}
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

  return (
    <TooltipProvider data-testid="TooltipProvider__ae5a16">
      <Table data-testid="Table__ae5a16">
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
            {CONTRACT_COLUMNS.map((col) => (
              <TableHead key={col.name} data-testid="TableHead__ae5a16">
                {MOVEMENT_CELL_RENDERERS[col.name] ? ui(MOVEMENT_CELL_RENDERERS[col.name].labelKey) : col.label}
              </TableHead>
            ))}
            <TableHead className="text-right" data-testid="TableHead__ae5a16">{ui('financeAccountMovementsColAmount')}</TableHead>
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
