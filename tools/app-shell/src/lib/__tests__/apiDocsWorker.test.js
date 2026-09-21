import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const viteConfig = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../../vite.config.js'), 'utf8');

test('Workbox never serves the SPA fallback for API routes', () => {
  assert.match(viteConfig, /navigateFallbackDenylist/);
  assert.match(viteConfig, /\/\^\\\/api\(\?:\\\/\|\$\)\//);
});
