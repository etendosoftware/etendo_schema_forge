import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Source-reading, not an import: the helper imports `vi` from 'vitest', which cannot be
// resolved outside the Vitest runner. The contract worth guarding here is structural
// anyway — WHICH named exports the mock declares — so reading the text is enough.
const helperSrc = readFileSync(join(__dirname, '..', 'bulkDocumentActionMock.js'), 'utf8');
const moduleSrc = readFileSync(
  join(__dirname, '..', '..', 'components', 'contract-ui', 'BulkDocumentAction.jsx'),
  'utf8',
);

const realNamedExports = [...moduleSrc.matchAll(/^export\s+(?:const|function)\s+(\w+)/gm)].map(
  (match) => match[1],
);

describe('bulkDocumentActionMock', () => {
  it('exports the factory used by the vi.mock factories', () => {
    assert.match(helperSrc, /export function bulkDocumentActionNamedExports\(overrides = \{\}\)/);
  });

  it('declares every named export of the real BulkDocumentAction module', () => {
    // A vi.mock factory that omits ONE named export makes the whole spec file fail to
    // load ("No <export> is defined on the ... mock"), so a new export added to the real
    // module must be mirrored here. This test is the tripwire for that.
    assert.ok(realNamedExports.length > 0, 'expected the real module to have named exports');
    for (const name of realNamedExports) {
      assert.match(helperSrc, new RegExp(`^\\s{4}${name}: vi\\.fn\\(`, 'm'));
    }
  });

  it('lets a spec override any entry', () => {
    assert.match(helperSrc, /\.\.\.overrides,/);
  });

  it('does not provide a default export stub (each spec owns its own)', () => {
    assert.doesNotMatch(helperSrc, /^\s*default:/m);
  });
});
