import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'TabBar.jsx'), 'utf8');

describe('TabBar — exports', () => {
  it('exports a default function component named TabBar', () => {
    assert.match(src, /export default function TabBar/);
  });
});

describe('TabBar — props', () => {
  it('accepts tabs, active and onChange props', () => {
    assert.match(src, /\{ tabs, active, onChange \}/);
  });
});

describe('TabBar — rendering', () => {
  it('maps over tabs to render a button per tab', () => {
    assert.match(src, /tabs\.map/);
    assert.match(src, /<button/);
  });

  it('uses tab value as key (not array index)', () => {
    assert.match(src, /key=\{tab\}/);
  });

  it('calls onChange with the tab index on click', () => {
    assert.match(src, /onClick=\{.*onChange\(i\)/);
  });
});

describe('TabBar — active state styling', () => {
  it('applies semantic card background to the active tab', () => {
    assert.match(src, /active === i/);
    assert.match(src, /bg-card/);
  });

  it('applies hover style to inactive tabs', () => {
    assert.match(src, /hover:bg-card\/50/);
  });
});
