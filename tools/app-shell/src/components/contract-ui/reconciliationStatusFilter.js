/**
 * Pure membership logic for the bank reconciliation left-panel status filter.
 *
 * Kept in a plain `.js` module, separate from the panel `.jsx`, so the node:test runner can import
 * it — that runner cannot load `.jsx`. Same arrangement as `reconciliationDifferenceMath.js`.
 *
 * The backend (`AutoMatchSupport.classifyPendingLine`) puts exactly ONE `state` on every line, and
 * the dropdown is single-select, so the panel used to filter with strict equality. But the states
 * are not five peers: `suggested`, `byRule` and `difference` are all *kinds of pending* — a line in
 * any of them still needs the user to act. Filtering by equality therefore hid them behind their own
 * entries, and since `pending` is the DEFAULT filter, opening the panel showed only the unclassified
 * leftovers (ETP-5033).
 *
 * So the filter codes and the line states share a vocabulary but are not the same thing: a code maps
 * to the SET of states it covers. `pending` covers everything not reconciled; the rest stay strict
 * subsets of it. The per-line badge keeps showing the fine-grained state, which is what tells the
 * subtypes apart inside the list.
 */

/** Filter codes, in dropdown order. Also the fine-grained states a line can carry. */
export const STATUS_CODES = ['pending', 'suggested', 'byRule', 'difference', 'reconciled'];

/**
 * Which line states each filter code shows.
 *
 * `pending` is the superset — "not reconciled" — rather than an enumeration of subtypes for its own
 * sake: a state added by the backend later should join it by default, which is why an unknown state
 * is NOT silently swallowed here (see `matchesStatus`).
 */
export const STATUS_MEMBERS = {
  pending: ['pending', 'suggested', 'byRule', 'difference'],
  suggested: ['suggested'],
  byRule: ['byRule'],
  difference: ['difference'],
  reconciled: ['reconciled'],
};

/** A line with no `state` yet (older payload, optimistic row) reads as plain pending. */
function lineState(state) {
  return state || 'pending';
}

/**
 * Whether a line of the given `state` belongs under the active filter.
 *
 * @param {string|null|undefined} state the line's fine-grained state
 * @param {string|null|undefined} filter the active filter code; falsy is the "Todos" entry
 * @returns {boolean}
 */
export function matchesStatus(state, filter) {
  if (!filter) return true;
  const members = STATUS_MEMBERS[filter];
  // No members for this code → it is not one of ours (a future backend state surfaced straight into
  // the dropdown, say). Comparing by equality keeps such a filter working like it did before.
  if (!members) return lineState(state) === filter;
  return members.includes(lineState(state));
}

/**
 * The count to show next to a filter code, summed over the states it covers.
 *
 * The backend's `counts` are per-STATE (one bucket each), so reading `counts.pending` directly would
 * label the superset entry with the unclassified-only figure — a number smaller than the rows it
 * then shows.
 *
 * @param {Record<string, number>|null|undefined} counts per-state counts from `pendingLines`
 * @param {string} code a filter code, or any raw counts key (`'all'`)
 * @returns {number}
 */
export function countForStatus(counts, code) {
  const members = STATUS_MEMBERS[code];
  if (!members) return Number(counts?.[code]) || 0;
  return members.reduce((sum, state) => sum + (Number(counts?.[state]) || 0), 0);
}
