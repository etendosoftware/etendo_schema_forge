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

/** node_id → true for every row that has a dimension row (ETP-6084 grouping) among its children. */
function dimensionParentIds(rows) {
  const ids = new Set();
  for (const r of rows || []) if (r.isDimension && r.parentId != null) ids.add(r.parentId);
  return ids;
}

/**
 * ETP-6084 D6: parents AT the cutoff level that hold nested nodes of that same level (a chart where a
 * heading sits inside a heading, an account inside an account). The chosen level shows them all.
 */
function nestedAtCutoff(rows, cutoff) {
  const byId = new Map((rows || []).map((r) => [r.node_id, r]));
  const ids = new Set();
  for (const r of rows || []) {
    if (r.isDimension || LEVEL_RANK[r.elementlevel] !== cutoff) continue;
    const parent = byId.get(r.parentId);
    if (parent && LEVEL_RANK[parent.elementlevel] === cutoff) ids.add(parent.node_id);
  }
  return ids;
}

/**
 * The expansion that shows the tree down to `level` (E/C/D/S): every parent above that level is
 * expanded. A row with an unknown level is expanded, so it never hides its children. A parent whose
 * children are dimension rows (the account grouped by contact, ...) is expanded too. With `nested`
 * (a mixed-level chart tree), a parent at the level that holds nodes of that same level is expanded as well.
 */
export function expansionForLevel(rows, level, { nested = false } = {}) {
  const cutoff = LEVEL_RANK[level] ?? LEVEL_RANK.S;
  const parents = parentIds(rows);
  const dimensionParents = dimensionParentIds(rows);
  const sameLevel = nested ? nestedAtCutoff(rows, cutoff) : new Set();
  const expanded = new Set();
  for (const r of rows || []) {
    const rank = LEVEL_RANK[r.elementlevel];
    if (!parents.has(r.node_id)) continue;
    if (rank === undefined || rank < cutoff || sameLevel.has(r.node_id) || dimensionParents.has(r.node_id)) expanded.add(r.node_id);
  }
  return expanded;
}

/**
 * ETP-6084 D6: with `nested`, the rows the level fold hides although their parent is open: the deeper
 * children of a same-level parent that is open only to show its same-level nodes. Empty otherwise.
 * shortcut: the exports' `expandedNodeIds` cannot say it, so a PDF/Excel prints those children; needs a core `hiddenNodeIds`.
 */
export function levelHiddenIds(rows, level) {
  const cutoff = LEVEL_RANK[level] ?? LEVEL_RANK.S;
  const parents = nestedAtCutoff(rows, cutoff);
  const hidden = new Set();
  for (const r of rows || []) {
    const rank = LEVEL_RANK[r.elementlevel];
    if (!r.isDimension && parents.has(r.parentId) && rank !== undefined && rank > cutoff) hidden.add(r.node_id);
  }
  return hidden;
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
function baseExpansion(rows, parents, base, level, opts) {
  if (base === 'all') return parents;
  if (base === 'none') return [];
  return expansionForLevel(rows, level, opts);
}

export function foldExpansion(rows, { base, flipped }, level, opts) {
  const parents = parentIds(rows);
  const out = new Set(baseExpansion(rows, parents, base, level, opts));
  for (const id of flipped) {
    if (!parents.has(id)) continue;
    if (out.has(id)) out.delete(id); else out.add(id);
  }
  return out;
}

/** The rows to show, in order, each with `depth` (0 = top), `hasChildren` and `hasDimensionChildren`. `hidden` (levelHiddenIds) rows are skipped. */
export function visibleRows(rows, expanded, hidden = null) {
  const parents = parentIds(rows);
  const dimensionParents = dimensionParentIds(rows);
  const shown = new Map(); // node_id → depth, for rows that are listed
  const out = [];
  for (const r of rows || []) {
    let depth = 0;
    if (hidden?.has(r.node_id)) continue;
    if (r.parentId != null) {
      if (!shown.has(r.parentId) || !expanded.has(r.parentId)) continue;
      depth = shown.get(r.parentId) + 1;
    }
    shown.set(r.node_id, depth);
    out.push({ ...r, depth, hasChildren: parents.has(r.node_id), hasDimensionChildren: dimensionParents.has(r.node_id) });
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
