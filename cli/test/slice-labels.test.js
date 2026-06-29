import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  stableStringify,
  sha256,
  collectWindowColumns,
  collectRenderedColumns,
  sliceLabels,
  buildCore,
  pickSharedLabels,
  labelsModuleSource,
  labelsChecksum,
} from '../src/slice-labels.js';
import { SHARED_LABEL_COLUMNS } from '../src/shared-label-columns.js';

// --- stableStringify ---

describe('stableStringify', () => {
  it('produces identical output for objects with same entries in different insertion order', () => {
    const a = { b: 1, a: 2, c: 3 };
    const b = { c: 3, a: 2, b: 1 };
    assert.equal(stableStringify(a), stableStringify(b));
  });

  it('sorts keys deterministically regardless of declaration order', () => {
    assert.equal(stableStringify({ z: 1, a: 2 }), '{"a":2,"z":1}');
  });

  it('preserves array element order (does not sort arrays)', () => {
    assert.equal(stableStringify([3, 1, 2]), '[3,1,2]');
  });

  it('recursively sorts keys in nested objects', () => {
    const value = { outer: { y: 1, x: 2 }, a: { d: 4, c: 3 } };
    assert.equal(stableStringify(value), '{"a":{"c":3,"d":4},"outer":{"x":2,"y":1}}');
  });

  it('sorts keys inside objects nested within arrays', () => {
    assert.equal(stableStringify([{ b: 1, a: 2 }]), '[{"a":2,"b":1}]');
  });

  it('serializes string primitives with JSON quoting', () => {
    assert.equal(stableStringify('hello'), '"hello"');
  });

  it('serializes number primitives', () => {
    assert.equal(stableStringify(42), '42');
  });

  it('serializes boolean primitives', () => {
    assert.equal(stableStringify(true), 'true');
  });

  it('serializes null', () => {
    assert.equal(stableStringify(null), 'null');
  });

  it('serializes an empty object', () => {
    assert.equal(stableStringify({}), '{}');
  });

  it('serializes an empty array', () => {
    assert.equal(stableStringify([]), '[]');
  });
});

// --- sha256 ---

describe('sha256', () => {
  it('is deterministic for the same input', () => {
    assert.equal(sha256({ a: 1, b: 2 }), sha256({ a: 1, b: 2 }));
  });

  it('is key-order-independent (same hash for reordered keys)', () => {
    assert.equal(sha256({ a: 1, b: 2 }), sha256({ b: 2, a: 1 }));
  });

  it('produces different hashes for different inputs', () => {
    assert.notEqual(sha256({ a: 1 }), sha256({ a: 2 }));
  });

  it('returns a 64-char hex string', () => {
    assert.match(sha256({ a: 1 }), /^[0-9a-f]{64}$/);
  });
});

// --- collectWindowColumns ---

describe('collectWindowColumns', () => {
  it('collects columns across ALL entities, not just header/lines', () => {
    const contract = {
      frontendContract: {
        entities: {
          header: { fields: [{ column: 'DocumentNo' }] },
          lines: { fields: [{ column: 'Line' }] },
          contacts: { fields: [{ column: 'Name' }] },
        },
      },
    };
    assert.deepEqual(collectWindowColumns(contract), ['DocumentNo', 'Line', 'Name']);
  });

  it('de-duplicates the same column appearing in multiple entities', () => {
    const contract = {
      frontendContract: {
        entities: {
          header: { fields: [{ column: 'C_BPartner_ID' }] },
          lines: { fields: [{ column: 'C_BPartner_ID' }] },
        },
      },
    };
    assert.deepEqual(collectWindowColumns(contract), ['C_BPartner_ID']);
  });

  it('ignores fields without a column property', () => {
    const contract = {
      frontendContract: {
        entities: {
          header: { fields: [{ column: 'DocumentNo' }, { label: 'no column here' }, {}] },
        },
      },
    };
    assert.deepEqual(collectWindowColumns(contract), ['DocumentNo']);
  });

  it('returns sorted output', () => {
    const contract = {
      frontendContract: {
        entities: {
          header: { fields: [{ column: 'Zebra' }, { column: 'Alpha' }, { column: 'Mango' }] },
        },
      },
    };
    assert.deepEqual(collectWindowColumns(contract), ['Alpha', 'Mango', 'Zebra']);
  });

  it('returns [] for empty entities', () => {
    assert.deepEqual(collectWindowColumns({ frontendContract: { entities: {} } }), []);
  });

  it('returns [] when frontendContract is missing', () => {
    assert.deepEqual(collectWindowColumns({}), []);
  });

  it('returns [] for null/undefined contract', () => {
    assert.deepEqual(collectWindowColumns(null), []);
    assert.deepEqual(collectWindowColumns(undefined), []);
  });

  it('handles an entity with no fields array', () => {
    const contract = {
      frontendContract: { entities: { header: {}, lines: { fields: [{ column: 'A' }] } } },
    };
    assert.deepEqual(collectWindowColumns(contract), ['A']);
  });
});

