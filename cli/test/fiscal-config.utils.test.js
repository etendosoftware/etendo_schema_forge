import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildOnboardingPayloads,
  buildVerifactuUpdatePayload,
  detectProfile,
  getFiscalRecordId,
  getAllowedSystemsForTerritory,
  getCertificateContext,
  getTerritoryDefaults,
  getVerifactuTaxTypeLabel,
  isEtendoTrue,
  mapSiiRecordToForm,
  normalizeDateInputValue,
  normalizeEtendoBoolean,
  normalizeVerifactuTaxType,
  resolveSystem,
  serializeBooleanFields,
  todayIsoDate,
} from '../../tools/app-shell/src/windows/custom/fiscal-config/fiscalConfig.utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const wizardSrc = readFileSync(join(__dirname, '../../tools/app-shell/src/windows/custom/fiscal-config/OnboardingWizard.jsx'), 'utf8');
const fiscalPageSrc = readFileSync(join(__dirname, '../../tools/app-shell/src/windows/custom/fiscal-config/FiscalConfigPage.jsx'), 'utf8');
const siiSectionSrc = readFileSync(join(__dirname, '../../tools/app-shell/src/windows/custom/fiscal-config/SiiSection.jsx'), 'utf8');
const tbaiSectionSrc = readFileSync(join(__dirname, '../../tools/app-shell/src/windows/custom/fiscal-config/TbaiSection.jsx'), 'utf8');
const verifactuSectionSrc = readFileSync(join(__dirname, '../../tools/app-shell/src/windows/custom/fiscal-config/VerifactuSection.jsx'), 'utf8');
const certModalSrc = readFileSync(join(__dirname, '../../tools/app-shell/src/windows/custom/fiscal-config/CertModal.jsx'), 'utf8');
const certSectionSrc = readFileSync(join(__dirname, '../../tools/app-shell/src/windows/custom/fiscal-config/CertSection.jsx'), 'utf8');
const registrySrc = readFileSync(join(__dirname, '../../tools/app-shell/src/windows/registry.js'), 'utf8');

describe('detectProfile', () => {
  it('returns unconfigured when all 3 are null', () => {
    assert.equal(detectProfile(null, null, null), 'unconfigured');
  });

  it('returns unconfigured when all are undefined', () => {
    assert.equal(detectProfile(undefined, undefined, undefined), 'unconfigured');
  });

  it('returns verifactu when only verifactu record exists', () => {
    assert.equal(detectProfile(null, null, { id: '1' }), 'verifactu');
  });

  it('returns verifactu when verifactu is locked (isReady=Y)', () => {
    assert.equal(detectProfile(null, null, { id: '1', isReady: 'Y' }), 'verifactu');
  });

  it('returns sii+tbai when both sii and tbai records exist (Álava/Bizkaia)', () => {
    assert.equal(detectProfile({ taxtype: 'IVA' }, { id: '2' }, null), 'sii+tbai');
  });

  it('returns sii+tbai when both sii and tbai records exist (Gipuzkoa)', () => {
    assert.equal(detectProfile({ guipuzcoa: 'Y', taxtype: 'IVA' }, { id: '2' }, null), 'sii+tbai');
  });

  it('returns sii+tbai when sii has guipuzcoa=Y even without tbai record (legacy fallback)', () => {
    assert.equal(detectProfile({ guipuzcoa: 'Y' }, null, null), 'sii+tbai');
  });

  it('returns sii+tbai when sii boolean flags come back as real booleans', () => {
    assert.equal(detectProfile({ guipuzcoa: true }, { id: '2' }, null), 'sii+tbai');
  });

  it('returns sii-navarra when sii has navarra=Y', () => {
    assert.equal(detectProfile({ navarra: 'Y' }, null, null), 'sii-navarra');
  });

  it('returns sii for plain SII record without navarra or guipuzcoa', () => {
    assert.equal(detectProfile({ id: '1', navarra: 'N', guipuzcoa: 'N' }, null, null), 'sii');
  });

  it('returns tbai when only tbai record exists', () => {
    assert.equal(detectProfile(null, { id: '1' }, null), 'tbai');
  });

  it('returns conflict when verifactu and sii both exist', () => {
    assert.equal(detectProfile({ id: '1' }, null, { id: '2' }), 'conflict');
  });

  it('returns conflict when verifactu and tbai both exist', () => {
    assert.equal(detectProfile(null, { id: '1' }, { id: '2' }), 'conflict');
  });

  it('returns conflict when all 3 exist', () => {
    assert.equal(detectProfile({ id: '1' }, { id: '2' }, { id: '3' }), 'conflict');
  });
});

