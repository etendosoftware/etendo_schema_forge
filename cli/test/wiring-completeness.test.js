import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');
const ARTIFACTS = resolve(ROOT, 'artifacts');
const APP_SHELL = resolve(ROOT, 'tools', 'app-shell', 'src');

// --- Helpers ---

function readText(filePath) {
  return readFileSync(filePath, 'utf-8');
}

// --- Load data ---

const menu = JSON.parse(readText(resolve(APP_SHELL, 'menu.json')));
const registrySource = readText(resolve(APP_SHELL, 'windows', 'registry.js'));
const appSource = readText(resolve(APP_SHELL, 'App.jsx'));

// All menu items flat
const allMenuItems = menu.menu.flatMap(g => g.items.map(i => i.name));

// Overview/aggregate pages: have their own route + React component in App.jsx
// Entity windows: loaded dynamically via WindowLoader + registry
const SPECIAL_PAGES = new Set([
  'dashboard', 'sales', 'purchases', 'accounting', 'inventory', 'contacts',
  'crm', 'hr', 'projects', 'reports', 'onboarding', 'smart-scan', 'preview',
  'report-viewer-purchases', 'report-viewer-finance', 'report-viewer-inventory', 'oauth2-clients',
  'authorize', 'quick-sales-order', 'quick-purchase-order',
  'first-steps', 'analytics', 'app-store', 'financial-accounts',
  // Custom hand-written windows backed by real NEO endpoints. financial-account
  // carries a contract.json for grid column config but has no generated page/mockData
  // (see GENERATED_OUTPUT_EXEMPT below).
  'financial-account',
  // Fully custom window with no AD backing — React lives under
  // tools/app-shell/src/windows/custom/not-posted-documents/; no generated mockData.
  'not-posted-documents',
]);

const entityWindows = allMenuItems.filter(name => !SPECIAL_PAGES.has(name));

// Artifact directories
const artifactDirs = readdirSync(ARTIFACTS, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name);

const entityArtifacts = artifactDirs.filter(d =>
  !d.includes('__test') && !d.startsWith('.') && existsSync(resolve(ARTIFACTS, d, 'contract.json'))
);

// list-modal windows render via the generic <ListModalWindow>, which fetches real
// NEO data and is self-contained (the generator emits only the Page + index +
// mockCatalogs, no mockData / Table / Form). They need no mockData.js, mirroring
// hand-written custom windows like financial-account.
function getLayoutType(entity) {
  try {
    const contract = JSON.parse(readText(resolve(ARTIFACTS, entity, 'contract.json')));
    return contract.frontendContract?.window?.layoutType ?? 'default';
  } catch {
    return 'default';
  }
}
const listModalArtifacts = new Set(entityArtifacts.filter(e => getLayoutType(e) === 'list-modal'));

// Artifacts that carry a contract.json but emit no generated frontend, so they are
// exempt from the generated-output checks below (their contract is still validated by
// the contract test suite):
//   - financial-account: a custom hand-written window whose React lives under
//     tools/app-shell/src/windows/custom/; the contract only feeds grid column metadata.
//   - transaction-type: a backend-only lookup (W spec for selector + inline create,
//     no AD menu, no route, no React) — see BACKEND_ONLY_ARTIFACTS in validate-pipeline.
const GENERATED_OUTPUT_EXEMPT = new Set(['financial-account', 'transaction-type']);
const generatedEntityArtifacts = entityArtifacts.filter(e => !GENERATED_OUTPUT_EXEMPT.has(e));

const aggregateArtifacts = artifactDirs.filter(d =>
  !d.includes('__test') && !d.startsWith('.') && existsSync(resolve(ARTIFACTS, d, 'aggregate-contract.json'))
);

// Build child entity set: entities that are detail/children of a master-detail contract
// These should NEVER appear as standalone menu items
const childEntities = new Set();
const childToParent = {};
for (const entity of entityArtifacts) {
  const contract = JSON.parse(readText(resolve(ARTIFACTS, entity, 'contract.json')));
  const entities = Object.keys(contract.frontendContract.entities);
  const primary = contract.frontendContract.window.primaryEntity;
  for (const e of entities) {
    if (e !== primary) {
      childEntities.add(e);
      childToParent[e] = { parent: entity, primaryEntity: primary };
    }
  }
}

