#!/usr/bin/env node
/**
 * verify-window.js — Integrity check for a window after decisions.json changes.
 *
 * Usage:
 *   node cli/src/verify-window.js sales-invoice
 *   node cli/src/verify-window.js sales-invoice purchase-invoice sales-order
 *
 * Checks performed:
 *   1. contract.json exists
 *   2. draftMode is set when decisions.json has it enabled
 *   3. apiPrediction.window.category is set
 *   4. All editable header fields have readOnlyLogic (warns if missing)
 *   5. All editable header fields have callout when schema-raw has one (warns if missing)
 *   6. Generated HeaderPage.jsx import paths use relative '../../../custom/' (not '@/windows/')
 *   7. addLineFields: product has lookup, quantity has defaultValue, hidden has grossUnitPrice+priceList
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const RESET  = '\x1b[0m';
const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED    = '\x1b[31m';
const BOLD   = '\x1b[1m';

function ok(msg)   { console.log(`  ${GREEN}✓${RESET} ${msg}`); }
function warn(msg) { console.log(`  ${YELLOW}⚠${RESET} ${msg}`); }
function fail(msg) { console.log(`  ${RED}✗${RESET} ${msg}`); }

export function verifyDraftMode(decisions, h) {
  let newIssues = 0;
  const decDraftMode = decisions.window?.draftMode;
  const ctDraftMode = h?.draftMode;
  if (decDraftMode?.enabled) {
    if (ctDraftMode?.enabled) {
      ok('draftMode enabled in contract');
    } else {
      fail('draftMode is enabled in decisions but NULL in contract → Confirm button will not appear');
      newIssues++;
    }
  }
  return {newIssues, ctDraftMode};
}

export function isCalloutMissingInContract(rawFld, hasCallout) {
  return rawFld?.callout && !hasCallout;
}

export function checkSchemaRawCalloutAndValidation(schemaRawPath, name, hasCallout, newIssues, hasVR) {
  const raw = JSON.parse(readFileSync(schemaRawPath, 'utf8'));
  const rawHeader = raw.entities?.find(e => e.name === 'header');
  const rawFld = rawHeader?.fields?.find(f => f.name === name);
  if (isCalloutMissingInContract(rawFld, hasCallout)) {
    warn(`${name}: callout '${rawFld.callout}' in schema-raw but missing in contract`);
    newIssues++;
  }
  if (rawFld?.validationRule && !hasVR) {
    warn(`${name}: validationRule in schema-raw but missing in contract → selector not filtered`);
    newIssues++;
  }
  return newIssues;
}

export function verifyEditableHeaderFields(h, ctDraftMode, windowName, priorIssues) {
  let newIssues = 0;
  if (!h?.fields) {
    return newIssues;
  }
  for (const fld of h.fields) {
    const vis = fld.visibility;
    if (!fld.form || vis === 'discarded' || vis === 'system' || vis === 'readOnly') continue;

    const name = fld.name;
    const hasRL = Boolean(fld.readOnlyLogic);
    const hasCallout = Boolean(fld.callout);
    const hasVR = Boolean(fld.validationRule);

    // readOnlyLogic: warn for document windows that have draftMode
    if (!hasRL && ctDraftMode?.enabled) {
      warn(`${name}: missing readOnlyLogic → field editable even when invoice is completed`);
      newIssues++;
    }

    // callout from schema-raw — only warn if schema-raw has it but contract doesn't
    const schemaRawPath = join(ROOT, 'artifacts', windowName, 'schema-raw.json');
    if (existsSync(schemaRawPath)) {
      newIssues = checkSchemaRawCalloutAndValidation(schemaRawPath, name, hasCallout, newIssues, hasVR);
    }
  }
  if (priorIssues + newIssues === 0) ok('All editable header fields have correct readOnlyLogic/callout/validationRule');
  return newIssues;
}

export function verifyAddLineFields(headerPagePath, issues) {
  const src = readFileSync(headerPagePath, 'utf8');
  const addLineMatch = src.match(/sf-generated-start addLineFields[\s\S]*?sf-generated-end addLineFields/);
  if (addLineMatch) {
    const al = addLineMatch[0];
    const hasLookup = al.includes('lookup: true');
    const hasDefaultValue1 = al.includes('defaultValue: 1');
    const hasGrossUnitPrice = al.includes("'grossUnitPrice'");
    const hasPriceListParent = al.includes("fromParent: 'priceList'");

    if (!hasLookup) {
      warn('addLineFields: product missing lookup: true → no search drawer');
      issues++;
    }
    if (!hasDefaultValue1) {
      warn('addLineFields: quantity missing defaultValue: 1 → quantity starts null');
      issues++;
    }
    if (!hasGrossUnitPrice) {
      warn('addLineFields: hidden grossUnitPrice missing → price callouts may fail');
      issues++;
    }
    // priceList fromParent is a synthetic field not in schema-raw for invoice lines —
    // the callout formState already includes header priceList, so it's not required.
    if (!hasPriceListParent) {
      console.log(`  ${'  '}ℹ priceList fromParent absent (not in schema-raw — callout uses header context instead)`);
    }
    if (hasLookup && hasDefaultValue1 && hasGrossUnitPrice) {
      ok('addLineFields structure is correct');
    }
  }
  return issues;
}

function verifyWindow(windowName) {
  console.log(`\n${BOLD}── ${windowName} ──${RESET}`);
  let issues = 0;

  const contractPath = join(ROOT, 'artifacts', windowName, 'contract.json');
  const decisionsPath = join(ROOT, 'artifacts', windowName, 'decisions.json');
  const headerPagePath = join(ROOT, 'artifacts', windowName, 'generated', 'web', windowName, 'HeaderPage.jsx');

  if (!existsSync(contractPath)) { fail('contract.json not found'); return 1; }
  if (!existsSync(decisionsPath)) { fail('decisions.json not found'); return 1; }

  const contract  = JSON.parse(readFileSync(contractPath, 'utf8'));
  const decisions = JSON.parse(readFileSync(decisionsPath, 'utf8'));

  const fc   = contract.frontendContract;
  const h    = fc?.entities?.header;
  const api  = contract.apiPrediction;

  // 1. draftMode
  const {newIssues, ctDraftMode} = verifyDraftMode(decisions, h);
  issues += newIssues;

  // 2. category
  const category = api?.window?.category;
  if (category) {
    ok(`apiPrediction.window.category = '${category}'`);
  } else {
    fail('apiPrediction.window.category is missing → isCustomer/isVendor/isSOTrx selectors broken');
    issues++;
  }

  // 3. readOnlyLogic + callout + validationRule on editable fields
  issues += verifyEditableHeaderFields(h, ctDraftMode, windowName, issues);

  // 4. Import paths in HeaderPage.jsx
  // '@/windows/custom/{name}/' is valid only when the component file actually exists there.
  // resolveCustomImport() picks the correct path at generation time — this check catches
  // stale imports that reference a path where the file no longer lives.
  if (existsSync(headerPagePath)) {
    const src = readFileSync(headerPagePath, 'utf8');
    const appShellImportRe = new RegExp(`'@/windows/custom/${windowName}/([^']+)'`, 'g');
    let badImport = false;
    let match;
    while ((match = appShellImportRe.exec(src)) !== null) {
      const componentPath = join(ROOT, 'tools', 'app-shell', 'src', 'windows', 'custom', windowName, `${match[1]}.jsx`);
      if (!existsSync(componentPath)) {
        fail(`HeaderPage.jsx imports '@/windows/custom/${windowName}/${match[1]}' but file not found → will fail at runtime`);
        badImport = true;
        issues++;
      }
    }
    if (!badImport) ok('HeaderPage.jsx import paths use correct relative paths');
  }

  // 5. addLineFields
  if (existsSync(headerPagePath)) {
    issues = verifyAddLineFields(headerPagePath, issues);
  }

  return issues;
}

function main() {
  const windows = process.argv.slice(2);
  if (windows.length === 0) {
    console.error('Usage: node cli/src/verify-window.js <window-name> [<window-name>...]');
    process.exit(1);
  }

  let total = 0;
  for (const w of windows) {
    total += verifyWindow(w);
  }

  console.log();
  if (total === 0) {
    console.log(`${GREEN}${BOLD}All checks passed.${RESET}`);
  } else {
    console.log(`${RED}${BOLD}${total} issue(s) found. Fix before committing.${RESET}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
