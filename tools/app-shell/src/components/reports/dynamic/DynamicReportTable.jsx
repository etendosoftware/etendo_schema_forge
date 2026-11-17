import { useMemo } from 'react';
import { ChevronRight, Loader2 } from 'lucide-react';
import { useUI } from '@/i18n';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { cn } from '@/lib/utils';
import { canSplit } from './reportTree.js';
import { cellParts, columnCount } from './reportColumns.js';
import { rowShares, splitShares } from './reportVisuals.js';
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
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" data-testid="DynamicReportTable__splitLoading" />
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
        const parts = cellParts(part, g.pos, mode);
        return (
          <GroupCells key={g.pos} parts={parts} group={g} share={g.pos === 0 ? shares[i] : 0} data-testid="GroupCells__2e8fe9" />
        );
      })}
    </tr>
  ));
}

/** The cells of one period group in one row: the amount, and with a comparison its compared amount and variation. */
function GroupCells({ parts, group, share, onOpenCurrent, onOpenCompared }) {
  return (
    <>
      <AmountCell value={parts.amount} share={share} onOpen={onOpenCurrent} data-testid="AmountCell__2e8fe9" />
      {group.compared && (
        <>
          <AmountCell value={parts.compared} className={REF} onOpen={onOpenCompared} data-testid="AmountCell__2e8fe9" />
          <VariationCells parts={parts} data-testid="VariationCells__2e8fe9" />
        </>
      )}
    </>
  );
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
      <ChevronRight
        className={cn('w-3.5 h-3.5 transition-transform', rotated && 'rotate-90')}
        data-testid="ChevronRight__2e8fe9" />
    </button>
  );
}

/** A leaf account's name opens its ledger (F9); any other row's name is plain text. */
function RowName({ row, name, onOpenLedger }) {
  if (!(onOpenLedger && canSplit(row) && row.value)) return <span>{name}</span>;
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
 * ETP-6080 — the account tree: one row per visible node, a chevron to fold it, and with a split
 * dimension chosen, a split toggle on every leaf account that lists its parts underneath. A leaf
 * account's name opens its ledger in the drill-down panel (F9).
 *
 * ETP-6239: one column group per period (`groups`, from `columnModel`), each with its comparison
 * (`mode` none / sly / prev). A current cell opens the ledger for its period, a Comparado cell for
 * the compared range (`onOpenLedger(row, range)`); the variation cells are not clickable.
 */
export default function DynamicReportTable({ rows, groups, mode, expanded, onToggle, splitBy, splits, onToggleSplit, onOpenLedger }) {
  const ui = useUI();
  const shares = useMemo(() => rowShares(rows), [rows]);
  const th = 'px-3 py-2 font-medium uppercase tracking-wide';
  const subLabels = { current: ui('dynamicReportAmount'), compared: ui('dynamicReportCompared'), variation: ui('dynamicReportVariation'), variationPct: ui('dynamicReportVariationPct') };
  return (
    <div className="overflow-x-auto" data-testid="DynamicReportTable__scroll">
      <table className="w-full border-collapse text-sm" data-testid="DynamicReportTable">
        <thead>
          <tr className="text-xs text-muted-foreground bg-muted border-b border-border/60">
            <th scope="col" rowSpan={2} className={cn(th, STICKY, 'bg-muted text-left align-bottom rounded-tl-lg min-w-[16rem]')}>{ui('dynamicReportConcept')}</th>
            {groups.map((g) => (
              <th key={g.pos} scope="colgroup" colSpan={g.columns.length} className={cn(th, 'text-center border-l border-border/60 whitespace-nowrap')} data-testid="DynamicReportTable__group">{g.label}</th>
            ))}
          </tr>
          <tr className="text-xs text-muted-foreground bg-muted/40 border-b border-border">
            {groups.map((g) => g.columns.map((c, i) => (
              <th key={`${g.pos}-${c}`} scope="col" className={cn(th, 'text-right whitespace-nowrap', i === 0 && 'border-l border-border/60')}>
                {subLabels[c]}
                {c === 'compared' && g.comparedLabel && (
                  <span className="block text-[10px] font-normal normal-case tracking-normal" data-testid="DynamicReportTable__comparedLabel">({g.comparedLabel})</span>
                )}
              </th>
            )))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const open = expanded.has(row.node_id);
            const splittable = Boolean(splitBy) && canSplit(row);
            const split = splits[row.node_id];
            const name = row.value ? `${row.value} - ${row.name}` : row.name;
            const drillable = Boolean(onOpenLedger) && canSplit(row) && Boolean(row.value);
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
                    <RowName row={row} name={name} onOpenLedger={onOpenLedger && (() => onOpenLedger(row, null))} data-testid="RowName__2e8fe9" />
                  </div>
                </td>
                {groups.map((g) => (
                  <GroupCells
                    key={g.pos}
                    parts={cellParts(row, g.pos, mode)}
                    group={g}
                    share={g.pos === 0 ? shares.get(row.node_id) : 0}
                    onOpenCurrent={drillable ? () => onOpenLedger(row, g.current) : null}
                    onOpenCompared={drillable && g.compared ? () => onOpenLedger(row, g.compared) : null}
                    data-testid="GroupCells__2e8fe9" />
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
      </table>
    </div>
  );
}
