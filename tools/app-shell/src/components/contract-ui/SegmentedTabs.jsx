/**
 * Figma segmented control: a 40px muted group of 32px tabs, the active one raised on a card.
 * Shared by the list toolbar's subset tabs (ListView) and custom windows' top bars (ETP-5736).
 * Presentational only: the caller owns the active index and translates labels and `ariaLabel`.
 * Must not import lucide icons — custom-window tests mock `lucide-react` with a narrow icon set.
 *
 * @param {object} props
 * Optional per-item counter (ETP-6049): `count` (a number) renders a small badge after the label;
 * `countLabel` is its accessible text (already translated, e.g. "12 documents"). An item without
 * `count` renders exactly as before, and so does `count: null` (e.g. while the number loads).
 *
 * @param {Array<{key:string, label:string, testId:string, count?:number|null, countLabel?:string, countTestId?:string}>} props.items
 * @param {number} props.active index of the active item
 * @param {(index:number)=>void} props.onChange
 * @param {string} props.ariaLabel accessible name of the group (already translated)
 */
export default function SegmentedTabs({ items, active, onChange, ariaLabel }) {
  return (
    <div role="group" aria-label={ariaLabel} className="inline-flex items-center gap-1 rounded-xl bg-[hsl(var(--muted))] p-1 h-10">
      {items.map((item, i) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onChange(i)}
          data-testid={item.testId}
          className={[
            'h-8 px-3 text-sm leading-6 font-medium text-[hsl(var(--foreground))] rounded-lg transition-all whitespace-nowrap',
            active === i
              ? 'bg-card shadow-sm'
              : 'bg-[hsl(var(--muted))] hover:brightness-95',
          ].join(' ')}
        >
          {item.label}
          {item.count != null && (
            <>
              {/* The badge is decorative; screen readers get `countLabel` (or the bare number)
                  as visually hidden text, so the tab reads e.g. "Pendientes, 12 documentos". */}
              <span
                aria-hidden="true"
                className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-md border border-[hsl(var(--border-control))] px-1.5 text-xs font-medium leading-5 tabular-nums text-muted-foreground"
                data-testid={item.countTestId}
              >
                {item.count}
              </span>
              <span className="sr-only">{`, ${item.countLabel ?? item.count}`}</span>
            </>
          )}
        </button>
      ))}
    </div>
  );
}
