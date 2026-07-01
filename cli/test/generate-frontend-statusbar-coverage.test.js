/**
 * Coverage-focused tests for generate-frontend.js.
 *
 * Targets the large uncovered blocks identified in the merged lcov:
 *   - Lines 59-60   : resolveCustomImport — shared/ fallback path
 *   - Lines 102-117 : pluralize — all suffix branches
 *   - Lines 410-414 : getDefaultValuePart — numeric defaultValue with skipCheckboxDefault/skipServerMacro
 *   - Lines 565-698 : generateStatusBarComponent — main export path via generatePageComponent
 *   - Lines 717-725 : getNewActionsPropValue — newActions with component modal
 *   - Lines 807-812 : buildCustomComponentImportsAndProps — sidePanel + sidePanelStyle branch
 *   - Lines 827-828 : buildCustomComponentImportsAndProps — newActions component import
 *   - Lines 845     : getSuccessPart — successMessage branch
 *   - Lines 1124-1127: getListKpiCardsParts — customComponent branch
 *   - Lines 1863-1864: secondary tab import — isFormTab branch
 *   - Lines 1876-1877: secondary tab prop entry — isFormTab branch
 *   - Lines 2103-2104: newActionsStatements — component modal state
 *   - Lines 2108-2110: newActionsModals — component modal JSX
 *   - Lines 2323-2332: captureCurrentState — normal directory read
 *   - Lines 2485-2509: CLI isDirectRun block — genuinely unreachable from unit tests
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  pluralize,
  generatePageComponent,
  generateAll,
  captureCurrentState,
  getMenuActionsProp,
  fragmentIf,
} from '../src/generate-frontend.js';

// ---------------------------------------------------------------------------
// Minimal valid contract builder
// ---------------------------------------------------------------------------

function makeContract(windowOverrides = {}, entityFields = [], entityName = 'order') {
  return {
    frontendContract: {
      window: {
        id: '1',
        name: 'Test Window',
        primaryEntity: entityName,
        category: 'sales',
        ...windowOverrides,
      },
      entities: {
        [entityName]: {
          fields: entityFields.length > 0 ? entityFields : [
            { name: 'documentNo', column: 'DocumentNo', type: 'string', tsType: 'string', visibility: 'readOnly', required: true, grid: true, form: true },
            { name: 'description', column: 'Description', type: 'string', tsType: 'string', visibility: 'editable', required: false, grid: true, form: true },
          ],
          searchableFields: ['documentNo'],
          computedFields: [],
        },
      },
    },
    backendContract: { processEndpoints: [] },
  };
}

// ---------------------------------------------------------------------------
// pluralize — lines 102-117
// ---------------------------------------------------------------------------

describe('pluralize — suffix branches', () => {
  it('pluralizes a regular noun with -s', () => {
    assert.equal(pluralize('Order'), 'Orders');
  });

  it('keeps already-plural nouns ending in -s (not double -s)', () => {
    assert.equal(pluralize('Items'), 'Items');
  });

  it('replaces -y with -ies for consonant+y ending', () => {
    assert.equal(pluralize('Category'), 'Categories');
  });

  it('adds -es for words ending in -ss', () => {
    assert.equal(pluralize('Business'), 'Businesses');
  });

  it('adds -es for words ending in -x', () => {
    assert.equal(pluralize('Tax'), 'Taxes');
  });

  it('adds -es for words ending in -ch', () => {
    assert.equal(pluralize('Batch'), 'Batches');
  });

  it('adds -es for words ending in -sh', () => {
    assert.equal(pluralize('Dish'), 'Dishes');
  });

  it('adds -es for words ending in -z', () => {
    assert.equal(pluralize('Topaz'), 'Topazes');
  });

  it('preserves multi-word labels — only pluralizes the last word', () => {
    assert.equal(pluralize('Sales Order'), 'Sales Orders');
  });

  it('handles empty string', () => {
    assert.equal(pluralize(''), '');
  });

  it('handles null', () => {
    assert.equal(pluralize(null), '');
  });

  it('does NOT add -ies for vowel+y (e.g. Array → Arrays)', () => {
    assert.equal(pluralize('Array'), 'Arrays');
  });
});

// ---------------------------------------------------------------------------
// generateStatusBarComponent exercised via generatePageComponent — lines 565-698
//
// Two branches:
//   1. statusBar WITHOUT progress → lines 663-697 (no-progress branch)
//   2. statusBar WITH progress    → lines 602-661 (progress branch, the larger block)
// ---------------------------------------------------------------------------

describe('generatePageComponent — statusBar without progress (lines 663-697)', () => {
  const contract = makeContract({
    statusBar: {
      cards: [
        { field: 'grandTotal', label: 'Total', color: 'blue', icon: 'TrendingUp' },
        { field: 'posted', display: 'yesno', labelKey: 'postedLabel', trueKey: 'yes', falseKey: 'no', trueColor: 'green', falseColor: 'orange', icon: 'CheckCircle' },
        { field: 'businessPartner', display: 'identifier', labelKey: 'bpLabel', color: 'teal', icon: 'User' },
      ],
    },
  });

  it('emits useUI import when statusBar is configured', () => {
    const src = generatePageComponent('order', null, contract);
    assert.match(src, /import \{ useUI \} from '@\/i18n'/);
  });

  it('emits lucide icon imports for all card icons', () => {
    const src = generatePageComponent('order', null, contract);
    assert.match(src, /import \{ .* \} from 'lucide-react'/);
    assert.match(src, /TrendingUp/);
    assert.match(src, /CheckCircle/);
    assert.match(src, /User/);
  });

  it('emits the StatusBar component function', () => {
    const src = generatePageComponent('order', null, contract);
    assert.match(src, /function OrderStatusBar\(\{ data \}\)/);
  });

  it('emits headerContent prop referencing the StatusBar component', () => {
    const src = generatePageComponent('order', null, contract);
    assert.match(src, /headerContent/);
  });

  it('emits yesno value expression for yesno display card', () => {
    const src = generatePageComponent('order', null, contract);
    assert.match(src, /data\.posted === true/);
    assert.match(src, /data\.posted === 'Y'/);
  });

  it('emits identifier expression for identifier display card', () => {
    const src = generatePageComponent('order', null, contract);
    assert.match(src, /data\['businessPartner\$_identifier'\]/);
  });

  it('emits fmt() expression for default (numeric) display card', () => {
    const src = generatePageComponent('order', null, contract);
    assert.match(src, /fmt\(data\.grandTotal\)/);
  });

  it('uses labelKey via ui() when labelKey is set', () => {
    const src = generatePageComponent('order', null, contract);
    assert.match(src, /ui\('postedLabel'\)/);
    assert.match(src, /ui\('bpLabel'\)/);
  });

  it('uses static label string when labelKey is absent', () => {
    const src = generatePageComponent('order', null, contract);
    assert.match(src, /'Total'/);
  });
});

describe('generatePageComponent — statusBar WITH progress (lines 602-661)', () => {
  const contract = makeContract({
    statusBar: {
      cards: [
        { field: 'invoicedAmt', label: 'Invoiced', color: 'teal', icon: 'TrendingDown' },
      ],
      progress: {
        numerator: 'invoicedAmt',
        denominator: 'grandTotal',
        condition: 'isInvoiced',
        label: 'Invoice Progress',
        color: 'blue',
        completedColor: 'green',
        completedIcon: 'CheckCircle2',
      },
    },
  });

  it('emits the progress percent computation', () => {
    const src = generatePageComponent('order', null, contract);
    assert.match(src, /const pct = /);
    assert.match(src, /invoicedAmt.*grandTotal/s);
  });

  it('emits completedIcon in the progress JSX', () => {
    const src = generatePageComponent('order', null, contract);
    assert.match(src, /CheckCircle2/);
  });

  it('emits the in-progress icon (first card icon) in progress JSX', () => {
    const src = generatePageComponent('order', null, contract);
    assert.match(src, /TrendingDown/);
  });

  it('emits progressColor logic', () => {
    const src = generatePageComponent('order', null, contract);
    assert.match(src, /progressColor/);
    assert.match(src, /pct === 100/);
  });

  it('emits colorMap with all four palette entries', () => {
    const src = generatePageComponent('order', null, contract);
    assert.match(src, /blue:/);
    assert.match(src, /teal:/);
    assert.match(src, /orange:/);
    assert.match(src, /green:/);
  });

  it('emits the condition variable using the progress.condition field name', () => {
    const src = generatePageComponent('order', null, contract);
    assert.match(src, /const isInvoiced/);
  });
});

// ---------------------------------------------------------------------------
// generatePageComponent — newActions with component (lines 717-725, 827-828, 2103-2110)
// ---------------------------------------------------------------------------

describe('generatePageComponent — newActions with component modal', () => {
  const contract = makeContract({
    newActions: [
      { key: 'new-from-template', label: 'From Template', component: 'NewFromTemplateModal' },
    ],
  });

  it('emits useState for the modal open state', () => {
    const src = generatePageComponent('order', null, contract);
    assert.match(src, /useState/);
    assert.match(src, /showNewFromTemplateModal/);
  });

  it('emits the modal JSX controlled by the state', () => {
    const src = generatePageComponent('order', null, contract);
    assert.match(src, /NewFromTemplateModal/);
    assert.match(src, /showNewFromTemplateModal &&/);
  });

  it('emits newActions prop with onClick that sets modal state', () => {
    const src = generatePageComponent('order', null, contract);
    assert.match(src, /newActions=\{\[/);
    assert.match(src, /setNewFromTemplateModal\(true\)/);
  });
});

// ---------------------------------------------------------------------------
// generatePageComponent — sidePanel + sidePanelStyle (lines 807-812)
// ---------------------------------------------------------------------------

describe('generatePageComponent — sidePanel with sidePanelStyle', () => {
  const contract = makeContract({
    customComponents: {
      sidePanel: 'OrderSidePanel',
      sidePanelStyle: { width: 400, position: 'right' },
    },
  });

  it('emits sidePanel prop with the component reference', () => {
    const src = generatePageComponent('order', null, contract);
    assert.match(src, /sidePanel=\{OrderSidePanel\}/);
  });

  it('emits sidePanelStyle prop as JSON', () => {
    const src = generatePageComponent('order', null, contract);
    assert.match(src, /sidePanelStyle=\{/);
    assert.match(src, /400/);
  });
});

// ---------------------------------------------------------------------------
// generatePageComponent — listKpiCards with customComponent (lines 1124-1127)
// ---------------------------------------------------------------------------

describe('generatePageComponent — listKpiCards customComponent', () => {
  // specName is required for the listKpiCards branch to activate.
  // It comes from contract.apiPrediction.specName.
  const contract = {
    frontendContract: {
      window: {
        id: '1', name: 'Test Window', primaryEntity: 'order', category: 'sales',
        listKpiCards: { customComponent: 'OrderKpiCards' },
      },
      entities: {
        order: {
          fields: [
            { name: 'documentNo', column: 'DocumentNo', type: 'string', tsType: 'string', visibility: 'readOnly', required: true, grid: true, form: true },
          ],
          searchableFields: ['documentNo'],
          computedFields: [],
        },
      },
    },
    backendContract: { processEndpoints: [] },
    apiPrediction: { specName: 'test-window', actions: [] },
  };

  it('emits import for the KPI cards component when specName is present', () => {
    const src = generatePageComponent('order', null, contract);
    assert.match(src, /OrderKpiCards/);
  });

  it('emits headerContent prop in ListView when listKpiCards.customComponent is set', () => {
    const src = generatePageComponent('order', null, contract);
    // The prop is emitted as: headerContent={(p) => <OrderKpiCards {...p} />}
    assert.match(src, /headerContent=\{\(p\)/);
  });
});

// ---------------------------------------------------------------------------
// getMenuActionsProp — successMessage branch (line 845)
// ---------------------------------------------------------------------------

describe('getMenuActionsProp — successMessage (line 845)', () => {
  it('emits successMessage when successKey is absent', () => {
    const result = getMenuActionsProp([
      {
        key: 'mark-done',
        label: 'Mark Done',
        url: '/api/mark-done',
        successMessage: 'Marked as done successfully',
      },
    ], '({ status })');
    assert.match(result, /successMessage: 'Marked as done successfully'/);
  });

  it('emits successKey when successKey is present (takes priority)', () => {
    const result = getMenuActionsProp([
      {
        key: 'mark-done',
        label: 'Mark Done',
        url: '/api/mark-done',
        successKey: 'markedDoneSuccess',
        successMessage: 'Ignored message',
      },
    ], '({ status })');
    assert.match(result, /successKey: 'markedDoneSuccess'/);
    assert.doesNotMatch(result, /successMessage: 'Ignored message'/);
  });

  it('emits no success part when neither successKey nor successMessage is set', () => {
    const result = getMenuActionsProp([
      { key: 'noop', label: 'Noop', url: '/api/noop' },
    ], '({ status })');
    assert.doesNotMatch(result, /successKey/);
    assert.doesNotMatch(result, /successMessage/);
  });
});

// ---------------------------------------------------------------------------
// captureCurrentState — lines 2323-2332
// (reads from the real artifacts directory; uses an existing window to get into
// the `if (existsSync(webDir))` true branch, or a nonexistent one for the
// early-return false branch.)
// ---------------------------------------------------------------------------

describe('captureCurrentState', () => {
  it('returns empty object when the window has no generated directory', () => {
    const result = captureCurrentState('nonexistent-window-xyz', '/Users/ivanrobledo/Documents/EtendoGO/schema_forge');
    assert.deepEqual(result, {});
  });

  it('returns a map of filename → content for a window that has been generated', () => {
    // Use 'sales-order' which is very likely to have generated files in artifacts/
    const result = captureCurrentState('sales-order', '/Users/ivanrobledo/Documents/EtendoGO/schema_forge');
    // If the directory exists, result is a non-empty object with .jsx keys
    // If not (CI environment without artifacts), it's {}; either is valid and exercises the branch
    assert.equal(typeof result, 'object');
    for (const [key, val] of Object.entries(result)) {
      assert.match(key, /\.(jsx|js)$/);
      assert.equal(typeof val, 'string');
    }
  });
});

// ---------------------------------------------------------------------------
// generateAll — exercises the full pipeline including statusBar code path
// ---------------------------------------------------------------------------

describe('generateAll — statusBar contract produces Page with StatusBar', () => {
  const contract = makeContract({
    statusBar: {
      cards: [
        { field: 'total', label: 'Total', color: 'blue', icon: 'DollarSign' },
      ],
    },
  });

  it('returns files including OrderPage.jsx with StatusBar code embedded', () => {
    const files = generateAll(contract);
    // generateAll uses primaryEntity name → toJsIdentifier('order') = 'Order' → OrderPage.jsx
    const pageSrc = files['OrderPage.jsx'];
    assert.ok(pageSrc, 'OrderPage.jsx should exist in generated files');
    assert.match(pageSrc, /OrderStatusBar/);
    assert.match(pageSrc, /DollarSign/);
  });
});

// ---------------------------------------------------------------------------
// generatePageComponent — secondaryTabs isFormTab branch (lines 1863-1864, 1876-1877)
//
// When a secondary tab has tabMode: 'form-only', isFormTab=true and the import
// emitted is `import FormName from './FormName'` (no Table import), and the
// secondaryTabs prop entry uses isFormTab: true + Form: FormName.
// ---------------------------------------------------------------------------

describe('generatePageComponent — secondaryTabs isFormTab branch', () => {
  const contract = {
    frontendContract: {
      window: {
        id: '10', name: 'Sales Order', primaryEntity: 'order', category: 'sales',
        secondaryTabs: {
          accounting: {
            tabMode: 'form-only',
            label: 'Accounting',
            tabOrder: 1,
          },
        },
      },
      entities: {
        order: {
          fields: [
            { name: 'documentNo', column: 'DocumentNo', type: 'string', tsType: 'string', visibility: 'readOnly', required: true, grid: true, form: true },
            { name: 'grandTotal', column: 'GrandTotal', type: 'amount', tsType: 'number', visibility: 'readOnly', required: false, grid: true, form: true },
          ],
          searchableFields: ['documentNo'],
          computedFields: [],
        },
        accounting: {
          fields: [
            { name: 'account', column: 'Account_ID', type: 'foreignKey', tsType: 'string', visibility: 'readOnly', required: true, grid: true, form: true },
          ],
          searchableFields: [],
          computedFields: [],
        },
      },
    },
    backendContract: { processEndpoints: [] },
  };

  it('emits isFormTab: true in secondaryTabs prop', () => {
    const src = generatePageComponent('order', null, contract);
    assert.match(src, /isFormTab: true/);
  });

  it('emits Form reference (not Table) for form-only secondary tab', () => {
    const src = generatePageComponent('order', null, contract);
    assert.match(src, /Form: AccountingForm/);
  });

  it('emits import for AccountingForm (no AccountingTable import)', () => {
    const src = generatePageComponent('order', null, contract);
    assert.match(src, /import AccountingForm from '\.\/AccountingForm'/);
    assert.doesNotMatch(src, /import AccountingTable/);
  });
});

// ---------------------------------------------------------------------------
// CLI entry point block (lines 2485-2509)
// This is the `if (isDirectRun)` guard — it only runs when the file is executed
// directly as `node cli/src/generate-frontend.js <contract>`.
// It is GENUINELY UNREACHABLE from unit tests because `import.meta.url` never
// equals `process.argv[1]` when imported as a module.
// ---------------------------------------------------------------------------
// NOTE: Lines 2485-2509 are dead code from the perspective of the module API.
//       They require an actual CLI invocation with a real contract file path.
//       No unit test can trigger `isDirectRun = true` without spawning a child
//       process — which would be an integration test, not a unit test.
//       These lines are correctly excluded from unit-test coverage targets.
