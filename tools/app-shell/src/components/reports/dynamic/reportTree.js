/**
 * ETP-6080 — folding the account tree on screen. `/query` returns every level, in tree order,
 * each row carrying `parentId` (its nearest listed ancestor); the view decides what shows.
 * Same rule as the exports' `expandedNodeIds` (core `buildRenderAccountTree`): a row shows when
 * every ancestor is expanded.
 */

/**
 * The exports' `expandedNodeIds`: the open rows comma-joined, or core's `NO_EXPANDED_NODES` ('none')
 * when nothing is open. Never '': core reads a blank value as "not sent" (the old viewer sends ''
 * for every parameter) and would print the level cutoff instead of the folded tree.
 */
export const expandedNodeIdsParam = (expanded) => (expanded.size ? [...expanded].join(',') : 'none');

// Same ranks as core ELEMENT_LEVEL_RANK: Heading < Account < Breakdown < Subaccount.
const LEVEL_RANK = { E: 1, C: 2, D: 3, S: 4 };

/** node_id → true for every row that has children. */
export function parentIds(rows) {
  const ids = new Set();
  for (const r of rows || []) if (r.parentId != null) ids.add(r.parentId);
  return ids;
}

/**
 * The expansion that shows the tree down to `level` (E/C/D/S): every parent above that level is
 * expanded. A row with an unknown level is expanded, so it never hides its children.
 */
export function expansionForLevel(rows, level) {
  const cutoff = LEVEL_RANK[level] ?? LEVEL_RANK.S;
  const parents = parentIds(rows);
  const expanded = new Set();
  for (const r of rows || []) {
    const rank = LEVEL_RANK[r.elementlevel];
    if (parents.has(r.node_id) && (rank === undefined || rank < cutoff)) expanded.add(r.node_id);
  }
  return expanded;
}

/** Every parent expanded. */
export function expandAll(rows) {
  return parentIds(rows);
}

/**
 * The expansion of a fold: its `base` ('level' = down to `level`, 'all', 'none') with the rows the
 * user flipped since. Recomputed for every result, so a row that first appears after a filter
 * change follows the base instead of showing folded.
 */
export function foldExpansion(rows, { base, flipped }, level) {
  const parents = parentIds(rows);
  const expanded = base === 'all' ? parents : base === 'none' ? new Set() : expansionForLevel(rows, level);
  const out = new Set(expanded);
  for (const id of flipped) {
    if (!parents.has(id)) continue;
    if (out.has(id)) out.delete(id); else out.add(id);
  }
  return out;
}

/** The rows to show, in order, each with `depth` (0 = top) and `hasChildren`. */
export function visibleRows(rows, expanded) {
  const parents = parentIds(rows);
  const shown = new Map(); // node_id → depth, for rows that are listed
  const out = [];
  for (const r of rows || []) {
    let depth = 0;
    if (r.parentId != null) {
      if (!shown.has(r.parentId) || !expanded.has(r.parentId)) continue;
      depth = shown.get(r.parentId) + 1;
    }
    shown.set(r.node_id, depth);
    out.push({ ...r, depth, hasChildren: parents.has(r.node_id) });
  }
  return out;
}

/**
 * A leaf account row can be split by a dimension: it has its own postings. A formula row has
 * none, and a summary row would need the tree walk the split query does not do (plan F8).
 */
export function canSplit(row) {
  return !row.hasChildren && !row.isFormula;
}
