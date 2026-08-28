/**
 * Vite plugin: Report API
 *
 * Exposes endpoints for migrated Jasper reports:
 *   GET  /api/reports                    — list available migrated reports
 *   GET  /api/reports/:id/data           — execute SQL and return JSON rows
 *   POST /api/reports/:id/render         — render via jsreport (returns HTML/PDF/etc)
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const _require = createRequire(import.meta.url);
import { resolve, join } from 'node:path';
import { registerReportHelpers, buildJsreportHelpersString, computeDocumentQrDataUrl } from '../../../templates/reports/helpers/report-html-helpers.js';
import { REPORT_UI_STRINGS, pickLabel, buildContractLabels } from '@etendosoftware/schema-forge-cli/src/report-i18n.js';
import { resolveGrouping, buildNestedGroups, buildAccountReportTree }
  from '@etendosoftware/schema-forge-cli/src/report-grouping.js';
import { applyPlaceholders } from '@etendosoftware/schema-forge-cli/src/report-sql.js';
import { hydrateDocumentBranding } from './report-branding.js';

const ARTIFACTS_DIR = resolve(import.meta.dirname, '../../../artifacts');
const ROOT = resolve(ARTIFACTS_DIR, '..');
const JSREPORT_URL = process.env.JSREPORT_URL || 'http://localhost:5488';
const REPORT_PARTIALS_DIR = resolve(ROOT, 'templates', 'reports');

function expandReportPartials(templateContent) {
  const brandingPartial = readFileSync(join(REPORT_PARTIALS_DIR, 'document-branding.hbs'), 'utf8');
  return templateContent.replace(/\{\{>\s*document-branding\s*\}\}/g, brandingPartial);
}

// ETP-4314 — instance-wide currency separators, fetched once from the same
// NEO Headless config endpoint the browser reads (currencyFormatConfig.js),
// so both sides of the jsreport helper string bake in the same values instead
// of hardcoding them independently. Fails soft to '.'/',' — a config outage
// must never break report rendering.
let currencySeparatorsPromise = null;
async function getReportCurrencySeparators() {
  if (currencySeparatorsPromise) return currencySeparatorsPromise;
  const etendoBase = process.env.ETENDO_URL || 'http://localhost:8080/etendo';
  currencySeparatorsPromise = fetch(`${etendoBase}/sws/neo/currency-format`)
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`status ${res.status}`))))
    .then((data) => ({
      thousandsSeparator: typeof data?.thousandsSeparator === 'string' ? data.thousandsSeparator : '.',
      decimalSeparator: typeof data?.decimalSeparator === 'string' ? data.decimalSeparator : ',',
    }))
    .catch(() => ({ thousandsSeparator: '.', decimalSeparator: ',' }));
  return currencySeparatorsPromise;
}

// Decode JWT payload (no verification needed — dev proxy only) to extract Etendo claims.
function getClientIdFromRequest(req) {
  try {
    const auth = req.headers['authorization'] || '';
    const token = auth.replace(/^Bearer\s+/i, '');
    if (!token) return null;
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    return payload.client || null;
  } catch { return null; }
}

// Find gradle.properties for DB connection
function findGradleProps() {
  const candidates = [
    process.env.ETENDO_GRADLE_PROPERTIES,
    resolve(ROOT, 'etendo_core/gradle.properties'),
    resolve(ROOT, '../gradle.properties'),
  ].filter(Boolean);
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

function parseGradleProps(path) {
  const content = readFileSync(path, 'utf8');
  const props = {};
  for (const line of content.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    props[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return props;
}

// ---------------------------------------------------------------------------
// Rendered-report i18n (ETP-4898) now lives in @etendosoftware/schema-forge-cli
// (cli/src/report-i18n.js) and is imported above. It used to be defined right
// here, which is exactly why the production report-server never had it: code
// written inline in this plugin does not reach the server, only shared modules
// do. Do not re-add a local copy — extend the shared module instead.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Row grouping, opening balances and account trees now live in
// @etendosoftware/schema-forge-cli (cli/src/report-grouping.js) and are imported
// above. They used to be defined right here, which is exactly why the production
// report-server never had them: code written inline in this plugin does not
// reach the server, only shared modules do. The re-export below keeps the
// existing `import { ... } from '../vite-plugins/report-api.js'` test entry
// points working. Do not re-add local copies — extend the shared module.
// ---------------------------------------------------------------------------
export { buildNestedGroups, buildAccountReportTree };
export {
  foldOpeningBalance,
  foldAggregateRows,
} from '@etendosoftware/schema-forge-cli/src/report-grouping.js';


/**
 * List all artifact dirs that have a report-contract.json
 */
