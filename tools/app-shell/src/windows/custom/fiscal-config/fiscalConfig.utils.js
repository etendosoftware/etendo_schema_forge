/**
 * Derives the active fiscal system from territory regime + user answers.
 *
 * @param {'sii_foral'|'tbai'|'siiver'} regime
 * @param {boolean|null} alsoNational - tbai: does the org also operate under SII national?
 * @param {'high'|'low'|null} volume - siiver: annual billing volume threshold
 * @param {'sii'|'verifactu'|null} lowChoice - siiver + low: chosen system
 * @returns {'SII'|'TBAI'|'SII+TBAI'|'VERIFACTU'|null}
 */
export function resolveSystem({ regime, alsoNational, volume, lowChoice }) {
  if (regime === 'sii_foral') return 'SII';
  if (regime === 'tbai') return alsoNational ? 'SII+TBAI' : 'TBAI';
  if (regime === 'siiver') {
    if (volume === 'high') return 'SII';
    if (volume === 'low' && lowChoice === 'sii') return 'SII';
    if (volume === 'low' && lowChoice === 'verifactu') return 'VERIFACTU';
  }
  return null;
}

/**
 * Derives the fiscal profile for an org from the presence/state of its 3 config records.
 *
 * @param {object|null} sii        - SII config record or null
 * @param {object|null} tbai       - TBAI config record or null
 * @param {object|null} verifactu  - Verifactu config record or null
 * @returns {'unconfigured'|'sii'|'sii-navarra'|'sii+tbai'|'tbai'|'verifactu'|'conflict'}
 */
export function detectProfile(sii, tbai, verifactu) {
  if (verifactu && (sii || tbai)) return 'conflict';
  if (verifactu) return 'verifactu';
  // Both SII and TBAI records present → combined system (all territories)
  if (sii && tbai) return 'sii+tbai';
  // Fallback: Gipuzkoa SII+TBAI used to be identified by the guipuzcoa flag alone
  if (sii && isEtendoTrue(sii.guipuzcoa)) return 'sii+tbai';
  if (sii && isEtendoTrue(sii.navarra)) return 'sii-navarra';
  if (sii) return 'sii';
  if (tbai) return 'tbai';
  return 'unconfigured';
}

/**
 * True unless the record is explicitly inactive.
 *
 * NEO Headless reads fiscal-config records with NO_ACTIVE_FILTER=true (see
 * NeoCrudHelper#buildBaseParams), so a "Change SIF" deactivation leaves an
 * inactive trace row that would otherwise still be returned by the API. The
 * DAL→JSON converter always serializes the `active` boolean, so callers must
 * drop inactive rows BEFORE detectProfile() to resolve only the ACTIVE config.
 *
 * A missing `active` property is treated as active (never hide a record on the
 * basis of an absent flag).
 *
 * @param {object|null} record - a fiscal-config API record
 * @returns {boolean}
 */
export function isActiveRecord(record) {
  if (!record) return false;
  if (record.active === undefined || record.active === null) return true;
  return isEtendoTrue(record.active);
}

/**
 * Returns the record only if it is active, else null — used to feed
 * detectProfile() so an inactive trace row (left behind by "Change SIF") never
 * resolves as configured.
 *
 * @param {object|null} record
 * @returns {object|null}
 */
export function activeOrNull(record) {
  return isActiveRecord(record) ? record : null;
}

export function isEtendoTrue(value) {
  return value === true || value === 'Y' || value === 'true';
}

export function isEtendoFalse(value) {
  return value === false || value === 'N' || value === 'false';
}

export function normalizeEtendoBoolean(value, fallback = 'N') {
  if (isEtendoTrue(value)) return 'Y';
  if (isEtendoFalse(value)) return 'N';
  return fallback;
}

export function serializeBooleanFields(form, keys) {
  const payload = { ...form };
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      payload[key] = isEtendoTrue(payload[key]);
    }
  }
  return payload;
}

export function normalizeDateInputValue(value) {
  if (!value) return '';
  if (typeof value !== 'string') return value;

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const dateTimeMatch = value.match(/^(\d{4}-\d{2}-\d{2})[ T]/);
  if (dateTimeMatch) return dateTimeMatch[1];

  const legacyMatch = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (legacyMatch) return `${legacyMatch[3]}-${legacyMatch[2]}-${legacyMatch[1]}`;

  return value;
}

export const VERIFACTU_TAX_TYPE_OPTIONS = [
  { value: '01', label: 'IVA' },
  { value: '03', label: 'IGIC' },
  { value: '02', label: 'IPSI' },
];

const VERIFACTU_TAX_TYPE_BY_LABEL = {
  IVA: '01',
  IGIC: '03',
  IPSI: '02',
};

