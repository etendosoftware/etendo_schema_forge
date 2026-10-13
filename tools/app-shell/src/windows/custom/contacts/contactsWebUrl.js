/**
 * The contact website (`etgoWeb`) is stored WITHOUT its scheme: the form shows a fixed
 * "https://" chip (decisions.json `inputPrefix`) and BusinessPartnerHandler's domain-shape
 * check rejects a value that still carries one. These two helpers are the only places that
 * translate between that bare form and what a user types or a browser needs.
 */

/** Drops a leading `http://` / `https://` (any case). Null-safe: returns `''`. */
export function stripUrlScheme(value) {
  return String(value ?? '').replace(/^https?:\/\//i, '');
}

/**
 * An absolute URL for a stored website, safe to put in an `href`: the value is always
 * re-prefixed with `https://`, so whatever it contains can only ever be an https
 * navigation (never a `javascript:` or `data:` link). `null` for an empty value.
 */
export function toWebsiteHref(value) {
  const bare = stripUrlScheme(String(value ?? '').trim());
  return bare ? `https://${bare}` : null;
}
