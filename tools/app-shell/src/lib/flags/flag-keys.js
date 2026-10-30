/**
 * Registry of every feature flag the app evaluates.
 *
 * The default declared here is the value the app uses whenever the control
 * plane cannot answer (provider disabled, offline, misconfigured, or the flag
 * is missing in Mixpanel). It must always describe today's shipped behaviour,
 * so an unreachable control plane degrades to the current product instead of
 * exposing unfinished work.
 */

// `tenant-upgrade` was retired in ETP-4966. The paid productive-environment flow is permanent and
// cannot be switched off: this end evaluated the key through ConfigCat while the backend evaluated
// it through local properties that were unset in every deployed environment, so the browser offered
// a Stripe checkout the backend did not honour and paying accounts got a demo environment. Do not
// reintroduce a client-only gate over a capability the backend charges for.

/** Reveals the internal Proof of Concept section in the side menu. */
export const PROOF_OF_CONCEPT_MENU = 'proof-of-concept-menu';

/** Enables the AI SDK Copilot agent integration; native browser WebMCP is deferred. */
export const WEBMCP_AGENT_CHAT = 'webmcp-agent-chat';

/** Enables proactive DOM-based page-help suggestions next to the Copilot. */
export const PAGE_HELP_SUGGESTIONS = 'page-help-suggestions';

/**
 * Reveals the admin-only accounting server process monitor in the Settings menu (ETP-5269).
 * Visual gating only: the route is registered unconditionally and the backend
 * (`SFAcctProcessMonitor`) enforces admin/client-admin access on both its read and its trigger.
 */
export const ACCT_PROCESS_MONITOR = 'acct-process-monitor';

/** Enables the admin-only public API key management entry point (ETP-5345). */
export const PUBLIC_API_KEYS = 'public-api-keys';

/**
 * Reveals the Unified Calendar proof of concept (static mock data, no backend) in the
 * Proof of Concept menu group. Short-lived: see its flags-registry.json entry.
 */
export const UNIFIED_CALENDAR_POC = 'unified-calendar-poc';

/**
 * NUMERIC flag (ETP-5676): rows per `/batch` request in the generic import, overriding every
 * window's `window.import.limit.batchSize`. `0` (the default), unset, negative or non-numeric means
 * "no override" — the window's decisions value applies, else 1; the engine clamps to 1..50. One
 * global flag by design, with no per-window variants. Read with `useNumberFlag`, resolved by
 * `resolveImportBatchSize` (`lib/importBatchSize.js`).
 */
export const IMPORT_BATCH_SIZE = 'import-batch-size';

/**
 * Reveals the "Mis empresas" entry in the user menu (ETP-5734): the page that lists the account's
 * companies, split into owned and invited, with pending invitations. Visual gating only: the
 * `/companies` route is registered unconditionally and every backend call it makes is
 * authorized by the account session, never by this flag. Frontend-only on purpose — see the
 * `targeting-key-divergence` item in flags-registry.json.
 */
export const MY_COMPANIES_PAGE = 'my-companies-page';

/** Enables personal column views on supported business grids (ETP-5835). */
export const GRID_COLUMN_VIEWS = 'grid-column-views';

/**
 * ETP-5791 — the contact category decides the contact type. On: the Contact Category window shows
 * the required "Tipo de contacto" group (Cliente / Proveedor-Acreedor), the accounting tab grouped
 * by type, the list with the type columns and the "category has contacts" notice; Contacts
 * inherits its type from the category, checks it against the calling document when created from
 * a sale/purchase (and from OCR), labels the vendor box "Proveedor/Acreedor" and imports without
 * Cliente/Proveedor columns (the category decides). Off: the pre-ETP-5791 behaviour.
 * Visual gating only: com.etendoerp.go evaluates the same key independently and enforces the
 * contact-type rules on its own, so this default must stay `false` until both ends are ready.
 */
export const CONTACT_CATEGORY_TYPE = 'contact-category-type';

/**
 * Telemetry kill switches (ETP-4578, D2). They are "kill" flags: `true` STOPS telemetry, so the
 * safe default is `false` (today's shipped behaviour: providers run as configured). They are
 * read by `observability/killSwitch.js`, never rendered by the UI, and are excluded from flag
 * exposure reporting so that reading a switch does not itself emit telemetry.
 *
 * The global switch stops every provider; a per-provider switch stops one. The keys after
 * `telemetry-kill-` are the adapter names the gateway knows.
 */
export const TELEMETRY_KILL_ALL = 'telemetry-kill-all';
export const TELEMETRY_KILL_PROVIDER_FLAGS = Object.freeze({
  datadog: 'telemetry-kill-datadog',
  'aws-rum': 'telemetry-kill-aws-rum',
  mixpanel: 'telemetry-kill-mixpanel',
});

/** Flags that must never be reported through the observability layer they control. */
export const NO_EXPOSURE_FLAGS = Object.freeze(
  new Set([TELEMETRY_KILL_ALL, ...Object.values(TELEMETRY_KILL_PROVIDER_FLAGS)])
);

export const FLAG_DEFAULTS = Object.freeze({
  [PROOF_OF_CONCEPT_MENU]: false,
  [WEBMCP_AGENT_CHAT]: false,
  [PAGE_HELP_SUGGESTIONS]: false,
  [ACCT_PROCESS_MONITOR]: false,
  [PUBLIC_API_KEYS]: false,
  [UNIFIED_CALENDAR_POC]: false,
  [IMPORT_BATCH_SIZE]: 0,
  [MY_COMPANIES_PAGE]: false,
  [GRID_COLUMN_VIEWS]: false,
  [CONTACT_CATEGORY_TYPE]: false,
  [TELEMETRY_KILL_ALL]: false,
  ...Object.fromEntries(Object.values(TELEMETRY_KILL_PROVIDER_FLAGS).map((key) => [key, false])),
});

/**
 * Safe default for a key. Unknown keys resolve to `false` so a typo hides the
 * feature rather than revealing it. A declared numeric default (`0`) is returned
 * as is — `??` only replaces a missing entry, never a falsy one.
 */
export function defaultForFlag(key) {
  return FLAG_DEFAULTS[key] ?? false;
}
