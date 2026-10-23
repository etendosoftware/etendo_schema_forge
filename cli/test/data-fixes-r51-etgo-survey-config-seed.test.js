// @covers cli/src/data-fixes/sql/20261021T120000Z__R51-etgo-survey-config-seed.sql
// @covers cli/src/data-fixes/run.js
// @covers cli/src/data-fixes/parse-fix.js
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFix, parseFixTimestamp, inlineFreshUuids } from '../src/data-fixes/parse-fix.js';
import { loadCatalogWithRetirement, cmdTargetedFix, applyChain } from '../src/data-fixes/run.js';

/**
 * Static + runner-level validation for the R51 corrective data-fix
 * (20261021T120000Z__R51-etgo-survey-config-seed.sql, ETP-5870, gap Q1).
 *
 * Seeds the three tables backing the "Survey Configuration" window
 * (ETGO_Survey_Config, ETGO_Survey_Type, ETGO_Survey_Canned_Resp) once, as
 * System-pseudo-tenant rows (ad_client_id='0'), following the same "System
 * pseudo-tenant singleton" pattern documented for gap O1
 * (20260924T120000Z__R40-aeatsii-cause-exemption-catalog.sql) and gap U1
 * (20261019T120000Z__R50-tax-category-old-iva-normal-deactivate.sql).
 *
 * RESOLVED ISSUES (tester-functional found both before this shipped to REVIEW;
 * tenant-fixer fixed both in this revision — see the fix file's own "Fixed
 * during QA" header section):
 *  1. Every `@uuid_<KEY>@` placeholder originally used an underscore inside
 *     KEY (e.g. `@uuid_NPS_SPEED_EN@`). `inlineFreshUuids`'s `UUID_TOKEN`
 *     regex (`cli/src/data-fixes/parse-fix.js`) only accepts `[0-9A-Za-z]+` —
 *     no underscore — so those 38 canned-response placeholders were left
 *     unresolved and would have inserted the literal placeholder string as a
 *     primary key. Fixed by renaming every placeholder to an alnum-only key
 *     (e.g. `NPSSPEEDEN`) instead of widening the shared regex (a
 *     framework-wide change out of scope for this fix). Verified below: every
 *     uuid label in the fix is now alnum-only, and `inlineFreshUuids` leaves
 *     no `@uuid_` token unresolved.
 *  2. Neither `@check` nor any `@apply` statement filtered
 *     `ad_client_id = :client_id` anywhere (it only appeared as a literal
 *     being INSERTed), unlike R40/R50 (the O1/U1 precedents), which filter
 *     every statement by it — the repo's own "Mandatory rules" rule 1
 *     (`cli/src/data-fixes/sql/README.md`). Fixed by scoping every statement
 *     to `ad_client_id = :client_id`, mirroring R40/R50 exactly. Verified
 *     below: every `@check`/`@apply` guard now filters by it.
 *
 * ETP-5870 (Sentinel, QA on this revision): bug 2's fix was NECESSARY but not
 * SUFFICIENT — once every statement is scoped to the CALLER's `:client_id`, a
 * normal full sweep (`applyChain()`, no `--fix`/`--client`) still evaluates
 * R51 once per REAL tenant, and the existence branches still legitimately
 * read "needed" for each one (a real tenant genuinely has no row of its own
 * yet) — so `@apply` would reseed all 43 rows under every real tenant's own
 * `ad_client_id`, served GLOBALLY to every tenant sharing the install because
 * `SurveyConfigServlet`'s read queries carry no `ad_client_id` filter at all.
 * Sentinel reproduced this live (rolled-back transaction) against a real
 * `AD_Client_ID`. Fixed by tenant-fixer with a literal client guard at the
 * very top of `@check` (`WHERE :client_id = '0' AND (...)`), making the fix
 * structurally a no-op for any client other than the System pseudo-tenant.
 * The "executed through the real runner — a normal full sweep never applies
 * R51 for a real tenant" describe block below is the regression test for
 * this bug: it drives the REAL R51 SQL text (not a stand-in) through
 * `applyChain()` for a never-before-swept real `AD_Client_ID` and asserts the
 * fix converges to `SKIPPED_NOT_NEEDED` with 0 rows recorded — never
 * `APPLIED` — reproducing Postgres's own short-circuit on the baked literal
 * guard rather than hand-waving the result.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX_FILE = '20261021T120000Z__R51-etgo-survey-config-seed.sql';
const FIX_PATH = join(__dirname, '..', 'src', 'data-fixes', 'sql', FIX_FILE);
const FIX_ID = basename(FIX_FILE, '.sql');
const FIX_ARG = 'R51-etgo-survey-config-seed';

const rawText = readFileSync(FIX_PATH, 'utf8');
const fix = parseFix(rawText, FIX_ID);

const norm = (s) => s.replace(/\s+/g, ' ').trim();
const sqlOnly = (s) => norm(s.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n'));
const sqlCheck = sqlOnly(fix.check);
const sqlApply = sqlOnly(fix.apply);

// ---------------------------------------------------------------------------
// Header metadata
// ---------------------------------------------------------------------------

describe('R51 etgo-survey-config-seed data-fix — header metadata', () => {
  it('parses with the expected id and gap', () => {
    assert.equal(fix.id, 'R51-etgo-survey-config-seed');
    assert.equal(fix.gap, 'Q1');
  });

  it('is a low-risk sql fix', () => {
    assert.equal(fix.type, 'sql');
    assert.equal(fix.risk, 'low');
  });

  it('is an ordinary chain fix, not opt-in', () => {
    assert.equal(fix.optIn, false);
  });

  it('has a first-line description naming the three seeded tables', () => {
    assert.ok(fix.description);
    assert.match(fix.description, /ETGO_Survey_Config/);
    assert.match(fix.description, /ETGO_Survey_Type/);
    assert.match(fix.description, /ETGO_Survey_Canned_Resp/);
  });

  it('has non-empty @check and @apply sections', () => {
    assert.ok(fix.check.length > 0);
    assert.ok(fix.apply.length > 0);
  });

  it('sorts after every existing fix, including the latest R50 pair', () => {
    const ts = parseFixTimestamp(FIX_ID);
    assert.equal(ts.toISOString(), '2026-10-21T12:00:00.000Z');
    assert.ok(
      ts.getTime() > parseFixTimestamp('20261019T120000Z__R50-tax-category-old-iva-normal-deactivate').getTime(),
      'must sort after R50-tax-category-old-iva-normal-deactivate',
    );
    assert.ok(
      ts.getTime() > parseFixTimestamp('20261019T141632Z__R50-gl-journal-foreign-doctype').getTime(),
      'must sort after the latest pre-existing fix in the catalog',
    );
  });

  it('documents the System pseudo-tenant --client 0 invocation', () => {
    assert.match(rawText, /--fix R51-etgo-survey-config-seed --client 0/);
  });

  it('records the relationship to the O1/U1 System-pseudo-tenant pattern in its own header', () => {
    assert.match(rawText, /\bO1\b/);
    assert.match(rawText, /\bU1\b/);
    assert.match(rawText, /System pseudo-tenant/);
  });
});

// ---------------------------------------------------------------------------
// Behavior 1 — @check detects "need" vs "already seeded"
// ---------------------------------------------------------------------------

describe('R51 etgo-survey-config-seed data-fix — @check detects need via three OR\'d conditions, all scoped to :client_id', () => {
  it('first branch: the config singleton has no row for :client_id', () => {
    assert.ok(sqlCheck.includes(
      'NOT EXISTS ( SELECT 1 FROM etgo_survey_config WHERE ad_client_id = :client_id )',
    ));
  });

  it('second branch: any of the 4 survey keys missing its header row for :client_id', () => {
    assert.ok(sqlCheck.includes("VALUES ('nps'), ('csat_onboarding'), ('csat_invoicing'), ('csat_order')"));
    assert.ok(sqlCheck.includes(
      'SELECT 1 FROM etgo_survey_type st WHERE st.ad_client_id = :client_id AND st.survey_key = k.survey_key',
    ));
  });

  it('third branch: insufficient canned responses for nps/csat_invoicing/csat_order, keyed by expected count, scoped to :client_id', () => {
    assert.ok(sqlCheck.includes("VALUES ('nps', 14), ('csat_invoicing', 12), ('csat_order', 12)"));
    assert.ok(sqlCheck.includes('WHERE st.ad_client_id = :client_id AND ('));
    assert.ok(sqlCheck.includes(
      'SELECT COUNT(*) FROM etgo_survey_canned_resp cr ' +
      'WHERE cr.ad_client_id = :client_id AND cr.etgo_survey_type_id = st.etgo_survey_type_id ) < expected.canned_count',
    ));
  });

  it('never gates on a canned-response count for csat_onboarding (it has no fallback list to seed)', () => {
    assert.ok(!sqlCheck.includes("('csat_onboarding',"), 'csat_onboarding must not appear as a 2-tuple in the canned-count VALUES');
  });

  it('the three branches are OR\'d, so any single unmet condition is enough to report "needed"', () => {
    const orCount = (sqlCheck.match(/\bOR EXISTS\b/g) || []).length;
    assert.equal(orCount, 2, 'exactly two OR EXISTS branches alongside the leading NOT EXISTS branch');
  });

  it('mandatory rule 1 (sql/README.md): every branch filters ad_client_id = :client_id, exactly like R40/R50', () => {
    const filterCount = (sqlCheck.match(/ad_client_id = :client_id/g) || []).length;
    assert.equal(filterCount, 4, 'config branch + survey-type branch + canned-count branch (table + subquery)');
  });
});

// ---------------------------------------------------------------------------
// Behavior 2 — @apply inserts exactly 43 rows (1 + 4 + 38) with documented values
// ---------------------------------------------------------------------------

describe('R51 etgo-survey-config-seed data-fix — @apply inserts exactly 43 rows', () => {
  const inserts = sqlApply.split(/INSERT INTO/i).filter((s) => s.trim().length > 0);

  it('has exactly 43 INSERT statements', () => {
    assert.equal(inserts.length, 43);
  });

  it('splits into 1 config + 4 survey types + 38 canned responses', () => {
    const configCount = inserts.filter((s) => s.trim().startsWith('etgo_survey_config ')).length;
    const typeCount = inserts.filter((s) => s.trim().startsWith('etgo_survey_type ')).length;
    const cannedCount = inserts.filter((s) => s.trim().startsWith('etgo_survey_canned_resp ')).length;
    assert.equal(configCount, 1);
    assert.equal(typeCount, 4);
    assert.equal(cannedCount, 38);
  });

  it('every insert carries its own distinct @uuid_<...>@ label', () => {
    const labels = [...fix.apply.matchAll(/@uuid_([0-9A-Za-z_]+)@/g)].map((m) => m[1]);
    assert.equal(labels.length, 43);
    assert.equal(new Set(labels).size, 43, 'every uuid label is distinct — no two inserts share one id');
  });

  it('every uuid label is alnum-only (no underscore), so inlineFreshUuids actually resolves it', () => {
    // UUID_TOKEN in parse-fix.js is /@uuid_([0-9A-Za-z]+)@/g -- no underscore. An
    // underscored key (the bug this revision fixed) would silently fail to match and
    // leave the literal placeholder string as the row's primary key.
    const labels = [...fix.apply.matchAll(/@uuid_([0-9A-Za-z_]+)@/g)].map((m) => m[1]);
    for (const label of labels) {
      assert.doesNotMatch(label, /_/, `uuid label "${label}" must not contain an underscore`);
    }
  });

  it('inlineFreshUuids resolves every @uuid_<KEY>@ placeholder — none survive in the templated SQL', () => {
    const inlined = inlineFreshUuids(fix.apply);
    assert.doesNotMatch(inlined, /@uuid_/, 'no unresolved uuid placeholder may reach the database as a literal primary key');
  });

  it('inlineFreshUuids resolves all 43 placeholders to distinct, valid Etendo ids (32 uppercase hex chars)', () => {
    const inlined = inlineFreshUuids(fix.apply);
    const ids = [...inlined.matchAll(/'([0-9A-F]{32})'/g)].map((m) => m[1]);
    // Every id appears once as the row's own primary key (the 1st column of its SELECT);
    // some also appear again as st.etgo_survey_type_id is NOT a literal (it's a column
    // reference), so the literal-id count below is exactly the number of inserted rows.
    assert.equal(ids.length, 43, 'one fresh literal 32-hex id per insert');
    assert.equal(new Set(ids).size, 43, 'every resolved id is distinct');
  });
});

describe('R51 etgo-survey-config-seed data-fix — ETGO_SURVEY_CONFIG values', () => {
  it('seeds GLOBAL_COOLDOWN_DAYS=30, DISMISSED_COOLDOWN_DAYS=21, MAX_PER_MONTH=2, guarded for :client_id', () => {
    assert.ok(sqlApply.includes(
      "SELECT '@uuid_CFG@', :client_id, '0', 'Y', now(), '0', now(), '0', 30, 21, 2 " +
      "WHERE NOT EXISTS (SELECT 1 FROM etgo_survey_config WHERE ad_client_id = :client_id);",
    ));
  });
});

describe('R51 etgo-survey-config-seed data-fix — ETGO_SURVEY_TYPE values per key', () => {
  it('nps — MIN_ACCOUNT_AGE_DAYS=60, INACTIVITY_GUARD_DAYS=14, RESPONSE_COOLDOWN_DAYS=90', () => {
    assert.ok(sqlApply.includes(
      "SELECT '@uuid_NPS@', :client_id, '0', 'Y', now(), '0', now(), '0', 'nps', 60, 14, NULL, NULL, 90 " +
      "WHERE NOT EXISTS ( SELECT 1 FROM etgo_survey_type WHERE ad_client_id = :client_id AND survey_key = 'nps' );",
    ));
  });

  it('csat_onboarding — MIN_ACCOUNT_AGE_DAYS=1 (its own special-cased default, NOT the nps default of 60)', () => {
    assert.ok(sqlApply.includes(
      "SELECT '@uuid_CSATONB@', :client_id, '0', 'Y', now(), '0', now(), '0', 'csat_onboarding', " +
      '1, NULL, NULL, NULL, NULL ' +
      "WHERE NOT EXISTS ( SELECT 1 FROM etgo_survey_type WHERE ad_client_id = :client_id AND survey_key = 'csat_onboarding' );",
    ));
  });

  it('csat_invoicing — MIN_DOCUMENTS=5, DOCUMENT_GAP=30, RESPONSE_COOLDOWN_DAYS=90', () => {
    assert.ok(sqlApply.includes(
      "SELECT '@uuid_CSATINV@', :client_id, '0', 'Y', now(), '0', now(), '0', 'csat_invoicing', " +
      'NULL, NULL, 5, 30, 90 ' +
      "WHERE NOT EXISTS ( SELECT 1 FROM etgo_survey_type WHERE ad_client_id = :client_id AND survey_key = 'csat_invoicing' );",
    ));
  });

  it('csat_order — MIN_DOCUMENTS=5, DOCUMENT_GAP=30, RESPONSE_COOLDOWN_DAYS=90', () => {
    assert.ok(sqlApply.includes(
      "SELECT '@uuid_CSATORD@', :client_id, '0', 'Y', now(), '0', now(), '0', 'csat_order', " +
      'NULL, NULL, 5, 30, 90 ' +
      "WHERE NOT EXISTS ( SELECT 1 FROM etgo_survey_type WHERE ad_client_id = :client_id AND survey_key = 'csat_order' );",
    ));
  });

  it('every one of the 4 survey-type inserts filters ad_client_id = :client_id (mandatory rule 1)', () => {
    for (const key of ['nps', 'csat_onboarding', 'csat_invoicing', 'csat_order']) {
      assert.ok(
        sqlApply.includes(`WHERE NOT EXISTS ( SELECT 1 FROM etgo_survey_type WHERE ad_client_id = :client_id AND survey_key = '${key}' );`),
        `${key} insert must filter ad_client_id = :client_id`,
      );
    }
  });
});

/** Builds the normalized SELECT...guard text for one canned-response row, exactly as @apply emits it. */
function cannedInsertLine({ uuidLabel, lang, text, icon, line, surveyKey, min, max }) {
  const iconLit = icon ? `'${icon}'` : 'NULL';
  const sqlText = text.replace(/'/g, "''"); // SQL single-quote escaping, e.g. "Couldn't" -> "Couldn''t"
  return (
    `SELECT '@uuid_${uuidLabel}@', :client_id, '0', 'Y', now(), '0', now(), '0', ` +
    `'${lang}', ${iconLit}, '${sqlText}', ${line}, st.etgo_survey_type_id, ${min}, ${max} ` +
    `FROM etgo_survey_type st WHERE st.ad_client_id = :client_id AND st.survey_key = '${surveyKey}' ` +
    'AND NOT EXISTS ( SELECT 1 FROM etgo_survey_canned_resp cr ' +
    `WHERE cr.ad_client_id = :client_id AND cr.etgo_survey_type_id = st.etgo_survey_type_id ` +
    `AND cr.language = '${lang}' AND cr.line_no = ${line} );`
  );
}

const NPS_CANNED = [
  { key: 'SPEED', en: 'Speed', es: 'Velocidad', line: 10, min: 0, max: 10 },
  { key: 'DESIGN', en: 'Design', es: 'Diseño', line: 20, min: 0, max: 10 },
  { key: 'FEATURES', en: 'Features', es: 'Funcionalidad', line: 30, min: 0, max: 10 },
  { key: 'SUPPORT', en: 'Support', es: 'Soporte', line: 40, min: 0, max: 10 },
  { key: 'PRICE', en: 'Pricing', es: 'Precio', line: 50, min: 0, max: 10 },
  { key: 'DOCS', en: 'Documentation', es: 'Documentación', line: 60, min: 0, max: 10 },
  { key: 'AI', en: 'AI / Copilot', es: 'IA / Copilot', line: 70, min: 8, max: 10 },
];

const CSAT_INVOICING_CANNED = [
  { key: 'INV1', en: 'Too slow', es: 'Es lento', icon: '🐢', line: 10 },
  { key: 'INV2', en: 'Hard to use', es: 'Es difícil de usar', icon: '🤔', line: 20 },
  { key: 'INV3', en: 'Need more templates', es: 'Necesito más plantillas', icon: '📄', line: 30 },
  { key: 'INV4', en: 'VAT/tax handling is confusing', es: 'El IVA/impuestos es confuso', icon: '🧾', line: 40 },
  { key: 'INV5', en: 'Trouble sending to the client', es: 'Problemas al enviar al cliente', icon: '📤', line: 50 },
  { key: 'INV6', en: 'Ran into a bug', es: 'Tuve un error', icon: '🐛', line: 60 },
];

const CSAT_ORDER_CANNED = [
  { key: 'ORD1', en: 'Too slow', es: 'Es lento', icon: '🐢', line: 10 },
  { key: 'ORD2', en: 'Hard to use', es: 'Es difícil de usar', icon: '🤔', line: 20 },
  { key: 'ORD3', en: "Couldn't find the product", es: 'No encontré el producto', icon: '🔍', line: 30 },
  { key: 'ORD4', en: 'Hard to build order lines', es: 'Difícil armar las líneas de pedido', icon: '📋', line: 40 },
  { key: 'ORD5', en: 'Trouble confirming the order', es: 'Problemas al confirmar el pedido', icon: '✅', line: 50 },
  { key: 'ORD6', en: 'Ran into a bug', es: 'Tuve un error', icon: '🐛', line: 60 },
];

describe('R51 etgo-survey-config-seed data-fix — nps canned responses (14 rows, no icon, 0-10 band)', () => {
  for (const c of NPS_CANNED) {
    it(`${c.key} — en_US/es_ES, line ${c.line}, band ${c.min}-${c.max}`, () => {
      assert.ok(sqlApply.includes(cannedInsertLine({
        uuidLabel: `NPS${c.key}EN`, lang: 'en_US', text: c.en, icon: null, line: c.line, surveyKey: 'nps', min: c.min, max: c.max,
      })), `missing en_US row for ${c.key}`);
      assert.ok(sqlApply.includes(cannedInsertLine({
        uuidLabel: `NPS${c.key}ES`, lang: 'es_ES', text: c.es, icon: null, line: c.line, surveyKey: 'nps', min: c.min, max: c.max,
      })), `missing es_ES row for ${c.key}`);
    });
  }

  it('only the AI chip narrows the band to 8-10; every other nps chip keeps the full 0-10 range', () => {
    const narrowBand = NPS_CANNED.filter((c) => c.min === 8 && c.max === 10);
    const fullBand = NPS_CANNED.filter((c) => c.min === 0 && c.max === 10);
    assert.deepEqual(narrowBand.map((c) => c.key), ['AI']);
    assert.equal(fullBand.length, 6);
  });
});

describe('R51 etgo-survey-config-seed data-fix — csat_invoicing canned responses (12 rows, with icon, MIN_SCORE=1/MAX_SCORE=5 forced)', () => {
  for (const c of CSAT_INVOICING_CANNED) {
    it(`${c.key} — en_US/es_ES, line ${c.line}, icon ${c.icon}`, () => {
      assert.ok(sqlApply.includes(cannedInsertLine({
        uuidLabel: c.key + 'EN', lang: 'en_US', text: c.en, icon: c.icon, line: c.line, surveyKey: 'csat_invoicing', min: 1, max: 5,
      })), `missing en_US row for ${c.key}`);
      assert.ok(sqlApply.includes(cannedInsertLine({
        uuidLabel: c.key + 'ES', lang: 'es_ES', text: c.es, icon: c.icon, line: c.line, surveyKey: 'csat_invoicing', min: 1, max: 5,
      })), `missing es_ES row for ${c.key}`);
    });
  }
});

describe('R51 etgo-survey-config-seed data-fix — csat_order canned responses (12 rows, with icon, MIN_SCORE=1/MAX_SCORE=5 forced)', () => {
  for (const c of CSAT_ORDER_CANNED) {
    it(`${c.key} — en_US/es_ES, line ${c.line}, icon ${c.icon}`, () => {
      assert.ok(sqlApply.includes(cannedInsertLine({
        uuidLabel: c.key + 'EN', lang: 'en_US', text: c.en, icon: c.icon, line: c.line, surveyKey: 'csat_order', min: 1, max: 5,
      })), `missing en_US row for ${c.key}`);
      assert.ok(sqlApply.includes(cannedInsertLine({
        uuidLabel: c.key + 'ES', lang: 'es_ES', text: c.es, icon: c.icon, line: c.line, surveyKey: 'csat_order', min: 1, max: 5,
      })), `missing es_ES row for ${c.key}`);
    });
  }
});

describe('R51 etgo-survey-config-seed data-fix — correctness trap: every CSAT row forces MIN_SCORE=1/MAX_SCORE=5', () => {
  it('never relies on the ETGO_SURVEY_CANNED_RESP column default of MIN_SCORE=1/MAX_SCORE=3', () => {
    // Every one of the 24 csat_invoicing/csat_order rows explicitly writes ", 1, 5)" right
    // before its own closing guard — the trailing literal that would be wrong if the column
    // default (1-3) were relied upon instead.
    const forcedBand = (sqlApply.match(/st\.etgo_survey_type_id, 1, 5 FROM etgo_survey_type st WHERE st\.ad_client_id = :client_id AND st\.survey_key = '(csat_invoicing|csat_order)'/g) || []);
    assert.equal(forcedBand.length, 24, 'all 24 csat_invoicing/csat_order canned rows force the 1-5 band');
  });
});

// ---------------------------------------------------------------------------
// Behavior 3 — idempotency (two-layer: @check gates the run, @apply re-guards)
// ---------------------------------------------------------------------------

describe('R51 etgo-survey-config-seed data-fix — two-layer idempotency, scoped to :client_id', () => {
  it('the config insert is guarded by "no row exists for :client_id" (no uniqueness constraint on the table)', () => {
    const configInsert = sqlApply.split(/INSERT INTO/i).find((s) => s.trim().startsWith('etgo_survey_config '));
    assert.ok(configInsert);
    assert.match(configInsert, /WHERE NOT EXISTS \(SELECT 1 FROM etgo_survey_config WHERE ad_client_id = :client_id\);/);
  });

  it('each of the 38 canned-response inserts is independently guarded by NOT EXISTS on (ad_client_id, type_id, language, line_no), joined via (ad_client_id, survey_key) in the same statement', () => {
    const allCanned = [...NPS_CANNED.map((c) => ({ ...c, surveyKey: 'nps' })),
      ...CSAT_INVOICING_CANNED.map((c) => ({ ...c, surveyKey: 'csat_invoicing' })),
      ...CSAT_ORDER_CANNED.map((c) => ({ ...c, surveyKey: 'csat_order' }))];
    assert.equal(allCanned.length, 19, '19 chip entries x 2 languages = 38 rows');
    for (const c of allCanned) {
      for (const lang of ['en_US', 'es_ES']) {
        const guard =
          `FROM etgo_survey_type st WHERE st.ad_client_id = :client_id AND st.survey_key = '${c.surveyKey}' ` +
          'AND NOT EXISTS ( SELECT 1 FROM etgo_survey_canned_resp cr ' +
          `WHERE cr.ad_client_id = :client_id AND cr.etgo_survey_type_id = st.etgo_survey_type_id ` +
          `AND cr.language = '${lang}' AND cr.line_no = ${c.line} );`;
        assert.ok(sqlApply.includes(guard), `${c.key} ${lang} must be guarded by NOT EXISTS on (ad_client_id, type_id, language, line_no)`);
      }
    }
  });

  it('a canned-response insert is a no-op even when its parent survey-type row is missing for :client_id (the join finds nothing to select)', () => {
    // Structural guarantee: every canned INSERT resolves etgo_survey_type_id via
    // "FROM etgo_survey_type st WHERE st.ad_client_id = :client_id AND st.survey_key = '<key>'"
    // in the SAME statement, never a captured id from an earlier statement — so if that
    // parent row does not exist yet for this :client_id, the FROM produces zero rows and
    // nothing is inserted.
    const cannedInserts = sqlApply.split(/INSERT INTO/i).filter((s) => s.trim().startsWith('etgo_survey_canned_resp '));
    assert.equal(cannedInserts.length, 38);
    for (const insert of cannedInserts) {
      assert.match(insert, /FROM etgo_survey_type st WHERE st\.ad_client_id = :client_id AND st\.survey_key = '(nps|csat_invoicing|csat_order)'/);
    }
  });
});

// ---------------------------------------------------------------------------
// Behavior 4 + 5 — executed through the real runner: --client 0 apply, a normal
// full run never touching the System pseudo-tenant, and --dry-run opening no
// write transaction.
// ---------------------------------------------------------------------------

/**
 * A pg-pool stand-in for the System pseudo-tenant ('0'). Unlike the synthetic
 * `fakePool`/`tenantDbPool` in data-fixes-run.test.js, this one runs the REAL
 * R51 fix body (loaded from the actual catalog), so it answers every query
 * that is not a ledger/name lookup as the fix's own @check/@apply body and
 * just records it — the fix's own text is asserted on above; here we only
 * assert on the RUNNER's transaction/ledger behavior around it.
 */
function fakeSystemPool({ checkMatches = 1 } = {}) {
  const calls = { tx: [], ledgerWrites: [], fixBodies: [] };
  const query = async (sql, params) => {
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)) { calls.tx.push(sql); return {}; }
    if (sql.startsWith('SELECT ad_client_id, name FROM ad_client')) return { rows: [] };
    if (sql.includes('FROM etgo_data_fix_history WHERE remediated_client_id')) return { rows: [] };
    if (sql.includes('INSERT INTO etgo_data_fix_history')) {
      calls.ledgerWrites.push({ clientId: params[2], fixId: params[3], status: params[4] });
      return { rowCount: 1 };
    }
    calls.fixBodies.push(sql);
    return { rowCount: checkMatches, rows: [] };
  };
  return { calls, query, connect: async () => ({ query, release() {} }) };
}

