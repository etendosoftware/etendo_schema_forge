import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Handlebars from 'handlebars';
import {
  registerReportHelpers,
  buildJsreportHelpersString,
} from '../../../templates/reports/helpers/report-html-helpers.js';
import { RETURN_LABELS, DOC_TYPE_LABEL_OVERRIDES } from '@etendosoftware/schema-forge-cli/src/report-i18n.js';

// ETP-5013 — Journal Entries "Detail"/"Detalle" column (document_type) i18n.
//
// `document_type` used to be `c_doctype.name`, a free-text per-tenant field
// that can never be a translation key by itself (verified against a real
// database: the same doctype is called "AP Invoice" in one client and
// "Factura Rectificativa (compras)" in another). The original fix keyed a
// row-level translation off the STABLE `docbasetype` (AD_Ref_List 183) via a
// hand-maintained JS dictionary (`DOC_TYPE_LABELS`).
//
// ETP-5013 follow-up replaces that hand-maintained dictionary with a REAL
// `LEFT JOIN ad_ref_list` / `ad_ref_list_trl` in the report's own SQL
// (`report-contract.json`), mirroring the `c_country_trl` join Tax Report
// does in Java — same principle, applied here to the shared `source: sql`
// report engine via the `__REPORT_LOCALE__` placeholder (`report-sql.js`).
// `document_type` now arrives from SQL ALREADY translated from Etendo's own
// source of truth. The only piece that remains hand-maintained is the
// MMR/MMS return-variant split (`RETURN_LABELS`, report-i18n.js): `IsReturn`
// has no equivalent code in `ad_ref_list`, so it can't come from the JOIN.
// `translateDocType()` in report-html-helpers.js now ONLY applies that
// override — for every other case it must return the incoming
// `translatedName` completely untouched.
//
// Every assertion here reads the REAL artifact source from disk (contract
// SQL, all three templates, mock-data.json) and renders through the REAL
// `registerReportHelpers()` / `buildJsreportHelpersString()` — never a
// hand-rolled copy of the helper — so a future edit that breaks the wiring
// fails here.

const ARTIFACT_DIR = resolve(import.meta.dirname, '../../../artifacts/report-journal-entries');
const CONTRACT = JSON.parse(readFileSync(resolve(ARTIFACT_DIR, 'report-contract.json'), 'utf8'));
const SQL = CONTRACT.sql.query;
// ETP-5013 added `{{> document-branding}}` to template.hbs's .report-header.
// It is NOT a native Handlebars partial (see report-api.js's own comment on
// expandReportPartials) — compiling it as-is throws "The partial
// document-branding could not be found". template-excel.hbs/template-csv.hbs
// never got the partial, so they need no expansion.
const REPORT_TEMPLATES_DIR = resolve(import.meta.dirname, '../../../templates/reports');
const BRANDING_PARTIAL = readFileSync(resolve(REPORT_TEMPLATES_DIR, 'document-branding.hbs'), 'utf8');
const TEMPLATE_HTML_SRC = readFileSync(resolve(ARTIFACT_DIR, 'template.hbs'), 'utf8')
  .replace(/\{\{>\s*document-branding\s*\}\}/g, BRANDING_PARTIAL);
const TEMPLATE_EXCEL_SRC = readFileSync(resolve(ARTIFACT_DIR, 'template-excel.hbs'), 'utf8');
const TEMPLATE_CSV_SRC = readFileSync(resolve(ARTIFACT_DIR, 'template-csv.hbs'), 'utf8');
const HELPERS_CODE = readFileSync(resolve(ARTIFACT_DIR, 'helpers.js'), 'utf8');
const MOCK_RAW = readFileSync(resolve(ARTIFACT_DIR, 'mock-data.json'), 'utf8');

// ── Part 1: SQL projects docbasetype + isreturn + the real ad_ref_list(_trl) JOIN ─