const VERIFACTU_TAX_TYPE_BY_VALUE = Object.fromEntries(
  VERIFACTU_TAX_TYPE_OPTIONS.map(option => [option.value, option.label]),
);

export function normalizeVerifactuTaxType(value) {
  if (!value) return '';
  return VERIFACTU_TAX_TYPE_BY_LABEL[value] ?? value;
}

export function getVerifactuTaxTypeLabel(value) {
  if (!value) return '';
  return VERIFACTU_TAX_TYPE_BY_VALUE[value] ?? value;
}

export function getAllowedSystemsForTerritory(territory) {
  switch (territory) {
    case 'navarra':
      return ['SII'];
    case 'alava':
    case 'bizkaia':
    case 'gipuzkoa':
      return ['TBAI', 'SII+TBAI'];
    case 'baleares':
    case 'canarias':
    case 'ceuta':
      return ['SII', 'VERIFACTU'];
    default:
      return [];
  }
}

/**
 * Maps the resolved fiscal profile to the i18n key of the permanence notice
 * shown in the "Change SIF" confirm dialog. Purely informational — never blocks.
 *
 * @param {'sii'|'sii-navarra'|'sii+tbai'|'tbai'|'verifactu'} profile
 * @returns {string|null} i18n key, or null if the profile has no notice
 */
export function getChangeSifNoticeKey(profile) {
  switch (profile) {
    case 'sii':
    case 'sii-navarra':
      return 'fiscal.changeSif.notice.sii';
    case 'verifactu':
      return 'fiscal.changeSif.notice.verifactu';
    case 'tbai':
      return 'fiscal.changeSif.notice.tbai';
    case 'sii+tbai':
      return 'fiscal.changeSif.notice.siiTbai';
    default:
      return null;
  }
}

/**
 * Returns which config records must be deactivated to change the SIF, given the
 * active profile. A profile can span more than one system (sii+tbai), so this
 * returns an array of system keys the caller must deactivate.
 *
 * @param {'sii'|'sii-navarra'|'sii+tbai'|'tbai'|'verifactu'} profile
 * @returns {Array<'sii'|'tbai'|'verifactu'>}
 */
export function getSystemsToDeactivate(profile) {
  switch (profile) {
    case 'sii':
    case 'sii-navarra':
      return ['sii'];
    case 'tbai':
      return ['tbai'];
    case 'verifactu':
      return ['verifactu'];
    case 'sii+tbai':
      return ['sii', 'tbai'];
    default:
      return [];
  }
}

export function getCertificateContext(system) {
  if (system === 'SII' || system === 'SII+TBAI') return 'sii';
  if (system === 'TBAI') return 'tbai';
  if (system === 'VERIFACTU') return 'verifactu';
  return null;
}

export function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export function buildOnboardingPayloads(system, territory) {
  const tbaiDefaults = { tbaisystemdate: todayIsoDate() };

  switch (system) {
    case 'SII':
      switch (territory) {
        case 'navarra':
          return { sii: { navarra: 'Y', taxtype: 'IVA' }, tbai: null, verifactu: null };
        case 'gipuzkoa':
          return { sii: { guipuzcoa: 'Y', taxtype: 'IVA' }, tbai: null, verifactu: null };
        case 'baleares':
          return { sii: { taxtype: 'IVA' }, tbai: null, verifactu: null };
        case 'canarias':
          return { sii: { taxtype: 'IGIC' }, tbai: null, verifactu: null };
        case 'ceuta':
          return { sii: { taxtype: 'IPSI' }, tbai: null, verifactu: null };
        default:
          return { sii: null, tbai: null, verifactu: null };
      }
    case 'TBAI':
      switch (territory) {
        case 'alava':
          return { sii: null, tbai: { etsgSifTerritory: 'ARABA', ...tbaiDefaults }, verifactu: null };
        case 'bizkaia':
          return { sii: null, tbai: { etsgSifTerritory: 'BIZKAIA', ...tbaiDefaults }, verifactu: null };
        case 'gipuzkoa':
          return { sii: null, tbai: { etsgSifTerritory: 'GIPUZKOA', ...tbaiDefaults }, verifactu: null };
        default:
          return { sii: null, tbai: null, verifactu: null };
      }
    case 'SII+TBAI':
      switch (territory) {
        case 'alava':
          return { sii: { taxtype: 'IVA' }, tbai: { etsgSifTerritory: 'ARABA', ...tbaiDefaults }, verifactu: null };
        case 'bizkaia':
          return { sii: { taxtype: 'IVA' }, tbai: { etsgSifTerritory: 'BIZKAIA', ...tbaiDefaults }, verifactu: null };
        case 'gipuzkoa':
          return { sii: { guipuzcoa: 'Y', taxtype: 'IVA' }, tbai: { etsgSifTerritory: 'GIPUZKOA', ...tbaiDefaults }, verifactu: null };
        default:
          return { sii: null, tbai: null, verifactu: null };
      }
    case 'VERIFACTU':
      switch (territory) {
        case 'baleares':
          return { sii: null, tbai: null, verifactu: { tAXType: '01', nextSendWaitTime: '60' } };
        case 'canarias':
          return { sii: null, tbai: null, verifactu: { tAXType: '03', nextSendWaitTime: '60' } };
        case 'ceuta':
          return { sii: null, tbai: null, verifactu: { tAXType: '02', nextSendWaitTime: '60' } };
        default:
          return { sii: null, tbai: null, verifactu: null };
      }
    default:
      return { sii: null, tbai: null, verifactu: null };
  }
}

