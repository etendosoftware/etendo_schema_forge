import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'models', '303', 'FmBoxes303.jsx'), 'utf8');

describe('FmBoxes303 — exports', () => {
  it('has default export', () => assert.match(src, /export default/));
});

describe('FmBoxes303 — read-only (no manual adjustments)', () => {
  it('has no text/number inputs for box values', () => assert.doesNotMatch(src, /<input[^>]*type="(text|number)"/i));
  it('has no manualAdj or adjustment state', () => assert.doesNotMatch(src, /manualAdj|adjustment/i));
  it('renders fm-aeat-cell', () => assert.match(src, /fm-aeat-cell/));
  it('renders fm-aeat-section', () => assert.match(src, /fm-aeat-section/));
});

describe('FmBoxes303 — box data', () => {
  it('accepts boxes prop', () => assert.match(src, /boxes/));
  it('renders box number', () => assert.match(src, /box\.num|\.num/));
  it('renders box value', () => assert.match(src, /box\.value|\.value/));
});

describe('FmBoxes303 — i18n', () => {
  it('uses layout section title keys via t()', () => assert.match(src, /t\(section\.titleKey\)/));
  it('uses layout row label keys via t()', () => assert.match(src, /t\(row\.labelKey\)/));
  it('has no hardcoded Spanish box label strings', () => assert.doesNotMatch(src, /'Cuota tipo|'Operaciones sujetas/));
  it('has no hardcoded "Casilla" string', () => assert.doesNotMatch(src, /'Casilla'/));
});
