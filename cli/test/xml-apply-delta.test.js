import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { applyDelta, serializeTable } from '../src/xml-apply-delta.js';
import { parseEtgoXmlText, loadEtgoXmlSnapshot } from '../src/lib/etgo-xml-parser.js';
import { parseXml, normalizeElement } from '../src/xml-regeneration-check.js';

function canonicalize(xmlText) {
  return JSON.stringify(normalizeElement(parseXml(xmlText)));
}

function makePrev() {
  return {
    spec: [{ ETGO_SF_SPEC_ID: 'SPEC-A', NAME: 'sales-order', SPEC_TYPE: 'W', AD_CLIENT_ID: '0', AD_ORG_ID: '0', ISACTIVE: 'Y', POPULATE: 'N', AD_WINDOW_ID: '143', AD_MODULE_ID: 'M1' }],
    entity: [
      { ETGO_SF_ENTITY_ID: 'ENT-1', ETGO_SF_SPEC_ID: 'SPEC-A', AD_TAB_ID: '187', NAME: 'Header', AD_MODULE_ID: 'M1', SEQNO: '10', ISINCLUDED: 'Y', AD_CLIENT_ID: '0', AD_ORG_ID: '0', ISACTIVE: 'Y' },
    ],
    field: [
      { ETGO_SF_FIELD_ID: 'FLD-1', ETGO_SF_ENTITY_ID: 'ENT-1', AD_COLUMN_ID: '2070', AD_MODULE_ID: 'M1', SEQNO: '10', ISINCLUDED: 'Y', ISREADONLY: 'N', AD_CLIENT_ID: '0', AD_ORG_ID: '0', ISACTIVE: 'Y' },
    ],
  };
}

test('upsert with matching natural key preserves prev UUID and replaces columns', () => {
  const prev = makePrev();
  const delta = {
    spec: 'sales-order',
    tables: {
      ETGO_SF_SPEC:   { upserts: [{ _naturalKey: 'sales-order', ETGO_SF_SPEC_ID: 'SHOULD_BE_DROPPED', NAME: 'sales-order', SPEC_TYPE: 'W', AD_CLIENT_ID:'0', AD_ORG_ID:'0', ISACTIVE:'Y', POPULATE:'N', AD_WINDOW_ID:'143', AD_MODULE_ID:'M1' }], deletes: [] },
      ETGO_SF_ENTITY: { upserts: [{ _naturalKey: 'sales-order/187', ETGO_SF_ENTITY_ID: 'NEW', ETGO_SF_SPEC_ID: 'SPEC-A', AD_TAB_ID: '187', NAME: 'Header', AD_MODULE_ID: 'M1', SEQNO: '10', ISINCLUDED: 'Y', AD_CLIENT_ID: '0', AD_ORG_ID: '0', ISACTIVE: 'Y' }], deletes: [] },
      ETGO_SF_FIELD:  { upserts: [{ _naturalKey: 'sales-order/187/2070', ETGO_SF_FIELD_ID: 'NEW', ETGO_SF_ENTITY_ID: 'ENT-1', AD_COLUMN_ID: '2070', AD_MODULE_ID: 'M1', SEQNO: '10', ISINCLUDED: 'Y', ISREADONLY: 'Y', AD_CLIENT_ID: '0', AD_ORG_ID: '0', ISACTIVE: 'Y' }], deletes: [] },
    },
  };
  const out = applyDelta(prev, delta);
  assert.equal(out.spec.length, 1);
  assert.equal(out.spec[0].ETGO_SF_SPEC_ID, 'SPEC-A', 'prev SPEC UUID preserved');
  assert.equal(out.entity[0].ETGO_SF_ENTITY_ID, 'ENT-1', 'prev ENTITY UUID preserved');
  assert.equal(out.field[0].ETGO_SF_FIELD_ID, 'FLD-1', 'prev FIELD UUID preserved');
  assert.equal(out.field[0].ISREADONLY, 'Y', 'column updated from delta');
});

