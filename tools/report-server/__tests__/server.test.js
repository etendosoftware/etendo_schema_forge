/**
 * Tests for pure helper functions in report-server/server.js.
 * DB/HTTP/jsreport-dependent functions are skipped.
 * We replicate private functions since they are not exported.
 */
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

// --- Replicated pure functions from server.js ---

function getClientIdFromToken(authHeader) {
  try {
    const token = (authHeader || '').replace(/^Bearer\s+/i, '');
    if (!token) return null;
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    return payload.client || null;
  } catch { return null; }
}

function json(res, status, data) {
  const headers = {};
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function applyLimitToSql(limit, sql) {
  if (limit) sql = sql.replace(/;\s*$/, '') + ` LIMIT ${Number.parseInt(limit, 10)}`;
  return sql;
}

function formatIdForSql() {
  return id => `'${id.trim()}'`;
}

function getRowCount(rows) {
  return Array.isArray(rows) ? rows.length : undefined;
}

function filterAndTransformParams(params, contract) {
  return Object.entries(params)
    .filter(([k, v]) => v && v !== '' && !k.startsWith('_display_'))
    .map(([k, v]) => {
      const paramDef = contract.parameters?.find(p => p.name === k);
      let displayValue = params['_display_' + k] || v;
      if (k === 'groupBy') {
        const dimParam = (contract.parameters || []).find(p => p.groupByValue === v);
        displayValue = dimParam?.label?.en_US || v;
      }
      if (typeof displayValue === 'string' && displayValue.includes(' | '))
        displayValue = displayValue.split(' | ').filter(Boolean).join(', ');
      if (paramDef?.type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(displayValue)) {
        const [y, m, d] = displayValue.split('-');
        displayValue = `${d}/${m}/${y}`;
      }
      return { label: paramDef?.label?.en_US || k, value: displayValue };
    });
}

function calculateTotals(documentData, amountCols, rows, totals) {
  if (!documentData && amountCols.length && Array.isArray(rows)) {
    for (const col of amountCols) totals[col.field] = rows.reduce((sum, r) => sum + (Number(r[col.field]) || 0), 0);
  }
}

function getGroupedData(contract, params, rows) {
  let groupLabel = contract.groups?.[0]?.label?.en_US || 'Account';
  let descriptionLabel = (contract.columns || []).find(c => c.field === 'groupbyname')?.label?.en_US || 'Description';
  if (params.groupBy && rows) {
    const dimensionParam = (contract.parameters || []).find(p => p.groupByValue === params.groupBy && p.groupByField);
    if (dimensionParam) {
      const sourceField = dimensionParam.groupByField;
      groupLabel = dimensionParam.label?.en_US || params.groupBy;
      descriptionLabel = dimensionParam.label?.en_US || descriptionLabel;
      rows = [...rows].sort((a, b) => (a[sourceField] || '').toLowerCase().localeCompare((b[sourceField] || '').toLowerCase()));
      rows = rows.map(r => ({ ...r, name: r[sourceField] || '', value: '' }));
    }
  }
  return { groupLabel, descriptionLabel, rows };
}

function extractRowsFromData(data, contract, limit) {
  let rows = data;
  if (contract.neo.dataPath) {
    for (const key of contract.neo.dataPath.split('.')) rows = rows?.[key];
  }
  if (limit && Array.isArray(rows)) rows = rows.slice(0, Number.parseInt(limit, 10));
  return rows;
}

function extractNeoMeta(contract, data) {
  let neoMeta = {};
  if (contract.neo.dataPath) {
    const pathParts = contract.neo.dataPath.split('.');
    const metaParts = [...pathParts.slice(0, -1), 'meta'];
    let metaObj = data;
    for (const key of metaParts) metaObj = metaObj?.[key];
    if (metaObj && typeof metaObj === 'object') neoMeta = metaObj;
  }
  return neoMeta;
}

function matchReportSelectorRequest(method, path) {
  if (method !== 'GET') return null;
  return path.match(/^\/api\/report-selectors\/([\w-]+)$/);
}

function isGetReportsRequest(method, path) {
  return method === 'GET' && path === '/api/reports';
}

function isGetDataRequest(method, dataMatch) {
  return method === 'GET' && dataMatch;
}

function isPostRequestForRender(method, renderMatch) {
  return method === 'POST' && renderMatch;
}

function buildTemplateData(documentData, css, opts) {
  const { title, activeFilters, params, recordCount, totals, groupLabel, descriptionLabel, neoMeta, rows } = opts;
  if (documentData) {
    return { css, meta: { title, generatedAt: new Date().toISOString(), filters: activeFilters, params }, header: documentData.header, lines: documentData.lines, taxes: documentData.taxes };
  }
  return { css, meta: { title, generatedAt: new Date().toISOString(), recordCount, filters: activeFilters, params, totals, groupLabel, descriptionLabel, ...neoMeta }, rows };
}

function injectDateFilters(contract, params, sql) {
  if (contract.jasper?.originalFile) {
    const dateParams = (contract.parameters || []).filter(p => p.type === 'date');
    const extraClauses = [];
    applyDateFilters(dateParams, params, contract, sql, extraClauses);
    if (extraClauses.length > 0) {
      const insertPoint = sql.search(/\bGROUP\s+BY\b/i);
      if (insertPoint > 0) sql = sql.slice(0, insertPoint) + 'AND ' + extraClauses.join(' AND ') + '\n' + sql.slice(insertPoint);
      else {
        const orderPoint = sql.search(/\bORDER\s+BY\b/i);
        if (orderPoint > 0) sql = sql.slice(0, orderPoint) + 'AND ' + extraClauses.join(' AND ') + '\n' + sql.slice(orderPoint);
      }
    }
  }
  return sql;
}

function applyDateFilters(dateParams, params, contract, sql, extraClauses) {
  for (const p of dateParams) {
    const val = params[p.name];
    if (!val) continue;
    const col = p.column || contract.jasper.dateColumn
      || (sql.match(/\b(\w+\.)?DATEORDERED\b/i)?.[0])
      || (sql.match(/\b(\w+\.)?DATEACCT\b/i)?.[0])
      || 'DATEACCT';
    const escaped = String(val).replaceAll('\'', "''");
    if (p.name.toLowerCase().includes('from')) extraClauses.push(`${col} >= '${escaped}'::date`);
    else if (p.name.toLowerCase().includes('to')) extraClauses.push(`${col} <= '${escaped}'::date`);
  }
}

function getDbConfig() {
  const cfg = {
    host: process.env.BBDD_HOST || 'localhost',
    port: Number.parseInt(process.env.BBDD_PORT) || 5432,
    user: process.env.BBDD_USER,
    password: process.env.BBDD_PASSWORD,
    database: process.env.BBDD_SID,
    max: 3,
  };
  if (process.env.BBDD_HOST?.includes('rds.amazonaws.com')) {
    cfg.ssl = { rejectUnauthorized: false };
  }
  return cfg;
}

function addWarehouseOrgFilters(selectedOrgId, values, whereFragments, roleOrgIds) {
  if (selectedOrgId) { values.push(selectedOrgId); whereFragments.push(`AND EXISTS (SELECT 1 FROM ad_org_warehouse ow WHERE ow.m_warehouse_id = m_warehouse.m_warehouse_id AND ow.ad_org_id = $${values.length})`); }
  if (roleOrgIds.length > 0) { values.push(roleOrgIds); whereFragments.push(`AND EXISTS (SELECT 1 FROM ad_org_warehouse ow WHERE ow.m_warehouse_id = m_warehouse.m_warehouse_id AND ow.ad_org_id = ANY($${values.length}))`); }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

// --- Tests ---

describe('report-server helpers', () => {
  describe('getClientIdFromToken', () => {
    it('extracts client from a valid JWT', () => {
      const payload = Buffer.from(JSON.stringify({ client: 'C001' })).toString('base64url');
      const token = `header.${payload}.sig`;
      assert.equal(getClientIdFromToken(`Bearer ${token}`), 'C001');
    });

    it('returns null for empty header', () => {
      assert.equal(getClientIdFromToken(''), null);
      assert.equal(getClientIdFromToken(null), null);
    });

    it('returns null for malformed token', () => {
      assert.equal(getClientIdFromToken('Bearer garbage'), null);
    });

    it('returns null when payload has no client field', () => {
      const payload = Buffer.from(JSON.stringify({ sub: 'user' })).toString('base64url');
      assert.equal(getClientIdFromToken(`Bearer h.${payload}.s`), null);
    });
  });

  describe('applyLimitToSql', () => {
    it('appends LIMIT when limit is provided', () => {
      assert.equal(applyLimitToSql(10, 'SELECT * FROM t;'), 'SELECT * FROM t LIMIT 10');
    });

    it('returns SQL unchanged when no limit', () => {
      assert.equal(applyLimitToSql(null, 'SELECT 1'), 'SELECT 1');
      assert.equal(applyLimitToSql(0, 'SELECT 1'), 'SELECT 1');
    });

    it('strips trailing semicolon before LIMIT', () => {
      assert.ok(applyLimitToSql(5, 'SELECT 1;').endsWith('LIMIT 5'));
      assert.ok(!applyLimitToSql(5, 'SELECT 1;').includes(';'));
    });
  });

  describe('formatIdForSql', () => {
    it('wraps id in single quotes', () => {
      const fn = formatIdForSql();
      assert.equal(fn('ABC'), "'ABC'");
    });

    it('trims whitespace', () => {
      const fn = formatIdForSql();
      assert.equal(fn('  XYZ  '), "'XYZ'");
    });
  });

  describe('getRowCount', () => {
    it('returns length for arrays', () => {
      assert.equal(getRowCount([1, 2, 3]), 3);
      assert.equal(getRowCount([]), 0);
    });

    it('returns undefined for non-arrays', () => {
      assert.equal(getRowCount(null), undefined);
      assert.equal(getRowCount('string'), undefined);
    });
  });

  describe('filterAndTransformParams', () => {
    it('filters out empty values and _display_ keys', () => {
      const result = filterAndTransformParams(
        { org: 'Main', _display_org: 'Main Org', empty: '' },
        { parameters: [{ name: 'org', label: { en_US: 'Organization' } }] },
      );
      assert.equal(result.length, 1);
      assert.equal(result[0].label, 'Organization');
      assert.equal(result[0].value, 'Main Org');
    });

    it('formats date parameters as dd/mm/yyyy', () => {
      const result = filterAndTransformParams(
        { dateFrom: '2024-03-15' },
        { parameters: [{ name: 'dateFrom', type: 'date', label: { en_US: 'From' } }] },
      );
      assert.equal(result[0].value, '15/03/2024');
    });

    it('splits pipe-separated display values', () => {
      const result = filterAndTransformParams(
        { warehouse: 'ids', _display_warehouse: 'WH1 | WH2 | WH3' },
        { parameters: [] },
      );
      assert.equal(result[0].value, 'WH1, WH2, WH3');
    });

    it('resolves groupBy dimension label', () => {
      const result = filterAndTransformParams(
        { groupBy: 'bpartner' },
        { parameters: [{ name: 'dim', groupByValue: 'bpartner', label: { en_US: 'Business Partner' } }] },
      );
      assert.equal(result[0].value, 'Business Partner');
    });
  });

  describe('calculateTotals', () => {
    it('sums amount columns from rows', () => {
      const totals = {};
      const cols = [{ field: 'amount' }, { field: 'tax' }];
      const rows = [
        { amount: 100, tax: 21 },
        { amount: 200, tax: 42 },
      ];
      calculateTotals(null, cols, rows, totals);
      assert.equal(totals.amount, 300);
      assert.equal(totals.tax, 63);
    });

    it('skips when documentData is present', () => {
      const totals = {};
      calculateTotals({ header: {} }, [{ field: 'x' }], [{ x: 10 }], totals);
      assert.deepEqual(totals, {});
    });

    it('handles non-numeric values', () => {
      const totals = {};
      calculateTotals(null, [{ field: 'a' }], [{ a: 'abc' }, { a: 50 }], totals);
      assert.equal(totals.a, 50);
    });
  });

  describe('getGroupedData', () => {
    it('returns defaults when no groupBy', () => {
      const result = getGroupedData({ columns: [] }, {}, [{ x: 1 }]);
      assert.equal(result.groupLabel, 'Account');
      assert.equal(result.descriptionLabel, 'Description');
    });

    it('sorts and remaps rows when groupBy matches a dimension param', () => {
      const contract = {
        columns: [],
        parameters: [{ name: 'dim', groupByValue: 'bp', groupByField: 'bpartnerName', label: { en_US: 'Partner' } }],
      };
      const rows = [
        { bpartnerName: 'Zeta', amount: 10 },
        { bpartnerName: 'Alpha', amount: 20 },
      ];
      const result = getGroupedData(contract, { groupBy: 'bp' }, rows);
      assert.equal(result.groupLabel, 'Partner');
      assert.equal(result.rows[0].name, 'Alpha');
      assert.equal(result.rows[1].name, 'Zeta');
    });
  });

  describe('extractRowsFromData', () => {
    it('extracts nested data via dataPath', () => {
      const data = { response: { data: { items: [1, 2, 3] } } };
      const contract = { neo: { dataPath: 'response.data.items' } };
      assert.deepEqual(extractRowsFromData(data, contract, null), [1, 2, 3]);
    });

    it('applies limit', () => {
      const data = { items: [1, 2, 3, 4, 5] };
      const contract = { neo: { dataPath: 'items' } };
      assert.deepEqual(extractRowsFromData(data, contract, 3), [1, 2, 3]);
    });
  });

  describe('extractNeoMeta', () => {
    it('extracts meta sibling of dataPath leaf', () => {
      const data = { response: { data: [1], meta: { total: 100 } } };
      const contract = { neo: { dataPath: 'response.data' } };
      const meta = extractNeoMeta(contract, data);
      assert.equal(meta.total, 100);
    });

    it('returns empty object when meta is absent', () => {
      const data = { items: [1] };
      const contract = { neo: { dataPath: 'items' } };
      assert.deepEqual(extractNeoMeta(contract, data), {});
    });
  });

  describe('matchReportSelectorRequest', () => {
    it('matches GET /api/report-selectors/:type', () => {
      const m = matchReportSelectorRequest('GET', '/api/report-selectors/bpartner');
      assert.ok(m);
      assert.equal(m[1], 'bpartner');
    });

    it('rejects POST', () => {
      assert.equal(matchReportSelectorRequest('POST', '/api/report-selectors/bpartner'), null);
    });

    it('rejects invalid paths', () => {
      assert.equal(matchReportSelectorRequest('GET', '/api/other'), null);
    });
  });

  describe('route matchers', () => {
    it('isGetReportsRequest', () => {
      assert.ok(isGetReportsRequest('GET', '/api/reports'));
      assert.ok(!isGetReportsRequest('POST', '/api/reports'));
      assert.ok(!isGetReportsRequest('GET', '/api/other'));
    });

    it('isGetDataRequest', () => {
      assert.ok(isGetDataRequest('GET', { 1: 'id' }));
      assert.ok(!isGetDataRequest('GET', null));
    });

    it('isPostRequestForRender', () => {
      assert.ok(isPostRequestForRender('POST', { 1: 'id' }));
      assert.ok(!isPostRequestForRender('GET', { 1: 'id' }));
    });
  });

  describe('buildTemplateData', () => {
    it('builds listing template data with rows', () => {
      const data = buildTemplateData(null, 'css', {
        title: 'Test', activeFilters: [], params: {}, recordCount: 5,
        totals: {}, groupLabel: 'G', descriptionLabel: 'D', neoMeta: {}, rows: [1, 2],
      });
      assert.equal(data.css, 'css');
      assert.equal(data.meta.title, 'Test');
      assert.equal(data.meta.recordCount, 5);
      assert.deepEqual(data.rows, [1, 2]);
    });

    it('builds document template data with header/lines/taxes', () => {
      const docData = { header: { id: 'h' }, lines: [1], taxes: [2] };
      const data = buildTemplateData(docData, 'css', {
        title: 'Doc', activeFilters: [], params: {}, recordCount: 0,
        totals: {}, groupLabel: '', descriptionLabel: '', neoMeta: {}, rows: [],
      });
      assert.equal(data.header.id, 'h');
      assert.deepEqual(data.lines, [1]);
      assert.deepEqual(data.taxes, [2]);
      assert.equal(data.rows, undefined);
    });
  });

  describe('injectDateFilters', () => {
    it('injects date clauses before GROUP BY', () => {
      const contract = {
        jasper: { originalFile: 'x.jrxml' },
        parameters: [{ name: 'dateFrom', type: 'date' }],
      };
      const sql = 'SELECT * FROM t WHERE 1=1 GROUP BY col';
      const result = injectDateFilters(contract, { dateFrom: '2024-01-01' }, sql);
      assert.ok(result.includes(">= '2024-01-01'::date"));
      assert.ok(result.includes('AND'));
    });

    it('injects before ORDER BY when no GROUP BY', () => {
      const contract = {
        jasper: { originalFile: 'x.jrxml' },
        parameters: [{ name: 'dateTo', type: 'date' }],
      };
      const sql = 'SELECT * FROM t WHERE 1=1 ORDER BY col';
      const result = injectDateFilters(contract, { dateTo: '2024-12-31' }, sql);
      assert.ok(result.includes("<= '2024-12-31'::date"));
    });

    it('does nothing without jasper config', () => {
      const sql = 'SELECT 1';
      assert.equal(injectDateFilters({}, { dateFrom: '2024-01-01' }, sql), sql);
    });
  });

  describe('getDbConfig', () => {
    it('returns default config', () => {
      const cfg = getDbConfig();
      assert.equal(cfg.host, process.env.BBDD_HOST || 'localhost');
      assert.equal(cfg.max, 3);
    });
  });

  describe('addWarehouseOrgFilters', () => {
    it('adds org filter when selectedOrgId provided', () => {
      const values = ['%q%'];
      const frags = ['FROM m_warehouse'];
      addWarehouseOrgFilters('ORG1', values, frags, []);
      assert.equal(values.length, 2);
      assert.equal(values[1], 'ORG1');
      assert.ok(frags[1].includes('ad_org_warehouse'));
    });

    it('adds role org filter', () => {
      const values = ['%q%'];
      const frags = ['FROM m_warehouse'];
      addWarehouseOrgFilters('', values, frags, ['O1', 'O2']);
      assert.equal(values.length, 2);
      assert.ok(frags[1].includes('ANY'));
    });
  });

  describe('readBody', () => {
    it('reads request body from events', async () => {
      const { EventEmitter } = await import('node:events');
      const req = new EventEmitter();
      const promise = readBody(req);
      req.emit('data', 'hello ');
      req.emit('data', 'world');
      req.emit('end');
      assert.equal(await promise, 'hello world');
    });
  });
});
