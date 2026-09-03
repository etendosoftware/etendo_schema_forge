#!/usr/bin/env node
// ETP-4944 — Apply the resolved DELETE/MODIFY scope to the source reference
// data XML. Writes a sibling .new file; never edits in place.
const fs = require('fs');
const path = require('path');

const XML_PATH = path.join(__dirname, '../../../modules/com.etendoerp.go.localization.es.data/referencedata/standard/Spanish_Fiscal_Taxes_Go.xml');
const scope = JSON.parse(fs.readFileSync(path.join(__dirname, 'resolved-scope.json'), 'utf8'));
if (scope.unmatched.length || scope.ambiguous.length || scope.unaccountedXmlRecords.length || scope.parentTaxRateBlockers.length || scope.conflictingBucket.length) {
  console.error('resolved-scope.json has unresolved items — re-run Task 1 (Step 3/4) first.');
  process.exit(1);
}
const deleteIds = new Set(scope.deleteIds);
const parentRepoints = scope.parentRepoints || {}; // { childId: newParentIdOrNull }

let xml = fs.readFileSync(XML_PATH, 'utf8');
const counts = { rate: 0, trl: 0, obtl: 0, zone: 0, reparented: 0 };

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
console.log('Removed:', counts);
console.log('Expected (from resolved-scope.json):', scope.dependentCounts, '+', scope.deleteIds.length, 'rate records');
console.log('Wrote', outPath, '— diff it against the source before replacing.');