// --- collectRenderedColumns ---

describe('collectRenderedColumns', () => {
  it('includes a form-only column', () => {
    const contract = {
      frontendContract: { entities: { header: { fields: [{ column: 'A', form: true, grid: false }] } } },
    };
    assert.ok(collectRenderedColumns(contract).has('A'));
  });

  it('includes a grid-only column', () => {
    const contract = {
      frontendContract: { entities: { header: { fields: [{ column: 'B', form: false, grid: true }] } } },
    };
    assert.ok(collectRenderedColumns(contract).has('B'));
  });

  it('excludes a column with form=false and grid=false (e.g. EM_* custom column)', () => {
    const contract = {
      frontendContract: { entities: { header: { fields: [{ column: 'EM_Custom', form: false, grid: false }] } } },
    };
    assert.ok(!collectRenderedColumns(contract).has('EM_Custom'));
  });

  it('returns a Set instance', () => {
    const contract = {
      frontendContract: { entities: { header: { fields: [{ column: 'A', form: true }] } } },
    };
    assert.ok(collectRenderedColumns(contract) instanceof Set);
  });

  it('collects rendered columns across multiple entities', () => {
    const contract = {
      frontendContract: {
        entities: {
          header: { fields: [{ column: 'A', form: true }] },
          lines: { fields: [{ column: 'B', grid: true }] },
        },
      },
    };
    const rendered = collectRenderedColumns(contract);
    assert.ok(rendered.has('A'));
    assert.ok(rendered.has('B'));
  });

  it('ignores rendered fields that have no column', () => {
    const contract = {
      frontendContract: { entities: { header: { fields: [{ form: true, grid: true }] } } },
    };
    assert.equal(collectRenderedColumns(contract).size, 0);
  });

  it('returns an empty Set when structure is missing', () => {
    assert.equal(collectRenderedColumns({}).size, 0);
    assert.equal(collectRenderedColumns(null).size, 0);
  });
});

// --- sliceLabels ---

describe('sliceLabels', () => {
  it('includes a label present in both locales', () => {
    const dicts = {
      en_US: { fields: { DocumentNo: { label: 'Document No' } } },
      es_ES: { fields: { DocumentNo: { label: 'Nro Documento' } } },
    };
    const { slice, missing } = sliceLabels(['DocumentNo'], dicts);
    assert.equal(slice.en_US.DocumentNo, 'Document No');
    assert.equal(slice.es_ES.DocumentNo, 'Nro Documento');
    assert.deepEqual(missing, {});
  });

  it('omits a column missing in one locale and lists it in missing', () => {
    const dicts = {
      en_US: { fields: { DocumentNo: { label: 'Document No' } } },
      es_ES: { fields: {} },
    };
    const { slice, missing } = sliceLabels(['DocumentNo'], dicts);
    assert.equal(slice.en_US.DocumentNo, 'Document No');
    assert.equal(slice.es_ES.DocumentNo, undefined);
    assert.deepEqual(missing.es_ES, ['DocumentNo']);
    assert.equal(missing.en_US, undefined);
  });

  it('treats an empty-string label as missing', () => {
    const dicts = {
      en_US: { fields: { DocumentNo: { label: '' } } },
    };
    const { slice, missing } = sliceLabels(['DocumentNo'], dicts);
    assert.equal(slice.en_US.DocumentNo, undefined);
    assert.deepEqual(missing.en_US, ['DocumentNo']);
  });

  it('treats a null label as missing', () => {
    const dicts = {
      en_US: { fields: { DocumentNo: { label: null } } },
    };
    const { slice, missing } = sliceLabels(['DocumentNo'], dicts);
    assert.equal(slice.en_US.DocumentNo, undefined);
    assert.deepEqual(missing.en_US, ['DocumentNo']);
  });

  it('treats a column absent from fields as missing', () => {
    const dicts = {
      en_US: { fields: { Other: { label: 'Other' } } },
    };
    const { slice, missing } = sliceLabels(['DocumentNo'], dicts);
    assert.equal(slice.en_US.DocumentNo, undefined);
    assert.deepEqual(missing.en_US, ['DocumentNo']);
  });

  it('reports all columns missing when a locale has no fields key', () => {
    const dicts = {
      en_US: {},
    };
    const { slice, missing } = sliceLabels(['A', 'B'], dicts);
    assert.deepEqual(slice.en_US, {});
    assert.deepEqual(missing.en_US, ['A', 'B']);
  });

  it('produces empty slice per locale and no missing when columns is empty', () => {
    const dicts = { en_US: { fields: { A: { label: 'A' } } } };
    const { slice, missing } = sliceLabels([], dicts);
    assert.deepEqual(slice.en_US, {});
    assert.deepEqual(missing, {});
  });

  it('returns empty slice and missing for empty dictsByLocale', () => {
    const { slice, missing } = sliceLabels(['A'], {});
    assert.deepEqual(slice, {});
    assert.deepEqual(missing, {});
  });

  it('drops the description (label-only slice)', () => {
    const dicts = {
      en_US: { fields: { A: { label: 'Alpha', description: 'a long desc' } } },
    };
    const { slice } = sliceLabels(['A'], dicts);
    assert.equal(slice.en_US.A, 'Alpha');
    assert.deepEqual(Object.keys(slice.en_US), ['A']);
  });
});

