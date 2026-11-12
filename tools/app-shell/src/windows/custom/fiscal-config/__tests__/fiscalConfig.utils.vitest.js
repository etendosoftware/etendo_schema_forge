// @covers tools/app-shell/src/windows/custom/fiscal-config/fiscalConfig.utils.js
import { describe, it, expect } from 'vitest';
import {
  resolveSystem,
  detectProfile,
  isEtendoTrue,
  isEtendoFalse,
  normalizeEtendoBoolean,
  serializeBooleanFields,
  normalizeDateInputValue,
  normalizeVerifactuTaxType,
  getVerifactuTaxTypeLabel,
  allowedSystemsFor,
  territoryOfRecords,
  isProductionEnvironment,
  resolveRecordEnvironment,
  getCertificateContext,
  buildVerifactuUpdatePayload,
  getFiscalRecordId,
  mapSiiRecordToForm,
  isActiveRecord,
  activeOrNull,
  getChangeSifNoticeKey,
  getSystemsToDeactivate,
  parseApiError,
} from '../fiscalConfig.utils.js';
import { FISCAL_SYSTEM_CATALOG } from './fiscalSystemCatalog.fixture.js';

// ---------------------------------------------------------------------------
// isEtendoTrue / isEtendoFalse
// ---------------------------------------------------------------------------

describe('isEtendoTrue', () => {
  it('returns true for boolean true', () => expect(isEtendoTrue(true)).toBe(true));
  it('returns true for string "Y"', () => expect(isEtendoTrue('Y')).toBe(true));
  it('returns true for string "true"', () => expect(isEtendoTrue('true')).toBe(true));
  it('returns false for boolean false', () => expect(isEtendoTrue(false)).toBe(false));
  it('returns false for string "N"', () => expect(isEtendoTrue('N')).toBe(false));
  it('returns false for null', () => expect(isEtendoTrue(null)).toBe(false));
  it('returns false for undefined', () => expect(isEtendoTrue(undefined)).toBe(false));
  it('returns false for empty string', () => expect(isEtendoTrue('')).toBe(false));
});

describe('isEtendoFalse', () => {
  it('returns true for boolean false', () => expect(isEtendoFalse(false)).toBe(true));
  it('returns true for string "N"', () => expect(isEtendoFalse('N')).toBe(true));
  it('returns true for string "false"', () => expect(isEtendoFalse('false')).toBe(true));
  it('returns false for boolean true', () => expect(isEtendoFalse(true)).toBe(false));
  it('returns false for string "Y"', () => expect(isEtendoFalse('Y')).toBe(false));
  it('returns false for null', () => expect(isEtendoFalse(null)).toBe(false));
});

// ---------------------------------------------------------------------------
// normalizeEtendoBoolean
// ---------------------------------------------------------------------------

describe('normalizeEtendoBoolean', () => {
  it('returns "Y" for true', () => expect(normalizeEtendoBoolean(true)).toBe('Y'));
  it('returns "Y" for "Y"', () => expect(normalizeEtendoBoolean('Y')).toBe('Y'));
  it('returns "Y" for "true"', () => expect(normalizeEtendoBoolean('true')).toBe('Y'));
  it('returns "N" for false', () => expect(normalizeEtendoBoolean(false)).toBe('N'));
  it('returns "N" for "N"', () => expect(normalizeEtendoBoolean('N')).toBe('N'));
  it('returns "N" for "false"', () => expect(normalizeEtendoBoolean('false')).toBe('N'));
  it('returns fallback "N" for null (default fallback)', () => expect(normalizeEtendoBoolean(null)).toBe('N'));
  it('returns custom fallback for unknown value', () => expect(normalizeEtendoBoolean(undefined, 'X')).toBe('X'));
});

// ---------------------------------------------------------------------------
// serializeBooleanFields
// ---------------------------------------------------------------------------

