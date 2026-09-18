/**
 * ETP-5188 — shared no-op `extractQueryParamConditions` stub for
 * `vi.mock('@/lib/gridQuery', ...)`.
 *
 * The real `extractQueryParamConditions` (see `@/lib/gridQuery.js`) strips any
 * advanced-filter condition whose column declares `toQueryParams` and translates
 * it into a raw query-string segment; with no such column intercepting any row
 * (the case for every `ListView` test file that imports this stub), it hands the
 * `advancedFilter` back unchanged as `conditions`, with no `extraParams`.
 *
 * Import this into a file's `vi.mock('@/lib/gridQuery', ...)` factory instead of
 * repeating the same inline no-op — see `ListView.helpers.vitest.jsx` for a usage
 * example. (Flagged as a duplicated block by automated PR review before this
 * extraction.)
 */
export const noOpExtractQueryParamConditions = (advancedFilter) => ({
  conditions: advancedFilter,
  extraParams: null,
});
