import { useUI } from '@/i18n';
import { cn } from '@/lib/utils';

/**
 * Side panel listing every registered event source: a checkbox to toggle it,
 * its colour swatch and how many of its events fall in the visible range.
 */
export default function SourcePanel({ sources, enabled, counts, onToggle }) {
  const ui = useUI();
  return (
    <aside className="w-full lg:w-64 shrink-0 rounded-lg border bg-card p-4 flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold">{ui('ucalSources')}</h2>
        <p className="text-xs text-muted-foreground">{ui('ucalSourcesHint')}</p>
      </div>
      <ul className="flex flex-col gap-1">
        {sources.map((source) => {
          const inputId = `ucal-source-${source.id}`;
          const isOn = enabled[source.id] !== false;
          return (
            <li key={source.id}>
              <label
                htmlFor={inputId}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-sm cursor-pointer hover:bg-accent/50"
              >
                <input
                  id={inputId}
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={isOn}
                  onChange={() => onToggle(source.id)}
                />
                <span className={cn('h-3 w-3 rounded-sm', source.color.swatch)} aria-hidden="true" />
                <span className={cn('flex-1', !isOn && 'text-muted-foreground')}>
                  {ui(source.labelKey)}
                </span>
                <span className="rounded-full bg-muted px-2 text-xs tabular-nums text-muted-foreground">
                  {counts[source.id] ?? 0}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <p className="mt-auto text-xs text-muted-foreground">{ui('ucalMockNotice')}</p>
    </aside>
  );
}
