// @covers tools/app-shell/src/lib/completedLineEdits.js
// @covers artifacts/sales-invoice/decisions.json
// @covers artifacts/purchase-invoice/decisions.json
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildCompletedLineFieldGate,
  resolveEditableLineFieldsWhenCompleted,
} from '../completedLineEdits.js';

// A line field locked by the AD logic `@Posted@='Y'`, which names a HEADER column the
// invoice line table does not have (c_invoiceline has no `posted`).
const postedLogic = (record) => record.posted === 'Y' || record.posted === true;

const LINE_FIELDS = [
  { key: 'project', readOnlyLogic: postedLogic },
  { key: 'costcenter', readOnlyLogic: postedLogic },
  { key: 'product' },
  { key: 'quantity' },
];

const DRAFT_MODE = { editableLineFieldsWhenCompleted: ['project', 'costcenter'] };

function gate(overrides = {}) {
  return buildCompletedLineFieldGate({
    draftMode: DRAFT_MODE,
    lockedByCompletion: true,
    headerRecord: { posted: 'N' },
    lineFields: LINE_FIELDS,
    ...overrides,
  });
}

describe('resolveEditableLineFieldsWhenCompleted', () => {
  it('returns the declared list', () => {
    assert.deepEqual(resolveEditableLineFieldsWhenCompleted(DRAFT_MODE), ['project', 'costcenter']);
  });

  it('returns [] when the key is absent, the draftMode is missing, or the value is not an array', () => {
    assert.deepEqual(resolveEditableLineFieldsWhenCompleted({}), []);
    assert.deepEqual(resolveEditableLineFieldsWhenCompleted(undefined), []);
    assert.deepEqual(resolveEditableLineFieldsWhenCompleted({ editableLineFieldsWhenCompleted: 'project' }), []);
  });

  it('drops non-string and empty entries', () => {
    assert.deepEqual(
      resolveEditableLineFieldsWhenCompleted({ editableLineFieldsWhenCompleted: ['project', '', null, 7, 'costcenter'] }),
      ['project', 'costcenter'],
    );
  });
});

describe('buildCompletedLineFieldGate', () => {
  describe('returns null when the feature does not apply', () => {
    it('when the lines are not locked by completion (draft document)', () => {
      assert.equal(gate({ lockedByCompletion: false }), null);
    });

    // DetailView passes lockedByCompletion=false for a window-wide read-only role
    // (`getDocumentReadOnly(...) && !windowReadOnly`), so the role never gets the gate.
    it('for a window-wide read-only role (lockedByCompletion is false)', () => {
      assert.equal(gate({ lockedByCompletion: false, headerRecord: { processed: true, posted: 'N' } }), null);
    });

    it('when the window declares no list', () => {
      assert.equal(gate({ draftMode: {} }), null);
      assert.equal(gate({ draftMode: undefined }), null);
    });

    it('when the declared list is empty', () => {
      assert.equal(gate({ draftMode: { editableLineFieldsWhenCompleted: [] } }), null);
    });
  });

  describe('allowlist', () => {
    it('returns a predicate when locked by completion and a list is declared', () => {
      assert.equal(typeof gate(), 'function');
    });

    it('allows a listed key that is a line form field', () => {
      const canEdit = gate();
      assert.equal(canEdit({ id: 'L1' }, 'project'), true);
      assert.equal(canEdit({ id: 'L1' }, 'costcenter'), true);
    });

    it('refuses a line form field that is not in the list', () => {
      assert.equal(gate()({ id: 'L1' }, 'product'), false);
      assert.equal(gate()({ id: 'L1' }, 'quantity'), false);
    });

    it('refuses a listed key the line form does not declare (fail-closed)', () => {
      const canEdit = gate({ draftMode: { editableLineFieldsWhenCompleted: ['project', 'asset'] } });
      assert.equal(canEdit({ id: 'L1' }, 'asset'), false);
    });

    it('refuses an unknown key', () => {
      assert.equal(gate()({ id: 'L1' }, 'doesNotExist'), false);
    });

    it('refuses every key when lineFields is missing', () => {
      const canEdit = gate({ lineFields: undefined });
      assert.equal(canEdit({ id: 'L1' }, 'project'), false);
    });

    it('refuses a listed field that is statically readOnly', () => {
      const canEdit = gate({ lineFields: [{ key: 'project', readOnly: true }] });
      assert.equal(canEdit({ id: 'L1' }, 'project'), false);
    });
  });

  describe('readOnlyLogic evaluated on { ...header, ...line }', () => {
    it("locks the field when the HEADER is posted (@Posted@='Y' resolved from the header)", () => {
      const canEdit = gate({ headerRecord: { posted: 'Y' } });
      assert.equal(canEdit({ id: 'L1' }, 'project'), false);
      assert.equal(canEdit({ id: 'L1' }, 'costcenter'), false);
    });

    it('keeps the field editable while the header is unposted', () => {
      assert.equal(gate({ headerRecord: { posted: 'N' } })({ id: 'L1' }, 'project'), true);
    });

    it('hands the logic the merged record (header keys plus line keys)', () => {
      const seen = [];
      const canEdit = gate({
        headerRecord: { posted: 'N', documentStatus: 'CO' },
        lineFields: [{ key: 'project', readOnlyLogic: (r) => { seen.push(r); return false; } }],
      });
      canEdit({ id: 'L1', project: 'P1' }, 'project');
      assert.deepEqual(seen, [{ posted: 'N', documentStatus: 'CO', id: 'L1', project: 'P1' }]);
    });

    it('lets the line key win over the header key on a collision', () => {
      const canEdit = gate({ headerRecord: { posted: 'Y' } });
      assert.equal(canEdit({ id: 'L1', posted: 'N' }, 'project'), true);
      const canEdit2 = gate({ headerRecord: { posted: 'N' } });
      assert.equal(canEdit2({ id: 'L1', posted: 'Y' }, 'project'), false);
    });

    // ETP-5692 — the "only Completed (CO)" restriction is expressed in the field's own logic
    // (`@Posted@='Y' | (@Processed@='Y' & @DocStatus@!'CO')`), and the status it reads comes
    // from the HEADER: the line table has no DocStatus/Processed of its own.
    it('locks the field for a header status other than CO when the logic names DocStatus', () => {
      const statusLogic = (r) => r.posted === 'Y' || (r.processed === 'Y' && r.documentStatus !== 'CO');
      const lineFields = [{ key: 'project', readOnlyLogic: statusLogic }];
      const canEditOn = (documentStatus) => gate({
        lineFields, headerRecord: { posted: 'N', processed: 'Y', documentStatus },
      })({ id: 'L1' }, 'project');
      assert.equal(canEditOn('CO'), true);
      assert.equal(canEditOn('VO'), false);
      assert.equal(canEditOn('CL'), false);
    });

    it('is not editable when the readOnlyLogic throws (fail-closed)', () => {
      const canEdit = gate({
        lineFields: [{ key: 'project', readOnlyLogic: () => { throw new Error('bad logic'); } }],
      });
      assert.equal(canEdit({ id: 'L1' }, 'project'), false);
    });

    it('tolerates a null header record and a null row', () => {
      const canEdit = gate({ headerRecord: null });
      assert.equal(canEdit(null, 'project'), true);
    });
  });
});

