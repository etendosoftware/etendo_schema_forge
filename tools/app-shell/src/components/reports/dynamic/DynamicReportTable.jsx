import { useMemo } from 'react';
import { ChevronRight, Loader2 } from 'lucide-react';
import { useUI } from '@/i18n';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { cn } from '@/lib/utils';
import { canSplit } from './reportTree.js';
import { rowShares, splitShares } from './reportVisuals.js';
import { TrendPill } from './DynamicReportKpis.jsx';

// Amounts are in the schema's currency, which the tree does not name: plain grouped numbers, as the PDF.
const amount = (v) => formatCurrency(null, v);
const pct = (v) => (v == null ? '' : `${formatCurrency(null, v)} %`);
const TREND_CLASS = { improves: 'text-status-success-foreground', worsens: 'text-destructive' };
const NUM = 'px-3 py-1.5 text-right tabular-nums';
// The compared period is the reference, not the figure being read: a quieter column.
const REF = 'bg-muted/30 text-muted-foreground';

function VariationCells({ row }) {
  const moved = Number(row.variationAmount) || 0;
  return (
    <>
      <td className={cn(NUM, TREND_CLASS[row.trend])} data-testid="DynamicReportTable__variation">{amount(row.variationAmount)}</td>
      <td className={NUM} data-testid="DynamicReportTable__variationPct">
        {row.variationPct != null && moved !== 0 && <TrendPill trend={row.trend} up={moved > 0}>{pct(row.variationPct)}</TrendPill>}
      </td>
    </>
  );
}

/** The amount with a thin bar underneath: its weight within its parent (blue in, lavender out). */
function AmountCell({ value, share, className }) {
  const negative = Number(value) < 0;
  return (
    <td className={cn(NUM, negative && 'text-destructive/90', className)}>
      {amount(value)}
      {share > 0 && (
        <span className="mt-1 ml-auto block h-1 w-24 rounded-full bg-muted" aria-hidden="true">
          <span
            className={cn('ml-auto block h-full rounded-full', negative ? 'bg-[var(--ai-accent)]' : 'bg-primary/70')}
            style={{ width: `${Math.max(4, Math.round(share * 100))}%` }}
            data-testid="DynamicReportTable__bar"
          />
        </span>
      )}
    </td>
  );
}

function SplitRows({ split, compare, depth, ui }) {
  const pad = { paddingLeft: `${(depth + 1) * 16 + 28}px` };
  const colSpan = compare ? 5 : 2;
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
    <tr key={part.node_id ?? '∅'} className="text-muted-foreground text-xs bg-accent-highlight/10" data-testid="DynamicReportTable__splitRow">
      <td className="px-3 py-1.5" style={pad}>{part.name || ui('dynamicReportSplitNone')}</td>
      <AmountCell value={part.amount} share={shares[i]} />
      {compare && (
        <>
          <td className={cn(NUM, REF)}>{amount(part.amount_ref)}</td>
          <VariationCells row={part} />
        </>
      )}
    </tr>
  ));
}

/**
 * ETP-6080 — the account tree: one row per visible node, a chevron to fold it, and with a split
 * dimension chosen, a split toggle on every leaf account that lists its parts underneath. A leaf
 * account's name opens its ledger in the drill-down panel (F9).
 */
export default function DynamicReportTable({ rows, compare, expanded, onToggle, splitBy, splits, onToggleSplit, onOpenLedger }) {
  const ui = useUI();
  const shares = useMemo(() => rowShares(rows), [rows]);
  const th = 'px-3 py-2.5 font-semibold uppercase tracking-wide';
  return (
    <table className="w-full border-collapse text-sm" data-testid="DynamicReportTable">
      <thead>
        <tr className="text-xs text-primary bg-primary/5 border-b-2 border-primary/20">
          <th scope="col" className={cn(th, 'text-left rounded-tl-lg')}>{ui('dynamicReportConcept')}</th>
          <th scope="col" className={cn(th, 'text-right', !compare && 'rounded-tr-lg')}>{ui('dynamicReportAmount')}</th>
          {compare && (
            <>
              <th scope="col" className={cn(th, 'text-right')}>{ui('dynamicReportCompared')}</th>
              <th scope="col" className={cn(th, 'text-right')}>{ui('dynamicReportVariation')}</th>
              <th scope="col" className={cn(th, 'text-right rounded-tr-lg')}>{ui('dynamicReportVariationPct')}</th>
            </>
          )}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const open = expanded.has(row.node_id);
          const splittable = Boolean(splitBy) && canSplit(row);
          const split = splits[row.node_id];
          const name = row.value ? `${row.value} - ${row.name}` : row.name;
          return [
            <tr
              key={row.node_id}
              className={cn(
                'border-b border-border/40 transition-colors hover:bg-primary/[0.03]',
                row.elementlevel === 'E' && 'font-semibold',
                // Section band: a top-level line opens a block of the report.
                row.depth === 0 && !row.isFormula && 'bg-primary/[0.04] shadow-[inset_3px_0_0_hsl(var(--primary)/0.5)]',
                // Subtotal (A. RESULTADO DE EXPLOTACIÓN…): the lime of the palette, ruled above.
                row.isFormula && 'bg-accent-highlight/20 font-semibold border-t-2 border-t-accent-highlight shadow-[inset_3px_0_0_hsl(var(--accent-highlight))]',
              )}
              data-testid="DynamicReportTable__row"
              data-node-id={row.node_id}
            >
              <td className="px-3 py-1.5">
                <div className="flex items-center gap-1" style={{ paddingLeft: `${row.depth * 16}px` }}>
                  {row.hasChildren || splittable ? (
                    <button
                      type="button"
                      className="w-5 h-5 flex items-center justify-center rounded hover:bg-muted"
                      aria-expanded={row.hasChildren ? open : Boolean(split)}
                      aria-label={row.hasChildren
                        ? ui(open ? 'dynamicReportCollapseRow' : 'dynamicReportExpandRow', { name })
                        : ui('dynamicReportShowSplit', { name })}
                      onClick={() => (row.hasChildren ? onToggle(row.node_id) : onToggleSplit(row))}
                      data-testid={row.hasChildren ? 'DynamicReportTable__toggle' : 'DynamicReportTable__splitToggle'}
                    >
                      <ChevronRight className={cn('w-3.5 h-3.5 transition-transform', (row.hasChildren ? open : split) && 'rotate-90')} />
                    </button>
                  ) : <span className="w-5 h-5 shrink-0" />}
                  {onOpenLedger && canSplit(row) && row.value ? (
                    <button
                      type="button"
                      className="text-left text-primary underline decoration-primary/30 underline-offset-4 hover:decoration-primary"
                      onClick={() => onOpenLedger(row)}
                      data-testid="DynamicReportTable__ledger"
                    >
                      {name}
                    </button>
                  ) : <span>{name}</span>}
                </div>
              </td>
              <AmountCell value={row.amount} share={shares.get(row.node_id)} />
              {compare && (
                <>
                  <td className={cn(NUM, REF)}>{amount(row.amount_ref)}</td>
                  <VariationCells row={row} />
                </>
              )}
            </tr>,
            split && <SplitRows key={`${row.node_id}-split`} split={split} compare={compare} depth={row.depth} ui={ui} />,
          ];
        })}
      </tbody>
    </table>
  );
}
