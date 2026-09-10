/**
 * ETP-5013 — company logo on LISTING reports.
 *
 * Before this change, `templates/reports/document-branding.hbs` was only ever
 * referenced from print-* (document) templates — no listing report's
 * `template.hbs` included `{{> document-branding}}` at all, so even once the
 * engines started resolving `meta.companyLogoDataUrl`, there was no markup to
 * render it. Each of these 10 report artifacts gained the partial reference
 * inside its `.report-header` div (a sibling of `.report-title`, reusing the
 * existing `justify-content: space-between` flex layout already defined in
 * templates/reports/base.css — no CSS change needed).
 *
 * This is a source/structure check, not a full render — the full render
 * (both branches of the partial itself) is covered by
 * report-document-branding-partial.test.js.
 */
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Every listing report that gained the company-logo partial in ETP-5013.
// Kept explicit (not globbed) so a new listing report that should get the
// same treatment doesn't silently slip through uncovered.
const LISTING_REPORTS = [
  'report-general-ledger',
  'balance-sheet',
  'profit-loss',
  'inventory-stock-report',
  'report-journal-entries',
  'report-order-not-shipped',
  'report-trial-balance',
  'aging-payable',
  'aging-receivable',
  'tax-report',
];

function readTemplate(reportId) {
  return readFileSync(
    fileURLToPath(new URL(`../../../artifacts/${reportId}/template.hbs`, import.meta.url)),
    'utf8',
  );
}

describe('listing report templates — company logo partial (ETP-5013)', () => {
  for (const reportId of LISTING_REPORTS) {
    it(`${reportId}/template.hbs references {{> document-branding}} inside .report-header`, () => {
      const source = readTemplate(reportId);
      const headerMatch = source.match(/<div class="report-header">[\s\S]*?\n {2}<\/div>/);
      assert.ok(headerMatch, `${reportId}/template.hbs: could not locate a .report-header block`);
      assert.match(
        headerMatch[0],
        /\{\{>\s*document-branding\s*\}\}/,
        `${reportId}/template.hbs: .report-header does not reference the document-branding partial`,
      );
    });

    it(`${reportId}/template.hbs's .report-header also still renders {{meta.title}}`, () => {
      // Guards against the partial reference accidentally replacing the
      // title block instead of sitting alongside it.
      const source = readTemplate(reportId);
      const headerMatch = source.match(/<div class="report-header">[\s\S]*?\n {2}<\/div>/);
      assert.ok(headerMatch);
      assert.match(headerMatch[0], /\{\{meta\.title\}\}/);
    });
  }

  it('covers every listing report artifact with a report-header — no report silently skipped', () => {
    // Cross-check against the artifacts directory itself: any report-contract
    // with type !== 'document' and a template.hbs containing .report-header
    // should be in LISTING_REPORTS above (documents use a different header
    // markup entirely — see report-template-helpers-contract.test.js for
    // their own coverage).
    const artifactsDir = fileURLToPath(new URL('../../../artifacts', import.meta.url));
    const found = [];
    for (const dir of readdirSync(artifactsDir, { withFileTypes: true })) {
      if (!dir.isDirectory()) continue;
      const templatePath = join(artifactsDir, dir.name, 'template.hbs');
      const contractPath = join(artifactsDir, dir.name, 'report-contract.json');
      if (!existsSync(templatePath) || !existsSync(contractPath)) continue;
      const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
      if (contract.type === 'document') continue;
      const templateSrc = readFileSync(templatePath, 'utf8');
      if (templateSrc.includes('class="report-header"')) found.push(dir.name);
    }
    assert.deepEqual(found.sort(), [...LISTING_REPORTS].sort());
  });
});
