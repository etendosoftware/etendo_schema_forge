import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  verifyDraftMode,
  isCalloutMissingInContract,
  checkSchemaRawCalloutAndValidation,
  verifyEditableHeaderFields,
  verifyAddLineFields,
} from '../src/verify-window.js';

// ---------------------------------------------------------------------------
// Console silencing — the helpers call console.log/warn/error. We stub them so
// test output stays clean, restoring after each test.
// ---------------------------------------------------------------------------
let origLog, origWarn, origError;
beforeEach(() => {
  origLog = console.log;
  origWarn = console.warn;
  origError = console.error;
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
});
afterEach(() => {
  console.log = origLog;
  console.warn = origWarn;
  console.error = origError;
});

describe('verifyDraftMode', () => {
  it('decisions enabled + contract enabled → ok, 0 issues, ctDraftMode returned', () => {
    const decisions = { window: { draftMode: { enabled: true } } };
    const h = { draftMode: { enabled: true } };
    const { newIssues, ctDraftMode } = verifyDraftMode(decisions, h);
    assert.equal(newIssues, 0);
    assert.deepEqual(ctDraftMode, { enabled: true });
  });

  it('decisions enabled + contract missing → 1 issue', () => {
    const decisions = { window: { draftMode: { enabled: true } } };
    const h = { draftMode: { enabled: false } };
    const { newIssues, ctDraftMode } = verifyDraftMode(decisions, h);
    assert.equal(newIssues, 1);
    assert.deepEqual(ctDraftMode, { enabled: false });
  });

  it('decisions enabled + contract draftMode absent → 1 issue', () => {
    const decisions = { window: { draftMode: { enabled: true } } };
    const h = {};
    const { newIssues, ctDraftMode } = verifyDraftMode(decisions, h);
    assert.equal(newIssues, 1);
    assert.equal(ctDraftMode, undefined);
  });

  it('decisions not enabled → 0 issues', () => {
    const decisions = { window: { draftMode: { enabled: false } } };
    const h = { draftMode: { enabled: false } };
    const { newIssues } = verifyDraftMode(decisions, h);
    assert.equal(newIssues, 0);
  });

  it('decisions has no draftMode → 0 issues', () => {
    const decisions = { window: {} };
    const h = { draftMode: { enabled: true } };
    const { newIssues } = verifyDraftMode(decisions, h);
    assert.equal(newIssues, 0);
  });

  it('ctDraftMode equals h?.draftMode even when h is undefined', () => {
    const decisions = {};
    const { newIssues, ctDraftMode } = verifyDraftMode(decisions, undefined);
    assert.equal(newIssues, 0);
    assert.equal(ctDraftMode, undefined);
  });
});

describe('isCalloutMissingInContract', () => {
  it('callout present & !hasCallout → truthy', () => {
    assert.ok(isCalloutMissingInContract({ callout: 'SE_Foo' }, false));
  });

  it('callout present & hasCallout → falsy', () => {
    assert.ok(!isCalloutMissingInContract({ callout: 'SE_Foo' }, true));
  });

  it('no callout → falsy', () => {
    assert.ok(!isCalloutMissingInContract({}, false));
  });

  it('rawFld undefined → falsy', () => {
    assert.ok(!isCalloutMissingInContract(undefined, false));
  });
});

describe('checkSchemaRawCalloutAndValidation', () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'verify-window-schemaraw-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeSchemaRaw(field) {
    const path = join(dir, 'schema-raw.json');
    writeFileSync(
      path,
      JSON.stringify({ entities: [{ name: 'header', fields: field ? [field] : [] }] }),
      'utf8',
    );
    return path;
  }

  it('callout in schema-raw missing in contract → +1', () => {
    const path = writeSchemaRaw({ name: 'businessPartner', callout: 'SE_BP' });
    const result = checkSchemaRawCalloutAndValidation(path, 'businessPartner', false, 0, false);
    assert.equal(result, 1);
  });

  it('validationRule in schema-raw missing in contract → +1', () => {
    const path = writeSchemaRaw({ name: 'businessPartner', validationRule: 'someVR' });
    const result = checkSchemaRawCalloutAndValidation(path, 'businessPartner', false, 0, false);
    assert.equal(result, 1);
  });

  it('both callout and validationRule missing → +2', () => {
    const path = writeSchemaRaw({ name: 'businessPartner', callout: 'SE_BP', validationRule: 'someVR' });
    const result = checkSchemaRawCalloutAndValidation(path, 'businessPartner', false, 0, false);
    assert.equal(result, 2);
  });

  it('callout and validationRule both present in contract → +0', () => {
    const path = writeSchemaRaw({ name: 'businessPartner', callout: 'SE_BP', validationRule: 'someVR' });
    const result = checkSchemaRawCalloutAndValidation(path, 'businessPartner', true, 0, true);
    assert.equal(result, 0);
  });

  it('field has neither callout nor validationRule → +0', () => {
    const path = writeSchemaRaw({ name: 'businessPartner' });
    const result = checkSchemaRawCalloutAndValidation(path, 'businessPartner', false, 0, false);
    assert.equal(result, 0);
  });

  it('field not found in schema-raw → +0', () => {
    const path = writeSchemaRaw({ name: 'other', callout: 'SE_BP' });
    const result = checkSchemaRawCalloutAndValidation(path, 'businessPartner', false, 0, false);
    assert.equal(result, 0);
  });

  it('preserves the incoming newIssues count (additive)', () => {
    const path = writeSchemaRaw({ name: 'businessPartner', callout: 'SE_BP' });
    const result = checkSchemaRawCalloutAndValidation(path, 'businessPartner', false, 5, false);
    assert.equal(result, 6);
  });
});

