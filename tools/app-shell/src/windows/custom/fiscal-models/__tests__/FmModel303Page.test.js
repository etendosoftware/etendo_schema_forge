import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'models', '303', 'FmModel303Page.jsx'), 'utf8');

describe('FmModel303Page — exports', () => {
  it('has default export', () => assert.match(src, /export default/));
});

describe('FmModel303Page — composition', () => {
  it('renders FmBoxes303', () => assert.match(src, /FmBoxes303/));
  it('renders KpiWidget for incidents', () => assert.match(src, /KpiWidget/));
  it('renders Tabs', () => assert.match(src, /Tabs/));
  it('has back navigation (onBack)', () => assert.match(src, /onBack/));
  it('renders KpiWidget for summary values', () => assert.match(src, /KpiWidget/));
  it('uses STEPPER_INDEX', () => assert.match(src, /STEPPER_INDEX/));
  it('renders ConfigDrawer', () => assert.match(src, /ConfigDrawer/));
  it('renders CompareDrawer', () => assert.match(src, /CompareDrawer/));
});

describe('FmModel303Page — stepper', () => {
  it('defines STEPPER_INDEX', () => assert.match(src, /STEPPER_INDEX/));
  it('STEPPER_INDEX maps draft to 0', () => assert.match(src, /draft:\s*0/));
  it('STEPPER_INDEX maps ready to 1', () => assert.match(src, /ready:\s*1/));
  it('STEPPER_INDEX maps submitted to 2', () => assert.match(src, /submitted:\s*2/));
  it('STEPPER_INDEX maps skipped to -1', () => assert.match(src, /skipped:\s*-1/));
});

describe('FmModel303Page — i18n completeness', () => {
  it('uses fm.tab.boxes for tab label', () => assert.match(src, /fm\.tab\.boxes/));
  it('uses fm.tab.sources for tab label', () => assert.match(src, /fm\.tab\.sources/));
  it('uses fm.tab.incidents for tab label', () => assert.match(src, /fm\.tab\.incidents/));
  it('has no hardcoded Casillas/Resumen/Incidencias tab labels', () => {
    assert.doesNotMatch(src, /label: 'Casillas'/);
    assert.doesNotMatch(src, /label: 'Resumen'/);
    assert.doesNotMatch(src, /label: 'Incidencias'/);
  });
});

describe('FmModel303Page — identificacion page', () => {
  it('includes identificacion in BOX_PAGES', () => assert.match(src, /identificacion/));
  it('passes identification prop to FmBoxes303', () => assert.match(src, /identification=/));
});

describe('FmModel303Page — no removed features', () => {
  it('does not reference AuditReasonModal', () => assert.doesNotMatch(src, /AuditReasonModal/));
  it('does not reference CellHistoryPanel', () => assert.doesNotMatch(src, /CellHistoryPanel/));
  it('does not have manual adjustment inputs', () => assert.doesNotMatch(src, /manualAdj/));
});
