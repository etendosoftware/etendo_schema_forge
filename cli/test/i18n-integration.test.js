import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

// ---------------------------------------------------------------------------
// resolveLabel — pure function tests
// ---------------------------------------------------------------------------

// Inline the function since it lives in the app-shell (ESM with import.meta)
function resolveLabel(dictionary, columnName) {
  return dictionary?.fields?.[columnName]?.label ?? null;
}

describe('resolveLabel', () => {
  const dict = {
    fields: {
      C_BPartner_ID: { label: 'Business Partner' },
      DocumentNo: { label: 'Document No.' },
      DateOrdered: { label: 'Order Date' },
    },
  };

  it('returns label for known column', () => {
    assert.equal(resolveLabel(dict, 'C_BPartner_ID'), 'Business Partner');
  });

  it('returns null for unknown column', () => {
    assert.equal(resolveLabel(dict, 'NonExistentColumn'), null);
  });

  it('returns null when dictionary is null', () => {
    assert.equal(resolveLabel(null, 'C_BPartner_ID'), null);
  });

  it('returns null when dictionary is undefined', () => {
    assert.equal(resolveLabel(undefined, 'C_BPartner_ID'), null);
  });

  it('returns null when dictionary has no fields key', () => {
    assert.equal(resolveLabel({}, 'C_BPartner_ID'), null);
  });

  it('returns null when fields entry has no label', () => {
    assert.equal(resolveLabel({ fields: { C_BPartner_ID: {} } }, 'C_BPartner_ID'), null);
  });

  it('returns null for empty string column name', () => {
    assert.equal(resolveLabel(dict, ''), null);
  });

  it('returns null for null column name', () => {
    assert.equal(resolveLabel(dict, null), null);
  });

  it('returns null for undefined column name', () => {
    assert.equal(resolveLabel(dict, undefined), null);
  });

  it('handles label with special characters', () => {
    const specialDict = {
      fields: { TestCol: { label: 'Amount (USD) > 0' } },
    };
    assert.equal(resolveLabel(specialDict, 'TestCol'), 'Amount (USD) > 0');
  });

  it('returns empty string label as-is (nullish coalescing does not catch empty string)', () => {
    const emptyDict = { fields: { TestCol: { label: '' } } };
    // ?? only catches null/undefined, not empty string — this is correct behavior
    // The fallback chain (t(col) ?? f.label ?? f.key) will pass empty string through
    assert.equal(resolveLabel(emptyDict, 'TestCol'), '');
  });
});

// ---------------------------------------------------------------------------
// Generated artifact validation — column: key present, no label: key
// ---------------------------------------------------------------------------

const ARTIFACTS_DIR = resolve(import.meta.dirname, '../../artifacts');

function getGeneratedJsxFiles(dir) {
  const results = [];
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const full = join(dir, entry);
      const stat = statSync(full, { throwIfNoEntry: false });
      if (!stat) continue;
      if (stat.isDirectory()) {
        // Skip custom/ directories — hand-written files are not generated
        if (entry === 'custom') continue;
        results.push(...getGeneratedJsxFiles(full));
      } else if (entry.endsWith('Form.jsx') || entry.endsWith('Table.jsx')) {
        results.push(full);
      }
    }
  } catch {
    // Directory may not exist in test environments
  }
  return results;
}

describe('generated artifacts i18n compliance', () => {
  const jsxFiles = getGeneratedJsxFiles(ARTIFACTS_DIR);

  it('finds generated Form and Table JSX files', () => {
    assert.ok(jsxFiles.length > 0, `Expected generated JSX files in ${ARTIFACTS_DIR}`);
  });

  it('all field declarations have column: for i18n lookup; label: is allowed as per-window override', () => {
    // Every field line must have column: (the i18n lookup key).
    // label: is permitted alongside column: — it carries the per-window AD_Field.Name which
    // takes priority over the global locale when the same column has different labels in
    // different windows (e.g. BillTo_ID = "Invoice Address" in sales-order vs "Invoice From"
    // in purchase-order).
    const filesWithoutColumn = [];

    for (const file of jsxFiles) {
      const content = readFileSync(file, 'utf8');
      const fieldLines = content.split('\n').filter(
        (line) => line.includes('{ key:') || line.includes("{ key:")
      );
      for (const line of fieldLines) {
        if (!line.includes('column:')) {
          filesWithoutColumn.push(file);
          break;
        }
      }
    }

    assert.deepStrictEqual(
      filesWithoutColumn,
      [],
      `Files missing column: key: ${filesWithoutColumn.join(', ')}`,
    );
  });

  it('every field declaration has a non-empty column value', () => {
    const badFields = [];
    for (const file of jsxFiles) {
      const content = readFileSync(file, 'utf8');
      // Match column: 'VALUE' or column: "VALUE"
      const columnMatches = content.matchAll(/column:\s*['"]([^'"]*)['"]/g);
      for (const m of columnMatches) {
        if (!m[1] || m[1].trim().length === 0) {
          badFields.push({ file, match: m[0] });
        }
      }
    }
    assert.deepStrictEqual(badFields, [], 'Found fields with empty column values');
  });
});

// ---------------------------------------------------------------------------
// Fallback chain: t(f.column) ?? f.label ?? f.key
// ---------------------------------------------------------------------------

describe('label fallback chain', () => {
  it('uses dictionary label when available', () => {
    const dict = { fields: { Col1: { label: 'From Dict' } } };
    const field = { key: 'myField', column: 'Col1', label: 'Static Label' };
    const result = resolveLabel(dict, field.column) ?? field.label ?? field.key;
    assert.equal(result, 'From Dict');
  });

  it('falls back to field.label when dictionary miss', () => {
    const dict = { fields: {} };
    const field = { key: 'myField', column: 'UnknownCol', label: 'Static Label' };
    const result = resolveLabel(dict, field.column) ?? field.label ?? field.key;
    assert.equal(result, 'Static Label');
  });

  it('falls back to field.key when both dictionary and label missing', () => {
    const dict = { fields: {} };
    const field = { key: 'myField', column: 'UnknownCol' };
    const result = resolveLabel(dict, field.column) ?? field.label ?? field.key;
    assert.equal(result, 'myField');
  });

  it('falls back to field.key when dictionary is null and no label', () => {
    const field = { key: 'myField', column: 'AnyCol' };
    const result = resolveLabel(null, field.column) ?? field.label ?? field.key;
    assert.equal(result, 'myField');
  });
});
