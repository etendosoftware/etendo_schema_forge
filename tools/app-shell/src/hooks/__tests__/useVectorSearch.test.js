import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'useVectorSearch.js'), 'utf8');

describe('useVectorSearch', () => {
  it('guards short queries and empty target selections', () => {
    assert.match(src, /requestedTargetKeys\.length\s*===\s*0/);
    assert.match(src, /normalizedQuery\.length\s*<\s*3/);
  });

  it('queries the vector endpoint with score and result limits', () => {
    assert.match(src, /\/sws\/neo\/vectorsearch/);
    assert.match(src, /minScore/);
    assert.match(src, /maxResults/);
  });

  it('queries each target independently when all targets are selected', () => {
    assert.match(src, /selectedTargetKeys\s*===\s*null/);
    assert.match(src, /requestedTargetKeys\.map\(\(target\)\s*=>\s*\[target\]\)/);
    assert.match(src, /payloads\.flatMap/);
  });
});