describe('getTerritoryDefaults', () => {
  it('navarra always creates SII with navarra=Y, no verifactu, no tbai', () => {
    const { sii, verifactu, tbai } = getTerritoryDefaults('navarra', false);
    assert.equal(sii?.navarra, 'Y');
    assert.equal(verifactu, null);
    assert.equal(tbai, null);
  });

  it('navarra ignores the inSii flag (always SII)', () => {
    const { sii } = getTerritoryDefaults('navarra', true);
    assert.equal(sii?.navarra, 'Y');
  });

  it('gipuzkoa + inSii creates SII with guipuzcoa=Y and TBAI', () => {
    const { sii, tbai, verifactu } = getTerritoryDefaults('gipuzkoa', true);
    assert.equal(sii?.guipuzcoa, 'Y');
    assert.ok(tbai, 'tbai should be non-null');
    assert.equal(verifactu, null);
  });

  it('gipuzkoa without SII creates only TBAI', () => {
    const { sii, tbai } = getTerritoryDefaults('gipuzkoa', false);
    assert.equal(sii, null);
    assert.ok(tbai);
  });

  it('baleares + inSii creates SII with taxtype=IVA, no verifactu', () => {
    const { sii, verifactu } = getTerritoryDefaults('baleares', true);
    assert.equal(sii?.taxtype, 'IVA');
    assert.equal(verifactu, null);
  });

  it('baleares without SII creates verifactu with tAXType=01 (IVA)', () => {
    const { sii, verifactu } = getTerritoryDefaults('baleares', false);
    assert.equal(sii, null);
    assert.equal(verifactu?.tAXType, '01');
  });

  it('canarias + inSii creates SII with taxtype=IGIC', () => {
    const { sii } = getTerritoryDefaults('canarias', true);
    assert.equal(sii?.taxtype, 'IGIC');
  });

  it('canarias without SII creates verifactu with tAXType=03 (IGIC)', () => {
    const { verifactu } = getTerritoryDefaults('canarias', false);
    assert.equal(verifactu?.tAXType, '03');
  });

  it('ceuta + inSii creates SII with taxtype=IPSI', () => {
    const { sii } = getTerritoryDefaults('ceuta', true);
    assert.equal(sii?.taxtype, 'IPSI');
  });

  it('ceuta without SII creates verifactu with tAXType=02 (IPSI)', () => {
    const { sii, verifactu } = getTerritoryDefaults('ceuta', false);
    assert.equal(sii, null);
    assert.equal(verifactu?.tAXType, '02');
  });
});

describe('resolveSystem', () => {
  it('sii_foral always returns SII regardless of other params', () => {
    assert.equal(resolveSystem({ regime: 'sii_foral', alsoNational: null, volume: null, lowChoice: null }), 'SII');
  });

  it('tbai without national returns TBAI', () => {
    assert.equal(resolveSystem({ regime: 'tbai', alsoNational: false }), 'TBAI');
  });

  it('tbai with national returns SII+TBAI', () => {
    assert.equal(resolveSystem({ regime: 'tbai', alsoNational: true }), 'SII+TBAI');
  });

  it('siiver high volume returns SII', () => {
    assert.equal(resolveSystem({ regime: 'siiver', volume: 'high' }), 'SII');
  });

  it('siiver low volume + sii choice returns SII', () => {
    assert.equal(resolveSystem({ regime: 'siiver', volume: 'low', lowChoice: 'sii' }), 'SII');
  });

  it('siiver low volume + verifactu choice returns VERIFACTU', () => {
    assert.equal(resolveSystem({ regime: 'siiver', volume: 'low', lowChoice: 'verifactu' }), 'VERIFACTU');
  });

  it('siiver with no volume returns null', () => {
    assert.equal(resolveSystem({ regime: 'siiver', volume: null }), null);
  });

  it('siiver low volume with no choice returns null', () => {
    assert.equal(resolveSystem({ regime: 'siiver', volume: 'low', lowChoice: null }), null);
  });

  it('unknown regime returns null', () => {
    assert.equal(resolveSystem({ regime: 'unknown' }), null);
  });
});