test('upsert null value clears a previous optional column', () => {
  const prev = makePrev();
  prev.field[0].AGENT_PROMPT = 'Old prompt';
  const delta = {
    spec: 'sales-order',
    tables: {
      ETGO_SF_SPEC:   { upserts: [{ _naturalKey: 'sales-order', ETGO_SF_SPEC_ID: 'SPEC-A', NAME: 'sales-order' }], deletes: [] },
      ETGO_SF_ENTITY: { upserts: [{ _naturalKey: 'sales-order/187', ETGO_SF_ENTITY_ID: 'ENT-1', ETGO_SF_SPEC_ID: 'SPEC-A', AD_TAB_ID: '187', NAME: 'Header' }], deletes: [] },
      ETGO_SF_FIELD:  { upserts: [{ _naturalKey: 'sales-order/187/2070', ETGO_SF_FIELD_ID: 'FLD-1', ETGO_SF_ENTITY_ID: 'ENT-1', AD_COLUMN_ID: '2070', AGENT_PROMPT: null }], deletes: [] },
    },
  };

  const out = applyDelta(prev, delta);

  assert.equal(out.field[0].AGENT_PROMPT, undefined);
  assert.doesNotMatch(serializeTable('ETGO_SF_FIELD', out.field), /AGENT_PROMPT/);
});

test('upsert with new natural key appends row with delta-supplied UUID', () => {
  const prev = makePrev();
  const delta = {
    spec: 'sales-order',
    tables: {
      ETGO_SF_SPEC:   { upserts: [{ _naturalKey: 'sales-order', ETGO_SF_SPEC_ID: 'SPEC-A', NAME: 'sales-order', SPEC_TYPE: 'W' }], deletes: [] },
      ETGO_SF_ENTITY: { upserts: [
        { _naturalKey: 'sales-order/187', ETGO_SF_ENTITY_ID: 'ENT-1', ETGO_SF_SPEC_ID: 'SPEC-A', AD_TAB_ID: '187', NAME: 'Header' },
        { _naturalKey: 'sales-order/188', ETGO_SF_ENTITY_ID: 'BRAND_NEW', ETGO_SF_SPEC_ID: 'SPEC-A', AD_TAB_ID: '188', NAME: 'Lines' },
      ], deletes: [] },
      ETGO_SF_FIELD:  { upserts: [], deletes: [] },
    },
  };
  const out = applyDelta(prev, delta);
  assert.equal(out.entity.length, 2);
  const fresh = out.entity.find(r => r.AD_TAB_ID === '188');
  assert.ok(fresh, 'new entity present');
  assert.equal(fresh.ETGO_SF_ENTITY_ID, 'BRAND_NEW', 'delta UUID used for fresh row');
});

test('delete by PK drops the row', () => {
  const prev = makePrev();
  prev.entity.push({ ETGO_SF_ENTITY_ID: 'ENT-2', ETGO_SF_SPEC_ID: 'SPEC-A', AD_TAB_ID: '999', NAME: 'Vanished' });
  const delta = {
    spec: 'sales-order',
    tables: {
      ETGO_SF_SPEC:   { upserts: [{ _naturalKey: 'sales-order', ETGO_SF_SPEC_ID: 'SPEC-A', NAME: 'sales-order' }], deletes: [] },
      ETGO_SF_ENTITY: { upserts: [{ _naturalKey: 'sales-order/187', ETGO_SF_ENTITY_ID: 'ENT-1', ETGO_SF_SPEC_ID: 'SPEC-A', AD_TAB_ID: '187', NAME: 'Header' }], deletes: [{ _naturalKey: 'sales-order/999', ETGO_SF_ENTITY_ID: 'ENT-2' }] },
      ETGO_SF_FIELD:  { upserts: [], deletes: [] },
    },
  };
  const out = applyDelta(prev, delta);
  assert.equal(out.entity.length, 1);
  assert.equal(out.entity[0].ETGO_SF_ENTITY_ID, 'ENT-1');
});

