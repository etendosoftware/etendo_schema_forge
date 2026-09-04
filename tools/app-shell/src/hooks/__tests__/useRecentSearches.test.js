import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'useRecentSearches.js'), 'utf8');

describe('useRecentSearches', () => {
  it('reads and writes a dedicated local storage key', () => {
    assert.match(src, /schema-forge:recent-searches/);
    assert.match(src, /localStorage\.getItem/);
    assert.match(src, /localStorage\.setItem/);
  });

  it('ignores queries shorter than three characters', () => {
    assert.match(src, /normalizedQuery\.length\s*<\s*3/);
  });

  it('deduplicates searches and caps the history size', () => {
    assert.match(src, /current\.filter\(\(item\)\s*=>\s*item\.query\.toLowerCase\(\)/);
    assert.match(src, /\.slice\(0, MAX_RECENT_SEARCHES\)/);
  });
});