function listReports() {
  const reports = [];
  for (const dir of readdirSync(ARTIFACTS_DIR, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const contractPath = join(ARTIFACTS_DIR, dir.name, 'report-contract.json');
    if (existsSync(contractPath)) {
      try {
        const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
        // 'custom' contracts (ETP-4901) are internal NEO endpoints backing a specific
        // page's own data needs (e.g. financial-accounts-page powers the Cuentas
        // landing page's sidebar widgets) — real, still-served endpoints, just never
        // meant to show up as a runnable report a user picks from this catalog.
        if (contract.reportId && contract.outputs?.length > 0 && contract.type !== 'document' && contract.type !== 'custom' && (contract.source === 'jasper-migration' || contract.source === 'manual' || contract.source === 'sql' || contract.source === 'neo' || contract.mockDataFile)) {
          reports.push({
            id: contract.reportId,
            title: contract.title,
            type: contract.type,
            category: contract.category || 'other',
            orientation: contract.orientation,
            outputs: contract.outputs,
            parameters: contract.parameters || [],
            sections: contract.sections || [],
          });
        }
      } catch { /* skip malformed */ }
    }
  }
  return reports;
}

/**
 * Fetch report data.
 * Mode is determined by VITE_MOCK env var (read from .env.local):
 *   VITE_MOCK=true  → use mock data files
 *   VITE_MOCK=false → use real data (NEO API or Jasper SQL)
 */
async function fetchReportData(reportId, { limit, authToken, params = {} } = {}) {
  const contractPath = join(ARTIFACTS_DIR, reportId, 'report-contract.json');
  const contract = JSON.parse(readFileSync(contractPath, 'utf8'));

  // Check mock mode from env (VITE_MOCK in .env.local)
  const isMock = process.env.VITE_MOCK === 'true';

  if (isMock) {
    // Mock mode: use mock data file
    if (contract.mockDataFile) {
      const mockPath = join(ARTIFACTS_DIR, reportId, contract.mockDataFile);
      if (existsSync(mockPath)) {
        let rows = JSON.parse(readFileSync(mockPath, 'utf8'));
        if (limit && Array.isArray(rows)) rows = rows.slice(0, parseInt(limit, 10));
        return { rows, contract };
      }
    }
    throw new Error(`Mock data file not found for report '${reportId}'`);
  }

  // Real mode: NEO API (calls Etendo backend via NeoHandler)
  if (contract.neo?.endpoint) {
    if (!authToken) throw new Error('No auth token — user must be logged in');
    const etendoBase = process.env.ETENDO_URL || 'http://localhost:8080/etendo';
    const neoUrl = `${etendoBase}${contract.neo.endpoint}`;
    const neoBody = { ...(contract.neo.body || {}), ...params };

    const neoRes = await fetch(neoUrl, {
      method: contract.neo.method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify(neoBody),
    });

    if (!neoRes.ok) {
      const text = await neoRes.text().catch(() => '');
      throw new Error(`NEO ${neoRes.status}: ${text.slice(0, 200)}`);
    }

    const data = await neoRes.json();
    let rows = data;
    if (contract.neo.dataPath) {
      for (const key of contract.neo.dataPath.split('.')) {
        rows = rows?.[key];
      }
    }
    if (!Array.isArray(rows) && typeof rows !== 'object') throw new Error('NEO response did not contain valid data');
    if (limit && Array.isArray(rows)) rows = rows.slice(0, parseInt(limit, 10));

    // Extract backend meta (sibling of the data array in the response path)
    let neoMeta = {};
    if (contract.neo.dataPath) {
      const pathParts = contract.neo.dataPath.split('.');
      const metaParts = [...pathParts.slice(0, -1), 'meta'];
      let metaObj = data;
      for (const key of metaParts) metaObj = metaObj?.[key];
      if (metaObj && typeof metaObj === 'object') neoMeta = metaObj;
    }

    return { rows, contract, neoMeta };
  }

  // Document type: multiple queries (header + lines + taxes)
  if (contract.type === 'document' && contract.sql?.header) {
    const gradlePath = findGradleProps();
    if (!gradlePath) throw new Error('gradle.properties not found');
    const gradle = parseGradleProps(gradlePath);
    const pg = await import('pg');
    const pool = new pg.default.Pool({
      host: gradle['bbdd.host'] || 'localhost',
      port: parseInt(gradle['bbdd.port']) || 5432,
      user: gradle['bbdd.user'],
      password: gradle['bbdd.password'],
      database: gradle['bbdd.sid'],
      max: 3,
    });

    try {
      function replacePlaceholders(sql) {
        let q = sql;
        for (const [key, value] of Object.entries(params)) {
          if (value) q = q.replace(new RegExp(`__${key.toUpperCase()}__`, 'g'), String(value).replace(/'/g, "''"));
        }
        return q;
      }

      const headerSql = replacePlaceholders(contract.sql.header);
      // Keep branding generic for document contracts: existing reports use
      // `org` as the organization alias, while newer contracts may expose
      // `org_logo_id` explicitly. The fallback lets older print artifacts opt
      // into the shared branding partial without duplicating this subquery.
      const brandedHeaderSql = headerSql.includes('org_logo_id')
        ? headerSql
        : headerSql.replace(/^SELECT\s+/i,
          'SELECT (SELECT oi.your_company_document_image FROM ad_orginfo oi WHERE oi.ad_org_id = org.ad_org_id) AS org_logo_id, ');
      const linesSql = replacePlaceholders(contract.sql.lines);

      const headerResult = await pool.query(brandedHeaderSql);
      const header = await hydrateDocumentBranding(headerResult.rows[0] || {}, {
        authToken,
        etendoBase: process.env.ETENDO_URL || 'http://localhost:8080/etendo',
      });

      const linesResult = await pool.query(linesSql);
      const lines = linesResult.rows;

      let taxes = [];
      if (contract.sql.taxes) {
        const taxesSql = replacePlaceholders(contract.sql.taxes);
        const taxResult = await pool.query(taxesSql);
        taxes = taxResult.rows;
      }

      // For document type, return structured data (not flat rows)
      return { rows: lines, contract, documentData: { header, lines, taxes } };
    } finally {
      await pool.end();
    }
  }

  // SQL query: either inline in contract or from Jasper jrxml
  let sql = null;

  // Source: inline SQL in contract
  if (contract.sql?.query) {
    sql = contract.sql.query;
  }

  // Source: Jasper jrxml SQL
  if (!sql && contract.jasper?.originalFile) {
    const jrxmlPath = resolve(ROOT, contract.jasper.originalFile);
    if (!existsSync(jrxmlPath)) {
      throw new Error(`JRXML not found: ${jrxmlPath}`);
    }
    const extractorPath = resolve(ROOT, 'node_modules/@etendosoftware/schema-forge-cli/src/extract-from-jasper.js');
    const { parseJrxml } = await import(/* @vite-ignore */ extractorPath);
    const parsed = parseJrxml(readFileSync(jrxmlPath, 'utf8'));
    sql = parsed.query;
  }

  if (!sql) {
    throw new Error(`No data source configured for report '${reportId}' (need neo, sql, jasper, or mockDataFile)`);
  }

  // Connect to DB
  const gradlePath = findGradleProps();
  if (!gradlePath) throw new Error('gradle.properties not found');
  const gradle = parseGradleProps(gradlePath);

  const pg = await import('pg');
  const pool = new pg.default.Pool({
    host: gradle['bbdd.host'] || 'localhost',
    port: parseInt(gradle['bbdd.port']) || 5432,
    user: gradle['bbdd.user'],
    password: gradle['bbdd.password'],
    database: gradle['bbdd.sid'],
    max: 3,
  });

  // __PLACEHOLDER__ substitution and SQL scoping live in the shared module
  // (report-sql.js) so the production report-server applies the IDENTICAL
  // rules — the optional-clause stripper used to be fixed here only, which
  // broke Balance Sheet and Profit & Loss on every server.

  try {
    const clientId = getClientIdFromRequest({ headers: { authorization: authToken ? `Bearer ${authToken}` : '' } }) || '0';

    sql = applyPlaceholders(sql, { clientId, params, contract });

    // Inject date filters for Jasper SQL queries that don't have __PLACEHOLDER__ tokens.
    // The contract can specify a dateColumn (e.g., "dateColumn": "DATEACCT" or "O.DATEORDERED").
    // If not specified, we try to detect the date column from the SQL.
    if (contract.jasper?.originalFile) {
      const dateParams = (contract.parameters || []).filter(p => p.type === 'date');
      const extraClauses = [];
      for (const p of dateParams) {
        const val = params[p.name];
        if (!val) continue;
        // Use contract-level dateColumn, or param-level column, or detect from SQL
        const col = p.column || contract.jasper.dateColumn
          || (sql.match(/\b(\w+\.)?DATEORDERED\b/i)?.[0])
          || (sql.match(/\b(\w+\.)?DATEACCT\b/i)?.[0])
          || 'DATEACCT';
        const escaped = String(val).replace(/'/g, "''");
        if (p.name.toLowerCase().includes('from')) {
          extraClauses.push(`${col} >= '${escaped}'::date`);
        } else if (p.name.toLowerCase().includes('to')) {
          extraClauses.push(`${col} <= '${escaped}'::date`);
        }
      }
      if (extraClauses.length > 0) {
        const insertPoint = sql.search(/\bGROUP\s+BY\b/i);
        if (insertPoint > 0) {
          sql = sql.slice(0, insertPoint) + 'AND ' + extraClauses.join(' AND ') + '\n' + sql.slice(insertPoint);
        } else {
          const orderPoint = sql.search(/\bORDER\s+BY\b/i);
          if (orderPoint > 0) {
            sql = sql.slice(0, orderPoint) + 'AND ' + extraClauses.join(' AND ') + '\n' + sql.slice(orderPoint);
          }
        }
      }
    }

    if (limit) sql = sql.replace(/;\s*$/, '') + ` LIMIT ${parseInt(limit, 10)}`;

    const { rows } = await pool.query(sql);

    // Optional opening-balance query (ETP-4898 — Libro Mayor's "Initial Balance"/Saldo inicial).
    // Same placeholder rules as the main query, just no LIMIT — it's already pre-aggregated.
    let openingRows = null;
    if (contract.sql?.openingQuery) {
      const openingSql = applyPlaceholders(contract.sql.openingQuery, { clientId, params, contract });
      openingRows = (await pool.query(openingSql)).rows;
    }

    // Optional formula-operand query (ETP-4899 — Profit & Loss's computed nodes,
    // e.g. "A) RESULTADO DE EXPLOTACIÓN (1+2+...+12)"). Same placeholder rules;
    // consumed by buildAccountReportTree(), never rendered directly.
    let operandRows = null;
    if (contract.sql?.operandsQuery) {
      const operandsSql = applyPlaceholders(contract.sql.operandsQuery, { clientId, params, contract });
      operandRows = (await pool.query(operandsSql)).rows;
    }

    return { rows, contract, openingRows, operandRows };
  } finally {
    await pool.end();
  }
}

export default function reportApiPlugin() {
  return {
    name: 'report-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://localhost');
        const path = url.pathname;

        // GET /sws/report-selectors/:type?q=search — search BP, Product, Org for report filters
        // Also matches legacy /api/report-selectors/ path used in older builds.
        const selectorMatch = path.match(/^\/(?:sws|api)\/report-selectors\/([\w-]+)$/);
        if (req.method === 'GET' && selectorMatch) {
          const type = selectorMatch[1];
          const q = (url.searchParams.get('q') || '').trim();
          const limit = Math.max(1, Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100));
          const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10));
          const selectedOrgId = (url.searchParams.get('selectedOrgId') || '').trim();
          const selectedAcctSchemaId = (url.searchParams.get('selectedAcctSchemaId') || '').trim();
          const selectedWarehouseIds = (url.searchParams.get('warehouseIds') || '')
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);
          const roleOrgIds = (url.searchParams.get('roleOrgIds') || '')
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);
          try {
            const gradlePath = findGradleProps();
            if (!gradlePath) throw new Error('gradle.properties not found');
            const gradle = parseGradleProps(gradlePath);
            const pg = await import('pg');
            const pool = new pg.default.Pool({ host: gradle['bbdd.host'] || 'localhost', port: parseInt(gradle['bbdd.port']) || 5432, user: gradle['bbdd.user'], password: gradle['bbdd.password'], database: gradle['bbdd.sid'], max: 2 });
            try {
              const clientId = getClientIdFromRequest(req);
              const byClient = (col) => clientId ? `AND ${col} = '${clientId}'` : '';
              const queries = {
                'bpartner': {
                  fromWhere: `FROM c_bpartner WHERE isactive='Y' ${byClient('ad_client_id')} AND name ILIKE $1`,
                  orderBy: 'ORDER BY name',
                  select: `SELECT c_bpartner_id AS id, name, name AS label`
                },
                'product': {
                  // ETP-4967: excludes products under a category flagged EM_Etgo_IsSystemCategory='Y'
                  // (e.g. ETGO_DTO, category "Discounts") — mirrors ReportSelectorsServlet.buildProductQuery
                  // (com.etendoerp.go). This dev-only mock hits Postgres directly, so the real Java
                  // fix never runs against it; keep both in sync.
                  fromWhere: `FROM m_product WHERE isactive='Y' ${byClient('ad_client_id')} AND (name ILIKE $1 OR value ILIKE $1) AND NOT EXISTS (SELECT 1 FROM m_product_category mpc WHERE mpc.m_product_category_id = m_product.m_product_category_id AND mpc.em_etgo_issystemcategory = 'Y')`,
                  orderBy: 'ORDER BY value, name',
                  select: `SELECT m_product_id AS id, value AS "searchKey", name, value || ' - ' || name AS label`
                },
                'warehouse': {
                  fromWhere: `FROM m_warehouse WHERE isactive='Y' ${byClient('ad_client_id')} AND name ILIKE $1`,
                  orderBy: 'ORDER BY name',
                  select: `SELECT m_warehouse_id AS id, name, name AS label`
                },
                'product-category': {
                  // ETP-4967: mirrors ReportSelectorsServlet.buildProductCategoryQuery (see note above).
                  fromWhere: `FROM m_product_category WHERE isactive='Y' ${byClient('ad_client_id')} AND name ILIKE $1 AND COALESCE(em_etgo_issystemcategory, 'N') <> 'Y'`,
                  orderBy: 'ORDER BY name',
                  select: `SELECT m_product_category_id AS id, name, name AS label`
                },
                'project': {
                  fromWhere: `FROM c_project WHERE isactive='Y' ${byClient('ad_client_id')} AND name ILIKE $1`,
                  orderBy: 'ORDER BY name',
                  select: `SELECT c_project_id AS id, name, name AS label`
                },
                'org': {
                  fromWhere: `FROM ad_org WHERE isactive='Y' AND ad_org_id != '0' ${byClient('ad_client_id')} AND name ILIKE $1`,
                  orderBy: 'ORDER BY name',
                  select: `SELECT ad_org_id AS id, name, name AS label`
                },
                'account': {
                  fromWhere: `FROM c_elementvalue ev WHERE ev.isactive='Y' AND ev.issummary='N' ${byClient('ev.ad_client_id')} AND (ev.value ILIKE $1 OR ev.name ILIKE $1)`,
                  orderBy: 'ORDER BY ev.value',
                  select: `SELECT ev.value AS id, ev.value || ' - ' || ev.name AS name, ev.value || ' - ' || ev.name AS label`
                },
                'accounting': {
                  fromWhere: `FROM c_acctschema WHERE isactive='Y' ${byClient('ad_client_id')} AND name ILIKE $1`,
                  orderBy: 'ORDER BY name',
                  select: `SELECT c_acctschema_id AS id, name, name AS label`
                },
                'acctschema': {
                  fromWhere: `FROM c_acctschema WHERE isactive='Y' ${byClient('ad_client_id')} AND name ILIKE $1`,
                  orderBy: 'ORDER BY name',
                  select: `SELECT c_acctschema_id AS id, name, name AS label`
                },
                'year': {
                  fromWhere: `FROM c_year y JOIN c_calendar c ON c.c_calendar_id = y.c_calendar_id WHERE y.isactive='Y' ${byClient('y.ad_client_id')} AND (y.year || ' (' || c.name || ')') ILIKE $1`,
                  orderBy: 'ORDER BY y.year DESC',
                  select: `SELECT y.c_year_id AS id, y.year || ' (' || c.name || ')' AS name, y.year || ' (' || c.name || ')' AS label`
                },
                'currency': {
                  // Unlike every other selector above, this used to skip byClient(...) entirely
                  // and return the full ~150-row ISO currency table. Scoped down to mirror
                  // /sales-order's CurrencyRatePicker (client's base currency + anything with an
                  // active C_Conversion_Rate row for this client, either direction) — without its
                  // date-validity check, since a report has a dateFrom/dateTo range, not one single
                  // document date to convert against.
                  //
                  // The DEFAULT/first-choice currency prefers the ACTIVE ORGANIZATION's own
                  // currency (ad_org.c_currency_id — the same field /organization's "Moneda" shows),
                  // not just the client's base currency: a multi-org client can have organizations
                  // in different currencies. Falls back to the client's base currency when no
                  // selectedOrgId is passed (matches every other org-scoped selector's fallback).
                  fromWhere: clientId
                    ? `FROM c_currency WHERE isactive='Y' AND (iso_code ILIKE $1 OR description ILIKE $1)
                        AND (
                          c_currency_id = (SELECT c_currency_id FROM ad_client WHERE ad_client_id = '${clientId}')
                          ${selectedOrgId ? `OR c_currency_id = (SELECT c_currency_id FROM ad_org WHERE ad_org_id = '${selectedOrgId}')` : ''}
                          OR EXISTS (
                            SELECT 1 FROM c_conversion_rate cr
                             WHERE cr.isactive = 'Y'
                               AND cr.ad_client_id IN ('${clientId}', '0')
                               AND (cr.c_currency_id = c_currency.c_currency_id OR cr.c_currency_id_to = c_currency.c_currency_id)
                          )
                        )`
                    : `FROM c_currency WHERE isactive='Y' AND (iso_code ILIKE $1 OR description ILIKE $1)`,
                  orderBy: clientId
                    ? (selectedOrgId
                        ? `ORDER BY (CASE WHEN c_currency_id = (SELECT c_currency_id FROM ad_org WHERE ad_org_id = '${selectedOrgId}') THEN 0 ELSE 1 END), iso_code`
                        : `ORDER BY (CASE WHEN c_currency_id = (SELECT c_currency_id FROM ad_client WHERE ad_client_id = '${clientId}') THEN 0 ELSE 1 END), iso_code`)
                    : 'ORDER BY iso_code',
                  select: `SELECT c_currency_id AS id, iso_code AS name, iso_code || ' - ' || description AS label`
                },
                'tax': {
                  fromWhere: `FROM c_tax WHERE isactive='Y' ${byClient('ad_client_id')} AND name ILIKE $1`,
                  orderBy: 'ORDER BY name',
                  select: `SELECT c_tax_id AS id, name, name AS label`
                },
              };
              const queryCfg = queries[type];
              if (!queryCfg) throw new Error(`Unknown selector type: ${type}`);
              const search = `%${q}%`;
              const whereFragments = [queryCfg.fromWhere];
              // $1 = search; additional dynamic params start at $2
              const values = [search];

              if (type === 'year' && selectedOrgId) {
                values.push(selectedOrgId);
                whereFragments.push(
                  `AND EXISTS (SELECT 1 FROM ad_org o WHERE o.c_calendar_id = c.c_calendar_id AND o.ad_org_id = $${values.length})`
                );
              }

              if (type === 'warehouse') {
                if (selectedOrgId) {
                  values.push(selectedOrgId);
                  whereFragments.push(
                    `AND EXISTS (SELECT 1 FROM ad_org_warehouse ow WHERE ow.m_warehouse_id = m_warehouse.m_warehouse_id AND ow.ad_org_id = $${values.length})`
                  );
                }

                if (roleOrgIds.length > 0) {
                  values.push(roleOrgIds);
                  whereFragments.push(
                    `AND EXISTS (SELECT 1 FROM ad_org_warehouse ow WHERE ow.m_warehouse_id = m_warehouse.m_warehouse_id AND ow.ad_org_id = ANY($${values.length}))`
                  );
                }
              }

              if (type === 'product') {
                if (selectedWarehouseIds.length > 0) {
                  values.push(selectedWarehouseIds);
                  whereFragments.push(
                    `AND EXISTS (SELECT 1 FROM m_storage_detail sd JOIN m_locator l ON l.m_locator_id = sd.m_locator_id WHERE sd.m_product_id = m_product.m_product_id AND l.m_warehouse_id = ANY($${values.length}))`
                  );
                }

                if (selectedOrgId) {
                  values.push(selectedOrgId);
                  whereFragments.push(
                    `AND EXISTS (SELECT 1 FROM m_storage_detail sd JOIN m_locator l ON l.m_locator_id = sd.m_locator_id WHERE sd.m_product_id = m_product.m_product_id AND ad_isorgincluded(l.ad_org_id, $${values.length}, m_product.ad_client_id) <> -1)`
                  );
                }

                if (roleOrgIds.length > 0) {
                  values.push(roleOrgIds);
                  whereFragments.push(
                    `AND EXISTS (SELECT 1 FROM m_storage_detail sd JOIN m_locator l ON l.m_locator_id = sd.m_locator_id WHERE sd.m_product_id = m_product.m_product_id AND l.ad_org_id = ANY($${values.length}))`
                  );
                }
              }

              if (type === 'account' && selectedAcctSchemaId) {
                values.push(selectedAcctSchemaId);
                whereFragments.push(`AND ev.c_element_id IN (SELECT c_element_id FROM c_acctschema_element WHERE c_acctschema_id = $${values.length} AND c_element_id IS NOT NULL)`);
              }

              const fullFromWhere = whereFragments.join(' ');
              const countSql = `SELECT COUNT(*)::int AS total ${fullFromWhere}`;
              const rowsSql = `${queryCfg.select} ${fullFromWhere} ${queryCfg.orderBy} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;

              const countResult = await pool.query(countSql, values);
              const totalCount = countResult.rows[0]?.total ?? 0;
              const { rows } = await pool.query(rowsSql, [...values, limit, offset]);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                items: rows,
                totalCount,
                hasMore: offset + rows.length < totalCount,
              }));
            } finally { await pool.end(); }
          } catch (e) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message }));
          }
          return;
        }

        // GET /api/reports — list migrated reports
        if (req.method === 'GET' && path === '/api/reports') {
          try {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(listReports()));
          } catch (e) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message }));
          }
          return;
        }

        // GET /api/reports/:id/data — fetch report data from DB
        const dataMatch = path.match(/^\/api\/reports\/([\w-]+)\/data$/);
        if (req.method === 'GET' && dataMatch) {
          const reportId = dataMatch[1];
          const limit = url.searchParams.get('limit');
          try {
            const authToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
            const { rows, contract } = await fetchReportData(reportId, { limit, authToken });
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ rows, contract, count: rows.length }));
          } catch (e) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message }));
          }
          return;
        }

        // POST /api/reports/:id/render — render via jsreport
        const renderMatch = path.match(/^\/api\/reports\/([\w-]+)\/render$/);
        if (req.method === 'POST' && renderMatch) {
          const reportId = renderMatch[1];
          let body = '';
          for await (const chunk of req) body += chunk;
          const { format = 'html', limit, params = {}, locale = 'en_US' } = JSON.parse(body || '{}');

          try {
            const authToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
            const result = await fetchReportData(reportId, { limit, authToken, params });
            let { rows, contract, documentData, neoMeta = {}, openingRows, operandRows } = result;

            // Account-report tree reports (ETP-4899 — Profit & Loss): the SQL returns
            // the FLAT node list, and the indented tree (roll-up, formula nodes,
            // account-level cutoff) is assembled here, replacing `rows` so
            // recordCount/totals and the Excel/CSV templates keep working unchanged.
            if (contract.sql?.operandsQuery !== undefined && Array.isArray(rows)) {
              rows = buildAccountReportTree(rows, operandRows, {
                accountLevel: params.accountLevel || 'S',
                showOnlyWithValue: params.showOnlyAccountsWithValue === 'true',
              });
            }

            // Handle groupBy parameter: find the dimension param whose groupByValue matches and
            // re-sort rows by that field. `groupLabel` ("Account"/"Cuenta") and `descriptionLabel`
            // ("Description") stay FIXED — they must never be overwritten by the chosen dimension,
            // because grouping by a dimension nests inside Account, it doesn't replace it (ETP-4898:
            // "no perder la Cuenta al agrupar"). `name`/`value` (the row's account name/code) are
            // never touched either, for the same reason — the template needs them intact to keep
            // rendering the Account band nested under the dimension's own band.
            // Band labels, the grouped-by field, the dimension-folded rows and tbGroups —
            // all resolved by the module the report-server shares, so both engines group
            // identically instead of almost-identically.
            let groupLabel; let descriptionLabel; let dimensionLabel; let dimensionField; let tbGroups;
            ({ groupLabel, descriptionLabel, dimensionLabel, dimensionField, tbGroups, rows } =
              resolveGrouping(contract, params, rows, locale));
            const activeFilters = Object.entries(params)
              .filter(([k, v]) => v && v !== '' && !k.startsWith('_display_'))
              .map(([k, v]) => {
                const paramDef = contract.parameters?.find(p => p.name === k);
                // Use display name if available (for search selectors that send UUIDs)
                let displayValue = params['_display_' + k] || v;
                // For groupBy: resolve the stored key ('bpartner', 'product') to its human label
                if (k === 'groupBy') {
                  const dimParam = (contract.parameters || []).find(p => p.groupByValue === v);
                  displayValue = pickLabel(dimParam?.label, locale, v);
                } else if (paramDef?.options) {
                  // Any select with a literal `options` list stores the raw option value
                  // ('S', 'acct', 'B'…). Resolve it to the human label so the filter chip
                  // reads "Account Level: Heading", not "Account Level: E".
                  const opt = paramDef.options.find(o => String(o.value) === String(v));
                  if (opt) displayValue = pickLabel(opt.label, locale, v);
                }
                if (typeof displayValue === 'string' && displayValue.includes(' | ')) {
                  displayValue = displayValue.split(' | ').filter(Boolean).join(', ');
                }
                // Format date values from ISO (YYYY-MM-DD) to DD/MM/YYYY
                if (paramDef?.type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(displayValue)) {
                  const [y, m, d] = displayValue.split('-');
                  displayValue = `${d}/${m}/${y}`;
                }
                return { label: pickLabel(paramDef?.label, locale, k), value: displayValue };
              });
            const artifactDir = join(ARTIFACTS_DIR, reportId);
            // Excel/CSV get their own flat, calculation-friendly template when the report
            // declares one (ETP-4898). Both recipes render whatever markup/text they're given —
            // reusing the HTML/PDF template (grouped bands, formatted amounts, full <style>
            // block) makes a .xlsx that can't be summed/pivoted, and for CSV (recipe 'text',
            // which streams the compiled template output byte-for-byte) it means the ENTIRE
            // rendered HTML page — <style>, <div>s and all — gets dumped verbatim into a .csv
            // file. Falls back to the shared template.hbs otherwise — reports without a
            // per-format template are unaffected.
            const perFormatTemplateFile = { xlsx: 'template-excel.hbs', csv: 'template-csv.hbs' }[format];
            const perFormatTemplatePath = perFormatTemplateFile ? join(artifactDir, perFormatTemplateFile) : null;
            const templatePath = (perFormatTemplatePath && existsSync(perFormatTemplatePath))
              ? perFormatTemplatePath
              : join(artifactDir, 'template.hbs');
            const templateContent = expandReportPartials(readFileSync(templatePath, 'utf8'));
            const helpersPath = join(artifactDir, 'helpers.js');
            const helpersCode = existsSync(helpersPath) ? readFileSync(helpersPath, 'utf8') : '';
            const cssPath = join(ROOT, 'templates', 'reports', 'base.css');
            const css = existsSync(cssPath) ? readFileSync(cssPath, 'utf8') : '';

            const recipeMap = { html: 'html', pdf: 'chrome-pdf', xlsx: 'html-to-xlsx', csv: 'text' };
            const recipe = recipeMap[format] || 'html';
            const title = pickLabel(contract.title, locale, reportId);
            const ui = REPORT_UI_STRINGS[locale] || REPORT_UI_STRINGS.en_US;
            const labels = buildContractLabels(contract, locale);

            // Document type: structured data (header + lines + taxes)
            // Listing type: flat rows
            const amountCols = (contract.columns || []).filter(c => c.type === 'amount');
            const recordCount = Array.isArray(rows) ? rows.length : undefined;
            // Always built (ETP-4898): every account — grouped by a dimension or not — needs
            // its opening balance / running balance / subtotal / total, so both the flat and
            // nested-card templates read the same `meta.groups` shape. Without a dimension,
            // `dimensionField` is undefined and buildNestedGroups folds everything into one
            // implicit group (`dimensionValue: null`).
            const groups = (!documentData && Array.isArray(rows))
              ? buildNestedGroups(rows, dimensionField, openingRows)
              : null;
            const totals = {};
            if (!documentData && amountCols.length && Array.isArray(rows)) {
              for (const col of amountCols) {
                totals[col.field] = rows.reduce((sum, r) => sum + (Number(r[col.field]) || 0), 0);
              }
            }
            const templateData = documentData
              ? { css, meta: { title, generatedAt: new Date().toISOString(), filters: activeFilters, params, locale, ui, labels }, header: documentData.header, lines: documentData.lines, taxes: documentData.taxes }
              : { css, meta: { title, generatedAt: new Date().toISOString(), recordCount, filters: activeFilters, params, locale, ui, labels, totals, groupLabel, descriptionLabel, dimensionLabel, dimensionField, groups, tbGroups, ...neoMeta }, rows };

            // Document (print-*) reports render a QR of the header. QRCode.toDataURL
            // is async while Handlebars.compile is sync, so the QR cannot be a helper
            // on the HTML path — precompute it once here, before the format branch, so
            // both the local HTML render and the jsreport PDF/XLSX payload see the same
            // {{header.qrDataUrl}}. A QR failure degrades to a report without QR
            // instead of failing the whole render.
            if (documentData?.header && templateData.header) {
              try {
                templateData.header.qrDataUrl = await computeDocumentQrDataUrl(documentData.header, { qrcode: _require('qrcode') });
              } catch (qrErr) {
                console.warn('[report-api] QR generation failed:', qrErr.message);
              }
            }

            // Direct HTML render — no jsreport needed for preview
            if (format === 'html') {
              const Handlebars = _require('handlebars');

              // Register the trusted in-repo helper set — no dynamic code execution.
              // helpersCode is read (not executed) only to preserve a report's
              // formatNumber decimals. Document QR codes are precomputed as data
              // (header.qrDataUrl) above — never as a helper.
              registerReportHelpers(Handlebars, helpersCode);

              const template = Handlebars.compile(templateContent);
              const html = template(templateData);
              res.setHeader('Content-Type', 'text/html; charset=utf-8');
              res.end(html);
              return;
            }

            // Serialize the same canonical helpers used above for the HTML preview,
            // plus only this report's specific extras — a single
            // source of truth for both render paths instead of a hand-maintained
            // copy per report. See buildJsreportHelpersString() for why jsreport
            // (a separate Docker container, reachable only over HTTP) can't just
            // import formatCurrency()/this module directly. Never inline a second
            // currency formatter here — see CLAUDE.md § Currency & Amount Formatting.
            const separators = await getReportCurrencySeparators();
            const payload = {
              template: { content: templateContent, engine: 'handlebars', recipe, helpers: buildJsreportHelpersString(helpersCode, undefined, separators) },
              data: templateData,
            };

            if (recipe === 'chrome-pdf') {
              payload.template.chrome = {
                landscape: contract.orientation === 'landscape' || params.showLandscape === 'true',
                format: 'A4', marginTop: '10mm', marginBottom: '10mm', marginLeft: '10mm', marginRight: '10mm',
              };
            }

            let jsRes;
            try {
              jsRes = await fetch(`${JSREPORT_URL}/api/report`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              });
            } catch (connErr) {
              const isConnRefused = connErr.message?.includes('ECONNREFUSED') || connErr.message === 'fetch failed';
              if (isConnRefused) {
                throw new Error(`jsreport is not running — start it with: make report-serve-detach`);
              }
              throw connErr;
            }

            if (!jsRes.ok) {
              const text = await jsRes.text();
              throw new Error(`jsreport ${jsRes.status}: ${text.slice(0, 200)}`);
            }

            const contentType = jsRes.headers.get('content-type') || 'text/html';
            res.setHeader('Content-Type', contentType);
            const buffer = Buffer.from(await jsRes.arrayBuffer());
            res.end(buffer);
          } catch (e) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: e.message }));
          }
          return;
        }

        next();
      });
    },
  };
}
