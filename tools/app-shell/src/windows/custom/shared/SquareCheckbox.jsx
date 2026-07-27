// Square checkbox — the standard app checkbox visual (matches EntityForm's
// renderCheckboxField / FinancialSection): a square `rounded-sm border` box with
// a checkmark polyline when checked. Presentational only — no i18n inside.
//
// Props:
//  - label:    node rendered next to the box
//  - checked:  boolean-ish on/off state
//  - onChange: (next: boolean) => void — receives the BOOLEAN, not the event
//  - ...rest:  forwarded onto the hidden <input> (data-testid, aria-label, …)
export function SquareCheckbox({ label, checked, onChange, ...rest }) {
  return (
    <label className="flex flex-row items-center gap-3 cursor-pointer select-none">
      <span
        className={[
          'h-4 w-4 shrink-0 rounded-sm border border-primary shadow',
          'flex items-center justify-center',
          checked ? 'bg-primary text-primary-foreground' : 'bg-transparent',
        ].join(' ')}
      >
        {checked && (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </span>
      <span className="text-sm font-medium text-[hsl(var(--foreground))]">{label}</span>
      <input
        type="checkbox"
        checked={!!checked}
        onChange={e => onChange(e.target.checked)}
        className="sr-only"
        {...rest}
      />
    </label>
  );
}

export default SquareCheckbox;
