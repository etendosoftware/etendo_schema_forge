#!/usr/bin/env node
// ETP-4944 — Apply the resolved DELETE/MODIFY scope to the source reference
// data XML. Writes a sibling .new file; never edits in place.
//
// XML vs. SQL scope note (2026-09-03 rework): this file's classification
// (scope.deleteIds / scope.deactivateIds, 144/103) is a FIXED, one-time,
// human-reviewed decision baked into the single shipped XML artifact — the
// same file ships to every environment, so it can't branch at import time.
// The companion SQL data-fix (gen-delete-sql.cjs) is different: it targets
// already-provisioned environments whose data can differ from dev's, so it
// now decides delete-vs-deactivate DYNAMICALLY per environment at runtime
// (try the delete, catch foreign_key_violation, fall back to deactivate)
// instead of trusting this file's dev-derived classification. Don't conflate
// the two — a change to one's candidate set doesn't need to mirror the other.
const fs = require('fs');
const path = require('path');

const XML_PATH = path.join(__dirname, '../../../modules/com.etendoerp.go.localization.es.data/referencedata/standard/Spanish_Fiscal_Taxes_Go.xml');
const scope = JSON.parse(fs.readFileSync(path.join(__dirname, 'resolved-scope.json'), 'utf8'));
if (scope.unmatched.length || scope.ambiguous.length || scope.unaccountedXmlRecords.length || scope.parentTaxRateBlockers.length || scope.conflictingBucket.length) {
  console.error('resolved-scope.json has unresolved items — re-run Task 1 (Step 3/4) first.');
  process.exit(1);
}
const deleteIds = new Set(scope.deleteIds);
const deactivateIds = scope.deactivateIds || [];
const parentRepoints = scope.parentRepoints || {}; // { childId: newParentIdOrNull }

const DISCARDED_DESCRIPTION = 'Discarded Tax for EtendoGO'; // reporter's exact wording — do not translate/rephrase

let xml = fs.readFileSync(XML_PATH, 'utf8');
const counts = { rate: 0, trl: 0, obtl: 0, zone: 0, reparented: 0, deactivated: 0 };

function stripEntity(tag, keyTag, matchIds) {
  const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>\\n?`, 'g');
  let n = 0;
  xml = xml.replace(re, (block) => {
    const idAttr = tag === 'FinancialMgmtTaxRate' ? block.match(/\bid="([0-9A-Fa-f]+)"/)[1] : null;
    const fkMatch = keyTag ? block.match(new RegExp(`<${keyTag}\\b[^>]*?\\bid="([0-9A-Fa-f]+)"[^>]*/>`)) : null;
    const targetId = tag === 'FinancialMgmtTaxRate' ? idAttr : (fkMatch ? fkMatch[1] : null);
    if (targetId && matchIds.has(targetId)) { n++; return ''; }
    return block;
  });
  return n;
}

counts.rate = stripEntity('FinancialMgmtTaxRate', null, deleteIds);
counts.trl = stripEntity('FinancialMgmtTaxTrl', 'tax', deleteIds);
counts.obtl = stripEntity('OBTL_Tax_Parameter', 'tax', deleteIds);
counts.zone = stripEntity('FinancialMgmtTaxZone', 'tax', deleteIds);

// Assert the strip actually matched every expected record — every OTHER
// mutation in this file (deactivate, parentRepoints, MODIFY below) already
// throws on a no-op; these four counts were the one place that didn't
// (review finding B2). A mismatch here means the source XML doesn't have
// the shape resolved-scope.json assumed (e.g. an id vanished, or a name
// collision produced a phantom match) — fail loudly instead of silently
// writing a `.new` file that doesn't match what was actually resolved.
if (counts.rate !== deleteIds.size) throw new Error(`Expected to strip ${deleteIds.size} FinancialMgmtTaxRate records, stripped ${counts.rate}`);
if (counts.trl !== scope.dependentCounts.trl) throw new Error(`Expected to strip ${scope.dependentCounts.trl} FinancialMgmtTaxTrl records, stripped ${counts.trl}`);
if (counts.obtl !== scope.dependentCounts.obtl) throw new Error(`Expected to strip ${scope.dependentCounts.obtl} OBTL_Tax_Parameter records, stripped ${counts.obtl}`);
if (counts.zone !== scope.dependentCounts.zone) throw new Error(`Expected to strip ${scope.dependentCounts.zone} FinancialMgmtTaxZone records, stripped ${counts.zone}`);

// parentTaxRate repoints for surviving children (decided in Task 1 Step 3).
// IMPORTANT: extract each child's own record block first (bounded by its
// closing </FinancialMgmtTaxRate> tag) and splice the replacement back in as
// a literal string. A regex spanning "from the opening tag to the next
// <parentTaxRate/>" without that boundary would, if this particular record
// happens to lack the element where expected, silently keep scanning PAST
// the record and corrupt some unrelated tax rate's parentTaxRate instead —
// exactly the kind of silent corruption this plan's gates exist to prevent.
for (const [childId, newParentId] of Object.entries(parentRepoints)) {
  const blockRe = new RegExp(`<FinancialMgmtTaxRate\\b[^>]*\\bid="${childId}"[^>]*>[\\s\\S]*?<\\/FinancialMgmtTaxRate>`);
  const m = xml.match(blockRe);
  if (!m) throw new Error(`parentRepoints: target ${childId} not found in XML — aborting`);
  const original = m[0];
  const replacement = newParentId
    ? `<parentTaxRate id="${newParentId}" entity-name="FinancialMgmtTaxRate"/>`
    : `<parentTaxRate xsi:nil="true"/>`;
  const updated = original.replace(/<parentTaxRate\b[^>]*\/>/, replacement);
  if (updated === original) throw new Error(`parentRepoints: no <parentTaxRate/> element found inside ${childId}'s record — inspect the record shape manually before retrying`);
  xml = xml.replace(original, updated);
  counts.reparented++;
}