// Editability of the invoice accounting dimensions (project, cost center) on a processed
// invoice, read from the REAL contract.json the pipeline generates from decisions.json — the
// header fields' own readOnlyLogic, and the line fields through the real completed-document
// gate above. The rule under test:
//   - draft: editable (normal draft editing);
//   - Completed (CO) and unposted: editable — the Unpost-then-correct flow (ETP-5692);
//   - Completed and posted: locked;
//   - any other processed status (e.g. voided, VO), posted or not: locked.
describe('real invoice contracts', () => {
  const DIMENSIONS = ['project', 'costcenter'];

  function loadContract(windowName) {
    const url = new URL(`../../../../../artifacts/${windowName}/contract.json`, import.meta.url);
    return JSON.parse(readFileSync(url, 'utf8')).frontendContract;
  }

  // The contract carries each readOnlyLogic as a JS expression over `record`; this is the same
  // shape the generator emits into the generated forms as `(record) => <js>`.
  function compileReadOnly(field) {
    const js = field?.readOnlyLogic?.js;
    if (!js) return () => false;
    // eslint-disable-next-line no-new-func
    return new Function('record', `return (${js});`);
  }

  const header = (documentStatus, posted) => ({
    documentStatus,
    posted,
    processed: documentStatus === 'DR' ? 'N' : 'Y',
  });

  for (const windowName of ['sales-invoice', 'purchase-invoice']) {
    const contract = loadContract(windowName);
    const headerFields = contract.entities.header.fields;
    const lineFields = contract.entities.lines.fields.map((f) => ({
      key: f.name,
      readOnly: f.readOnly === true,
      readOnlyLogic: compileReadOnly(f),
    }));
    const draftMode = contract.entities.header.draftMode;

    describe(`${windowName} — header accounting dimensions`, () => {
      for (const key of DIMENSIONS) {
        const isReadOnly = compileReadOnly(headerFields.find((f) => f.name === key));

        it(`${key}: editable on a draft`, () => {
          assert.equal(isReadOnly(header('DR', 'N')), false);
        });
        it(`${key}: editable on a Completed, unposted invoice`, () => {
          assert.equal(isReadOnly(header('CO', 'N')), false);
        });
        it(`${key}: read-only on a Completed, posted invoice`, () => {
          assert.equal(isReadOnly(header('CO', 'Y')), true);
        });
        it(`${key}: read-only on a voided, unposted invoice (only CO allows the edit)`, () => {
          assert.equal(isReadOnly(header('VO', 'N')), true);
        });
      }
    });

    describe(`${windowName} — line accounting dimensions on a completed document`, () => {
      const gateFor = (headerRecord) => buildCompletedLineFieldGate({
        draftMode, lockedByCompletion: true, headerRecord, lineFields,
      });

      for (const key of DIMENSIONS) {
        it(`${key}: editable on a Completed, unposted invoice`, () => {
          assert.equal(gateFor(header('CO', 'N'))({ id: 'L1' }, key), true);
        });
        it(`${key}: locked on a Completed, posted invoice`, () => {
          assert.equal(gateFor(header('CO', 'Y'))({ id: 'L1' }, key), false);
        });
        it(`${key}: locked on a voided, unposted invoice (only CO allows the edit)`, () => {
          assert.equal(gateFor(header('VO', 'N'))({ id: 'L1' }, key), false);
        });
      }
    });
  }
});
