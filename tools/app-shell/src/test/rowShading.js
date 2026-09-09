/**
 * ETP-5030 — shared assertion helpers for the "selected row is shaded" regression
 * suites of the hand-written tables (the ones that bypass InlineLinesPanel /
 * DataTable and therefore did not inherit the shared fix).
 *
 * Two mechanisms are covered by the suites that use this module:
 *
 *  - Group A (Tailwind utility on the row element): the selected row carries
 *    `bg-primary/5` plus, where the row has any hover background at all, the
 *    matching `hover:bg-primary/5`. These helpers read the row's real class
 *    list, so a missing `hover:` variant is a hard failure.
 *
 *  - Group B (CSS rule, `fm-row--selected`): those tables paint their
 *    backgrounds on the `td`, not the `tr`, so a row-level utility would have
 *    been covered by `tr:hover td`. Asserting the class is a PROXY for the
 *    hook-up only — jsdom does not apply stylesheets, so no test in this repo
 *    can verify the rendered colour or the CSS specificity that makes the tint
 *    survive hover. Those suites say so explicitly at their assertions.
 *
 * `countBackgroundUtilities` exists because the whole ticket is about a row
 * carrying TWO competing background utilities: Tailwind resolves them by
 * stylesheet order, not by the order they appear in the attribute, so "the last
 * class wins" is false and the row can render unshaded while still carrying the
 * selected class. Any collision case (selected + highlighted, selected +
 * current, selected + open) must therefore assert exactly one.
 */

/** The element's classes as an array, tolerant of a missing/empty attribute. */
export function classesOf(element) {
  return String(element?.getAttribute?.('class') ?? '').split(/\s+/).filter(Boolean);
}

/** Resting-state background utilities (`bg-*`), excluding the `hover:` variants. */
export function backgroundUtilities(element) {
  return classesOf(element).filter((c) => c.startsWith('bg-'));
}

/** Hover-state background utilities (`hover:bg-*`). */
export function hoverBackgroundUtilities(element) {
  return classesOf(element).filter((c) => c.startsWith('hover:bg-'));
}

/** How many resting-state background utilities the element carries. */
export function countBackgroundUtilities(element) {
  return backgroundUtilities(element).length;
}
