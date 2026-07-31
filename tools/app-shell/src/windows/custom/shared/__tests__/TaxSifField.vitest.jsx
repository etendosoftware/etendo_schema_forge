import { describe, it, expect } from 'vitest';
import { selectSifField } from '../TaxSifField.jsx';

// Identity ui() so selector output is inspectable by key.
const ui = (key) => key;

function pick(args) {
  return selectSifField({ ui, ...args });
}

describe('selectSifField — profiles with no tax-level SIF field', () => {
  it.each(['unconfigured', 'sii', 'sii-navarra', 'conflict', null, undefined])(
    'returns null for profile %s regardless of flags',
    (profile) => {
      expect(pick({ profile, verifactuRecord: null, data: {} })).toBeNull();
      expect(pick({ profile, verifactuRecord: null, data: { taxExempt: 'Y' } })).toBeNull();
      expect(pick({ profile, verifactuRecord: null, data: { notTaxable: 'Y' } })).toBeNull();
    },
  );
});

describe('selectSifField — TBAI profiles', () => {
  it.each(['tbai', 'sii+tbai'])('exención wins for profile %s', (profile) => {
    const f = pick({ profile, verifactuRecord: null, data: { taxExempt: 'Y', notTaxable: 'Y' } });
    expect(f.key).toBe('tBAICausaDeExencion');
    expect(f.column).toBe('EM_Tbai_Exemptioncause');
    expect(f.type).toBe('select');
    expect(f.options.length).toBe(6);
  });

  it('no-sujeción when notTaxable=Y and not exempt', () => {
    const f = pick({ profile: 'tbai', verifactuRecord: null, data: { taxExempt: 'N', notTaxable: 'Y' } });
    expect(f.key).toBe('tbaiNonsubjectcause');
    expect(f.column).toBe('EM_Tbai_Nonsubjectcause');
    expect(f.options.length).toBe(4);
  });

  it('régimen when neither exempt nor non-taxable', () => {
    const f = pick({ profile: 'sii+tbai', verifactuRecord: null, data: {} });
    expect(f.key).toBe('tbaiClaveregimeniva');
    expect(f.column).toBe('EM_Tbai_Claveregimeniva');
    expect(f.options.length).toBe(21);
  });
});

describe('selectSifField — Verifactu profile', () => {
  it('renders nothing without a verifactuRecord (no config for legal entity)', () => {
    expect(pick({ profile: 'verifactu', verifactuRecord: null, data: {} })).toBeNull();
  });

  it('exención wins over no-sujeción and régimen', () => {
    const f = pick({ profile: 'verifactu', verifactuRecord: { tAXType: '01' }, data: { taxExempt: 'Y', notTaxable: 'Y' } });
    expect(f.key).toBe('etvfacExemptionCause');
    expect(f.column).toBe('EM_Etvfac_Exemption_Cause');
    expect(f.options.length).toBe(8);
  });

  it('no-sujeción when notTaxable=Y and not exempt', () => {
    const f = pick({ profile: 'verifactu', verifactuRecord: { tAXType: '01' }, data: { notTaxable: 'Y' } });
    expect(f.key).toBe('etvfacCauseNotTaxable');
    expect(f.column).toBe('em_etvfac_cause_not_taxable');
    expect(f.options.length).toBe(2);
  });

  it('IVA (tAXType 01) régimen', () => {
    const f = pick({ profile: 'verifactu', verifactuRecord: { tAXType: '01' }, data: {} });
    expect(f.key).toBe('etvfacVatRegime');
    expect(f.column).toBe('EM_Etvfac_Vat_Regime');
    expect(f.options.length).toBe(16);
  });

  it('IGIC (tAXType 03) régimen', () => {
    const f = pick({ profile: 'verifactu', verifactuRecord: { tAXType: '03' }, data: {} });
    expect(f.key).toBe('etvfacIGICRegime');
    expect(f.column).toBe('em_etvfac_igic_regime');
    expect(f.options.length).toBe(17);
  });

  it('IPSI (tAXType 02) régimen', () => {
    const f = pick({ profile: 'verifactu', verifactuRecord: { tAXType: '02' }, data: {} });
    expect(f.key).toBe('etvfacIPSIRegime');
    expect(f.column).toBe('EM_Etvfac_Ipsi_Regime');
    expect(f.options.length).toBe(6);
  });

  it('returns null for an unknown tAXType with no exención/no-sujeción', () => {
    expect(pick({ profile: 'verifactu', verifactuRecord: { tAXType: '99' }, data: {} })).toBeNull();
  });
});

describe('selectSifField — option shape and i18n keys', () => {
  it('builds options as { value, label } with the AEAT code prefix and taxSif.* label key', () => {
    const f = pick({ profile: 'tbai', verifactuRecord: null, data: {} });
    const first = f.options[0];
    expect(first.value).toBe('01');
    expect(first.label).toBe('01 — taxSif.opt.tbaiRegime.01');
    expect(f.label).toBe('taxSif.field.tbaiRegime');
  });

  it('treats Etendo boolean variants (true / "Y") as set', () => {
    const a = pick({ profile: 'tbai', verifactuRecord: null, data: { taxExempt: true } });
    expect(a.key).toBe('tBAICausaDeExencion');
    const b = pick({ profile: 'tbai', verifactuRecord: null, data: { notTaxable: true } });
    expect(b.key).toBe('tbaiNonsubjectcause');
  });
});
