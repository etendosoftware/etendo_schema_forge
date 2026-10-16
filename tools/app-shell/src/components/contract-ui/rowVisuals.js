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

/**
 * Figma Icon Button sm (32x32), Round, Tertiary, 20px icon, 200ms ease-in — the hover
 * action buttons of a row, shared by the list quick actions (`RowQuickActions`) and the
 * document-line action strip (`InlineLinesPanel`). No fill at rest (the white pill stays
 * off, `QUICK_ACTIONS_USE_PILL`). Size the icon inside with `h-5 w-5`.
 *
 * Neutral (edit, duplicate, email, kebab, extra line actions): #828FA3 icon in every
 * state, hover adds the #121217 @ 5% overlay; focus-visible paints a white fill with the
 * two-ring halo (2px white gap + 4px #121217).
 */
export const ROW_ACTION_BUTTON_NEUTRAL = 'h-8 w-8 p-0 flex items-center justify-center rounded-full transition-colors duration-200 ease-in focus-visible:outline-none focus-visible:bg-card text-[#828FA3] hover:bg-[rgba(18,18,23,0.05)] focus-visible:shadow-[0_0_0_2px_#FFFFFF,0_0_0_4px_#121217]';

/**
 * Destructive (delete): #D50B3E icon (`--status-destructive-fg`, pair it with
 * `IconicTrashIcon`), hover to the light destructive tint (`--status-destructive-bg`,
 * #FEF0F4) — never a solid red fill; focus-visible halo uses #F53D6B.
 */
export const ROW_ACTION_BUTTON_DESTRUCTIVE = 'h-8 w-8 p-0 flex items-center justify-center rounded-full transition-colors duration-200 ease-in focus-visible:outline-none focus-visible:bg-card text-[var(--status-destructive-fg)] hover:bg-[var(--status-destructive-bg)] focus-visible:shadow-[0_0_0_2px_#FFFFFF,0_0_0_4px_#F53D6B]';

/**
 * Active cue for a neutral row action whose state is "on" (the edit button of the line
 * being edited): the hover overlay, kept at rest.
 */
export const ROW_ACTION_BUTTON_ACTIVE = 'bg-[rgba(18,18,23,0.05)]';
