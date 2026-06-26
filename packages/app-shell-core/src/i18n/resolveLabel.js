/**
 * Resolves a field label from the locale dictionary.
 * Pure function — no React dependency, safe for direct testing.
 *
 * Resolution chain (highest priority first):
 *   1. langOverrides[columnName]            — per-window label override from decisions.json
 *   2. windowSlice[columnName]              — per-window sliced label (ETP-4300), active locale
 *   3. dictionary.fields[columnName].label  — Etendo AD translation (monolith; removed in Phase 3)
 *   4. null (caller falls back to rawLabel)
 *
 * `windowSlice` is the active-locale label map of the current window's generated
 * `labels.js` slice (i.e. `labels[locale]`). It is optional: when absent (no
 * WindowLabelsProvider mounted), resolution falls through to the monolith exactly
 * as before — this keeps the change backward-compatible during the rollout.
 *
 * @param {object|null} dictionary - The locale dictionary
 * @param {string} columnName - The column name to look up
 * @param {object|null} langOverrides - Optional per-column overrides for the current locale
 * @param {object|null} [windowSlice] - Optional active-locale per-window label slice
 * @returns {string|null} The label, or null if not found
 */
export function resolveLabel(dictionary, columnName, langOverrides, windowSlice) {
  return (
    langOverrides?.[columnName]
    ?? windowSlice?.[columnName]
    ?? dictionary?.fields?.[columnName]?.label
    ?? null
  );
}