test('empty delta is idempotent (does not touch other-spec rows)', () => {
  const prev = makePrev();
  // Another spec, never mentioned in the delta:
  prev.spec.push({ ETGO_SF_SPEC_ID: 'OTHER-SPEC', NAME: 'product' });
  prev.entity.push({ ETGO_SF_ENTITY_ID: 'OTHER-ENT', ETGO_SF_SPEC_ID: 'OTHER-SPEC', AD_TAB_ID: '500', NAME: 'ProductHeader' });
  const delta = {
    spec: 'sales-order',
    tables: {
      ETGO_SF_SPEC:   { upserts: [{ _naturalKey: 'sales-order', ETGO_SF_SPEC_ID: 'SPEC-A', NAME: 'sales-order', SPEC_TYPE: 'W', AD_CLIENT_ID:'0', AD_ORG_ID:'0', ISACTIVE:'Y', POPULATE:'N', AD_WINDOW_ID:'143', AD_MODULE_ID:'M1' }], deletes: [] },
      ETGO_SF_ENTITY: { upserts: [{ _naturalKey: 'sales-order/187', ETGO_SF_ENTITY_ID: 'ENT-1', ETGO_SF_SPEC_ID: 'SPEC-A', AD_TAB_ID: '187', NAME: 'Header', AD_MODULE_ID: 'M1', SEQNO: '10', ISINCLUDED: 'Y', AD_CLIENT_ID: '0', AD_ORG_ID: '0', ISACTIVE: 'Y' }], deletes: [] },
      ETGO_SF_FIELD:  { upserts: [{ _naturalKey: 'sales-order/187/2070', ETGO_SF_FIELD_ID: 'FLD-1', ETGO_SF_ENTITY_ID: 'ENT-1', AD_COLUMN_ID: '2070', AD_MODULE_ID: 'M1', SEQNO: '10', ISINCLUDED: 'Y', ISREADONLY: 'N', AD_CLIENT_ID: '0', AD_ORG_ID: '0', ISACTIVE: 'Y' }], deletes: [] },
    },
  };
  const out = applyDelta(prev, delta);
  // Other spec untouched:
  assert.ok(out.spec.find(r => r.NAME === 'product'));
  assert.ok(out.entity.find(r => r.ETGO_SF_ENTITY_ID === 'OTHER-ENT'));
  // The canonical XML of out vs prev should match for SPEC.
  const xPrev = serializeTable('ETGO_SF_SPEC', prev.spec);
  const xOut  = serializeTable('ETGO_SF_SPEC', out.spec);
  assert.equal(canonicalize(xOut), canonicalize(xPrev), 'no-op delta yields canonically identical SPEC XML');
});

test('conflicting PK with different natural key does not collapse rows', () => {
  // Two rows with the SAME PK but different natural keys (pathological input).
  // apply-delta must align by natural key, not by PK.
  const prev = makePrev();
  // Mutate: introduce a prev field that shares a PK with the delta-supplied
  // "new" PK. They MUST stay separate because their natural keys differ.
  prev.field.push({ ETGO_SF_FIELD_ID: 'CLASHING', ETGO_SF_ENTITY_ID: 'ENT-1', AD_COLUMN_ID: '3030', ISREADONLY: 'N' });
  const delta = {
    spec: 'sales-order',
    tables: {
      ETGO_SF_SPEC:   { upserts: [{ _naturalKey: 'sales-order', ETGO_SF_SPEC_ID: 'SPEC-A', NAME: 'sales-order' }], deletes: [] },
      ETGO_SF_ENTITY: { upserts: [{ _naturalKey: 'sales-order/187', ETGO_SF_ENTITY_ID: 'ENT-1', ETGO_SF_SPEC_ID: 'SPEC-A', AD_TAB_ID: '187', NAME: 'Header' }], deletes: [] },
      ETGO_SF_FIELD:  { upserts: [
        { _naturalKey: 'sales-order/187/2070', ETGO_SF_FIELD_ID: 'FLD-1', ETGO_SF_ENTITY_ID: 'ENT-1', AD_COLUMN_ID: '2070', ISREADONLY: 'N' },
        { _naturalKey: 'sales-order/187/4040', ETGO_SF_FIELD_ID: 'CLASHING', ETGO_SF_ENTITY_ID: 'ENT-1', AD_COLUMN_ID: '4040', ISREADONLY: 'N' },
      ], deletes: [] },
    },
  };
  const out = applyDelta(prev, delta);
  const cols = new Set(out.field.map(r => r.AD_COLUMN_ID));
  // We expect column 2070 (FLD-1 preserved), 3030 (untouched? no — sees no upsert covering it, but
  // since the upsert list is the complete intended state for the spec, the prev 3030 row should
  // be retained as a survivor — see comment in applyTableDelta step 4).
  assert.ok(cols.has('2070'));
  assert.ok(cols.has('4040'));
  assert.equal(out.field.filter(r => r.AD_COLUMN_ID === '4040').length, 1, 'only one row for the new natural key');
});

