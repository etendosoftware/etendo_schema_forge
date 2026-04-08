/**
 * Resolves a field label from the locale dictionary.
 * Pure function — no React dependency, safe for direct testing.
 *
 * Resolution chain:
 *   1. langOverrides[columnName]  — per-window label override from decisions.json
 *   2. dictionary.fields[columnName].label  — Etendo AD translation
 *   3. null (caller falls back to rawLabel)
 *
 * @param {object|null} dictionary - The locale dictionary
 * @param {string} columnName - The column name to look up
 * @param {object|null} langOverrides - Optional per-column overrides for the current locale
 * @returns {string|null} The label, or null if not found
 */
export function resolveLabel(dictionary, columnName, langOverrides) {
  return langOverrides?.[columnName] ?? dictionary?.fields?.[columnName]?.label ?? null;
}
