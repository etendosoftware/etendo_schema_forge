// Small country-name -> flag-emoji lookup for the read-only "País" pill on the
// Organización screen (ETP-4749 visual polish pass). This is a presentation-only
// heuristic — there is no dedicated country-code field on this window's contract
// yet (País is derived from the fiscal address identifier text; see
// deriveCountryFromIdentifier in OrganizationPage.jsx). Extend this map if a new
// country name shows up; unknown names simply render without a flag.
const COUNTRY_FLAGS = {
  'España': '🇪🇸',
  'Portugal': '🇵🇹',
  'Francia': '🇫🇷',
  'Andorra': '🇦🇩',
  'México': '🇲🇽',
  'Argentina': '🇦🇷',
  'Colombia': '🇨🇴',
  'Chile': '🇨🇱',
  'Estados Unidos': '🇺🇸',
};

export function getCountryFlag(countryName) {
  return COUNTRY_FLAGS[countryName] || '';
}
