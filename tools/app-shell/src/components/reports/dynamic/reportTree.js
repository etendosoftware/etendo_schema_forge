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
export function expansionForLevel(rows, level, { nested = false, maxIndent = null } = {}) {
  if (maxIndent != null) return expansionForIndent(rows, maxIndent);
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
 * ETP-6083: a fold option that cuts by the indent of the LISTED rows (`maxIndent` on an `accountLevel` option: the Balance's
 * Grupo = 0, Epígrafe = 1) instead of by the E/C/D/S rank. A parent shows its children while its own indent is below the
 * cutoff, so no row deeper than `maxIndent` shows. Report-agnostic: the indent is the row's place in the answer, so a
 * chart of another shape just cuts where its rows are. A parent whose children are dimension rows stays open.
 */
function expansionForIndent(rows, maxIndent) {
  const parents = parentIds(rows);
  const dimensionParents = dimensionParentIds(rows);
  const indent = new Map();
  const expanded = new Set();
  for (const r of rows || []) {
    const depth = r.parentId != null && indent.has(r.parentId) ? indent.get(r.parentId) + 1 : 0;
    indent.set(r.node_id, depth);
    if (parents.has(r.node_id) && (depth < maxIndent || dimensionParents.has(r.node_id))) expanded.add(r.node_id);
  }
  return expanded;
}

/**
 * ETP-6084 D6: with `nested`, the rows the level fold hides although their parent is open: the deeper
 * children of a same-level parent that is open only to show its same-level nodes. Empty otherwise.
 * The exports send the visible rows as `visibleNodeIds`, so they print what this hides too.
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

/** The rows to show, in order, each with `depth` (0 = top), `hasChildren` and `hasDimensionChildren`. `hidden` (levelHiddenIds) rows are skipped.
 * `foldedSummary` (a balance AT A DATE) lets a closed row stand for its hidden accounts (ledger range, aggregated `result`). */
export function visibleRows(rows, expanded, hidden = null, { foldedSummary = false } = {}) {
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
  return foldedSummary ? foldedSummaries(out, rows, expanded) : out;
}

const sumOf = (list, pick) => list.reduce((s, r) => s + (Number(pick(r)) || 0), 0);
const anyOf = (list, pick) => list.some((r) => pick(r) != null);

/** The `{onTheFly, posted}` of a folded row's cell: the descendants' on-the-fly parts added up, the rest of the amount is posted. */
function foldedPart(list, amount, pick) {
  if (amount == null || !anyOf(list, pick)) return null;
  const onTheFly = sumOf(list, pick);
  return { onTheFly, posted: Number(amount) - onTheFly };
}

/** ETP-6083: the `result` of a folded row, from the descendants that carry one (same shape the core puts on a row and on `cells[i]`). */
function foldedResult(row, withResult) {
  const parts = foldedPart(withResult, row.amount, (d) => d.result?.onTheFly);
  if (!parts) return null;
  const cells = (row.cells || []).map((cell, i) => {
    const at = (key) => (d) => (key ? d.cells?.[i]?.result?.[key]?.onTheFly : d.cells?.[i]?.result?.onTheFly);
    const own = foldedPart(withResult, cell.amount, at(null));
    if (!own) return cell;
    const sly = foldedPart(withResult, cell.sly?.amount, at('sly'));
    const prev = foldedPart(withResult, cell.prev?.amount, at('prev'));
    return { ...cell, result: { ...own, ...(sly && { sly }), ...(prev && { prev }) } };
  });
  return { result: parts, cells: row.cells ? cells : row.cells };
}

const amountsOf = (r) => [r.amount, ...(r.cells || []).flatMap((c) => [c.amount, c.sly?.amount, c.prev?.amount])];
const isZero = (r) => amountsOf(r).every((x) => Math.abs(Number(x) || 0) < 0.005);

/** The on-the-fly part a folded row contains, per cell (`{ amount, sly, prev }`): what its ledger (posted lines only) does not hold. */
function foldedOnTheFly(row, withResult) {
  const at = (i, key) => {
    const pick = (d) => (i == null ? d.result : d.cells?.[i]?.result);
    const parts = withResult.map(pick).map((r) => (key ? r?.[key] : r)).filter(Boolean);
    return parts.length ? sumOf(parts, (r) => r.onTheFly) : null;
  };
  return (row.cells?.length ? row.cells.map((_, i) => i) : [null]).map((i) => ({ amount: at(i, null), sly: at(i, 'sly'), prev: at(i, 'prev') }));
}

/**
 * ETP-6083: a row the fold closes hides its sub-accounts, so on its own it could neither open a ledger nor explain a `result`
 * those sub-accounts carry. Such a row gets:
 *  - `foldedRange` (the code range of its hidden leaf accounts: the ledger reads several accounts as a range), only when the range
 *    is EXACT: no other leaf account of the tree has a code inside it (a chart that interleaves its codes across headings stays plain);
 *  - `result` (aggregated) when every hidden account without a `result` is zero, so "posted" is really the posted part of the result;
 *  - otherwise `foldedOnTheFly`, the calculated part per cell, so the ledger can be compared with the amount without it.
 * Structural: no account is named.
 */
function foldedSummaries(out, rows, expanded) {
  const children = new Map();
  for (const r of rows || []) if (r.parentId != null) children.set(r.parentId, [...(children.get(r.parentId) || []), r]);
  const codeOf = (r) => (r.isDimension || r.isFormula ? null : r.account_value ?? r.value);
  const leaves = (rows || []).filter((r) => !children.has(r.node_id) && codeOf(r));
  return out.map((row) => {
    if (!row.hasChildren || expanded.has(row.node_id)) return row;
    const hidden = [];
    const walk = (id) => (children.get(id) || []).forEach((c) => { hidden.push(c); walk(c.node_id); });
    walk(row.node_id);
    // Only leaf accounts hold postings: a summary row's own code (a heading) is not an account and would widen the range.
    const accounts = hidden.filter((r) => !children.has(r.node_id) && codeOf(r));
    if (!accounts.length) return row;
    const codes = accounts.map((r) => String(codeOf(r))).sort();
    const range = { from: codes[0], to: codes[codes.length - 1] };
    const own = new Set(accounts.map((r) => r.node_id));
    const exact = leaves.every((r) => own.has(r.node_id) || String(codeOf(r)) < range.from || String(codeOf(r)) > range.to);
    const withResult = hidden.filter((r) => r.result);
    const pure = withResult.length > 0 && accounts.every((r) => r.result || isZero(r));
    return {
      ...row,
      ...(exact && { foldedRange: range }),
      ...(pure && foldedResult(row, withResult)),
      ...(withResult.length && !pure && { foldedOnTheFly: foldedOnTheFly(row, withResult) }),
    };
  });
}

/**
 * A leaf account row can be split by a dimension: it has its own postings. A formula row has
 * none, and a summary row would need the tree walk the split query does not do (plan F8).
 */
export function canSplit(row) {
  return !row.hasChildren && !row.isFormula;
}
