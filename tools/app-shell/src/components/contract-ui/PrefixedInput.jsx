/**
 * PrefixedInput — a fixed, non-editable chip rendered immediately before an input
 * (e.g. "https://" for a website field whose stored value is only the part after the
 * scheme). Purely a visual wrapper: it never touches the input's value, it just lays
 * out `prefix` + `children` (the already-built input element) in the same flex row.
 *
 * Shared by:
 *   - `EntityForm.jsx`'s `renderInputField` — for any generic window field declaring
 *     `inputPrefix` in decisions.json (ETP-4749, e.g. Contacts' "Página web").
 *   - `OrganizationPage.jsx`'s "Sitio web" field — a hand-built `layoutType: "custom"`
 *     page that never goes through decisions.json/generate-frontend.js for its render,
 *     but wants the exact same chip UI (not a parallel, hand-copied implementation).
 *
 * When `prefix` is falsy, renders `children` unwrapped — callers can use this
 * unconditionally without an `if (hasPrefix)` branch of their own for the JSX shape.
 * The caller is still responsible for adding `border-0` to the wrapped input's own
 * className (the wrapper draws the border instead) — that decision naturally lives
 * next to whatever other className logic the caller already has for that input.
 *
 * Focus ring (QA review round): the wrapped `<Input>` keeps its own `rounded-lg` +
 * `focus-visible:ring-2` from the base component. Confirmed via getComputedStyle that
 * on focus it drew its OWN box-shadow ring at its OWN (larger) border-radius, sitting
 * inside this wrapper's (smaller) `rounded-md` border — visually a second rounded
 * outline floating in the middle of the control instead of the whole chip+input
 * looking like one highlighted piece. Fix: the wrapper itself takes the focus ring
 * (`focus-within:ring-2`, keyed off any focusable descendant), and callers strip the
 * input's own ring/radius (`rounded-none focus-visible:ring-0 focus-visible:outline-none`)
 * so highlighting is exclusively the wrapper's responsibility.
 *
 * Props:
 *   prefix   — the chip text (string) or falsy to skip wrapping entirely
 *   children — the input element (any controlled text input) — should also carry
 *              `rounded-none focus-visible:ring-0 focus-visible:outline-none` in its
 *              own className so it doesn't draw a second ring on top of this one
 *   testId   — data-testid for the wrapper div (caller picks its own convention)
 */
export default function PrefixedInput({ prefix, children, testId }) {
  if (!prefix) return children;
  return (
    <div
      className="flex overflow-hidden rounded-md border border-input bg-card focus-within:ring-2 focus-within:ring-focus-ring"
      data-testid={testId}>
      <span className="flex items-center px-3 text-sm text-muted-foreground border-r border-input bg-muted">
        {prefix}
      </span>
      {children}
    </div>
  );
}
