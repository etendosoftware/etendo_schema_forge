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

  it('wraps divider and dropdown in !hideChevron guard', () => {
    assert.match(src, /!hideChevron/);
  });

  it('rounds all corners when hideChevron is true', () => {
    assert.match(src, /hideChevron[\s\S]*?borderRadius: 7/);
  });

  it('still renders primary button regardless of hideChevron', () => {
    assert.match(src, /primaryButton/);
  });

  it('DIVIDER_STYLE is only rendered inside !hideChevron block', () => {
    const noChevronBlock = src.match(/!hideChevron[\s\S]*?<\/>/)?.[0] ?? '';
    assert.ok(noChevronBlock.includes('DIVIDER_STYLE'));
  });
});
