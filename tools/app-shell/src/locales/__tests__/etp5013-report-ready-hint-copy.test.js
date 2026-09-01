import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * ETP-5013 — the report viewer's empty-state help text (`reportReadyHint`)
 * previously told the user to "hit Run Report" / "haz clic en Ejecutar
 * Informe", but the real button (`runReport`) says "Generate Report" /
 * "Generar informe". Fixed to reference the actual button label.
 *
 * These tests pin the corrected copy AND assert the two keys share the same
 * verb per locale ("Generate"/"Generar"), so this exact kind of drift
 * (help text describing a button by a name it no longer has) can't silently
 * reappear.
 */

describe('ETP-5013 — reportReadyHint mirrors the real runReport button label', () => {
  let enUS;
  let esES;

  before(() => {
    enUS = JSON.parse(readFileSync(new URL('../../locales/en_US.json', import.meta.url), 'utf8'));
    esES = JSON.parse(readFileSync(new URL('../../locales/es_ES.json', import.meta.url), 'utf8'));
  });

  it('en_US.genericLabels.runReport is "Generate Report"', () => {
    assert.equal(enUS.genericLabels.runReport, 'Generate Report');
  });

  it('es_ES.genericLabels.runReport is "Generar informe"', () => {
    assert.equal(esES.genericLabels.runReport, 'Generar informe');
  });

  it('en_US.genericLabels.reportReadyHint references the real button copy', () => {
    assert.equal(enUS.genericLabels.reportReadyHint, 'Choose your filters and hit Generate Report');
  });

  it('es_ES.genericLabels.reportReadyHint references the real button copy', () => {
    assert.equal(esES.genericLabels.reportReadyHint, 'Selecciona los filtros y haz clic en Generar Informe');
  });

  it('en_US: reportReadyHint no longer mentions the stale "Run Report" wording', () => {
    assert.doesNotMatch(enUS.genericLabels.reportReadyHint, /Run Report/);
  });

  it('es_ES: reportReadyHint no longer mentions the stale "Ejecutar Informe" wording', () => {
    assert.doesNotMatch(esES.genericLabels.reportReadyHint, /Ejecutar Informe/);
  });

  it('en_US: reportReadyHint and runReport share the same verb ("Generate")', () => {
    assert.ok(
      enUS.genericLabels.reportReadyHint.includes('Generate'),
      'reportReadyHint must reuse the same verb as runReport ("Generate")'
    );
  });

  it('es_ES: reportReadyHint and runReport share the same verb ("Generar")', () => {
    assert.ok(
      esES.genericLabels.reportReadyHint.includes('Generar'),
      'reportReadyHint must reuse the same verb as runReport ("Generar")'
    );
  });
});
