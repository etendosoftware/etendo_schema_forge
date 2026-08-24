# App Shell Functional Flows

## Scope

`tools/app-shell` is the user-facing Schema Forge SPA shell. It owns:

- public onboarding and environment entry
- authenticated shell navigation and layout chrome
- dynamic loading of generated/custom windows
- shared entity list/detail data behavior through `useEntity`
- OAuth2 consent and OAuth2 client administration pages
- PWA update detection and cache recovery behavior

This document is intentionally functional, not architectural. Every statement below is grounded in the current worktree code or tests.

Automated coverage note: the current automated evidence is mostly source-shape, hook-level, and build-level `node:test` coverage. It is not full browser E2E coverage, so each flow below explicitly says when manual verification is still required.

## Route surface

| Area | Entry path | Current behavior | Evidence |
|---|---|---|---|
| Public access | `/onboarding`, `/login` | `/onboarding` is the only public entry page. `/login` redirects to `/onboarding`. | `tools/app-shell/src/App.jsx` |
| Authenticated shell | `/dashboard`, `/first-steps`, `/sales`, `/inventory`, `/purchases`, `/accounting`, `/reports`, `/report-viewer`, `/crm`, `/hr`, `/projects`, `/smart-scan`, `/oauth2-clients`, `/roles`, `/authorize`, `/quick-sales-order`, `/quick-purchase-order`, `/preview`, `/artifacts`, `/artifacts/:windowName` | These routes render inside `AppLayout` and require `AuthGuard`. `/roles` (ETP-4513) is registered in `tools/app-shell/src/runtime-routes.jsx`, not `App.jsx`. | `tools/app-shell/src/App.jsx`, `tools/app-shell/src/runtime-routes.jsx`, `tools/app-shell/src/layout/AppLayout.jsx` |
| Generated/custom windows | `/:windowName`, `/:windowName/:recordId` | Loads the matching generated or custom window and optionally passes a record context. | `tools/app-shell/src/windows/WindowLoader.jsx`, `tools/app-shell/src/windows/registry.js` |
| Menu-driven report links | `/report-viewer?category=purchases\|inventory\|finance` | Menu items can override the route with `item.path`, so report entries navigate to the shared report viewer instead of the generic window route. | `tools/app-shell/src/menu.json`, `tools/app-shell/src/components/layout/SideMenu/SideMenu.jsx` |

Any authenticated route can also be opened with `?embedded=1`; in that mode the shell keeps the routed page but hides the side menu, top bar, command palette, and copilot widget.

## Testable flows

### 1. Onboarding and access entry

- **User goal / entry point:** Open `/onboarding`, sign in or register, then enter the first available environment.
- **Main path behavior:**
  - `AuthGuard` redirects unauthenticated protected traffic to `/onboarding`.
  - `OnboardingPage` validates the platform token in `localStorage`.
  - Register/login calls the `/sws/go/register` or `/sws/go/login` endpoints.
  - Successful registration stores the platform token and Etendo Go sends the `new-account` transactional email best-effort after the account commit, including the selected onboarding language as the allowlisted `language` template variable. Since ETP-4798 that mail's link carries a 24h email-confirmation token, and `/sws/go/me` reports `emailVerified` and `emailVerificationPending`.
  - While a confirmation is pending the account never reaches onboarding at all: registration lands on a dedicated confirm-your-email wall (`verify-email` step) offering a resend action (`/sws/go/verify-email/resend`) and logout. The wall is decided by `emailVerificationPending` from `/sws/go/me`, checked inside `routeByEnvironments` — the single funnel the mount bootstrap, a fresh login and the post-provisioning re-entry all pass through.
  - The wall has no "I already confirmed" button and does no polling: every mount re-reads `/sws/go/me`, so a plain browser refresh is the way out. That also covers opening the mail on a phone while the flow sits on a desktop.
  - Confirmation links open `/onboarding?verifyToken=...`; the token is stripped from the address bar before the request is issued, then `POST /sws/go/verify-email` confirms it and the flow continues into step 1 of onboarding. The confirmation is awaited before `/sws/go/me` is read, so the freshly confirmed state is not overwritten by an in-flight read of the pending one. The endpoint is unauthenticated (the token is the credential) and idempotent, so a re-clicked or prefetched link answers 200 rather than an error.
  - After platform auth, the page fetches `/sws/go/environments`.
  - If at least one environment exists, it auto-enters the first one, stores `sf_auth_token`, user, role, and org context, clears caches, and redirects to `/dashboard`.
  - During new-environment creation, the onboarding backend runs the sequence generator for the selected organization using the new client's admin user/role context, seeds a default customer programmatically, commits the onboarding transaction, and then sends the `environment-ready` transactional email best-effort; the page then logs in, checks Sales Invoice readiness, and redirects.
  - The curated onboarding dataset skips business partner rows and locations while still importing shared setup catalogs such as BP groups, payment terms, and accounting foundations.
  - If no environments exist, the page switches to the environment creation flow.
  - The login form includes a forgot-password action that calls `/sws/go/password-reset/request`; the UI always shows neutral "reset email sent" messaging when the request succeeds.
  - Reset links open `/onboarding?resetToken=...`, render the reset-password form, call `/sws/go/password-reset/confirm`, clear any stored platform token on success, and show invalid/expired link errors inline when the backend rejects the token.
  - Authenticated setup views include a change-password panel that calls `/sws/go/change-password`, requires the current password, stores the rotated platform token returned by the backend, and shows success or current-password errors inline.
  - Auth email UI calls never include provider payload fields such as `to`, `template`, `data`, sender, Reply-To, or provider metadata.
