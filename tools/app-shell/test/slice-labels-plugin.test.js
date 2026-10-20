import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import sliceLabelsPlugin, { sliceAllLabels } from '../vite-plugins/slice-labels.js';

// ETP-4300: the plugin is a thin adapter — it wires the pure `sliceAll()` slicer
// into Vite's `buildStart`. These smoke tests assert the plugin contract without
// invoking `buildStart` (which performs real IO over the committed dictionaries).
describe('sliceLabelsPlugin', () => {
  it('returns a Vite plugin object with the expected name', () => {
    const plugin = sliceLabelsPlugin();
    assert.equal(plugin.name, 'etp-4300-slice-labels');
  });

  it('exposes an async buildStart hook', () => {
    const plugin = sliceLabelsPlugin();
    assert.equal(typeof plugin.buildStart, 'function');
    assert.equal(plugin.buildStart.constructor.name, 'AsyncFunction');
  });

  // ETP-5695 — vitest imports the slices too, so its global setup runs the same slicer
  // instead of depending on an earlier `vite build` (pwa.test.js used to provide one in CI).
  it('exports the slicer that vitest\'s global setup runs before any test file', async () => {
    assert.equal(typeof sliceAllLabels, 'function');
    assert.equal(sliceAllLabels.constructor.name, 'AsyncFunction');
    const setup = await readFile(new URL('../src/test/global-setup.js', import.meta.url), 'utf8');
    assert.match(setup, /import \{ sliceAllLabels \} from '\.\.\/\.\.\/vite-plugins\/slice-labels\.js'/);
    const config = await readFile(new URL('../vitest.config.js', import.meta.url), 'utf8');
    assert.match(config, /globalSetup: \['\.\/src\/test\/global-setup\.js'\]/);
  });

  // ETP-4830 — buildStart alone only re-slices once, at dev-server boot. Editing a
  // top-level locale file (e.g. adding a new genericLabels key) while `make dev` is
  // already running never re-triggers it, so the derived core.<locale>.json stays
  // silently stale for the rest of that session. configureServer watches the locale
  // source files directly and re-slices on change instead.
  it('exposes a configureServer hook that watches the locale source files', () => {
    const plugin = sliceLabelsPlugin();
    assert.equal(typeof plugin.configureServer, 'function');

    const watched = [];
    const listeners = {};
    const fakeServer = {
      watcher: {
        add: (pattern) => watched.push(pattern),
        on: (event, cb) => { listeners[event] = cb; },
      },
      ws: { send: () => {} },
    };
    plugin.configureServer(fakeServer);

    assert.ok(watched.some((p) => p.endsWith('*.json')), 'should watch a *.json glob under the locales dir');
    assert.equal(typeof listeners.change, 'function');
  });

  it('is a fresh object per invocation (no shared mutable state)', () => {
    assert.notEqual(sliceLabelsPlugin(), sliceLabelsPlugin());
  });

  it('uses the configured local core checkout in LOCAL_CORE mode', async () => {
    const source = await readFile(new URL('../vite-plugins/slice-labels.js', import.meta.url), 'utf8');
    assert.match(source, /process\.env\.SCHEMA_FORGE_CORE/);
  });
});
