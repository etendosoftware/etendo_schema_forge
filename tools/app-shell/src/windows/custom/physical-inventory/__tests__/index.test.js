import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildDocumentRowQuickActionsPostMenu,
  buildPostUnpostMenuActions,
} from '../../shared/buildDocumentRowQuickActions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'index.jsx'), 'utf8');

describe('PhysicalInventoryWindow custom wrapper', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function PhysicalInventoryWindow/);
  });

  it('imports GeneratedApp from generated artifacts', () => {
    assert.match(src, /import GeneratedApp from '@generated\/physical-inventory/);
  });

  it('imports InventoryTable from generated artifacts', () => {
    assert.match(src, /import InventoryTable from '@generated\/physical-inventory/);
  });

  it('renders GeneratedApp with custom Table', () => {
    assert.match(src, /Table=\{CustomInventoryTable\}/);
  });

  it('passes hideMoreMenu callback', () => {
    assert.match(src, /hideMoreMenu=\{hideMenuActions\}/);
  });

  it('defines COLUMNS with expected fields', () => {
    assert.match(src, /key:\s*'movementDate'/);
    assert.match(src, /key:\s*'name'/);
    assert.match(src, /key:\s*'warehouse'/);
    assert.match(src, /key:\s*'processed'/);
    // inventoryType column was removed in the ETP-4270 redesign.
    assert.doesNotMatch(src, /key:\s*'inventoryType'/);
  });

  it('processed status column carries draft/processed enum labels', () => {
    assert.match(src, /key:\s*'processed'/);
    assert.match(src, /type:\s*'status'/);
    assert.match(src, /enumLabels/);
    assert.match(src, /'true':\s*'statusProcessed'/);
    assert.match(src, /'false':\s*'statusDraft'/);
  });

  it('warehouse column uses a custom render', () => {
    assert.match(src, /key:\s*'warehouse'/);
    assert.match(src, /type:\s*'custom'/);
    assert.match(src, /render:\s*\(row\)\s*=>/);
  });

  it('passes Sort and Refresh icon components to GeneratedApp', () => {
    assert.match(src, /SortIconComponent=\{SortIcon\}/);
    assert.match(src, /RefreshIconComponent=\{RefreshIcon\}/);
  });

  it('hideMenuActions hides menu when no id', () => {
    // Test the logic by evaluating the pattern
    assert.match(src, /function hideMenuActions/);
    assert.match(src, /!data\?\.id/);
  });

  describe('hideMenuActions behavior (ETP-5360 regression)', () => {
    // Extract the real function body from source and evaluate it, so the
    // assertions below exercise actual behavior rather than matching text.
    const fnMatch = src.match(/function hideMenuActions\(\{ data \}\) \{[\s\S]*?\n\}/);

    it('is defined as a single-statement predicate in source', () => {
      assert.ok(fnMatch, 'hideMenuActions function source not found');
    });

    // eslint-disable-next-line no-new-func
    const hideMenuActions = new Function(`return (${fnMatch[0]});`)();

    it('keeps the kebab reachable for a processed record (boolean true) — the exact ETP-5360 regression', () => {
      assert.equal(hideMenuActions({ data: { id: '123', processed: true } }), false);
    });

    it('keeps the kebab reachable for a processed record (ADempiere string "Y")', () => {
      assert.equal(hideMenuActions({ data: { id: '123', processed: 'Y' } }), false);
    });

    it('keeps the kebab reachable for a draft (unprocessed) record', () => {
      assert.equal(hideMenuActions({ data: { id: '123', processed: false } }), false);
    });

    it('hides the kebab when there is no record id yet', () => {
      assert.equal(hideMenuActions({ data: {} }), true);
    });

    it('hides the kebab when data is undefined', () => {
      assert.equal(hideMenuActions({ data: undefined }), true);
    });
  });

  describe('rowQuickActions includeUnpost wiring (ETP-5360)', () => {
    const callMatch = src.match(/\.\.\.buildDocumentRowQuickActionsPostMenu\(\{([^}]*)\}\)/);

    it('spreads buildDocumentRowQuickActionsPostMenu into rowQuickActions', () => {
      assert.match(src, /rowQuickActions = useMemo\(\(\) => \(\{[\s\S]*?\.\.\.buildDocumentRowQuickActionsPostMenu\(/);
      assert.match(src, /rowQuickActions=\{rowQuickActions\}/);
    });

    it('opts in with includeUnpost: true', () => {
      assert.ok(callMatch, 'buildDocumentRowQuickActionsPostMenu call not found');
      assert.match(callMatch[1], /includeUnpost:\s*true/);
    });

    it('menuActions resolved with those options yields unpost for a posted row', () => {
      const includeUnpost = /includeUnpost:\s*true/.test(callMatch?.[1] ?? '');
      const { menuActions } = buildDocumentRowQuickActionsPostMenu({ ui: (k) => k, onRefresh: () => {}, includeUnpost });
      assert.equal(menuActions, buildPostUnpostMenuActions);
      const actions = menuActions({ row: { id: 'inv-1', processed: true, posted: true } });
      assert.equal(actions.length, 1);
      assert.equal(actions[0].neoAction, 'unpost');
      assert.equal(actions[0].destructive, true);
    });

    it('menuActions still yields post for a processed, unposted row', () => {
      const { menuActions } = buildDocumentRowQuickActionsPostMenu({ includeUnpost: true });
      assert.deepEqual(menuActions({ row: { processed: 'Y', posted: 'N' } }).map((a) => a.key), ['post']);
    });
  });
});