// --- buildCore ---

describe('buildCore', () => {
  it('removes the fields key', () => {
    const dict = { fields: { A: { label: 'A' } }, ui: { ok: 'OK' } };
    assert.equal(buildCore(dict).fields, undefined);
  });

  it('preserves all non-fields keys', () => {
    const dict = {
      fields: { A: { label: 'A' } },
      genericLabels: { x: 1 },
      ui: { ok: 'OK' },
      menus: { m: 'Menu' },
      tabs: { t: 'Tab' },
      statuses: { s: 'Status' },
    };
    const core = buildCore(dict);
    assert.deepEqual(core.genericLabels, { x: 1 });
    assert.deepEqual(core.ui, { ok: 'OK' });
    assert.deepEqual(core.menus, { m: 'Menu' });
    assert.deepEqual(core.tabs, { t: 'Tab' });
    assert.deepEqual(core.statuses, { s: 'Status' });
  });

  it('does not mutate the original dict', () => {
    const dict = { fields: { A: { label: 'A' } }, ui: { ok: 'OK' } };
    buildCore(dict);
    assert.ok(dict.fields, 'original fields key must remain');
    assert.equal(dict.fields.A.label, 'A');
  });

  it('returns an empty object for a dict that only has fields', () => {
    assert.deepEqual(buildCore({ fields: { A: { label: 'A' } } }), {});
  });

  it('handles a dict with no fields key (returns a clone of all keys)', () => {
    const core = buildCore({ ui: { ok: 'OK' } });
    assert.deepEqual(core, { ui: { ok: 'OK' } });
  });
});

// --- pickSharedLabels ---

