import { useMemo } from 'react';
import { EntityForm } from '@/components/contract-ui';
import { useUI, useLocaleSwitch } from '@/i18n';
import { useAuth } from '@/auth/AuthContext.jsx';
import { useFiscalConfig } from '@/windows/custom/fiscal-config/useFiscalConfig.js';
import { isEtendoTrue } from '@/windows/custom/fiscal-config/fiscalConfig.utils.js';

/**
 * TaxSifField — renders the applicable SIF (Sistemas de Información de Facturación)
 * tax-key field(s) inline in the Taxes header form.
 *
 * The set of relevant fields depends on the active fiscal profile:
 *   - TBAI / SII+TBAI → EXACTLY ONE field (the three TBAI columns are mutually
 *     exclusive in AD: régimen requires not-exempt & not-non-subject).
 *   - Verifactu → the régimen field (chosen by the config tax type) is ALWAYS
 *     shown, PLUS the exención field when the tax is exempt OR the no-sujeción
 *     field when the tax is non-subject (and not exempt) → 1 or 2 fields.
 * When no field applies (SII / unconfigured / conflict) it renders nothing.
 *
 * Column selection mirrors Etendo Classic's per-field displayLogic on the Tax tab
 * (see artifacts/tax/schema-raw.json):
 *   TBAI / SII+TBAI (mutually exclusive → always exactly ONE):
 *     EM_Tbai_Exemptioncause    @isTaxExempt@='Y'
 *     EM_Tbai_Nonsubjectcause   @IsNoTaxable@='Y' & @isTaxExempt@='N'
 *     EM_Tbai_Claveregimeniva   @isTaxExempt@='N' & @IsNoTaxable@='N'
 *   Verifactu (gated by @etvfac_has_conf_tax@='Y', i.e. a Verifactu config exists
 *   for the legal entity — equivalent to profile==='verifactu' / verifactuRecord present):
 *     EM_Etvfac_Vat_Regime          @etvfac_type_iva@='Y'   (tAXType 01, IVA)  — always
 *     em_etvfac_igic_regime         @etvfac_type_igic@='Y'  (tAXType 03, IGIC) — always
 *     EM_Etvfac_Ipsi_Regime         @etvfac_type_ipsi@='Y'  (tAXType 02, IPSI) — always
 *     EM_Etvfac_Exemption_Cause     @isTaxExempt@='Y'                          — additionally
 *     em_etvfac_cause_not_taxable   @IsNoTaxable@='Y' & @isTaxExempt@='N'      — additionally
 *
 * Crucially, the Verifactu régimen field does NOT depend on exempt/non-subject —
 * it is driven only by the config tax type — so a non-subject or exempt Verifactu
 * tax shows the régimen field AND its exención/no-sujeción field (2 cells). TBAI,
 * by contrast, is always exactly one field.
 *
 * @param {object}  props
 * @param {object}  props.data         current tax record (header entity)
 * @param {string}  [props.orgId]      AD_Org_ID of the legal entity (drives fiscal config).
 *                                     Optional: when omitted (the formFooter slot does not thread
 *                                     it) it falls back to the active org from useAuth().selectedOrg
 *                                     — the canonical fiscal-config org source used by every other
 *                                     SIF component. NOT the tax record's own org: taxes are usually
 *                                     defined at org '*', which never matches a legal-entity SIF config.
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
  // Fiscal config is keyed by the active legal entity, NOT the tax record's own
  // org (taxes are usually defined at org '*', which never matches a SIF config).
  // Prefer an explicit orgId prop (keeps the component generic + tests intact),
  // then the active org from useAuth().selectedOrg — the canonical source every
  // other SIF component uses (sales-invoice/index.jsx, FiscalConfigPage, …).
  const { selectedOrg } = useAuth();
  const { locale } = useLocaleSwitch();
  const resolvedOrgId = orgId ?? selectedOrg?.id ?? null;
  const { profile, verifactuRecord } = useFiscalConfig(resolvedOrgId, apiBaseUrl);

  const selectedFields = useMemo(
    () => selectSifFields({ profile, verifactuRecord, data, ui }),
    [profile, verifactuRecord, data, ui],
  );

  if (selectedFields.length === 0) return null;

  // readOnly gate applies per selected field key when the header form is not editing.
  const displayLogic = editing
    ? { readOnly: {}, visibility: {} }
    : {
        readOnly: Object.fromEntries(selectedFields.map((f) => [f.key, true])),
        visibility: {},
      };

  // Render as bare grid CELLS (renderAsFragment) — NOT a self-contained EntityForm
  // with its own grid. DetailView splices these fragments into the principal header
  // form's grid via its `trailing` slot (see TaxSifField.inlineInHeaderCard), so each
  // field flows into the next free cell of the native header grid, aligned and spaced
  // exactly like a native field, instead of starting its own new row at col 1. When
  // Verifactu selects two fields (régimen + exención/no-sujeción) they each take the
  // next free cell. All field behaviour (registration, readOnly/edit gate, label,
  // options, onChange) is unchanged — only the OUTPUT markup drops the grid wrapper.
  return (
    <EntityForm
      entity="tax"
      fields={selectedFields}
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
      renderAsFragment
      // These SIF columns are now SERVED with their own AD label (e.g. "Clave de
      // Régimen Especial de IVA"), and EntityForm resolves labels as t(column)
      // BEFORE the descriptor's `label` (EntityForm.jsx:1251). Override each column
      // label so the SIF-prefixed label ("TBAI - …" / "Verifactu - …") wins.
      // useLabel expects overrides nested by locale: { [locale]: { [column]: label } }.
      labelOverrides={{
        [locale]: Object.fromEntries(selectedFields.map((f) => [f.column, f.label])),
      }}
      data-testid="TaxSifField__EntityForm" />
  );
}

// Opt into DetailView rendering this footer INSIDE the header card, aligned in the
// same horizontal grid as the native header fields (it is a single inline field, not
// a detached multi-section panel). DetailView reads this static marker to decide
// placement; footers without it (e.g. AssetsDetailPanel) keep the default below-card
// block, so this is purely additive.
TaxSifField.inlineInHeaderCard = true;

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
 * Resolves which SIF field(s) apply to a tax, per the active fiscal profile:
 *   - TBAI/SII+TBAI → exactly ONE (exención → no-sujeción → régimen precedence;
 *     the three columns are mutually exclusive in AD).
 *   - Verifactu → the régimen field for the config tax type is ALWAYS included,
 *     PLUS the exención field when exempt, OR the no-sujeción field when
 *     non-subject (and not exempt). So: normal → [régimen]; non-subject →
 *     [régimen, no-sujeción]; exempt → [régimen, exención].
 *
 * @returns {Array<object>} EntityForm select-field descriptors (0, 1, or 2).
 */
