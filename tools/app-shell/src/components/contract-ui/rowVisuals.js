/**
 * ETP-5600 — the shared row visuals of the Figma "Fila" components, used by both
 * row renderers: DataTable (list and classic tab grids, `<tr>` rows) and
 * InlineLinesPanel (document lines, flex `<div>` rows).
 *
 * Every value is a complete static class string so Tailwind's JIT finds it in this
 * file (`./src/**` is in the content globs). Never build one by concatenation.
 */

/** Figma Shadows/lg, applied on hover to a lifted row. */
export const ROW_LIFT_SHADOW = 'hover:shadow-[0_4px_6px_-2px_rgba(18,18,23,0.05),0_10px_15px_-3px_rgba(18,18,23,0.08)]';

/** The same Shadows/lg, unconditionally — for a row that stays lifted (a line being edited). */
export const ROW_LIFT_SHADOW_STATIC = 'shadow-[0_4px_6px_-2px_rgba(18,18,23,0.05),0_10px_15px_-3px_rgba(18,18,23,0.08)]';

/**
 * The 1px line a lifted TABLE row redraws on its own cells. In a collapsed-border
 * table the lifted row paints over the previous row's `border-b`; an inset top
 * shadow on each `<td>` sits above every cell background and puts it back.
 * Table rows only — a flex row does not overlap its neighbour's border.
 */
export const ROW_LIFT_TOP_SEPARATOR = '[&:hover>td]:shadow-[inset_0_1px_0_hsl(var(--border-subtle))]';

/**
 * Figma "Fila / Selected": #F5F7F9 (`--field-hover`, the exact design value). Hover
 * keeps it (selection wins over hover), and `--row-hover-bg` lets DataTable's
 * quick-actions fade end on it.
 */
export const ROW_CHECKED_BG = 'bg-[hsl(var(--field-hover))] hover:bg-[hsl(var(--field-hover))] [--row-hover-bg:hsl(var(--field-hover))]';
