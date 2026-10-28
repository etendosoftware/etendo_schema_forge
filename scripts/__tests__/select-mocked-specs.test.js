// @covers scripts/select-mocked-specs.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  main,
  parseAlwaysRun,
  parseMap,
  planLines,
  resolveMap,
  selectMockedSpecs,
  shortPath,
  summary,
} from '../select-mocked-specs.js';

const SPEC_A = 'e2e/tests/flows/sales/orders.mocked.spec.js';
const SPEC_B = 'e2e/tests/flows/sales/invoices.mocked.spec.js';
const SPEC_C = 'e2e/tests/flows/platform/multi-tab.mocked.spec.js';
const INTEGRATION = 'e2e/tests/flows/sales/orders.spec.js';

/** An app and its specs: ListView executed by A and B, DetailView by B, App.jsx by all three. */
const TREE = {
  'tools/app-shell/src/App.jsx': "import ListView from './components/ListView.jsx';",
  'tools/app-shell/src/components/ListView.jsx': "import { tabs } from './SegmentedTabs.jsx';",
  'tools/app-shell/src/components/SegmentedTabs.jsx': "import { classes } from './toolbarClasses.js';",
  'tools/app-shell/src/components/toolbarClasses.js': 'export const classes = {};',
  'tools/app-shell/src/components/DetailView.jsx': "import { classes } from './toolbarClasses.js';",
  'tools/app-shell/src/lib/registry.js': 'export const registry = {};',
  'tools/app-shell/src/components/__tests__/ListView.test.js': "import ListView from '../ListView.jsx';",
  'artifacts/orders/generated/OrdersWindow.jsx': "import contract from '../contract.json';",
  'artifacts/orders/contract.json': '{}',
  'artifacts/orders/decisions.json': '{}',
  'artifacts/quotes/generated/QuotesWindow.jsx': "import contract from '../contract.json';",
  'artifacts/quotes/contract.json': '{}',
  'tools/app-shell/src/windowLoaders.js': "const all = import.meta.glob('@generated/*/contract.json');",
  'e2e/tests/helpers/test.js': "export * from '@playwright/test';",
  'e2e/tests/helpers/auth.js': 'export const login = () => {};',
  'e2e/tests/helpers/orders-helpers.js': "import { login } from './auth.js';",
  'e2e/tests/helpers/integration-only.js': 'export const x = 1;',
  'e2e/tests/helpers/unused.js': 'export const y = 1;',
  'e2e/tests/fixtures/orders.csv': 'id\n1',
  [SPEC_A]: "import { test } from '../../helpers/test.js';\nimport { open } from '../../helpers/orders-helpers.js';\nconst csv = readFileSync(new URL('../../fixtures/orders.csv', import.meta.url));",
  [SPEC_B]: "// @covers tools/app-shell/src/lib/registry.js\nimport { test } from '../../helpers/test.js';\nimport { login } from '../../helpers/auth.js';",
  [SPEC_C]: "import { test } from '../../helpers/test.js';",
  [INTEGRATION]: "import { x } from '../../helpers/integration-only.js';",
  'docs/testing.md': '# docs',
  'cli/generate.js': 'export {};',
};

const MAP = {
  commit: '0123456789abcdef',
  specs: [SPEC_A, SPEC_B, SPEC_C],
  files: {
    'tools/app-shell/src/App.jsx': [SPEC_A, SPEC_B, SPEC_C],
    'tools/app-shell/src/windowLoaders.js': [SPEC_A, SPEC_B, SPEC_C],
    'tools/app-shell/src/components/ListView.jsx': [SPEC_A, SPEC_B],
    'tools/app-shell/src/components/DetailView.jsx': [SPEC_B],
    'artifacts/orders/generated/OrdersWindow.jsx': [SPEC_A],
  },
};

function select(changed, { tree = TREE, base = {}, map = MAP, alwaysRun = [] } = {}) {
  return selectMockedSpecs({
    changed, files: Object.keys(tree), readText: (rel) => tree[rel] ?? null, readBaseText: (rel) => base[rel] ?? null, map, alwaysRun,
  });
}