describe('R51 etgo-survey-config-seed data-fix — executed through the real runner', () => {
  it('is present in the real catalog, as an ordinary (non-retired) fix', async () => {
    const catalog = await loadCatalogWithRetirement();
    const loaded = catalog.find((f) => f.fixId === FIX_ID);
    assert.ok(loaded, 'R51 must be loadable from the real sql/ catalog');
    assert.equal(loaded.retired, false);
    assert.equal(loaded.optIn, false);
  });

  it('--fix R51... --client 0 applies: @check then @apply run inside one transaction, ledger records APPLIED for client "0"', async () => {
    const catalog = await loadCatalogWithRetirement();
    const pool = fakeSystemPool({ checkMatches: 1 });
    const { failed } = await cmdTargetedFix(pool, catalog, { client: '0', fix: FIX_ARG, dryRun: false });
    assert.equal(failed, 0);
    assert.deepEqual(pool.calls.tx, ['BEGIN', 'COMMIT']);
    assert.deepEqual(pool.calls.ledgerWrites, [{ clientId: '0', fixId: FIX_ID, status: 'APPLIED' }]);
    assert.equal(pool.calls.fixBodies.length, 2, 'the @check body runs, then the @apply body');
  });

  it('--fix R51... --client 0 --dry-run runs @check only and opens no write transaction', async () => {
    const catalog = await loadCatalogWithRetirement();
    const pool = fakeSystemPool({ checkMatches: 1 });
    const { failed } = await cmdTargetedFix(pool, catalog, { client: '0', fix: FIX_ARG, dryRun: true });
    assert.equal(failed, 0);
    assert.deepEqual(pool.calls.tx, [], 'dry-run never opens BEGIN/COMMIT');
    assert.deepEqual(pool.calls.ledgerWrites, [], 'dry-run never writes the ledger');
    assert.equal(pool.calls.fixBodies.length, 1, 'only the @check body runs under --dry-run');
  });

  it('@check converges to SKIPPED_NOT_NEEDED, with no write transaction, once every row is already present', async () => {
    const catalog = await loadCatalogWithRetirement();
    const pool = fakeSystemPool({ checkMatches: 0 });
    const { failed } = await cmdTargetedFix(pool, catalog, { client: '0', fix: FIX_ARG, dryRun: false });
    assert.equal(failed, 0);
    assert.deepEqual(pool.calls.tx, []);
    assert.deepEqual(pool.calls.ledgerWrites, [{ clientId: '0', fixId: FIX_ID, status: 'SKIPPED_NOT_NEEDED' }]);
  });

  it('a normal full run never binds :client_id to the System pseudo-tenant — the tenant-universe queries hard-exclude it', async () => {
    // Structural guarantee shared by every fix (run.js, not fix-specific): resolveTenants()
    // and tenantsWithoutLedger() both filter `ad_client_id <> '0'`, so a normal full sweep
    // (no --fix) never even considers client '0' as a tenant to process — R51's @check is
    // the same body for every fix, never reached with :client_id='0' outside an explicit
    // `--fix R51-etgo-survey-config-seed --client 0` invocation.
    const run = readFileSync(join(__dirname, '..', 'src', 'data-fixes', 'run.js'), 'utf8');
    assert.match(run, /ad_client_id\s*<>\s*'0'/, 'resolveTenants/tenantsWithoutLedger exclude the System pseudo-tenant');
  });
});

