// Standard fiscal-models / SIF checkbox — a hand-rolled `<button role="checkbox">`
// instead of the shared `@/components/ui/checkbox` `Checkbox`.
//
// Why this exists instead of reusing `Checkbox`: `Checkbox`'s checked+disabled
// state collapses both the box background AND the checkmark color to
// `bg-muted text-text-disabled` — on the light theme that renders as a
// near-white checkmark on a near-white box, so a disabled checked field
// (e.g. "rectificativa" on a completed declaration) LOOKS unchecked even
// though the underlying value is `true`. This component avoids that failure
// mode by dimming the whole control via `disabled:opacity-50` instead of
// swapping colors, so the checkmark stays visible at any disabled state.
//
// Originally implemented inline in SifTab.jsx (Sales Invoice SIF tab, the
// only place that didn't have the bug) and extracted here so fiscal-models
// (Modelo 303 / Modelo 349) can reuse the SAME implementation instead of a
// second copy. See docs/generated-custom-windows/fiscal-models.md.
//
// Deliberately a bare <button> — no wrapping layout div. Callers that need a
// fixed-height slot to line up with adjacent `<Input>`/`<Select>` fields (see
// SifTab.jsx's `<Field>` rows) wrap it themselves with e.g.
// `<div className="h-10 flex items-center">`; callers embedding it inline in
// a `<label>` or table cell (fiscal-models) use it as-is.
//
// Props:
//  - id:       optional, forwarded to the button (for <label htmlFor>)
//  - checked:  boolean-ish on/off state
//  - disabled: boolean
//  - onToggle: (next: boolean) => void — called with the NEW boolean value
//  - onClick:  optional extra onClick (e.g. to stopPropagation in a table row)
//  - ...rest:  forwarded onto the <button> (data-testid, aria-label, …)
export function CheckboxField({ id, checked, disabled, onToggle, onClick, className, ...rest }) {
  return (
    <button
      type="button"
      role="checkbox"
      id={id}
      aria-checked={checked}
      disabled={disabled}
      onClick={e => {
        onClick?.(e);
        if (!disabled) onToggle?.(!checked);
      }}
      className={[
        'h-5 w-5 shrink-0 rounded-sm border border-[hsl(var(--border-control))] shadow-[0px_1px_2px_hsl(var(--foreground) / 0.05)]',
        'flex items-center justify-center transition-colors',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-primary text-primary-foreground border-primary' : 'bg-transparent',
        className,
      ].filter(Boolean).join(' ')}
      {...rest}
    >
      {checked && (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </button>
  );
}

export default CheckboxField;