- **Failure or edge behavior:**
  - An invalid stored platform token is removed and the page falls back to the register view.
  - Register/login failures stay on the onboarding page and surface inline errors.
  - Password reset request success remains neutral and provider-detail-free.
  - Password reset confirmation rejects mismatched local form passwords before calling the backend.
  - Password-change failures keep the user on the current setup view without clearing the existing platform token.
  - Environment login failures currently surface browser `alert()` messages.
  - Creating an environment with an unconfirmed address is still refused with `403 EMAIL_NOT_VERIFIED` before the NDJSON stream opens. The wall is the UX half of that rule, not a replacement for it: the backend remains the gate for a modified client or a direct request.
  - An account that predates ETP-4798, or one whose *first* confirmation mail could not be sent, is neither verified nor pending: it sees no wall and hits no gate. The flow fails open rather than locking users out over a misconfigured `etendo.go.app.baseUrl` or provider — which is why the routing predicate is `emailVerificationPending` and never `!emailVerified`.
  - A failed **re-send** is the opposite case and does not un-gate anything: the backend restores the token that was pending before the re-issue, so the wall stays up and the link already in the user's inbox keeps working. Otherwise pressing "resend" until the per-recipient throttle refused would be enough to switch the gate off.
  - SSO accounts are born confirmed, and signing in through the identity provider clears any confirmation still pending on that address.
- **Automated evidence:**
  - `../schema_forge_core/packages/etendo-go-core/test/onboardingOwnership.test.js` verifies the Core-owned API, state, SSO, password-policy, draft, and stream contracts. Schema Forge retains product composition coverage in `tools/app-shell/src/pages/__tests__/OnboardingPage.vitest.jsx`.
  - `tools/app-shell/src/pages/__tests__/OnboardingPage.vitest.jsx` verifies forgot-password, reset-password, invalid reset link, change-password success, token refresh, and current-password failure states.
  - `tools/app-shell/test/pwa.test.js` verifies that `OnboardingPage.jsx` clears caches on environment login.
  - Route protection and onboarding branching are code-backed in `tools/app-shell/src/App.jsx` and `tools/app-shell/src/pages/OnboardingPage.jsx`, but are not covered by a full browser test.
  - `etendo_core/modules/com.etendoerp.go/src-test/src/com/etendoerp/go/onboarding/OnboardingDefaultCustomerServiceTest.java` verifies the default customer seed behavior, and `EtendoGoJwtServletOnboardingDatasetTest.java` verifies the seed runs after sequence generation and fails honestly if customer creation fails.
- **Manual verification path:**
  1. Open `/onboarding` with no `sf_platform_token` or `sf_auth_token` in `localStorage`.
  2. Complete register or login.
  3. If the account already has an environment, confirm the browser lands on `/dashboard`.
  4. Clear `sf_auth_token`, open `/dashboard`, and confirm the browser is redirected back to `/onboarding`.
  5. From login, request a password reset and confirm the success copy does not reveal whether the email exists.
  6. Open `/onboarding?resetToken=<token>`, reset the password, then confirm login works with the new password and the old platform token was cleared.
  7. While authenticated in setup, change the password and confirm the returned platform token replaces the previous `sf_platform_token`.

### 2. Authenticated shell and navigation chrome

- **User goal / entry point:** Work inside the authenticated app shell after login.
- **Main path behavior:**
  - Protected routes render inside `AppLayout`.
  - `AppLayout` provides the side menu, top bar, command palette, copilot widget, favorites provider, page metadata provider, and sidebar provider.
  - The side menu resolves links with `item.path || item.name`, so report entries can point to `/report-viewer?category=...` while standard windows use `/<slug>`.
  - The authenticated shell includes the `/artifacts` route, but the visible side-menu artifacts entry is feature-flagged and only appears when `VITE_SHOW_ARTIFACTS === 'true'`.
- **Failure or edge behavior:**
  - `?embedded=1` removes shell chrome and left-margin spacing while still rendering the current route content.
  - Hidden groups/items from `menu.json` are filtered out of the visible menu.
  - The visible menu is additionally filtered to the current role's actual window/process access: `AppLayout` calls `useRoleMenu()` (`tools/app-shell/src/hooks/useRoleMenu.js`), which fetches the `SFListMenu` webhook's role-pruned tree once per authenticated session and reduces it to an allowed-id `Set` via `collectAllowedIds()` (`tools/app-shell/src/lib/menuTree.js`). `registry.js`'s `filterMenuGroupsByAccess()` drops any menu item whose `windowId`/`processId`/`obuiappProcessId` is not in that set, and drops any group left empty (except `Favorites`); items carrying none of those ids (dashboard, custom pages, installed SDK apps) are never filtered. While the fetch is in flight, AD-backed items (anything carrying a `windowId`/`processId`/`obuiappProcessId`) are hidden rather than briefly showing the unfiltered full menu; items with none of those ids and the `Favorites` group are never filtered and stay visible throughout.
  - **No-access blocking screen (ETP-4514):** if `allowedIds` resolves to a confirmed empty `Set` — the authenticated user's role (or lack of one) grants zero `AD_Window_Access`/`AD_Process_Access` — `AppLayout` renders `NoAccessScreen` instead of the sidebar/top bar/`Outlet`, so no menu item and no direct window route is reachable. This only fires on the resolved-empty-Set case: `undefined` (fetch in flight) and `null` (unauthenticated, or a fetch failure — deliberately fail-open so a backend outage doesn't lock everyone out) never trigger it. The guard sits above the `embedded` branch in `AppLayout`, so it is **not suppressed by `?embedded=1`** — an embedded integration (e.g. an iframe pointed at a single window) still gets the blocking screen instead of silently rendering nothing or the bare `Outlet`. The check also re-evaluates on every render rather than only at mount: if `useRoleMenu()`'s Set goes from non-empty to a confirmed-empty Set on a later render (e.g. an admin revokes the user's role mid-session and a subsequent fetch reflects it), the blocking screen replaces the previously mounted sidebar/`Outlet` instead of leaving both mounted together.
