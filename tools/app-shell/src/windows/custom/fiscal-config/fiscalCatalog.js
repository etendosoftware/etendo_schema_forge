// The fiscal territories and systems the Fiscal Configuration window talks about: their logic
// flags and their translated display strings. Shared by the onboarding wizard and the status
// summary of an existing configuration (ETP-5831), so both name a territory / Hacienda / system
// the same way.

// ── Data (IDs and logic flags — display strings resolved via ui() inside component) ───

export const TERRITORY_META = {
  navarra:  { id: 'navarra',  regime: 'sii_foral', askNational: false, askVolume: false, taxtype: 'IVA',  tbaiTerritory: null,       guipuzcoa: null },
  alava:    { id: 'alava',    regime: 'tbai',       askNational: true,  askVolume: false, taxtype: null,   tbaiTerritory: 'ARABA',    guipuzcoa: null },
  bizkaia:  { id: 'bizkaia',  regime: 'tbai',       askNational: true,  askVolume: false, taxtype: null,   tbaiTerritory: 'BIZKAIA',  guipuzcoa: null },
  gipuzkoa: { id: 'gipuzkoa', regime: 'tbai',       askNational: true,  askVolume: false, taxtype: null,   tbaiTerritory: 'GIPUZKOA', guipuzcoa: 'Y'  },
  baleares: { id: 'baleares', regime: 'siiver',     askNational: false, askVolume: true,  taxtype: 'IVA',  tbaiTerritory: null,       guipuzcoa: null },
  canarias: { id: 'canarias', regime: 'siiver',     askNational: false, askVolume: true,  taxtype: 'IGIC', tbaiTerritory: null,       guipuzcoa: null },
  // askVolume: false — unlike baleares/canarias, Ceuta/Melilla's IPSI tax scheme has no
  // SII billing-volume threshold to ask about: SII cannot represent an IPSI taxpayer at
  // all (AEATSII_CONFIG.taxtype only defines IVA/IGIC — see getAllowedSystemsForTerritory
  // in fiscalConfig.utils.js, ETP-5272 point 4), so VERIFACTU is the only applicable
  // system regardless of volume and the sub-question would be moot.
  ceuta:    { id: 'ceuta',    regime: 'siiver',     askNational: false, askVolume: false, taxtype: 'IPSI', tbaiTerritory: null,       guipuzcoa: null },
};

export const TERRITORY_GROUP_META = [
  { regime: 'sii_foral', items: ['navarra'] },
  { regime: 'tbai',      items: ['alava', 'bizkaia', 'gipuzkoa'] },
  { regime: 'siiver',    items: ['baleares', 'canarias', 'ceuta'] },
];

/** Territories with their translated labels (`name`, `system`, `systemLong`, `example`). */
export function buildTerritories(ui) {
  return {
    navarra:  { ...TERRITORY_META.navarra,  name: ui('fiscal.territory.navarra'),  system: ui('fiscal.territory.system.sii'),    systemLong: ui('fiscal.territory.navarra.systemLong'),  example: ui('fiscal.territory.navarra.example')  },
    alava:    { ...TERRITORY_META.alava,    name: ui('fiscal.territory.alava'),    system: ui('fiscal.territory.system.tbai'),   systemLong: ui('fiscal.territory.alava.systemLong'),    example: ui('fiscal.territory.alava.example')    },
    bizkaia:  { ...TERRITORY_META.bizkaia,  name: ui('fiscal.territory.bizkaia'),  system: ui('fiscal.territory.system.tbai'),   systemLong: ui('fiscal.territory.bizkaia.systemLong'),  example: ui('fiscal.territory.bizkaia.example')  },
    gipuzkoa: { ...TERRITORY_META.gipuzkoa, name: ui('fiscal.territory.gipuzkoa'), system: ui('fiscal.territory.system.tbai'),   systemLong: ui('fiscal.territory.gipuzkoa.systemLong'), example: ui('fiscal.territory.gipuzkoa.example') },
    baleares: { ...TERRITORY_META.baleares, name: ui('fiscal.territory.espania'),  system: ui('fiscal.territory.system.siiver'), systemLong: ui('fiscal.territory.baleares.systemLong'), example: ui('fiscal.territory.baleares.example') },
    canarias: { ...TERRITORY_META.canarias, name: ui('fiscal.territory.canarias'), system: ui('fiscal.territory.system.siiver'), systemLong: ui('fiscal.territory.canarias.systemLong'), example: ui('fiscal.territory.canarias.example') },
    // ETP-5272 point 4: badge is VERI*FACTU-only (not the shared 'siiver' SII/VERI*FACTU
    // badge) — SII cannot represent an IPSI (Ceuta/Melilla) taxpayer at all, so it is
    // never a real option here, unlike baleares/canarias.
    ceuta:    { ...TERRITORY_META.ceuta,    name: ui('fiscal.territory.ceuta'),    system: ui('fiscal.territory.system.verifactu'), systemLong: ui('fiscal.territory.ceuta.systemLong'),    example: ui('fiscal.territory.ceuta.example')    },
  };
}

/** Fiscal systems with their translated labels (`name`, `long`, `desc`). */
export function buildSystems(ui) {
  return {
    SII:       { id: 'SII',       name: 'SII',        long: ui('fiscal.system.sii.long'),      desc: ui('fiscal.system.sii.desc')      },
    TBAI:      { id: 'TBAI',      name: 'TicketBAI',         long: ui('fiscal.system.tbai.long'),     desc: ui('fiscal.system.tbai.desc')     },
    'SII+TBAI':{ id: 'SII+TBAI',  name: 'SII + TicketBAI',  long: ui('fiscal.system.siitbai.long'),  desc: ui('fiscal.system.siitbai.desc')  },
    VERIFACTU: { id: 'VERIFACTU', name: 'VERI*FACTU',  long: ui('fiscal.system.verifactu.long'), desc: ui('fiscal.system.verifactu.desc') },
  };
}
