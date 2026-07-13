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

const CONTRACT = {
  frontendContract: {
    entities: {
      header: {
        fields: [
          { column: 'C_BPartner_ID', form: true, grid: false },
          { column: 'DocumentNo', form: true, grid: true },
          { column: 'EM_Custom_Note', form: false, grid: false }, // rendered nowhere
          { column: null }, // no column → skipped
          { form: true }, // no column key → skipped
        ],
      },
      lines: {
        fields: [
          { column: 'M_Product_ID', form: false, grid: true },
          { column: 'C_BPartner_ID', form: true }, // duplicate across entities
        ],
      },
    },
  },
};

describe('collectWindowColumns', () => {
  it('collects unique columns across all entities, sorted', () => {
    assert.deepEqual(collectWindowColumns(CONTRACT), [
      'C_BPartner_ID',
      'DocumentNo',
      'EM_Custom_Note',
      'M_Product_ID',
    ]);
  });

  it('returns [] for an empty or absent contract', () => {
    assert.deepEqual(collectWindowColumns(undefined), []);
    assert.deepEqual(collectWindowColumns({}), []);
    assert.deepEqual(collectWindowColumns({ frontendContract: { entities: {} } }), []);
  });
});

describe('collectRenderedColumns', () => {
  it('includes only columns that render in a form or grid', () => {
    const rendered = collectRenderedColumns(CONTRACT);
    assert.ok(rendered.has('C_BPartner_ID')); // form: true
    assert.ok(rendered.has('DocumentNo')); // form + grid
    assert.ok(rendered.has('M_Product_ID')); // grid: true
    assert.ok(!rendered.has('EM_Custom_Note')); // neither form nor grid
  });
});

describe('sliceLabels', () => {
  const dicts = {
    en_US: {
      fields: {
        C_BPartner_ID: { label: 'Business Partner' },
        DocumentNo: { label: 'Document No.' },
      },
    },
    es_ES: {
      fields: {
        C_BPartner_ID: { label: 'Tercero' },
        DocumentNo: { label: '' }, // empty label → treated as missing
      },
    },
  };

  it('builds a label-only slice per locale and reports missing columns', () => {
    const cols = ['C_BPartner_ID', 'DocumentNo', 'M_Product_ID'];
    const { slice, missing } = sliceLabels(cols, dicts);

    assert.deepEqual(slice.en_US, {
      C_BPartner_ID: 'Business Partner',
      DocumentNo: 'Document No.',
    });
    // es_ES: DocumentNo has an empty label, M_Product_ID is absent → both missing
    assert.deepEqual(slice.es_ES, { C_BPartner_ID: 'Tercero' });
    assert.deepEqual(missing.en_US, ['M_Product_ID']);
    assert.deepEqual([...missing.es_ES].sort(), ['DocumentNo', 'M_Product_ID']);
  });

  it('omits the missing map entirely when nothing is missing', () => {
    const { slice, missing } = sliceLabels(['C_BPartner_ID'], dicts);
    assert.deepEqual(slice.en_US, { C_BPartner_ID: 'Business Partner' });
    assert.deepEqual(missing, {});
  });
});

describe('buildCore', () => {
  it('drops the fields section and keeps every other section', () => {
    const dict = {
      fields: { X: { label: 'x', description: 'big' } },
      ui: { a: 'b' },
      genericLabels: { g: 'l' },
    };
    const core = buildCore(dict);
    assert.equal(core.fields, undefined);
    assert.deepEqual(core.ui, { a: 'b' });
    assert.deepEqual(core.genericLabels, { g: 'l' });
  });
});

describe('pickSharedLabels', () => {
  it('keeps only shared columns present with a non-empty label, wrapped as { label }', () => {
    const shared = SHARED_LABEL_COLUMNS[0];
    const fields = {
      [shared]: { label: 'Shared Label', description: 'dropped' },
      NotShared_ID: { label: 'Ignored' },
    };
    const out = pickSharedLabels(fields);
    assert.deepEqual(out[shared], { label: 'Shared Label' }); // label-only, no description
    assert.equal(out.NotShared_ID, undefined); // not in the shared set
  });

  it('skips shared columns that are absent or have an empty label', () => {
    const shared = SHARED_LABEL_COLUMNS[0];
    assert.deepEqual(pickSharedLabels({}), {});
    assert.deepEqual(pickSharedLabels({ [shared]: { label: '' } }), {});
  });

  it('defaults to an empty object when fields is omitted', () => {
    assert.deepEqual(pickSharedLabels(), {});
  });
});

describe('stableStringify', () => {
  it('serializes object keys in a deterministic order', () => {
    assert.equal(stableStringify({ b: 1, a: 2 }), '{"a":2,"b":1}');
    assert.equal(stableStringify({ b: 1, a: 2 }), stableStringify({ a: 2, b: 1 }));
  });

  it('handles arrays and primitives', () => {
    assert.equal(stableStringify([3, 1, 2]), '[3,1,2]');
    assert.equal(stableStringify('x'), '"x"');
    assert.equal(stableStringify(42), '42');
  });
});

describe('sha256 / labelsChecksum', () => {
  it('sha256 is stable regardless of key insertion order', () => {
    assert.equal(sha256({ a: 1, b: 2 }), sha256({ b: 2, a: 1 }));
  });

  it('labelsChecksum ignores column ordering', () => {
    const slice = { en_US: { A: 'a', B: 'b' } };
    assert.equal(labelsChecksum(['A', 'B'], slice), labelsChecksum(['B', 'A'], slice));
  });

  it('labelsChecksum changes when a label changes', () => {
    const cols = ['A'];
    assert.notEqual(
      labelsChecksum(cols, { en_US: { A: 'a' } }),
      labelsChecksum(cols, { en_US: { A: 'b' } }),
    );
  });
});

describe('labelsModuleSource', () => {
  it('emits an auto-generated default export with the slice payload', () => {
    const src = labelsModuleSource({ en_US: { C_BPartner_ID: 'Business Partner' } });
    assert.match(src, /AUTO-GENERATED/);
    assert.match(src, /export default/);
    assert.ok(src.includes('"C_BPartner_ID": "Business Partner"'));
  });
});