describe('serializeBooleanFields', () => {
  it('converts listed keys that are "Y" to true', () => {
    const result = serializeBooleanFields({ active: 'Y', name: 'test' }, ['active']);
    expect(result.active).toBe(true);
    expect(result.name).toBe('test');
  });

  it('converts "N" to false', () => {
    const result = serializeBooleanFields({ active: 'N' }, ['active']);
    expect(result.active).toBe(false);
  });

  it('does not mutate the original form', () => {
    const form = { active: 'Y' };
    serializeBooleanFields(form, ['active']);
    expect(form.active).toBe('Y');
  });

  it('ignores keys not present in form', () => {
    const result = serializeBooleanFields({ name: 'x' }, ['missing']);
    expect(result).toEqual({ name: 'x' });
  });

  it('handles empty key list', () => {
    const result = serializeBooleanFields({ active: 'Y' }, []);
    expect(result).toEqual({ active: 'Y' });
  });
});

// ---------------------------------------------------------------------------
// normalizeDateInputValue
// ---------------------------------------------------------------------------

describe('normalizeDateInputValue', () => {
  it('returns empty string for null', () => expect(normalizeDateInputValue(null)).toBe(''));
  it('returns empty string for empty string', () => expect(normalizeDateInputValue('')).toBe(''));
  it('passes through an already-ISO yyyy-mm-dd string', () => {
    expect(normalizeDateInputValue('2026-05-13')).toBe('2026-05-13');
  });
  it('extracts date from datetime with space separator', () => {
    expect(normalizeDateInputValue('2026-05-13 10:30:00')).toBe('2026-05-13');
  });
  it('extracts date from datetime with T separator (ISO 8601)', () => {
    expect(normalizeDateInputValue('2026-05-13T10:30:00Z')).toBe('2026-05-13');
  });
  it('converts legacy dd-mm-yyyy to yyyy-mm-dd', () => {
    expect(normalizeDateInputValue('13-05-2026')).toBe('2026-05-13');
  });
  it('passes through unrecognised string unchanged', () => {
    expect(normalizeDateInputValue('some-other-value')).toBe('some-other-value');
  });
  it('returns non-string value as-is', () => {
    expect(normalizeDateInputValue(42)).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// normalizeVerifactuTaxType
// ---------------------------------------------------------------------------

describe('normalizeVerifactuTaxType', () => {
  it('returns empty string for falsy value', () => expect(normalizeVerifactuTaxType(null)).toBe(''));
  it('converts "IVA" label to code "01"', () => expect(normalizeVerifactuTaxType('IVA')).toBe('01'));
  it('converts "IGIC" label to code "03"', () => expect(normalizeVerifactuTaxType('IGIC')).toBe('03'));
  it('converts "IPSI" label to code "02"', () => expect(normalizeVerifactuTaxType('IPSI')).toBe('02'));
  it('passes through unknown value unchanged', () => expect(normalizeVerifactuTaxType('UNKNOWN')).toBe('UNKNOWN'));
});

// ---------------------------------------------------------------------------
// getVerifactuTaxTypeLabel
// ---------------------------------------------------------------------------

describe('getVerifactuTaxTypeLabel', () => {
  it('returns empty string for falsy value', () => expect(getVerifactuTaxTypeLabel(null)).toBe(''));
  it('converts code "01" to label "IVA"', () => expect(getVerifactuTaxTypeLabel('01')).toBe('IVA'));
  it('converts code "03" to label "IGIC"', () => expect(getVerifactuTaxTypeLabel('03')).toBe('IGIC'));
  it('converts code "02" to label "IPSI"', () => expect(getVerifactuTaxTypeLabel('02')).toBe('IPSI'));
  it('passes through unknown code unchanged', () => expect(getVerifactuTaxTypeLabel('99')).toBe('99'));
});

// ---------------------------------------------------------------------------
// getAllowedSystemsForTerritory
// ---------------------------------------------------------------------------

// The rules come from the backend catalog (`fiscalSystemCatalog`, ETP-6053); the window keeps no
// copy of them, so an unknown territory or a catalog not loaded yet allows nothing.
describe('allowedSystemsFor', () => {
  it.each([
    ['navarra', ['SII']],
    ['alava', ['TBAI', 'SII+TBAI']],
    ['bizkaia', ['TBAI', 'SII+TBAI']],
    ['gipuzkoa', ['TBAI', 'SII+TBAI']],
    ['baleares', ['SII', 'VERIFACTU']],
    ['canarias', ['SII', 'VERIFACTU']],
    ['ceuta', ['VERIFACTU']],
  ])('returns the catalog systems of %s', (territory, systems) => {
    expect(allowedSystemsFor(FISCAL_SYSTEM_CATALOG, territory)).toEqual(systems);
  });

  it('returns whatever the catalog says, not a local table', () => {
    const catalog = { territories: [{ territory: 'navarra', systems: ['VERIFACTU'] }] };
    expect(allowedSystemsFor(catalog, 'navarra')).toEqual(['VERIFACTU']);
  });

  it('returns an empty array for a territory the catalog does not list', () => {
    expect(allowedSystemsFor(FISCAL_SYSTEM_CATALOG, 'madrid')).toEqual([]);
  });

  it('returns an empty array while the catalog is not loaded', () => {
    expect(allowedSystemsFor(null, 'navarra')).toEqual([]);
    expect(allowedSystemsFor(undefined, 'navarra')).toEqual([]);
    expect(allowedSystemsFor({}, 'navarra')).toEqual([]);
  });

  it('returns an empty array for a catalog entry without systems', () => {
    expect(allowedSystemsFor({ territories: [{ territory: 'navarra' }] }, 'navarra')).toEqual([]);
  });
});

// The territory of a stored configuration, read through the catalog's per-territory values.
describe('territoryOfRecords', () => {
  const C = FISCAL_SYSTEM_CATALOG;

  it.each([
    ['ARABA', 'alava'],
    ['BIZKAIA', 'bizkaia'],
    ['GIPUZKOA', 'gipuzkoa'],
    ['bizkaia', 'bizkaia'],
  ])('maps the TicketBAI territory %s to %s', (etsgSifTerritory, territory) => {
    expect(territoryOfRecords(C, { tbai: { etsgSifTerritory } })).toBe(territory);
  });

  it('takes the TicketBAI territory before the SII flags', () => {
    // SII + TicketBAI in Álava: the SII record alone (IVA, no flags) would read as Baleares.
    expect(territoryOfRecords(C, { sii: { taxtype: 'IVA' }, tbai: { etsgSifTerritory: 'ARABA' } })).toBe('alava');
  });

  it('maps an SII record flagged navarra to navarra', () => {
    expect(territoryOfRecords(C, { sii: { navarra: 'Y', taxtype: 'IVA' } })).toBe('navarra');
  });

  it('maps an SII record flagged guipuzcoa to gipuzkoa', () => {
    expect(territoryOfRecords(C, { sii: { guipuzcoa: true, taxtype: 'IVA' } })).toBe('gipuzkoa');
  });

  it('maps an SII record with IGIC to canarias, case-insensitively', () => {
    expect(territoryOfRecords(C, { sii: { taxtype: 'igic' } })).toBe('canarias');
  });

  it('prefers a territory where SII stands alone for an unflagged IVA record (baleares, not alava)', () => {
    expect(territoryOfRecords(C, { sii: { navarra: 'N', guipuzcoa: 'N', taxtype: 'IVA' } })).toBe('baleares');
  });

  it('falls back to the first candidate when no territory allows SII alone', () => {
    const catalog = { territories: C.territories.filter(t => !['navarra', 'baleares', 'canarias'].includes(t.territory)) };
    expect(territoryOfRecords(catalog, { sii: { taxtype: 'IVA' } })).toBe('alava');
  });

  it.each([
    ['01', 'baleares'],
    ['02', 'ceuta'],
    ['03', 'canarias'],
  ])('maps the VERI*FACTU tax type %s to %s', (tAXType, territory) => {
    expect(territoryOfRecords(C, { verifactu: { tAXType } })).toBe(territory);
  });

  it('returns null for an unknown VERI*FACTU tax type', () => {
    expect(territoryOfRecords(C, { verifactu: { tAXType: '99' } })).toBeNull();
  });

  it('returns null for an SII record no territory matches (no tax type)', () => {
    expect(territoryOfRecords(C, { sii: { navarra: 'N' } })).toBeNull();
  });

  it('returns null without records', () => {
    expect(territoryOfRecords(C, {})).toBeNull();
  });

  it('returns null while the catalog is not loaded', () => {
    expect(territoryOfRecords(null, { tbai: { etsgSifTerritory: 'ARABA' } })).toBeNull();
    expect(territoryOfRecords(null, { sii: { navarra: 'Y', taxtype: 'IVA' } })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getCertificateContext
// ---------------------------------------------------------------------------

describe('getCertificateContext', () => {
  it('returns "sii" for SII', () => expect(getCertificateContext('SII')).toBe('sii'));
  it('returns "sii" for SII+TBAI', () => expect(getCertificateContext('SII+TBAI')).toBe('sii'));
  it('returns "tbai" for TBAI', () => expect(getCertificateContext('TBAI')).toBe('tbai'));
  it('returns "verifactu" for VERIFACTU', () => expect(getCertificateContext('VERIFACTU')).toBe('verifactu'));
  it('returns null for unknown system', () => expect(getCertificateContext('UNKNOWN')).toBeNull());
  it('returns null for null', () => expect(getCertificateContext(null)).toBeNull());
});

// ---------------------------------------------------------------------------
// resolveSystem
// ---------------------------------------------------------------------------

describe('resolveSystem', () => {
  it('returns SII for sii_foral regime', () => {
    expect(resolveSystem({ regime: 'sii_foral', alsoNational: false, volume: null, lowChoice: null })).toBe('SII');
  });

  it('returns SII+TBAI for tbai + alsoNational=true', () => {
    expect(resolveSystem({ regime: 'tbai', alsoNational: true, volume: null, lowChoice: null })).toBe('SII+TBAI');
  });

  it('returns TBAI for tbai + alsoNational=false', () => {
    expect(resolveSystem({ regime: 'tbai', alsoNational: false, volume: null, lowChoice: null })).toBe('TBAI');
  });

  it('returns SII for siiver + high volume', () => {
    expect(resolveSystem({ regime: 'siiver', alsoNational: null, volume: 'high', lowChoice: null })).toBe('SII');
  });

  it('returns SII for siiver + low volume + lowChoice=sii', () => {
    expect(resolveSystem({ regime: 'siiver', alsoNational: null, volume: 'low', lowChoice: 'sii' })).toBe('SII');
  });

  it('returns VERIFACTU for siiver + low volume + lowChoice=verifactu', () => {
    expect(resolveSystem({ regime: 'siiver', alsoNational: null, volume: 'low', lowChoice: 'verifactu' })).toBe('VERIFACTU');
  });

  it('returns null for siiver with no volume', () => {
    expect(resolveSystem({ regime: 'siiver', alsoNational: null, volume: null, lowChoice: null })).toBeNull();
  });

  it('returns null for unknown regime', () => {
    expect(resolveSystem({ regime: 'unknown', alsoNational: null, volume: null, lowChoice: null })).toBeNull();
  });

  // ETP-5272 point 4 — SII is vetoed where the catalog does not allow it (Ceuta/Melilla: IPSI).
  // ETP-6053: the allowed systems come from the backend catalog (allowedSystemsFor).
  describe('allowed-systems veto', () => {
    const ceuta = ['VERIFACTU'];
    const canarias = ['SII', 'VERIFACTU'];

    it('forces VERIFACTU even with high volume (which would otherwise mean SII)', () => {
      expect(resolveSystem({ regime: 'siiver', alsoNational: null, volume: 'high', lowChoice: null, allowedSystems: ceuta })).toBe('VERIFACTU');
    });

    it('forces VERIFACTU even when lowChoice explicitly picked sii', () => {
      expect(resolveSystem({ regime: 'siiver', alsoNational: null, volume: 'low', lowChoice: 'sii', allowedSystems: ceuta })).toBe('VERIFACTU');
    });

    it('still VERIFACTU with no volume answer at all (the sub-question is skipped)', () => {
      expect(resolveSystem({ regime: 'siiver', alsoNational: null, volume: null, lowChoice: null, allowedSystems: ceuta })).toBe('VERIFACTU');
    });

    it('high volume still resolves to SII where SII is allowed', () => {
      expect(resolveSystem({ regime: 'siiver', alsoNational: null, volume: 'high', lowChoice: null, allowedSystems: canarias })).toBe('SII');
    });

    it('low volume + lowChoice=sii still resolves to SII where SII is allowed', () => {
      expect(resolveSystem({ regime: 'siiver', alsoNational: null, volume: 'low', lowChoice: 'sii', allowedSystems: canarias })).toBe('SII');
    });

    it('does not veto while the catalog is not loaded (empty list) — the volume answer decides', () => {
      expect(resolveSystem({ regime: 'siiver', alsoNational: null, volume: 'high', lowChoice: null, allowedSystems: [] })).toBe('SII');
      expect(resolveSystem({ regime: 'siiver', alsoNational: null, volume: 'high', lowChoice: null })).toBe('SII');
    });

    it('feeds from the catalog: ceuta resolves to VERIFACTU through allowedSystemsFor', () => {
      const allowedSystems = allowedSystemsFor(FISCAL_SYSTEM_CATALOG, 'ceuta');
      expect(resolveSystem({ regime: 'siiver', alsoNational: null, volume: 'high', lowChoice: null, allowedSystems })).toBe('VERIFACTU');
    });
  });

});

// ---------------------------------------------------------------------------
// detectProfile
// ---------------------------------------------------------------------------

describe('detectProfile', () => {
  it('returns "unconfigured" when all records are null', () => {
    expect(detectProfile(null, null, null)).toBe('unconfigured');
  });

  it('returns "verifactu" when only verifactu is present', () => {
    expect(detectProfile(null, null, {})).toBe('verifactu');
  });

  it('returns "conflict" when verifactu and sii are both present', () => {
    expect(detectProfile({}, null, {})).toBe('conflict');
  });

  it('returns "conflict" when verifactu and tbai are both present', () => {
    expect(detectProfile(null, {}, {})).toBe('conflict');
  });

  it('returns "sii+tbai" when both sii and tbai are present', () => {
    expect(detectProfile({}, {}, null)).toBe('sii+tbai');
  });

  it('returns "sii+tbai" when sii has guipuzcoa=Y (legacy flag)', () => {
    expect(detectProfile({ guipuzcoa: 'Y' }, null, null)).toBe('sii+tbai');
  });

  it('returns "sii-navarra" when sii has navarra=Y', () => {
    expect(detectProfile({ navarra: 'Y' }, null, null)).toBe('sii-navarra');
  });

  it('returns "sii" for plain sii record', () => {
    expect(detectProfile({ taxtype: 'IVA' }, null, null)).toBe('sii');
  });

  it('returns "tbai" for only tbai record', () => {
    expect(detectProfile(null, { etsgSifTerritory: 'ARABA' }, null)).toBe('tbai');
  });

  it('guipuzcoa=true (boolean) also triggers sii+tbai', () => {
    expect(detectProfile({ guipuzcoa: true }, null, null)).toBe('sii+tbai');
  });
});

// ---------------------------------------------------------------------------
// buildVerifactuUpdatePayload
// ---------------------------------------------------------------------------

describe('buildVerifactuUpdatePayload', () => {
  it('normalizes IVA label to code 01 and parses boolean', () => {
    const p = buildVerifactuUpdatePayload({ tAXType: 'IVA', defaultQR: 'Y' });
    expect(p.tAXType).toBe('01');
    expect(p.defaultQR).toBe(true);
  });

  // ETP-4783: defaultQR is now read from the form/DB record rather than always forced to
  // true. The PUT preserves whatever value is stored, so Classic users who toggle it off
  // do not have it silently re-enabled on every Go save.
  it('preserves defaultQR=false when the record has defaultQR=N (ETP-4783)', () => {
    const p = buildVerifactuUpdatePayload({ tAXType: 'IGIC', defaultQR: 'N' });
    expect(p.tAXType).toBe('03');
    expect(p.defaultQR).toBe(false);
  });

  it('defaults defaultQR to true when form is null (fallback via ?? Y)', () => {
    const p = buildVerifactuUpdatePayload(null);
    expect(p.tAXType).toBe('');
    expect(p.defaultQR).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getFiscalRecordId
// ---------------------------------------------------------------------------

describe('getFiscalRecordId', () => {
  // The extractor now assigns PK fields via IsKey='Y' (schema_forge_core commit
  // 5d363ad2f), so NeoFieldFilter no longer renames the PK to a per-system field
  // name — the API always returns it as `id`, regardless of system.
  it('returns null for null record', () => {
    expect(getFiscalRecordId(null, 'SII')).toBeNull();
  });

  it('returns record.id for SII', () => {
    expect(getFiscalRecordId({ id: 'id-sii' }, 'SII')).toBe('id-sii');
  });

  it('returns null when id is absent', () => {
    expect(getFiscalRecordId({}, 'SII')).toBeNull();
  });

  it('returns record.id for TBAI', () => {
    expect(getFiscalRecordId({ id: 'id-tbai' }, 'TBAI')).toBe('id-tbai');
  });

  it('returns record.id for VERIFACTU', () => {
    expect(getFiscalRecordId({ id: 'id-vf' }, 'VERIFACTU')).toBe('id-vf');
  });

  it('returns record.id for an unknown system', () => {
    expect(getFiscalRecordId({ id: 'fallback' }, 'UNKNOWN')).toBe('fallback');
  });

  it('returns null for unknown system with no id', () => {
    expect(getFiscalRecordId({}, 'UNKNOWN')).toBeNull();
  });

  it('ignores stale per-system field names now that the API returns id', () => {
    expect(getFiscalRecordId({ configuracinSII: 'stale-sii' }, 'SII')).toBeNull();
    expect(getFiscalRecordId({ tbaiConfigID: 'stale-tbai' }, 'TBAI')).toBeNull();
    expect(getFiscalRecordId({ verifactuConfig: 'stale-vf' }, 'VERIFACTU')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// mapSiiRecordToForm
// ---------------------------------------------------------------------------

describe('mapSiiRecordToForm', () => {
  // ETP-4783: plazoLmiteDeEnvoASII, cadenciaEnvoFacturasVentaASII,
  // cadenciaEnvoFacturasCompraASII, and recc were intentionally removed from the mapping.
  // When those numeric columns are NULL in a freshly-created record, the empty-string
  // fallback is coerced to null by the ORM layer, triggering NOT-NULL violations on PUT.
  // They are not editable in the Go UI and must not be in the form.
  it('maps the editable fields correctly (ETP-4783: numeric-only fields excluded)', () => {
    const record = {
      acogidaAlSII: 'Y',
      fechaAcogidaSII: '2025-01-15',
      // plazoLmiteDeEnvoASII, cadenciaEnvo* excluded — NOT-NULL ORM issue (ETP-4783)
      entornoDeProduccin: 'Y',
      adjuntarArchivosXML: 'N',
      redeme: 'Y',
      monitordate: '2025-06-01',
      postedInvoices: 'Y',
      authorizationno: 'AUTH123',
    };
    const form = mapSiiRecordToForm(record);
    expect(form.acogidaAlSII).toBe('Y');
    expect(form.fechaAcogidaSII).toBe('2025-01-15');
    expect(form.entornoDeProduccin).toBe('Y');
    expect(form.adjuntarArchivosXML).toBe('N');
    expect(form.redeme).toBe('Y');
    expect(form.monitordate).toBe('2025-06-01');
    expect(form.postedInvoices).toBe('Y');
    expect(form.authorizationno).toBe('AUTH123');
    // Confirm the dropped fields are not present in the form shape
    expect(form).not.toHaveProperty('plazoLmiteDeEnvoASII');
    expect(form).not.toHaveProperty('cadenciaEnvoFacturasVentaASII');
    expect(form).not.toHaveProperty('cadenciaEnvoFacturasCompraASII');
    expect(form).not.toHaveProperty('recc');
  });

  it('maps missing optional fields to empty strings / default N', () => {
    const form = mapSiiRecordToForm({});
    expect(form.acogidaAlSII).toBe('N');
    expect(form.fechaAcogidaSII).toBe('');
    // plazoLmiteDeEnvoASII is intentionally excluded from the mapping (ETP-4783)
    expect(form).not.toHaveProperty('plazoLmiteDeEnvoASII');
    expect(form.authorizationno).toBe('');
  });

  it('handles null record with optional chaining', () => {
    const form = mapSiiRecordToForm(null);
    expect(form.acogidaAlSII).toBe('N');
    expect(form.fechaAcogidaSII).toBe('');
  });

  it('normalizes datetime fechaAcogidaSII to date only', () => {
    const form = mapSiiRecordToForm({ fechaAcogidaSII: '2025-01-15T10:00:00Z' });
    expect(form.fechaAcogidaSII).toBe('2025-01-15');
  });
});

// ---------------------------------------------------------------------------
// isActiveRecord (ETP-4785 — "Change SIF" active-row resolution, addresses N1)
// ---------------------------------------------------------------------------

describe('isActiveRecord', () => {
  it('returns false for null record', () => {
    expect(isActiveRecord(null)).toBe(false);
  });

  it('returns false for undefined record', () => {
    expect(isActiveRecord(undefined)).toBe(false);
  });

  it('treats a MISSING active property as active (never hide on absent flag)', () => {
    expect(isActiveRecord({ id: 'x' })).toBe(true);
  });

  it('treats active === undefined as active', () => {
    expect(isActiveRecord({ id: 'x', active: undefined })).toBe(true);
  });

  it('treats active === null as active', () => {
    expect(isActiveRecord({ id: 'x', active: null })).toBe(true);
  });

  it('returns true for active === true (boolean)', () => {
    expect(isActiveRecord({ active: true })).toBe(true);
  });

  it('returns true for active === "Y"', () => {
    expect(isActiveRecord({ active: 'Y' })).toBe(true);
  });

  it('returns true for active === "true"', () => {
    expect(isActiveRecord({ active: 'true' })).toBe(true);
  });

  it('returns false for active === false (boolean) — Change SIF trace row', () => {
    expect(isActiveRecord({ active: false })).toBe(false);
  });

  it('returns false for active === "N" — Change SIF trace row', () => {
    expect(isActiveRecord({ active: 'N' })).toBe(false);
  });

  it('returns false for active === "false"', () => {
    expect(isActiveRecord({ active: 'false' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// activeOrNull
// ---------------------------------------------------------------------------

describe('activeOrNull', () => {
  it('returns the record when it is active', () => {
    const rec = { id: 'x', active: 'Y' };
    expect(activeOrNull(rec)).toBe(rec);
  });

  it('returns the record when active flag is absent (treated active)', () => {
    const rec = { id: 'x' };
    expect(activeOrNull(rec)).toBe(rec);
  });

  it('returns null when the record is inactive (Change SIF trace)', () => {
    expect(activeOrNull({ id: 'x', active: 'N' })).toBeNull();
  });

  it('returns null for a null record', () => {
    expect(activeOrNull(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getChangeSifNoticeKey (per-SIF permanence notice, informational only)
// ---------------------------------------------------------------------------

describe('getChangeSifNoticeKey', () => {
  it('returns the SII notice key for "sii"', () => {
    expect(getChangeSifNoticeKey('sii')).toBe('fiscal.changeSif.notice.sii');
  });

  it('returns the SII notice key for "sii-navarra"', () => {
    expect(getChangeSifNoticeKey('sii-navarra')).toBe('fiscal.changeSif.notice.sii');
  });

  it('returns the Verifactu notice key for "verifactu"', () => {
    expect(getChangeSifNoticeKey('verifactu')).toBe('fiscal.changeSif.notice.verifactu');
  });

  it('returns the TBAI notice key for "tbai"', () => {
    expect(getChangeSifNoticeKey('tbai')).toBe('fiscal.changeSif.notice.tbai');
  });

  it('returns the SII+TBAI notice key for "sii+tbai"', () => {
    expect(getChangeSifNoticeKey('sii+tbai')).toBe('fiscal.changeSif.notice.siiTbai');
  });

  it('returns null for an unknown / unconfigured profile', () => {
    expect(getChangeSifNoticeKey('unconfigured')).toBeNull();
    expect(getChangeSifNoticeKey('conflict')).toBeNull();
    expect(getChangeSifNoticeKey(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getSystemsToDeactivate (which config records a Change SIF must deactivate)
// ---------------------------------------------------------------------------

describe('getSystemsToDeactivate', () => {
  it('returns ["sii"] for "sii"', () => {
    expect(getSystemsToDeactivate('sii')).toEqual(['sii']);
  });

  it('returns ["sii"] for "sii-navarra"', () => {
    expect(getSystemsToDeactivate('sii-navarra')).toEqual(['sii']);
  });

  it('returns ["tbai"] for "tbai"', () => {
    expect(getSystemsToDeactivate('tbai')).toEqual(['tbai']);
  });

  it('returns ["verifactu"] for "verifactu"', () => {
    expect(getSystemsToDeactivate('verifactu')).toEqual(['verifactu']);
  });

  it('returns BOTH ["sii", "tbai"] for "sii+tbai" (order matters — sequential PUTs)', () => {
    expect(getSystemsToDeactivate('sii+tbai')).toEqual(['sii', 'tbai']);
  });

  it('returns an empty array for an unknown / unconfigured profile', () => {
    expect(getSystemsToDeactivate('unconfigured')).toEqual([]);
    expect(getSystemsToDeactivate('conflict')).toEqual([]);
    expect(getSystemsToDeactivate(null)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// parseApiError
// ---------------------------------------------------------------------------

describe('parseApiError', () => {
  function makeRes(bodyText, statusText = 'Error') {
    return {
      text: () => Promise.resolve(bodyText),
      statusText,
    };
  }

  it('returns error.message from a JSON body with { error: { message } }', async () => {
    const res = makeRes(JSON.stringify({ error: { message: 'Nested error message' } }));
    expect(await parseApiError(res)).toBe('Nested error message');
  });

  it('returns message from a JSON body with top-level { message }', async () => {
    const res = makeRes(JSON.stringify({ message: 'Top-level message' }));
    expect(await parseApiError(res)).toBe('Top-level message');
  });

  it('falls back to raw body when JSON has neither error.message nor message', async () => {
    const res = makeRes(JSON.stringify({ code: 42 }));
    const raw = JSON.stringify({ code: 42 });
    expect(await parseApiError(res)).toBe(raw);
  });

  it('returns raw text when body is not valid JSON', async () => {
    const res = makeRes('plain text error');
    expect(await parseApiError(res)).toBe('plain text error');
  });

  it('returns statusText when body is empty and body has no usable content', async () => {
    const res = makeRes('', 'Internal Server Error');
    // empty string is falsy → falls back to statusText
    expect(await parseApiError(res)).toBe('Internal Server Error');
  });

  it('returns statusText when res.text() rejects', async () => {
    const res = {
      text: () => Promise.reject(new Error('stream error')),
      statusText: 'Bad Gateway',
    };
    expect(await parseApiError(res)).toBe('Bad Gateway');
  });
});

describe('resolveRecordEnvironment (ETP-5027)', () => {
  it('returns null when there is no record', () => {
    expect(resolveRecordEnvironment('sii', null)).toBeNull();
  });

  it('reads entornoDeProduccin for SII (Y = production)', () => {
    expect(resolveRecordEnvironment('sii', { entornoDeProduccin: 'Y' })).toBe(true);
    expect(resolveRecordEnvironment('sii', { entornoDeProduccin: 'N' })).toBe(false);
  });

  it('reads productionEnv for TicketBAI (Y = production)', () => {
    expect(resolveRecordEnvironment('tbai', { productionEnv: true })).toBe(true);
    expect(resolveRecordEnvironment('tbai', { productionEnv: false })).toBe(false);
  });

  it('inverts isDevEnv for VERI*FACTU (Y = developer/test env)', () => {
    expect(resolveRecordEnvironment('verifactu', { isDevEnv: 'Y' })).toBe(false);
    expect(resolveRecordEnvironment('verifactu', { isDevEnv: 'N' })).toBe(true);
  });

  it('returns null when the record carries no environment value', () => {
    expect(resolveRecordEnvironment('verifactu', {})).toBeNull();
    expect(resolveRecordEnvironment('sii', { entornoDeProduccin: '' })).toBeNull();
  });
});

describe('isProductionEnvironment (ETP-5027)', () => {
  it('resolves each single-system profile from its own record', () => {
    expect(isProductionEnvironment('VERIFACTU', { verifactu: { isDevEnv: 'N' } })).toBe(true);
    expect(isProductionEnvironment('VERIFACTU', { verifactu: { isDevEnv: 'Y' } })).toBe(false);
    expect(isProductionEnvironment('SII', { sii: { entornoDeProduccin: 'Y' } })).toBe(true);
    expect(isProductionEnvironment('TBAI', { tbai: { productionEnv: 'Y' } })).toBe(true);
  });

  it('requires every record of a combined profile to be in production', () => {
    const records = { sii: { entornoDeProduccin: 'Y' }, tbai: { productionEnv: 'Y' } };
    expect(isProductionEnvironment('SII+TBAI', records)).toBe(true);
    expect(isProductionEnvironment('SII+TBAI', { ...records, tbai: { productionEnv: 'N' } })).toBe(false);
  });

  it('never claims production when the flag is unknown', () => {
    expect(isProductionEnvironment('VERIFACTU', {})).toBe(false);
    expect(isProductionEnvironment('VERIFACTU', null)).toBe(false);
    expect(isProductionEnvironment(null, { verifactu: { isDevEnv: 'N' } })).toBe(false);
  });
});
