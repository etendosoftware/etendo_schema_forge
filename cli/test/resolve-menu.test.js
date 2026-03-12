import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { toKebabCase, MENU_QUERY } from '../src/resolve-menu.js';
import { validatePipelineInput, parseArgs } from '../src/pipeline.js';

describe('toKebabCase', () => {
  it('converts spaced name to kebab', () => {
    assert.equal(toKebabCase('Generate Invoices'), 'generate-invoices');
  });

  it('converts two-word name', () => {
    assert.equal(toKebabCase('Sales Order'), 'sales-order');
  });

  it('converts underscored name', () => {
    assert.equal(toKebabCase('My_Process_Name'), 'my-process-name');
  });

  it('preserves already-kebab name', () => {
    assert.equal(toKebabCase('already-kebab'), 'already-kebab');
  });

  it('trims and collapses extra spaces', () => {
    assert.equal(toKebabCase('  Extra  Spaces  '), 'extra-spaces');
  });

  it('lowercases mixed case', () => {
    assert.equal(toKebabCase('MixedCASE Test'), 'mixedcase-test');
  });

  it('removes parentheses and special chars', () => {
    assert.equal(toKebabCase('Name with (parens)'), 'name-with-parens');
  });
});

describe('MENU_QUERY', () => {
  it('references AD_Menu table', () => {
    assert.ok(MENU_QUERY.includes('AD_Menu'));
  });

  it('uses $1 parameterized placeholder', () => {
    assert.ok(MENU_QUERY.includes('$1'));
  });

  it('filters by IsActive', () => {
    assert.ok(MENU_QUERY.includes("IsActive = 'Y'"));
  });
});

describe('validatePipelineInput — menu mode', () => {
  it('accepts menuId input', () => {
    const result = validatePipelineInput({ menuId: '123' });
    assert.equal(result.valid, true);
    assert.equal(result.mode, 'menu');
  });

  it('menu mode takes priority over process mode', () => {
    const result = validatePipelineInput({ menuId: '123', processId: '456', processName: 'test' });
    assert.equal(result.mode, 'menu');
  });

  it('menu mode takes priority over window mode', () => {
    const result = validatePipelineInput({ menuId: '123', windowId: '143', windowName: 'sales-order' });
    assert.equal(result.mode, 'menu');
  });
});

describe('parseArgs — --menu-id', () => {
  it('parses --menu-id flag', () => {
    const result = parseArgs(['node', 'pipeline.js', '--menu-id', 'ABC123']);
    assert.equal(result.menuId, 'ABC123');
  });

  it('combines --menu-id with --dry-run', () => {
    const result = parseArgs(['node', 'pipeline.js', '--menu-id', 'ABC123', '--dry-run']);
    assert.equal(result.menuId, 'ABC123');
    assert.equal(result.dryRun, true);
  });
});