- **Automated evidence:**
  - `tools/app-shell/src/windows/__tests__/registry.test.js` and `registry.vitest.jsx` verify that menu groups are built from `menu.json`, keep the expected name/label shape, and are correctly reduced by `filterMenuGroupsByAccess()`/the optional `allowedIds` argument to `buildMenuGroups()`.
  - `tools/app-shell/src/hooks/__tests__/useRoleMenu.vitest.jsx` and `tools/app-shell/src/lib/__tests__/menuTree.vitest.js` cover the role-menu fetch/collection behavior, including the unauthenticated and fetch-failure fallbacks.
  - `tools/app-shell/src/layout/__tests__/AppLayout.vitest.jsx` covers the `NoAccessScreen` guard: the empty-Set-only trigger (excluding `null`/`undefined`), that the guard still renders under `?embedded=1` (not suppressed by the chrome-hiding logic), and that a re-render where the Set shrinks from non-empty to confirmed-empty (role revoked mid-session) swaps the sidebar/`Outlet` for the blocking screen rather than leaving both mounted.
  - The shell chrome itself is code-backed in `tools/app-shell/src/layout/AppLayout.jsx` and `tools/app-shell/src/components/layout/SideMenu/SideMenu.jsx`; there is no browser automation for the layout behavior beyond the mocked E2E spec covering role-filtered menu rendering and the no-access blocking screen.
- **Manual verification path:**
  1. Sign in and open `/dashboard`.
  2. Confirm the side menu, top bar, command palette, and copilot widget are visible.
  3. Use the menu entry that targets `/report-viewer?category=purchases` and confirm the URL keeps the query string.
  4. Re-open the same route with `?embedded=1` and confirm the shell chrome is hidden while the routed page still renders.
  5. Sign in as a role with restricted `AD_Window_Access`/`AD_Process_Access` grants and confirm the sidebar shows visibly fewer items than a role with full access (e.g. GOClient Admin).
  6. Sign in as a user with no role assigned (or a role with zero window/process access) and confirm the "No access" screen renders instead of the sidebar, and that navigating directly to a known window URL (e.g. `/sales-order`) also lands on the blocking screen rather than the window.
  7. Repeat step 6 with `?embedded=1` appended to the URL and confirm the blocking screen still renders (not the bare routed page or a blank frame).
  8. While signed in as a user with an assigned role and visible sidebar, have an administrator revoke that role (or drop it to zero window/process access) in another session, then trigger a fresh role-menu fetch (e.g. reload or navigate) and confirm the sidebar is replaced by the blocking screen rather than staying visible alongside it.

### 3. Generated/custom window loading

- **User goal / entry point:** Open a generated or custom Schema Forge window by slug, optionally with a record id.
- **Main path behavior:**
  - `registry.js` builds a window map from `menu.json`.
  - Loader resolution order is: `customLoaders` → generated `windowLoaders` → `PlaceholderWindow`.
  - `WindowLoader` reads `:windowName` and optional `:recordId`, dynamically imports the component, and passes `token`, `apiBaseUrl`, `window`, `windowName`, and `recordId`.
- **Failure or edge behavior:**
  - If the slug is not present in the window map, the page shows `Window "<name>" not found`.
  - If the loader import fails, the page shows `Failed to load window ...` plus the hint to check whether the component was generated.
  - Menu entries with explicit `path` values bypass this generic route and land on their dedicated page instead.
- **Automated evidence:**
  - `tools/app-shell/src/windows/__tests__/registry.test.js` verifies that every menu slug gets a window-map entry and loader metadata.
  - Dynamic import success/failure UI is code-backed in `tools/app-shell/src/windows/WindowLoader.jsx`; there is no automated render test for those states.
- **Manual verification path:**
  1. Open a known window route such as `/sales-order`.
  2. Open `/sales-order/<record-id>` and confirm the window still loads with a record context.
  3. Open `/unknown-window` and confirm the not-found error state is rendered.
  4. Open `/report-viewer?category=inventory` and confirm it uses the explicit report viewer route rather than the generic `:windowName` loader.

### 4. Entity list/detail data flow