// ---------------------------------------------------------------------------
// Behavior 6 (ETP-5870, Sentinel QA finding, gap Q1) — a normal full sweep
// (applyChain(), no --fix/--client) against a REAL, never-before-swept tenant
// must leave R51 at SKIPPED_NOT_NEEDED with 0 rows, NEVER APPLIED. This is the
// regression test for the bug Sentinel reproduced live before tenant-fixer
// added the literal `WHERE :client_id = '0' AND (...)` guard: scoping every
// statement to `ad_client_id = :client_id` (bug 2) is necessary but not
// sufficient on its own, because a real tenant genuinely has no row of its
// own yet, so the existence branches would still legitimately read "needed".
// ---------------------------------------------------------------------------

/** A syntactically valid, never-'0' Etendo id — AD_ID in parse-fix.js accepts 32 hex chars. */
const REAL_CLIENT_ID = 'A'.repeat(32);

/**
 * A pg-pool stand-in for a REAL tenant's first-ever full sweep (no ledger rows
 * for ANY fix yet, so applyChain's watermark is -Infinity and every
 * non-retired, non-opt-in chain fix in the REAL catalog gets its @check
 * evaluated — not just R51).
 *
 * R51's own @check/@apply bodies are identified by their target tables
 * (etgo_survey_config / etgo_survey_type / etgo_survey_canned_resp) and are
 * evaluated FOR REAL against the literal client guard `inlineParams` bakes in
 * place of `:client_id` — `WHERE '<clientId>' = '0' AND (...)`. This
 * reproduces Postgres's own short-circuit: once the leading equality is
 * literally false (any real, non-'0' client), the whole WHERE is false and 0
 * rows come back regardless of what the OR'd EXISTS branches would otherwise
 * report. If the guard is missing (the pre-fix shape, bug 3 above) or its
 * literal is '0', the existence branches are reached and — per the fix's own
 * documented bug-3 finding — legitimately read "needed" for ANY tenant,
 * modeled here as 1 row; this is what reproduces the historical bug if the
 * guard ever regresses.
 *
 * Every OTHER chain fix's @check is answered as "not needed" (0 rows), same
 * as `tenantDbPool`'s default in data-fixes-run.test.js, so the sweep runs to
 * completion without being derailed by unrelated fixture gaps — the
 * assertions below only examine what happened to R51.
 */
