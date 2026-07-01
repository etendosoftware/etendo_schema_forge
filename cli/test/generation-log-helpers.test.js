import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseFieldArray,
  classifyFile,
  compareGenerated,
  createLogEntries,
} from '../src/generation-log.js';

// ---------------------------------------------------------------------------
// parseFieldArray — additional branch coverage
// ---------------------------------------------------------------------------

describe('parseFieldArray — uncovered branches', () => {
  it('returns empty array when array name is not found', () => {
    const source = "const otherName = [{ key: 'x', type: 'string' }];";
    const result = parseFieldArray(source, 'columns');
    assert.deepEqual(result, []);
  });

  it('handles boolean values in fields', () => {
    const source = `const columns = [
  { key: 'isActive', label: 'Active', type: 'boolean', sortable: true },
];`;
    const fields = parseFieldArray(source, 'columns');
    assert.equal(fields.length, 1);
    assert.equal(fields[0].sortable, 'true');
  });

  it('handles float numeric values', () => {
    const source = `const columns = [
  { key: 'ratio', label: 'Ratio', type: 'number', width: 0.75 },
];`;
    const fields = parseFieldArray(source, 'columns');
    assert.equal(fields.length, 1);
    assert.equal(fields[0].width, '0.75');
  });

  it('handles false boolean value', () => {
    const source = `const columns = [
  { key: 'hidden', label: 'Hidden', type: 'string', visible: false },
];`;
    const fields = parseFieldArray(source, 'columns');
    assert.equal(fields.length, 1);
    assert.equal(fields[0].visible, 'false');
  });
});

// ---------------------------------------------------------------------------
// classifyFile — additional coverage
// ---------------------------------------------------------------------------

describe('classifyFile — additional patterns', () => {
  it('classifies Table suffix correctly', () => {
    assert.equal(classifyFile('SalesOrderTable.jsx'), 'table');
  });

  it('classifies Form suffix correctly', () => {
    assert.equal(classifyFile('SalesOrderForm.jsx'), 'form');
  });

  it('classifies Page suffix correctly', () => {
    assert.equal(classifyFile('SalesOrderPage.jsx'), 'page');
  });

  it('classifies index.jsx as index', () => {
    assert.equal(classifyFile('index.jsx'), 'index');
  });

  it('classifies random file as other', () => {
    assert.equal(classifyFile('utils.jsx'), 'other');
  });
});

// ---------------------------------------------------------------------------
// compareGenerated — field type changes
// ---------------------------------------------------------------------------

describe('compareGenerated — field type changes', () => {
  it('detects field-type change in table columns', () => {
    const old = `const columns = [
  { key: 'amount', label: 'Amount', type: 'string' },
];`;
    const now = `const columns = [
  { key: 'amount', label: 'Amount', type: 'number' },
];`;
    const changes = compareGenerated('test', { 'TestTable.jsx': old }, { 'TestTable.jsx': now });
    assert.ok(changes.some(c => c.change === 'field-type'));
    const typeChange = changes.find(c => c.change === 'field-type');
    assert.equal(typeChange.before, 'string');
    assert.equal(typeChange.after, 'number');
  });

  it('detects field-type change in form fields', () => {
    const old = `const fields = [
  { key: 'date', label: 'Date', type: 'text' },
];`;
    const now = `const fields = [
  { key: 'date', label: 'Date', type: 'date' },
];`;
    const changes = compareGenerated('test', { 'TestForm.jsx': old }, { 'TestForm.jsx': now });
    assert.ok(changes.some(c => c.change === 'field-type'));
  });

  it('detects page content changed', () => {
    const changes = compareGenerated('test',
      { 'TestPage.jsx': 'version 1' },
      { 'TestPage.jsx': 'version 2' }
    );
    assert.equal(changes.length, 1);
    assert.equal(changes[0].change, 'component-changed');
    assert.ok(changes[0].after.includes('page'));
  });

  it('detects other file content changed', () => {
    const changes = compareGenerated('test',
      { 'helpers.js': 'v1' },
      { 'helpers.js': 'v2' }
    );
    assert.equal(changes.length, 1);
    assert.equal(changes[0].change, 'component-changed');
    assert.ok(changes[0].after.includes('other'));
  });
});

// ---------------------------------------------------------------------------
// createLogEntries — no-changes branch
// ---------------------------------------------------------------------------

describe('createLogEntries — no-changes scenario', () => {
  it('produces a single no-changes entry when old and new are identical', () => {
    const files = { 'TestTable.jsx': 'same content' };
    const entries = createLogEntries('test-win', 'manual', files, files, []);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].change, 'no-changes');
    assert.equal(entries[0].window, 'test-win');
    assert.equal(entries[0].trigger, 'manual');
    assert.equal(entries[0].entity, null);
    assert.equal(entries[0].file, null);
  });

  it('starts at run-001 when existingLog is empty', () => {
    const entries = createLogEntries('w', 'test', {}, {}, []);
    assert.equal(entries[0].runId, 'run-001');
  });

  it('increments from max existing runId', () => {
    const existing = [{ runId: 'run-005' }];
    const entries = createLogEntries('w', 'test', {}, { 'X.jsx': 'new' }, existing);
    assert.equal(entries[0].runId, 'run-006');
  });

  it('propagates trigger and window into all entries', () => {
    const entries = createLogEntries('mywin', 'pipeline', {}, { 'A.jsx': 'x', 'B.jsx': 'y' }, []);
    for (const e of entries) {
      assert.equal(e.trigger, 'pipeline');
      assert.equal(e.window, 'mywin');
    }
  });
});
