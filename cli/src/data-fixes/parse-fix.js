/**
 * parse-fix.js
 *
 * Parser + apply-time templating for tenant data-fix `.sql` files.
 *
 * A fix file has a metadata header (`-- @key: value` lines) followed by two
 * labeled sections introduced by bare marker lines `-- @check` and `-- @apply`:
 *
 *   -- @id: R3-periodcontrol
 *   -- @gap: C2
 *   -- @risk: medium
 *   -- @type: sql                 (default; or "webhook")
 *   -- @description: one-line human description
 *
 *   -- @check
 *   -- Returns >=1 row when the fix IS needed. 0 rows => SKIPPED_NOT_NEEDED.
 *   SELECT 1 FROM ... WHERE ad_client_id = :client_id AND NOT EXISTS (...);
 *
 *   -- @apply
 *   INSERT INTO ... SELECT ... WHERE ad_client_id = :client_id AND NOT EXISTS (...);
 *
 * The `fix_id` is the file name without the `.sql` extension (the leading
 * `<YYYYMMDDThhmmssZ>` prefix makes lexical sort == chronological order).
 */

import { randomUUID } from 'node:crypto';

const SECTION_MARKER = /^--\s*@(check|apply)\s*$/i;
// No `\s*` after the colon on purpose: it would overlap `(.*)` (both match
// spaces), which is the ambiguous adjacency that triggers super-linear
// backtracking (S5852). The captured value is `.trim()`-ed below, so leading
// whitespace is dropped anyway — the regex stays linear and behavior is identical.
const HEADER_LINE = /^--\s*@([A-Za-z_]+)\s*:(.*)$/;

function validations(type, check, fixId, apply, meta) {
  if (type === 'sql') {
    if (!check) throw new Error(`${fixId}: missing or empty @check section`);
    if (!apply) throw new Error(`${fixId}: missing or empty @apply section`);
  } else if (!meta.webhook) {
    throw new Error(`${fixId}: @type webhook requires a "@webhook: <Name>" header`);
  }
}

/**
 * Parse the raw text of a fix file.
 *
 * @param {string} text  - file contents
 * @param {string} fixId - file name without `.sql`
 * @returns {{
 *   fixId: string, id: string, gap: string|null, risk: string|null,
 *   type: 'sql'|'webhook', description: string|null,
 *   webhook: string|null, check: string, apply: string
 * }}
 */
export function parseFix(text, fixId) {
  const lines = text.split('\n');

  const meta = {};
  const checkLines = [];
  const applyLines = [];
  let section = 'header'; // 'header' | 'check' | 'apply'

  for (const line of lines) {
    const marker = line.match(SECTION_MARKER);
    if (marker) {
      section = marker[1].toLowerCase();
      continue;
    }

    if (section === 'header') {
      const h = line.match(HEADER_LINE);
      if (h) meta[h[1].toLowerCase()] = h[2].trim();
      // non-header lines in the header region (blank lines, free comments) are ignored
      continue;
    }

    if (section === 'check') checkLines.push(line);
    else if (section === 'apply') applyLines.push(line);
  }

  const type = (meta.type || 'sql').toLowerCase();
  if (type !== 'sql' && type !== 'webhook') {
    throw new Error(`${fixId}: invalid @type "${meta.type}" (expected sql|webhook)`);
  }

  const check = checkLines.join('\n').trim();
  const apply = applyLines.join('\n').trim();

  validations(type, check, fixId, apply, meta);



  return {
    fixId,
    id: meta.id || fixId,
    gap: meta.gap || null,
    risk: meta.risk || null,
    type,
    description: meta.description || null,
    webhook: meta.webhook || null,
    check,
    apply,
  };
}

/**
 * Parse the `<YYYYMMDDThhmmssZ>` timestamp prefix of a fix_id into a Date (UTC).
 * Returns null when the fix_id has no parseable timestamp prefix (e.g. the
 * `__baseline__` sentinel).
 *
 * @param {string} fixId
 * @returns {Date|null}
 */