function fakeRealTenantFullSweepPool() {
  const calls = { tx: [], ledgerWrites: [], fixBodies: [] };
  const isR51Body = (sql) =>
    sql.includes('etgo_survey_config')
    || sql.includes('etgo_survey_type')
    || sql.includes('etgo_survey_canned_resp');
  const query = async (sql, params) => {
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)) { calls.tx.push(sql); return {}; }
    if (params === undefined) {
      // A fix body (@check/@apply) — run.js's inlineParams comment: node-postgres
      // cannot bind params to a multi-statement body, so these always arrive as a
      // single positional argument, never with a params array.
      calls.fixBodies.push(sql);
      if (!isR51Body(sql)) return { rowCount: 0 };
      // @apply is only ever reached after @check already reported "needed" (client
      // '0', or the pre-fix shape) — for a never-before-swept tenant all 43 rows are
      // genuinely new, so every INSERT succeeds.
      if (sql.includes('INSERT INTO')) return { rowCount: 43 };
      const guard = sql.match(/WHERE\s+'([^']*)'\s*=\s*'0'/);
      const needed = !guard || guard[1] === '0';
      return { rowCount: needed ? 1 : 0 };
    }
    if (sql.includes('FROM etgo_data_fix_history WHERE remediated_client_id')) return { rows: [] };
    if (sql.includes('INSERT INTO etgo_data_fix_history')) {
      calls.ledgerWrites.push({ clientId: params[2], fixId: params[3], status: params[4], rowsAffected: params[6] });
      return { rowCount: 1 };
    }
    if (sql.includes('SELECT ad_org_id FROM ad_org')) return { rows: [{ ad_org_id: 'F'.repeat(32) }] };
    if (sql.includes('SELECT name FROM ad_client WHERE ad_client_id = $1')) return { rows: [{ name: 'Real Tenant' }] };
    throw new Error(`fakeRealTenantFullSweepPool: unexpected SQL ${sql.slice(0, 80)}`);
  };
  return { calls, query, connect: async () => ({ query, release() {} }) };
}