describe('Verifactu tax type mapping', () => {
  it('normalizes display labels to backend codes', () => {
    assert.equal(normalizeVerifactuTaxType('IVA'), '01');
    assert.equal(normalizeVerifactuTaxType('IGIC'), '03');
    assert.equal(normalizeVerifactuTaxType('IPSI'), '02');
  });

  it('keeps backend codes unchanged', () => {
    assert.equal(normalizeVerifactuTaxType('01'), '01');
    assert.equal(normalizeVerifactuTaxType('03'), '03');
    assert.equal(normalizeVerifactuTaxType('02'), '02');
  });

  it('renders backend codes as UI labels', () => {
    assert.equal(getVerifactuTaxTypeLabel('01'), 'IVA');
    assert.equal(getVerifactuTaxTypeLabel('03'), 'IGIC');
    assert.equal(getVerifactuTaxTypeLabel('02'), 'IPSI');
  });

  it('builds Verifactu update payload with editable fields only', () => {
    assert.deepEqual(
      buildVerifactuUpdatePayload({ tAXType: 'IVA', defaultQR: 'Y', issuerNIF: 'should-not-leak' }),
      { tAXType: '01', defaultQR: true },
    );
  });
});

describe('Etendo boolean helpers', () => {
  it('treats Y and true as enabled values', () => {
    assert.equal(isEtendoTrue('Y'), true);
    assert.equal(isEtendoTrue(true), true);
    assert.equal(isEtendoTrue('true'), true);
  });

  it('normalizes boolean-like values to Y/N for form state', () => {
    assert.equal(normalizeEtendoBoolean(true), 'Y');
    assert.equal(normalizeEtendoBoolean(false), 'N');
    assert.equal(normalizeEtendoBoolean('Y'), 'Y');
    assert.equal(normalizeEtendoBoolean('N'), 'N');
  });

  it('serializes fiscal boolean fields as real booleans for NEO writes', () => {
    assert.deepEqual(
      serializeBooleanFields({ produccion: 'N', adjuntos: 'Y', untouched: 'value' }, ['produccion', 'adjuntos']),
      { produccion: false, adjuntos: true, untouched: 'value' },
    );
  });
});

describe('date normalization helpers', () => {
  it('keeps yyyy-MM-dd values unchanged', () => {
    assert.equal(normalizeDateInputValue('2026-04-20'), '2026-04-20');
  });

  it('strips time from timestamp-like backend values', () => {
    assert.equal(normalizeDateInputValue('2026-04-20 00:00:00'), '2026-04-20');
    assert.equal(normalizeDateInputValue('2026-04-20T13:45:00'), '2026-04-20');
  });

  it('converts legacy dd-MM-yyyy values for HTML date inputs', () => {
    assert.equal(normalizeDateInputValue('20-04-2026'), '2026-04-20');
  });
});

describe('buildOnboardingPayloads', () => {
  it('builds verifactu payload with backend tax code and wait time', () => {
    assert.deepEqual(
      buildOnboardingPayloads('VERIFACTU', 'canarias'),
      { sii: null, tbai: null, verifactu: { tAXType: '03', nextSendWaitTime: '60' } },
    );
  });

  it('builds TBAI payloads from territory without hardcoded detail defaults', () => {
    assert.deepEqual(
      buildOnboardingPayloads('TBAI', 'bizkaia'),
      { sii: null, tbai: { etsgSifTerritory: 'BIZKAIA', tbaisystemdate: todayIsoDate() }, verifactu: null },
    );
  });

  it('builds SII+TBAI payloads preserving guipuzcoa flag', () => {
    assert.deepEqual(
      buildOnboardingPayloads('SII+TBAI', 'gipuzkoa'),
      {
        sii: { guipuzcoa: 'Y', taxtype: 'IVA' },
        tbai: { etsgSifTerritory: 'GIPUZKOA', tbaisystemdate: todayIsoDate() },
        verifactu: null,
      },
    );
  });
});

