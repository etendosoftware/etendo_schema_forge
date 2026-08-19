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
  it('renders a standalone Generar fichero action-bar button', () => assert.match(src, /fm\.action\.gen303/));
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
  it('does not reference CompareDrawer (Comparar removed)', () => assert.doesNotMatch(src, /CompareDrawer/));
  it('does not reference ConfigDrawer (Configuración removed from this page)', () => assert.doesNotMatch(src, /ConfigDrawer/));
  it('does not define a MoreOptionsMenu function', () => assert.doesNotMatch(src, /function MoreOptionsMenu/));
  it('does not reference the Historial tab', () => assert.doesNotMatch(src, /fm\.tab\.history/));
});
