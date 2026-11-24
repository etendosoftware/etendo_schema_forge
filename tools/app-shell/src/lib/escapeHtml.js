/**
 * HTML text/attribute-value encoder (ETP-4561). For interpolating UNTRUSTED text into an
 * HTML string that is later parsed (iframe document.write, window.open preview). It is
 * not for URLs, CSS or JavaScript contexts; use the dedicated policy for each.
 *
 * @param {unknown} value the raw value; null/undefined become ''.
 * @returns {string} the value with & < > " ' escaped.
 */
export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
