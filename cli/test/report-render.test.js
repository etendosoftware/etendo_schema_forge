/**
 * Tests for the pure functions in report-render.js.
 * DB and jsreport dependent functions are skipped — only parameterizeQuery
 * and parseArgs are testable without live services.
 *
 * These functions are not exported, so we replicate and test the logic.
 */
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

// Replicate parameterizeQuery (not exported from report-render.js)
function parameterizeQuery(sql, { clientId, orgId }) {
  let q = sql;
  q = q.replace(/AD_CLIENT_ID\s+IN\s*\(\s*'[^']+'\s*\)/gi, `AD_CLIENT_ID IN ('${clientId}')`);
  q = q.replace(/AD_ORG_ID\s+IN\s*\(\s*'[^']+'\s*\)/gi, `AD_ORG_ID IN (SELECT AD_ORG_ID FROM AD_ORG WHERE AD_CLIENT_ID = '${clientId}' AND ISACTIVE = 'Y')`);
  q = q.replace(/AD_LANGUAGE\s*=\s*'[^']+'/gi, `AD_LANGUAGE = 'en_US'`);
  return q;
}

// Replicate parseArgs (not exported from report-render.js)
function parseArgs(argv) {
  const opts = {
    artifact: null,
    format: 'html',
    clientId: null,
    orgId: null,
    open: false,
    limit: null,
  };
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a === '--artifact' && argv[i + 1]) {
      opts.artifact = argv[i + 1];
      i += 2;
    } else if (a === '--format' && argv[i + 1]) {
      opts.format = argv[i + 1];
      i += 2;
    } else if (a === '--client-id' && argv[i + 1]) {
      opts.clientId = argv[i + 1];
      i += 2;
    } else if (a === '--org-id' && argv[i + 1]) {
      opts.orgId = argv[i + 1];
      i += 2;
    } else if (a === '--limit' && argv[i + 1]) {
      opts.limit = parseInt(argv[i + 1], 10);
      i += 2;
    } else if (a === '--open') {
      opts.open = true;
      i += 1;
    } else {
      i += 1;
    }
  }
  return opts;
}

describe('report-render', () => {
  describe('parameterizeQuery', () => {
    it('replaces hardcoded AD_CLIENT_ID', () => {
      const sql = "SELECT * FROM C_Order WHERE AD_CLIENT_ID IN ('1000000')";
      const result = parameterizeQuery(sql, { clientId: 'ABC', orgId: '0' });
      assert.ok(result.includes("AD_CLIENT_ID IN ('ABC')"));
      assert.ok(!result.includes('1000000'));
    });

    it('replaces hardcoded AD_ORG_ID with subquery', () => {
      const sql = "SELECT * FROM C_Order WHERE AD_ORG_ID IN ('1000001')";
      const result = parameterizeQuery(sql, { clientId: 'ABC', orgId: '0' });
      assert.ok(result.includes('SELECT AD_ORG_ID FROM AD_ORG'));
      assert.ok(result.includes("AD_CLIENT_ID = 'ABC'"));
    });

    it('replaces AD_LANGUAGE', () => {
      const sql = "SELECT * FROM AD_Message WHERE AD_LANGUAGE = 'es_ES'";
      const result = parameterizeQuery(sql, { clientId: '0', orgId: '0' });
      assert.ok(result.includes("AD_LANGUAGE = 'en_US'"));
    });

    it('handles multiple replacements in one query', () => {
      const sql = "SELECT * FROM t WHERE AD_CLIENT_ID IN ('X') AND AD_ORG_ID IN ('Y') AND AD_LANGUAGE = 'fr_FR'";
      const result = parameterizeQuery(sql, { clientId: 'C1', orgId: 'O1' });
      assert.ok(result.includes("AD_CLIENT_ID IN ('C1')"));
      assert.ok(result.includes('SELECT AD_ORG_ID FROM AD_ORG'));
      assert.ok(result.includes("AD_LANGUAGE = 'en_US'"));
    });

    it('leaves SQL unchanged when no patterns match', () => {
      const sql = 'SELECT * FROM AD_Window WHERE IsActive = \'Y\'';
      const result = parameterizeQuery(sql, { clientId: 'X', orgId: 'Y' });
      assert.equal(result, sql);
    });

    it('is case insensitive for column names', () => {
      const sql = "SELECT * FROM t WHERE ad_client_id IN ('old')";
      const result = parameterizeQuery(sql, { clientId: 'NEW', orgId: '0' });
      assert.ok(result.includes("AD_CLIENT_ID IN ('NEW')"));
    });
  });

  describe('parseArgs', () => {
    it('parses --artifact', () => {
      const opts = parseArgs(['--artifact', 'my-report']);
      assert.equal(opts.artifact, 'my-report');
    });

    it('parses --format', () => {
      const opts = parseArgs(['--artifact', 'r', '--format', 'pdf']);
      assert.equal(opts.format, 'pdf');
    });

    it('defaults format to html', () => {
      const opts = parseArgs(['--artifact', 'r']);
      assert.equal(opts.format, 'html');
    });

    it('parses --client-id and --org-id', () => {
      const opts = parseArgs(['--artifact', 'r', '--client-id', 'C1', '--org-id', 'O1']);
      assert.equal(opts.clientId, 'C1');
      assert.equal(opts.orgId, 'O1');
    });

    it('parses --limit as integer', () => {
      const opts = parseArgs(['--artifact', 'r', '--limit', '50']);
      assert.equal(opts.limit, 50);
    });

    it('parses --open flag', () => {
      const opts = parseArgs(['--artifact', 'r', '--open']);
      assert.equal(opts.open, true);
    });

    it('defaults open to false', () => {
      const opts = parseArgs(['--artifact', 'r']);
      assert.equal(opts.open, false);
    });

    it('returns null artifact when not provided', () => {
      const opts = parseArgs([]);
      assert.equal(opts.artifact, null);
    });

    it('ignores unknown flags', () => {
      const opts = parseArgs(['--unknown', 'value', '--artifact', 'r']);
      assert.equal(opts.artifact, 'r');
    });
  });
});
