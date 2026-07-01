import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'add-line-button.jsx'), 'utf8');

describe('AddLineButton — hideChevron prop', () => {
  it('accepts hideChevron prop defaulting to false', () => {
    assert.match(src, /hideChevron = false/);
  });

  it('forces the no-menu layout when hideChevron is true', () => {
    // hideChevron makes hasMenu false so only the primary button renders.
    assert.match(src, /hasMenu = !hideChevron && actions\.length > 0/);
  });

  it('renders only the primary button in the no-menu branch', () => {
    assert.match(src, /if \(!hasMenu\)[\s\S]*?primaryButton\(7\)/);
  });

  it('still renders primary button regardless of hideChevron', () => {
    assert.match(src, /primaryButton/);
  });

  it('no longer renders a "no additional actions" placeholder', () => {
    assert.doesNotMatch(src, /noAdditionalActions/);
  });
});
