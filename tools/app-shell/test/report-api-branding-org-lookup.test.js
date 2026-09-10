/**
 * ETP-5013 — company-logo lookup for LISTING reports (report-general-ledger,
 * balance-sheet, tax-report, etc.). Unlike document (print-*) reports, a
 * listing report has no `header` object at all — report-api.js resolves the
 * org's logo id via the shared `resolveCompanyLogoDataUrl(pool, { clientId,
 * orgId, authToken, etendoBase })` helper (`@etendosoftware/schema-forge-cli/
 * src/report-branding.js`), which itself prefers the report's own `orgId`
 * filter and falls back to any org of the same client that has a logo
 * configured (covers Inventory Stock Report / Order Not Shipped, which have
 * no `orgId` parameter at all).
 *
 * This lookup runs in THREE places in fetchReportData: the NEO branch (opens
 * its own short-lived pool, since NEO-sourced reports otherwise never touch
 * Postgres), the document branch (via `hydrateDocumentBranding` directly on
 * the header row, not through this helper), and the SQL/Jasper branch (reuses
 * the pool already open for the main query).
 *
 * fetchReportData's SQL/NEO branches talk to Postgres via a dynamically
 * imported `pg` Pool (`await import('pg')`) or fetch NEO directly, and this
 * suite has no existing mocking convention for intercepting the dynamic `pg`
 * import (see cli/test/neo-writer-upsert.test.js in the core repo for the
 * only pg-mocking pattern in either repo, which takes an already-constructed
 * client rather than intercepting the dynamic import). Driving these branches
 * end-to-end would require a real database. This test therefore verifies the
 * wiring against the REAL report-api.js source — same approach as
 * report-api-neo-accept-language.test.js's "report-api.js source" block — so
 * a future refactor that drops a branch's lookup, makes it unconditional, or
 * forgets to thread companyLogoDataUrl through to the template fails a test
 * instead of only showing up as a blank logo on a client's real listing PDF.
 * The exhaustive behavioral coverage of resolveCompanyLogoDataUrl itself
 * lives in the core repo's `cli/test/report-branding.test.js`.
 */
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PLUGIN_SRC = readFileSync(
  fileURLToPath(new URL('../vite-plugins/report-api.js', import.meta.url)),
  'utf8',
);

describe('report-api.js — listing report company-logo lookup (ETP-5013)', () => {
  it('imports resolveCompanyLogoDataUrl alongside hydrateDocumentBranding from the shared package', () => {
    assert.match(
      PLUGIN_SRC,
      /import \{ hydrateDocumentBranding, resolveCompanyLogoDataUrl \} from '@etendosoftware\/schema-forge-cli\/src\/report-branding\.js'/,
    );
  });

  it('resolves the logo for the SQL/Jasper listing branch via the shared helper, scoped by clientId and the report\'s own orgId param', () => {
    assert.match(
      PLUGIN_SRC,
      /const companyLogoDataUrl = await resolveCompanyLogoDataUrl\(pool, \{\s*\n\s*clientId, orgId: params\.orgId, authToken,/,
    );
  });

  it('resolves the logo for the NEO listing branch too — this branch has no DB access otherwise', () => {
    // Historically the first pass only wired resolveCompanyLogoDataUrl into
    // the SQL/Jasper branch, so every NEO-sourced listing report (Aging of
    // Payables/Receivables, Tax Report, Inventory Stock Report) silently
    // never got a logo. Guard both branches independently so that regression
    // cannot come back unnoticed in just one of them.
    assert.match(
      PLUGIN_SRC,
      /companyLogoDataUrl = await resolveCompanyLogoDataUrl\(logoPool, \{\s*\n\s*clientId, orgId: params\.orgId, authToken, etendoBase,/,
    );
  });

  it('opens its own short-lived pool for the NEO branch lookup and always closes it', () => {
    const neoBranchStart = PLUGIN_SRC.indexOf('Company logo (ETP-5013) — missed in the first pass');
    assert.ok(neoBranchStart >= 0, 'could not locate the NEO-branch company logo comment');
    const neoBranchSlice = PLUGIN_SRC.slice(neoBranchStart, neoBranchStart + 1600);
    assert.match(neoBranchSlice, /new pg\.default\.Pool\(/);
    assert.match(neoBranchSlice, /finally \{\s*\n\s*await logoPool\.end\(\);/);
  });

  it('does not resolve a logo for the NEO branch when gradle.properties (DB access) is unavailable', () => {
    const neoBranchStart = PLUGIN_SRC.indexOf('Company logo (ETP-5013) — missed in the first pass');
    const neoBranchSlice = PLUGIN_SRC.slice(neoBranchStart, neoBranchStart + 1600);
    assert.match(neoBranchSlice, /if \(gradlePath\) \{/,
      'the NEO-branch lookup must degrade gracefully (companyLogoDataUrl stays undefined) without a DB connection, never throw');
  });

  it('returns companyLogoDataUrl out of fetchReportData for both the NEO and SQL/listing branches', () => {
    assert.match(PLUGIN_SRC, /return \{ rows, contract, neoMeta, companyLogoDataUrl \}/, 'NEO branch return');
    assert.match(
      PLUGIN_SRC,
      /return \{ rows, contract, openingRows, operandRows, companyLogoDataUrl \}/,
      'SQL\/listing branch return',
    );
  });

  it('threads companyLogoDataUrl from fetchReportData into the /render handler', () => {
    assert.match(
      PLUGIN_SRC,
      /let \{ rows, contract, documentData, neoMeta = \{\}, openingRows, operandRows, companyLogoDataUrl \} = result/,
    );
  });

  it('puts companyLogoDataUrl in the listing meta, never in the document-branch meta', () => {
    const lines = PLUGIN_SRC.split('\n');
    const ternaryIndex = lines.findIndex((line) => line.includes('const templateData = documentData'));
    assert.ok(ternaryIndex >= 0, 'could not locate the templateData ternary declaration');
    const documentBranch = lines[ternaryIndex + 1];
    const listingBranch = lines[ternaryIndex + 2];
    assert.match(documentBranch, /^\s*\?\s*\{/, 'expected the document-branch object on the next line');
    assert.match(listingBranch, /^\s*:\s*\{/, 'expected the listing-branch object on the line after that');
    assert.ok(listingBranch.includes('companyLogoDataUrl'), 'listing branch must carry companyLogoDataUrl');
    assert.ok(!documentBranch.includes('companyLogoDataUrl'),
      'document branch must not — documents carry it on header.companyLogoDataUrl, set earlier by hydrateDocumentBranding');
  });

  it('falls back to an org_logo_id subquery for document reports when the header SQL does not already expose one', () => {
    assert.match(PLUGIN_SRC, /headerSql\.includes\('org_logo_id'\)/);
    assert.match(PLUGIN_SRC, /FROM ad_orginfo oi WHERE oi\.ad_org_id = org\.ad_org_id/);
  });

  it('resolves document-branch branding via hydrateDocumentBranding directly on the header row, not resolveCompanyLogoDataUrl', () => {
    assert.match(PLUGIN_SRC, /const header = await hydrateDocumentBranding\(headerResult\.rows\[0\] \|\| \{\}/);
  });
});
