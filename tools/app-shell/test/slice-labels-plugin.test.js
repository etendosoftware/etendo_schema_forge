import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import sliceLabelsPlugin from '../vite-plugins/slice-labels.js';

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

  it('is a fresh object per invocation (no shared mutable state)', () => {
    assert.notEqual(sliceLabelsPlugin(), sliceLabelsPlugin());
  });

  it('uses the configured local core checkout in LOCAL_CORE mode', async () => {
    const source = await readFile(new URL('../vite-plugins/slice-labels.js', import.meta.url), 'utf8');
    assert.match(source, /process\.env\.SCHEMA_FORGE_CORE/);
  });
});
