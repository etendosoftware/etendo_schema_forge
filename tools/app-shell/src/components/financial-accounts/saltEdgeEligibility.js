/**
 * Which accounts may be connected to the Salt Edge (PSD2) bank-integration service.
 *
 * ETP-4896: the service is contracted for Spain only, so an account whose Country is not Spain
 * must not be offered the connect action at all. This module is the single source of that rule —
 * it is consumed by every surface that exposes "Conectar banco" (the edit modal's button, the
 * list row's inline link and the row kebab's menu item), so the rule cannot drift between them.
 *
 * Deliberately keyed on the account's **stored** country (`countryIso`, injected server-side by
 * both list shapes — `FinancialAccountHandler.enrichRecord` for the W spec and
 * `FinancialAccountsPageHandler` for the R spec), not on a pending, unsaved form selection. That
 * matches the acceptance criteria, which gate on the saved value: "el usuario cambia el país […]
 * **guarda el cambio** → la opción de conexión se deshabilita". Since saving closes the modal and
 * reloads the list, the next render already reflects the new country.
 */

/** ISO 3166-1 alpha-2 code of the only country Salt Edge is contracted for. */
export const SALT_EDGE_COUNTRY_ISO = 'ES';

/**
 * `true` when this account may be connected to Salt Edge — i.e. its stored country is Spain.
 *
 * A missing/blank `countryIso` returns `false`: it is genuinely unknown, not implicitly Spain.
 * That case is common on rows created before ETP-4896 made Country a required field, and reading
 * "unknown" as "Spain" would offer a connection the service would then reject.
 *
 * @param {{ countryIso?: string }} account - an account row from either list spec.
 * @returns {boolean}
 */
export function canConnectToSaltEdge(account) {
  const iso = account?.countryIso;
  return typeof iso === 'string' && iso.trim().toUpperCase() === SALT_EDGE_COUNTRY_ISO;
}
