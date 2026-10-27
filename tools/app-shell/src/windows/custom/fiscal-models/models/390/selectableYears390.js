// Modelo 390 — the exercises "Nueva declaración" offers (ETP-5716), bound to the model through
// `modelRegistry.js` (`selectableYears`). Plain `.js`, no imports (loaded by the leaf registry).
//
// Unlike the 303/349 (current filing year only, `SELECTABLE_YEARS` of fm303Layouts.js), the annual
// summary of the previous exercise is filed in January of the next one, so 2025 must still be
// creatable in 2026. 2025 is the exact AEAT390_2025 design (no layout fallback); 2026 is computed
// with the same classic tax report until a DR390e2026 is published.

const SELECTABLE_YEARS_390 = Object.freeze([2026, 2025]);

/** Registry hook (`selectableYears`): the exercises to offer, most recent first. */
export function selectableYears390() {
  return SELECTABLE_YEARS_390;
}