const specs = (selection) => [...selection.specs].sort();

describe('selectMockedSpecs: the map', () => {
  it('runs the specs that executed a changed file', () => {
    const selection = select(['tools/app-shell/src/components/DetailView.jsx']);
    assert.equal(selection.whole, false);
    assert.deepEqual(specs(selection), [SPEC_B]);
    assert.deepEqual(selection.reasons, ['@/components/DetailView.jsx → 1 spec']);
  });

  it('resolves a file the map lacks through its nearest mapped importers, and says which', () => {
    const selection = select(['tools/app-shell/src/components/SegmentedTabs.jsx']);
    assert.deepEqual(specs(selection), [SPEC_B, SPEC_A].sort());
    assert.deepEqual(selection.reasons, ['@/components/SegmentedTabs.jsx → not in the map, imported by @/components/ListView.jsx → 2 specs']);
  });

  it('climbs through unmapped files and stops at the first mapped one on each path, never above', () => {
    // toolbarClasses ← SegmentedTabs (unmapped) ← ListView; toolbarClasses ← DetailView. App.jsx is not reached.
    const selection = select(['tools/app-shell/src/components/toolbarClasses.js']);
    assert.deepEqual(specs(selection), [SPEC_A, SPEC_B].sort());
    assert.match(selection.reasons[0], /imported by @\/components\/DetailView\.jsx, @\/components\/ListView\.jsx → 2 specs$/);
  });

  it('runs the specs that declare @covers a file nothing mapped imports', () => {
    const selection = select(['tools/app-shell/src/lib/registry.js']);
    assert.equal(selection.whole, false);
    assert.deepEqual(specs(selection), [SPEC_B]);
    assert.deepEqual(selection.reasons, ['@/lib/registry.js → not in the map, used by tests/flows/sales/invoices.mocked.spec.js → 1 spec']);
  });

  it('adds the @covers specs to the ones the map gives', () => {
    const tree = { ...TREE, [SPEC_C]: `// @covers tools/app-shell/src/components/DetailView.jsx\n${TREE[SPEC_C]}` };
    assert.deepEqual(specs(select(['tools/app-shell/src/components/DetailView.jsx'], { tree })), [SPEC_B, SPEC_C].sort());
  });

  it('runs the whole suite when app code reaches nothing mapped (a dynamic import, a registry)', () => {
    const selection = select(['tools/app-shell/src/lib/registry.js'], { tree: { ...TREE, [SPEC_B]: '' } });
    assert.equal(selection.whole, true);
    assert.deepEqual(specs(selection), [SPEC_A, SPEC_B, SPEC_C].sort());
    assert.deepEqual(selection.reasons, ['@/lib/registry.js → not in the map and reaches nothing mapped']);
    assert.deepEqual(planLines(selection), ['*']);
  });

  it('runs the specs of a removed mapped file, and nothing for a removed file nothing imports', () => {
    const tree = { ...TREE, [SPEC_B]: TREE[SPEC_B].replace(/^\/\/ @covers .+\n/, '') };
    delete tree['tools/app-shell/src/components/DetailView.jsx'];
    delete tree['tools/app-shell/src/lib/registry.js'];
    const selection = select(['tools/app-shell/src/components/DetailView.jsx', 'tools/app-shell/src/lib/registry.js'], { tree });
    assert.equal(selection.whole, false);
    assert.deepEqual(specs(selection), [SPEC_B]);
    assert.deepEqual(selection.reasons, [
      '@/components/DetailView.jsx → removed → 1 spec',
      '@/lib/registry.js → removed, nothing imports it anymore',
    ]);
  });

  it('drops specs the map names but that no longer exist', () => {
    const tree = { ...TREE };
    delete tree[SPEC_A];
    assert.deepEqual(specs(select(['tools/app-shell/src/components/ListView.jsx'], { tree })), [SPEC_B]);
  });
});

