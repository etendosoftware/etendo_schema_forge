/**
 * Parse a loosely-typed value (as found in AD/NEO API responses and CSV
 * import rows) into a strict boolean, or null when it can't be determined.
 *
 * Accepts real booleans, 1/0, and case-insensitive string forms
 * ('true'/'y'/'yes'/'1', 'false'/'n'/'no'/'0'). Anything else returns null.
 */
export function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }
  if (typeof value !== 'string') return null;

  const normalized = value.trim().toLowerCase();
  if (['true', 'y', 'yes', '1'].includes(normalized)) return true;
  if (['false', 'n', 'no', '0'].includes(normalized)) return false;
  return null;
}
