#!/usr/bin/env node
// ETP-4944 — Reconcile the 3 functional CSVs against the source reference-data
// XML. Produces resolved-scope.json. Refuses (nonzero exit) if any ambiguity
// remains — this is a gate, not a best-effort tool.
const fs = require('fs');
const path = require('path');

const XML_PATH = path.join(__dirname, '../../../modules/com.etendoerp.go.localization.es.data/referencedata/standard/Spanish_Fiscal_Taxes_Go.xml');
const IN_DIR = path.join(__dirname, 'input');
const DELIM = ','; // confirmed comma-delimited against the real attachments (2026-09-02)

// --- Reporter's final scope decision (2026-09-03): a per-id fallback policy
// instead of a blanket delete of the 246. Every CSV DELETE id is attempted as
// a real DELETE UNLESS it hits one of two fallback conditions, in which case
// it is DEACTIVATED instead (active=false + description="Discarded Tax for
// EtendoGO", record otherwise untouched — its Trl/Zone/OBTL_Tax_Parameter
// rows are left alone since the parent row still exists, nothing to orphan):
//   (a) it has a live-usage FK reference anywhere in the system, or
//   (b) it's one of the ids referenced in the 303/347apr/390 sibling AEAT
//       modules' OWN reference data (those 3 files are explicitly NOT being
//       patched by this ticket — see sibling-overlap.json / find-sibling-
//       overlap.cjs, the committed, reproducible form of the Task 2 check).
//
// FinancialMgmtTaxRate id="867FFFAC82CC44069FE6497E4C5C6348" (name="IVA
// Normal") is case (a): an already-inactive placeholder (active=false,
// validFromDate=9999-01-01) that the spreadsheet review never saw, not in
// either CSV. First empirically tested as a real DELETE via the Task 4
// dry-run against the local dev DB — it FAILED with a `c_invoiceline_c_tax`
// FK violation naming this exact id, i.e. it IS referenced by a real invoice
// line. Deactivate path applies here too (idempotent on the `active` flip,
// since it's already false — but it still needs the description set).
const IVA_NORMAL_ID = '867FFFAC82CC44069FE6497E4C5C6348'; // not in any CSV — manual deactivate addition, live c_invoiceline reference found empirically 2026-09-03

const siblingOverlap = JSON.parse(fs.readFileSync(path.join(__dirname, 'sibling-overlap.json'), 'utf8'));
const siblingOverlapSet = new Set(siblingOverlap.overlapIds);