describe('selectMockedSpecs: windows', () => {
  it('runs the specs that executed a window file, or a mapped file of the same window', () => {
    assert.deepEqual(specs(select(['artifacts/orders/generated/OrdersWindow.jsx'])), [SPEC_A]);
    assert.deepEqual(specs(select(['artifacts/orders/contract.json'])), [SPEC_A]);
  });

  it('does not leave the window through an app-wide glob, and adds nothing when no spec opens it', () => {
    // quotes/contract.json is also globbed by windowLoaders.js, which every spec executes.
    const selection = select(['artifacts/quotes/contract.json']);
    assert.equal(selection.whole, false);
    assert.deepEqual(specs(selection), []);
    assert.deepEqual(selection.reasons, ['@generated/quotes/contract.json → no mocked spec executes this window']);
  });
});

describe('selectMockedSpecs: e2e files', () => {
  it('runs a changed spec, and nothing for a removed one', () => {
    assert.deepEqual(specs(select([SPEC_C])), [SPEC_C]);
    const tree = { ...TREE };
    delete tree[SPEC_C];
    assert.deepEqual(specs(select([SPEC_C], { tree })), []);
  });

  it('runs the spec whose screenshot baselines changed', () => {
    assert.deepEqual(specs(select([`${SPEC_C}-snapshots/tab-chromium-darwin.png`])), [SPEC_C]);
  });

  it('runs the specs that import a helper, directly or through another helper', () => {
    const selection = select(['e2e/tests/helpers/auth.js']);
    assert.deepEqual(specs(selection), [SPEC_A, SPEC_B].sort());
    assert.match(selection.reasons[0], /^e2e\/tests\/helpers\/auth\.js → not in the map, used by .+ → 2 specs$/);
  });

  it('runs the spec that reads a fixture', () => {
    assert.deepEqual(specs(select(['e2e/tests/fixtures/orders.csv'])), [SPEC_A]);
  });

  it('leaves out a helper only integration specs use, and runs everything for one nothing uses', () => {
    const onlyIntegration = select(['e2e/tests/helpers/integration-only.js']);
    assert.equal(onlyIntegration.whole, false);
    assert.deepEqual(onlyIntegration.ignored, ['e2e/tests/helpers/integration-only.js']);
    assert.equal(select(['e2e/tests/helpers/unused.js']).whole, true);
  });

  it('runs everything when the fixture changes, since every spec imports it', () => {
    assert.deepEqual(specs(select(['e2e/tests/helpers/test.js'])), [SPEC_A, SPEC_B, SPEC_C].sort());
  });
});

describe('selectMockedSpecs: what it cannot narrow and what it leaves out', () => {
  for (const file of ['package-lock.json', 'package.json', 'e2e/playwright.config.js', 'e2e/package.json',
    'e2e/quarantine.json', 'tools/app-shell/vite.config.js', 'tools/app-shell/package-lock.json', 'tools/app-shell/index.html']) {
    it(`runs the whole suite for ${file}`, () => {
      const selection = select([file, 'tools/app-shell/src/components/DetailView.jsx']);
      assert.equal(selection.whole, true);
      assert.deepEqual(selection.reasons, [`${file} → changes how every spec runs`]);
    });
  }

  it('leaves out unit tests, integration specs, docs and code outside the mocked run', () => {
    const selection = select(['tools/app-shell/src/components/__tests__/ListView.test.js', INTEGRATION,
      'docs/testing.md', 'cli/generate.js', 'e2e/mocked-always-run.json']);
    assert.equal(selection.whole, false);
    assert.deepEqual(specs(selection), []);
    assert.deepEqual(selection.ignored, ['tools/app-shell/src/components/__tests__/ListView.test.js', INTEGRATION, 'cli/generate.js']);
  });
});

