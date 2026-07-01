#!/usr/bin/env node
/**
 * xml-apply-delta.js — Apply a push-to-neo delta on top of committed XML.
 *
 * Reads:
 *   <prev-xml-dir>/ETGO_SF_SPEC.xml
 *   <prev-xml-dir>/ETGO_SF_ENTITY.xml
 *   <prev-xml-dir>/ETGO_SF_FIELD.xml
 *
 * Plus a delta file produced by `push-to-neo --dump-delta`, with shape:
 *   {
 *     spec: "<kebab>",
 *     tables: {
 *       ETGO_SF_SPEC:   { upserts: [{ _naturalKey, COL: val, ... }], deletes: [...] },
 *       ETGO_SF_ENTITY: { upserts: [...], deletes: [...] },
 *       ETGO_SF_FIELD:  { upserts: [...], deletes: [...] },
 *     },
 *   }
 *
 * Produces predicted XML in <out-dir>/ETGO_SF_*.xml.
 *
 * Row alignment uses natural keys (NOT raw UUIDs), mirroring the rules in
 * cli/src/lib/neo-delta.js:
 *   SPEC   : NAME
 *   ENTITY : <spec-name>/<ad_tab_id>
 *   FIELD  : <spec-name>/<ad_tab_id>/<ad_column_id>
 *
 * If an upsert's natural key matches an existing prev-XML row, the prev row's
 * primary key (UUID) is preserved and its columns are REPLACED with the
 * upsert's columns (the upsert is the intended full state for that row, so
 * columns absent from the upsert are dropped). If no match, the upsert row is
 * appended as-is, using the UUID supplied by the delta (deterministic per
 * Slice 2).
 *
 * Rows outside the spec under apply are passed through untouched. Deletes
 * named in the delta (by PK) are removed unconditionally.
 *
 * The serializer emits one `<data><TABLE_TAG>...</TABLE_TAG>...</data>` file
 * per table. Column order inside a row is alphabetical; row order is by
 * primary key. Both are intentionally deterministic so a byte-diff is stable;
 * the downstream `xml-regeneration-check.js` normalizes child order anyway,
 * so this is purely for human review.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  parseEtgoXmlFile,
  loadEtgoXmlSnapshot,
} from './lib/etgo-xml-parser.js';

const TABLES = [
  { tag: 'ETGO_SF_SPEC',   pk: 'ETGO_SF_SPEC_ID' },
  { tag: 'ETGO_SF_ENTITY', pk: 'ETGO_SF_ENTITY_ID' },
  { tag: 'ETGO_SF_FIELD',  pk: 'ETGO_SF_FIELD_ID' },
];

// ---------------------------------------------------------------------------
// Natural-key derivation for prev-XML rows.
// Mirrors specNaturalKey/entityNaturalKey/fieldNaturalKey in neo-delta.js,
// but recomputed from raw XML columns (which know FK UUIDs, not names).
// ---------------------------------------------------------------------------

function buildPrevIndexes(snapshot) {
  // spec UUID → NAME
  const specIdToName = new Map();
  for (const row of snapshot.spec) {
    if (row.ETGO_SF_SPEC_ID && row.NAME) {
      specIdToName.set(row.ETGO_SF_SPEC_ID, row.NAME);
    }
  }
  // entity UUID → "<specName>/<adTabId>"
  const entityIdToNK = new Map();
  for (const row of snapshot.entity) {
    const sName = specIdToName.get(row.ETGO_SF_SPEC_ID);
    if (sName && row.AD_TAB_ID) {
      entityIdToNK.set(row.ETGO_SF_ENTITY_ID, `${sName}/${row.AD_TAB_ID}`);
    }
  }
  return { specIdToName, entityIdToNK };
}

function specRowNaturalKey(row) {
  return row.NAME || null;
}

function entityRowNaturalKey(row, ctx) {
  const sName = ctx.specIdToName.get(row.ETGO_SF_SPEC_ID);
  if (!sName || !row.AD_TAB_ID) return null;
  return `${sName}/${row.AD_TAB_ID}`;
}

function fieldRowNaturalKey(row, ctx) {
  const parentNK = ctx.entityIdToNK.get(row.ETGO_SF_ENTITY_ID);
  if (!parentNK || !row.AD_COLUMN_ID) return null;
  return `${parentNK}/${row.AD_COLUMN_ID}`;
}

const NATURAL_KEY_FNS = {
  ETGO_SF_SPEC: specRowNaturalKey,
  ETGO_SF_ENTITY: entityRowNaturalKey,
  ETGO_SF_FIELD: fieldRowNaturalKey,
};

// ---------------------------------------------------------------------------
// Delta application
// ---------------------------------------------------------------------------

/**
 * Strip the metadata field `_naturalKey` from a delta row, returning a plain
 * column→value map suitable for XML serialization. Also drops empty values
 * (real `export.database` omits absent columns rather than emitting empty
 * CDATA).
 */
function stripDeltaMeta(deltaRow) {
  const out = {};
  for (const [k, v] of Object.entries(deltaRow)) {
    if (k === '_naturalKey') continue;
    if (v === undefined || v === null) continue;
    const str = String(v);
    if (str === '') continue;
    out[k] = str;
  }
  return out;
}

