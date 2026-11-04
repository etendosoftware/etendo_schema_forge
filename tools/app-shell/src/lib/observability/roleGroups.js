/**
 * ETP-6043 — `role_groups`: the coarse functional areas of the session's active role, sent as a
 * common property of every analytics event so a KPI can segment by role (first consumer: the
 * Product «Movimientos» tab KPIs, ETP-5889).
 *
 * The groups come from the system role TEMPLATES composed into the user's personal role
 * (`selectedRole.effectiveRoleNames`, ETP-4852/ETP-5329), never from the role's own name, which is
 * free text per tenant and may carry the company name. A user may compose several templates at
 * once (e.g. Inventory + Sales), so the property is a list.
 */
const TEMPLATE_ROLE_GROUPS = new Map([
  ['Inventory', 'warehouse'],
  ['Sales', 'sales'],
  ['Purchasing', 'purchasing'],
  ['Finance', 'finance'],
]);

export const ROLE_GROUP_ADMIN = 'admin';
export const ROLE_GROUP_OTHER = 'other';

/** Every value `role_groups` may carry; the payload sanitizer drops anything else. */
export const ROLE_GROUP_VALUES = new Set([
  ...TEMPLATE_ROLE_GROUPS.values(),
  ROLE_GROUP_ADMIN,
  ROLE_GROUP_OTHER,
]);

/**
 * @param {object|null|undefined} selectedRole the session's active role, as `useAuth()` exposes it
 * @returns {string[]|undefined} the sorted groups, or `undefined` while the role is unknown (the
 *   property is then left off the events instead of being guessed as `other`)
 */
export function resolveRoleGroups(selectedRole) {
  if (!selectedRole?.id) return undefined;
  if (selectedRole.isClientAdmin === true) return [ROLE_GROUP_ADMIN];

  const names = Array.isArray(selectedRole.effectiveRoleNames) ? selectedRole.effectiveRoleNames : [];
  const groups = new Set(names.map(name => TEMPLATE_ROLE_GROUPS.get(name)).filter(Boolean));
  return groups.size > 0 ? [...groups].sort() : [ROLE_GROUP_OTHER];
}