describe('report-journal-entries — docbasetype/isreturn SQL projection (ETP-5013)', () => {
  it('aggregates docbasetype inside the CTE, alongside its MAX(...) neighbours', () => {
    // ETP-5013 follow-up: dt.docbasetype is systematically NULL for rows
    // sourced from FIN_Finacc_Transaction / M_MatchInv / M_Inventory (their
    // fact_acct.c_doctype_id is never populated), so the projection falls
    // back to a CASE on ad_table.tablename for exactly those three tables.
    assert.match(
      SQL,
      /MAX\(COALESCE\(dt\.docbasetype,\s*CASE\s+UPPER\(adt\.tablename\)\s+WHEN\s+'FIN_FINACC_TRANSACTION'\s+THEN\s+'FAT'\s+WHEN\s+'M_MATCHINV'\s+THEN\s+'MXI'\s+WHEN\s+'M_INVENTORY'\s+THEN\s+'MMI'\s+WHEN\s+'A_AMORTIZATION'\s+THEN\s+'AMZ'\s+ELSE\s+NULL\s+END\)\)\s+AS\s+docbasetype/i,
    );
  });

  it('falls back to NULL (not a guessed code) for any table not in the three known mappings', () => {
    const caseBlock = SQL.slice(
      SQL.indexOf('CASE UPPER(adt.tablename) WHEN'),
      SQL.indexOf('AS docbasetype'),
    );
    assert.match(caseBlock, /ELSE\s+NULL\s+END/i);
  });

  it('maps each of the three affected tables to its documented docbasetype code', () => {
    const caseBlock = SQL.slice(
      SQL.indexOf('CASE UPPER(adt.tablename) WHEN'),
      SQL.indexOf('AS docbasetype'),
    );
    assert.match(caseBlock, /WHEN\s+'FIN_FINACC_TRANSACTION'\s+THEN\s+'FAT'/i);
    assert.match(caseBlock, /WHEN\s+'M_MATCHINV'\s+THEN\s+'MXI'/i);
    assert.match(caseBlock, /WHEN\s+'M_INVENTORY'\s+THEN\s+'MMI'/i);
    // ETP-5013 follow-up: A_Amortization posts fact_acct rows with no
    // c_doctype at all, so document_type used to fall through to the
    // literal 'Journal'. ad_ref_list reference 183 already ships an
    // 'AMZ' -> "Amortization"/"Amortizacion" entry, so mapping the table
    // here makes the existing rl/rlt joins resolve the real label (and
    // its translation) for free — same mechanism as FAT/MXI/MMI.
    assert.match(caseBlock, /WHEN\s+'A_AMORTIZATION'\s+THEN\s+'AMZ'/i);
  });

  it('reuses the existing adt (ad_table) join already used by doc_window — no new join to ad_table added', () => {
    assert.match(SQL, /LEFT JOIN ad_table adt ON adt\.ad_table_id = fa\.ad_table_id/i);
    // Exactly one join to ad_table — the docbasetype fallback and doc_window
    // CASE share the same `adt` alias, per the fix description.
    const joinCount = (SQL.match(/LEFT JOIN ad_table adt/gi) || []).length;
    assert.equal(joinCount, 1);
  });

  it('aggregates isreturn inside the CTE, alongside its MAX(...) neighbours', () => {
    assert.match(SQL, /MAX\(dt\.isreturn\)\s+AS\s+isreturn/i);
  });

  it('projects docbasetype in the outer SELECT so the template can read it', () => {
    const outerSelect = SQL.slice(0, SQL.lastIndexOf('FROM je'));
    const lastSelect = outerSelect.slice(outerSelect.lastIndexOf('SELECT'));
    assert.match(lastSelect, /\bdocbasetype\b/);
  });

  it('projects isreturn in the outer SELECT so the template can read it', () => {
    const outerSelect = SQL.slice(0, SQL.lastIndexOf('FROM je'));
    const lastSelect = outerSelect.slice(outerSelect.lastIndexOf('SELECT'));
    assert.match(lastSelect, /\bisreturn\b/);
  });

  it('still projects document_type as the fallback text for docbasetypes not in the dictionary', () => {
    const outerSelect = SQL.slice(0, SQL.lastIndexOf('FROM je'));
    const lastSelect = outerSelect.slice(outerSelect.lastIndexOf('SELECT'));
    assert.match(lastSelect, /\bdocument_type\b/);
  });

  it('joins ad_ref_list on the fixed DocBaseType reference (183), matching the same fallback-resolved docbasetype expression used for the docbasetype column', () => {
    assert.match(
      SQL,
      /LEFT JOIN ad_ref_list rl\s+ON\s+rl\.ad_reference_id = '183'\s+AND\s+rl\.value = COALESCE\(dt\.docbasetype,\s*CASE\s+UPPER\(adt\.tablename\)\s+WHEN\s+'FIN_FINACC_TRANSACTION'\s+THEN\s+'FAT'\s+WHEN\s+'M_MATCHINV'\s+THEN\s+'MXI'\s+WHEN\s+'M_INVENTORY'\s+THEN\s+'MMI'\s+WHEN\s+'A_AMORTIZATION'\s+THEN\s+'AMZ'\s+ELSE\s+NULL\s+END\)/i,
    );
  });

  it('joins ad_ref_list_trl on the resolved ad_ref_list row, scoped by the __REPORT_LOCALE__ placeholder', () => {
    assert.match(
      SQL,
      /LEFT JOIN ad_ref_list_trl rlt\s+ON\s+rlt\.ad_ref_list_id = rl\.ad_ref_list_id\s+AND\s+rlt\.ad_language = '__REPORT_LOCALE__'/i,
    );
  });

  it('resolves document_type by preferring the translated name, then the base ad_ref_list name, then the raw c_doctype name, then the literal "Journal"', () => {
    assert.match(
      SQL,
      /COALESCE\(MAX\(rlt\.name\),\s*MAX\(rl\.name\),\s*MAX\(dt\.name\),\s*'Journal'\)\s+AS\s+document_type/i,
    );
  });

  it('never leaves the old raw COALESCE(MAX(dt.name), \'Journal\') shape — the translated columns must come first', () => {
    assert.doesNotMatch(SQL, /COALESCE\(MAX\(dt\.name\),\s*'Journal'\)/i);
  });
});