function columnsToClear(deltaRow) {
  const keys = [];
  for (const [k, v] of Object.entries(deltaRow)) {
    if (k === '_naturalKey') continue;
    if (v === undefined || v === null || String(v) === '') keys.push(k);
  }
  return keys;
}

/**
 * Apply a per-table delta on top of an array of prev rows. The spec name is
 * required so we only touch rows that belong to it; rows from other specs
 * pass through untouched.
 *
 * Returns the new array of rows. Input arrays are not mutated.
 */
function isRowOwnedBySpec(tag, row, specName, ctx) {
  if (tag === 'ETGO_SF_SPEC') return row.NAME === specName;
  if (tag === 'ETGO_SF_ENTITY') return ctx.specIdToName.get(row.ETGO_SF_SPEC_ID) === specName;
  if (tag === 'ETGO_SF_FIELD') {
    const parentNK = ctx.entityIdToNK.get(row.ETGO_SF_ENTITY_ID);
    return parentNK != null && parentNK.startsWith(specName + '/');
  }
  return false;
}

function partitionPrevRows({ prevRows, pk, deletePks, isOwned, naturalKeyFn, ctx }) {
  const ownedByNK = new Map(); // naturalKey → prev row
  const passthrough = [];
  for (const row of prevRows) {
    if (deletePks.has(row[pk])) continue; // dropped
    if (!isOwned(row)) { passthrough.push(row); continue; }
    const nk = naturalKeyFn(row, ctx);
    if (nk == null) {
      // Owned row with no derivable natural key — keep it, but it cannot be
      // upserted into. This should not occur with well-formed XML.
      passthrough.push(row);
      continue;
    }
    ownedByNK.set(nk, row);
  }
  return { ownedByNK, passthrough };
}

function applyUpsertsToOwned({ upserts, ownedByNK, pk }) {
  const resultOwned = [];
  const consumedNKs = new Set();
  for (const upsert of upserts) {
    const nk = upsert._naturalKey;
    const deltaCols = stripDeltaMeta(upsert);
    const clearCols = columnsToClear(upsert);
    const match = nk != null ? ownedByNK.get(nk) : null;
    if (match) {
      const merged = { ...match, ...deltaCols };
      for (const col of clearCols) delete merged[col];
      merged[pk] = match[pk];
      consumedNKs.add(nk);
      resultOwned.push(merged);
    } else {
      resultOwned.push(deltaCols);
    }
  }
  return { resultOwned, consumedNKs };
}

/**
 * Apply a per-table delta on top of an array of prev rows. The spec name is
 * required so we only touch rows that belong to it; rows from other specs
 * pass through untouched.
 *
 * Returns the new array of rows. Input arrays are not mutated.
 */
function applyTableDelta({
  tag, prevRows, deltaTable, specName, ctx,
}) {
  const pk = TABLES.find(t => t.tag === tag).pk;
  const naturalKeyFn = NATURAL_KEY_FNS[tag];
  const isOwned = (row) => isRowOwnedBySpec(tag, row, specName, ctx);

  // 1) Drop deletes (by PK). Deletes from the delta only ever reference
  //    rows owned by this spec (neo-delta.js guarantees that).
  const deletePks = new Set();
  for (const d of deltaTable.deletes || []) {
    if (d[pk]) deletePks.add(d[pk]);
  }

  // 2) Build a natural-key → row index for OWNED rows. Foreign rows are kept
  //    aside untouched.
  const { ownedByNK, passthrough } = partitionPrevRows({
    prevRows, pk, deletePks, isOwned, naturalKeyFn, ctx,
  });

  // 3) Apply upserts. For each, if its natural key matches an owned prev row,
  //    MERGE the upsert's columns onto the prev row (delta wins per-column),
  //    keeping the prev PK and any prev columns the delta does not touch.
  //    Otherwise, append the upsert row using its delta-supplied PK.
  const { resultOwned, consumedNKs } = applyUpsertsToOwned({
    upserts: deltaTable.upserts || [], ownedByNK, pk,
  });

  // 4) Owned rows that were NOT consumed by an upsert and NOT deleted survive.
  //    (computeWindowDelta emits one upsert per live natural key + explicit
  //    deletes for vanished ones, so this branch should be empty in practice.
  //    We keep it for safety so apply-delta is idempotent and tolerant of a
  //    partial delta.)
  for (const [nk, row] of ownedByNK) {
    if (consumedNKs.has(nk)) continue;
    resultOwned.push(row);
  }

  return [...passthrough, ...resultOwned];
}

/**
 * Apply a full delta object to the three prev-XML row arrays.
 *
 * @returns {{spec: Array, entity: Array, field: Array}}
 */