- **User goal / entry point:** Browse a window list, open a record, create/update/delete records, and work with child rows.
- **Main path behavior:**
  - `useEntity` fetches the first page in batches of 75 rows and exposes `loadMore()` for infinite pagination.
  - Sorting is tracked in hook state and can switch to the companion `$_identifier` field when present so foreign-key sorts are alphabetical.
  - Selecting a row uses the record data already present in the list and fetches that record's children; loading by id is the path that fetches the full record and its children.
  - `handleNew()` requests `/<entity>/defaults`, normalizes returned values, and pre-fills the form when defaults exist. Combo-style fields (Price List, Payment Terms) are pre-selected by the backend; Search-type fields (Contact, Business Partner) are left empty for the user to fill explicitly.
  - While the defaults request is in flight the hook exposes `defaultsLoading: true` and `DetailView` shows the loading gate for the new-record route, so the user cannot type into a form whose values are about to be merged (ETP-4741). The 4-second timeout is a UX budget, not a correctness mechanism: when it fires it releases the gate so the user can start working, and nothing else — the request is **not** aborted and the session is **not** invalidated, so a response arriving later still merges. That late merge is also what fires `DetailView`'s initial-callout chain, which is latched on `editing` becoming non-empty and would never fire on a form left permanently empty (one residual gap in that latch is recorded under "Failure or edge behavior" below). When the merge runs — before or after the release — it skips any field the user already changed (and its `$_identifier` companion). Each `handleNew()` emits at most one `defaults_block` timing event: exactly one for the session that survives to settlement (`status`: `ok`/`error`/`timeout` — see `docs/ops/app-shell-observability.md`); a session superseded by a newer `handleNew()` **before it settles** emits none. Invalidation is reserved for genuinely superseded sessions: a newer `handleNew()`, or loading an existing record (`handleSelect` or `fetchById`) while the defaults request is still pending — the latter neutralizes it, aborting the request (still possible after the timeout, which keeps the abort handle), discarding its late response, releasing `defaultsLoading` immediately, and — when the session had not already settled — emitting no `defaults_block` event. A session that already settled as `timeout` and is only afterwards superseded or neutralized keeps that one event: the timing handle is one-shot, so no second event can follow.
  - Before a `POST`, `handleSave()` validates that all visible required fields have a value. `EntityForm` registers only currently-visible fields via `registerFields(displayFields)` so hidden fields never block the save. If any required field is empty, `fieldErrors` is set and each offending field renders a red border with an inline "Required" message — the POST is not sent.
  - If the backend still returns a structured `400 MISSING_REQUIRED_FIELDS` response, the `fields` array is parsed and mapped to `fieldErrors` as a second validation layer.
  - New records use `POST`; existing records use `PATCH` with changed fields only.
  - Child-row creation posts `parentId`, then refreshes both children and the header record so derived totals stay current.
- **Failure or edge behavior:**
  - List refresh and pagination logout on HTTP 401.
  - If the defaults endpoint fails, the form still opens with an empty object and `defaultsLoading` returns to false. If it merely overruns the 4s budget, `defaultsLoading` also returns to false, but the request keeps running and its defaults are applied when they land.
  - Known gap (pre-existing, narrowed but not closed by ETP-4741): `DetailView`'s initial-callout latch arms on `editing` becoming non-empty for **any** reason, including the user typing into a plain non-selector field. If that happens before the defaults land — only possible in the window between the 4s gate release and a late response — the latch is consumed while no selector field has a value yet, so the defaults still merge but the callout chain never runs. See `docs/feedback.md` (`[2026-07-31] ETP-4741`).
  - Partial or empty batches stop pagination.
  - Save blocked by missing required fields surfaces per-field `fieldErrors` highlights and a toast; the record is not created.
  - Save and child-row creation failures surface `saveError` and toast feedback; delete and process failures surface toast feedback.
  - Kebab menu actions that carry a `documentAction` field (e.g. `Reactivate` with `documentAction: 'RE'`) call the standard `documentAction` endpoint and on success emit a `sonner` `toast.success()` using the i18n key from `successKey` (declared in `decisions.json → window.menuActions[]`). On failure the error message is surfaced via `toast.error()`. No inline banner is shown.
- **Automated evidence:**
  - `tools/app-shell/src/hooks/__tests__/useEntity-pagination.test.js` verifies first-page and subsequent-page batch windows, sort handling, retry behavior for the default `creationDate` sort, empty datasets, and fetch failures.
  - `tools/app-shell/src/hooks/__tests__/useEntity-defaults.test.js` verifies the defaults URL, bearer header use, non-OK handling, network-error fallback, and missing-defaults fallback.
  - `tools/app-shell/src/hooks/__tests__/useEntity.defaultsRace.vitest.jsx` verifies the ETP-4741 race guards: `defaultsLoading`, the 4s gate release (which neither aborts the request nor discards its late response), invalidation of superseded and record-load-neutralized sessions, user-edit merge protection before and after the release, and the `defaults_block` timing event.
  - `tools/app-shell/src/hooks/__tests__/useEntity-required-validation.test.js` verifies the required-field validation logic: empty required fields are flagged, readOnly and summary-section fields are skipped, whitespace-only strings are treated as empty, and `readOnlyLogic` functions are respected for completed documents.
- **Manual verification path:**
  1. Open a generated window such as `/sales-order`.
  2. Scroll past the first page and confirm additional rows load after the first 75.
  3. Start a new record and confirm defaults appear when the backend exposes them (Price List and Payment Terms pre-selected); Contact must remain empty.
  4. Click Save without filling Contact — confirm a red border and "Required" message appear on the field and no record is created.
  5. Fill Contact, confirm the dependent Address auto-selects, then Save — confirm the record is created with the chosen Contact.
  6. Open a record with child lines, add a line, and confirm both the child list and header data refresh.
  7. Expire or remove the auth token, trigger a list refresh, and confirm the session is forced back through the auth flow.

### 5. OAuth2 authorization consent

