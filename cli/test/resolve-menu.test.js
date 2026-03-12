import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { toKebabCase, MENU_QUERY, MENU_QUERY_BY_NAME, resolveFromRow } from '../src/resolve-menu.js';
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

describe('MENU_QUERY_BY_NAME', () => {
  it('references AD_Menu table', () => {
    assert.ok(MENU_QUERY_BY_NAME.includes('AD_Menu'));
  });

  it('uses LOWER() for case-insensitive search', () => {
    assert.ok(MENU_QUERY_BY_NAME.includes('LOWER(m.Name)'));
    assert.ok(MENU_QUERY_BY_NAME.includes('LOWER($1)'));
  });

  it('filters by IsActive', () => {
    assert.ok(MENU_QUERY_BY_NAME.includes("IsActive = 'Y'"));
  });
});

describe('resolveFromRow', () => {
  it('action W returns resolvedMode window', () => {
    const result = resolveFromRow({
      action: 'W',
      name: 'Sales Order',
      ad_window_id: 'WIN123',
      ad_process_id: null,
      issummary: 'N',
    });
    assert.equal(result.resolvedMode, 'window');
    assert.equal(result.windowId, 'WIN123');
    assert.equal(result.resolvedName, 'sales-order');
  });

  it('action P returns resolvedMode process', () => {
    const result = resolveFromRow({
      action: 'P',
      name: 'Generate Report',
      ad_window_id: null,
      ad_process_id: 'PROC456',
      issummary: 'N',
    });
    assert.equal(result.resolvedMode, 'process');
    assert.equal(result.processId, 'PROC456');
  });

  it('action X throws error indicating manual build required', () => {
    assert.throws(
      () => resolveFromRow({
        action: 'X',
        name: 'Create Invoices',
        ad_window_id: null,
        ad_process_id: null,
        issummary: 'N',
        form_classname: 'org.openbravo.erpCommon.ad_forms.GenerateInvoicesmanual',
      }),
      (err) => {
        assert.ok(err.message.includes('AD_Form'));
        assert.ok(err.message.includes('manually'));
        assert.ok(err.message.includes('Create Invoices'));
        assert.ok(err.message.includes('GenerateInvoicesmanual.java'));
        assert.ok(err.message.includes('GenerateInvoicesmanual.html'));
        return true;
      }
    );
  });

  it('action X without classname omits source file hints', () => {
    assert.throws(
      () => resolveFromRow({
        action: 'X',
        name: 'Some Form',
        ad_window_id: null,
        ad_process_id: null,
        issummary: 'N',
        form_classname: null,
      }),
      (err) => {
        assert.ok(err.message.includes('AD_Form'));
        assert.ok(err.message.includes('manually'));
        assert.ok(!err.message.includes('.java'));
        return true;
      }
    );
  });

  it('isSummary Y throws folder error', () => {
    assert.throws(
      () => resolveFromRow({
        action: 'W',
        name: 'Folder',
        ad_window_id: null,
        ad_process_id: null,
        issummary: 'Y',
        }),
      (err) => {
        assert.ok(err.message.includes('folder'));
        return true;
      }
    );
  });

  it('action R resolves as report mode', () => {
    const result = resolveFromRow({
      action: 'R',
      name: 'Some Report',
      ad_window_id: null,
      ad_process_id: 'PROC123',
      issummary: 'N',
    });
    assert.equal(result.resolvedMode, 'report');
    assert.equal(result.resolvedName, 'some-report');
    assert.equal(result.processId, 'PROC123');
  });

  it('unsupported action throws error', () => {
    assert.throws(
      () => resolveFromRow({
        action: 'Z',
        name: 'Unknown',
        ad_window_id: null,
        ad_process_id: null,
        issummary: 'N',
        }),
      (err) => {
        assert.ok(err.message.includes("Unsupported menu action"));
        return true;
      }
    );
  });
});

describe('validatePipelineInput — menu mode', () => {
  it('accepts menuId input', () => {
    const result = validatePipelineInput({ menuId: '123' });
    assert.equal(result.valid, true);
    assert.equal(result.mode, 'menu');
  });

  it('accepts menuName input', () => {
    const result = validatePipelineInput({ menuName: 'Sales Order' });
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

  it('menuName triggers menu mode over window mode', () => {
    const result = validatePipelineInput({ menuName: 'Test', windowId: '143', windowName: 'test' });
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

describe('parseArgs — --menu-name', () => {
  it('parses --menu-name flag', () => {
    const result = parseArgs(['node', 'pipeline.js', '--menu-name', 'Sales Order']);
    assert.equal(result.menuName, 'Sales Order');
  });

  it('combines --menu-name with --dry-run', () => {
    const result = parseArgs(['node', 'pipeline.js', '--menu-name', 'Sales Order', '--dry-run']);
    assert.equal(result.menuName, 'Sales Order');
    assert.equal(result.dryRun, true);
  });

  it('does not set menuName without a value', () => {
    const result = parseArgs(['node', 'pipeline.js', '--menu-name']);
    assert.equal(result.menuName, undefined);
  });
});
