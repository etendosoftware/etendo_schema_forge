import { useMemo } from 'react';
import { EntityForm } from '@/components/contract-ui';
import { useUI } from '@/i18n';
import { useFiscalConfig } from '@/windows/custom/fiscal-config/useFiscalConfig.js';
import { isEtendoTrue } from '@/windows/custom/fiscal-config/fiscalConfig.utils.js';

/**
 * TaxSifField — renders EXACTLY ONE SIF (Sistemas de Información de Facturación)
 * tax-key field inline in the Taxes header form.
 *
 * For any given tax at most one SIF field is ever relevant, so this component
 * selects that single field from the active fiscal profile + the tax's own
 * exención / no-sujeción / régimen flags and registers it into the surrounding
 * EntityForm. When no field applies (SII / unconfigured / conflict, or the tax's
 * flags don't match) it renders nothing.
 *
 * Column selection mirrors Etendo Classic's per-field displayLogic on the Tax tab
 * (see artifacts/tax/raw-query-results/fields.csv):
 *   TBAI / SII+TBAI:
 *     EM_Tbai_Exemptioncause    @isTaxExempt@='Y'
 *     EM_Tbai_Nonsubjectcause   @IsNoTaxable@='Y' & @isTaxExempt@='N'
 *     EM_Tbai_Claveregimeniva   @isTaxExempt@='N' & @IsNoTaxable@='N'
 *   Verifactu (gated by @etvfac_has_conf_tax@='Y', i.e. a Verifactu config exists
 *   for the legal entity — equivalent to profile==='verifactu' / verifactuRecord present;
 *   the régimen column is chosen by @etvfac_type_iva/igic/ipsi@, i.e. verifactuRecord.tAXType):
 *     EM_Etvfac_Exemption_Cause     @isTaxExempt@='Y'
 *     em_etvfac_cause_not_taxable   @IsNoTaxable@='Y' & @isTaxExempt@='N'
 *     EM_Etvfac_Vat_Regime          tAXType=01 (IVA) & régimen
 *     em_etvfac_igic_regime         tAXType=03 (IGIC) & régimen
 *     EM_Etvfac_Ipsi_Regime         tAXType=02 (IPSI) & régimen
 *
 * Selection precedence (never two fields at once): exención wins over no-sujeción
 * wins over régimen.
 *
 * @param {object}  props
 * @param {object}  props.data         current tax record (header entity)
 * @param {string}  props.orgId        AD_Org_ID of the tax's legal entity (drives fiscal config)
 * @param {string}  props.token        NEO bearer token (forwarded to EntityForm)
 * @param {string}  props.apiBaseUrl   NEO API base (drives useFiscalConfig + EntityForm)
 * @param {object}  props.api          contract api (forwarded to EntityForm)
 * @param {object}  props.catalogs     FK catalogs (forwarded to EntityForm)
 * @param {boolean} props.editing      whether the header form is in edit mode
 * @param {Function} props.onChange    field change handler (key, value, column)
 * @param {Function} props.registerFields  DetailView field registrar (validation gate)
 * @param {object}  props.fieldErrors  DetailView field-error map
 */
export default function TaxSifField({
  data,
  orgId,
  token,
  apiBaseUrl,
  api,
  catalogs,
  editing = false,
  onChange,
  registerFields,
  fieldErrors,
}) {
  const ui = useUI();
  const { profile, verifactuRecord } = useFiscalConfig(orgId, apiBaseUrl);

  const field = useMemo(
    () => selectSifField({ profile, verifactuRecord, data, ui }),
    [profile, verifactuRecord, data, ui],
  );

  if (!field) return null;

  const displayLogic = editing
    ? { readOnly: {}, visibility: {} }
    : { readOnly: { [field.key]: true }, visibility: {} };

  return (
    <EntityForm
      entity="tax"
      fields={[field]}
      data={data}
      onChange={onChange}
      catalogs={catalogs}
      api={api}
      token={token}
      apiBaseUrl={apiBaseUrl}
      displayLogic={displayLogic}
      registerFields={registerFields}
      fieldErrors={fieldErrors}
      layout="horizontal"
      data-testid="TaxSifField__EntityForm" />
  );
}

// ---------------------------------------------------------------------------
// Field selection (pure — exported for unit testing)
// ---------------------------------------------------------------------------

const TBAI_PROFILES = new Set(['tbai', 'sii+tbai']);

