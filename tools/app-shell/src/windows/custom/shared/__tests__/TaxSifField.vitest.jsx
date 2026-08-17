// Mocks must come before imports (Vitest hoisting)
import { describe, it, expect, vi, beforeEach } from 'vitest';

const useFiscalConfigMock = vi.fn();
const useAuthMock = vi.fn();

vi.mock('@/windows/custom/fiscal-config/useFiscalConfig.js', () => ({
  useFiscalConfig: (...args) => useFiscalConfigMock(...args),
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => useAuthMock(),
}));

// Stub EntityForm so the render test doesn't pull the full contract-ui tree.
// Capture the props so we can assert what the component passes down.
const entityFormProps = vi.fn();
vi.mock('@/components/contract-ui', () => ({
  EntityForm: (props) => {
    entityFormProps(props);
    return null;
  },
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));

import { render } from '@testing-library/react';
import TaxSifField, { selectSifFields } from '../TaxSifField.jsx';

// Identity ui() so selector output is inspectable by key.
const ui = (key) => key;

function pick(args) {
  return selectSifFields({ ui, ...args });
}

describe('selectSifFields — profiles with no tax-level SIF field', () => {
  it.each(['unconfigured', 'sii', 'sii-navarra', 'conflict', null, undefined])(
    'returns [] for profile %s regardless of flags',
    (profile) => {
      expect(pick({ profile, verifactuRecord: null, data: {} })).toEqual([]);
      expect(pick({ profile, verifactuRecord: null, data: { taxExempt: 'Y' } })).toEqual([]);
      expect(pick({ profile, verifactuRecord: null, data: { notTaxable: 'Y' } })).toEqual([]);
    },
  );
});

describe('selectSifFields — TBAI profiles (always exactly one field)', () => {
  it.each(['tbai', 'sii+tbai'])('exención wins for profile %s', (profile) => {
    const fields = pick({ profile, verifactuRecord: null, data: { taxExempt: 'Y', notTaxable: 'Y' } });
    expect(fields).toHaveLength(1);
    const [f] = fields;
    expect(f.key).toBe('tBAICausaDeExencion');
    expect(f.column).toBe('EM_Tbai_Exemptioncause');
    expect(f.type).toBe('select');
    expect(f.options.length).toBe(6);
  });

  it('no-sujeción when notTaxable=Y and not exempt (one field)', () => {
    const fields = pick({ profile: 'tbai', verifactuRecord: null, data: { taxExempt: 'N', notTaxable: 'Y' } });
    expect(fields).toHaveLength(1);
    expect(fields[0].key).toBe('tbaiNonsubjectcause');
    expect(fields[0].column).toBe('EM_Tbai_Nonsubjectcause');
    expect(fields[0].options.length).toBe(4);
  });

  it('régimen when neither exempt nor non-taxable (one field)', () => {
    const fields = pick({ profile: 'sii+tbai', verifactuRecord: null, data: {} });
    expect(fields).toHaveLength(1);
    expect(fields[0].key).toBe('tbaiClaveregimeniva');
    expect(fields[0].column).toBe('EM_Tbai_Claveregimeniva');
    expect(fields[0].options.length).toBe(21);
  });
});

describe('selectSifFields — Verifactu profile (régimen always + exención/no-sujeción additionally)', () => {
  it('renders nothing without a verifactuRecord (no config for legal entity)', () => {
    expect(pick({ profile: 'verifactu', verifactuRecord: null, data: {} })).toEqual([]);
  });

  it('normal tax → [régimen] only (one field)', () => {
    const fields = pick({ profile: 'verifactu', verifactuRecord: { tAXType: '01' }, data: {} });
    expect(fields.map((f) => f.key)).toEqual(['etvfacVatRegime']);
    expect(fields[0].column).toBe('EM_Etvfac_Vat_Regime');
    expect(fields[0].options.length).toBe(16);
  });

  it('non-subject tax → [régimen, no-sujeción] (two fields, régimen is the tax-type one)', () => {
    const fields = pick({ profile: 'verifactu', verifactuRecord: { tAXType: '01' }, data: { notTaxable: 'Y' } });
    expect(fields).toHaveLength(2);
    expect(fields[0].key).toBe('etvfacVatRegime');
    expect(fields[0].column).toBe('EM_Etvfac_Vat_Regime');
    expect(fields[1].key).toBe('etvfacCauseNotTaxable');
    expect(fields[1].column).toBe('em_etvfac_cause_not_taxable');
    expect(fields[1].options.length).toBe(2);
  });

  it('exempt tax → [régimen, exención] (two fields; exención wins over no-sujeción)', () => {
    const fields = pick({ profile: 'verifactu', verifactuRecord: { tAXType: '01' }, data: { taxExempt: 'Y', notTaxable: 'Y' } });
    expect(fields).toHaveLength(2);
    expect(fields[0].key).toBe('etvfacVatRegime');
    expect(fields[1].key).toBe('etvfacExemptionCause');
    expect(fields[1].column).toBe('EM_Etvfac_Exemption_Cause');
    expect(fields[1].options.length).toBe(8);
  });

  it('tAXType 01 → IVA régimen column', () => {
    const fields = pick({ profile: 'verifactu', verifactuRecord: { tAXType: '01' }, data: {} });
    expect(fields[0].key).toBe('etvfacVatRegime');
    expect(fields[0].column).toBe('EM_Etvfac_Vat_Regime');
    expect(fields[0].options.length).toBe(16);
  });

  it('tAXType 03 → IGIC régimen column', () => {
    const fields = pick({ profile: 'verifactu', verifactuRecord: { tAXType: '03' }, data: {} });
    expect(fields[0].key).toBe('etvfacIGICRegime');
    expect(fields[0].column).toBe('em_etvfac_igic_regime');
    expect(fields[0].options.length).toBe(17);
  });

  it('tAXType 02 → IPSI régimen column', () => {
    const fields = pick({ profile: 'verifactu', verifactuRecord: { tAXType: '02' }, data: {} });
    expect(fields[0].key).toBe('etvfacIPSIRegime');
    expect(fields[0].column).toBe('EM_Etvfac_Ipsi_Regime');
    expect(fields[0].options.length).toBe(6);
  });

  it('non-subject with IGIC config → [IGIC régimen, no-sujeción]', () => {
    const fields = pick({ profile: 'verifactu', verifactuRecord: { tAXType: '03' }, data: { notTaxable: 'Y' } });
    expect(fields.map((f) => f.key)).toEqual(['etvfacIGICRegime', 'etvfacCauseNotTaxable']);
  });

  it('unknown tAXType with no exención/no-sujeción → [] (nothing)', () => {
    expect(pick({ profile: 'verifactu', verifactuRecord: { tAXType: '99' }, data: {} })).toEqual([]);
  });

  it('unknown tAXType but exempt → [exención] only (no régimen)', () => {
    const fields = pick({ profile: 'verifactu', verifactuRecord: { tAXType: '99' }, data: { taxExempt: 'Y' } });
    expect(fields.map((f) => f.key)).toEqual(['etvfacExemptionCause']);
  });
});

describe('selectSifFields — option shape and i18n keys', () => {
  it('builds options as { value, label } with the AEAT code prefix and taxSif.* label key', () => {
    const [f] = pick({ profile: 'tbai', verifactuRecord: null, data: {} });
    const first = f.options[0];
    expect(first.value).toBe('01');
    expect(first.label).toBe('01 — taxSif.opt.tbaiRegime.01');
    expect(f.label).toBe('taxSif.field.tbaiRegime');
  });

  it('treats Etendo boolean variants (true / "Y") as set', () => {
    const [a] = pick({ profile: 'tbai', verifactuRecord: null, data: { taxExempt: true } });
    expect(a.key).toBe('tBAICausaDeExencion');
    const [b] = pick({ profile: 'tbai', verifactuRecord: null, data: { notTaxable: true } });
    expect(b.key).toBe('tbaiNonsubjectcause');
  });

  // ETP-4888 design-polish round — buildOptions() gained ADDITIVE `code`/`description`
  // fields alongside the pre-existing concatenated `label`, for consumers (TaxSifModal's
  // EnumSearchSelect) that render the AEAT code and its description as two distinct
  // pieces instead of one string. TaxSifField's own EntityForm rendering is unaffected —
  // it still only reads `label`.
  it('every option additionally exposes `code` (the raw AEAT value) and `description` (the translated text) alongside the unchanged `label`', () => {
    const [f] = pick({ profile: 'tbai', verifactuRecord: null, data: {} });
    const first = f.options[0];
    expect(first.code).toBe('01');
    expect(first.description).toBe('taxSif.opt.tbaiRegime.01');
    // label is unchanged: still the single concatenated "code — description" string.
    expect(first.label).toBe('01 — taxSif.opt.tbaiRegime.01');
  });

  it('code and description are populated for every option in a multi-entry catalog, not just the first', () => {
    const [f] = pick({ profile: 'tbai', verifactuRecord: null, data: { taxExempt: 'Y' } });
    for (const opt of f.options) {
      expect(opt.code).toBe(opt.value);
      expect(opt.description).toBe(`taxSif.opt.tbaiExemption.${opt.value}`);
    }
  });
});

describe('TaxSifField — orgId resolution (real formFooter wiring)', () => {
  beforeEach(() => {
    useFiscalConfigMock.mockReset();
    useFiscalConfigMock.mockReturnValue({ profile: 'unconfigured', verifactuRecord: null });
    useAuthMock.mockReset();
    useAuthMock.mockReturnValue({ selectedOrg: { id: 'ORG-ACTIVE' } });
    entityFormProps.mockReset();
  });

  it('falls back to the active org (useAuth().selectedOrg) when no orgId prop is passed', () => {
    // The formFooter slot in DetailView does NOT thread orgId. Fiscal config is
    // keyed by the active legal entity — NOT the tax record's own org (taxes are
    // usually defined at org '*', which never matches a SIF config). This is the
    // real wiring scenario and the canonical source every SIF component uses.
    render(<TaxSifField data={{ organization: 'ORG-123' }} apiBaseUrl="/sws/neo/tax" />);
    expect(useFiscalConfigMock).toHaveBeenCalledWith('ORG-ACTIVE', '/sws/neo/tax');
  });

  it('prefers an explicit orgId prop over the active org', () => {
    render(
      <TaxSifField orgId="ORG-EXPLICIT" data={{ organization: 'ORG-123' }} apiBaseUrl="/sws/neo/tax" />,
    );
    expect(useFiscalConfigMock).toHaveBeenCalledWith('ORG-EXPLICIT', '/sws/neo/tax');
  });
});

describe('TaxSifField — render (fields array + label overrides)', () => {
  beforeEach(() => {
    useFiscalConfigMock.mockReset();
    useAuthMock.mockReset();
    useAuthMock.mockReturnValue({ selectedOrg: { id: 'ORG-ACTIVE' } });
    entityFormProps.mockReset();
  });

  it('renders nothing (no EntityForm) when no field applies', () => {
    useFiscalConfigMock.mockReturnValue({ profile: 'sii', verifactuRecord: null });
    const { container } = render(<TaxSifField data={{}} apiBaseUrl="/sws/neo/tax" />);
    expect(container).toBeEmptyDOMElement();
    expect(entityFormProps).not.toHaveBeenCalled();
  });

  it('passes a single field + one-entry labelOverrides for TBAI régimen', () => {
    useFiscalConfigMock.mockReturnValue({ profile: 'tbai', verifactuRecord: null });
    render(<TaxSifField data={{}} apiBaseUrl="/sws/neo/tax" />);
    const props = entityFormProps.mock.calls[0][0];
    expect(props.fields.map((f) => f.key)).toEqual(['tbaiClaveregimeniva']);
    expect(props.labelOverrides).toEqual({
      es_ES: { EM_Tbai_Claveregimeniva: 'taxSif.field.tbaiRegime' },
    });
  });

  it('passes BOTH fields + two-entry labelOverrides for a non-subject Verifactu tax', () => {
    useFiscalConfigMock.mockReturnValue({ profile: 'verifactu', verifactuRecord: { tAXType: '01' } });
    render(<TaxSifField data={{ notTaxable: 'Y' }} apiBaseUrl="/sws/neo/tax" editing />);
    const props = entityFormProps.mock.calls[0][0];
    expect(props.fields.map((f) => f.column)).toEqual([
      'EM_Etvfac_Vat_Regime',
      'em_etvfac_cause_not_taxable',
    ]);
    expect(props.labelOverrides).toEqual({
      es_ES: {
        EM_Etvfac_Vat_Regime: 'taxSif.field.verifactuRegimeIva',
        em_etvfac_cause_not_taxable: 'taxSif.field.verifactuNonSubject',
      },
    });
    // editing=true → no per-field readOnly gate
    expect(props.displayLogic.readOnly).toEqual({});
  });

  it('applies per-field readOnly gate for every selected field when not editing', () => {
    useFiscalConfigMock.mockReturnValue({ profile: 'verifactu', verifactuRecord: { tAXType: '01' } });
    render(<TaxSifField data={{ taxExempt: 'Y' }} apiBaseUrl="/sws/neo/tax" />);
    const props = entityFormProps.mock.calls[0][0];
    expect(props.displayLogic.readOnly).toEqual({
      etvfacVatRegime: true,
      etvfacExemptionCause: true,
    });
  });
});
