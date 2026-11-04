/**
 * Evaluate a secondary tab's generated `visibleWhen(record, ctx)` predicate
 * (decisions.json `visibleWhenLogic`). A tab without the predicate is always
 * visible; one that throws is hidden — a tab we cannot decide on must not show.
 *
 * Extracted into a plain .js module so Node's built-in test runner
 * (which does not understand JSX) can import it directly.
 */
export function evalTabVisible(tab, record, ctx) {
  if (typeof tab?.visibleWhen !== 'function') return true;
  try {
    return !!tab.visibleWhen(record ?? {}, ctx ?? {});
  } catch {
    return false;
  }
}