// Verifactu tAXType → régimen column + option builder key. tAXType 01=IVA, 03=IGIC, 02=IPSI
// (see VERIFACTU_TAX_TYPE_OPTIONS in fiscalConfig.utils.js).
const VERIFACTU_REGIME_BY_TAX_TYPE = {
  '01': { key: 'etvfacVatRegime', column: 'EM_Etvfac_Vat_Regime', labelKey: 'taxSif.field.verifactuRegimeIva', optionsKey: 'verifactuVatRegime' },
  '03': { key: 'etvfacIGICRegime', column: 'em_etvfac_igic_regime', labelKey: 'taxSif.field.verifactuRegimeIgic', optionsKey: 'verifactuIgicRegime' },
  '02': { key: 'etvfacIPSIRegime', column: 'EM_Etvfac_Ipsi_Regime', labelKey: 'taxSif.field.verifactuRegimeIpsi', optionsKey: 'verifactuIpsiRegime' },
};

/**
 * Resolves which single SIF field (if any) applies to a tax, following the
 * exención → no-sujeción → régimen precedence and the active fiscal profile.
 *
 * @returns {object|null} an EntityForm select-field descriptor, or null.
 */
export function selectSifField({ profile, verifactuRecord, data, ui }) {
  const exempt = isEtendoTrue(data?.taxExempt);
  const nonTaxable = isEtendoTrue(data?.notTaxable);

  if (TBAI_PROFILES.has(profile)) {
    if (exempt) {
      return buildField('tBAICausaDeExencion', 'EM_Tbai_Exemptioncause', 'taxSif.field.tbaiExemption', 'tbaiExemption', ui);
    }
    if (nonTaxable) {
      return buildField('tbaiNonsubjectcause', 'EM_Tbai_Nonsubjectcause', 'taxSif.field.tbaiNonSubject', 'tbaiNonSubject', ui);
    }
    return buildField('tbaiClaveregimeniva', 'EM_Tbai_Claveregimeniva', 'taxSif.field.tbaiRegime', 'tbaiRegime', ui);
  }

  // Verifactu: only when a Verifactu config exists for the legal entity
  // (@etvfac_has_conf_tax@='Y' ≡ profile==='verifactu' / verifactuRecord present).
  if (profile === 'verifactu' && verifactuRecord) {
    if (exempt) {
      return buildField('etvfacExemptionCause', 'EM_Etvfac_Exemption_Cause', 'taxSif.field.verifactuExemption', 'verifactuExemption', ui);
    }
    if (nonTaxable) {
      return buildField('etvfacCauseNotTaxable', 'em_etvfac_cause_not_taxable', 'taxSif.field.verifactuNonSubject', 'verifactuNonSubject', ui);
    }
    const regime = VERIFACTU_REGIME_BY_TAX_TYPE[verifactuRecord.tAXType];
    if (regime) {
      return buildField(regime.key, regime.column, regime.labelKey, regime.optionsKey, ui);
    }
  }

  // unconfigured | sii | sii-navarra | conflict → nothing at tax level
  return null;
}

function buildField(key, column, labelKey, optionsKey, ui) {
  return {
    key,
    column,
    type: 'select',
    label: ui(labelKey),
    options: buildOptions(optionsKey, ui),
    section: 'principal',
  };
}

// ---------------------------------------------------------------------------
// AD List option catalogs (values from ad_ref_list; labels via i18n)
// ---------------------------------------------------------------------------
// The label text of each value is an official AEAT catalog description, so it is
// resolved through i18n like every other user-visible string. Value codes are the
// stable AD_Ref_List.value keys and are NOT translated.

const OPTION_VALUES = {
  tbaiRegime: ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '17', '19', '51', '52', '53', '54'],
  tbaiNonSubject: ['IE', 'OT', 'RL', 'VT'],
  tbaiExemption: ['E1', 'E2', 'E3', 'E4', 'E5', 'E6'],
  verifactuVatRegime: ['01', '02', '03', '04', '05', '07', '08', '09', '10', '11', '14', '15', '17', '18', '19', '20'],
  verifactuIgicRegime: ['01', '02', '03', '04', '05', '07', '08', '09', '10', '11', '14', '15', '17', '18', '19', '20', '21'],
  verifactuIpsiRegime: ['01', '08', '11', '18', '19', '20'],
  verifactuExemption: ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8'],
  verifactuNonSubject: ['N1', 'N2'],
};

function buildOptions(optionsKey, ui) {
  return OPTION_VALUES[optionsKey].map((value) => ({
    value,
    // Prefix code so the AEAT key stays visible even before/without a translation.
    label: `${value} — ${ui(`taxSif.opt.${optionsKey}.${value}`)}`,
  }));
}
