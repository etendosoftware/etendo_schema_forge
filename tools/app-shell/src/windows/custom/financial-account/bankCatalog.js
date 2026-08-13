/**
 * Static catalog of popular Spanish banks for the offline "New Account" flow
 * (ETP-4096). The bank picker shows these as the "Populares" grid and filters
 * them with the search box.
 *
 * Follow-up: the real source for bank institutions/logos is still TBD. The UI
 * only reads `{ id, name }`, so swapping this constant for a backend endpoint
 * later requires no component changes.
 */

export const BANK_CATALOG = [
  { id: 'santander', name: 'Banco Santander' },
  { id: 'caixabank', name: 'CaixaBank' },
  { id: 'bbva', name: 'BBVA' },
  { id: 'sabadell', name: 'Banco Sabadell' },
  { id: 'cajamar', name: 'Cajamar' },
  { id: 'ruralvia', name: 'RuralVia' },
  { id: 'ing', name: 'ING Direct' },
  { id: 'unicaja', name: 'Unicaja' },
  { id: 'ibercaja', name: 'IberCaja' },
];

/** Case-insensitive substring search over bank names. Empty query returns all. */
export function searchBanks(query) {
  const needle = String(query ?? '').trim().toLowerCase();
  if (!needle) return BANK_CATALOG;
  return BANK_CATALOG.filter((bank) => bank.name.toLowerCase().includes(needle));
}

/**
 * Institution variants shown after picking a bank (Figma: "Banco Santander",
 * "(Empresas)", "(Usuario)"). Derived from the bank name until a real source
 * exists; the `personal`/`business` ids are stable so tests can target them.
 */
export function institutionsFor(bank) {
  if (!bank) return [];
  return [
    { id: `${bank.id}-default`, name: bank.name },
    { id: `${bank.id}-business`, name: `${bank.name} (Empresas)` },
    { id: `${bank.id}-personal`, name: `${bank.name} (Usuario)` },
  ];
}
