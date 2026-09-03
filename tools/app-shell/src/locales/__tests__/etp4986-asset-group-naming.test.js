import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * ETP-4986 — unify asset-group naming to a single term across the app:
 * "Categoría de Activo" (es) / "Asset Group" (en) — singular.
 *
 * The reporter changed the target term after the initial fix landed: the
 * earlier unification round settled on "Grupo de activo", but the final,
 * correct term is "Categoría de Activo". This test encodes that FINAL state.
 *
 * Out of scope: A_Asset_Group_Acct_ID ("Grupo de activo contabilidad") is
 * already correct and must NOT be touched or asserted here.
 */

describe('ETP-4986 — asset group naming unification', () => {
  let enUS;
  let esES;
  let esAR;

  before(() => {
    enUS = JSON.parse(readFileSync(new URL('../../locales/en_US.json', import.meta.url), 'utf8'));
    esES = JSON.parse(readFileSync(new URL('../../locales/es_ES.json', import.meta.url), 'utf8'));
    esAR = JSON.parse(readFileSync(new URL('../../locales/es_AR.json', import.meta.url), 'utf8'));
  });

  describe('fields["A_Asset_Group_ID"].label', () => {
    it('en_US — "Asset Group"', () => {
      assert.equal(enUS.fields.A_Asset_Group_ID.label, 'Asset Group');
    });

    it('es_ES — "Categoría de Activo"', () => {
      assert.equal(esES.fields.A_Asset_Group_ID.label, 'Categoría de Activo');
    });

    it('es_AR — "Categoría de Activo"', () => {
      assert.equal(esAR.fields.A_Asset_Group_ID.label, 'Categoría de Activo');
    });
  });

  describe('windows["Asset Group"].label', () => {
    it('en_US — "Asset Group"', () => {
      assert.equal(enUS.windows['Asset Group'].label, 'Asset Group');
    });

    it('es_ES — "Categoría de Activo"', () => {
      assert.equal(esES.windows['Asset Group'].label, 'Categoría de Activo');
    });

    it('es_AR — "Categoría de Activo"', () => {
      assert.equal(esAR.windows['Asset Group'].label, 'Categoría de Activo');
    });
  });

  describe('windows["Asset Group"].newLabel', () => {
    it('en_US — "New group"', () => {
      assert.equal(enUS.windows['Asset Group'].newLabel, 'New group');
    });

    it('es_ES — "Nueva categoría"', () => {
      assert.equal(esES.windows['Asset Group'].newLabel, 'Nueva categoría');
    });

    // es_AR has no newLabel key today for "Asset Group" — intentionally not asserted.
  });

  describe('tabs["Asset Category"].label', () => {
    it('en_US — "Asset Group"', () => {
      assert.equal(enUS.tabs['Asset Category'].label, 'Asset Group');
    });

    it('es_ES — "Categoría de Activo"', () => {
      assert.equal(esES.tabs['Asset Category'].label, 'Categoría de Activo');
    });

    it('es_AR — "Categoría de Activo"', () => {
      assert.equal(esAR.tabs['Asset Category'].label, 'Categoría de Activo');
    });
  });

  describe('menus["Asset Group"].label', () => {
    it('en_US — "Asset Group"', () => {
      assert.equal(enUS.menus['Asset Group'].label, 'Asset Group');
    });

    it('es_ES — "Categoría de Activo"', () => {
      assert.equal(esES.menus['Asset Group'].label, 'Categoría de Activo');
    });

    it('es_AR — "Categoría de Activo"', () => {
      assert.equal(esAR.menus['Asset Group'].label, 'Categoría de Activo');
    });
  });

  describe('AssetsDetailPanel.jsx — no hardcoded i18n-bypassing fallback', () => {
    it('does not contain the hardcoded literal ui(\'Asset Category\')', () => {
      const src = readFileSync(
        new URL(
          '../../windows/custom/assets/AssetsDetailPanel.jsx',
          import.meta.url,
        ),
        'utf8',
      );
      assert.doesNotMatch(
        src,
        /ui\(\s*['"]Asset Category['"]\s*\)/,
        'AssetsDetailPanel.jsx still hardcodes ui(\'Asset Category\') instead of a real label lookup',
      );
    });
  });
});