export function buildVerifactuUpdatePayload(form) {
  return {
    tAXType: normalizeVerifactuTaxType(form?.tAXType),
    defaultQR: isEtendoTrue(form?.defaultQR),
  };
}

export function getFiscalRecordId(record, _system) {
  // The extractor now assigns the PK field its java_qualifier via IsKey='Y' (see
  // schema_forge_core commit 5d363ad2f), so NeoFieldFilter no longer renames the
  // PK to a per-system field name (tbaiConfigID / configuracinSII / verifactuConfig) —
  // the API always returns it as `id`, for every system. The `system` param is kept
  // for call-site compatibility in case a future system needs a different lookup.
  if (!record) return null;
  return record.id ?? null;
}

export function mapSiiRecordToForm(record) {
  return {
    acogidaAlSII: normalizeEtendoBoolean(record?.acogidaAlSII),
    fechaAcogidaSII: normalizeDateInputValue(record?.fechaAcogidaSII),
    plazoLmiteDeEnvoASII: record?.plazoLmiteDeEnvoASII ?? '',
    cadenciaEnvoFacturasVentaASII: record?.cadenciaEnvoFacturasVentaASII ?? '',
    cadenciaEnvoFacturasCompraASII: record?.cadenciaEnvoFacturasCompraASII ?? '',
    entornoDeProduccin: normalizeEtendoBoolean(record?.entornoDeProduccin),
    adjuntarArchivosXML: normalizeEtendoBoolean(record?.adjuntarArchivosXML),
    recc: normalizeEtendoBoolean(record?.recc),
    redeme: normalizeEtendoBoolean(record?.redeme),
    monitordate: normalizeDateInputValue(record?.monitordate),
    postedInvoices: normalizeEtendoBoolean(record?.postedInvoices),
    authorizationno: record?.authorizationno ?? '',
  };
}

/**
 * Returns field defaults for record creation based on territory + SII enrollment.
 * Each property is an object of field overrides, or null if that system should not be created.
 *
 * @param {'baleares'|'canarias'|'ceuta'|'navarra'|'alava'|'bizkaia'|'gipuzkoa'} territory
 * @param {boolean} inSii - true if org is enrolled in SII
 * @returns {{ sii: object|null, verifactu: object|null, tbai: object|null }}
 */
export function getTerritoryDefaults(territory, inSii) {
  switch (territory) {
    case 'baleares':
      return inSii
        ? { sii: { taxtype: 'IVA' }, verifactu: null, tbai: null }
        : { sii: null, verifactu: { tAXType: '01' }, tbai: null };
    case 'canarias':
      return inSii
        ? { sii: { taxtype: 'IGIC' }, verifactu: null, tbai: null }
        : { sii: null, verifactu: { tAXType: '03' }, tbai: null };
    case 'ceuta':
      return inSii
        ? { sii: { taxtype: 'IPSI' }, verifactu: null, tbai: null }
        : { sii: null, verifactu: { tAXType: '02' }, tbai: null };
    case 'navarra':
      return { sii: { navarra: 'Y', taxtype: 'IVA' }, verifactu: null, tbai: null };
    case 'alava':
      return inSii
        ? { sii: { taxtype: 'IVA' }, verifactu: null, tbai: { etsgSifTerritory: 'ARABA' } }
        : { sii: null, verifactu: null, tbai: { etsgSifTerritory: 'ARABA' } };
    case 'bizkaia':
      return inSii
        ? { sii: { taxtype: 'IVA' }, verifactu: null, tbai: { etsgSifTerritory: 'BIZKAIA' } }
        : { sii: null, verifactu: null, tbai: { etsgSifTerritory: 'BIZKAIA' } };
    case 'gipuzkoa':
      return inSii
        ? { sii: { guipuzcoa: 'Y', taxtype: 'IVA' }, verifactu: null, tbai: { etsgSifTerritory: 'GIPUZKOA' } }
        : { sii: null, verifactu: null, tbai: { etsgSifTerritory: 'GIPUZKOA' } };
    default:
      return { sii: null, verifactu: null, tbai: null };
  }
}