describe('manual flow helpers', () => {
  it('limits manual systems to the selected TBAI territory', () => {
    assert.deepEqual(getAllowedSystemsForTerritory('alava'), ['TBAI', 'SII+TBAI']);
  });

  it('limits manual systems to mainland siiver options', () => {
    assert.deepEqual(getAllowedSystemsForTerritory('baleares'), ['SII', 'VERIFACTU']);
  });

  it('returns no manual systems without selected territory', () => {
    assert.deepEqual(getAllowedSystemsForTerritory(null), []);
  });
});

describe('certificate context', () => {
  it('returns sii for SII and SII+TBAI', () => {
    assert.equal(getCertificateContext('SII'), 'sii');
    assert.equal(getCertificateContext('SII+TBAI'), 'sii');
  });

  it('returns tbai only for pure TBAI', () => {
    assert.equal(getCertificateContext('TBAI'), 'tbai');
  });

  it('returns verifactu for VERIFACTU', () => {
    assert.equal(getCertificateContext('VERIFACTU'), 'verifactu');
  });
});

describe('record identifiers', () => {
  it('extracts the SII backend id field instead of record.id', () => {
    assert.equal(getFiscalRecordId({ id: 'generic', configuracinSII: 'SII-123' }, 'SII'), 'SII-123');
  });

  it('extracts the TBAI backend id field instead of record.id', () => {
    assert.equal(getFiscalRecordId({ id: 'generic', tbaiConfigID: 'TBAI-123' }, 'TBAI'), 'TBAI-123');
  });

  it('extracts the Verifactu backend id field instead of record.id', () => {
    assert.equal(getFiscalRecordId({ id: 'generic', verifactuConfig: 'VF-123' }, 'VERIFACTU'), 'VF-123');
  });
});

describe('SII field mapping', () => {
  it('maps SII record contract keys to form state keys', () => {
    assert.deepEqual(
      mapSiiRecordToForm({
        acogidaAlSII: 'Y',
        fechaAcogidaSII: '2026-04-20',
        plazoLmiteDeEnvoASII: 4,
        cadenciaEnvoFacturasVentaASII: 5,
        cadenciaEnvoFacturasCompraASII: 6,
        entornoDeProduccin: 'N',
        adjuntarArchivosXML: 'Y',
        recc: 'N',
        redeme: 'Y',
        monitordate: '2026-04-21',
        postedInvoices: 'N',
        authorizationno: 'AUTH-1',
      }),
      {
        acogidaAlSII: 'Y',
        fechaAcogidaSII: '2026-04-20',
        plazoLmiteDeEnvoASII: 4,
        cadenciaEnvoFacturasVentaASII: 5,
        cadenciaEnvoFacturasCompraASII: 6,
        entornoDeProduccin: 'N',
        adjuntarArchivosXML: 'Y',
        recc: 'N',
        redeme: 'Y',
        monitordate: '2026-04-21',
        postedInvoices: 'N',
        authorizationno: 'AUTH-1',
      },
    );
  });

  it('maps real boolean API values back to Y/N switches', () => {
    assert.deepEqual(
      mapSiiRecordToForm({
        acogidaAlSII: true,
        entornoDeProduccin: false,
        adjuntarArchivosXML: true,
        recc: false,
        redeme: true,
        postedInvoices: false,
      }),
      {
        acogidaAlSII: 'Y',
        fechaAcogidaSII: '',
        plazoLmiteDeEnvoASII: '',
        cadenciaEnvoFacturasVentaASII: '',
        cadenciaEnvoFacturasCompraASII: '',
        entornoDeProduccin: 'N',
        adjuntarArchivosXML: 'Y',
        recc: 'N',
        redeme: 'Y',
        monitordate: '',
        postedInvoices: 'N',
        authorizationno: '',
      },
    );
  });

  it('normalizes SII date values for HTML date inputs', () => {
    assert.deepEqual(
      mapSiiRecordToForm({
        fechaAcogidaSII: '2026-04-20 00:00:00',
        monitordate: '21-04-2026',
      }),
      {
        acogidaAlSII: 'N',
        fechaAcogidaSII: '2026-04-20',
        plazoLmiteDeEnvoASII: '',
        cadenciaEnvoFacturasVentaASII: '',
        cadenciaEnvoFacturasCompraASII: '',
        entornoDeProduccin: 'N',
        adjuntarArchivosXML: 'N',
        recc: 'N',
        redeme: 'N',
        monitordate: '2026-04-21',
        postedInvoices: 'N',
        authorizationno: '',
      },
    );
  });
});

