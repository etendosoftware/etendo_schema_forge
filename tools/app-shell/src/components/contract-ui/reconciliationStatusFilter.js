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

/**
 * Filter codes, in dropdown order. Also the fine-grained states a line can carry.
 *
 * ETP-5581 added two: `bounce` (a line of a possible bounce pair, which the backend only reports
 * with the `bank-bounce-suggestions` flag on) and `discarded` (last). A discarded line is NOT in the
 * default `pendingLines` answer at all — the backend leaves it out of `lines`, `total` and every
 * count but `counts.discarded` — so "Todos" and the footer total exclude it by construction; the
 * `discarded` entry is served by its own `status=discarded` request. Which of the two the dropdown
 * actually offers is {@link visibleStatusCodes}.
 */
export const STATUS_CODES = ['pending', 'suggested', 'byRule', 'difference', 'bounce', 'reconciled', 'discarded'];

/**
 * Which line states each filter code shows.
 *
 * `pending` is the superset — "not reconciled" — rather than an enumeration of subtypes for its own
 * sake: a state added by the backend later should join it by default, which is why an unknown state
 * is NOT silently swallowed here (see `matchesStatus`).
 */
export const STATUS_MEMBERS = {
  // A possible bounce still needs the user to act (discard the pair, or say it is not one), so it
  // is a kind of pending too, exactly like a suggestion.
  pending: ['pending', 'suggested', 'byRule', 'difference', 'bounce'],
  suggested: ['suggested'],
  byRule: ['byRule'],
  difference: ['difference'],
  bounce: ['bounce'],
  reconciled: ['reconciled'],
  discarded: ['discarded'],
};

/**
 * The filter codes the dropdown offers for these counts.
 *
 * The two ETP-5581 codes only appear when the backend reports them, so an account without the
 * `bank-bounce-suggestions` flag and without discarded lines sees exactly the five entries it had
 * before:
 * - `bounce` when `counts.bounce` is present (the backend sends it only with the flag on);
 * - `discarded` when there is a discarded line (`counts.discarded > 0`, which the backend sends
 *   whatever the flag: Classic can discard lines too) or the flag is on.
 * The active code is always kept, so the trigger never names an entry the list no longer has.
 *
 * @param {Record<string, number>|null|undefined} counts per-state counts from `pendingLines`
 * @param {string|null|undefined} active the active filter code
 * @returns {string[]}
 */
export function visibleStatusCodes(counts, active) {
  const bounceOn = counts?.bounce != null;
  return STATUS_CODES.filter((code) => {
    if (code === active) return true;
    if (code === 'bounce') return bounceOn;
    if (code === 'discarded') return bounceOn || (Number(counts?.discarded) || 0) > 0;
    return true;
  });
}

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