export function selectSifFields({ profile, verifactuRecord, data, ui }) {
  const exempt = isEtendoTrue(data?.taxExempt);
  const nonTaxable = isEtendoTrue(data?.notTaxable);

  if (TBAI_PROFILES.has(profile)) {
    if (exempt) {
      return [buildField('tBAICausaDeExencion', 'EM_Tbai_Exemptioncause', 'taxSif.field.tbaiExemption', 'tbaiExemption', ui)];
    }
    if (nonTaxable) {
      return [buildField('tbaiNonsubjectcause', 'EM_Tbai_Nonsubjectcause', 'taxSif.field.tbaiNonSubject', 'tbaiNonSubject', ui)];
    }
    return [buildField('tbaiClaveregimeniva', 'EM_Tbai_Claveregimeniva', 'taxSif.field.tbaiRegime', 'tbaiRegime', ui)];
  }

  // Verifactu: only when a Verifactu config exists for the legal entity
  // (@etvfac_has_conf_tax@='Y' ≡ profile==='verifactu' / verifactuRecord present).
  // Unlike TBAI, the régimen field is independent of exempt/non-subject: it is
  // always shown (driven by the config tax type), and the exención OR no-sujeción
  // field is shown ADDITIONALLY when the tax's own flags say so.
  if (profile === 'verifactu' && verifactuRecord) {
    const fields = [];
    const regime = VERIFACTU_REGIME_BY_TAX_TYPE[verifactuRecord.tAXType];
    if (regime) {
      fields.push(buildField(regime.key, regime.column, regime.labelKey, regime.optionsKey, ui));
    }
    if (exempt) {
      fields.push(buildField('etvfacExemptionCause', 'EM_Etvfac_Exemption_Cause', 'taxSif.field.verifactuExemption', 'verifactuExemption', ui));
    } else if (nonTaxable) {
      fields.push(buildField('etvfacCauseNotTaxable', 'em_etvfac_cause_not_taxable', 'taxSif.field.verifactuNonSubject', 'verifactuNonSubject', ui));
    }
    return fields;
  }

  // unconfigured | sii | sii-navarra | conflict → nothing at tax level
  return [];
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
