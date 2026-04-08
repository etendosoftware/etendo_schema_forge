/**
 * Resolves a UI genericLabels string from the locale dictionary.
 * Pure function — no React dependency.
 *
 * @param {object|null} dictionary - The locale dictionary
 * @param {string} key - The genericLabels key to look up
 * @returns {string} The translated string, or the key itself if not found
 */
export function resolveUI(dictionary, key) {
  return dictionary?.genericLabels?.[key] ?? key;
}
