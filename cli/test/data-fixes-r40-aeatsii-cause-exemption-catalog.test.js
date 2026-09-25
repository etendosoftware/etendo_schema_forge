import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFix, parseFixTimestamp, inlineParams } from '../src/data-fixes/parse-fix.js';

/**
 * Static + parse validation for the R40 corrective data-fix
 * (20260924T120000Z__R40-aeatsii-cause-exemption-catalog.sql, ETP-5481, gap O1).
 *
 * REDESIGN (2026-09-25): this fix seeds the AEAT SII exemption-cause catalog
 * (E1-E6) ONCE as SYSTEM-owned rows (ad_client_id='0'), not per-tenant. The
 * standard DAL selector's client-visibility filter already surfaces
 * ad_client_id='0' rows to every tenant automatically, and GO ships no
 * maintenance window for this catalog, so the six causes never need to diverge
 * per client. An earlier per-tenant version of this same fix (same filename)
 * was abandoned before ever being applied to any tenant.
 *
 * The preventive twin is NOT an OnboardingDatasetDefinition.INCLUDED_TABLES
 * addition (that would seed a per-tenant copy again) — it is
 * `modules/com.etendoerp.go/src-db/database/sourcedata/AEATSII_CAUSE_EXEMPTION.xml`,
 * loaded once by `update.database` as module system data. This fix is a safety
 * net for instances where that sourcedata load has not (yet) happened.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX_FILE = '20260924T120000Z__R40-aeatsii-cause-exemption-catalog.sql';
const FIX_PATH = join(__dirname, '..', 'src', 'data-fixes', 'sql', FIX_FILE);
const FIX_ID = basename(FIX_FILE, '.sql');

const rawText = readFileSync(FIX_PATH, 'utf8');
const fix = parseFix(rawText, FIX_ID);

const norm = (s) => s.replace(/\s+/g, ' ').trim();
const sqlOnly = (s) => norm(s.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n'));
const normCheck = norm(fix.check);
const sqlCheck = sqlOnly(fix.check);
const sqlApply = sqlOnly(fix.apply);

const CAUSES = [
  ['E1', 'Exenta por el artículo 20 de la Ley del IVA'],
  ['E2', 'Exenta por el artículo 21 de la Ley del IVA'],
  ['E3', 'Exenta por el artículo 22 de la Ley del IVA'],
  ['E4', 'Exenta por los artículos 23 y 24 de la Ley del IVA'],
  ['E5', 'Exenta por el artículo 25 de la Ley del IVA'],
  ['E6', 'Exenta por otra causa'],
];

describe('R40 aeatsii-cause-exemption data-fix — header metadata', () => {
  it('parses with the expected id and gap', () => {
    assert.equal(fix.id, 'R40-aeatsii-cause-exemption-catalog');
    assert.equal(fix.gap, 'O1');
  });

  it('is a low-risk sql fix', () => {
    assert.equal(fix.type, 'sql');
    assert.equal(fix.risk, 'low');
  });

  it('has a first-line description referencing the ticket and SYSTEM rows', () => {
    assert.ok(fix.description);
    assert.match(fix.description, /ETP-5481/);
    assert.match(fix.description, /AEATSII_CAUSE_EXEMPTION/);
    assert.match(fix.description, /SYSTEM/i);
  });

  it('has non-empty @check and @apply sections', () => {
    assert.ok(fix.check.length > 0);
    assert.ok(fix.apply.length > 0);
  });

  it('sorts after every existing fix, including its own R17 predecessor', () => {
    const ts = parseFixTimestamp(FIX_ID);
    assert.equal(ts.toISOString(), '2026-09-24T12:00:00.000Z');
    assert.ok(
      ts.getTime() > parseFixTimestamp('20260803T120000Z__R17-sii-cause-exemption').getTime(),
      'must sort after R17-sii-cause-exemption',
    );
    assert.ok(
      ts.getTime() > parseFixTimestamp('20260922T130000Z__R39-document-sequence-clear-descriptions').getTime(),
      'must sort after the latest pre-existing fix in the catalog',
    );
  });

  it('documents the System pseudo-tenant --client 0 invocation', () => {
    assert.match(rawText, /--fix R40-aeatsii-cause-exemption-catalog --client 0/);
  });

  it('records the relationship to R17 and the redesign rationale in its own header', () => {
    assert.match(rawText, /R17-sii-cause-exemption/);
    assert.match(rawText, /immutable/);
    assert.match(rawText, /REDESIGN/);
  });
});

describe('R40 aeatsii-cause-exemption data-fix — inserts all six AEAT causes as SYSTEM rows', () => {
  for (const [key, name] of CAUSES) {
    it(`inserts ${key}`, () => {
      assert.match(sqlApply, new RegExp(`'${key}'`));
      assert.match(sqlApply, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    });

    it(`@check gates on ${key} via the VALUES list`, () => {
      assert.match(sqlCheck, new RegExp(`'${key}'`));
    });
  }

  it('seeds every cause as non-default', () => {
    const inserts = sqlApply.split(/INSERT INTO/i).filter((s) => s.trim().length > 0);
    assert.equal(inserts.length, 6);
    for (const insert of inserts) {
      assert.match(insert, /'N', 'IVA'/);
    }
  });

  it('writes AD_ORG_ID as the literal System org, never a per-tenant :org_id bind', () => {
    assert.doesNotMatch(fix.apply, /:org_id\b/);
    const inserts = sqlApply.split(/INSERT INTO/i).filter((s) => s.trim().length > 0);
    assert.equal(inserts.length, 6);
    for (const insert of inserts) {
      // SELECT '@uuid_Ex@', :client_id, '0', 'Y', ...
      assert.match(insert, /:client_id\s*,\s*'0'\s*,\s*'Y'/);
    }
  });

  it('does NOT gate on aeatsii_description (unconditional, unlike R17)', () => {
    assert.doesNotMatch(sqlCheck, /aeatsii_description/);
    assert.doesNotMatch(sqlApply, /aeatsii_description/);
  });
});

describe('R40 aeatsii-cause-exemption data-fix — System pseudo-tenant scope', () => {
  it('scopes the @check to :client_id (the System pseudo-tenant when run with --client 0)', () => {
    assert.match(normCheck, /ad_client_id = :client_id/);
  });

  it('scopes every @apply statement to :client_id', () => {
    const statements = sqlApply.split(';').filter((s) => s.trim().length > 0);
    assert.equal(statements.length, 6, 'six independent guarded inserts');
    for (const statement of statements) {
      assert.match(statement, /ad_client_id = :client_id/);
    }
  });

  it('inlines :client_id="0" into a safe quoted literal and leaves no bind token', () => {
    const inlined = inlineParams(fix.apply, { client_id: '0' });
    assert.ok(inlined.includes("'0'"));
    assert.doesNotMatch(inlined, /:client_id\b/);
  });

  it('refuses to inline an injection-y client id (safety net for the runner)', () => {
    assert.throws(
      () => inlineParams(fix.apply, { client_id: '1; DROP TABLE ad_client' }),
      /refusing to inline unsafe client_id/,
    );
  });
});

describe('R40 aeatsii-cause-exemption data-fix — two-layer idempotency', () => {
  it('each insert is guarded by NOT EXISTS keyed on (ad_client_id, key)', () => {
    for (const [key] of CAUSES) {
      const guard = new RegExp(
        `WHERE NOT EXISTS \\(\\s*SELECT 1 FROM aeatsii_cause_exemption ace\\s*WHERE ace\\.ad_client_id = :client_id AND ace\\.key = '${key}'`,
      );
      assert.match(fix.apply, guard, `${key} insert must be guarded by its own NOT EXISTS`);
    }
  });

  it('the @check mirrors the same six-key gate the @apply writes through', () => {
    assert.match(sqlCheck, /VALUES \('E1'\), \('E2'\), \('E3'\), \('E4'\), \('E5'\), \('E6'\)/);
  });

  it('mints a fresh row id with @uuid_<KEY>@, never a hand-typed UUID', () => {
    for (const [key] of CAUSES) {
      assert.match(fix.apply, new RegExp(`@uuid_${key}@`));
    }
  });

  it('is safe to re-run after the module sourcedata load already seeded some/all rows', () => {
    // Simulate: E1..E3 already present (as if update.database loaded the sourcedata
    // first) — the remaining guarded inserts for E4..E6 must stay independent.
    for (const key of ['E4', 'E5', 'E6']) {
      assert.match(
        fix.apply,
        new RegExp(`WHERE NOT EXISTS \\(\\s*SELECT 1 FROM aeatsii_cause_exemption ace\\s*WHERE ace\\.ad_client_id = :client_id AND ace\\.key = '${key}'`),
      );
    }
  });
});
