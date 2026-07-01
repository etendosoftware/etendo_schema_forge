import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  parseFix,
  parseFixTimestamp,
  inlineParams,
  inlineClientName,
  inlineFreshUuids,
} from '../src/data-fixes/parse-fix.js';

describe('parseFix', () => {
  it('parses a full header + check + apply happy path', () => {
    const text = [
      '-- @id: R3-periodcontrol',
      '-- @gap: C2',
      '-- @risk: medium',
      '-- @type: sql',
      '-- @description: one-line human description',
      '',
      '-- @check',
      'SELECT 1 FROM foo WHERE ad_client_id = :client_id;',
      '',
      '-- @apply',
      'INSERT INTO foo (x) VALUES (1);',
    ].join('\n');

    const fix = parseFix(text, 'R3-periodcontrol');
    assert.equal(fix.fixId, 'R3-periodcontrol');
    assert.equal(fix.id, 'R3-periodcontrol');
    assert.equal(fix.gap, 'C2');
    assert.equal(fix.risk, 'medium');
    assert.equal(fix.type, 'sql');
    assert.equal(fix.description, 'one-line human description');
    assert.equal(fix.webhook, null);
    assert.equal(fix.check, 'SELECT 1 FROM foo WHERE ad_client_id = :client_id;');
    assert.equal(fix.apply, 'INSERT INTO foo (x) VALUES (1);');
  });

  it('defaults missing header fields to null and id to fixId', () => {
    const text = [
      '-- @check',
      'SELECT 1;',
      '-- @apply',
      'UPDATE foo SET x = 1;',
    ].join('\n');

    const fix = parseFix(text, 'fix-abc');
    assert.equal(fix.id, 'fix-abc');
    assert.equal(fix.gap, null);
    assert.equal(fix.risk, null);
    assert.equal(fix.description, null);
    assert.equal(fix.webhook, null);
    assert.equal(fix.type, 'sql'); // default
  });

  it('treats section markers case-insensitively', () => {
    const text = [
      '-- @CHECK',
      'SELECT 1;',
      '-- @APPLY',
      'UPDATE foo SET x = 1;',
    ].join('\n');

    const fix = parseFix(text, 'fix-upper');
    assert.equal(fix.check, 'SELECT 1;');
    assert.equal(fix.apply, 'UPDATE foo SET x = 1;');
  });

  it('ignores blank lines and free comments in the header region', () => {
    const text = [
      '-- this is a free comment, not a header',
      '',
      '-- @id: x',
      '   ',
      '-- another free comment',
      '-- @check',
      'SELECT 1;',
      '-- @apply',
      'UPDATE foo SET x = 1;',
    ].join('\n');

    const fix = parseFix(text, 'fix-comments');
    assert.equal(fix.id, 'x');
    assert.equal(fix.check, 'SELECT 1;');
  });

  it('joins multi-line check/apply bodies and trims surrounding whitespace', () => {
    const text = [
      '-- @check',
      '',
      'SELECT 1',
      'FROM foo;',
      '',
      '-- @apply',
      '',
      'INSERT INTO foo (x)',
      'VALUES (1);',
      '',
    ].join('\n');

    const fix = parseFix(text, 'fix-multiline');
    assert.equal(fix.check, 'SELECT 1\nFROM foo;');
    assert.equal(fix.apply, 'INSERT INTO foo (x)\nVALUES (1);');
  });

  it('throws when @check is missing for a sql fix', () => {
    const text = ['-- @apply', 'UPDATE foo SET x = 1;'].join('\n');
    assert.throws(() => parseFix(text, 'fix-no-check'), /missing or empty @check section/);
  });

  it('throws when @apply is missing for a sql fix', () => {
    const text = ['-- @check', 'SELECT 1;'].join('\n');
    assert.throws(() => parseFix(text, 'fix-no-apply'), /missing or empty @apply section/);
  });

  it('throws on an invalid @type', () => {
    const text = [
      '-- @type: bogus',
      '-- @check',
      'SELECT 1;',
      '-- @apply',
      'UPDATE foo SET x = 1;',
    ].join('\n');
    assert.throws(() => parseFix(text, 'fix-bad-type'), /invalid @type "bogus"/);
  });

  it('throws when @type webhook has no @webhook header', () => {
    const text = ['-- @type: webhook', '-- @check', 'SELECT 1;'].join('\n');
    assert.throws(() => parseFix(text, 'fix-webhook'), /requires a "@webhook: <Name>" header/);
  });

  it('accepts a webhook fix (with @webhook header) even with empty check/apply', () => {
    const text = ['-- @type: webhook', '-- @webhook: SomeWebhook'].join('\n');
    const fix = parseFix(text, 'fix-webhook-ok');
    assert.equal(fix.type, 'webhook');
    assert.equal(fix.webhook, 'SomeWebhook');
    assert.equal(fix.check, '');
    assert.equal(fix.apply, '');
  });
});

