import { classifyImportError } from '@etendosoftware/app-shell-core/lib/import/importEngine.js';

/**
 * Shared pieces of the "resolve or auto-create a category" path, used by both import
 * descriptors that have one (product → product category, contacts → business partner
 * category).
 *
 * ## Why this module exists
 *
 * ETP-5227 was one bug reported twice, because `contactsImportDescriptor` had been copied
 * from `productImportDescriptor` — `?limit=1000` and all. Fixing it by editing both copies
 * reproduced the very condition that caused it: Sonar measured 50% duplicated lines in each
 * descriptor on the new code. The second copy is not a shortcut, it is the defect.
 *
 * Only the genuinely shared logic lives here. What differs between the two windows — the NEO
 * endpoint, the cache Map, the resolution-cache key — stays in each descriptor, passed in.
 */

/**
 * Memoize a category list per token, and DROP the entry if the read fails.
 *
 * The caching is what stops concurrent rows firing the same request; the eviction is the ETP-5227
 * fix. The previous code cached whatever came back, and the old fetch swallowed every failure
 * into `[]` — so one bad response became the session's permanent answer: every later row, and
 * every retry for as long as the tab stayed open, resolved against an empty catalogue without
 * ever calling the server again. That is why the reported error "persisted on retry". Evicting a
 * rejection is what makes a retry an actual retry.
 *
 * The identity check before deleting matters: by the time a rejection lands, another run may
 * already have stored a fresh promise under the same key, and deleting that one would discard a
 * good result and stampede the server.
 *
 * @param {Map<string, Promise<Array<object>>>} cache Module-level cache owned by the descriptor.
 * @param {string|undefined} token
 * @param {() => Promise<Array<object>>} fetcher Reads the list for real. Called only on a miss.
 * @returns {Promise<Array<object>>}
 */
export function getCachedCategories(cache, token, fetcher) {
  const key = token || 'default';
  if (!cache.has(key)) {
    const pending = fetcher().catch((error) => {
      if (cache.get(key) === pending) cache.delete(key);
      throw error;
    });
    cache.set(key, pending);
  }
  return cache.get(key);
}

/**
 * Row-level message for a category list that could not be READ, in the session language.
 *
 * Distinct from "the category does not exist": the old code could not tell those apart, since a
 * failed read arrived as an empty list, and the import went on to auto-create a category that
 * was already there.
 */
export function categoryLookupFailedMessage(cell, config) {
  const category = String(cell ?? '').trim();
  return typeof config.translate === 'function'
    ? config.translate('importErrorCategoryLookupFailed', { category })
    : `The categories could not be read, so "${category}" could not be assigned. Try the import again.`;
}

/**
 * Row-level Error for a category that could not be CREATED, in the session language.
 *
 * The backend's own text ("There is already a Product Category with the same (Client,
 * Organization, Search Key)…") used to be rethrown verbatim — the English, unactionable string
 * the ticket reports. `classifyImportError` already maps that shape to a translatable kind for
 * the send path; routing the descriptor's own failure through it keeps one vocabulary for both.
 *
 * The raw backend text is preserved on `error.raw` for the system-error report, never shown as
 * the row's message.
 */
export function categoryCreateFailedError(rawMessage, cell, config) {
  const category = String(cell ?? '').trim();
  const translate = typeof config.translate === 'function' ? config.translate : null;
  const { key, params } = classifyImportError(rawMessage);
  const classified = translate ? translate(key, params) : null;
  const message = classified && classified !== key
    ? `${classified} (${category})`
    : (translate?.('importErrorCategoryUnresolved', { category })
      ?? `The category "${category}" could not be resolved or created.`);
  const error = new Error(message);
  error.raw = rawMessage;
  return error;
}
