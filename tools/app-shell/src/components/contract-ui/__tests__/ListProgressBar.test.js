/**
 * ListProgressBar — structural contract (source-reading).
 *
 * Rendered behaviour is covered in ListProgressBar.vitest.jsx and at every host that mounts it
 * (ListView.interactions, ListModalWindow, ReconciliationSplitPanel, MovementsTab,
 * ImportedStatementsTab, ReconciliationList, CashClose). This file locks the invariants those
 * suites all lean on: the bar was extracted OUT of ListView but kept ListView's original
 * `list-progress-bar` testid as its default, the keyframes travel with the component instead of
 * living in a global stylesheet, and it stays a dumb presentational leaf — the `loading && rows`
 * gate belongs to each host, never to the bar itself.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'ListProgressBar.jsx'), 'utf8');
const listView = readFileSync(join(__dirname, '..', 'ListView.jsx'), 'utf8');

describe('ListProgressBar — module shape', () => {
  it('exports the component as a named export', () => {
    assert.match(src, /export function ListProgressBar\(\{/);
  });

  it('takes only the per-host testId, defaulted to ListView original one', () => {
    assert.match(
      src,
      /export function ListProgressBar\(\{\s*testId = 'list-progress-bar',?\s*\}\)/,
    );
  });
});

describe('ListProgressBar — extraction from ListView', () => {
  it('is imported and rendered by ListView instead of its old inline JSX', () => {
    assert.match(listView, /import \{ ListProgressBar \} from '\.\/ListProgressBar\.jsx'/);
    assert.match(listView, /<ListProgressBar/);
  });

  it('leaves no duplicated inline bar behind in ListView', () => {
    assert.doesNotMatch(listView, /data-testid="list-progress-bar"/);
    assert.doesNotMatch(listView, /@keyframes sf-list-progress/);
  });

  it('keeps ListView own gate — only while refreshing over rows already on screen', () => {
    assert.match(listView, /hook\.loading && hook\.items\.length > 0/);
  });
});

describe('ListProgressBar — testid and a11y contract', () => {
  it('binds the testid to the caller-supplied value', () => {
    assert.match(src, /data-testid=\{testId\}/);
  });

  it('exposes the bar as an indeterminate progressbar (no aria value)', () => {
    assert.match(src, /role="progressbar"/);
    assert.doesNotMatch(src, /aria-valuenow/);
  });
});

describe('ListProgressBar — self-contained animation', () => {
  it('ships its own sf-list-progress keyframes rather than relying on a global stylesheet', () => {
    assert.match(src, /@keyframes sf-list-progress/);
    assert.match(src, /animation: 'sf-list-progress/);
  });
});

describe('ListProgressBar — presentational only', () => {
  it('owns no state, effect, data fetching or translatable text', () => {
    assert.doesNotMatch(src, /useState|useEffect|fetch\(/);
    assert.doesNotMatch(src, /from '@\/i18n'/);
  });
});
