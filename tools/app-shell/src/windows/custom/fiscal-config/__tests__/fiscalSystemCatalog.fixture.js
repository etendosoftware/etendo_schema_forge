// Test fixture, not a test: the `fiscalSystemCatalog` answer of com.etendoerp.go
// (FiscalSifRules.catalog()), shared by the fiscal-config suites so every one of them reads the
// territory × system rules the backend really serves. Keep it in sync with
// FiscalSifRules.ALLOWED / recordPayload / TBAI_TERRITORY / VERIFACTU_TAX_TYPE.

export const FISCAL_SYSTEM_CATALOG = Object.freeze({
  systems: ['SII', 'TBAI', 'SII+TBAI', 'VERIFACTU'],
  territories: [
    { territory: 'navarra', systems: ['SII'], sii: { navarra: true, guipuzcoa: false, taxtype: 'IVA' }, tbaiTerritory: null, verifactuTaxType: null },
    { territory: 'alava', systems: ['TBAI', 'SII+TBAI'], sii: { navarra: false, guipuzcoa: false, taxtype: 'IVA' }, tbaiTerritory: 'ARABA', verifactuTaxType: null },
    { territory: 'bizkaia', systems: ['TBAI', 'SII+TBAI'], sii: { navarra: false, guipuzcoa: false, taxtype: 'IVA' }, tbaiTerritory: 'BIZKAIA', verifactuTaxType: null },
    { territory: 'gipuzkoa', systems: ['TBAI', 'SII+TBAI'], sii: { navarra: false, guipuzcoa: true, taxtype: 'IVA' }, tbaiTerritory: 'GIPUZKOA', verifactuTaxType: null },
    { territory: 'baleares', systems: ['SII', 'VERIFACTU'], sii: { navarra: false, guipuzcoa: false, taxtype: 'IVA' }, tbaiTerritory: null, verifactuTaxType: '01' },
    { territory: 'canarias', systems: ['SII', 'VERIFACTU'], sii: { navarra: false, guipuzcoa: false, taxtype: 'IGIC' }, tbaiTerritory: null, verifactuTaxType: '03' },
    { territory: 'ceuta', systems: ['VERIFACTU'], sii: null, tbaiTerritory: null, verifactuTaxType: '02' },
  ],
});
