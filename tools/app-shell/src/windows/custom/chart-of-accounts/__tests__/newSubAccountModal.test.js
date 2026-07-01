import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const treeSrc = readFileSync(join(__dirname, '..', 'AccountTreeView.jsx'), 'utf8');
const modalSrc = readFileSync(join(__dirname, '..', 'NewAccountModal.jsx'), 'utf8');
const generatorSrc = readFileSync(join(__dirname, '..', '..', '..', '..', '..', '..', '..', 'cli', 'src', 'generate-frontend.js'), 'utf8');
const decisions = JSON.parse(readFileSync(join(__dirname, '..', '..', '..', '..', '..', '..', '..', 'artifacts', 'chart-of-accounts', 'decisions.json'), 'utf8'));

describe('ChartOfAccounts new sub-account modal source wiring', () => {
  it('keeps the New Sub-account toolbar button always enabled', () => {
    assert.doesNotMatch(treeSrc, /disabled=\{!selectedId\}/);
  });

  it('allows virtual branch rows to become the selected currentRecord', () => {
    assert.match(treeSrc, /const\s+selectedRecord\s*=\s*useMemo\s*\(/);
    assert.match(treeSrc, /visibleRows\.find\(\s*\([^)]*\)\s*=>\s*[^)]*\.id\s*===\s*selectedId\s*\)/s);
    assert.doesNotMatch(treeSrc, /indexById\.get\(selectedId\)/);
  });

  it('defines stable tree columns and forwards them through onColumnsReady', () => {
    assert.match(treeSrc, /function\s+buildTreeColumns\(ui\)/);
    assert.match(treeSrc, /const\s+treeColumns\s*=\s*useMemo\s*\(\s*\(\)\s*=>\s*buildTreeColumns\(ui\)/s);
    assert.match(treeSrc, /onColumnsReady\?\.\(treeColumns\)/);
    assert.doesNotMatch(treeSrc, /onColumnsReady:\s*_onColumnsReady/);
    assert.doesNotMatch(treeSrc, /\bonColumnsReady\s*:\s*_/);
    assert.doesNotMatch(treeSrc, /\bonColumnsReady\s*\(\s*_/);
  });

  it('limits advanced-filter columns to supported code-first CoA fields and localized labels', () => {
    assert.match(treeSrc, /column:\s*'accountTreeFilterCode'/);
    assert.match(treeSrc, /column:\s*'accountTreeFilterName'/);
    assert.match(treeSrc, /column:\s*'accountTreeFilterType'/);
    assert.match(treeSrc, /column:\s*'accountTreeFilterActive'/);
    assert.match(treeSrc, /filterable:\s*false/);
    assert.match(treeSrc, /backendSortKey:\s*'searchKey'/);
    assert.match(treeSrc, /enumLabels:\s*\{/);
    assert.match(treeSrc, /badgeLabels:\s*\{/);
  });

  it('adds 4-digit virtual summary rows to the modal parent options', () => {
    assert.match(modalSrc, /const\s+virtualParentOptions\s*=\s*useMemo\s*\(/);
    assert.match(modalSrc, /parentCode4/);
    assert.match(modalSrc, /isVirtual:\s*true/);
    assert.match(modalSrc, /const\s+parentOptions\s*=\s*useMemo\s*\(\s*\(\)\s*=>\s*\[\s*\.\.\.summaryParentOptions,\s*\.\.\.virtualParentOptions\s*\]/s);
  });

  it('derives the default parent from parentOptions so leaf rows can select virtual parents', () => {
    assert.match(modalSrc, /function\s+deriveDefaultParentId\(currentRecord,\s*parentOptions\)/);
    assert.match(modalSrc, /parentOptions\.find\(/);
    assert.match(modalSrc, /deriveDefaultParentId\(currentRecord,\s*parentOptions\)/);
    assert.doesNotMatch(modalSrc, /deriveDefaultParentId\(currentRecord,\s*allAccounts\)/);
  });

  it('passes the typed account code value and stable selected-parent prefix to AccountCodeField', () => {
    assert.match(modalSrc, /value=\{form\.searchKey\}/);
    assert.match(modalSrc, /const\s+selectedParentCodePrefix\s*=\s*useMemo\s*\(/);
    assert.match(modalSrc, /codePrefix:\s*selectedParentCodePrefix/);
    assert.doesNotMatch(modalSrc, /codePrefix:\s*parent\s*\?\s*String\(parent\.searchKey\)\s*:\s*''/);
  });

  it('declares the newSubAccount menu action as a NewAccountModal component action', () => {
    const action = decisions.window.menuActions.find((item) => item.key === 'newSubAccount');

    assert.equal(action?.component, 'NewAccountModal');
  });

  it('generates component-backed detail menu actions with state, opener, context, and modal rendering', () => {
    assert.match(generatorSrc, /menuActionsConfig\.filter\(a\s*=>\s*a\.component\)/);
    assert.match(generatorSrc, /import \$\{action\.component\} from \$\{resolveCustomImport\(specName, action\.component\)\};/);
    assert.match(generatorSrc, /const \[show\$\{name\}MenuModal, set\$\{name\}MenuModal\] = useState\(false\);/);
    assert.match(generatorSrc, /const \[\$\{camelKey\}MenuContext, set\$\{name\}MenuContext\] = useState\(null\);/);
    assert.match(generatorSrc, /onClick: \(\) => \{ \$\{contextSetter\}\(data \?\? null\); \$\{stateSetter\}\(true\); \},/);
    assert.match(generatorSrc, /\{show\$\{name\}MenuModal && <\$\{a\.component\} isOpen=\{show\$\{name\}MenuModal\} token=\{props\.token\} apiBaseUrl=\{api\.baseUrl\} currentRecord=\{\$\{camelKey\}MenuContext\}/);
  });

  it('fetches elementValue rows when opened without preloaded accounts', () => {
    assert.match(modalSrc, /const\s+\[loadedAccounts,\s*setLoadedAccounts\]\s*=\s*useState\(\[\]\)/);
    assert.match(modalSrc, /const\s+accountRows\s*=\s*allAccounts\.length\s*>\s*0\s*\?\s*allAccounts\s*:\s*loadedAccounts/);
    assert.match(modalSrc, /if \(!isOpen \|\| allAccounts\.length > 0 \|\| loadedAccounts\.length > 0 \|\| !apiBaseUrl\) return;/);
    assert.match(modalSrc, /fetch\(`\$\{apiBaseUrl\}\/elementValue\?_startRow=0&_endRow=9999`,/);
    assert.match(modalSrc, /setLoadedAccounts\(data\?\.response\?\.data \?\? \[\]\)/);
  });
});