describe('R51 etgo-survey-config-seed data-fix — executed through the real runner — a normal full sweep never applies R51 for a real tenant', () => {
  it('applyChain() against a never-before-swept REAL AD_Client_ID converges R51 to SKIPPED_NOT_NEEDED with 0 rows, never APPLIED', async () => {
    const catalog = await loadCatalogWithRetirement();
    const pool = fakeRealTenantFullSweepPool();

    const halted = await applyChain(pool, catalog, REAL_CLIENT_ID, new Map(), { dryRun: false });

    assert.equal(halted, false, 'the sweep must not halt (no fix may report FAILED in this fixture)');

    const r51Write = pool.calls.ledgerWrites.find((w) => w.fixId === FIX_ID);
    assert.ok(r51Write, 'R51 must be evaluated (and ledgered) during a normal full sweep for a real tenant');
    assert.equal(r51Write.clientId, REAL_CLIENT_ID);
    assert.equal(r51Write.status, 'SKIPPED_NOT_NEEDED', 'R51 must NEVER be APPLIED for a real, non-\'0\' client_id');
    assert.equal(r51Write.rowsAffected, 0, 'SKIPPED_NOT_NEEDED always ledgers 0 rows affected');
  });

  it('never sends R51\'s @apply body (its 43 INSERTs) to the database for a real tenant — only @check runs', async () => {
    const catalog = await loadCatalogWithRetirement();
    const pool = fakeRealTenantFullSweepPool();

    await applyChain(pool, catalog, REAL_CLIENT_ID, new Map(), { dryRun: false });

    // etgo_survey_config appears exactly once in @check (the first NOT EXISTS
    // branch) and exactly once in @apply (the single config INSERT) — so a
    // single match below means only @check ran; two would mean @apply ran too.
    const r51ConfigBodies = pool.calls.fixBodies.filter((s) => s.includes('etgo_survey_config'));
    assert.equal(r51ConfigBodies.length, 1, 'only @check may run for R51 against a real tenant — @apply must never fire');
    assert.ok(!r51ConfigBodies[0].includes('INSERT INTO etgo_survey_config'), 'the one body sent must be @check, not @apply');
  });

  it('the literal client guard is what causes this — a never-before-swept SYSTEM tenant (client \'0\') is genuinely APPLIED by the same sweep', async () => {
    // Contrast case: the ONLY thing that must differ between "real tenant" and
    // "System pseudo-tenant" is the literal `:client_id = '0'` guard itself —
    // confirming the mock's "needed" modeling for client '0' is not just
    // forcing SKIPPED_NOT_NEEDED unconditionally, which would make the test
    // above vacuous.
    const catalog = await loadCatalogWithRetirement();
    const pool = fakeRealTenantFullSweepPool();

    await applyChain(pool, catalog, '0', new Map(), { dryRun: false });

    const r51Write = pool.calls.ledgerWrites.find((w) => w.fixId === FIX_ID);
    assert.ok(r51Write);
    assert.equal(r51Write.status, 'APPLIED', 'client \'0\' is the one sanctioned target, and must still be seeded');
    assert.equal(r51Write.rowsAffected, 43, 'all 43 rows are inserted for the System pseudo-tenant');
  });
});
