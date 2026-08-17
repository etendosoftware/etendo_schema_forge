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
  getAllowedSystemsForTerritory,
  getCertificateContext,
  todayIsoDate,
  buildOnboardingPayloads,
  buildVerifactuUpdatePayload,
  getFiscalRecordId,
  mapSiiRecordToForm,
  getTerritoryDefaults,
  isActiveRecord,
  activeOrNull,
  getChangeSifNoticeKey,
  getSystemsToDeactivate,
} from '../fiscalConfig.utils.js';

// ---------------------------------------------------------------------------
// todayIsoDate
// ---------------------------------------------------------------------------

describe('todayIsoDate', () => {
  it('returns a string matching yyyy-mm-dd', () => {
    expect(todayIsoDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('is consistent with new Date() toISOString slice', () => {
    const expected = new Date().toISOString().slice(0, 10);
    expect(todayIsoDate()).toBe(expected);
  });
});

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

describe('getAllowedSystemsForTerritory', () => {
  it('returns ["SII"] for navarra', () => {
    expect(getAllowedSystemsForTerritory('navarra')).toEqual(['SII']);
  });
  it('returns TBAI options for alava', () => {
    expect(getAllowedSystemsForTerritory('alava')).toEqual(['TBAI', 'SII+TBAI']);
  });
  it('returns TBAI options for bizkaia', () => {
    expect(getAllowedSystemsForTerritory('bizkaia')).toEqual(['TBAI', 'SII+TBAI']);
  });
  it('returns TBAI options for gipuzkoa', () => {
    expect(getAllowedSystemsForTerritory('gipuzkoa')).toEqual(['TBAI', 'SII+TBAI']);
  });
  it('returns SII+VERIFACTU options for baleares', () => {
    expect(getAllowedSystemsForTerritory('baleares')).toEqual(['SII', 'VERIFACTU']);
  });
  it('returns SII+VERIFACTU options for canarias', () => {
    expect(getAllowedSystemsForTerritory('canarias')).toEqual(['SII', 'VERIFACTU']);
  });
  it('returns SII+VERIFACTU options for ceuta', () => {
    expect(getAllowedSystemsForTerritory('ceuta')).toEqual(['SII', 'VERIFACTU']);
  });
  it('returns empty array for unknown territory', () => {
    expect(getAllowedSystemsForTerritory('madrid')).toEqual([]);
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
// buildOnboardingPayloads
// ---------------------------------------------------------------------------

describe('buildOnboardingPayloads — SII', () => {
  it('navarra: sets navarra=Y, taxtype=IVA with forced defaults', () => {
    const p = buildOnboardingPayloads('SII', 'navarra');
    expect(p.sii).toEqual(expect.objectContaining({ navarra: 'Y', taxtype: 'IVA', acogidaAlSII: 'N', entornoDeProduccin: 'Y', adjuntarArchivosXML: 'Y' }));
    expect(p.sii.fechaAcogidaSII).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(p.tbai).toBeNull();
    expect(p.verifactu).toBeNull();
  });

  it('gipuzkoa: sets guipuzcoa=Y, taxtype=IVA with forced defaults', () => {
    const p = buildOnboardingPayloads('SII', 'gipuzkoa');
    expect(p.sii).toEqual(expect.objectContaining({ guipuzcoa: 'Y', taxtype: 'IVA', acogidaAlSII: 'N' }));
  });

  it('baleares: IVA with forced defaults', () => {
    expect(buildOnboardingPayloads('SII', 'baleares').sii).toEqual(expect.objectContaining({ taxtype: 'IVA', acogidaAlSII: 'N' }));
  });

  it('canarias: IGIC with forced defaults', () => {
    expect(buildOnboardingPayloads('SII', 'canarias').sii).toEqual(expect.objectContaining({ taxtype: 'IGIC', acogidaAlSII: 'N' }));
  });

  it('ceuta: IPSI with forced defaults', () => {
    expect(buildOnboardingPayloads('SII', 'ceuta').sii).toEqual(expect.objectContaining({ taxtype: 'IPSI', acogidaAlSII: 'N' }));
  });

  it('unknown territory returns all null', () => {
    const p = buildOnboardingPayloads('SII', 'unknown');
    expect(p).toEqual({ sii: null, tbai: null, verifactu: null });
  });
});

describe('buildOnboardingPayloads — TBAI', () => {
  it('alava: sets etsgSifTerritory=ARABA with tbaisystemdate', () => {
    const p = buildOnboardingPayloads('TBAI', 'alava');
    expect(p.tbai.etsgSifTerritory).toBe('ARABA');
    expect(p.tbai.tbaisystemdate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(p.sii).toBeNull();
    expect(p.verifactu).toBeNull();
  });

  it('bizkaia: sets BIZKAIA', () => {
    expect(buildOnboardingPayloads('TBAI', 'bizkaia').tbai.etsgSifTerritory).toBe('BIZKAIA');
  });

  it('gipuzkoa: sets GIPUZKOA', () => {
    expect(buildOnboardingPayloads('TBAI', 'gipuzkoa').tbai.etsgSifTerritory).toBe('GIPUZKOA');
  });

  it('unknown territory returns all null', () => {
    expect(buildOnboardingPayloads('TBAI', 'unknown')).toEqual({ sii: null, tbai: null, verifactu: null });
  });
});

describe('buildOnboardingPayloads — SII+TBAI', () => {
  it('alava: sets sii taxtype=IVA and tbai ARABA with forced defaults', () => {
    const p = buildOnboardingPayloads('SII+TBAI', 'alava');
    expect(p.sii).toEqual(expect.objectContaining({ taxtype: 'IVA', acogidaAlSII: 'N' }));
    expect(p.tbai.etsgSifTerritory).toBe('ARABA');
    expect(p.tbai.productionEnv).toBe('Y');
    expect(p.verifactu).toBeNull();
  });

  it('bizkaia: sii IVA + BIZKAIA with forced defaults', () => {
    const p = buildOnboardingPayloads('SII+TBAI', 'bizkaia');
    expect(p.sii).toEqual(expect.objectContaining({ taxtype: 'IVA', acogidaAlSII: 'N' }));
    expect(p.tbai.etsgSifTerritory).toBe('BIZKAIA');
  });

  it('gipuzkoa: sii guipuzcoa=Y + GIPUZKOA with forced defaults', () => {
    const p = buildOnboardingPayloads('SII+TBAI', 'gipuzkoa');
    expect(p.sii).toEqual(expect.objectContaining({ guipuzcoa: 'Y', taxtype: 'IVA', acogidaAlSII: 'N' }));
    expect(p.tbai.etsgSifTerritory).toBe('GIPUZKOA');
  });

  it('unknown territory returns all null', () => {
    expect(buildOnboardingPayloads('SII+TBAI', 'unknown')).toEqual({ sii: null, tbai: null, verifactu: null });
  });
});

describe('buildOnboardingPayloads — VERIFACTU', () => {
  it('baleares: tAXType=01 with defaultQR=Y forced', () => {
    const p = buildOnboardingPayloads('VERIFACTU', 'baleares');
    expect(p.verifactu).toEqual(expect.objectContaining({ tAXType: '01', nextSendWaitTime: '60', defaultQR: 'Y' }));
    expect(p.sii).toBeNull();
    expect(p.tbai).toBeNull();
  });

  it('canarias: tAXType=03', () => {
    expect(buildOnboardingPayloads('VERIFACTU', 'canarias').verifactu.tAXType).toBe('03');
  });

  it('ceuta: tAXType=02', () => {
    expect(buildOnboardingPayloads('VERIFACTU', 'ceuta').verifactu.tAXType).toBe('02');
  });

  it('unknown territory returns all null', () => {
    expect(buildOnboardingPayloads('VERIFACTU', 'unknown')).toEqual({ sii: null, tbai: null, verifactu: null });
  });
});

describe('buildOnboardingPayloads — unknown system', () => {
  it('returns all null for unknown system', () => {
    expect(buildOnboardingPayloads('UNKNOWN', 'baleares')).toEqual({ sii: null, tbai: null, verifactu: null });
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

  it('always sets defaultQR to true regardless of input (ETP-4783)', () => {
    const p = buildVerifactuUpdatePayload({ tAXType: 'IGIC', defaultQR: 'N' });
    expect(p.tAXType).toBe('03');
    expect(p.defaultQR).toBe(true);
  });

  it('handles null form gracefully, defaultQR always true', () => {
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
  it('maps a fully-populated record correctly', () => {
    const record = {
      acogidaAlSII: 'Y',
      fechaAcogidaSII: '2025-01-15',
      plazoLmiteDeEnvoASII: '10',
      cadenciaEnvoFacturasVentaASII: '5',
      cadenciaEnvoFacturasCompraASII: '3',
      entornoDeProduccin: 'Y',
      adjuntarArchivosXML: 'N',
      recc: 'N',
      redeme: 'Y',
      monitordate: '2025-06-01',
      postedInvoices: 'Y',
      authorizationno: 'AUTH123',
    };
    const form = mapSiiRecordToForm(record);
    expect(form.acogidaAlSII).toBe('Y');
    expect(form.fechaAcogidaSII).toBe('2025-01-15');
    expect(form.plazoLmiteDeEnvoASII).toBe('10');
    expect(form.cadenciaEnvoFacturasVentaASII).toBe('5');
    expect(form.cadenciaEnvoFacturasCompraASII).toBe('3');
    expect(form.entornoDeProduccin).toBe('Y');
    expect(form.adjuntarArchivosXML).toBe('N');
    expect(form.recc).toBe('N');
    expect(form.redeme).toBe('Y');
    expect(form.monitordate).toBe('2025-06-01');
    expect(form.postedInvoices).toBe('Y');
    expect(form.authorizationno).toBe('AUTH123');
  });

  it('maps missing optional fields to empty strings / default N', () => {
    const form = mapSiiRecordToForm({});
    expect(form.acogidaAlSII).toBe('N');
    expect(form.fechaAcogidaSII).toBe('');
    expect(form.plazoLmiteDeEnvoASII).toBe('');
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
// getTerritoryDefaults
// ---------------------------------------------------------------------------

describe('getTerritoryDefaults', () => {
  it('baleares + inSii=true → sii IVA, no verifactu', () => {
    const d = getTerritoryDefaults('baleares', true);
    expect(d.sii).toEqual({ taxtype: 'IVA' });
    expect(d.verifactu).toBeNull();
    expect(d.tbai).toBeNull();
  });

  it('baleares + inSii=false → verifactu 01, no sii', () => {
    const d = getTerritoryDefaults('baleares', false);
    expect(d.sii).toBeNull();
    expect(d.verifactu).toEqual({ tAXType: '01' });
  });

  it('canarias + inSii=true → IGIC', () => {
    expect(getTerritoryDefaults('canarias', true).sii).toEqual({ taxtype: 'IGIC' });
  });

  it('canarias + inSii=false → verifactu 03', () => {
    expect(getTerritoryDefaults('canarias', false).verifactu).toEqual({ tAXType: '03' });
  });

  it('ceuta + inSii=true → IPSI', () => {
    expect(getTerritoryDefaults('ceuta', true).sii).toEqual({ taxtype: 'IPSI' });
  });

  it('ceuta + inSii=false → verifactu 02', () => {
    expect(getTerritoryDefaults('ceuta', false).verifactu).toEqual({ tAXType: '02' });
  });

  it('navarra → navarra=Y IVA regardless of inSii', () => {
    const d = getTerritoryDefaults('navarra', false);
    expect(d.sii).toEqual({ navarra: 'Y', taxtype: 'IVA' });
    expect(d.verifactu).toBeNull();
  });

  it('alava + inSii=true → sii IVA + tbai ARABA', () => {
    const d = getTerritoryDefaults('alava', true);
    expect(d.sii).toEqual({ taxtype: 'IVA' });
    expect(d.tbai).toEqual({ etsgSifTerritory: 'ARABA' });
  });

  it('alava + inSii=false → only tbai ARABA', () => {
    const d = getTerritoryDefaults('alava', false);
    expect(d.sii).toBeNull();
    expect(d.tbai).toEqual({ etsgSifTerritory: 'ARABA' });
  });

  it('bizkaia + inSii=true → sii IVA + BIZKAIA', () => {
    const d = getTerritoryDefaults('bizkaia', true);
    expect(d.tbai).toEqual({ etsgSifTerritory: 'BIZKAIA' });
  });

  it('bizkaia + inSii=false → only BIZKAIA', () => {
    const d = getTerritoryDefaults('bizkaia', false);
    expect(d.sii).toBeNull();
    expect(d.tbai).toEqual({ etsgSifTerritory: 'BIZKAIA' });
  });

  it('gipuzkoa + inSii=true → guipuzcoa=Y + GIPUZKOA', () => {
    const d = getTerritoryDefaults('gipuzkoa', true);
    expect(d.sii).toEqual({ guipuzcoa: 'Y', taxtype: 'IVA' });
    expect(d.tbai).toEqual({ etsgSifTerritory: 'GIPUZKOA' });
  });

  it('gipuzkoa + inSii=false → only GIPUZKOA', () => {
    const d = getTerritoryDefaults('gipuzkoa', false);
    expect(d.sii).toBeNull();
    expect(d.tbai).toEqual({ etsgSifTerritory: 'GIPUZKOA' });
  });

  it('unknown territory returns all null', () => {
    const d = getTerritoryDefaults('unknown', true);
    expect(d).toEqual({ sii: null, verifactu: null, tbai: null });
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