// Map camelCase entity names to kebab-case slugs for menu matching
function camelToKebab(str) {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

// --- Tests ---

describe('Wiring completeness', () => {

  describe('Every entity artifact has mockData.js', () => {
    for (const entity of generatedEntityArtifacts) {
      if (listModalArtifacts.has(entity)) continue; // list-modal windows are self-contained (no mockData)
      it(`${entity} should have mockData.js`, () => {
        const generatedPath = resolve(ARTIFACTS, entity, 'generated', 'web', entity, 'mockData.js');
        const customPath = resolve(ARTIFACTS, entity, 'custom', 'mockData.js');
        assert.ok(
          existsSync(generatedPath) || existsSync(customPath),
          `Missing: artifacts/${entity}/generated/web/${entity}/mockData.js or artifacts/${entity}/custom/mockData.js`
        );
      });
    }
  });

  describe('Every aggregate artifact has generated mockData.js', () => {
    for (const agg of aggregateArtifacts) {
      it(`${agg} should have generated/mockData.js`, () => {
        const mockPath = resolve(ARTIFACTS, agg, 'generated', 'mockData.js');
        assert.ok(
          existsSync(mockPath),
          `Missing: artifacts/${agg}/generated/mockData.js`
        );
      });
    }
  });

  describe('Every entity window in menu.json has a loader in registry.js', () => {
    for (const win of entityWindows) {
      it(`${win} should be registered in windowLoaders`, () => {
        const pattern = `'${win}'`;
        assert.ok(
          registrySource.includes(pattern),
          `Window '${win}' is in menu.json but NOT in registry.js windowLoaders`
        );
      });
    }
  });

  describe('Every entity window in menu.json has mockData in App.jsx loadAllMockData', () => {
    for (const win of entityWindows) {
      if (listModalArtifacts.has(win)) continue; // list-modal windows fetch real NEO data — no generated mockData
      it(`${win} mockData should be imported in App.jsx`, () => {
        const pattern = `/${win}/`;
        assert.ok(
          appSource.includes(pattern),
          `Window '${win}' mockData is NOT imported in App.jsx loadAllMockData`
        );
      });
    }
  });

  describe('Every entity artifact has generated frontend components', () => {
    for (const entity of generatedEntityArtifacts) {
      it(`${entity} should have generated index.jsx`, () => {
        const indexPath = resolve(ARTIFACTS, entity, 'generated', 'web', entity, 'index.jsx');
        assert.ok(
          existsSync(indexPath),
          `Missing: artifacts/${entity}/generated/web/${entity}/index.jsx`
        );
      });
    }
  });

  describe('Every aggregate artifact has generated config.js', () => {
    for (const agg of aggregateArtifacts) {
      it(`${agg} should have generated/config.js`, () => {
        const configPath = resolve(ARTIFACTS, agg, 'generated', 'config.js');
        assert.ok(
          existsSync(configPath),
          `Missing: artifacts/${agg}/generated/config.js`
        );
      });
    }
  });

  describe('Child entities must NOT appear as standalone menu items', () => {
    for (const [childName, info] of Object.entries(childToParent)) {
      const slug = camelToKebab(childName);
      // If the slug matches a menu item that has its own independent artifact
      // (its own contract.json), it's a different window that happens to share
      // the name — not a real collision. Skip it.
      const hasOwnArtifact = existsSync(resolve(ARTIFACTS, slug, 'contract.json'));
      if (hasOwnArtifact && slug !== info.parent) continue;

      it(`${childName} (child of ${info.parent}) should not be a menu item`, () => {
        assert.ok(
          !allMenuItems.includes(slug),
          `Child entity '${childName}' (slug: '${slug}') is a detail of '${info.parent}' but appears as a standalone menu item. ` +
          `It should only be accessible as a tab/detail within its parent window.`
        );
      });
    }
  });

  describe('Form fields match contract (form: true fields)', () => {
    for (const entity of entityArtifacts) {
      const contract = JSON.parse(readText(resolve(ARTIFACTS, entity, 'contract.json')));
      const primary = contract.frontendContract.window.primaryEntity;
      const fields = contract.frontendContract.entities[primary].fields;
      const contractFormFields = new Set(fields.filter(f => f.form && f.type !== 'button').map(f => f.name));

      const cap = primary[0].toUpperCase() + primary.slice(1);
      const formPath = resolve(ARTIFACTS, entity, 'generated', 'web', entity, `${cap}Form.jsx`);
      if (!existsSync(formPath)) continue;

      const formSource = readText(formPath);
      const jsxFields = new Set([...formSource.matchAll(/key:\s*'(\w+)'/g)].map(m => m[1]));

      const extra = [...jsxFields].filter(f => !contractFormFields.has(f));
      const missing = [...contractFormFields].filter(f => !jsxFields.has(f));

      if (extra.length > 0) {
        it(`${entity}: Form should not have extra fields beyond contract`, () => {
          assert.deepEqual(extra, [],
            `${entity} Form has fields not in contract (form: true): ${extra.join(', ')}`);
        });
      }
      if (missing.length > 0) {
        it(`${entity}: Form should not be missing contract fields`, () => {
          assert.deepEqual(missing, [],
            `${entity} Form is missing contract fields (form: true): ${missing.join(', ')}`);
        });
      }
      it(`${entity}: Form field count should match contract`, () => {
        assert.equal(jsxFields.size, contractFormFields.size,
          `${entity} Form has ${jsxFields.size} fields but contract has ${contractFormFields.size}`);
      });
    }
  });

  // Orphan windows (in registry but not in menu) are allowed — a window can
  // be registered before its menu entry is created, so this is not an error.
});