export function applyDelta(prevSnapshot, delta) {
  if (!delta || !delta.spec || !delta.tables) {
    throw new Error('applyDelta: delta must have { spec, tables }');
  }
  const specName = delta.spec;
  const ctx = buildPrevIndexes(prevSnapshot);

  // Natural-key resolution always uses prev-XML state — that's where the
  // FK→UUID chains are stable. The delta upsert rows carry their own
  // _naturalKey, so we don't need a forward-walk through nextSpec/nextEntity.
  const nextSpec = applyTableDelta({
    tag: 'ETGO_SF_SPEC',
    prevRows: prevSnapshot.spec,
    deltaTable: delta.tables.ETGO_SF_SPEC || { upserts: [], deletes: [] },
    specName, ctx,
  });

  const nextEntity = applyTableDelta({
    tag: 'ETGO_SF_ENTITY',
    prevRows: prevSnapshot.entity,
    deltaTable: delta.tables.ETGO_SF_ENTITY || { upserts: [], deletes: [] },
    specName, ctx,
  });

  const nextField = applyTableDelta({
    tag: 'ETGO_SF_FIELD',
    prevRows: prevSnapshot.field,
    deltaTable: delta.tables.ETGO_SF_FIELD || { upserts: [], deletes: [] },
    specName, ctx,
  });

  return { spec: nextSpec, entity: nextEntity, field: nextField };
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

function escapeCdata(value) {
  // CDATA cannot contain the literal "]]>". Split it across two sections.
  return String(value).split(']]>').join(']]]]><![CDATA[>');
}

function serializeRow(tag, row) {
  const keys = Object.keys(row).sort((a, b) => a.localeCompare(b));
  const lines = [`<${tag}>`];
  for (const k of keys) {
    const v = row[k];
    if (v === undefined || v === null) continue;
    const str = String(v);
    if (str === '') continue;
    lines.push(`  <${k}><![CDATA[${escapeCdata(str)}]]></${k}>`);
  }
  lines.push(`</${tag}>`);
  return lines.join('\n');
}

/**
 * Serialize an array of rows into a full XML document under <data>.
 * Rows are sorted by primary key for deterministic output.
 */
export function serializeTable(tag, rows) {
  const pk = TABLES.find(t => t.tag === tag).pk;
  const sorted = [...rows].sort((a, b) =>
    String(a[pk] || '').localeCompare(String(b[pk] || '')),
  );
  const body = sorted.map(r => serializeRow(tag, r)).join('\n');
  const header = `<?xml version='1.0' encoding='UTF-8'?>\n<data>\n`;
  const footer = `\n</data>\n`;
  return header + body + footer;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseCliArgs(argv) {
  const opts = {};
  const queue = [...argv];
  while (queue.length > 0) {
    const a = queue.shift();
    if (a === '--prev-xml-dir') opts.prevXmlDir = queue.shift();
    else if (a.startsWith('--prev-xml-dir=')) opts.prevXmlDir = a.slice('--prev-xml-dir='.length);
    else if (a === '--delta') opts.delta = queue.shift();
    else if (a.startsWith('--delta=')) opts.delta = a.slice('--delta='.length);
    else if (a === '--out-dir') opts.outDir = queue.shift();
    else if (a.startsWith('--out-dir=')) opts.outDir = a.slice('--out-dir='.length);
    else if (a === '--help' || a === '-h') opts.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return opts;
}

function printUsage() {
  console.error('Usage: node cli/src/xml-apply-delta.js --prev-xml-dir <dir> --delta <delta.json> --out-dir <dir>');
}

export async function runCli(argv = process.argv.slice(2)) {
  let opts;
  try {
    opts = parseCliArgs(argv);
  } catch (err) {
    console.error(err.message);
    printUsage();
    return 2;
  }
  if (opts.help) { printUsage(); return 0; }
  if (!opts.prevXmlDir || !opts.delta || !opts.outDir) {
    printUsage();
    return 2;
  }

  const prevSnapshot = await loadEtgoXmlSnapshot(resolve(opts.prevXmlDir));
  const { readFile } = await import('node:fs/promises');
  const deltaText = await readFile(resolve(opts.delta), 'utf-8');
  const delta = JSON.parse(deltaText);

  const next = applyDelta(prevSnapshot, delta);

  const outDir = resolve(opts.outDir);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'ETGO_SF_SPEC.xml'),   serializeTable('ETGO_SF_SPEC',   next.spec),   'utf-8');
  await writeFile(join(outDir, 'ETGO_SF_ENTITY.xml'), serializeTable('ETGO_SF_ENTITY', next.entity), 'utf-8');
  await writeFile(join(outDir, 'ETGO_SF_FIELD.xml'),  serializeTable('ETGO_SF_FIELD',  next.field),  'utf-8');

  console.log(`Applied delta for spec '${delta.spec}':`);
  console.log(`  ETGO_SF_SPEC   rows: ${next.spec.length}`);
  console.log(`  ETGO_SF_ENTITY rows: ${next.entity.length}`);
  console.log(`  ETGO_SF_FIELD  rows: ${next.field.length}`);
  console.log(`Wrote: ${outDir}`);
  return 0;
}

// Exported for tests
export { parseEtgoXmlFile };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().then(code => { process.exitCode = code; }).catch(err => {
    console.error(err.stack || err.message);
    process.exitCode = 1;
  });
}