// DEACTIVATE: for each deactivateId, flip <active>false</active> and set
// <description>Discarded Tax for EtendoGO</description> IN PLACE — the
// record itself, and its Trl/Zone/OBTL_Tax_Parameter rows, are otherwise
// left completely untouched (they're not in deleteIds, so stripEntity above
// never touched them either). Same bounded-block-extraction + splice-back
// technique as the parentRepoints/MODIFY code below, for the same reason:
// an unbounded regex risks silently corrupting an unrelated record.
for (const id of deactivateIds) {
  const blockRe = new RegExp(`<FinancialMgmtTaxRate\\b[^>]*\\bid="${id}"[^>]*>[\\s\\S]*?<\\/FinancialMgmtTaxRate>`);
  const m = xml.match(blockRe);
  if (!m) throw new Error(`deactivateIds: target ${id} not found in XML — aborting`);
  const original = m[0];
  let block = original;
  let activeHit = false, descHit = false;
  block = block.replace(/<active>[\s\S]*?<\/active>/, () => { activeHit = true; return '<active>false</active>'; });
  // description is sometimes a self-closing xsi:nil element instead of an
  // open/close pair (confirmed elsewhere in this file, same quirk the
  // MODIFY step below already handles) — try both shapes.
  block = /<description\b[^>]*\/>/.test(block)
    ? block.replace(/<description\b[^>]*\/>/, () => { descHit = true; return `<description>${DISCARDED_DESCRIPTION}</description>`; })
    : block.replace(/<description>[\s\S]*?<\/description>/, () => { descHit = true; return `<description>${DISCARDED_DESCRIPTION}</description>`; });
  if (!activeHit || !descHit) throw new Error(`deactivateIds: deactivation did not apply cleanly for ${id} (active:${activeHit} description:${descHit}) — inspect the record shape manually`);
  xml = xml.replace(original, block);
  counts.deactivated++;
}
if (counts.deactivated !== deactivateIds.length) throw new Error(`deactivateIds: expected ${deactivateIds.length} deactivations, applied ${counts.deactivated}`);

// MODIFY: rename in FinancialMgmtTaxRate.name/description and the paired
// Trl.name. Asserts the replace actually landed instead of silently no-op'ing
// — `description` is often a self-closing `xsi:nil="true"` element rather
// than an open/close pair (confirmed elsewhere in this file), so a naive
// regex that only handles the open/close shape can match nothing and leave
// the field uncorrected with no visible error.
const { id: modId, oldName, newName } = scope.modify;
const rateBlockRe = new RegExp(`<FinancialMgmtTaxRate\\b[^>]*\\bid="${modId}"[^>]*>[\\s\\S]*?<\\/FinancialMgmtTaxRate>`);
const rateBlockMatch = xml.match(rateBlockRe);
if (!rateBlockMatch) throw new Error(`MODIFY target ${modId} not found in XML — aborting`);
let rateBlock = rateBlockMatch[0];
if (!rateBlock.includes(`<name>${oldName}</name>`)) {
  console.warn(`MODIFY: expected old name "${oldName}" not found verbatim in ${modId}'s record — renaming anyway, but double-check scope.modify.oldName`);
}
let nameHit = false, descHit = false;
rateBlock = rateBlock.replace(/<name>[\s\S]*?<\/name>/, () => { nameHit = true; return `<name>${newName}</name>`; });
rateBlock = /<description\b[^>]*\/>/.test(rateBlock)
  ? rateBlock.replace(/<description\b[^>]*\/>/, () => { descHit = true; return `<description>${newName}</description>`; })
  : rateBlock.replace(/<description>[\s\S]*?<\/description>/, () => { descHit = true; return `<description>${newName}</description>`; });
if (!nameHit || !descHit) throw new Error(`MODIFY rename did not apply cleanly for ${modId} (name:${nameHit} description:${descHit}) — inspect the record shape manually`);
xml = xml.replace(rateBlockMatch[0], rateBlock);

const trlBlocks = xml.match(/<FinancialMgmtTaxTrl\b[^>]*>[\s\S]*?<\/FinancialMgmtTaxTrl>/g) || [];
let trlHit = false;
for (const b of trlBlocks) {
  if (b.includes(`id="${modId}" entity-name="FinancialMgmtTaxRate"`)) {
    const updated = b.replace(/<name>[\s\S]*?<\/name>/, `<name>${newName}</name>`);
    if (updated !== b) { xml = xml.replace(b, updated); trlHit = true; }
    break;
  }
}
if (!trlHit) throw new Error(`MODIFY rename did not find/update the paired FinancialMgmtTaxTrl for ${modId} — inspect manually`);

const outPath = XML_PATH + '.new';
fs.writeFileSync(outPath, xml);
console.log('Removed/changed:', counts);
console.log('Expected (from resolved-scope.json):', scope.dependentCounts, '+', scope.deleteIds.length, 'rate records deleted +', deactivateIds.length, 'deactivated +', Object.keys(parentRepoints).length, 'reparented');
console.log('Wrote', outPath, '— diff it against the source before replacing.');
