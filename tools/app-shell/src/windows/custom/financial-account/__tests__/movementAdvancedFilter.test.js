import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'movementAdvancedFilter.js'), 'utf8');
const evalSrc = readFileSync(join(__dirname, '..', 'advancedFilterApply.js'), 'utf8');

test('movementAdvancedFilter exports status label, column builder and filter helpers', () => {
  assert.match(src, /export function movementStatusLabelKey/);
  assert.match(src, /export function buildMovementFilterColumns/);
  assert.match(src, /export function applyAdvancedFilter/);
});

test('movementAdvancedFilter delegates evaluation to the shared applyConditions', () => {
  assert.match(src, /import \{ applyConditions \} from '\.\/advancedFilterApply'/);
  assert.match(src, /return applyConditions\(movements, filter, withDerivedFields\)/);
});

test('advancedFilterApply defines the operator dispatch table', () => {
  assert.match(evalSrc, /export const OPERATORS = {/);
  assert.match(evalSrc, /iContains:/);
  assert.match(evalSrc, /between:/);
  assert.match(evalSrc, /inSet:/);
});