describe('selectMockedSpecs: locale files', () => {
  const LOCALE = 'tools/app-shell/src/locales/es_ES.json';
  const before = JSON.stringify({ genericLabels: { save: 'Guardar', cancel: 'Cancelar' }, fields: { orders: { date: 'Fecha' } } });
  const after = (labels) => ({ ...TREE, [LOCALE]: JSON.stringify(labels) });

  it('adds nothing for a locale file that only adds keys, and says so', () => {
    const tree = after({ genericLabels: { save: 'Guardar', cancel: 'Cancelar', retry: 'Reintentar' }, fields: { orders: { date: 'Fecha', total: 'Total' } } });
    const selection = select([LOCALE, 'tools/app-shell/src/components/DetailView.jsx'], { tree, base: { [LOCALE]: before } });
    assert.equal(selection.whole, false);
    assert.deepEqual(specs(selection), [SPEC_B]);
    assert.deepEqual(selection.reasons[0], '@/locales/es_ES.json → only adds keys: nothing to run for them');
  });

  it('runs the whole suite when a key changes or goes, naming the keys', () => {
    const changedText = select([LOCALE], { tree: after({ genericLabels: { save: 'Guardar cambios', cancel: 'Cancelar' }, fields: { orders: { date: 'Fecha' } } }), base: { [LOCALE]: before } });
    assert.equal(changedText.whole, true);
    assert.deepEqual(changedText.reasons, ['@/locales/es_ES.json → changes or removes 1 key(s), which code reads by name (genericLabels.save)']);
    const removed = select([LOCALE], { tree: after({ genericLabels: {} }), base: { [LOCALE]: before } });
    assert.match(removed.reasons[0], /changes or removes 3 key\(s\), which code reads by name \(genericLabels\.save, genericLabels\.cancel, fields\.orders\.date\)$/);
  });

  it('treats a new locale file as only adding keys, and a removed or broken one as the whole suite', () => {
    assert.equal(select([LOCALE], { tree: after({ genericLabels: { save: 'Guardar' } }) }).whole, false);
    assert.deepEqual(select([LOCALE], { base: { [LOCALE]: before } }).reasons, ['@/locales/es_ES.json → removed']);
    assert.match(select([LOCALE], { tree: { ...TREE, [LOCALE]: '{ broken' }, base: { [LOCALE]: before } }).reasons[0], /not valid JSON/);
  });
});

describe('selectMockedSpecs: specs the map cannot judge', () => {
  const SPEC_NEW = 'e2e/tests/flows/sales/new.mocked.spec.js';
  const tree = { ...TREE, [SPEC_NEW]: "import { test } from '../../helpers/test.js';" };

  it('adds the always-run specs and the specs newer than the map when app code changes', () => {
    const selection = select(['tools/app-shell/src/components/DetailView.jsx'], { tree, alwaysRun: [SPEC_C] });
    assert.deepEqual(specs(selection), [SPEC_B, SPEC_C, SPEC_NEW].sort());
    assert.deepEqual(selection.reasons.slice(1), [
      'always run (e2e/mocked-always-run.json): tests/flows/platform/multi-tab.mocked.spec.js',
      'newer than the map: tests/flows/sales/new.mocked.spec.js',
    ]);
  });

  it('adds neither when only e2e files change: their imports are exact', () => {
    assert.deepEqual(specs(select(['e2e/tests/helpers/orders-helpers.js'], { tree, alwaysRun: [SPEC_C] })), [SPEC_A]);
  });

  it('adds the specs the map has only partial coverage of when app code changes, and not otherwise', () => {
    const map = { ...MAP, partial: [SPEC_C] };
    const app = select(['tools/app-shell/src/components/DetailView.jsx'], { map });
    assert.deepEqual(specs(app), [SPEC_B, SPEC_C].sort());
    assert.deepEqual(app.reasons.at(-1), 'partial coverage in the map (a test did not pass when it was built): tests/flows/platform/multi-tab.mocked.spec.js');
    assert.deepEqual(specs(select(['e2e/tests/helpers/orders-helpers.js'], { map })), [SPEC_A]);
  });
});