describe('pickSharedLabels', () => {
  it('includes a column that is BOTH shared and present in the input', () => {
    const out = pickSharedLabels({ M_Product_ID: { label: 'Product' } });
    assert.deepEqual(out.M_Product_ID, { label: 'Product' });
  });

  it('excludes a non-shared column even when present in the input', () => {
    // DocumentNo is NOT in SHARED_LABEL_COLUMNS — must be dropped.
    const out = pickSharedLabels({
      DocumentNo: { label: 'Document No' },
      IsShipTo: { label: 'Ship To' },
    });
    assert.equal(out.DocumentNo, undefined);
    assert.deepEqual(out.IsShipTo, { label: 'Ship To' });
  });

  it('drops the description (label-only output)', () => {
    const out = pickSharedLabels({
      M_Product_ID: { label: 'Product', description: 'the product reference' },
    });
    assert.deepEqual(out.M_Product_ID, { label: 'Product' });
    assert.deepEqual(Object.keys(out.M_Product_ID), ['label']);
  });

  it('skips a shared column absent from the input fields', () => {
    // Only IsShipTo provided — IsBillTo (also shared) must not appear.
    const out = pickSharedLabels({ IsShipTo: { label: 'Ship To' } });
    assert.equal(out.IsBillTo, undefined);
    assert.deepEqual(Object.keys(out), ['IsShipTo']);
  });

  it('skips a shared column with an empty-string label', () => {
    const out = pickSharedLabels({ M_Product_ID: { label: '' } });
    assert.equal(out.M_Product_ID, undefined);
    assert.deepEqual(out, {});
  });

  it('skips a shared column with a null label', () => {
    const out = pickSharedLabels({ M_Product_ID: { label: null } });
    assert.equal(out.M_Product_ID, undefined);
    assert.deepEqual(out, {});
  });

  it('returns {} for an empty input object', () => {
    assert.deepEqual(pickSharedLabels({}), {});
  });

  it('returns {} when called with no argument (param defaults to {})', () => {
    assert.deepEqual(pickSharedLabels(), {});
  });

  it('returns {} for undefined input', () => {
    assert.deepEqual(pickSharedLabels(undefined), {});
  });

  it('picks multiple shared columns and drops the lone non-shared one', () => {
    const out = pickSharedLabels({
      C_BPartner_ID: { label: 'Business Partner', description: 'bp' },
      M_Product_ID: { label: 'Product' },
      IsShipTo: { label: 'Ship To' },
      DocumentNo: { label: 'Document No' }, // not shared
    });
    assert.deepEqual(out, {
      C_BPartner_ID: { label: 'Business Partner' },
      M_Product_ID: { label: 'Product' },
      IsShipTo: { label: 'Ship To' },
    });
  });

  it('only ever emits keys drawn from SHARED_LABEL_COLUMNS', () => {
    // Feed a label for every shared column plus a non-shared one; every output
    // key must be a member of SHARED_LABEL_COLUMNS.
    const fields = { NotShared: { label: 'nope' } };
    for (const col of SHARED_LABEL_COLUMNS) fields[col] = { label: `lbl-${col}` };
    const out = pickSharedLabels(fields);
    for (const key of Object.keys(out)) {
      assert.ok(SHARED_LABEL_COLUMNS.includes(key), `${key} must be a shared column`);
    }
    assert.equal(out.NotShared, undefined);
  });
});

// --- labelsModuleSource ---

describe('labelsModuleSource', () => {
  it('starts with the AUTO-GENERATED comment', () => {
    const src = labelsModuleSource({ en_US: { A: 'Alpha' } });
    assert.ok(src.startsWith('// AUTO-GENERATED by cli/src/slice-labels.js'));
  });

  it('contains an export default statement', () => {
    const src = labelsModuleSource({ en_US: { A: 'Alpha' } });
    assert.ok(src.includes('export default'));
  });

  it('emits JSON that round-trips back to the original slice', () => {
    const slice = { en_US: { DocumentNo: 'Document No' }, es_ES: { DocumentNo: 'Nro Documento' } };
    const src = labelsModuleSource(slice);
    const body = src.slice(src.indexOf('export default') + 'export default'.length);
    const json = body.slice(0, body.lastIndexOf(';'));
    assert.deepEqual(JSON.parse(json), slice);
  });

  it('round-trips an empty slice', () => {
    const src = labelsModuleSource({});
    const body = src.slice(src.indexOf('export default') + 'export default'.length);
    const json = body.slice(0, body.lastIndexOf(';'));
    assert.deepEqual(JSON.parse(json), {});
  });
});

// --- labelsChecksum ---

describe('labelsChecksum', () => {
  it('is deterministic for the same inputs', () => {
    const slice = { en_US: { A: 'Alpha' } };
    assert.equal(labelsChecksum(['A'], slice), labelsChecksum(['A'], slice));
  });

  it('is order-independent in the columns array', () => {
    const slice = { en_US: { A: 'Alpha', B: 'Beta' } };
    assert.equal(labelsChecksum(['A', 'B'], slice), labelsChecksum(['B', 'A'], slice));
  });

  it('changes when a label changes', () => {
    const before = labelsChecksum(['A'], { en_US: { A: 'Alpha' } });
    const after = labelsChecksum(['A'], { en_US: { A: 'Changed' } });
    assert.notEqual(before, after);
  });

  it('changes when the column set changes', () => {
    const slice = { en_US: { A: 'Alpha' } };
    assert.notEqual(labelsChecksum(['A'], slice), labelsChecksum(['A', 'B'], slice));
  });

  it('returns a 64-char hex string', () => {
    assert.match(labelsChecksum(['A'], { en_US: { A: 'Alpha' } }), /^[0-9a-f]{64}$/);
  });
});
