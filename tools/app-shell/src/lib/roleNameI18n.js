/**
 * Shared i18n key mapping for GOClient's 4 fixed non-admin role names (Finance/Sales/Purchasing/
 * Inventory), matched by AD_Role.name since it's consistent across every tenant (cloned verbatim
 * by OnboardingRoleProvisioningService / the R16 data-fix). Used by both RolesOverviewPage.jsx
 * (which also needs a description key, kept local to that file) and AssignRoleControl.jsx (which
 * only needs the name) so a role's display name is translated everywhere it's shown, not just in
 * the Roles overview page.
 *
 * The 5th role (client-admin) is NOT in this map — its NAME varies per tenant ("RolesPresa Admin"
 * vs "GOClient Admin" vs any future tenant's own) — callers that can identify it via an
 * `isClientAdmin` flag should use ADMIN_NAME_I18N_KEY instead of looking it up here.
 */
export const ROLE_NAME_I18N_KEYS = {
  Finance: 'roleNameFinance',
  Sales: 'roleNameSales',
  Purchasing: 'roleNamePurchasing',
  Inventory: 'roleNameInventory',
};

/** i18n key for the client-admin role's generic display name, identified by `isClientAdmin`. */
export const ADMIN_NAME_I18N_KEY = 'roleNameAdmin';

/**
 * Resolves a role's display name from its raw AD_Role.name: the i18n translation for one of the
 * 4 fixed names, or the raw name as a fallback for anything else this map doesn't recognize (a
 * client-admin role, whose name varies per tenant, or a future user-created role).
 */
export function resolveRoleDisplayName(ui, name) {
  const key = ROLE_NAME_I18N_KEYS[name];
  return key ? ui(key) : name;
}
