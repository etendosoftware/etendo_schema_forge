#!/usr/bin/env node
/**
 * Selector inventory script for ETP-3955.
 *
 * Scans affected specs and reports selector field metadata:
 * inputMode, dependsOn, validationRule context params, and whether
 * context requirements are declared in decisions.json.
 *
 * Usage: node scripts/selector-inventory.js [spec1 spec2 ...]
 *   If no specs given, scans all known document specs.
 *
 * Output: CSV to stdout, redirect to file for analysis.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const artifactsDir = join(__dirname, '..', 'artifacts');

export const AFFECTED_SPECS = [
  'sales-order',
  'sales-quotation',
  'sales-invoice',
  'purchase-order',
  'purchase-invoice',
  'goods-receipt',
  'goods-shipment',
  'return-from-customer',
  'return-to-vendor',
  'return-material-receipt',
  'return-to-vendor-shipment',
];

export const CONTEXTUAL_FIELDS = new Set([
  'partnerAddress',
  'invoiceAddress',
  'priceList',
  'transactionDocument',
  'tax',
]);

export function readJson(filePath) {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

export function analyzeSpec(specName) {
  const specDir = join(artifactsDir, specName);
  const decisions = readJson(join(specDir, 'decisions.json'));
  const contract = readJson(join(specDir, 'contract.json'));

  const results = [];

  if (!contract?.apiPrediction?.selectors) {
    return results;
  }

  const windowCategory = contract.apiPrediction.window?.category ?? decisions?.window?.category ?? null;

  for (const sel of contract.apiPrediction.selectors) {
    if (!CONTEXTUAL_FIELDS.has(sel.field)) continue;

    // Look up field in frontend contract for dependsOn and validationRule
    const feEntity = contract.frontendContract?.entities?.[sel.entity];
    const feField = feEntity?.fields?.find(f => f.name === sel.field);

    const hasDependsOn = !!(feField?.dependsOn);
    const dependsOnField = feField?.dependsOn?.field ?? null;
    const dependsOnFilterKey = feField?.dependsOn?.filterKey ?? null;
    const hasValidationRule = !!(feField?.validationRule);
    const cascadeParams = feField?.validationRule?.cascadeParams ?? [];
    const contextParams = feField?.validationRule?.contextParams ?? [];

    // Check decisions for explicit dependsOn
    const entityDecisions = decisions?.entities?.[sel.entity];
    const fieldDecision = entityDecisions?.fields?.[sel.field];
    const decisionHasDependsOn = !!(fieldDecision?.dependsOn);

    results.push({
      spec: specName,
      entity: sel.entity,
      field: sel.field,
      column: sel.column,
      inputMode: sel.inputMode ?? feField?.inputMode ?? 'unknown',
      category: windowCategory,
      hasDependsOn,
      dependsOnField,
      dependsOnFilterKey,
      decisionHasDependsOn,
      hasValidationRule,
      cascadeParams: cascadeParams.join(';'),
      contextParams: contextParams.join(';'),
      reference: sel.reference ?? feField?.reference ?? null,
    });
  }

  return results;
}

export function main(args = process.argv.slice(2), writeLine = console.log) {
  const specs = args.length > 0 ? args : AFFECTED_SPECS;

  const header = 'spec,entity,field,column,inputMode,category,hasDependsOn,dependsOnField,dependsOnFilterKey,decisionHasDependsOn,hasValidationRule,cascadeParams,contextParams,reference';
  writeLine(header);

  for (const spec of specs) {
    const rows = analyzeSpec(spec);
    for (const r of rows) {
      writeLine(
        [
          r.spec,
          r.entity,
          r.field,
          r.column,
          r.inputMode,
          r.category,
          r.hasDependsOn,
          r.dependsOnField,
          r.dependsOnFilterKey,
          r.decisionHasDependsOn,
          r.hasValidationRule,
          r.cascadeParams,
          r.contextParams,
          r.reference,
        ].join(','),
      );
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