describe('verifyEditableHeaderFields', () => {
  // Use a window name whose artifacts/<name>/schema-raw.json does NOT exist so we
  // isolate the readOnlyLogic branch from the schema-raw callout/validation branch.
  const NO_SCHEMA_RAW_WINDOW = '__verify_window_test_no_schema_raw__';

  it('returns 0 when h has no fields', () => {
    assert.equal(verifyEditableHeaderFields({}, { enabled: true }, NO_SCHEMA_RAW_WINDOW, 0), 0);
  });

  it('returns 0 when h is undefined', () => {
    assert.equal(verifyEditableHeaderFields(undefined, { enabled: true }, NO_SCHEMA_RAW_WINDOW, 0), 0);
  });

  it('skips discarded/system/readOnly/non-form fields', () => {
    const h = {
      fields: [
        { name: 'a', form: true, visibility: 'discarded' },
        { name: 'b', form: true, visibility: 'system' },
        { name: 'c', form: true, visibility: 'readOnly' },
        { name: 'd', form: false, visibility: 'editable' },
      ],
    };
    // All skipped → no readOnlyLogic checks → 0 new issues even with draftMode enabled.
    assert.equal(verifyEditableHeaderFields(h, { enabled: true }, NO_SCHEMA_RAW_WINDOW, 0), 0);
  });

  it('counts missing readOnlyLogic when ctDraftMode.enabled', () => {
    const h = {
      fields: [
        { name: 'a', form: true, visibility: 'editable' }, // no readOnlyLogic
        { name: 'b', form: true, visibility: 'editable', readOnlyLogic: 'x' }, // has it
      ],
    };
    assert.equal(verifyEditableHeaderFields(h, { enabled: true }, NO_SCHEMA_RAW_WINDOW, 0), 1);
  });

  it('does NOT count missing readOnlyLogic when ctDraftMode not enabled', () => {
    const h = {
      fields: [{ name: 'a', form: true, visibility: 'editable' }],
    };
    assert.equal(verifyEditableHeaderFields(h, { enabled: false }, NO_SCHEMA_RAW_WINDOW, 0), 0);
  });

  it('does NOT count missing readOnlyLogic when ctDraftMode undefined', () => {
    const h = {
      fields: [{ name: 'a', form: true, visibility: 'editable' }],
    };
    assert.equal(verifyEditableHeaderFields(h, undefined, NO_SCHEMA_RAW_WINDOW, 0), 0);
  });

  it('counts each editable field missing readOnlyLogic', () => {
    const h = {
      fields: [
        { name: 'a', form: true, visibility: 'editable' },
        { name: 'b', form: true, visibility: 'editable' },
      ],
    };
    assert.equal(verifyEditableHeaderFields(h, { enabled: true }, NO_SCHEMA_RAW_WINDOW, 0), 2);
  });

  it('return value is independent of priorIssues (only affects ok line)', () => {
    const h = {
      fields: [{ name: 'a', form: true, visibility: 'editable' }],
    };
    // priorIssues 5 + newIssues 1 != 0 → no ok line, but newIssues returned is still 1.
    assert.equal(verifyEditableHeaderFields(h, { enabled: true }, NO_SCHEMA_RAW_WINDOW, 5), 1);
  });
});

describe('verifyAddLineFields', () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'verify-window-headerpage-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeHeaderPage(block) {
    const path = join(dir, 'HeaderPage.jsx');
    const content = block === null
      ? 'export default function HeaderPage() { return null; }\n'
      : `// sf-generated-start addLineFields\n${block}\n// sf-generated-end addLineFields\n`;
    writeFileSync(path, content, 'utf8');
    return path;
  }

  const FULL_BLOCK = "{ name: 'product', lookup: true }, { name: 'quantity', defaultValue: 1 }, hidden: ['grossUnitPrice']";

  it('all present (lookup/defaultValue:1/grossUnitPrice) → +0', () => {
    const path = writeHeaderPage(FULL_BLOCK);
    assert.equal(verifyAddLineFields(path, 0), 0);
  });

  it('missing lookup: true → +1', () => {
    const block = "{ name: 'product' }, { name: 'quantity', defaultValue: 1 }, hidden: ['grossUnitPrice']";
    assert.equal(verifyAddLineFields(writeHeaderPage(block), 0), 1);
  });

  it('missing defaultValue: 1 → +1', () => {
    const block = "{ name: 'product', lookup: true }, { name: 'quantity' }, hidden: ['grossUnitPrice']";
    assert.equal(verifyAddLineFields(writeHeaderPage(block), 0), 1);
  });

  it("missing 'grossUnitPrice' → +1", () => {
    const block = "{ name: 'product', lookup: true }, { name: 'quantity', defaultValue: 1 }, hidden: []";
    assert.equal(verifyAddLineFields(writeHeaderPage(block), 0), 1);
  });

  it('all three missing → +3', () => {
    const block = "{ name: 'product' }, { name: 'quantity' }, hidden: []";
    assert.equal(verifyAddLineFields(writeHeaderPage(block), 0), 3);
  });

  it('preserves incoming issues count (additive)', () => {
    const block = "{ name: 'product' }, { name: 'quantity', defaultValue: 1 }, hidden: ['grossUnitPrice']";
    assert.equal(verifyAddLineFields(writeHeaderPage(block), 4), 5);
  });

  it('no addLineFields block present → returns issues unchanged', () => {
    const path = writeHeaderPage(null);
    assert.equal(verifyAddLineFields(path, 2), 2);
  });
});
