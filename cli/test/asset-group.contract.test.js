/**
 * Per-window structural tests for the asset-group generated frontend.
 *
 * What these tests cover (not duplicated by existing suite):
 *   - Named fields in AssetCategoryForm and AccountingForm match contract
 *     (wiring-completeness checks the COUNT; here we check the NAME SET)
 *   - AssetCategoryPage wires the correct specName, primaryEntity, and
 *     secondary tab key
 *   - index.jsx re-exports the page and threads the api object through
 *   - mockData.js exports both entity arrays with the expected field keys
 *   - mockCatalogs.js is not empty of the catalog export (even if empty obj)
 *
 * What is explicitly NOT tested here (already covered elsewhere):
 *   - contract.json validity        → cli/test/contract-all.test.js
 *   - mockData.js existence         → cli/test/wiring-completeness.test.js
 *   - index.jsx existence           → cli/test/wiring-completeness.test.js
 *   - registry + App.jsx wiring     → cli/test/wiring-completeness.test.js
 *   - form field count              → cli/test/wiring-completeness.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const GENERATED = resolve(ROOT, 'artifacts', 'asset-group', 'generated', 'web', 'asset-group');
const CONTRACT_PATH = resolve(ROOT, 'artifacts', 'asset-group', 'contract.json');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function src(filename) {
  return readFileSync(resolve(GENERATED, filename), 'utf-8');
}

function contractFormFieldNames(entityName) {
  const contract = JSON.parse(readFileSync(CONTRACT_PATH, 'utf-8'));
  return contract.frontendContract.entities[entityName].fields
    .filter(f => f.form === true && f.type !== 'button')
    .map(f => f.name);
}

function extractFormKeys(source) {
  return [...source.matchAll(/key:\s*'(\w+)'/g)].map(m => m[1]);
}

// ---------------------------------------------------------------------------
// AssetCategoryForm
// ---------------------------------------------------------------------------

describe('asset-group: AssetCategoryForm', () => {
  const formSrc = src('AssetCategoryForm.jsx');
  const contractFields = contractFormFieldNames('assetCategory');
  const formKeys = extractFormKeys(formSrc);

  it('delegates to EntityForm from @/components/contract-ui', () => {
    assert.match(formSrc, /import\s*\{[^}]*EntityForm[^}]*\}\s*from\s*'@\/components\/contract-ui'/);
  });

  it('exports a default function component named AssetCategoryForm', () => {
    assert.match(formSrc, /export default function AssetCategoryForm/);
  });

  it('contains all field keys declared in contract (form: true)', () => {
    const formKeySet = new Set(formKeys);
    const missing = contractFields.filter(f => !formKeySet.has(f));
    assert.deepEqual(missing, [], `AssetCategoryForm is missing contract fields: ${missing.join(', ')}`);
  });

  it('does not contain field keys absent from contract', () => {
    const contractSet = new Set(contractFields);
    const extra = formKeys.filter(f => !contractSet.has(f));
    assert.deepEqual(extra, [], `AssetCategoryForm has keys not in contract: ${extra.join(', ')}`);
  });

  it('includes displayLogic for depreciation-conditional fields', () => {
    assert.match(formSrc, /displayLogic/);
    assert.match(formSrc, /record\.depreciate/);
  });
});

// ---------------------------------------------------------------------------
// AccountingForm
// ---------------------------------------------------------------------------

describe('asset-group: AccountingForm', () => {
  const formSrc = src('AccountingForm.jsx');
  const contractFields = contractFormFieldNames('accounting');
  const formKeys = extractFormKeys(formSrc);

  it('delegates to EntityForm from @/components/contract-ui', () => {
    assert.match(formSrc, /import\s*\{[^}]*EntityForm[^}]*\}\s*from\s*'@\/components\/contract-ui'/);
  });

  it('exports a default function component named AccountingForm', () => {
    assert.match(formSrc, /export default function AccountingForm/);
  });

  it('contains all field keys declared in accounting contract (form: true)', () => {
    const formKeySet = new Set(formKeys);
    const missing = contractFields.filter(f => !formKeySet.has(f));
    assert.deepEqual(missing, [], `AccountingForm is missing contract fields: ${missing.join(', ')}`);
  });

  it('declares accumulatedDepreciation and depreciation as selector type', () => {
    assert.match(formSrc, /type:\s*'selector'/);
    assert.match(formSrc, /key:\s*'accumulatedDepreciation'/);
    assert.match(formSrc, /key:\s*'depreciation'/);
  });
});

// ---------------------------------------------------------------------------
// AssetCategoryPage — api object and structural wiring
// ---------------------------------------------------------------------------

describe('asset-group: AssetCategoryPage', () => {
  const pageSrc = src('AssetCategoryPage.jsx');

  it('exports a default function component named AssetCategoryPage', () => {
    assert.match(pageSrc, /export default function AssetCategoryPage/);
  });

  it('exports a named api object', () => {
    assert.match(pageSrc, /export const api\s*=/);
  });

  it('api.specName is "asset-group"', () => {
    assert.match(pageSrc, /"specName":\s*"asset-group"/);
  });

  it('api.baseUrl targets /sws/neo/asset-group', () => {
    assert.match(pageSrc, /"baseUrl":\s*"\/sws\/neo\/asset-group"/);
  });

  it('wires the accounting secondary tab', () => {
    assert.match(pageSrc, /key:\s*['"]accounting['"]/);
    assert.match(pageSrc, /AccountingTable/);
    assert.match(pageSrc, /AccountingForm/);
  });

  it('uses ListView for list view and DetailView for detail view', () => {
    assert.match(pageSrc, /ListView/);
    assert.match(pageSrc, /DetailView/);
  });

  it('passes requiredHeaderFields including mandatory assetCategory fields', () => {
    assert.match(pageSrc, /requiredHeaderFields/);
    assert.match(pageSrc, /'name'/);
    assert.match(pageSrc, /'depreciate'/);
  });

  it('passes hidePrint and noHeaderBorder as declared in contract', () => {
    assert.match(pageSrc, /hidePrint/);
    assert.match(pageSrc, /noHeaderBorder/);
  });
});

// ---------------------------------------------------------------------------
// index.jsx
// ---------------------------------------------------------------------------

describe('asset-group: index.jsx', () => {
  const indexSrc = src('index.jsx');

  it('re-exports AssetCategoryPage as default', () => {
    assert.match(indexSrc, /import AssetCategoryPage.*from\s*'\.\/AssetCategoryPage'/);
    assert.match(indexSrc, /export default function App/);
  });

  it('threads the api import through to the rendered component', () => {
    assert.match(indexSrc, /import AssetCategoryPage,\s*\{[^}]*api[^}]*\}/);
    assert.match(indexSrc, /api={api}/);
  });

  it('sets windowMeta with category "finance" and name "Asset Group"', () => {
    assert.match(indexSrc, /category:\s*['"]finance['"]/);
    assert.match(indexSrc, /name:\s*['"]Asset Group['"]/);
  });
});

// ---------------------------------------------------------------------------
// mockData.js
// ---------------------------------------------------------------------------

describe('asset-group: mockData.js', () => {
  const mockSrc = src('mockData.js');

  it('exports assetCategory array', () => {
    assert.match(mockSrc, /export const assetCategory\s*=/);
  });

  it('exports accounting array', () => {
    assert.match(mockSrc, /export const accounting\s*=/);
  });

  it('assetCategory mock records have the expected field keys', () => {
    assert.match(mockSrc, /"name":/);
    assert.match(mockSrc, /"depreciate":/);
    assert.match(mockSrc, /"depreciationType":/);
    assert.match(mockSrc, /"calculateType":/);
  });

  it('accounting mock records have the expected field keys', () => {
    assert.match(mockSrc, /"accumulatedDepreciation":/);
    assert.match(mockSrc, /"depreciation":/);
    assert.match(mockSrc, /"assetCategoryId":/);
  });
});

// ---------------------------------------------------------------------------
// mockCatalogs.js
// ---------------------------------------------------------------------------

describe('asset-group: mockCatalogs.js', () => {
  const catalogSrc = src('mockCatalogs.js');

  it('exports a catalogs constant as default', () => {
    assert.match(catalogSrc, /const catalogs\s*=/);
    assert.match(catalogSrc, /export default catalogs/);
  });
});