// ── Part 2: real render through all three templates, both locales ──────────
//
// `document_type` on each fixture row below simulates the value SQL now
// hands the template — i.e. ALREADY translated (as if it came from the
// ad_ref_list_trl JOIN). translateDocType() has TWO jobs, checked in order:
//   1. MMR/MMS isreturn='Y' → RETURN_LABELS (unchanged since ETP-5013 —
//      IsReturn has no equivalent in ad_ref_list, so this stays hand-maintained).
//   2. Otherwise, an UNCONDITIONAL per-docbasetype relabel via
//      DOC_TYPE_LABEL_OVERRIDES (ETP-5356) — this now covers MXI, ARI, API,
//      MMR (non-return), MMS (non-return), MMI, APP, GLJ and ARR, not just
//      MXI as before. A docbasetype absent from DOC_TYPE_LABEL_OVERRIDES
//      (FAT, AMZ, or no docbasetype at all) still passes the SQL-supplied
//      name through completely untouched.

const CASES = [
  // [docbasetype, isreturn, sqlTranslatedName, en_US expected, es_ES expected]
  // Regular (non-return) MMR: ETP-5356 added MMR to DOC_TYPE_LABEL_OVERRIDES,
  // so this now relabels to "Goods Receipt"/"Albarán de Compra" regardless of
  // the SQL-supplied name — no longer a plain pass-through.
  ['MMR', 'N', 'Material Receipt', DOC_TYPE_LABEL_OVERRIDES.en_US.MMR, DOC_TYPE_LABEL_OVERRIDES.es_ES.MMR],
  // MMR return: the isreturn='Y' branch is checked FIRST, so RETURN_LABELS
  // still wins over DOC_TYPE_LABEL_OVERRIDES for this one combination — this
  // is the ONLY case where isreturn changes the outcome.
  ['MMR', 'Y', 'Material Receipt', RETURN_LABELS.en_US.MMR_RETURN, RETURN_LABELS.es_ES.MMR_RETURN],
  // Regular (non-return) MMS: same ETP-5356 relabel as MMR above.
  ['MMS', 'N', 'Material Shipment', DOC_TYPE_LABEL_OVERRIDES.en_US.MMS, DOC_TYPE_LABEL_OVERRIDES.es_ES.MMS],
  ['MMS', 'Y', 'Material Shipment', RETURN_LABELS.en_US.MMS_RETURN, RETURN_LABELS.es_ES.MMS_RETURN],
  // ARI/API: ETP-5356 unconditionally relabels these too, independent of
  // isreturn — 'N' here is incidental, not what triggers the override.
  ['ARI', 'N', 'AR Invoice', DOC_TYPE_LABEL_OVERRIDES.en_US.ARI, DOC_TYPE_LABEL_OVERRIDES.es_ES.ARI],
  ['API', 'N', 'AP Invoice', DOC_TYPE_LABEL_OVERRIDES.en_US.API, DOC_TYPE_LABEL_OVERRIDES.es_ES.API],
  // FAT/AMZ/no-docbasetype: absent from DOC_TYPE_LABEL_OVERRIDES — the only
  // remaining TRUE pass-through cases, still verbatim in both locales.
  ['FAT', null, 'Financial Account Transaction', 'Financial Account Transaction', 'Financial Account Transaction'],
  ['MXI', null, 'Match Invoice', DOC_TYPE_LABEL_OVERRIDES.en_US.MXI, DOC_TYPE_LABEL_OVERRIDES.es_ES.MXI],
  // MMI: ETP-5356 added this to DOC_TYPE_LABEL_OVERRIDES too.
  ['MMI', null, 'Material Physical Inventory', DOC_TYPE_LABEL_OVERRIDES.en_US.MMI, DOC_TYPE_LABEL_OVERRIDES.es_ES.MMI],
  ['AMZ', null, 'Amortization', 'Amortization', 'Amortization'],
  [null, null, 'Journal', 'Journal', 'Journal'],
];

