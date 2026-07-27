import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const configUrl = new URL('../tailwind.config.js', import.meta.url);

describe('app-shell Tailwind configuration (ETP-4554)', () => {
  it('consumes the public core preset instead of duplicating its semantic palette', async () => {
    const config = await readFile(configUrl, 'utf8');

    assert.match(config, /import\s+appShellCorePreset\s+from\s+['"]@etendosoftware\/app-shell-core\/tailwind-preset['"]/);
    assert.match(config, /presets:\s*\[appShellCorePreset\]/);
    assert.doesNotMatch(config, /extend:\s*\{\s*colors:/);
    assert.doesNotMatch(config, /'text-secondary':\s*'hsl\(var\(--text-secondary\)\)'/);
  });
});