export function parseFixTimestamp(fixId) {
  const m = fixId.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
}

// AD ids are either the System sentinel '0', the org wildcard '*', or 32 hex chars.
const AD_ID = /^([0-9A-Fa-f]{32}|0|\*)$/;

/**
 * Inline validated AD ids into a SQL body in place of `:client_id` / `:org_id`.
 *
 * node-postgres cannot run a multi-statement body with bind parameters
 * (extended protocol is single-statement only), and an `@apply` may contain
 * several statements. Since the ids are tightly controlled AD ids, we validate
 * them strictly against {@link AD_ID} and inline them as quoted literals.
 *
 * @param {string} sql
 * @param {{client_id: string, org_id?: string}} binds
 * @returns {string}
 */
export function inlineParams(sql, binds) {
  const { client_id, org_id } = binds;
  if (!AD_ID.test(client_id)) {
    throw new Error(`inlineParams: refusing to inline unsafe client_id "${client_id}"`);
  }
  if (org_id != null && !AD_ID.test(org_id)) {
    throw new Error(`inlineParams: refusing to inline unsafe org_id "${org_id}"`);
  }
  let out = sql.replace(/:client_id\b/g, `'${client_id}'`);
  if (org_id != null) out = out.replace(/:org_id\b/g, `'${org_id}'`);
  return out;
}

/**
 * Replace the `@name_client@` label with the target tenant's client display
 * name. The token lives INSIDE SQL string literals (e.g. `'Chart of @name_client@'`),
 * so the substitution is the bare, single-quote-escaped name with no surrounding
 * quotes. This keeps per-tenant text (names/descriptions copied from the source
 * client) from being hard-coded to the source client's name.
 *
 * @param {string} sql
 * @param {string|null|undefined} clientName  - ad_client.name of the target tenant
 * @returns {string}
 */
export function inlineClientName(sql, clientName) {
  if (!sql.includes('@name_client@')) return sql;
  if (clientName == null || clientName === '') {
    throw new Error('inlineClientName: target client name not found for @name_client@ substitution');
  }
  const escaped = String(clientName).replace(/'/g, "''");
  return sql.replace(/@name_client@/g, escaped);
}

// A label inside a fix body that must become a fresh, per-tenant Etendo id at
// apply time. The KEY (the original source id, e.g. a 32-hex GOAdmin id) is
// opaque and only used to keep relationships: the SAME `@uuid_<KEY>@` token —
// a primary key in one row, a foreign key in another — always resolves to the
// SAME generated id, so intra-set references stay linked without any runtime
// id-map. Distinct KEYs get distinct ids. A fresh map is built per call, so a
// new apply (i.e. a different tenant) gets a brand-new set of ids and there are
// ZERO cross-client references.
const UUID_TOKEN = /@uuid_([0-9A-Za-z]+)@/g;

/** A fresh Etendo-style id: 32 uppercase hex chars, no hyphens. */
function freshEtendoId() {
  return randomUUID().replace(/-/g, '').toUpperCase();
}

/**
 * Replace every `@uuid_<KEY>@` label in a fix body with a fresh Etendo id, one
 * per distinct KEY. The replacement is the bare id (no quotes) — the SQL author
 * writes the surrounding quotes, e.g. `'@uuid_ABC...@'`, exactly as for any id
 * literal. KEYs are restricted to `[0-9A-Za-z]+` by the token pattern and the
 * generated value is hex, so the substitution is injection-safe.
 *
 * @param {string} sql
 * @returns {string}
 */
export function inlineFreshUuids(sql) {
  const map = new Map();
  return sql.replace(UUID_TOKEN, (_, key) => {
    let id = map.get(key);
    if (!id) {
      id = freshEtendoId();
      map.set(key, id);
    }
    return id;
  });
}
