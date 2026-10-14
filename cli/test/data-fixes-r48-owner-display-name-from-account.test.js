// @covers cli/src/data-fixes/sql/20261009T151500Z__R48-owner-display-name-from-account.sql
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFix, parseFixTimestamp } from '../src/data-fixes/parse-fix.js';

/**
 * Static + parse validation for the R48 corrective data-fix (ETP-5689).
 *
 * Onboarding named the owner AD_User after its username when the request carried no full name —
 * always the case for an account's additional environment, whose username is `email+<company>`.
 * The fix renames the owners whose Name still equals their Username to ETGO_ACCOUNT.NAME, else the
 * account email. Code-side twin: EtendoGoJwtSupport.resolveOwnerDisplayName (com.etendoerp.go).
 *
 * Row-level behaviour was verified against a live DB (the ETP-5689 manual test); this suite checks
 * the SQL the fix ships: metadata, ordering, tenant/owner scoping, the account lookup (including
 * plus-addressed emails), the 60-character cap, and that @check and @apply share every guard.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const SQL_DIR = join(__dirname, '..', 'src', 'data-fixes', 'sql');
const FIX_FILE = '20261009T151500Z__R48-owner-display-name-from-account.sql';
const FIX_ID = basename(FIX_FILE, '.sql');

const fix = parseFix(readFileSync(join(SQL_DIR, FIX_FILE), 'utf8'), FIX_ID);
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const stripComments = (s) => s.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');
const normCheck = norm(stripComments(fix.check));
const applyStatements = stripComments(fix.apply).split(';').map(norm).filter(Boolean);

const NEW_NAME = "left(coalesce(nullif(trim(a.name), ''), lower(a.email)), 60)";
const SUFFIX_PATTERN = String.raw`^(.*@[^+]*)\+[a-z0-9]+$`;
const ACCOUNT_LOOKUP = 'lower(a.email) = lower(coalesce(nullif(trim(u.email), \'\'), '
  + `regexp_replace(u.username, '${SUFFIX_PATTERN}', '\\1')))`;

const GUARDS = [
  'u.ad_client_id = :client_id',
  "u.em_etgo_is_owner = 'Y'",
  'u.name = u.username',
  "a.isactive = 'Y'",
  ACCOUNT_LOOKUP,
  `${NEW_NAME} <> u.name`,
];

describe('R48 data-fix — header metadata', () => {
  it('parses with the expected id, gap, type and risk', () => {
    assert.equal(fix.id, 'R48-owner-display-name-from-account');
    assert.equal(fix.gap, 'ETP-5689');
    assert.equal(fix.type, 'sql');
    assert.equal(fix.risk, 'low');
    assert.match(fix.description, /owner AD_User/);
  });

  // Pinned to the latest fix that existed when R48 shipped (the R41/R44/R47 precedent).
  it('sorts after R47-gl-journal-draft-datedoc-sync, the latest fix when it shipped', () => {
    assert.ok(
      parseFixTimestamp(FIX_ID).getTime()
        > parseFixTimestamp('20261005T160407Z__R47-gl-journal-draft-datedoc-sync').getTime(),
    );
  });
});

describe('R48 data-fix — scope and guards', () => {
  it('ships a single @apply statement', () => {
    assert.equal(applyStatements.length, 1);
  });

  it('applies every guard in both @check and @apply', () => {
    for (const clause of GUARDS) {
      assert.ok(normCheck.includes(clause), `@check misses: ${clause}`);
      assert.ok(applyStatements[0].includes(clause), `@apply misses: ${clause}`);
    }
  });

  it('renames only Name: Username and Description are never written', () => {
    assert.match(applyStatements[0], /^UPDATE ad_user u SET name = /);
    assert.doesNotMatch(applyStatements[0], /\busername\s*=/);
    assert.doesNotMatch(applyStatements[0], /\bdescription\s*=/);
  });

  it('caps the new name at the AD_User.Name width (60)', () => {
    assert.ok(applyStatements[0].includes(`SET name = ${NEW_NAME}`));
  });
});

describe('R48 data-fix — client suffix removal', () => {
  // The SQL's POSIX pattern is also a valid JS pattern with the same meaning, so its contract can
  // be exercised here: strip the LAST "+suffix" after the "@", keep a "+" in the local part.
  const strip = (username) => username.replace(new RegExp(SUFFIX_PATTERN), '$1');

  it('removes the +company suffix of an additional environment', () => {
    assert.equal(strip('jane@acme.com+acmeltd'), 'jane@acme.com');
    assert.equal(strip('jane@acme.com+acme2'), 'jane@acme.com');
  });

  it('keeps a plus-address in the local part', () => {
    assert.equal(strip('jane+test@acme.com+acme'), 'jane+test@acme.com');
    assert.equal(strip('jane+test@acme.com'), 'jane+test@acme.com');
  });

  it('leaves a bare email and a pool placeholder untouched', () => {
    assert.equal(strip('jane@acme.com'), 'jane@acme.com');
    assert.equal(strip('pool-000748de3fd8446c93e66767d49e7cff'), 'pool-000748de3fd8446c93e66767d49e7cff');
  });
});
