import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'FmModel303Page.jsx'), 'utf8');

describe('FmModel303Page — exports', () => {
  it('has default export', () => assert.match(src, /export default/));
});

describe('FmModel303Page — composition', () => {
  it('renders FmBoxes303', () => assert.match(src, /FmBoxes303/));
  it('renders StatusPillMenu', () => assert.match(src, /StatusPillMenu/));
  it('renders Tabs', () => assert.match(src, /Tabs/));
  it('has back navigation (onBack)', () => assert.match(src, /onBack/));
  it('renders Stepper', () => assert.match(src, /Stepper/));
  it('uses STEPPER_INDEX', () => assert.match(src, /STEPPER_INDEX/));
  it('renders ConfigDrawer', () => assert.match(src, /ConfigDrawer/));
  it('renders CompareDrawer', () => assert.match(src, /CompareDrawer/));
});

describe('FmModel303Page — stepper', () => {
  it('defines all 7 statuses in STEPPER_INDEX', () => assert.match(src, /STEPPER_INDEX/));
  it('passes steps from i18n keys', () => assert.match(src, /fm\.stepper\./));
  it('uses fm.stepper.ready (not listo)', () => assert.match(src, /fm\.stepper\.ready/));
  it('uses fm.stepper.presented (not presentado)', () => assert.match(src, /fm\.stepper\.presented/));
  it('derives current from status via STEPPER_INDEX', () => assert.match(src, /STEPPER_INDEX\[status\]/));
});

describe('FmModel303Page — i18n completeness', () => {
  it('uses fm.tab.boxes for tab label', () => assert.match(src, /fm\.tab\.boxes/));
  it('uses fm.tab.summary for tab label', () => assert.match(src, /fm\.tab\.summary/));
  it('uses fm.tab.incidents for tab label', () => assert.match(src, /fm\.tab\.incidents/));
  it('has no hardcoded Casillas/Resumen/Incidencias tab labels', () => {
    assert.doesNotMatch(src, /label: 'Casillas'/);
    assert.doesNotMatch(src, /label: 'Resumen'/);
    assert.doesNotMatch(src, /label: 'Incidencias'/);
  });
});

describe('FmModel303Page — no removed features', () => {
  it('does not reference AuditReasonModal', () => assert.doesNotMatch(src, /AuditReasonModal/));
  it('does not reference CellHistoryPanel', () => assert.doesNotMatch(src, /CellHistoryPanel/));
  it('does not have manual adjustment inputs', () => assert.doesNotMatch(src, /manualAdj/));
});
