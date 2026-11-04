// Warehouse legend of the stock chart (ETP-5908 RF-13..RF-15): horizontal row, left-aligned, wrapping onto more rows when it does not fit (never clipped), coloured dot
// + name, 16 px between entries. Controlled and shared by the side panel (toggle) and the expand modal (isolate): the parent
// owns `visible` and the click handler. Each entry is a real toggle button (aria-pressed = visible).
// `items` = [{ name, color }]; `visible` = Set of names (omitted: all visible); `highlight` = hovered visible name or null.
import { useUI } from '@/i18n';
import { dimmedOpacity, DIMMED_OPACITY } from './stockSeriesVisibility';

function LegendEntry({ item, shown, highlight, onToggle, onHover, ui }) {
  return (
    <button
      type="button"
      aria-pressed={shown}
      aria-label={ui('showSeriesInChart', { name: item.name })}
      title={item.name}
      onClick={() => onToggle?.(item.name)}
      onMouseEnter={() => onHover?.(item.name)}
      onMouseLeave={() => onHover?.(null)}
      onFocus={() => onHover?.(item.name)}
      onBlur={() => onHover?.(null)}
      className="flex items-center gap-2 min-w-0 max-w-full rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      data-testid="StockChartLegendItem"
    >
      <span
        className="w-2 h-2 rounded-full shrink-0 transition-opacity"
        style={{ backgroundColor: item.color, opacity: shown ? dimmedOpacity(item.name, highlight) : DIMMED_OPACITY }}
        data-testid="StockChartLegendDot"
      />
      <span className={`text-xs font-normal break-words ${shown ? 'text-foreground' : 'text-muted-foreground line-through'}`}>{item.name}</span>
    </button>
  );
}

export default function StockChartLegend({ items, visible, highlight = null, onToggle, onHover }) {
  const ui = useUI();
  if (!items || items.length === 0) return null;
  return (
    <div className="flex flex-row flex-wrap items-center justify-start gap-4 gap-y-1" data-testid="StockChartLegend">
      {items.map(item => (
        <LegendEntry
          key={item.name}
          item={item}
          shown={!visible || visible.has(item.name)}
          highlight={highlight}
          onToggle={onToggle}
          onHover={onHover}
          ui={ui}
          data-testid="LegendEntry__c111c5" />
      ))}
    </div>
  );
}
