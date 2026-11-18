/**
 * ETP-6072 — `tenant_type`: whether the tenant the session is inside is a demo or a productive
 * environment, sent as a common property of every analytics event so a KPI can leave demo tenants
 * out (consumer: `etendo-kpis`, which otherwise can only filter by hostname).
 *
 * It is NOT `environment`: that common property is the deployment (`VITE_APP_ENV`: prod, staging,
 * e2e). The source is the backend's lifecycle type (`environmentType` of the current row of
 * `GET /sws/go/environments`), never `plan`: a canceled subscription makes `plan` read "free"
 * while the environment stays PRODUCTIVE (ETP-5047).
 */
export const TENANT_TYPE_DEMO = 'demo';
export const TENANT_TYPE_PRODUCTIVE = 'productive';

/** Every value `tenant_type` may carry; the payload sanitizer drops anything else. */
export const TENANT_TYPE_VALUES = new Set([TENANT_TYPE_DEMO, TENANT_TYPE_PRODUCTIVE]);

const ENVIRONMENT_TYPES = new Map([
  ['DEMO', TENANT_TYPE_DEMO],
  ['PRODUCTIVE', TENANT_TYPE_PRODUCTIVE],
]);

/**
 * @param {object[]|null|undefined} environments the account's environments, as `useEnvironmentSwitch` lists them
 * @param {string|null|undefined} currentClientId the client the session is inside
 * @returns {'demo'|'productive'|undefined} the tenant type, or `undefined` while it is unknown (the
 *   list has not loaded, no row matches, or the row reports no lifecycle type): the property is then
 *   left off the events instead of being guessed
 */
export function resolveTenantType(environments, currentClientId) {
  if (!currentClientId || !Array.isArray(environments)) return undefined;
  const current = environments.find(env => env?.clientId === currentClientId);
  return ENVIRONMENT_TYPES.get(String(current?.environmentType ?? '').trim().toUpperCase());
}
