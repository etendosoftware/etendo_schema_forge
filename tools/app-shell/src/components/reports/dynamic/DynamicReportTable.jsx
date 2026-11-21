import { useMemo } from 'react';
import { CaretRightIcon, CircleNotchIcon } from '@phosphor-icons/react';
import { useUI } from '@/i18n';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { cn } from '@/lib/utils';
import { canSplit } from './reportTree.js';
import { canDrill } from './drillDown.js';
import { cellParts, columnCount } from './reportColumns.js';
import { rowShares, splitShares } from './reportVisuals.js';
import StickyHScroll from './StickyHScroll.jsx';
import { TrendPill } from './DynamicReportKpis.jsx';

// Amounts are in the schema's currency, which the tree does not name: plain grouped numbers, as the PDF.
const amount = (v) => formatCurrency(null, v);
const pct = (v) => (v == null ? '' : `${formatCurrency(null, v)} %`);
const TREND_CLASS = { improves: 'text-status-success-foreground', worsens: 'text-destructive' };
const NUM = 'px-3 py-1.5 text-right tabular-nums whitespace-nowrap';
// Concepto stays in view while the periods scroll: sticky, so its background must be opaque on every row state.
const STICKY = 'sticky left-0 z-10';
// The compared period is the reference, not the figure being read: a quieter column.
const REF = 'bg-muted/30 text-muted-foreground';

/** A dimension row is named by its contact / product / project / cost centre; an account row by "value - name". */
function rowDisplayName(row, ui) {
  if (row.isDimension) return row.dimension_name || row.name || ui('dynamicReportSplitNone');
  return row.value ? `${row.value} - ${row.name}` : row.name;
}

function VariationCells({ parts }) {
  const moved = Number(parts.variationAmount) || 0;
  return (
    <>
      <td className={cn(NUM, TREND_CLASS[parts.trend])} data-testid="DynamicReportTable__variation">{amount(parts.variationAmount)}</td>
      <td className={NUM} data-testid="DynamicReportTable__variationPct">
        {parts.variationPct != null && moved !== 0 && <TrendPill trend={parts.trend} up={moved > 0} data-testid="TrendPill__2e8fe9">{pct(parts.variationPct)}</TrendPill>}
      </td>
    </>
  );
}

/** The amount with a thin bar underneath: its weight within its parent (blue in, lavender out). */
function AmountCell({ value, share, className, onOpen }) {
  const negative = Number(value) < 0;
  return (
    <td className={cn(NUM, className)}>
      {onOpen && Number(value) !== 0 ? (
        <button
          type="button"
          className="text-primary underline decoration-primary/30 underline-offset-4 hover:decoration-primary"
          onClick={onOpen}
          data-testid="DynamicReportTable__cellLedger"
        >
          {amount(value)}
        </button>
      ) : amount(value)}
      {share > 0 && (
        <span className="mt-1 ml-auto block h-0.5 w-20 rounded-full bg-muted" aria-hidden="true">
          <span
            className={cn('ml-auto block h-full rounded-full', negative ? 'bg-[var(--ai-accent)] opacity-60' : 'bg-primary/40')}
            style={{ width: `${Math.max(4, Math.round(share * 100))}%` }}
            data-testid="DynamicReportTable__bar"
          />
        </span>
      )}
    </td>
  );
}

function SplitRows({ split, groups, mode, depth, ui }) {
  const pad = { paddingLeft: `${(depth + 1) * 16 + 28}px` };
  const colSpan = 1 + columnCount(groups);
  if (split.loading) {
    return (
      <tr><td colSpan={colSpan} className="px-3 py-1.5" style={pad}>
        <CircleNotchIcon className="w-4 h-4 animate-spin text-muted-foreground" data-testid="DynamicReportTable__splitLoading" />
      </td></tr>
    );
  }
  if (split.error) {
    return <tr><td colSpan={colSpan} className="px-3 py-1.5 text-destructive text-xs" style={pad}>{ui('dynamicReportErrorGeneric')}</td></tr>;
  }
  if (!split.rows.length) {
    return <tr><td colSpan={colSpan} className="px-3 py-1.5 text-muted-foreground text-xs" style={pad}>{ui('noResults')}</td></tr>;
  }
  const shares = splitShares(split.rows);
  return split.rows.map((part, i) => (
    // The split SQL coalesces a missing name to '', not null.
    <tr key={part.node_id ?? '∅'} className="text-muted-foreground text-xs" data-testid="DynamicReportTable__splitRow">
      <td className="px-3 py-1.5 bg-card sticky left-0 z-10" style={pad}>{part.name || ui('dynamicReportSplitNone')}</td>
      {groups.map((g) => {
        return (
          <GroupRowCells key={g.pos} row={part} group={g} mode={mode} share={g.pos === 0 ? shares[i] : 0} data-testid="GroupRowCells__2e8fe9" />
        );
      })}
    </tr>
  ));
}

