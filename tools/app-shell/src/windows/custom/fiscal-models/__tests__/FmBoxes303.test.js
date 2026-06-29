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

describe('FmBoxes303 — inputs are scoped, not freeform', () => {
  // Editable box cells use type="number" with fm-aeat-cell__input class (not arbitrary inputs).
  // Identificacion fields use type="text" for readOnly:false text/date fields.
  // Neither is a freeform manual adjustment — they are layout-driven.
  it('editable cell inputs use type="number" with step="any"', () => {
    assert.match(src, /type="number"/);
    assert.match(src, /step="any"/);
  });
  it('editable cell inputs carry the fm-aeat-cell__input class', () => assert.match(src, /fm-aeat-cell__input/));
  it('has no manualAdj or adjustment state', () => assert.doesNotMatch(src, /manualAdj|adjustment/i));
  it('renders fm-aeat-cell', () => assert.match(src, /fm-aeat-cell/));
  it('renders fm-aeat-section', () => assert.match(src, /fm-aeat-section/));
});

describe('FmBoxes303 — box data', () => {
  it('accepts boxes prop', () => assert.match(src, /boxes/));
  it('renders box number', () => assert.match(src, /box\.num|\.num/));
  it('renders box value', () => assert.match(src, /box\.value|\.value/));
});

describe('FmBoxes303 — identificacion section', () => {
  it('renders fm-aeat-ident container for identificacion sections', () => assert.match(src, /fm-aeat-ident/));
  it('renders checkboxes for identificacion checkbox fields', () => assert.match(src, /Checkbox/));
  it('renders checkbox items with fm-aeat-ident-cb class', () => assert.match(src, /fm-aeat-ident-cb/));
});

describe('FmBoxes303 — i18n', () => {
  it('uses layout section title keys via t()', () => assert.match(src, /t\(section\.titleKey\)/));
  it('uses layout row label keys via t()', () => assert.match(src, /t\(row\.labelKey\)/));
  it('has no hardcoded Spanish box label strings', () => assert.doesNotMatch(src, /'Cuota tipo|'Operaciones sujetas/));
  it('has no hardcoded "Casilla" string', () => assert.doesNotMatch(src, /'Casilla'/));
});