describe('output', () => {
  it('writes one spec per line relative to e2e/, or * for the whole suite', () => {
    assert.deepEqual(planLines(select(['tools/app-shell/src/components/ListView.jsx'])),
      ['tests/flows/sales/invoices.mocked.spec.js', 'tests/flows/sales/orders.mocked.spec.js']);
  });

  it('prints the count, the map commit and every reason', () => {
    assert.deepEqual(summary(select(['tools/app-shell/src/components/ListView.jsx', 'cli/generate.js'])), [
      'select-mocked-specs: 2/3 mocked specs (map of 012345678)',
      '  @/components/ListView.jsx → 2 specs',
      '  left out: 1 file(s) outside the mocked run',
    ]);
    assert.equal(summary(select(['package-lock.json']))[0], 'select-mocked-specs: the whole suite, 3 specs (map of 012345678)');
  });

  it('shortens app and window paths to their aliases and specs to e2e-relative paths', () => {
    assert.equal(shortPath('tools/app-shell/src/a/B.jsx'), '@/a/B.jsx');
    assert.equal(shortPath('artifacts/orders/contract.json'), '@generated/orders/contract.json');
    assert.equal(shortPath(SPEC_A), 'tests/flows/sales/orders.mocked.spec.js');
    assert.equal(shortPath('e2e/tests/helpers/auth.js'), 'e2e/tests/helpers/auth.js');
  });
});

describe('main', () => {
  it('decides the whole suite when the map is missing or broken, never fewer specs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'select-mocked-'));
    try {
      const out = join(dir, 'plan.txt');
      const broken = join(dir, 'map.json');
      writeFileSync(broken, '{"specs": []}');
      for (const map of [join(dir, 'missing.json'), broken]) {
        rmSync(out, { force: true });
        const logs = [];
        const log = console.log;
        console.log = (line) => logs.push(line);
        try {
          assert.equal(main(['--map', map, '--base', 'origin/develop', '--out', out]), 0);
        } finally {
          console.log = log;
        }
        assert.equal(readFileSync(out, 'utf8'), '*\n');
        assert.match(logs[0], /^select-mocked-specs: the whole suite \(map unusable: /);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('exits 2 without --base', () => {
    const error = console.error;
    console.error = () => {};
    try {
      assert.equal(main(['--map', 'map.json']), 2);
    } finally {
      console.error = error;
    }
  });
});

describe('resolveMap', () => {
  it('uses --map as given, without looking for one', () => {
    const find = () => assert.fail('must not look for a map');
    assert.deepEqual(resolveMap({ mapArg: 'local.json', find }), { path: 'local.json', label: 'local.json' });
  });

  it('labels the map it found with its develop commit, how far back it is and where it came from', () => {
    const find = ({ developRef }) => ({ path: '/c/abc/map.json', sha: '0123456789abcdef', distance: 3, source: 'kept', note: `n ${developRef}` });
    assert.deepEqual(resolveMap({ developRef: 'origin/develop', find }), {
      path: '/c/abc/map.json',
      label: 'develop 012345678, 3 merge(s) before where this branch left develop, kept',
      note: 'n origin/develop',
    });
    const latest = resolveMap({ find: () => ({ path: 'p', sha: 'fedcba9876543210', distance: 0, source: 'downloaded' }) });
    assert.equal(latest.label, 'develop fedcba987, where this branch left develop, downloaded');
  });

  it('passes the lookup error through, so main runs the whole suite', () => {
    assert.deepEqual(resolveMap({ find: () => ({ error: 'no map' }) }), { error: 'no map' });
  });
});

describe('inputs', () => {
  it('rejects a map without specs or files, and one that is not JSON', () => {
    assert.ok(parseMap('{"specs": []}') instanceof Error);
    assert.ok(parseMap('nope') instanceof Error);
    assert.deepEqual(parseMap(JSON.stringify(MAP)).specs, MAP.specs);
  });

  it('reads the always-run list as repo paths, and treats a missing or broken one as empty', () => {
    assert.deepEqual(parseAlwaysRun('{"specs": [{"file": "tests/flows/a.mocked.spec.js", "reason": "r"}]}'), ['e2e/tests/flows/a.mocked.spec.js']);
    assert.deepEqual(parseAlwaysRun(null), []);
    assert.deepEqual(parseAlwaysRun('{'), []);
  });
});