/**
 * The cells of one amount column of one period group in one row: the amount, and with a comparison (`kinds`
 * holds 'compared') its compared amount and variation. `kinds` is the group's, or the amount column's (ETP-6084).
 */
function GroupCells({ parts, kinds, share, onOpenCurrent, onOpenCompared }) {
  return (
    <>
      <AmountCell value={parts.amount} share={share} onOpen={onOpenCurrent && (() => onOpenCurrent(parts.amount))} data-testid="AmountCell__2e8fe9" />
      {kinds.includes('compared') && (
        <>
          <AmountCell value={parts.compared} className={REF} onOpen={onOpenCompared && (() => onOpenCompared(parts.compared))} data-testid="AmountCell__2e8fe9" />
          <VariationCells parts={parts} data-testid="VariationCells__2e8fe9" />
        </>
      )}
    </>
  );
}

/** Every cell of one period group in one row: the single amount column, or one cell set per contract amount column. */
function GroupRowCells({ row, group, mode, share, onOpenCurrent, onOpenCompared }) {
  const amounts = group.amounts ?? [{ field: null, columns: group.columns }];
  return amounts.map((a) => (
    <GroupCells
      key={a.field ?? 'amount'}
      parts={cellParts(row, group.pos, mode, a.field)}
      kinds={a.columns}
      share={group.amounts ? 0 : share}
      onOpenCurrent={onOpenCurrent}
      onOpenCompared={onOpenCompared}
      data-testid="GroupCells__2e8fe9" />
  ));
}

/** Chevron that folds a parent row, or shows the split parts of a leaf account. */
function RowToggle({ row, name, open, split, splittable, onToggle, onToggleSplit }) {
  const ui = useUI();
  // No split handler (e.g. reversed dates) means no dead control.
  if (!row.hasChildren && !(splittable && onToggleSplit)) return <span className="w-5 h-5 shrink-0" />;
  const parent = Boolean(row.hasChildren);
  let label = ui('dynamicReportShowSplit', { name });
  if (parent) label = ui(open ? 'dynamicReportCollapseRow' : 'dynamicReportExpandRow', { name });
  const rotated = parent ? open : Boolean(split);
  return (
    <button
      type="button"
      className="w-5 h-5 flex items-center justify-center rounded hover:bg-muted"
      aria-expanded={rotated}
      aria-label={label}
      onClick={() => (parent ? onToggle(row.node_id) : onToggleSplit(row))}
      data-testid={parent ? 'DynamicReportTable__toggle' : 'DynamicReportTable__splitToggle'}
    >
      <CaretRightIcon
        className={cn('w-3.5 h-3.5 transition-transform', rotated && 'rotate-90')}
        data-testid="ChevronRight__2e8fe9" />
    </button>
  );
}

/** A leaf account's name opens its ledger (F9); any other row's name is plain text. */
function RowName({ drillable, name, onOpenLedger }) {
  if (!(onOpenLedger && drillable)) return <span>{name}</span>;
  return (
    <button
      type="button"
      className="text-left text-primary underline decoration-primary/30 underline-offset-4 hover:decoration-primary"
      onClick={onOpenLedger}
      data-testid="DynamicReportTable__ledger"
    >
      {name}
    </button>
  );
}

/**
 * The click handler of one amount cell: the income-summary row (`explainable`) opens its explanation, an account (`drillable`)
 * its ledger, anything else nothing. `which` is 'current' or 'compared'; the handler receives the cell's amount.
 */