function makeRow(i, [docbasetype, isreturn, sqlTranslatedName]) {
  return {
    dateacct: '2026-01-15',
    entry_no: i + 1,
    document_type: sqlTranslatedName,
    docbasetype,
    isreturn,
    doc_window: null,
    entry_description: '',
    bpname: null,
    productname: null,
    projectname: null,
    costcentername: null,
    fact_acct_group_id: `group-${i + 1}`,
    record_id: `REC${String(i + 1).padStart(29, '0')}`,
    ad_table_id: '318',
    account_no: '43000',
    account_name: 'Clientes',
    amtacctdr: 100,
    amtacctcr: 0,
  };
}

// The document_type fed into each row simulates what SQL would have resolved
// for a given locale. For these fixtures the same string is reused across
// both locales (no localized-name variance is needed to prove the override
// logic) — the return-variant cases still hand in the PRE-override name
// (what ad_ref_list_trl resolved, ignoring isreturn) since translateDocType
// is expected to discard it in favour of RETURN_LABELS.
const ROWS = CASES.map((c, i) => makeRow(i, c));

function baseMeta(locale) {
  return {
    title: 'Journal Entries',
    generatedAt: '2026-01-15',
    filters: [],
    locale,
    labels: {},
    params: { showDimensions: 'false', showEntryDescription: 'false' },
    ui: { generatedBy: 'test' },
  };
}

function renderHtmlLike(templateSrc, rows, locale) {
  const hb = Handlebars.create();
  registerReportHelpers(hb, HELPERS_CODE);
  return hb.compile(templateSrc)({ css: '', rows, meta: baseMeta(locale) });
}