function decodeXml(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#x([0-9A-Fa-f]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, '&');
}
function scalar(block, tag) {
  if (new RegExp(`<${tag}\\b[^>]*/>`).test(block)) return null;
  const m = block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`));
  return m && m[1] !== '' ? decodeXml(m[1]) : null;
}
function fk(block, tag) {
  const m = block.match(new RegExp(`<${tag}\\b[^>]*?\\bid="([0-9A-Fa-f]+)"[^>]*/>`));
  return m ? m[1] : null;
}
// Minimal quoted-CSV line parser (handles "a, b" fields).
function parseCsv(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQ = !inQ; continue; }
      if (c === DELIM && !inQ) { cells.push(cur); cur = ''; continue; }
      cur += c;
    }
    cells.push(cur);
    rows.push(cells.map(s => s.trim()));
  }
  const header = rows[0].map(h => h.toLowerCase());
  return rows.slice(1).map(r => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

const xml = fs.readFileSync(XML_PATH, 'utf8');

// --- Parse all FinancialMgmtTaxRate records ---
const rateBlocks = xml.match(/<FinancialMgmtTaxRate\b[^>]*>[\s\S]*?<\/FinancialMgmtTaxRate>/g) || [];
// XML export has a confirmed data quirk: a subset of <name> values carry a
// trailing space (e.g. "Prestación servicios nacional 21% ") that the CSVs'
// names don't. Trim before indexing or ~20 real records silently miss.
const rates = rateBlocks.map(b => ({
  id: b.match(/\bid="([0-9A-Fa-f]+)"/)[1],
  name: (scalar(b, 'name') || '').trim(),
  description: scalar(b, 'description'),
  parentTaxRate: fk(b, 'parentTaxRate'),
}));
const nameToIds = new Map();
for (const r of rates) nameToIds.set(r.name, [...(nameToIds.get(r.name) || []), r.id]);

// --- Load CSVs (headers confirmed 2026-09-02 against the real attachments) ---
const del = parseCsv(fs.readFileSync(path.join(IN_DIR, 'tax-rates-DELETE.csv'), 'utf8'));   // Nombre,Indice,Valido desde,Grupo de impuesto
const keep = parseCsv(fs.readFileSync(path.join(IN_DIR, 'tax-rates-KEEP.csv'), 'utf8'));     // same header shape
const modifyRows = parseCsv(fs.readFileSync(path.join(IN_DIR, 'tax-rates-MODIFY.csv'), 'utf8')); // Nombre actual,Nombre corregido,Indice,Valido desde,Grupo de impuesto,Comentario
const NAME_COL = 'nombre';

function resolveBucket(rows, bucket) {
  const ids = [], unmatched = [], ambiguous = [];
  for (const row of rows) {
    const name = (row[NAME_COL] || '').trim();
    const candidates = nameToIds.get(name) || [];
    if (candidates.length === 0) unmatched.push({ bucket, name });
    else if (candidates.length > 1) ambiguous.push({ bucket, name, candidateIds: candidates });
    else ids.push(candidates[0]);
  }
  return { ids, unmatched, ambiguous };
}
const D = resolveBucket(del, 'delete');
const K = resolveBucket(keep, 'keep');

// MODIFY comes from its own csv (different header shape — a before/after
// name pair, not a single Nombre column), not a hardcoded literal.
if (modifyRows.length !== 1) throw new Error(`Expected exactly 1 MODIFY row, got ${modifyRows.length}`);
const modRow = modifyRows[0];
const modOldName = (modRow['nombre actual'] || '').trim();
const modCandidates = nameToIds.get(modOldName) || [];
if (modCandidates.length !== 1) throw new Error(`MODIFY name "${modOldName}" resolved to ${modCandidates.length} XML records, expected exactly 1`);
const MODIFY = {
  id: modCandidates[0],
  oldName: modOldName,
  newName: (modRow['nombre corregido'] || '').trim(),
};

// --- Split the CSV DELETE bucket into a real-delete set and a deactivate
// set, per the reporter's final scope decision (see IVA_NORMAL_ID comment
// above). `deactivateIds` = (sibling-overlap ∩ CSV deleteIds) ∪ {IVA Normal}.
// `deleteIds` is reduced to exclude everything in `deactivateIds` — those
// ids still get a real cascade delete, deactivated ones get an in-place
// active/description flip only (Task 3/4 branch on this split).
const deactivateIds = [...new Set([
  ...D.ids.filter(id => siblingOverlapSet.has(id)),
  IVA_NORMAL_ID,
])];
const deactivateSet = new Set(deactivateIds);
const finalDeleteIds = D.ids.filter(id => !deactivateSet.has(id));

// --- Unaccounted records: in the XML but in neither CSV bucket, MODIFY, nor
// the manual deactivate addition (IVA Normal). Note this uses D.ids (the
// full CSV delete bucket, pre-split) union deactivateIds — deactivateIds
// already includes everything reachable from D.ids plus the one manual
// addition, so this is equivalent to finalDeleteIds ∪ deactivateIds ∪ K.ids
// ∪ {MODIFY.id} but written the clearer way.
const accountedIds = new Set([...D.ids, ...K.ids, MODIFY.id, ...deactivateIds]);
const unaccountedXmlRecords = rates.filter(r => !accountedIds.has(r.id)).map(r => ({ id: r.id, name: r.name }));

// --- Cross-bucket conflicts: same id resolved into >1 bucket (e.g. its name
// was accidentally listed in BOTH the DELETE and KEEP csv, or collides with
// the MODIFY id), or the same name appears twice within one bucket's csv.
// Silently letting this through would delete a rate the reporter meant to
// keep (or vice versa) — must be a hard gate, not a warning. Computed against
// the CSV-derived buckets (D/K/MODIFY) BEFORE the delete/deactivate split —
// that split only re-partitions the 'delete' bucket internally, it isn't a
// new source-of-truth bucket, so it can't itself create a cross-bucket
// conflict. IVA_NORMAL_ID is included here too as a defensive check: if it
// ever turned up inside D.ids/K.ids/MODIFY.id as well, that's a genuine
// inconsistency worth failing loudly on rather than silently double-counting.
const bucketOf = new Map();
for (const id of D.ids) bucketOf.set(id, [...(bucketOf.get(id) || []), 'delete']);
for (const id of K.ids) bucketOf.set(id, [...(bucketOf.get(id) || []), 'keep']);
bucketOf.set(MODIFY.id, [...(bucketOf.get(MODIFY.id) || []), 'modify']);
bucketOf.set(IVA_NORMAL_ID, [...(bucketOf.get(IVA_NORMAL_ID) || []), 'deactivate-manual']);
const conflictingBucket = [...bucketOf.entries()]
  .filter(([, buckets]) => new Set(buckets).size > 1 || buckets.length > 1)
  .map(([id, buckets]) => ({ id, name: (rates.find(r => r.id === id) || {}).name, buckets }));

// --- parentTaxRate blockers: a non-deleted rate whose parent IS a real
// delete id. Uses finalDeleteIds (the 144), NOT the full CSV delete bucket —
// a deactivated parent row still physically exists (just active=false), so
// it can't orphan a child's parentTaxRate FK the way an actual delete would.
//
// The delete/deactivate split (new in this revision) reintroduces a class of
// blocker that didn't exist under a blanket "delete all 246 together" policy:
// a child that's being DEACTIVATED (survives, active=false) whose own parent
// IS being really deleted (removed entirely) — that child's parentTaxRate FK
// would dangle. Auto-resolved below via `parentRepoints` (nulling), NOT
// silently — this is a deliberate, narrow, documented default, not the
// "get a human decision" escape hatch Task 1 Step 3 otherwise requires: it
// only ever fires when the child is ALREADY being marked
// inactive+"Discarded Tax for EtendoGO", so nulling a metadata link on an
// already-retired record changes no live/active behavior — it purely
// prevents an FK violation. A blocker whose child is a pure KEEP (still
// active, still user-facing) is deliberately NOT auto-resolved this way —
// that would be a real business-meaning change and must still gate & escalate.
const finalDeleteSet = new Set(finalDeleteIds);
const rawParentTaxRateBlockers = rates
  .filter(r => !finalDeleteSet.has(r.id) && r.parentTaxRate && finalDeleteSet.has(r.parentTaxRate))
  .map(r => ({ childId: r.id, childName: r.name, parentId: r.parentTaxRate }));

const parentRepoints = {};
for (const b of rawParentTaxRateBlockers) {
  if (deactivateSet.has(b.childId)) parentRepoints[b.childId] = null; // safe: child is already being deactivated
}
const parentTaxRateBlockers = rawParentTaxRateBlockers.filter(b => !(b.childId in parentRepoints));

// --- Informational dependent counts (for the real DELETE ids only —
// deactivated ids leave their Trl/Zone/OBTL_Tax_Parameter rows untouched by
// design, so they must NOT be counted here; Task 3's cascade-strip only
// operates on finalDeleteIds and this cross-check must match it exactly).
function countRefsFor(tag, ids) {
  const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'g');
  const blocks = xml.match(re) || [];
  return blocks.filter(b => ids.has(fk(b, 'tax'))).length;
}
const dependentCounts = {
  trl: countRefsFor('FinancialMgmtTaxTrl', finalDeleteSet),
  obtl: countRefsFor('OBTL_Tax_Parameter', finalDeleteSet),
  zone: countRefsFor('FinancialMgmtTaxZone', finalDeleteSet),
};

// --- SQL-facing fields (reporter's environment-agnostic correction,
// 2026-09-03): the fixed delete/deactivate split above (deleteIds/
// deactivateIds) is right for the XML file — a single shipped artifact,
// same for every environment, where dev's empirical result is a legitimate
// one-time human-reviewed decision. It is WRONG for the companion SQL
// data-fix, which runs against already-provisioned environments whose data
// can differ from dev's: an id with no live reference here might have one
// elsewhere, and vice versa. So the SQL generator gets a different, looser
// pair of sets and decides delete-vs-deactivate at RUNTIME per environment
// (see gen-delete-sql.cjs) instead of trusting this dev-derived split:
//   - staticDeactivateIds: the 102 sibling-overlap ids ONLY (no IVA Normal).
//     These never even get a delete attempt, anywhere — the 3 sibling AEAT
//     modules' own reference data is fixed and environment-independent, so
//     this is genuinely static regardless of which environment runs it.
//   - candidateIds: the 145 delete-ATTEMPT candidates (144 CSV-derived +
//     IVA Normal, no longer special-cased) — each is tried as a real
//     delete, with a per-id runtime fallback to deactivate on FK violation.
const staticDeactivateIds = D.ids.filter(id => siblingOverlapSet.has(id));
const candidateIds = [...finalDeleteIds, IVA_NORMAL_ID];

const result = {
  generatedAt: new Date().toISOString(),
  sourceXmlRecordCount: rates.length,
  csvCounts: { delete: del.length, keep: keep.length, modify: 1 },
  unmatched: [...D.unmatched, ...K.unmatched],
  ambiguous: [...D.ambiguous, ...K.ambiguous],
  unaccountedXmlRecords,
  parentTaxRateBlockers,
  conflictingBucket,
  deleteIds: finalDeleteIds,
  deactivateIds,
  parentRepoints,
  staticDeactivateIds,
  candidateIds,
  modify: MODIFY,
  dependentCounts,
};
fs.writeFileSync(path.join(__dirname, 'resolved-scope.json'), JSON.stringify(result, null, 2));

// Sanity check against the ticket's own stated totals — a wrong DELIM/header
// guess parses "successfully" but silently produces nonsense counts that
// wouldn't otherwise trip any of the gates above.
if (result.csvCounts.delete !== 246) console.warn(`WARNING: ticket says 246 DELETE rows, CSV parsed ${result.csvCounts.delete} — re-check DELIM/NAME_COL.`);
if (result.csvCounts.keep !== 405) console.warn(`WARNING: ticket says 405 KEEP rows, CSV parsed ${result.csvCounts.keep} — re-check DELIM/NAME_COL.`);

const blockers = result.unmatched.length + result.ambiguous.length + result.unaccountedXmlRecords.length + result.parentTaxRateBlockers.length + result.conflictingBucket.length;
console.log(JSON.stringify({ ...result, deleteIds: `[${result.deleteIds.length} ids]`, deactivateIds: `[${result.deactivateIds.length} ids]`, staticDeactivateIds: `[${result.staticDeactivateIds.length} ids]`, candidateIds: `[${result.candidateIds.length} ids]` }, null, 2));
console.log(`\n>>> XML split (fixed): ${result.deleteIds.length} real deletes, ${result.deactivateIds.length} deactivations, 1 rename.`);
console.log(`>>> SQL split (dynamic): ${result.staticDeactivateIds.length} static deactivate, ${result.candidateIds.length} delete-attempt candidates.`);
if (blockers > 0) {
  console.error(`\n>>> ${blockers} unresolved item(s) — see resolved-scope.json. DO NOT proceed to Task 3/4 until this is 0.`);
  process.exit(1);
}
console.log('\n>>> Scope fully resolved. Safe to proceed to Task 2/3/4.');