function foldedCalculated(row, pos, which, mode) {
  const part = row.foldedOnTheFly?.[pos];
  return (which === 'compared' ? part?.[mode] : part?.amount) || 0;
}

function cellOpener({ row, group, which, explainable, drillable, mode, onOpenResult, onOpenLedger }) {
  const range = which === 'compared' ? group.compared : group.current;
  if (!range) return null;
  if (explainable) return (amount) => onOpenResult(row, { pos: group.pos, which, range, amount, mode });
  if (!drillable) return null;
  // ETP-6083: a ledger holds posted lines only; a folded row that includes a calculated result is compared without it.
  const calculated = foldedCalculated(row, group.pos, which, mode);
  return (amount) => onOpenLedger(row, range, calculated ? amount - calculated : amount, calculated);
}

/**
 * ETP-6080 — the account tree: one row per visible node, a chevron to fold it, and with a split
 * dimension chosen, a split toggle on every leaf account that lists its parts underneath. A leaf
 * account's name opens its ledger in the drill-down panel (F9).
 *
 * ETP-6239: one column group per period (`groups`, from `columnModel`), each with its comparison
 * (`mode` none / sly / prev). A current cell opens the ledger for its period, a Comparado cell for
 * the compared range (`onOpenLedger(row, range)`); the variation cells are not clickable.
 *
 * ETP-6084: groups with `amounts` (the contract's amount columns) show one cell set per amount, headed by its
 * label; `totals` (the answer's per-period cells) adds the TOTALES row.
 */
