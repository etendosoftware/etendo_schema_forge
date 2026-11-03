import { ChevronRight, Loader2 } from 'lucide-react';
import { useUI } from '@/i18n';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { cn } from '@/lib/utils';
import { canSplit } from './reportTree.js';

// Amounts are in the schema's currency, which the tree does not name: plain grouped numbers, as the PDF.
const amount = (v) => formatCurrency(null, v);
const pct = (v) => (v == null ? '' : `${formatCurrency(null, v)} %`);
const TREND_CLASS = { improves: 'text-[var(--status-success-fg)]', worsens: 'text-destructive' };

function VariationCells({ row }) {
  const cls = TREND_CLASS[row.trend] || '';
  return (
    <>
      <td className={cn('px-3 py-1.5 text-right tabular-nums', cls)} data-testid="DynamicReportTable__variation">{amount(row.variationAmount)}</td>
      <td className={cn('px-3 py-1.5 text-right tabular-nums', cls)} data-testid="DynamicReportTable__variationPct">{pct(row.variationPct)}</td>
    </>
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
  return split.rows.map((part) => (
    <tr key={part.node_id ?? '∅'} className="text-muted-foreground" data-testid="DynamicReportTable__splitRow">
      <td className="px-3 py-1.5 text-xs" style={pad}>{part.name ?? ui('dynamicReportSplitNone')}</td>
      <td className="px-3 py-1.5 text-right tabular-nums text-xs">{amount(part.amount)}</td>
      {compare && (
        <>
          <td className="px-3 py-1.5 text-right tabular-nums text-xs">{amount(part.amount_ref)}</td>
          <VariationCells row={part} />
        </>
      )}
    </tr>
  ));
}

/**
 * ETP-6080 — the account tree: one row per visible node, a chevron to fold it, and with a split
 * dimension chosen, a split toggle on every leaf account that lists its parts underneath.
 */
export default function DynamicReportTable({ rows, compare, expanded, onToggle, splitBy, splits, onToggleSplit }) {
  const ui = useUI();
  return (
    <table className="w-full border-collapse text-sm" data-testid="DynamicReportTable">
      <thead>
        <tr className="text-xs text-muted-foreground border-b border-border">
          <th scope="col" className="px-3 py-2 text-left font-medium">{ui('dynamicReportConcept')}</th>
          <th scope="col" className="px-3 py-2 text-right font-medium">{ui('dynamicReportAmount')}</th>
          {compare && (
            <>
              <th scope="col" className="px-3 py-2 text-right font-medium">{ui('dynamicReportCompared')}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{ui('dynamicReportVariation')}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{ui('dynamicReportVariationPct')}</th>
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
              className={cn('border-b border-border/40', row.elementlevel === 'E' && 'font-semibold', row.isFormula && 'bg-muted/40')}
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
                  <span>{name}</span>
                </div>
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">{amount(row.amount)}</td>
              {compare && (
                <>
                  <td className="px-3 py-1.5 text-right tabular-nums">{amount(row.amount_ref)}</td>
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
