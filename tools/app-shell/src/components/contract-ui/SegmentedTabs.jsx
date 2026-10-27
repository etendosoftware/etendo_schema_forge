/**
 * Figma segmented control: a 40px muted group of 32px tabs, the active one raised on a card.
 * Shared by the list toolbar's subset tabs (ListView) and custom windows' top bars (ETP-5736).
 * Presentational only: the caller owns the active index and translates labels and `ariaLabel`.
 * Must not import lucide icons — custom-window tests mock `lucide-react` with a narrow icon set.
 *
 * @param {object} props
 * @param {Array<{key:string, label:string, testId:string}>} props.items
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
        </button>
      ))}
    </div>
  );
}
