#!/usr/bin/env node
// ETP-4944 — Formalizes Task 2's manual investigation into a reproducible,
// committed script. Determines, independently of resolved-scope.json (so
// there's no circular dependency with reconcile-scope.cjs), which of the
// CSV's DELETE-bucket tax-rate ids are also referenced by the 3 sibling AEAT
// report modules' OWN reference-data files. Those modules are NOT being
// patched by this ticket, so any of their ids must be deactivated rather
// than deleted (deleting them would orphan an FK on a fresh install of those
// modules). Writes scripts/etp-4944-tax-cleanup/sibling-overlap.json.
//
// Real file paths confirmed 2026-09-03 (the 347 module's file name does NOT
// follow the "347_Report_Tax_Parameters.xml" naming pattern the original
// plan guessed from the other two modules):
const fs = require('fs');
const path = require('path');

const XML_PATH = path.join(__dirname, '../../../modules/com.etendoerp.go.localization.es.data/referencedata/standard/Spanish_Fiscal_Taxes_Go.xml');
const IN_DIR = path.join(__dirname, 'input');
const DELIM = ',';

const SIBLING_MODULE_FILES = {
  '303': path.join(__dirname, '../../../modules/org.openbravo.module.aeat303.es/referencedata/standard/303_Report_Tax_Parameters.xml'),
  '347': path.join(__dirname, '../../../modules/org.openbravo.module.aeat347apr.es/referencedata/standard/Tax_Report_Launcher_definition_for_the_AEAT_347_tax_report.xml'),
  '390': path.join(__dirname, '../../../modules/org.openbravo.module.aeat390.es/referencedata/standard/390_Report_Tax_Parameters.xml'),
};

// --- Minimal duplication of reconcile-scope.cjs's CSV/XML name-matching, so
// this script has no dependency on resolved-scope.json (avoids a circular
// dependency: reconcile-scope.cjs needs THIS file's output to compute
// deactivateIds, so this file cannot in turn depend on reconcile-scope.cjs's
// output). Kept intentionally minimal — only what's needed to resolve the
// DELETE bucket's candidate ids. ---
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
const rateBlocks = xml.match(/<FinancialMgmtTaxRate\b[^>]*>[\s\S]*?<\/FinancialMgmtTaxRate>/g) || [];
const nameToIds = new Map();
for (const b of rateBlocks) {
  const id = b.match(/\bid="([0-9A-Fa-f]+)"/)[1];
  const nameMatch = b.match(/<name>([\s\S]*?)<\/name>/);
  const name = (nameMatch ? nameMatch[1] : '').trim();
  nameToIds.set(name, [...(nameToIds.get(name) || []), id]);
}

const del = parseCsv(fs.readFileSync(path.join(IN_DIR, 'tax-rates-DELETE.csv'), 'utf8'));
const candidateDeleteIds = [];
for (const row of del) {
  const name = (row['nombre'] || '').trim();
  const candidates = nameToIds.get(name) || [];
  if (candidates.length === 1) candidateDeleteIds.push(candidates[0]);
  // unmatched/ambiguous names are reconcile-scope.cjs's job to gate on — this
  // script only needs a best-effort candidate set to check for overlap.
}

// --- Check each sibling module's own reference-data file for a literal
// occurrence of each candidate DELETE id (same technique as the original
// manual Task 2 investigation: ids are 32-char uppercase-hex, so a plain
// substring search has no realistic false-positive risk). ---
const overlapByModule = {};
const overlapSets = {};
for (const [mod, file] of Object.entries(SIBLING_MODULE_FILES)) {
  if (!fs.existsSync(file)) {
    console.error(`Sibling module file NOT FOUND for ${mod}: ${file}`);
    process.exit(1);
  }
  const content = fs.readFileSync(file, 'utf8');
  const hits = candidateDeleteIds.filter(id => content.includes(id));
  overlapSets[mod] = new Set(hits);
  overlapByModule[mod] = hits.length;
}
const overlapIds = [...new Set([...overlapSets['303'], ...overlapSets['347'], ...overlapSets['390']])];

const result = {
  generatedAt: new Date().toISOString(),
  candidateDeleteIdCount: candidateDeleteIds.length,
  overlapByModule,
  overlapIds,
};
fs.writeFileSync(path.join(__dirname, 'sibling-overlap.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ ...result, overlapIds: `[${overlapIds.length} ids]` }, null, 2));
console.log(`\n>>> ${overlapIds.length} of ${candidateDeleteIds.length} candidate DELETE ids overlap with an active sibling AEAT module's own reference data.`);
