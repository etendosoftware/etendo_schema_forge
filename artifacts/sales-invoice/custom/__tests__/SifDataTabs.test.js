import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'SifDataTabs.jsx'), 'utf8');

describe('SifDataTabs', () => {
  it('re-exports the shared SifDataTabs implementation', () => {
    assert.match(src, /export\s*\{\s*default\s*\}\s*from\s*['"]@\/windows\/custom\/shared\/SifDataTabs\.jsx['"]/);
  });
});
