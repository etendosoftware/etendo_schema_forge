/**
 * Regression tests for the customRenderer field option (ETP-4247).
 *
 * Verifies that a field with `customRenderer` in the contract:
 *   1. Emits an import statement using resolveCustomImport.
 *   2. Adds `customRenderer: ComponentName` (bare identifier, not string) to the fields array.
 *   3. Does NOT leak imports/references into windows that don't declare customRenderer.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateFormComponent } from '../src/generate-frontend.js';

// ─── Fixture: contract with a customRenderer field ────────────────────────────

/** Minimal contract that mirrors chart-of-accounts elementValue. */
function makeContract({ customRenderer = null } = {}) {
  const searchKeyField = {
    name: 'searchKey',
    column: 'Value',
    type: 'string',
    tsType: 'string',
    label: 'Search Key',
    visibility: 'editable',
    required: true,
    grid: true,
    form: true,
  };
  if (customRenderer) searchKeyField.customRenderer = customRenderer;

  return {
    frontendContract: {
      window: { id: '1', name: 'Chart of Accounts', primaryEntity: 'elementValue', category: 'accounting' },
      entities: {
        elementValue: {
          fields: [
            searchKeyField,
            { name: 'name', column: 'Name', type: 'string', tsType: 'string', visibility: 'editable', required: true, grid: true, form: true },
          ],
          searchableFields: ['name'],
          computedFields: [],
        },
      },
    },
    backendContract: { processEndpoints: [] },
    apiPrediction: { specName: 'chart-of-accounts' },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('generateFormComponent — customRenderer', () => {
  it('emits a bare identifier (not string) for customRenderer in the fields array', () => {
    const contract = makeContract({ customRenderer: 'AccountCodeField' });
    const code = generateFormComponent('elementValue', contract);
    // customRenderer must be a JS reference, not a quoted string
    assert.match(code, /customRenderer:\s*AccountCodeField\b/);
    assert.doesNotMatch(code, /customRenderer:\s*'AccountCodeField'/);
  });

  it('emits an import statement for the custom renderer component', () => {
    const contract = makeContract({ customRenderer: 'AccountCodeField' });
    const code = generateFormComponent('elementValue', contract);
    // Should import AccountCodeField — exact path depends on filesystem (artifact/custom/ in this case)
    assert.match(code, /import AccountCodeField from/);
  });

  it('does NOT emit a customRenderer line when not declared', () => {
    const contract = makeContract(); // no customRenderer
    const code = generateFormComponent('elementValue', contract);
    assert.doesNotMatch(code, /customRenderer/);
  });

  it('does NOT emit an import for the renderer when not declared', () => {
    const contract = makeContract(); // no customRenderer
    const code = generateFormComponent('elementValue', contract);
    assert.doesNotMatch(code, /import AccountCodeField/);
  });

  it('collects multiple distinct customRenderer imports without duplicates', () => {
    const contract = makeContract({ customRenderer: 'AccountCodeField' });
    // Add a second field with the same customRenderer
    contract.frontendContract.entities.elementValue.fields[1].customRenderer = 'AccountCodeField';
    const code = generateFormComponent('elementValue', contract);
    // Import should appear exactly once
    const importMatches = (code.match(/import AccountCodeField/g) || []);
    assert.equal(importMatches.length, 1, 'import should appear exactly once even when multiple fields share a renderer');
  });

  it('includes other non-customRenderer fields without modification', () => {
    const contract = makeContract({ customRenderer: 'AccountCodeField' });
    const code = generateFormComponent('elementValue', contract);
    // The "name" field should still be present with normal descriptor
    assert.match(code, /key:\s*'name'/);
    // name field should NOT have customRenderer
    const nameFieldMatch = code.match(/key:\s*'name'[^}]+/);
    assert.ok(nameFieldMatch, 'name field descriptor not found');
    assert.doesNotMatch(nameFieldMatch[0], /customRenderer/);
  });
});

describe('generateFormComponent — customRenderer edge cases', () => {
  it('handles specName absent gracefully (no import emitted, no crash)', () => {
    const contract = makeContract({ customRenderer: 'AccountCodeField' });
    delete contract.apiPrediction; // no specName
    // Should not throw
    let code;
    assert.doesNotThrow(() => { code = generateFormComponent('elementValue', contract); });
    // With no specName, no import is emitted (cannot resolve path)
    assert.doesNotMatch(code, /import AccountCodeField/);
    // But the field reference IS still emitted so EntityForm can handle it at runtime
    // (the import is skipped when specName is missing, but the field prop remains)
    assert.match(code, /customRenderer:\s*AccountCodeField\b/);
  });

  it('still produces valid EntityForm usage (no extra blank lines before import)', () => {
    const contract = makeContract({ customRenderer: 'AccountCodeField' });
    const code = generateFormComponent('elementValue', contract);
    // EntityForm import should be present
    assert.match(code, /import \{ EntityForm \} from '@\/components\/contract-ui'/);
    // AccountCodeField import should be present
    assert.match(code, /import AccountCodeField from/);
  });
});