function renderCsv(rows, locale) {
  const built = buildJsreportHelpersString(HELPERS_CODE);
  const helperNames = [...built.matchAll(/^function\s+(\w+)\s*\(/gm)].map((m) => m[1]);
  // eslint-disable-next-line no-new-func
  const helpers = new Function(`${built}\nreturn { ${helperNames.join(', ')} };`)();
  const hb = Handlebars.create();
  for (const [name, fn] of Object.entries(helpers)) hb.registerHelper(name, fn);
  return hb.compile(TEMPLATE_CSV_SRC)({ meta: baseMeta(locale), rows });
}

describe('report-journal-entries — translateDocType: MMR/MMS return split PLUS the unconditional DOC_TYPE_LABEL_OVERRIDES relabel (ETP-5013 + ETP-5356)', () => {
  it('a regular (isreturn=N) MMR row is relabeled via DOC_TYPE_LABEL_OVERRIDES, discarding the SQL-supplied name, in both locales (ETP-5356)', () => {
    for (const locale of ['en_US', 'es_ES']) {
      const row = makeRow(0, ['MMR', 'N', 'Material Receipt']);
      const html = renderHtmlLike(TEMPLATE_HTML_SRC, [row], locale);
      const cells = [...html.matchAll(/<td class="entry-detail"[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
      assert.equal(cells[0], DOC_TYPE_LABEL_OVERRIDES[locale].MMR);
      assert.notEqual(cells[0], 'Material Receipt');
    }
  });

  it('an MMR row with isreturn=Y is overridden to RETURN_LABELS.MMR_RETURN, discarding the SQL-supplied name, in both locales', () => {
    for (const locale of ['en_US', 'es_ES']) {
      const row = makeRow(0, ['MMR', 'Y', 'Material Receipt']);
      const html = renderHtmlLike(TEMPLATE_HTML_SRC, [row], locale);
      const cells = [...html.matchAll(/<td class="entry-detail"[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
      assert.equal(cells[0], RETURN_LABELS[locale].MMR_RETURN);
      assert.notEqual(cells[0], 'Material Receipt');
    }
  });

  it('an MMS row with isreturn=Y is overridden to RETURN_LABELS.MMS_RETURN, in both locales', () => {
    for (const locale of ['en_US', 'es_ES']) {
      const row = makeRow(0, ['MMS', 'Y', 'Material Shipment']);
      const html = renderHtmlLike(TEMPLATE_HTML_SRC, [row], locale);
      const cells = [...html.matchAll(/<td class="entry-detail"[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
      assert.equal(cells[0], RETURN_LABELS[locale].MMS_RETURN);
    }
  });

  it('an MMS row with isreturn=N is relabeled via DOC_TYPE_LABEL_OVERRIDES, not passed through (ETP-5356)', () => {
    const row = makeRow(0, ['MMS', 'N', 'Material Shipment']);
    const html = renderHtmlLike(TEMPLATE_HTML_SRC, [row], 'en_US');
    const cells = [...html.matchAll(/<td class="entry-detail"[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
    assert.equal(cells[0], DOC_TYPE_LABEL_OVERRIDES.en_US.MMS);
    assert.notEqual(cells[0], 'Material Shipment');
  });

  it('a non-MMR/MMS docbasetype with isreturn=Y is NOT return-overridden — RETURN_LABELS is scoped strictly to MMR/MMS (ARI still gets the separate, unconditional DOC_TYPE_LABEL_OVERRIDES relabel)', () => {
    const row = makeRow(0, ['ARI', 'Y', 'AR Invoice']);
    const html = renderHtmlLike(TEMPLATE_HTML_SRC, [row], 'en_US');
    const cells = [...html.matchAll(/<td class="entry-detail"[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
    // Proves isreturn='Y' alone does NOT reach RETURN_LABELS for a
    // non-MMR/MMS docbasetype (it would throw/return undefined-ish garbage
    // if it did) — the value below is entirely DOC_TYPE_LABEL_OVERRIDES's,
    // independent of isreturn.
    assert.equal(cells[0], DOC_TYPE_LABEL_OVERRIDES.en_US.ARI);
    assert.notEqual(cells[0], RETURN_LABELS.en_US.MMR_RETURN);
    assert.notEqual(cells[0], RETURN_LABELS.en_US.MMS_RETURN);
  });

  it('isreturn=Y on a docbasetype outside DOC_TYPE_LABEL_OVERRIDES and outside MMR/MMS renders the SQL-supplied name verbatim — proves isreturn alone never triggers an override', () => {
    const row = makeRow(0, ['FAT', 'Y', 'Financial Account Transaction']);
    const html = renderHtmlLike(TEMPLATE_HTML_SRC, [row], 'en_US');
    const cells = [...html.matchAll(/<td class="entry-detail"[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
    assert.equal(cells[0], 'Financial Account Transaction');
  });

  it('every CASES combination renders its expected value (either a DOC_TYPE_LABEL_OVERRIDES/RETURN_LABELS relabel, or a true pass-through), in both locales', () => {
    for (const [docbasetype, isreturn, sqlTranslatedName, expEn, expEs] of CASES) {
      if (docbasetype === 'MMR' || docbasetype === 'MMS') continue; // covered above (return + non-return split)
      for (const [locale, expected] of [['en_US', expEn], ['es_ES', expEs]]) {
        const row = makeRow(0, [docbasetype, isreturn, sqlTranslatedName]);
        const html = renderHtmlLike(TEMPLATE_HTML_SRC, [row], locale);
        const cells = [...html.matchAll(/<td class="entry-detail"[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
        assert.equal(cells[0], expected, `docbasetype=${docbasetype} isreturn=${isreturn} locale=${locale}`);
      }
    }
  });

  it('leaves a docbasetype absent from DOC_TYPE_LABEL_OVERRIDES (FAT, AMZ, or none) rendering the SQL-supplied name verbatim, in both locales', () => {
    for (const [docbasetype, isreturn, sqlTranslatedName, expEn, expEs] of CASES) {
      if (!['FAT', 'AMZ', null].includes(docbasetype)) continue;
      for (const [locale, expected] of [['en_US', expEn], ['es_ES', expEs]]) {
        assert.equal(expected, sqlTranslatedName, `docbasetype=${docbasetype} locale=${locale} must stay a true pass-through`);
        const row = makeRow(0, [docbasetype, isreturn, sqlTranslatedName]);
        const html = renderHtmlLike(TEMPLATE_HTML_SRC, [row], locale);
        const cells = [...html.matchAll(/<td class="entry-detail"[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
        assert.equal(cells[0], expected);
      }
    }
  });

  it('never renders blank/undefined text for the no-docbasetype Journal row, in either locale', () => {
    for (const locale of ['en_US', 'es_ES']) {
      const row = makeRow(0, [null, null, 'Journal']);
      const html = renderHtmlLike(TEMPLATE_HTML_SRC, [row], locale);
      const cells = [...html.matchAll(/<td class="entry-detail"[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
      assert.equal(cells[0], 'Journal');
      assert.doesNotMatch(cells[0], /undefined/);
    }
  });
});

describe('report-journal-entries — template.hbs entry-detail cell rendering across a mixed batch (ETP-5013)', () => {
  for (const locale of ['en_US', 'es_ES']) {
    const html = renderHtmlLike(TEMPLATE_HTML_SRC, ROWS, locale);
    const cells = [...html.matchAll(/<td class="entry-detail"[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);

    it(`renders one entry-detail cell per accounting entry (${locale})`, () => {
      assert.equal(cells.length, CASES.length);
    });

    CASES.forEach(([docbasetype, isreturn, , expEn, expEs], i) => {
      const expected = locale === 'en_US' ? expEn : expEs;
      it(`row ${i} (docbasetype=${docbasetype} isreturn=${isreturn}) shows "${expected}" (${locale})`, () => {
        assert.equal(cells[i], expected);
      });
    });
  }

  it('the MMR regular receipt and MMR return render DIFFERENT text despite sharing docbasetype (en_US)', () => {
    const html = renderHtmlLike(TEMPLATE_HTML_SRC, ROWS, 'en_US');
    const cells = [...html.matchAll(/<td class="entry-detail"[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
    const receiptIdx = CASES.findIndex((c) => c[0] === 'MMR' && c[1] === 'N');
    const returnIdx = CASES.findIndex((c) => c[0] === 'MMR' && c[1] === 'Y');
    assert.notEqual(cells[receiptIdx], cells[returnIdx]);
  });

  it('the MMR regular receipt and MMR return render DIFFERENT text despite sharing docbasetype (es_ES)', () => {
    const html = renderHtmlLike(TEMPLATE_HTML_SRC, ROWS, 'es_ES');
    const cells = [...html.matchAll(/<td class="entry-detail"[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
    const receiptIdx = CASES.findIndex((c) => c[0] === 'MMR' && c[1] === 'N');
    const returnIdx = CASES.findIndex((c) => c[0] === 'MMR' && c[1] === 'Y');
    assert.notEqual(cells[receiptIdx], cells[returnIdx]);
  });
});

describe('report-journal-entries — template-excel.hbs document-type column rendering (ETP-5013)', () => {
  for (const locale of ['en_US', 'es_ES']) {
    const html = renderHtmlLike(TEMPLATE_EXCEL_SRC, ROWS, locale);

    CASES.forEach(([docbasetype, isreturn, , expEn, expEs], i) => {
      const expected = locale === 'en_US' ? expEn : expEs;
      it(`row ${i} (docbasetype=${docbasetype} isreturn=${isreturn}) shows "${expected}" (${locale})`, () => {
        assert.match(html, new RegExp(`<td>${expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</td>`));
      });
    });
  }

  it('the MMR regular receipt and MMR return render DIFFERENT text despite sharing docbasetype', () => {
    const html = renderHtmlLike(TEMPLATE_EXCEL_SRC, ROWS, 'en_US');
    assert.match(html, new RegExp(RETURN_LABELS.en_US.MMR_RETURN));
    // ETP-5356: the regular (non-return) MMR row is no longer a pass-through
    // of the raw SQL-supplied name — it too is relabeled, via
    // DOC_TYPE_LABEL_OVERRIDES, to "Goods Receipt".
    assert.match(html, new RegExp(DOC_TYPE_LABEL_OVERRIDES.en_US.MMR));
    assert.notEqual(RETURN_LABELS.en_US.MMR_RETURN, DOC_TYPE_LABEL_OVERRIDES.en_US.MMR);
  });
});

describe('report-journal-entries — template-csv.hbs document-type field rendering (ETP-5013)', () => {
  for (const locale of ['en_US', 'es_ES']) {
    const csv = renderCsv(ROWS, locale);

    CASES.forEach(([docbasetype, isreturn, , expEn, expEs], i) => {
      const expected = locale === 'en_US' ? expEn : expEs;
      it(`row ${i} (docbasetype=${docbasetype} isreturn=${isreturn}) includes "${expected}" in the CSV (${locale})`, () => {
        assert.match(csv, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      });
    });
  }

  it('never emits a comma-quoted document-type field — no value in RETURN_LABELS currently contains a comma', () => {
    for (const dict of Object.values(RETURN_LABELS)) {
      for (const value of Object.values(dict)) {
        assert.doesNotMatch(value, /,/, `unexpected comma in RETURN_LABELS value "${value}" — add a quoting sub-case if this ever changes`);
      }
    }
  });

  it('renders the Journal row as literal "Journal", never blank/undefined, in both locales', () => {
    for (const locale of ['en_US', 'es_ES']) {
      const csv = renderCsv(ROWS, locale);
      assert.match(csv, /Journal/);
      assert.doesNotMatch(csv, /undefined/);
    }
  });
});

// ── Part 3: mock-data.json carries docbasetype/isreturn and renders correctly ─

describe('report-journal-entries — mock-data.json docbasetype/isreturn coverage (ETP-5013)', () => {
  const MOCK = JSON.parse(MOCK_RAW);

  it('is valid JSON with a non-empty array of rows', () => {
    assert.ok(Array.isArray(MOCK));
    assert.ok(MOCK.length > 0);
  });

  it('declares docbasetype and isreturn on every row (even when null)', () => {
    for (const [i, row] of MOCK.entries()) {
      assert.ok(Object.prototype.hasOwnProperty.call(row, 'docbasetype'), `mock row ${i} is missing docbasetype`);
      assert.ok(Object.prototype.hasOwnProperty.call(row, 'isreturn'), `mock row ${i} is missing isreturn`);
    }
  });

  it('leaves the Journal entry (entry_no 1) with a null docbasetype/isreturn', () => {
    for (const row of MOCK.filter((r) => r.entry_no === 1)) {
      assert.equal(row.docbasetype, null);
      assert.equal(row.isreturn, null);
    }
  });

  it('tags the AR Invoice entry with docbasetype ARI, isreturn N', () => {
    const rows = MOCK.filter((r) => r.document_type === 'AR Invoice');
    assert.ok(rows.length > 0, 'no AR Invoice rows in mock-data.json');
    for (const row of rows) {
      assert.equal(row.docbasetype, 'ARI');
      assert.equal(row.isreturn, 'N');
    }
  });

  it('tags the AP Invoice entry with docbasetype API, isreturn N', () => {
    const rows = MOCK.filter((r) => r.document_type === 'AP Invoice');
    assert.ok(rows.length > 0, 'no AP Invoice rows in mock-data.json');
    for (const row of rows) {
      assert.equal(row.docbasetype, 'API');
      assert.equal(row.isreturn, 'N');
    }
  });

  it('renders mock rows through the real template without throwing, in both locales', () => {
    for (const locale of ['en_US', 'es_ES']) {
      assert.doesNotThrow(() => renderHtmlLike(TEMPLATE_HTML_SRC, MOCK, locale));
    }
  });

  it('renders the Journal row verbatim, but relabels the ARI/API mock rows via DOC_TYPE_LABEL_OVERRIDES (ETP-5356) — no MMR/MMS rows in this fixture, so RETURN_LABELS never applies here', () => {
    assert.ok(
      MOCK.every((r) => r.docbasetype !== 'MMR' && r.docbasetype !== 'MMS'),
      'mock-data.json now contains an MMR/MMS row — extend this test to also cover the return-override case',
    );
    for (const locale of ['en_US', 'es_ES']) {
      const html = renderHtmlLike(TEMPLATE_HTML_SRC, MOCK, locale);
      const cells = [...html.matchAll(/<td class="entry-detail"[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
      const journalIdx = MOCK.findIndex((r) => r.entry_no === 1);
      const arIdx = MOCK.findIndex((r) => r.document_type === 'AR Invoice');
      const apIdx = MOCK.findIndex((r) => r.document_type === 'AP Invoice');
      // entry-detail cells are only emitted on group-break rows (first row of
      // each fact_acct_group_id), so find which cell index corresponds to each
      // entry by counting distinct groups seen up to that mock row.
      const groupOrder = [];
      for (const row of MOCK) {
        if (!groupOrder.includes(row.fact_acct_group_id)) groupOrder.push(row.fact_acct_group_id);
      }
      const journalCellIdx = groupOrder.indexOf(MOCK[journalIdx].fact_acct_group_id);
      const arCellIdx = groupOrder.indexOf(MOCK[arIdx].fact_acct_group_id);
      const apCellIdx = groupOrder.indexOf(MOCK[apIdx].fact_acct_group_id);
      assert.equal(cells[journalCellIdx], 'Journal');
      assert.equal(cells[arCellIdx], DOC_TYPE_LABEL_OVERRIDES[locale].ARI);
      assert.equal(cells[apCellIdx], DOC_TYPE_LABEL_OVERRIDES[locale].API);
    }
  });
});
