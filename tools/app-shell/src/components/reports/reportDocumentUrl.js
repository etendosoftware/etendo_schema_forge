/**
 * The URL of a document a report row points at, opened in a new tab by the report viewer's
 * `navigate-invoice` message and by the dynamic view's drill-down (ETP-6080 F9).
 *
 * `docWindow` and the optional deep-link query come from the report's own SQL (`doc_window`,
 * `doc_query_key`, `doc_query_value`), never from here: this is shared by every report. A
 * financial-account transaction has no window of its own, so it opens its parent account with
 * `?txn=<id>`. Key and value travel separately and the `=` is joined here, not in the SQL:
 * `applyPlaceholders` rewrites `= '...'` into an `IN (...)` list, and a literal `=` next to a quote
 * in the query was swallowed by that rewrite (ETP-5013 follow-up).
 */
export function reportDocumentUrl({ docWindow, recordId, docQueryKey, docQueryValue }, location = window.location) {
  const basePath = location.pathname.replace(/\/[^/]*$/, '');
  const query = docQueryKey && docQueryValue
    ? `?${encodeURIComponent(docQueryKey)}=${encodeURIComponent(docQueryValue)}`
    : '';
  return `${location.origin}${basePath}/${docWindow}/${recordId}${query}`;
}
