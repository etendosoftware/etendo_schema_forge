// Square checkbox — the standard app checkbox visual (matches EntityForm's
// renderCheckboxField / FinancialSection): a square `rounded-sm border` box with
// a checkmark polyline when checked. Presentational only — no i18n inside.
//
// Props:
//  - label:    node rendered next to the box
//  - checked:  boolean-ish on/off state
//  - onChange: (next: boolean) => void — receives the BOOLEAN, not the event
//  - disabled: optional; dims the box and label like EntityForm's `disabled:` classes and
//              never calls onChange (the native input is disabled, so it cannot toggle)
//  - ...rest:  forwarded onto the hidden <input> (data-testid, aria-label, …)
//
// The real <input> stays in the label (sr-only), so the label text is its accessible name and
// Space toggles it from the keyboard; it comes BEFORE the box so the box can show the
// keyboard-focus ring through `peer-focus-visible:`.
export function SquareCheckbox({ label, checked, onChange, disabled = false, ...rest }) {
  return (
    <label
      className={[
        'flex flex-row items-center gap-3 select-none',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
      ].join(' ')}
    >
      <input
        type="checkbox"
        checked={!!checked}
        disabled={disabled}
        onChange={e => { if (!disabled) onChange?.(e.target.checked); }}
        className="peer sr-only"
        {...rest}
      />
      <span
        className={[
          'h-4 w-4 shrink-0 rounded-sm border border-primary shadow',
          'flex items-center justify-center',
          'peer-focus-visible:outline-none peer-focus-visible:ring-1 peer-focus-visible:ring-ring',
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
    </label>
  );
}

export default SquareCheckbox;
