#!/usr/bin/env node
// ETP-4944 — Reconcile the 3 functional CSVs against the source reference-data
// XML. Produces resolved-scope.json. Refuses (nonzero exit) if any ambiguity
// remains — this is a gate, not a best-effort tool.
const fs = require('fs');
const path = require('path');

const XML_PATH = path.join(__dirname, '../../../modules/com.etendoerp.go.localization.es.data/referencedata/standard/Spanish_Fiscal_Taxes_Go.xml');
const IN_DIR = path.join(__dirname, 'input');
const DELIM = ','; // confirmed comma-delimited against the real attachments (2026-09-02)

// Explicit overrides, NOT CSV edits — the reporter's CSVs stay the unmodified
// source of truth. FinancialMgmtTaxRate id="867FFFAC82CC44069FE6497E4C5C6348"
// (name="IVA Normal") is an already-inactive placeholder (active=false,
// validFromDate=9999-01-01) that the spreadsheet review never saw. Per the
// user's explicit 2026-09-02 decision, it was first added to DELETE and
// empirically tested via the Task 4 dry-run against the local dev DB.
//
// RESULT (2026-09-03): the dry-run FAILED with a `c_invoiceline_c_tax` FK
// violation naming this exact id — it IS referenced by a real invoice line,
// despite being inactive/placeholder-looking. Per the decision rule ("if
// something breaks, we keep it"), this settles KEEP, not DELETE. Moved from
// EXTRA_DELETE_IDS to EXTRA_KEEP_IDS below so it's still accounted for (not
// re-flagged as unaccountedXmlRecords) but excluded from deleteIds.
const EXTRA_DELETE_IDS = [];
const EXTRA_KEEP_IDS = ['867FFFAC82CC44069FE6497E4C5C6348']; // IVA Normal — kept: live c_invoiceline reference found empirically 2026-09-03

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

// Merge the explicit overrides into the resolved buckets (post-CSV-resolution,
// per the documented decisions above — the CSV itself stays untouched).
for (const id of EXTRA_DELETE_IDS) {
  if (!D.ids.includes(id)) D.ids.push(id);
}
for (const id of EXTRA_KEEP_IDS) {
  if (!K.ids.includes(id)) K.ids.push(id);
}

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

// --- Unaccounted records: in the XML but in neither CSV bucket nor MODIFY ---
const accountedIds = new Set([...D.ids, ...K.ids, MODIFY.id]);
const unaccountedXmlRecords = rates.filter(r => !accountedIds.has(r.id)).map(r => ({ id: r.id, name: r.name }));

// --- Cross-bucket conflicts: same id resolved into >1 bucket (e.g. its name
// was accidentally listed in BOTH the DELETE and KEEP csv, or collides with
// the MODIFY id), or the same name appears twice within one bucket's csv.
// Silently letting this through would delete a rate the reporter meant to
// keep (or vice versa) — must be a hard gate, not a warning.
const bucketOf = new Map();
for (const id of D.ids) bucketOf.set(id, [...(bucketOf.get(id) || []), 'delete']);
for (const id of K.ids) bucketOf.set(id, [...(bucketOf.get(id) || []), 'keep']);
bucketOf.set(MODIFY.id, [...(bucketOf.get(MODIFY.id) || []), 'modify']);
const conflictingBucket = [...bucketOf.entries()]
  .filter(([, buckets]) => new Set(buckets).size > 1 || buckets.length > 1)
  .map(([id, buckets]) => ({ id, name: (rates.find(r => r.id === id) || {}).name, buckets }));

// --- parentTaxRate blockers: a non-deleted rate whose parent IS a delete id ---
const deleteSet = new Set(D.ids);
const parentTaxRateBlockers = rates
  .filter(r => !deleteSet.has(r.id) && r.parentTaxRate && deleteSet.has(r.parentTaxRate))
  .map(r => ({ childId: r.id, childName: r.name, parentId: r.parentTaxRate }));

// --- Informational dependent counts (for the DELETE ids) ---
function countRefsFor(tag, ids) {
  const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'g');
  const blocks = xml.match(re) || [];
  return blocks.filter(b => ids.has(fk(b, 'tax'))).length;
}
const dependentCounts = {
  trl: countRefsFor('FinancialMgmtTaxTrl', deleteSet),
  obtl: countRefsFor('OBTL_Tax_Parameter', deleteSet),
  zone: countRefsFor('FinancialMgmtTaxZone', deleteSet),
};

const result = {
  generatedAt: new Date().toISOString(),
  sourceXmlRecordCount: rates.length,
  csvCounts: { delete: del.length, keep: keep.length, modify: 1 },
  unmatched: [...D.unmatched, ...K.unmatched],
  ambiguous: [...D.ambiguous, ...K.ambiguous],
  unaccountedXmlRecords,
  parentTaxRateBlockers,
  conflictingBucket,
  deleteIds: D.ids,
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
console.log(JSON.stringify({ ...result, deleteIds: `[${result.deleteIds.length} ids]` }, null, 2));
if (blockers > 0) {
  console.error(`\n>>> ${blockers} unresolved item(s) — see resolved-scope.json. DO NOT proceed to Task 3/4 until this is 0.`);
  process.exit(1);
}
console.log('\n>>> Scope fully resolved. Safe to proceed to Task 2/3/4.');