- **User goal / entry point:** Approve or deny an OAuth2 client connection at `/authorize`.
- **Main path behavior:**
  - With `client_id`, `redirect_uri`, `code_challenge`, and `response_type=code`, the page renders a consent screen.
  - Missing `scope` defaults to `neo:read neo:write`.
  - The consent screen includes an **Access duration** selector (`oauthTokenValidity`) that lets the user choose the issued access token's validity period. Presets: **1 day** (default), **1 week**, **1 month**, and **No expiration** (labels `oauthValidity1Day` / `oauthValidity1Week` / `oauthValidity1Month` / `oauthValidityNever`). A live expiry preview shows the resulting expiration timestamp, or "No expiration" when that option is selected.
  - Approve posts to `/oauth2/authorize` with the bearer token, the PKCE parameters, and `validity_seconds` (the selected duration in seconds; `0` for "No expiration"), then redirects to the returned `redirect_url`.
  - **Backend contract:** the server normalizes `validity_seconds` before issuing the token — absent/non-numeric falls back to the 1-day default, values are clamped to a MIN of 300s (5 min) and a MAX of 2,592,000s (30 days), and `0` is preserved as a never-expiring token. The granted validity is persisted and reused on `refresh_token` grants, so a never-expiring token stays never-expiring. Full backend rules: `com.etendoerp.go/docs/package-architecture.md` → "Authorize-grant token validity policy".
  - Without a full OAuth request, the page shows the generic connection landing screen and the derived MCP server URL.
- **Failure or edge behavior:**
  - Deny redirects back to `redirect_uri` with `error=access_denied` and preserves `state` when present.
  - Failed authorization shows an inline error state.
  - Action buttons are disabled while authorization is in progress.
- **Automated evidence:**
  - `AuthorizePage` now lives in `@etendosoftware/app-shell-core`; its source-reading coverage (route parameter parsing, default scopes, PKCE gating, consent-vs-landing branching, POST target and headers, redirect handling, deny handling, supported scopes) moved to `packages/app-shell-core/test/AuthorizePage.source.test.js` in the `schema_forge_core` repo. In this repo the one-line shim is covered by `tools/app-shell/src/pages/__tests__/AuthorizePage.vitest.jsx`.
- **Manual verification path:**
  1. Open `/authorize` with no query string and confirm the connection landing screen appears.
  2. Open `/authorize?client_id=test-client&redirect_uri=https://example.test/cb&code_challenge=abc&response_type=code&state=xyz` while authenticated.
  3. Click **Deny** and confirm the browser redirects to the callback URL with `error=access_denied` and `state=xyz`.
  4. Change the **Access duration** selector across the presets and confirm the expiry preview updates (and shows "No expiration" for the never-expiring option).
  5. Repeat and click **Authorize** against a live backend to confirm redirect to the backend-provided `redirect_url`; verify the issued token's expiry matches the selected duration (and that a "No expiration" grant returns a token response with no `expires_in`).

### 6. OAuth2 client administration

- **User goal / entry point:** Manage MCP/OAuth2 clients at `/oauth2-clients`.
- **Main path behavior:**
  - The page fetches clients on mount and on manual refresh.
  - It shows either an empty-state call to action or a table with name, client id, user, role, scopes, and active status.
  - Row actions support edit, regenerate secret, revoke tokens, and delete.
  - Regenerating a secret can reveal a one-time secret dialog; deleting and token revocation use confirmation dialogs.
  - Client IDs are copyable from the table.
- **Failure or edge behavior:**
  - Fetch failures clear the list and show a toast error.
  - Regenerate/delete/revoke actions are explicitly destructive and warn that active integrations will stop working.
- **Automated evidence:**
  - `tools/app-shell/test/OAuth2ClientsPage.test.js` verifies the mounted fetch pattern, empty-state messaging, expected table columns, destructive confirmation usage, secret reveal dialog flow, row actions, client-id copy affordance, active/inactive badge behavior, and fetch-failure toast behavior.
- **Manual verification path:**
  1. Open `/oauth2-clients` while authenticated.
  2. Confirm either the empty state or the populated table appears.
  3. Create a client, regenerate its secret, and confirm the reveal dialog shows the new secret when the backend returns one.
  4. Use **Revoke Tokens** and **Delete** from the row menu and confirm the destructive confirmation copy matches the intended action.

### 6b. Roles overview (Configuración > Roles)