test('round-trip parse → applyDelta with no-op delta → serialize is canonically identical', async () => {
  // Build a tiny but realistic prev-XML via the parser, then assert canonical equality.
  const prevSpecXml = `<?xml version='1.0' encoding='UTF-8'?>
<data>
<!--SPEC-A--><ETGO_SF_SPEC>
<!--SPEC-A-->  <ETGO_SF_SPEC_ID><![CDATA[SPEC-A]]></ETGO_SF_SPEC_ID>
<!--SPEC-A-->  <NAME><![CDATA[sales-order]]></NAME>
<!--SPEC-A-->  <SPEC_TYPE><![CDATA[W]]></SPEC_TYPE>
<!--SPEC-A-->  <AD_CLIENT_ID><![CDATA[0]]></AD_CLIENT_ID>
<!--SPEC-A-->  <AD_ORG_ID><![CDATA[0]]></AD_ORG_ID>
<!--SPEC-A-->  <ISACTIVE><![CDATA[Y]]></ISACTIVE>
<!--SPEC-A-->  <POPULATE><![CDATA[N]]></POPULATE>
<!--SPEC-A-->  <AD_WINDOW_ID><![CDATA[143]]></AD_WINDOW_ID>
<!--SPEC-A-->  <AD_MODULE_ID><![CDATA[M1]]></AD_MODULE_ID>
<!--SPEC-A--></ETGO_SF_SPEC>
</data>
`;
  const rows = parseEtgoXmlText(prevSpecXml, 'ETGO_SF_SPEC');
  const prev = { spec: rows, entity: [], field: [] };
  const delta = {
    spec: 'sales-order',
    tables: {
      ETGO_SF_SPEC: { upserts: [{ _naturalKey: 'sales-order', ETGO_SF_SPEC_ID: 'IGNORED', NAME: 'sales-order', SPEC_TYPE: 'W', AD_CLIENT_ID: '0', AD_ORG_ID: '0', ISACTIVE: 'Y', POPULATE: 'N', AD_WINDOW_ID: '143', AD_MODULE_ID: 'M1' }], deletes: [] },
      ETGO_SF_ENTITY: { upserts: [], deletes: [] },
      ETGO_SF_FIELD: { upserts: [], deletes: [] },
    },
  };
  const next = applyDelta(prev, delta);
  const outXml = serializeTable('ETGO_SF_SPEC', next.spec);
  assert.equal(canonicalize(outXml), canonicalize(prevSpecXml), 'predicted == prev under canonicalization');
});

test('CLI round-trip: load snapshot, write predicted dir, files exist and parse', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xml-apply-delta-'));
  try {
    const prevDir = join(dir, 'prev');
    const outDir = join(dir, 'out');
    await mkdir(prevDir, { recursive: true });
    const emptyXml = `<?xml version='1.0' encoding='UTF-8'?>\n<data>\n</data>\n`;
    await writeFile(join(prevDir, 'ETGO_SF_SPEC.xml'), emptyXml);
    await writeFile(join(prevDir, 'ETGO_SF_ENTITY.xml'), emptyXml);
    await writeFile(join(prevDir, 'ETGO_SF_FIELD.xml'), emptyXml);

    const snap = await loadEtgoXmlSnapshot(prevDir);
    assert.deepEqual(snap, { spec: [], entity: [], field: [] });

    const delta = {
      spec: 'sales-order',
      tables: {
        ETGO_SF_SPEC: { upserts: [{ _naturalKey: 'sales-order', ETGO_SF_SPEC_ID: 'NEW-PK', NAME: 'sales-order', SPEC_TYPE: 'W' }], deletes: [] },
        ETGO_SF_ENTITY: { upserts: [], deletes: [] },
        ETGO_SF_FIELD: { upserts: [], deletes: [] },
      },
    };
    const out = applyDelta(snap, delta);
    assert.equal(out.spec.length, 1);
    assert.equal(out.spec[0].ETGO_SF_SPEC_ID, 'NEW-PK');
    // Write & re-parse.
    await mkdir(outDir, { recursive: true });
    await writeFile(join(outDir, 'ETGO_SF_SPEC.xml'), serializeTable('ETGO_SF_SPEC', out.spec));
    const written = await readFile(join(outDir, 'ETGO_SF_SPEC.xml'), 'utf-8');
    const reparsed = parseEtgoXmlText(written, 'ETGO_SF_SPEC');
    assert.equal(reparsed.length, 1);
    assert.equal(reparsed[0].ETGO_SF_SPEC_ID, 'NEW-PK');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