describe('fiscal-config source guards', () => {
  it('does not render the wizard when no org is selected', () => {
    assert.match(fiscalPageSrc, /if \(\(orgId \|\| mockOverride\) && !showLoading && !showError && effectiveProfile === 'unconfigured'\)/);
  });

  it('uses contract-specific ids for SII, TBAI and Verifactu saves', () => {
    assert.match(siiSectionSrc, /getFiscalRecordId\(record, 'SII'\)/);
    assert.match(siiSectionSrc, /serializeBooleanFields\(form, \['acogidaAlSII', 'entornoDeProduccin', 'adjuntarArchivosXML', 'postedInvoices', 'recc', 'redeme'\]\)/);
    assert.match(wizardSrc, /ref=\{tbaiRef\}/);
    assert.match(verifactuSectionSrc, /getFiscalRecordId\(record, 'VERIFACTU'\)/);
    assert.match(verifactuSectionSrc, /apiFetch\(`\/verifactu-config\//);
    assert.match(verifactuSectionSrc, /buildVerifactuUpdatePayload\(form\)/);
  });

  it('uses SII contract field names instead of legacy raw column aliases', () => {
    assert.match(siiSectionSrc, /mapSiiRecordToForm\(record\)/);
    assert.match(siiSectionSrc, /isEtendoTrue\(form\.acogidaAlSII\)/);
    assert.match(siiSectionSrc, /isEtendoTrue\(form\.entornoDeProduccin\)/);
    assert.match(siiSectionSrc, /form\.plazoLmiteDeEnvoASII/);
    assert.doesNotMatch(siiSectionSrc, /form\.plazo\b/);
    assert.doesNotMatch(siiSectionSrc, /yesno\('insiisystem'\)/);
    assert.doesNotMatch(siiSectionSrc, /yesno\('produccion'\)/);
  });

  it('keeps Verifactu save payload limited to editable fields', () => {
    assert.match(verifactuSectionSrc, /buildVerifactuUpdatePayload\(form\)/);
    assert.doesNotMatch(verifactuSectionSrc, /issuerNIF'.*set\(|set\('issuerNIF'/s);
  });

  it('rethrows Verifactu save failures so the wizard does not advance on error', () => {
    assert.match(verifactuSectionSrc, /throw new Error\(idError\);/);
    assert.match(verifactuSectionSrc, /catch \(err\) \{\s+setError\(err\.message\);\s+throw err;\s+\}/s);
  });

  it('renders Verifactu read-only backend fields as disabled inputs', () => {
    assert.match(verifactuSectionSrc, /value=\{record\?\.inVfactuSystem \?\? ''\} disabled/);
  });

  it('does not keep the Verifactu ready dialog flow in the section', () => {
    assert.doesNotMatch(verifactuSectionSrc, /handleLock/);
    assert.doesNotMatch(verifactuSectionSrc, /Marcar como Listo/);
  });

  it('keeps manual configuration tied to a selected territory', () => {
    assert.match(wizardSrc, /getAllowedSystemsForTerritory\(selectedTerritory\)/);
    assert.match(wizardSrc, /disabled=\{!selectedTerritory \|\| !manualSystem\}/);
    assert.match(wizardSrc, /fiscal\.onboarding\.manual\.system\.placeholder/);
    assert.match(wizardSrc, /onGoToManual=\{\(\) => \{ setManualSystem\(null\); goTo\('manual'\); \}\}/);
  });

  it('returns manual users to the manual screen from confirm', () => {
    assert.match(wizardSrc, /const prevStep = manualSystem \? 'manual' : \(terr && \(terr\.askNational \|\| terr\.askVolume\) \? 'subquestion' : 'territory'\);/);
  });

  it('clears automatic questionnaire answers when territory changes', () => {
    assert.match(wizardSrc, /function handleTerritorySelection\(territoryId, \{ clearManualSystem = false \} = \{\}\)/);
    assert.match(wizardSrc, /setAlsoNational\(null\);/);
    assert.match(wizardSrc, /setVolume\(null\);/);
    assert.match(wizardSrc, /setLowChoice\(null\);/);
    assert.match(wizardSrc, /onSelectTerritory\(territoryId, \{ clearManualSystem: true \}\)/);
  });

  it('saves single-system detail steps before navigating to applied', () => {
    assert.match(wizardSrc, /if \(system === 'SII'\) \{/);
    assert.match(wizardSrc, /await siiRef\.current\?\.save\(\)/);
    assert.match(wizardSrc, /if \(system === 'TBAI'\) \{/);
    assert.match(wizardSrc, /await tbaiRef\.current\?\.save\(\)/);
    assert.match(wizardSrc, /if \(system === 'VERIFACTU'\) \{/);
    assert.match(wizardSrc, /await verifactuRef\.current\?\.save\(\)/);
  });

  it('refetches created fiscal records by id before rendering detail forms', () => {
    assert.match(wizardSrc, /async function createAndFetchRecord\(/);
    assert.match(wizardSrc, /const recordId = getFiscalRecordId\(created, system\);/);
    assert.match(wizardSrc, /apiFetch\(`\/\$\{specName\}\/\$\{entityName\}\/\$\{recordId\}`\)/);
  });

  it('does not expose data-only fiscal specs as window loaders', () => {
    assert.doesNotMatch(registrySrc, /'sii-config': \(\) => import/);
    assert.doesNotMatch(registrySrc, /'tbai-config': \(\) => import/);
    assert.doesNotMatch(registrySrc, /'verifactu-config': \(\) => import/);
  });
});

describe('CertModal — real certificate upload endpoint', () => {
  it('does not simulate verify with setTimeout', () => {
    assert.doesNotMatch(certModalSrc, /setTimeout.*setStep\('done'\)/);
    assert.doesNotMatch(certModalSrc, /setTimeout.*1400/);
  });

  it('POSTs to the /certificate NEO endpoint', () => {
    assert.match(certModalSrc, /\/certificate/);
    assert.match(certModalSrc, /method: 'POST'/);
    assert.match(certModalSrc, /new FormData\(\)/);
    assert.match(certModalSrc, /formData\.append\('certificate', file\)/);
    assert.match(certModalSrc, /formData\.append\('orgId'/);
    assert.match(certModalSrc, /formData\.append\('password', pwd\)/);
  });

  it('shows backend error message and returns to pick step on failure', () => {
    assert.match(certModalSrc, /setErrMsg\(/);
    assert.match(certModalSrc, /setStep\('pick'\)/);
    // NeoResponse.error wraps in { error: { message } } — must read data.error.message
    assert.match(certModalSrc, /data\?\.error\?\.message/);
  });

  it('uses certDetails state from backend response instead of hardcoded values', () => {
    assert.match(certModalSrc, /const \[certDetails, setCertDetails\]/);
    assert.match(certModalSrc, /setCertDetails\(data\.cert/);
    assert.match(certModalSrc, /certDetails\?\.validTo/);
    assert.match(certModalSrc, /certDetails\?\.validFrom/);
    assert.match(certModalSrc, /certDetails\?\.issuer/);
    assert.match(certModalSrc, /certDetails\?\.subject/);
  });

  it('resets certDetails when user changes file after done', () => {
    assert.match(certModalSrc, /setCertDetails\(null\)/);
  });

  it('accepts orgId and apiBaseUrl props without a token prop', () => {
    assert.match(certModalSrc, /\{ context, orgId, apiBaseUrl,/);
    assert.doesNotMatch(certModalSrc, /export default function CertModal\(\{[^}]*\btoken\b/s);
  });

  it('CertSection forwards orgId and apiBaseUrl to CertModal without token', () => {
    assert.match(certSectionSrc, /orgId=\{orgId\}/);
    assert.match(certSectionSrc, /apiBaseUrl=\{apiBaseUrl\}/);
    assert.doesNotMatch(certSectionSrc, /token=\{token\}/);
  });

  it('SiiSection passes orgId to CertSection', () => {
    assert.match(siiSectionSrc, /CertSection[\s\S]{0,100}context="sii"[\s\S]{0,100}orgId=\{orgId\}/);
  });

  it('TbaiSection passes orgId to CertSection', () => {
    assert.match(tbaiSectionSrc, /CertSection[\s\S]{0,100}context="tbai"[\s\S]{0,100}orgId=\{orgId\}/);
  });

  it('VerifactuSection includes CertSection with verifactu context', () => {
    assert.match(verifactuSectionSrc, /CertSection[\s\S]{0,100}context="verifactu"[\s\S]{0,100}orgId=\{orgId\}/);
  });

  it('FiscalConfigPage passes orgId to SiiSection, TbaiSection and VerifactuSection', () => {
    const orgIdCount = (fiscalPageSrc.match(/orgId=\{orgId\}/g) ?? []).length;
    assert.ok(orgIdCount >= 4, `Expected orgId passed to at least 4 section instances, got ${orgIdCount}`);
  });

  it('OnboardingWizard passes orgId and apiBaseUrl to its CertModal without token', () => {
    assert.match(wizardSrc, /orgId=\{orgId\}/);
    assert.match(wizardSrc, /apiBaseUrl=\{apiBaseUrl\}/);
    assert.doesNotMatch(wizardSrc, /CertModal[\s\S]{0,200}token=\{token\}/);
  });

  it('OnboardingWizard detail step passes orgId to SiiSection and TbaiSection', () => {
    // Both detail-step sections must forward orgId so CertModal receives it
    const orgIdInSections = (wizardSrc.match(/orgId=\{orgId\}/g) ?? []).length;
    assert.ok(orgIdInSections >= 3, `Expected orgId on at least 3 section/modal instances in wizard, got ${orgIdInSections}`);
  });
});

describe('CertModal — missing org NIF confirmation flow', () => {
  it('tracks pendingNif state', () => {
    assert.match(certModalSrc, /const \[pendingNif,\s+setPendingNif\]/);
  });

  it('renders confirmNif step when backend returns pendingNifConfirmation', () => {
    assert.match(certModalSrc, /data\.pendingNifConfirmation/);
    assert.match(certModalSrc, /data\.certNif/);
    assert.match(certModalSrc, /setPendingNif\(/);
    assert.match(certModalSrc, /setStep\('confirmNif'\)/);
  });

  it('confirmNif step shows the NIF from the cert', () => {
    assert.match(certModalSrc, /step === 'confirmNif'/);
    assert.match(certModalSrc, /\{pendingNif\}/);
  });

  it('sends setOrgNif=true on confirmation', () => {
    assert.match(certModalSrc, /formData\.append\('setOrgNif', 'true'\)/);
    assert.match(certModalSrc, /setOrgNif.*=.*false/s);
  });

  it('confirmWithNif calls performUpload with setOrgNif true', () => {
    assert.match(certModalSrc, /function confirmWithNif/);
    assert.match(certModalSrc, /performUpload\(true\)/);
  });

  it('resets pendingNif when cancelling from confirmNif step', () => {
    assert.match(certModalSrc, /setPendingNif\(null\)/);
  });

  it('resets pendingNif when file changes', () => {
    // pickFile must clear pendingNif so old NIF is not shown for a new cert
    const pickFileBody = certModalSrc.slice(
      certModalSrc.indexOf('function pickFile'),
      certModalSrc.indexOf('function pickFile') + 300,
    );
    assert.match(pickFileBody, /setPendingNif\(null\)/);
  });

  it('MiniStepper treats confirmNif as verify position', () => {
    assert.match(certModalSrc, /confirmNif.*verify/s);
  });
});