- **User goal / entry point:** View GOClient's 5 fixed roles, their assigned-user counts, and which Etendo GO windows each one can reach, at `/roles`.
- **Main path behavior:**
  - `RolesOverviewPage` fetches `GET /sws/neo/rolesoverview` (NEO pseudo-spec bridge — see `com.etendoerp.go/docs/neo-headless.md` §4.10) on mount and on manual refresh (`fetchRolesOverview` in `tools/app-shell/src/lib/rolesApi.js`).
  - Each of the 5 roles renders as its own card: a curated, i18n-keyed name/description (`ROLE_I18N` map — `roleNameGoClientAdmin`/`roleDescGoClientAdmin`, etc., never the backend's raw `AD_Role.description`), a user-count badge, and a badge per reachable window (filled "full" tier vs. outlined "read-only" tier, per `w.tier`).
  - A role with no reachable windows shows a placeholder dash instead of an empty chip row.
  - "Edit" always opens a "coming soon" dialog — there is no create/delete affordance anywhere on the page; this is a read-only view.
  - The menu entry that routes here (`menu.json`'s `roles` item, under "Configuración") is itself gated client-side by `"capability": "isAdminOrClientAdmin"`, resolved by `registry.js`'s `filterMenuGroupsByAccess` against the `SFWindowAccessMap` capability of the same name (`com.etendoerp.go/docs/neo-headless.md` §8b) — a non-admin role does not see the menu entry in normal navigation.
- **Failure or edge behavior:**
  - A non-array/missing `roles` field in the response is treated as empty, not a crash.
  - An empty `roles` array (returned by the backend for a non-admin/no-role caller, or for direct/deep-link navigation around the menu gate) renders a dedicated no-access card — a defense-in-depth fallback, since `SFRolesOverview.java` is the actual enforcement point and always returns `{ roles: [] }` for a denied caller regardless of how the request reached it.
  - A fetch rejection shows a dedicated error card with a retry action; retry re-invokes the fetch and can recover into the success state.
- **Automated evidence:**
  - `tools/app-shell/src/pages/__tests__/RolesOverviewPage.vitest.jsx` verifies rendering one card per role keyed by id, curated i18n name/description over raw backend fields, the user-count badge, a window chip per `role.windows` entry with tier-based badge variant, the no-windows placeholder dash, the Edit "coming soon" dialog open/close flow, absence of any create/delete affordance, the loading skeleton state, the error state with working retry, the empty/no-access state (including a non-array `roles` field), and the manual refresh action. A dedicated test also asserts the "coming soon" Edit dialog is truly read-only, not just visually so: no `<form>` element, zero `input`/`textarea`/`select` elements, exactly one button (Close), and pressing Enter inside the dialog neither closes it nor mutates the underlying role list — a literal, stronger verification of the "no create/delete" acceptance criterion than a data-testid/visual check alone would give.
- **Manual verification path:**
  1. Open `/roles` while authenticated as a GOClient Admin (or other client-admin) role and confirm all 5 role cards render with curated names/descriptions.
  2. Confirm each role's user-count badge and window chips match its actual `AD_User_Roles`/`AD_Window_Access` grants, and that tier styling (filled vs. outlined) matches full vs. read-only access.
  3. Click **Edit** on any role and confirm the "coming soon" dialog appears and closes without side effects.
  4. Log in as a non-admin role and confirm the "Configuración > Roles" menu entry is absent; navigating directly to `/roles` shows the no-access card.
  5. Click the refresh icon and confirm the page re-fetches (e.g. after a role's window access changes elsewhere).

### 7. PWA update and recovery behavior

- **User goal / entry point:** Keep the SPA fresh after deploys and avoid stale cached assets during environment entry.
- **Main path behavior:**
  - Vite PWA is configured in `autoUpdate` mode with outdated-cache cleanup.
  - `ServiceWorkerManager` calls `checkForUpdate()` on every route change.
  - `useServiceWorker()` also checks for updates when the tab becomes visible and reloads on `controllerchange` so the new worker takes over immediately.
  - Production builds fingerprint JS/CSS assets so the precache points at immutable filenames.
  - On environment login, `OnboardingPage` clears caches before redirecting to `/dashboard`.
- **Failure or edge behavior:**
  - If cache deletion fails during environment login, the code only warns in the console and continues.
  - `clearServiceWorkerStateAndReload()` exists as a last-resort recovery path, but it is a hook utility, not a currently exposed route action.
  - `UpdateToast.jsx` exists as a persistent update-notification helper, but `App.jsx` does not currently wire it into the visible shell flow.
- **Automated evidence:**
  - `tools/app-shell/test/pwa.test.js` verifies the PWA plugin configuration, route-based service-worker wiring in `App.jsx`, hook exports in `useServiceWorker.js`, cache-clearing code in `OnboardingPage.jsx`, build fingerprinting, and required public icon assets.
- **Manual verification path:**
  1. Run a production build and serve it with a registered service worker.
  2. Deploy or serve a newer build.
  3. Navigate to another route or refocus the tab and confirm the app reloads onto the new assets.
  4. Re-enter an environment from `/onboarding` and confirm the browser reaches `/dashboard` without serving stale cached shell assets.

## DocumentTotalsPanel — real-time totals and discount breakdown

`tools/app-shell/src/components/contract-ui/DocumentTotalsPanel.jsx` is a generic totals block shared by sales-order, purchase-order, sales-invoice, purchase-invoice, and sales-quotation.

**How it works:**
- Receives `lines` (saved child rows), `pendingLine` (live in-progress add-row values), and `editingLine` (live sidebar editing values).
- Computes all amounts client-side: `grossSubtotal = Σ(qty × listPrice)`, `netSubtotal = Σ(qty × listPrice × (1 − discount/100))`, `grandTotal = Σ(line.grossField)` (server-computed line gross), `discountAmt = grossSubtotal − netSubtotal`, `taxAmt = grandTotal − netSubtotal`.
- The discount column is always visible (`hiddenColumns={[]}` is static — there is no per-product toggle).
- "Subtotal sin descuento" and "Descuento por producto" rows appear automatically when `discountAmt > 0` (at least one line carries a non-zero discount). They disappear again when all discount amounts drop back to zero. No manual expansion is needed.
- "Descuento por producto" is a **read-only display row** showing the computed discount amount — it is not an interactive checkbox.
- A `+ Añadir descuento total` button (i18n key `addTotalDiscount`) appears below the totals block when no total discount is currently active AND at least one line exists (saved or in the inline add-row). The button is hidden when the document is `readOnly` or there are no lines.
- Clicking the button shows an interactive "Descuento total" row: checkbox (checked by default) + computed amount + number input + static "%" label below. Unchecking the checkbox collapses the section and restores the button. The calculation is a **UI placeholder only** — no backend persistence yet.
- `totalDiscountOpen` is local state inside `DocumentTotalsPanel`; it is not lifted to `DetailView`.
- `discountPerProductEnabled` and `onDiscountPerProductChange` props have been removed from both `DetailView.jsx` and `PurchaseInvoiceBottomPanel`.

**Live preview wiring:**
- `DataTable`'s `InlineAddRow` calls `onValuesChange(values)` on every keystroke → `DetailView` stores it as `pendingLineValues` → passed as `pendingLine` to the panel → totals include the in-progress row before any save.
- Sidebar editing: `DetailView` merges `selectedLine + lineEdits` into `editingLine` → panel replaces the matching saved line with live values in the computation.

**Preventing line save on panel click:**
- `InlineAddRow` uses `document.addEventListener('mousedown', handler, true)` (capture phase) to auto-save when the user clicks outside the row. Panels with `data-inline-add-portal="true"` on their root element are whitelisted — the handler skips the save. Both root `<div>` elements of `DocumentTotalsPanel` carry this attribute.

**i18n keys** (both `en_US.json` and `es_ES.json`):
- `addTotalDiscount` — "+ Añadir descuento total" (renamed from `addDiscount`)
- `totalDiscount` — "Descuento total" (new key for the interactive total-discount row)
- `subtotalWithoutDiscount` — "Subtotal sin descuento"
- `discountPerProduct` — "Descuento por producto"

**Where it renders:**
- Sales-order, purchase-order, sales-quotation: directly inside `DetailView` at the bottom-right of the detail layout (uses `lineConfig` built from the summary + line fields).
- Sales-invoice, purchase-invoice: inside the custom `InvoiceBottomPanel` / `PurchaseInvoiceBottomPanel` which hosts the right column of the docs/notes/totals footer.

## Notes field — auto-save on blur

Windows that declare `notesField` in `decisions.json` render a free-text `Notas` textarea in the bottom section of the detail view (via `LinesBottomSection.jsx`). The field behaves differently from the rest of the header form: it does not require the user to click the main Save button. Instead, it saves automatically when the textarea loses focus.

**Trigger and mechanism**

`DetailView.jsx` exposes a `handleNotesSave(value)` function that fires on the textarea's `onBlur` event. When the user clicks outside the field (or tabs away), `handleNotesSave` fires a `PATCH` request containing only the notes field (`{ [notesFieldKey]: value }`) to the header endpoint. This is a best-effort, non-blocking save: no page reload occurs after the PATCH completes.

`LinesBottomSection.jsx` receives `onNotesSave` as a prop and wires it to the textarea's `onBlur` handler. No button press is required.

**Feedback**

On a successful PATCH, a `sonner` toast notification appears with the i18n key `noteSaved` ("Nota guardada" in Spanish, "Note saved" in English). On failure the toast shows the PATCH error without blocking further interaction.

**Behavior on completed documents**

The auto-save mechanism works regardless of the document's completion status. On completed documents the standard Save and Save Draft buttons are hidden (`hideSaveStatuses` in `HeaderPage`), so the notes field is the only editable surface that persists data without forcing a reactivation cycle. This is by design: operators frequently need to annotate a completed document (e.g. delivery notes, payment reminders) without reopening it.

**Relationship to the total-discount onBlur pattern**

This pattern mirrors the `etgoTotalDiscount` blur save already documented in the `DocumentTotalsPanel` section: both use `handleXSave` functions in `DetailView` that fire a single-field `PATCH` on blur, return a toast, and do not reload the page. The two patterns are intentionally symmetric so that any completed document can be annotated or discounted without needing a full edit cycle.

**Affected windows**

All windows that declare `notesField: "description"` in their `decisions.json` pick up this behavior automatically from the shared `DetailView.jsx` and `LinesBottomSection.jsx` components. At the time of writing, those windows are:

- sales-order
- sales-invoice
- purchase-order
- sales-quotation
- payment-in
- payment-out
- purchase-invoice
- goods-shipment
- return-to-vendor
- return-to-vendor-shipment
- return-from-customer
- return-material-receipt

**i18n keys** (both `en_US.json` and `es_ES.json`):
- `noteSaved` — "Nota guardada" / "Note saved"

**Source files**
- `tools/app-shell/src/components/contract-ui/DetailView.jsx` — `handleNotesSave` function
- `tools/app-shell/src/components/contract-ui/LinesBottomSection.jsx` — `onNotesSave` prop wired to the textarea `onBlur`

## Current coverage gaps worth knowing

- There is no end-to-end browser test that walks from `/onboarding` through `/dashboard` into a generated window.
- There is no automated render test for `WindowLoader` error states or `AppLayout` embedded mode.
- `useEntity` child-row refresh behavior and 401 logout behavior are code-backed but not directly covered by a dedicated UI test.
- A fresh direct run of `tools/app-shell/src/auth/__tests__/api.test.js` currently fails because `tools/app-shell/src/auth/api.js` reads `window` during module import; treat that file as a pending test harness fix, not as a green automated proof point.
- OAuth2 and PWA coverage is strong at source/build level, but still not browser-level E2E.

## Shared validation & UX changes — ETP-4005

These behaviors apply to **all document windows** (sales-order, sales-invoice, purchase-order, purchase-invoice, sales-quotation) and are implemented in shared components.

### Required field validation on new inline line

When a new inline line is submitted with a required field left empty (for example, `product`), the empty field is highlighted with a red border and a toast notification is shown. The add-row remains open so the user can correct the missing value without losing the rest of the entered data.

### Single toast on document confirmation

Previously, completing a document produced two successive toasts — "Registro guardado" followed by "Registro procesado". After ETP-4005 only the "Registro procesado" toast fires on a successful confirmation. The intermediate save toast was removed to reduce noise in the confirmation flow.

### Callout message sanitization

Backend callout messages are sanitized before display: HTML tags (such as `<br/>`) are stripped and common redundant prefixes ("Note:", "Warning:") are removed from the message string. Users see plain-text callout feedback without raw markup.

### Inline line min-value validation

Fields with a `min: 0` constraint — `invoicedQuantity`, `listPrice`, and `etgoDiscount` — now show a red border when the user types a negative value during inline edit. The row remains open and the save/confirm path for that row is blocked until the value is corrected or the edit is cancelled. The constraint is enforced client-side by `InlineLinesPanel` using the `min` metadata from the contract field definition.

### Payment modal date validation

The `date` field in `AddPaymentModal` / `InvoicePaymentModal` now carries a red asterisk (*) indicating it is required. The "Confirm payment" button is disabled while the date field is empty, preventing submission without a date. When the user attempts submission with no date or when the backend returns a 400 response, a descriptive translated error message is shown instead of the raw "Failed (400)" string. The error message is resolved via the i18n key `paymentDateRequired` in both `en_US.json` and `es_ES.json`.

**Source files**
- `tools/app-shell/src/components/contract-ui/DataTable.jsx` — `isMissingRequired`, `isBelowMin` helpers; `invalidFields` state in `InlineAddRow`
- `tools/app-shell/src/components/contract-ui/InlineLinesPanel.jsx` — `isValueBelowMin` helper; `invalidCell` state; `hasValidationErrorRef` keeps edit mode open on validation failure
- `tools/app-shell/src/hooks/useEntity.js` — `handleSaveAndProcess` passes `{ silent: true }` to `handleSave` to suppress the intermediate save toast
- `tools/app-shell/src/hooks/useCallout.js` — `sanitizeCalloutMessage` strips HTML and redundant prefixes before passing text to Sonner
- `tools/app-shell/src/windows/custom/shared/InvoicePaymentModal.jsx` — `invalidField` state, date/amount/account validation, disabled confirm button

## Dashboard period filter — session-scoped, resets on new session — ETP-4492

The Dashboard period filter (the range selector: "Último año", "Últimos 90 días", "Últimos 30 días", "Mes en curso", "Año en curso") is scoped to the browser session rather than persisted indefinitely.

**Behavior:**
- The selected range persists across module navigation **within the same session** (it is stored in `sessionStorage` under `dashboard_date_range`).
- It resets to the default **"Último año" (`lastYear`)** whenever a **new session** starts — a browser/tab close-and-reopen, or a logout followed by re-login.
- Logout explicitly clears the stored range through the `useLogout()` choke point (`clearStoredDateRange()`), so a subsequent login — including a different user on a shared browser — never inherits the previous session's filter. This applies to every logout path: the user-menu "Log out", the post-password-change flow, and the automatic 401 auto-logout.

**Manual verification path:**
1. Open `/dashboard`, change the period filter to e.g. "Mes en curso".
2. Navigate to another module and back to `/dashboard` — confirm the filter is still "Mes en curso" (persists within the session).
3. Log out and log back in — confirm the filter is back to "Último año".
4. Alternatively, close the browser tab and reopen the app — confirm the filter is "Último año".

**Source files**
- `tools/app-shell/src/components/dashboard/DashboardDateRangeContext.jsx` — `sessionStorage`-backed range, `lastYear` default, `clearStoredDateRange()` export (also purges the legacy `localStorage` key).
- `tools/app-shell/src/auth/useLogout.js` — the single logout choke point that calls `clearStoredDateRange()` before the core `logout()`.

Full auth/session design and the "route every logout through `useLogout()`" convention: [`../architecture/07-auth-and-security.md`](../architecture/07-auth-and-security.md#logout-choke-point-uselogout).

## Secondary tab strip — full-bleed divider — ETP-4605

**Applies to every window with secondary tabs.** The strip that holds the child-entity /
custom tabs (e.g. `Accounting` · `Price` · `Attachments` in Producto) carries a
`border-b border-border/50`. It is a sibling of the form card inside the detail *content
column*, and the only thing between them is `getLinesTabsSectionClassName`'s `mt-2`, so it
inherited that column's horizontal padding — which made the divider start (and end) a few
pixels inside the panel instead of spanning it.

`getTabStripBleedClassName()` (exported from `DetailView.jsx`, next to
`detailContentPadding`) now resolves the column's padding from the **same**
`detailContentPadding()` inputs and, for each horizontal token, emits a matching negative
margin plus the token itself:

| Content column padding | Window shape | Bleed emitted |
|---|---|---|
| `px-2 pb-2` | sidebar + `compactSidebarPadding` (Producto) | `-mx-2 px-2` |
| `pr-2` | sidebar, non-compact | `-mr-2 pr-2` |
| `px-6` | no sidebar (default) | `-mx-6 px-6` |
| `` (empty) | `inlineEditable`, no sidebar | `` (nothing to cancel) |

The negative margin pulls the bordered box out to the panel edges; re-applying the padding
inside keeps the tab buttons exactly where they were, so only the line moves. Vertical
tokens (`pb-2`) are ignored. Deriving the value from `detailContentPadding()` instead of
hardcoding `-mx-2` is what keeps it correct for every window shape and prevents drift if
the padding rules change.

Covered by `getTabStripBleedClassName` cases in
`src/components/contract-ui/__tests__/DetailView.helpers.vitest.jsx` (one per row of the
table above, plus a `formScrollPaddingX` override).
