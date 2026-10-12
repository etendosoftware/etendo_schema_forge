/**
 * Whether an OCR extraction payload carries any usable data.
 *
 * A blank or unreadable PDF makes the tool answer with valid JSON whose every
 * field is null/empty. That parses fine, so it must be rejected here — otherwise
 * the review modal opens completely empty with no hint that extraction failed.
 *
 * Data exists when ANY header field value (walked from the docType's
 * `headerFields[].extractFrom`, a string or an array of keys) is non-empty, or
 * `line_items` is a non-empty array. Driven by the docType config: no
 * window-specific keys live here.
 *
 * @param {{ headerFields?: Array<{ extractFrom?: string | string[] }> } | null} docType
 * @param {object | null} payload
 * @returns {boolean}
 */
export function hasExtractedData(docType, payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (Array.isArray(payload.line_items) && payload.line_items.length > 0) return true;

  const keys = (docType?.headerFields || []).flatMap(field => {
    if (Array.isArray(field.extractFrom)) return field.extractFrom;
    return field.extractFrom ? [field.extractFrom] : [];
  });
  return keys.some(key => isFilled(payload[key]));
}

function isFilled(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  return true;
}
