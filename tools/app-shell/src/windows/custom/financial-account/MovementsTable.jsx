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
import { getContractGridColumns } from '@/components/financial-accounts/contractColumns';

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
        className="whitespace-nowrap text-sm leading-5 text-[#121217]"
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
            className="inline-flex items-center gap-1 text-[#121217] underline decoration-[#d1d4db] underline-offset-4 hover:decoration-[#121217]"
          >
            {m.documentNo}
            <ArrowUpRight className="h-3 w-3" data-testid="ArrowUpRight__ae5a16" />
          </button>
        ) : (
          <span className="text-[#121217]">{m.documentNo}</span>
        )}
      </TableCell>
    ),
  },
  businessPartner: {
    labelKey: 'financeAccountMovementsColContact',
    renderCell: (m) => (
      <TableCell
        className="text-sm leading-5 text-[#121217]"
        data-testid="TableCell__ae5a16">{m.contact}</TableCell>
    ),
  },
  description: {
    labelKey: 'financeAccountMovementsColDescription',
    renderCell: (m) => (
      <TableCell
        className="max-w-[200px] truncate text-sm text-[#121217]"
        data-testid="TableCell__ae5a16">{m.description}</TableCell>
    ),
  },
  status: {
    labelKey: 'financeAccountMovementsColStatus',
    renderCell: (m) => (
      <TableCell data-testid="TableCell__ae5a16">
        <MovementStatusBadge status={m.paymentStatus} data-testid="MovementStatusBadge__ae5a16" />
      </TableCell>
    ),
  },
  transactionType: {
    labelKey: 'financeAccountMovementsColType',
    renderCell: (m, ctx) => (
      <TableCell data-testid="TableCell__ae5a16">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm leading-5 text-[#121217]">{ctx.getTrxTypeLabel(m)}</span>
          <PostingStatusDot paymentStatus={m.paymentStatus} data-testid="PostingStatusDot__ae5a16" />
        </div>
      </TableCell>
    ),
  },
  gLItem: {
    labelKey: 'financeAccountMovementsColGlItem',
    renderCell: (m) => (
      <TableCell
        className="max-w-[180px] truncate text-sm text-[#121217]"
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
      className="text-sm leading-5 text-[#121217]"
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

// The "more info" panel shows only these three accounting dimensions (in this order),
// regardless of which dimensions the chart of accounts has enabled.
const DISPLAYED_DIMENSIONS = ['project', 'costcenter', 'product'];

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
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F5F7F9]">
              <ArrowLeftRight className="h-5 w-5 text-[#828FA3]" data-testid="ArrowLeftRight__ae5a16" />
            </div>
            <p className="text-sm font-medium text-[#121217]">
              {ui('financeAccountMovementsEmpty')}
            </p>
            <p className="max-w-sm text-sm text-[#6C6C89]">
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

/**
 * "More info" panel — read-only accounting dimensions rendered as disabled
 * form fields (label on top + greyed-out bordered box, same look as a read-only
 * field in the document forms), in a 4-column grid with an elevated surface.
 *
 * Shows the dimensions enabled in the chart of accounts (even when empty, like
 * Classic), as read-only fields. The business partner is excluded — it already
 * has its own "Contacto" column.
 */
function DimensionsPanel({ movement, ui }) {
  const dims = movement.dimensions || {};
  const visible = DISPLAYED_DIMENSIONS;

  return (
    <div className="grid grid-cols-1 gap-5 pl-16 pr-[52px] pb-8 pt-3 sm:grid-cols-2 lg:grid-cols-4">
      {visible.map((key) => (
        <div key={key} className="flex flex-col gap-2">
          <span className="text-sm font-medium leading-6 text-[#121217]">
            {ui(DIMENSION_LABEL_KEYS[key] ?? key)}
          </span>
          <Input
            className="items-center"
            value={dims[key] || ''}
            disabled
            readOnly
            data-testid="Input__ae5a16" />
        </div>
      ))}
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
export function MovementsTable({ movements, loading, enabledDimensions = [], selectedIds, onSelectionChange, highlightTxnId = null, onReload }) {
  const ui = useUI();
  const navigate = useNavigate();
  const { locale: appLocale } = useLocaleSwitch();
  const bcpLocale = (appLocale || 'es_ES').replace('_', '-');
  const getTrxTypeLabel = useTrxTypeLabel();
  const [expandedId, setExpandedId] = useState(null);
  const hasDimensions = enabledDimensions.length > 0;

  // Scroll the deep-linked transaction (from the reconciled-txns modal) into view once loaded and
  // expand it so its accounting dimensions are visible.
  useEffect(() => {
    if (!highlightTxnId) return;
    if (hasDimensions) setExpandedId(highlightTxnId);
    const row = document.querySelector(`[data-testid="movement-row-${highlightTxnId}"]`);
    if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

  // Helpers handed to the contract-column cell renderers.
  const cellCtx = { ui, bcpLocale, getTrxTypeLabel, openPayment };

  const renderRow = (movement) => {
    const expanded = expandedId === movement.id;
    const highlighted = highlightTxnId && movement.id === highlightTxnId;
    return (
      <Fragment key={movement.id} data-testid="Fragment__ae5a16">
        <TableRow
          data-testid={`movement-row-${movement.id}`}
          className={`group relative transition-shadow ${hasDimensions ? 'cursor-pointer' : ''} ${
            highlighted ? 'bg-[#F5F7F9]' : 'bg-white'
          } ${
            expanded
              ? 'z-20 border-b-0 [&>td]:border-b-0 hover:bg-white'
              : 'hover:z-10 hover:bg-white hover:shadow-lg'
          }`}
          onClick={() => { if (hasDimensions) toggleExpand(movement.id); }}
        >
          {/* Expand chevron (circular button) */}
          <TableCell onClick={(e) => e.stopPropagation()} data-testid="TableCell__ae5a16">
            {hasDimensions ? (
              <button
                type="button"
                aria-label={ui('financeAccountMovementsMoreInfo')}
                aria-expanded={expanded}
                data-testid={`movement-expand-${movement.id}`}
                onClick={() => toggleExpand(movement.id)}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-[#D1D4DB] bg-white text-[#6C6C89] transition-transform hover:bg-[#F5F7F9] hover:text-[#121217]"
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
              className="text-sm font-semibold text-[#121217]"
              data-testid="MoneyAmount__ae5a16" />
          </TableCell>

          {/* Kebab — visible on row hover */}
          <TableCell onClick={(e) => e.stopPropagation()} data-testid="TableCell__ae5a16">
            <div className="opacity-0 transition-opacity group-hover:opacity-100">
              <MovementRowKebab movement={movement} onReload={onReload} data-testid="MovementRowKebab__ae5a16" />
            </div>
          </TableCell>
        </TableRow>
        {expanded ? (
          <TableRow
            className="relative z-10 border-b-0 bg-white shadow-lg [&>td]:border-b-0 hover:bg-white"
            data-testid={`movement-moreinfo-${movement.id}`}
          >
            <TableCell colSpan={COL_COUNT} className="p-0" data-testid="TableCell__ae5a16">
              <DimensionsPanel
                movement={movement}
                ui={ui}
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
            className="h-10 [&_th]:text-xs [&_th]:font-semibold [&_th]:leading-4 [&_th]:text-[#121217]"
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
            <TableHead data-testid="TableHead__ae5a16">{ui('financeAccountMovementsColAmount')}</TableHead>
            <TableHead data-testid="TableHead__ae5a16">{ui('financeAccountMovementsColBalance')}</TableHead>
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
