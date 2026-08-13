import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'index.jsx'), 'utf8');

describe('GoodsMovementsWindow custom wrapper', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function GoodsMovementsWindow/);
  });

  it('imports GeneratedApp from generated artifacts', () => {
    assert.match(src, /import GeneratedApp from '@generated\/goods-movements/);
  });

  it('does not import MovementTable (removed — columns driven by decisions.json)', () => {
    assert.doesNotMatch(src, /import MovementTable from/);
  });

  it('does not define a local COLUMNS array (column config moved to decisions.json)', () => {
    assert.doesNotMatch(src, /const COLUMNS\s*=/);
  });

  it('does not reference CustomMovementTable (removed)', () => {
    assert.doesNotMatch(src, /CustomMovementTable/);
  });

  it('imports SortIcon and RefreshIcon from custom-icons', () => {
    assert.match(src, /import.*SortIcon.*RefreshIcon.*from '@\/components\/ui\/custom-icons'/s);
  });

  it('renders GeneratedApp with SortIconComponent prop', () => {
    assert.match(src, /SortIconComponent=\{SortIcon\}/);
  });

  it('renders GeneratedApp with RefreshIconComponent prop', () => {
    assert.match(src, /RefreshIconComponent=\{RefreshIcon\}/);
  });

  it('passes props through to GeneratedApp via spread', () => {
    assert.match(src, /\{\.\.\.props\}/);
  });
});