describe('parseFixTimestamp', () => {
  it('parses a valid timestamp prefix into a UTC Date', () => {
    const d = parseFixTimestamp('20260616T120000Z__R3-periodcontrol');
    assert.ok(d instanceof Date);
    assert.equal(d.toISOString(), '2026-06-16T12:00:00.000Z');
  });

  it('maps the 1-based month string to the 0-based Date.UTC month', () => {
    // January (01) must map to month index 0.
    const jan = parseFixTimestamp('20260101T000000Z__x');
    assert.equal(jan.toISOString(), '2026-01-01T00:00:00.000Z');
    // December (12) must map to month index 11.
    const dec = parseFixTimestamp('20261231T235959Z__y');
    assert.equal(dec.toISOString(), '2026-12-31T23:59:59.000Z');
  });

  it('returns null for the __baseline__ sentinel', () => {
    assert.equal(parseFixTimestamp('__baseline__'), null);
  });

  it('returns null for any non-matching fix id', () => {
    assert.equal(parseFixTimestamp('not-a-timestamp'), null);
    assert.equal(parseFixTimestamp(''), null);
  });
});

describe('inlineParams', () => {
  it('replaces :client_id with the quoted literal', () => {
    const out = inlineParams('SELECT * WHERE ad_client_id = :client_id', {
      client_id: 'A'.repeat(32),
    });
    assert.equal(out, `SELECT * WHERE ad_client_id = '${'A'.repeat(32)}'`);
  });

  it('replaces :org_id only when org_id is provided', () => {
    const sql = 'WHERE c = :client_id AND o = :org_id';
    const out = inlineParams(sql, { client_id: '0', org_id: '*' });
    assert.equal(out, "WHERE c = '0' AND o = '*'");
  });

  it('leaves :org_id untouched when org_id is omitted', () => {
    const sql = "WHERE c = :client_id AND o = '0'";
    const out = inlineParams(sql, { client_id: '0' });
    assert.equal(out, "WHERE c = '0' AND o = '0'");
  });

  it('respects word boundaries (does not replace :client_idx)', () => {
    const out = inlineParams('x = :client_idx', { client_id: '0' });
    assert.equal(out, 'x = :client_idx');
  });

  it('accepts the System sentinel 0 and the org wildcard *', () => {
    assert.doesNotThrow(() => inlineParams(':client_id', { client_id: '0' }));
    assert.doesNotThrow(() => inlineParams(':client_id', { client_id: '*' }));
  });

  it('accepts a 32-hex client id case-insensitively', () => {
    const lower = 'abcdef0123456789abcdef0123456789';
    assert.doesNotThrow(() => inlineParams(':client_id', { client_id: lower }));
  });

  it('throws on a 31-char (too short) client id', () => {
    assert.throws(
      () => inlineParams(':client_id', { client_id: 'A'.repeat(31) }),
      /refusing to inline unsafe client_id/,
    );
  });

  it('throws on a non-hex / injection-y client id', () => {
    assert.throws(
      () => inlineParams(':client_id', { client_id: "1; DROP TABLE x" }),
      /refusing to inline unsafe client_id/,
    );
  });

  it('throws on an unsafe org_id', () => {
    assert.throws(
      () => inlineParams(':org_id', { client_id: '0', org_id: "1; DROP" }),
      /refusing to inline unsafe org_id/,
    );
  });
});

describe('inlineClientName', () => {
  it('returns the sql unchanged when there is no token', () => {
    const sql = "SELECT 'no token here'";
    assert.equal(inlineClientName(sql, 'Acme'), sql);
  });

  it('substitutes a valid client name', () => {
    const out = inlineClientName("'Chart of @name_client@'", 'Acme');
    assert.equal(out, "'Chart of Acme'");
  });

  it('escapes single quotes by doubling them', () => {
    const out = inlineClientName("'@name_client@'", "O'Brien");
    assert.equal(out, "'O''Brien'");
  });

  it('throws when the token is present but the name is null', () => {
    assert.throws(
      () => inlineClientName("'@name_client@'", null),
      /target client name not found/,
    );
  });

  it('throws when the token is present but the name is empty', () => {
    assert.throws(
      () => inlineClientName("'@name_client@'", ''),
      /target client name not found/,
    );
  });
});

describe('inlineFreshUuids', () => {
  const HEX32 = /^[0-9A-F]{32}$/;

  it('replaces a token with a 32 uppercase-hex id', () => {
    const out = inlineFreshUuids('@uuid_ABC@');
    assert.match(out, HEX32);
  });

  it('resolves the same KEY to the same id within one call', () => {
    const out = inlineFreshUuids('@uuid_ABC@ ... @uuid_ABC@');
    const [a, b] = out.split(' ... ');
    assert.match(a, HEX32);
    assert.equal(a, b);
  });

  it('resolves distinct KEYs to distinct ids', () => {
    const out = inlineFreshUuids('@uuid_ONE@|@uuid_TWO@');
    const [a, b] = out.split('|');
    assert.match(a, HEX32);
    assert.match(b, HEX32);
    assert.notEqual(a, b);
  });

  it('produces a new id set on each separate call', () => {
    const a = inlineFreshUuids('@uuid_ABC@');
    const b = inlineFreshUuids('@uuid_ABC@');
    assert.notEqual(a, b);
  });

  it('returns the sql unchanged when there is no token', () => {
    const sql = 'SELECT 1';
    assert.equal(inlineFreshUuids(sql), sql);
  });
});