export default function DynamicReportTable({ rows, groups, mode, expanded, onToggle, splitBy, splits, onToggleSplit, onOpenLedger, onOpenResult = null, totals = null }) {
  const ui = useUI();
  const shares = useMemo(() => rowShares(rows), [rows]);
  const th = 'px-3 py-2 font-medium uppercase tracking-wide';
  const amountsMode = groups.some((g) => g.amounts);
  const withSubLabels = !amountsMode || groups.some((g) => g.columns.length > (g.amounts?.length ?? 1));
  const periodRow = !amountsMode || groups.length > 1;
  const headRows = (periodRow ? 1 : 0) + (amountsMode ? 1 : 0) + (withSubLabels ? 1 : 0);
  const subLabels = { current: ui('dynamicReportAmount'), compared: ui('dynamicReportCompared'), variation: ui('dynamicReportVariation'), variationPct: ui('dynamicReportVariationPct') };
  return (
    <StickyHScroll data-testid="StickyHScroll__2e8fe9">
      <table className="w-full border-collapse text-sm" data-testid="DynamicReportTable">
        <thead>
          <tr className="text-xs text-muted-foreground bg-muted border-b border-border/60">
            <th scope="col" rowSpan={headRows} className={cn(th, STICKY, 'bg-muted text-left align-bottom rounded-tl-lg min-w-[16rem]')}>{ui('dynamicReportConcept')}</th>
            {periodRow && groups.map((g) => (
              <th key={g.pos} scope="colgroup" colSpan={g.columns.length} className={cn(th, 'text-center border-l border-border/60 whitespace-nowrap')} data-testid="DynamicReportTable__group">{g.label}</th>
            ))}
            {!periodRow && groups.flatMap((g) => g.amounts.map((a) => (
              <th key={`${g.pos}-${a.field}`} scope="colgroup" colSpan={a.columns.length} className={cn(th, 'text-center border-l border-border/60 whitespace-nowrap')} data-testid="DynamicReportTable__amount">{ui(a.labelKey)}</th>
            )))}
          </tr>
          {periodRow && amountsMode && (
            <tr className="text-xs text-muted-foreground bg-muted/60 border-b border-border/60">
              {groups.flatMap((g) => g.amounts.map((a) => (
                <th key={`${g.pos}-${a.field}`} scope="colgroup" colSpan={a.columns.length} className={cn(th, 'text-center border-l border-border/60 whitespace-nowrap')} data-testid="DynamicReportTable__amount">{ui(a.labelKey)}</th>
              )))}
            </tr>
          )}
          {withSubLabels && (
            <tr className="text-xs text-muted-foreground bg-muted/40 border-b border-border">
              {groups.map((g) => (g.amounts ?? [{ field: 'amount', columns: g.columns }]).map((a) => a.columns.map((c, i) => (
                <th key={`${g.pos}-${a.field}-${c}`} scope="col" className={cn(th, 'text-right whitespace-nowrap', i === 0 && 'border-l border-border/60')}>
                  {subLabels[c]}{c === 'compared' && g.comparedLabel ? ' ' : ''}
                  {c === 'compared' && g.comparedLabel && (
                    <span className="block text-[10px] font-normal normal-case tracking-normal" data-testid="DynamicReportTable__comparedLabel">({g.comparedLabel})</span>
                  )}
                </th>
              ))))}
            </tr>
          )}
        </thead>
        <tbody>
          {rows.map((row) => {
            const open = expanded.has(row.node_id);
            const splittable = Boolean(splitBy) && canSplit(row);
            const split = splits[row.node_id];
            // A dimension row (ETP-6084) is named by its contact / product / project / cost centre; none = "Sin asignar".
            const name = rowDisplayName(row, ui);
            const drillable = Boolean(onOpenLedger) && canDrill(row);
            // ETP-6083: a row that carries `result` (the income-summary account) explains its posted / calculated parts instead.
            const explainable = Boolean(onOpenResult) && Boolean(row.result);
            const opener = (group, which) => cellOpener({ row, group, which, explainable, drillable, mode, onOpenResult, onOpenLedger });
            return [
              <tr
                key={row.node_id}
                className={cn(
                  'group border-b border-border/40 transition-colors hover:bg-primary/[0.03]',
                  row.elementlevel === 'E' && 'font-semibold',
                  // Section mark: a top-level line opens a block of the report.
                  row.depth === 0 && !row.isFormula && 'shadow-[inset_2px_0_0_hsl(var(--primary)/0.35)]',
                  // Subtotal (A. RESULTADO DE EXPLOTACIÓN…): muted, ruled above, a lime edge.
                  row.isFormula && 'bg-muted/40 font-semibold border-t border-t-border shadow-[inset_2px_0_0_hsl(var(--accent-highlight))]',
                )}
                data-testid="DynamicReportTable__row"
                data-node-id={row.node_id}
              >
                <td className={cn('px-3 py-1.5', STICKY, row.isFormula ? 'bg-muted' : 'bg-card group-hover:bg-muted')}>
                  <div className="flex items-center gap-1" style={{ paddingLeft: `${row.depth * 16}px` }}>
                    <RowToggle
                      row={row}
                      name={name}
                      open={open}
                      split={split}
                      splittable={splittable}
                      onToggle={onToggle}
                      onToggleSplit={onToggleSplit}
                      data-testid="RowToggle__2e8fe9" />
                    <RowName
                      drillable={drillable || explainable}
                      name={name}
                      onOpenLedger={explainable ? () => opener(groups.find((g) => g.pos === 0), 'current')(row.amount) : onOpenLedger && (() => { const calc = foldedCalculated(row, 0, 'current', mode); onOpenLedger(row, null, row.amount - calc, calc); })}
                      data-testid="RowName__2e8fe9" />
                  </div>
                </td>
                {groups.map((g) => (
                  <GroupRowCells
                    key={g.pos}
                    row={row}
                    group={g}
                    mode={mode}
                    share={g.pos === 0 ? shares.get(row.node_id) : 0}
                    onOpenCurrent={opener(g, 'current')}
                    onOpenCompared={opener(g, 'compared')}
                    data-testid="GroupRowCells__2e8fe9" />
                ))}
              </tr>,
              split && <SplitRows
                key={`${row.node_id}-split`}
                split={split}
                groups={groups}
                mode={mode}
                depth={row.depth}
                ui={ui}
                data-testid="SplitRows__2e8fe9" />,
            ];
          })}
        </tbody>
        {totals && (
          <tfoot>
            <tr className="font-semibold border-t-2 border-border bg-muted/40" data-testid="DynamicReportTable__totals">
              <td className={cn('px-3 py-2', STICKY, 'bg-muted')}>{ui('dynamicReportTotalRow')}</td>
              {groups.map((g) => (
                <GroupRowCells key={g.pos} row={{ cells: totals }} group={g} mode={mode} share={0} data-testid="GroupRowCells__2e8fe9" />
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </StickyHScroll>
  );
}
