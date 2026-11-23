function pickFirst(...values) {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
      continue;
    }
    if (value != null && value !== '') return String(value);
  }
  return '';
}

export function buildLocationAddressLines(location, fallbackSummary = null) {
  const addressLine1 = pickFirst(location?.address, location?.addressLine1);
  const addressLine2 = pickFirst(location?.address2, location?.addressLine2);
  const postalCode = pickFirst(location?.postalCode);
  const city = pickFirst(location?.city, location?.cityName);
  const region = pickFirst(location?.['region$_identifier'], location?.regionLabel, location?.region);
  const country = pickFirst(location?.['country$_identifier'], location?.countryLabel, location?.country);

  const localityLine = [postalCode, city].filter(Boolean).join(' ');
  const regionCountryLine = [region, country].filter(Boolean).join(', ');

  const lines = [addressLine1, addressLine2, localityLine, regionCountryLine].filter(Boolean);
  if (lines.length > 0) return lines;

  const fallbackLine = pickFirst(fallbackSummary, location?.name, location?._identifier);
  return fallbackLine ? [fallbackLine] : [];
}

/**
 * Cleans a dash-joined identifier string (e.g. the server's generic `<field>$_identifier`,
 * built by concatenating every address segment with `separator` even when a segment is
 * blank) by dropping empty segments, so a double/dangling separator never reaches the UI.
 *
 * CP-8b (ETP-5806 QA): `info?.['locationAddress$_identifier']` arrives as something like
 * "Calle de Alcalá, 40 - - 28014 - Madrid - - España" when the optional segunda línea/región
 * segments are blank — rendered verbatim by OrganizationPage/EntityForm's LocationModalField
 * call sites. Same filter(Boolean) pattern as `buildLocationAddressLines` above, applied to a
 * single pre-joined string instead of a structured location object.
 *
 * Splits on the separator-RUN, not the literal separator string: a run of N consecutive blank
 * segments leaves behind N+1 repetitions of the `-` token glued together (e.g. two blanks →
 * `" - - - "`), and splitting on the literal 3-char `" - "` under-counts those matches because
 * consecutive tokens share boundary characters — `"Nave 3 - - Getafe".split(" - ")` finds only
 * one match and returns `["Nave 3", "- Getafe"]`, leaving a stray `"-"` untouched. Matching
 * `(?: -)+ ` (one-or-more `" -"` tokens plus a trailing space) collapses the whole run — of any
 * length, including the single-separator case — in one match. Mirrors the Java-side fix in
 * `McpResponseSanitizer.sanitizeDashJoinedIdentifier`.
 */
export function sanitizeDashJoinedIdentifier(raw, separator = ' - ') {
  if (typeof raw !== 'string') return raw ?? '';
  return raw
    .split(/(?: -)+ /)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join(separator);
}
