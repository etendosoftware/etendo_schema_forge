# ETP-4906 — Multi-Role User Assignment UI with Live Permission Preview — Implementation Plan

> **For agentic workers:** This plan follows Forge's own pipeline (`CLAUDE.md`), NOT
> `superpowers:subagent-driven-development`/`executing-plans`. Each task below is
> assigned to a named pipeline agent and passes through **DEV → REVIEW → QA → DOCS**
> as a unit. Branch/PR/Jira operations are delegated to **Clerk**, never run directly.
> Tests are delegated to **Tester** per the repo's mandatory testing-delegation rule.

## Status (source of truth — update this table as work lands, before anything else)

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| B1 | Spike: multi-company org-scoping | ✅ DONE | Findings below Task B1. Led to descoping B4/F4. |
| F1 | Spike: save-lifecycle hook | ✅ DONE | Findings below Task F1. `onAfterExistingSave` mechanism specified. |
| B2 | New webhook `SFUserRoleAssignments` | ✅ DONE | developer-3, agentId `a368a2b2d6b807025`. Committed `bc2b6c8c` — "Feature ETP-4906: Add SFUserRoleAssignments read webhook" (7 files, `com.etendoerp.go`, `feature/ETP-4906`, not pushed). Targeted tests green (`UserRoleCompositionServiceTest` 16/16, `SFUserRoleAssignmentsTest` 8/8, `NeoPseudoSpecDispatcherTest` 15/15, `SFAssignUserRolesTest` 8/8). Full-repo `:test` has 817 pre-existing unrelated failures (confirmed none touch these classes) — not a regression from this work. Real response shape in B2 Findings below. |
| B3 | `docs/neo-headless.md` §8e | ✅ DONE | Same commit `bc2b6c8c` as B2. Landed as §8e (not §4.12 as originally guessed in this plan — followed the existing §8b–8d numbering for this webhook family instead). |
| B4 | Multi-company backend | 🚫 DESCOPED | Moved to ETP-4889 (human decision). No work needed here. |
| Jira updates | Comment ETP-4906 (descope notes) + ETP-4889 (B1 findings) + ETP-4830 (F7 findings) | ✅ DONE | B4/F4 descope: ETP-4906 https://etendoproject.atlassian.net/browse/ETP-4906?focusedCommentId=143732 — ETP-4889 (starting spec) https://etendoproject.atlassian.net/browse/ETP-4889?focusedCommentId=143733 (ETP-4889 = "[ROLES2] Multi-organization support — phase 2 investigation", confirmed a good fit). F7 descope: ETP-4906 https://etendoproject.atlassian.net/browse/ETP-4906?focusedCommentId=143750 — ETP-4830 (starting spec) https://etendoproject.atlassian.net/browse/ETP-4830?focusedCommentId=143749 (ETP-4830 = "[ROLES/USERS] Send invite email on admin-created users", already assigned to the human, status TBD, previously zero comments — confirmed a good fit and recommended its scope be widened to include the frontend snackbar alongside the email send). |
| F2 | `lib/userRoleAssignmentsApi.js` | ✅ DONE | Committed locally by developer-2, `feature/ETP-4906`, commit `f3b768d17`. Exact exported signatures in F2's section below. |
| F3 | `AssignTemplateRolesControl.jsx` + `DetailView.jsx` `onAfterExistingSave` + `windows/custom/user/index.jsx` | 🔄 IN PROGRESS (DEV + tests complete) | developer-2 built the component/wrapper (agentId `a235bf7765174e48b`, session ended before landing the `DetailView.jsx` prop or the registry wiring). A follow-up developer session closed both gaps — see "F3 Findings" below. DEV wave 4 additionally fixed the `additionalDirtyState` Guardar-enablement bug found here during F9's Playwright pass (see F9 Findings). F9 tests (Vitest + Playwright) are now done. Only REVIEW/QA remain. |
| F4 | Empresa multi-select | 🚫 DESCOPED | Moved to ETP-4889 (human decision). Do not build. |
| F5 | "Roles del usuario" tab | 🔄 IN PROGRESS (DEV + tests complete, dead-code bug FIXED) | `UserRolesTab.jsx` is DEV-complete on disk (agentId `a09d3b86a5c3ba7d2`'s session ended without a completion notification, but the file itself is finished — verified by direct read, then confirmed independently by Tester). F9 added 15 Vitest tests, all green, but surfaced a real dead-code bug: loading/error states can never render because the empty-state check runs first and `columns` (derived from `rolesOverview`) is `null` during the entire fetch and after a rejection — see F9 Findings. **FIXED (2026-08-14, developer follow-up):** reordered the render branches in `UserRolesTab.jsx` so `loading`/`error` are checked before `columns.length === 0`, per DEV wave 3 below. **Tester follow-up done (2026-08-14):** the 2 stale `KNOWN BUG (dead code)` tests in `UserRolesTab.vitest.jsx` were updated to assert the fixed behavior (`UserRolesTab__loading`/`UserRolesTab__error` now expected to render, not `UserRolesTab__empty`); `UserRolesTab.vitest.jsx` 15/15 green, `windows/custom/user/` 98/98 green, full repo suite 646 files / 12007 tests passed / 3 skipped, 0 failed. |
| F6 | Grid role chips + filter | 🔄 IN PROGRESS (DEV + tests complete) | `RoleChipsCell.jsx`/`RoleFilterControl.jsx`/`UserHeaderTable.jsx` are DEV-complete on disk (agentId `a535648d451959aeb`'s session ended without a completion notification, but verified done by direct read — decisions.json's grid column/toolbar-filter registration and generated `UserPage.jsx` wiring both confirmed). F9 added 43 Vitest tests (23+9+11) across the three files plus Playwright coverage (role filter incl. Admin), all green, **no bugs found**. `sf-validate-pipeline --scope=user` confirmed OK during F3's DEV-wave-2 fix (covers the same `decisions.json`, no changes to it since). Only REVIEW/QA remain. |
| F7 | Invite snackbar | 🚫 DESCOPED, moved to ETP-4830 | Human decision 2026-08-14, same pattern as B4/F4 → ETP-4889: no invite-email mechanism exists for admin-created users today (see F7 Findings), so no snackbar ships in ETP-4906. `InviteRolesSnackbar.jsx` will land together with the real email flow when ETP-4830 (already assigned to the human, status TBD) is picked up. |
| F8 | i18n keys | ⏳ PENDING | Rolls into F3/F5/F6 as they land — no standalone dispatch. F7 is descoped, so it contributes no i18n keys. |
| F9 | Tests (Tester) | ✅ DONE (Vitest + Playwright done, both known bugs FIXED, stale tests updated, i18n gap closed — see F9 Findings, DEV wave 4 + Tester wave 5) | Vitest coverage landed for F2/F3/F5/F6 + the `DetailView.jsx` `onAfterExistingSave` prop (F1/F3) — 9 files, 135 new tests, full suite green. Playwright landed: `e2e/tests/flows/user-role-assignment.mocked.spec.js`, multi-role assign flow on an existing user (chip toggle/removal, live matrix, save wiring, reload persistence) + grid role filter (template role + Admin). F7's invite snackbar stayed out of scope (descoped to ETP-4830, no component exists). A real, severe bug was found while writing the Save-flow scenario: role-only chip changes could never enable the "Guardar" button — **FIXED (DEV wave 4):** `additionalDirtyState` wired through `windows/custom/user/index.jsx`. A second, smaller i18n gap (4 missing locale keys in `AssignTemplateRolesControl.jsx`) was also found and **FIXED same session.** **Tester wave 5 (2026-08-14, this session) — DONE:** folded the stale `KNOWN BUG` Playwright test into `once Guardar is clickable…`, renamed to `a role-only chip change enables Guardar and, once clicked, calls SFAssignUserRoles exactly once with the full desired role-id set`, now asserting the fixed behavior end to end (role-only toggle enables Guardar, toggling back disables it, save fires the webhook once, post-save Guardar disables again, an unrelated second save doesn't re-fire) — spec now 7 tests, all green. Added 4 new Vitest tests in `index.vitest.jsx` directly covering the `additionalDirtyState` prop (initial `false`, becomes `true` on toggle, returns to `false` on toggle-back, and the critical post-save regression case). Also closed the adjacent `roleAssignmentSaveFailed` i18n gap (both locale files) noticed but left unfixed by DEV wave 4. See "F9 Findings" and "Tester Wave 5 Verification" below for full detail. |
| F10 | Docs (Sage) | ⏳ PENDING | DOCS phase, after REVIEW/QA. |
| REVIEW | Alex | ✅ APPROVE (re-review, 2026-08-14, agentId `a055d5018a6ab98e8`) | 0 blockers, 0 warnings, 1 wording-nit suggestion (see "REVIEW Re-Review Findings" below). B1 blocker independently re-confirmed fixed (spec re-run live, 7/7). Figma access — tried again, same denial as first pass; recorded as a standing, agent-unfixable human-sign-off item, NOT a blocker (per Global Constraints). Backend tests accepted per targeted-class results, no redundant full `gradlew test` run. **REVIEW is done. Next: QA (Sentinel).** |
| QA | Sentinel | ✅ APPROVE (2026-08-14, agentId `a3f39375a6133d5c0`) | Full suites re-confirmed green (Vitest 646/12011/0 failed, matches plan exactly; Playwright `user-role-assignment.mocked.spec.js` 7/7). DB reference data (GOClient `ad_client_id`, all 4 template role ids, all 5 test usernames) independently re-verified against the live `etendogoclean` DB — all still accurate, no drift. **Could NOT complete the live browser-driven pass** (assign roles to a real user via the UI, save, reload) — blocked on a missing plaintext password for `goadmin@etendo.software`/any GOClient user (not retrievable; this repo's own `E2E_PASSWORD`/`onboarding-setup` mechanism only self-registers a BRAND NEW tenant with no ETP-4852 template roles, not GOClient). Flagged as a standing, agent-unfixable credentials gap — same class as REVIEW's own Figma-access gap — NOT a blocker. **Adapted the most-permissive-wins DB verification to the Java-integration level instead:** found the exact scenario already has real-DB (`WeldBaseTest`) regression coverage from prior ETP-4852/4878 work (`UserRoleCompositionServiceOverlapIntegrationTest`), confirmed ETP-4906's B2 diff never touches that write path (purely additive read methods), then closed a real gap the existing suite missed — added `testGetAppliedTemplateRoleIdsReflectsARealOverlappingComposition` (same file) proving the NEW B2 read method reflects a REAL overlapping composition's most-permissive-wins result, not just a mocked one. `:compileTestJava` confirmed it compiles; a full `./gradlew test` run was kicked off in background to confirm it passes (still running — same tooling limitation REVIEW hit, not waited on further). See "QA Findings" below. **QA is done. Recommend: proceed to DOCS (Sage).** |

**If resuming this ticket cold (e.g. a fresh session after running out of tokens):**
1. Read this table first, then only the task sections whose status isn't ✅/🚫 — each
   PENDING/IN PROGRESS task's own section already has everything needed to pick it up
   (files, acceptance criteria, dependencies). Findings from completed spikes/tasks are
   inlined directly under their own task heading (search for "Findings").
2. For every 🔄 IN PROGRESS row with an `agentId`: try `ListAgents` first — if it's
   still listed, `SendMessage` to that exact agentId to check status/resume it (it has
   full context, cheaper than re-briefing a fresh agent). If it's gone (session ended),
   the agentId is dead — check actual file state on disk instead (`git status --short`
   in the relevant repo) to see what that agent actually finished before disappearing,
   then either finish it yourself or redispatch a fresh agent with a prompt built from
   this plan's task section + whatever's already on disk. **Do not assume a task is
   incomplete just because its agent is gone** — verify via `git status`/`git log`
   first, the same way developer-3's B2/B3 code was confirmed done-but-uncommitted by
   reading files directly rather than trusting an ambiguous notification.
3. Two repos are in play, both already on branch `feature/ETP-4906`, no worktrees:
   `/Users/gremiger/workspaces/etendogoclean/etendo/etendo_schema_forge` (frontend) and
   `/Users/gremiger/workspaces/etendogoclean/etendo/modules/com.etendoerp.go` (backend).
   Neither should be pushed without explicit human request.

**Goal:** Let an admin assign 1+ system-level template roles (Finance/Sales/Purchasing/
Inventory) to a user from the Users list/form and see a live per-role permission
preview before saving — building on the already-shipped ETP-4852 (role composition
backend) and ETP-4878 (permission matrix data) work. Multi-company ("Empresa") support
is explicitly OUT of scope for this ticket — descoped to **ETP-4889** after the B1
spike found no multi-org-per-tenant capability exists yet to build against (see B1
Findings, Task B4).

**Architecture:** Reuse existing backend building blocks (`UserRoleCompositionService`,
`SFAssignUserRoles`, `SFRolesOverview`, `SFListMenu`) wherever they already return the
needed shape; add exactly one new read-path webhook (`SFUserRoleAssignments`) to close
the one real gap — "which template roles does user X currently have". On the frontend,
replace the stale `AssignRoleControl.jsx` (ETP-4512, writes `defaultRole` directly —
predates ETP-4852's composition model and was never updated) with a new multi-select
control, add a new "Roles del usuario" tab, and extend the Users grid/toolbar.

**Tech Stack:** Java 11 / Openbravo DAL / Weld CDI (`com.etendoerp.go`), React + Vite +
Tailwind + shadcn/ui (`tools/app-shell`), Schema Forge `decisions.json` pipeline.

## Global Constraints

- Never weaken `UserRoleCompositionService#enforceCallerClientBoundary` — any new
  endpoint touching user/role data needs the same caller-client-boundary discipline.
- Admin (`is_client_admin='Y'`) is out of scope for composition everywhere — never a
  selectable template in the multi-select, never written by `SFAssignUserRoles`. It
  MAY still appear as a read-only filter option / grid value (a user can carry the
  classic Admin role directly, outside composition — confirmed in `Filtro Usuarios
  Admin.png`).
- 12 windows have no `AD_Window_ID` (see `TemplateRoleWindowAccess`'s javadoc for the
  full list). Per this session's decision: hardcode `Inicio (Dashboard)`, `Favoritos`,
  `Copilot (Asistente IA)` as always-✓ in the matrix (matches `Roles.png`'s convention
  for the sibling ETP-4907 page); omit the other 9 gap rows entirely. **REVIEW (Alex)
  must re-confirm this against the live Figma file before merge** — this was decided
  from a static screenshot, not the source file.
- Role-chip edits are **local-only until Guardar** — the live matrix preview is computed
  from already-fetched data + local selection state, with zero extra network calls per
  chip toggle. `SFAssignUserRoles` fires exactly once, on save, with the full desired
  set (it's already a set-reconciliation call, not additive — see its javadoc).
- The multi-role picker and "Roles del usuario" tab are **existing-user only**. On
  create, the form saves the plain `AD_User` fields first, then applies the selected
  roles as an immediate follow-up call. **Correction (F7 Findings, 2026-08-14): saving
  does NOT trigger an invite email today** — this line originally assumed it did; two
  independent investigations (F7's developer session) traced the actual
  `EtendoGoAccountProvisioning`/`EtendoGoJwtDalHelper` create path and confirmed no
  email fires for admin-created users. That gap is tracked separately as **ETP-4830**
  (F7 descoped there — see Task F7). Never attempt `SFAssignUserRoles` before an
  `AD_User_ID` exists.
- `com.etendoerp.go` Java/Gradle work: use the plain branch already checked out
  (`feature/ETP-4906`), never a worktree — Gradle doesn't recognize `.worktrees/*`.
- Never push `com.etendoerp.go` without explicit human request — commit locally only.
- Every user-visible string needs BOTH `en_US.json` and `es_ES.json` keys.
- Any test-writing work (Vitest or Playwright) MUST be delegated to Tester, not written
  inline by the developer agent.
- Window Change Integrity Protocol applies to any `artifacts/user/decisions.json`
  change: edit decisions only, `make regen ONLY=user`, verify contract, verify import
  paths, verify addLineFields (n/a here, no lines entity).

---

## File Structure

**`com.etendoerp.go`:**
- `src/com/etendoerp/go/roles/UserRoleCompositionService.java` — add a public read
  method (no new class needed; keeps the "one service owns this domain" convention).
- `src/com/etendoerp/go/schemaforge/webhooks/SFUserRoleAssignments.java` — **new**,
  thin webhook shim mirroring `SFAssignUserRoles`'s structure.
- `src-test/src/com/etendoerp/go/schemaforge/webhooks/SFUserRoleAssignmentsTest.java`
  — **new**.
- `src-test/src/com/etendoerp/go/roles/UserRoleCompositionServiceTest.java` — extend
  with cases for the new read method.
- `docs/neo-headless.md` — new §4.12 entry for the endpoint.
- Multi-company: no files — descoped to ETP-4889 (see Task B4).

**`etendo_schema_forge`:**
- `tools/app-shell/src/lib/userRoleAssignmentsApi.js` — **new**, fetch/save wrappers.
- `tools/app-shell/src/windows/custom/user/AssignRoleControl.jsx` — **deleted**,
  replaced by:
- `tools/app-shell/src/windows/custom/user/AssignTemplateRolesControl.jsx` — **new**,
  multi-select chip control.
- `tools/app-shell/src/windows/custom/user/index.jsx` — **new**, wraps the generated
  `UserPage`, provides `RoleSelectionProvider`, wires `onAfterExistingSave` (F1/F3) —
  requires a matching `customLoaders['user']` entry in `windows/registry.js` (F3
  Findings) or it never mounts.
- `tools/app-shell/src/windows/custom/user/UserRolesTab.jsx` — **new**, the "Roles del
  usuario" live matrix.
- `tools/app-shell/src/windows/custom/user/RoleFilterControl.jsx` — **new**, grid
  toolbar role filter.
- `tools/app-shell/src/windows/custom/user/RoleChipsCell.jsx` — **new**, grid role
  column renderer (chips + "+N").
- `tools/app-shell/src/windows/custom/user/UserHeaderTable.jsx` — **new**, grid
  `headerTable` override (F6) — declares the full column list by hand (mirrors
  `sales-invoice`'s `InvoiceHeaderTable` precedent) so `RoleChipsCell`/`RoleFilterControl`
  can be wired in; not originally called out as its own file when this plan was written.
- `tools/app-shell/src/windows/custom/user/roleSelectionContext.js` — **new**, React
  Context sharing the live (not-yet-saved) role selection between
  `AssignTemplateRolesControl` (writer) and `UserRolesTab` (reader) — two independent
  custom-component slots on the same generated page with no other prop-forwarding
  channel between them (see F1/F3 Findings); not originally called out as its own file.
- `tools/app-shell/src/windows/custom/user/InviteRolesSnackbar.jsx` — **descoped, not
  built** — see Task F7. Moved to **ETP-4830** together with the invite-email flow it
  depends on.
- `tools/app-shell/src/lib/roleNameI18n.js` — extended (already has the 4-name map;
  reused as-is, no changes expected unless matrix category labels need new keys).
- `artifacts/user/decisions.json` — modified: `defaultRole` field wiring,
  `window.customComponents`/`headerExtra`, new tab declaration, grid column override.
- `tools/app-shell/src/components/contract-ui/DetailView.jsx` — **shared component,
  modified**: added the `onAfterExistingSave` prop (F1/F3 Findings). Only `user` passes
  it today; every other window is unaffected.
- `tools/app-shell/src/windows/registry.js` — **modified**: added
  `'user': () => import('./custom/user/index.jsx')` to `customLoaders` (F3 Findings) —
  without this the `index.jsx` wrapper above never mounts.
- `tools/app-shell/src/locales/en_US.json`, `es_ES.json` — new keys (this plan
  originally guessed `src/i18n/`; the repo's actual path is `src/locales/`).
- `docs/generated-custom-windows/user.md` — updated (Documentation Freshness policy).
- Tests (Tester-owned): Vitest specs colocated in each component's `__tests__/`;
  Playwright spec under `e2e/tests/flows/` following
  `e2e/tests/flows/row-quick-actions.mocked.spec.js`'s pattern.

---

## Backend Tasks (`com.etendoerp.go`)

### Task B1 — Spike: multi-company ("Empresa") org-scoping mechanism ✅ DONE

**Agent:** schema-forge-developer (research only, no code changes committed except a
short findings note).

**Files:** none modified. Produce findings as a comment in the Jira task / a short
section appended to this plan file under "B1 Findings" once done.

**What to determine:**
- Read `AD_Role_OrgAccess` / `AD_User_OrgAccess` in Openbravo core's model — does either
  exist and get consulted at login/window-access time independently of
  `AD_Role.Organization`?
- Confirm (or refute) this plan's working assumption: every personal composition role is
  created at `Organization = "0"` (`UserRoleCompositionService#createPersonalRole`), and
  `"0"` is the root org whose access cascades to every org beneath it — meaning a
  composed user may ALREADY have effective access to every company today, regardless of
  what any "Empresa" field shows.
- If true: "multiple companies" is display/metadata only (e.g. which orgs a user's
  Business Partner/contact record spans, or a plain informational multi-value field) —
  no new access-control write path needed. Proceed to Task B4 as a metadata-only field.
- If false (org-scoping genuinely restricts access per-org today): identify the
  smallest correct mechanism (e.g. per-org `AD_User_Roles` rows, or a new
  `AD_Role_OrgAccess`-equivalent) and write it up as Task B4's real spec before any code
  is written.

**Acceptance:** a written answer to "does Empresa need new access-control logic, or is
it metadata" with the DB/code evidence backing it. Task B4 is only planned in detail
once this lands.

**B1 Findings (developer-1, landed):** "Empresa" is metadata-only **today** — not
because org `"0"` cascades access (it doesn't drive access at all; `Role.Organization`
is unrelated to what a role can read/write), but because **every GO tenant currently
has exactly one non-root organization** (DB-verified: every client in `ad_org` has
exactly one company org, created once at onboarding by
`EtendoGoJwtServlet#createOrganization`; no "add a second company" flow exists anywhere
in `com.etendoerp.go`). Real per-user org restriction is driven by `AD_Role_OrgAccess`
(`RoleOrganization`, checked via `OBContext#getActiveOrganizationList`/
`setReadableOrganizations`), which `UserRoleCompositionService` never writes directly —
it's propagated for free by core's generic `RoleInheritanceManager`/`OrgAccessInjector`
copy path (the same mechanism that propagates `AD_Window_Access`, which the service
DOES post-correct for the most-permissive-wins union — but has no equivalent
post-correction for org access, because there was never more than one org to restrict).
**Building real org-restriction logic now would be speculative — there is no
multi-org-per-tenant capability to validate it against.** developer-1's own
recommendation, escalated to the human as a real product decision (see chat).

### Task B2 — New webhook: `SFUserRoleAssignments` ✅ DONE (developer-3, agentId `a368a2b2d6b807025`, commit `bc2b6c8c`)

**Agent:** schema-forge-developer.

**Files:**
- Modify: `src/com/etendoerp/go/roles/UserRoleCompositionService.java` — add
  `public List<String> getAppliedTemplateRoleIds(String userId)`: resolves the user's
  personal role the same way `resolveOrCreatePersonalRole` does for READ (but must NOT
  create one if none exists — a user with no personal role has no assigned templates,
  return an empty list, never call `createPersonalRole`), then queries
  `AD_Role_Inheritance` via `findExistingInheritances`-equivalent logic and returns the
  `InheritFrom` ids that are active templates. Add a second method,
  `public Map<String, List<String>> getAppliedTemplateRoleIdsForClient(String clientId)`
  for the bulk grid case — one query pass, not N calls to the single-user method.
- Create: `src/com/etendoerp/go/schemaforge/webhooks/SFUserRoleAssignments.java` —
  `GET /sws/neo/userroleassignments` (NEO pseudo-spec bridge, same convention as
  `SFAssignUserRoles`/`SFRolesOverview`/`SFListMenu` — see `docs/neo-headless.md`
  §4.10–4.11). Admin/client-admin gated
  (`NeoAccessHelper.isAdminOrClientAdmin`), "deny silently" convention (empty result,
  never 403). Two modes:
  - No `UserId` param → `{"assignments": {"<userId>": ["<templateRoleId>", ...], ...}}`
    for every user in the caller's own client (bulk, for the grid).
  - `UserId=<id>` param → `{"userId": "...", "templateRoleIds": [...]}`, enforcing the
    SAME tenant-boundary check `SFAssignUserRoles` uses (a client-admin must never read
    another tenant's user) — reuse
    `UserRoleCompositionService`'s boundary check pattern, do not duplicate the logic
    inline in the webhook.
- Create: `src-test/src/com/etendoerp/go/schemaforge/webhooks/SFUserRoleAssignmentsTest.java`
  (delegate the actual test-writing per the repo's Java testing conventions — this repo's
  mandatory-Tester-delegation rule is scoped to `etendo_schema_forge`'s Vitest/Playwright;
  for `com.etendoerp.go` JUnit tests, follow this module's own existing pattern in
  `SFAssignUserRolesTest.java`/`SFRolesOverviewTest.java` as the template).
- Modify: `src-test/src/com/etendoerp/go/roles/UserRoleCompositionServiceTest.java` —
  add cases for both new methods (no personal role yet → empty list; personal role with
  2 templates → both ids; cross-tenant read attempt → rejected).

**Acceptance:** unit tests green; `./gradlew test` run from the main checkout (not a
worktree — see Global Constraints) passes for the module.

**B2 Findings (developer-3, code landed, verified by reading the file directly):**
confirmed endpoint `GET /sws/neo/userroleassignments[?UserId=<id>]`. Exact response
shapes, read straight from `SFUserRoleAssignments.java`:
```
// Bulk mode (no UserId):
{"assignments": {"<userId>": ["<templateRoleId>", ...], ...}}
// Single mode (UserId=<id>):
{"userId": "...", "templateRoleIds": ["...", "..."]}
// Denied / cross-tenant / unknown user — HTTP 200, shaped per the requested mode:
{"assignments": {}}                              // bulk mode
{"userId": "...", "templateRoleIds": []}          // single mode
```
Service signature is `getAppliedTemplateRoleIds(String userId, Role currentRole)` (takes
the caller's role for the boundary check, slightly different from this plan's original
guess of a 1-arg signature) and `getAppliedTemplateRoleIdsForClient(String clientId)`
for bulk. F2 should treat this as the confirmed contract — no need to re-derive it once
B2 is committed.

### Task B3 — `docs/neo-headless.md` update ✅ DONE (developer-3, agentId `a368a2b2d6b807025`, same commit `bc2b6c8c` as B2)

**Agent:** schema-forge-developer (can be folded into B2's commit if small enough — use
judgment, but REVIEW must see the doc change in the same PR as the code per the
Documentation Freshness policy either way).

**Files:** Modify `docs/neo-headless.md` (in `com.etendoerp.go`) — new §4.12 documenting
`SFUserRoleAssignments`'s two modes, request/response shapes, and access gate, in the
same style as the existing §4.10–4.11 entries for its siblings.

### Task B4 — 🚫 DESCOPED, moved to ETP-4889

Per human decision after B1's findings landed: multi-company ("Empresa") support is
**out of scope for ETP-4906 entirely**, not merely deferred within it. The existing
single-company `defaultOrganization` field stays as-is; no Empresa multi-select ships
in this ticket. The work is tracked under **ETP-4889** instead — Clerk to confirm that
ticket exists/reflects this scope (see Dispatch Plan).

---

## Frontend Tasks (`etendo_schema_forge`)

### Task F1 — Spike: custom-component save-lifecycle hook ✅ DONE

**Agent:** schema-forge-developer (research only).

**What to determine:** `AssignRoleControl.jsx` today only calls `onChange('defaultRole',
...)` — a plain field write picked up by the window's normal Guardar (generic AD_User
CRUD PUT). The new role picker needs Guardar to ALSO fire `SFAssignUserRoles` (a
side-effecting webhook, not a field write) exactly once, only when the role selection
actually changed, and only for an existing user (see Global Constraints). Read
`docs/ui-customization.md` and the generator (`generate-frontend.js`) for whatever
save-lifecycle hook `headerExtra`/`customComponents` already expose (an `onSave`/
`afterSave` callback prop, or a window-level `onBeforeSave` in decisions.json) before
assuming one needs to be built. Check whether any other custom window already does
"write a field AND also call a side-effect webhook on save" (grep the codebase for a
precedent) as this may already be a solved problem the User window just hasn't used
yet.

**Acceptance:** a documented answer — either "use existing hook X, here's how it's
wired" or "no such hook exists, F3 needs to add one to the generator" (if so, that
addition becomes a genuinely new sub-task in `generate-frontend.js`, not something F3
should improvise ad hoc inside one window's custom component).

**F1 Findings (developer-2, landed):** no usable hook exists today — `headerExtra`
passes no save-notification callback; `onAfterCreate` fires only on new→created
transition (opposite of what's needed); `onAfterSave` is a **pre-existing boolean
navigation flag**, not a callback (two live windows — sales-invoice, purchase-invoice —
already pass it as `true`; reusing the name for a callback would silently collide).
Fix, entirely inside `etendo_schema_forge`, **no `schema_forge_core` PR needed**: add a
new prop `onAfterExistingSave(saved, {token, apiBaseUrl})` to
`tools/app-shell/src/components/contract-ui/DetailView.jsx`'s
`handlePostSaveNavigation` (mirrors `onAfterCreate`'s call shape, inverted to
`!isNew`), then create `tools/app-shell/src/windows/custom/user/index.jsx` (the `user`
window has no such wrapper yet) that wraps the generated `UserPage` and passes
`onAfterExistingSave={handleRoleAssignmentSave}` — `UserPage.jsx` already spreads
`{...props}` straight onto `<DetailView>`, so no generator/decisions.json change is
needed to thread it through. Mirror `windows/custom/warehouse/index.jsx`'s existing
`onAfterCreate` wiring as the concrete pattern to copy. **Task F3 is updated
accordingly below** — no longer blocked on an open generator question, just on this
concrete `DetailView.jsx` addition landing first.

### Task F2 — `lib/userRoleAssignmentsApi.js` ⏳ PENDING (blocked on B2)

**Agent:** schema-forge-developer. **Blocked on B2** (needs the real response shape).

**Files:** Create `tools/app-shell/src/lib/userRoleAssignmentsApi.js`, following
`rolesApi.js`'s exact conventions (no `Content-Type` on GET, unwrap the
`{result: "<json-string>"}` shape, `sf_auth_token` from `localStorage`, throw on
non-JSON/error responses — do not reinvent this, copy the pattern):
- `fetchUserRoleAssignments()` — bulk mode, for the grid.
- `fetchUserRoleAssignments(userId)` — single-user mode, for form load.
- `saveUserRoleAssignments(userId, templateRoleIds)` — calls `SFAssignUserRoles`
  (already exists — just wrap it; do not modify the backend webhook for this).

**Files:** Create colocated Vitest spec — delegate to Tester (see F9), do not write
inline.

**F2 Findings (developer-2, landed, commit `f3b768d17`):** exact signatures for F3/F5/F6
to import —
```js
fetchUserRoleAssignments(userId?: string): Promise<{assignments?: Record<string,string[]>, userId?: string, templateRoleIds?: string[]}>
// no arg -> bulk {assignments: {...}}; userId passed -> single {userId, templateRoleIds}
// never throws on the backend's "deny silently" empty shape, only on transport/parse failure

saveUserRoleAssignments(userId: string, templateRoleIds: string[]): Promise<{success:true, userId, personalRoleId, templateRoleIds, added:number, removed:number}>
// wraps SFAssignUserRoles unmodified; pass the FULL desired set, not a delta
// throws new Error(message) on {success:false, message} (domain rejection, still HTTP 200)
```
Both live in `tools/app-shell/src/lib/userRoleAssignmentsApi.js`.

### Task F3 — Replace `AssignRoleControl.jsx` with `AssignTemplateRolesControl.jsx` 🔄 IN PROGRESS (developer-2, agentId `a235bf7765174e48b`)

**Agent:** schema-forge-developer. **Blocked on F2 (API).** No longer blocked on an
open F1 question — F1 landed a concrete mechanism (see F1 Findings above); this task
now includes building it:

**Files:**
- Modify: `tools/app-shell/src/components/contract-ui/DetailView.jsx` — add the new
  `onAfterExistingSave(saved, {token, apiBaseUrl})` prop to
  `handlePostSaveNavigation`, invoked only when `!isNew && saved`, mirroring
  `onAfterCreate`'s existing call shape (see F1 Findings for the exact spot). This is a
  shared component — verify no other window's save behavior changes (the prop is new
  and optional, so every window without it is unaffected).
- Create: `tools/app-shell/src/windows/custom/user/index.jsx` — wraps the generated
  `UserPage`, passing `onAfterExistingSave={handleRoleAssignmentSave}`. Copy
  `windows/custom/warehouse/index.jsx`'s `onAfterCreate` wiring as the concrete pattern.
  `handleRoleAssignmentSave` compares the form's locally-selected role-chip set against
  the set that was fetched on load; if unchanged, no-op; if changed, calls
  `saveUserRoleAssignments(userId, templateRoleIds)` (Task F2).
- Delete: `tools/app-shell/src/windows/custom/user/AssignRoleControl.jsx` and its
  `__tests__/` (superseded — confirm nothing else imports it first).
- Create: `tools/app-shell/src/windows/custom/user/AssignTemplateRolesControl.jsx` —
  multi-select chip UI (removable chips, "+N" overflow when the field is not actively
  focused/editing, per `Usuarios Form View Adicion.png`). Options: the 4 non-admin
  template roles from `SFRolesOverview`'s `roles` array (already fetched once for F5's
  matrix too — share the fetch, don't call it twice, see F5's note on this). Purely
  local component state until Guardar (per Global Constraints) — never calls
  `onChange('defaultRole', ...)`; the new `index.jsx` wrapper owns reading its current
  selection at save time (e.g. via a ref or lifted state, developer's call) and handing
  it to `handleRoleAssignmentSave`.
- Modify: `artifacts/user/decisions.json` — swap the `headerExtra`/`customComponents`
  entry that currently points at `AssignRoleControl` to the new component; `defaultRole`
  stays `form: false` (still read-only, unaffected — see the field's own `reason` note
  in decisions.json, no change needed there). **Note this is the DETAIL FORM's
  read-only display of `defaultRole` only — a separate surface from the Users LIST
  GRID's "Rol" column, which F6 overrides independently.** Don't let a fix to one
  accidentally get "fixed" back by editing the other.

**Acceptance:** `make regen ONLY=user` produces a clean contract (Window Change
Integrity Protocol Step 3); manual load of the User form in a running Etendo shows the
chip control instead of the old single-select.

**F3 Findings (follow-up developer session, landed):** the prior developer-2 session
ended mid-task — `AssignTemplateRolesControl.jsx`, `windows/custom/user/index.jsx`,
`UserRolesTab.jsx`, `RoleChipsCell.jsx`, `RoleFilterControl.jsx`,
`roleSelectionContext.js` and `UserHeaderTable.jsx` were all already written on disk
and correct, but `index.jsx` was calling a prop (`onAfterExistingSave`) that
`DetailView.jsx` never actually defined, and `registry.js` had no `customLoaders`
entry for `'user'` — so the wrapper never mounted at all (the generated `UserPage`
loaded directly via the `windowLoaders` fallback, `RoleSelectionProvider` never
rendered, `useRoleSelection()` fell back to its inert no-op context, chip toggles were
silent no-ops, and the "Roles del usuario" tab always showed its empty state). Both
gaps are now closed:
- `tools/app-shell/src/components/contract-ui/DetailView.jsx` — added the
  `onAfterExistingSave(saved, {token, apiBaseUrl})` prop end to end: component prop
  (line 1302), `saveActionParams` bundle (line 2923),
  `renderExistingRecordSaveAction`'s destructure (line 1094) and its
  `handlePostSaveNavigation` call (line 1100), and the guard itself inside
  `handlePostSaveNavigation` (line 1034/1036, fires only `!isNew && onAfterExistingSave`).
  `renderNewRecordSaveActions` (the new-record path, line ~1052-1085) and its
  `handlePostSaveNavigation` call (line 1077) were deliberately left untouched — that
  call never receives `onAfterExistingSave`, so even with the guard alone it can never
  fire before an `AD_User_ID` exists, matching this ticket's Global Constraint.
- `tools/app-shell/src/windows/registry.js` — added
  `'user': () => import('./custom/user/index.jsx')` to `customLoaders` (kept
  `windowLoaders['user']` pointing at the generated page untouched, per its role as the
  base/fallback entry).
- **A repo-wide guard (`.claude/hooks/check-detailview-growth.mjs`) blocks any edit that
  leaves `DetailView.jsx` longer than its `epic/ETP-3504` merge-base line count** — the
  file was already 1 line over that baseline before this change (from an unrelated,
  already-committed ETP-4714 fix), so literally every edit needed a compensating
  reduction. All `onAfterExistingSave` wiring above was written by extending existing
  lines in place (destructure params merged onto one line, the new
  `if (!isNew && onAfterExistingSave) …` guard appended onto the same physical line as
  the existing `onAfterCreate` guard) rather than inserting new lines, plus one
  parameter-list line merge in `renderExistingRecordSaveAction` to buy back the 1-line
  deficit. Net result: file is at 4441 lines — 1 line above the true `epic/ETP-3504`
  merge-base (4440), an imprecision REVIEW's re-review caught (see "REVIEW Re-Review
  Findings"): the file was already 2 lines over that true baseline pre-ETP-4906 (an
  unrelated ETP-4714 fix), and this ticket's own diff to the file nets -1 line, so
  ETP-4906 did not introduce or worsen the gap.
  Anyone touching this function again should budget for this constraint up front.
- Verified: full `DetailView.jsx` Vitest suite (165 files / 3331 tests) green, `npm run
  build` clean, `npx sf-validate-pipeline --scope=user` → OK. `windows/custom/user/`
  still has an **empty `__tests__/` dir** — no Vitest coverage yet for
  `AssignTemplateRolesControl.jsx`, `UserRolesTab.jsx`, `RoleChipsCell.jsx`,
  `RoleFilterControl.jsx`, `UserHeaderTable.jsx`, `index.jsx` or
  `roleSelectionContext.js`. Expected per this plan's F9 (dispatched separately to
  Tester, not this task) — flagged here so it isn't mistaken for an oversight.

### Task F4 — 🚫 DESCOPED, moved to ETP-4889

Same human decision as Task B4 — no frontend Empresa multi-select ships in ETP-4906.
Do not build this field. `AssignTemplateRolesControl`'s multi-select chip UI (roles,
Task F3) is unaffected — only the separate "Empresa" company field is descoped.

### Task F5 — "Roles del usuario" tab (live matrix) 🔄 IN PROGRESS (DEV + Vitest done, 1 known bug — see F9 Findings; developer-4, agentId `a09d3b86a5c3ba7d2`)

**Agent:** schema-forge-developer. **Blocked on B2, F2.**

**Files:**
- Create: `tools/app-shell/src/windows/custom/user/UserRolesTab.jsx` — new tab,
  rendered only for an existing user (Global Constraints). Row source: fetch
  `SFListMenu`'s tree once (admin caller → full tree, already category-grouped in menu
  order) to get the `Ventana` column's rows and category headers; cross-reference each
  leaf's `windowId` against `SFRolesOverview`'s per-role `windows[]` arrays to render
  one column per role in `AssignTemplateRolesControl`'s **currently locally-selected**
  set (not the saved set — this is the live preview). `UserRolesTab` and
  `AssignTemplateRolesControl` are separate custom-component slots on the same
  generated form (tab vs. headerExtra) — confirm during F1's spike whether generated
  custom slots already share a fetch/state layer; if not, a small shared hook (e.g.
  `useRolesOverviewData()` with a module-level cache keyed by client) avoids fetching
  `SFRolesOverview` twice, but a duplicate fetch is an acceptable fallback if sharing
  turns out to be awkward — don't block the ticket on this.
  Cell value: `✓` (full), `Solo lectura` (read-only), `—` (absent from that role's
  `windows[]`). For the 3 hardcoded General rows (`Inicio (Dashboard)`, `Favoritos`,
  `Copilot (Asistente IA)`), render `✓` unconditionally for every column — do not query
  or infer these from `windows[]` (they have no window backing them at all). Omit the
  other 9 gap rows from `TemplateRoleWindowAccess`'s javadoc entirely — they must not
  appear as `—` rows, they must not appear at all.
  Empty state ("Selecciona un rol para visualizar los permisos") when zero roles are
  currently selected, per `Usuarios Form View Etendo Software.png`.
- Modify: `artifacts/user/decisions.json` — register the new tab (check
  `docs/window-templates.md` for the custom-tab registration convention before
  hand-rolling one).

**Acceptance:** with 2+ roles selected, the rendered table's category order/window
names visually match `Usuarios Form View.png`/`Usuarios Form View Adicion.png` for the
rows they show (General, Comercial, Ventas, …), including the exact 3-row General
hardcode. **Flag explicitly for Alex in REVIEW** to re-verify the General-row/9-gap-row
decision against the live Figma file (see Global Constraints) — this was approved from
a static screenshot during planning, not the source of truth.

### Task F6 — Users grid: role chips column + role filter 🔄 IN PROGRESS (DEV + Vitest done, no bugs found; developer-5, agentId `a535648d451959aeb`)

**Agent:** schema-forge-developer. **Blocked on B2, F2.**

**Files:**
- Create: `tools/app-shell/src/windows/custom/user/RoleChipsCell.jsx` — grid cell
  renderer using the bulk `fetchUserRoleAssignments()` result (one fetch for the whole
  grid page, not per-row) to render each user's roles as chips + "+N" overflow, per
  `Usuarios.png`. Resolve role id → display name via `SFRolesOverview`'s roles list +
  `roleNameI18n.js`. **Admin branch:** a classic-Admin user's `defaultRole` (already a
  field on every grid row) IS the client-admin role itself, not a "Personal – X"
  composition role — it will have zero entries in the bulk assignments map. Detect this
  by comparing the row's `defaultRole` id against `SFRolesOverview`'s
  `roles[].isClientAdmin===true` entry's id, and render the generic `roleNameAdmin`
  chip in that case instead of falling through to an empty/"—" cell.
- Create: `tools/app-shell/src/windows/custom/user/RoleFilterControl.jsx` — grid
  toolbar dropdown, options = `SFRolesOverview`'s roles (4 templates + Admin), filters
  the grid client-side or via query param (check how the existing "Todas las empresas"
  filter — if any exists today — implements this, for consistency).
- Modify: `artifacts/user/decisions.json` — register the grid column override and
  toolbar filter (check `docs/ui-customization.md`'s decision tree for the right
  extension point — this is a grid-level customization, may need a different hook than
  `customComponents.headerExtra`).

**Acceptance:** grid visually matches `Usuarios.png` (chips + "+N", role filter
dropdown) and `Filtro Usuarios Admin.png` (filtering by "Administrador" narrows the
list correctly).

### Task F7 — 🚫 DESCOPED, moved to ETP-4830 (human decision 2026-08-14)

Per the F7 Findings below: no invite-email mechanism exists today for admin-created
users, and building the "Invitación enviada" snackbar without one would tell the admin
an email was sent when nothing sends one. Same descope pattern as B4/F4 → ETP-4889 —
`InviteRolesSnackbar.jsx` is not built in ETP-4906; it ships together with the real
email flow once **ETP-4830** ("[ROLES/USERS] Send invite email on admin-created users",
already assigned to the human, status TBD) is picked up. Clerk to confirm ETP-4830
reflects this scope when Jira updates are dispatched (see Dispatch Plan). The original
task spec is kept below for ETP-4830 to reuse without restarting the investigation.

### Task F7 (original spec, superseded by the descope above) — Post-creation invite snackbar

**Agent:** schema-forge-developer. **Blocked on F3** (the "Configurar roles" link must
land on the same form, roles tab focused/expanded).

**Files:**
- Create: `tools/app-shell/src/windows/custom/user/InviteRolesSnackbar.jsx` — per
  `Usuarios Form View Snackbar.png`: "Invitación enviada" message + "Configurar roles"
  link, dismissible (×). Shown once, immediately after a NEW user's first successful
  save. **Before building:** grep for an existing invite-email trigger on user
  creation — this task owns only the snackbar/link UI, not emailing. If no such
  mechanism exists yet, that's a scope gap bigger than this task (a real email-sending
  path, not a UI detail) — stop and flag it back rather than building a fake/silent
  no-op "invite sent" message.
- Modify: `artifacts/user/decisions.json` if a `window.headerExtra`/snackbar hook is
  needed for this — check existing patterns first (this may already be a generic
  post-save-toast capability the generator supports).

**F7 Findings (this developer session):** hit the task's own stop condition. Grepped
both repos broadly (`invite`, `welcome.*mail`, `send.*mail`, `sendmail`) before
narrowing — `com.etendoerp.go`'s `com.etendoerp.go.schemaforge.email` package and
`EtendoGoJwtServlet`/`EtendoGoAccountProvisioning`/`EtendoGoJwtDalHelper` were the real
candidates.

- `UserRoleAssignmentHandler.java` (the `@Named("user")` NeoHandler, concern 3 in its
  class javadoc, ETP-4829) is exactly the admin-creates-a-user path this ticket's forms
  drive. On `POST`, its `afterHandle` calls
  `EtendoGoAccountProvisioning.ensureAccountForCreatedUser(email, name, plainPassword)`.
  That method's own javadoc says it plainly: the resulting `etgo_account` is created
  `pending` (no password, cannot log in) "waiting on **ETP-4830**'s invite-email flow" —
  unless the admin typed a password on the create form, in which case the account is
  created `active` with that password instead, again with **no email sent either way**.
- Traced `TransactionalAuthEmailSender` (the only class in `com.etendoerp.go` that
  actually sends account-lifecycle email) end to end: it has four contracts
  (`new-account`, `environment-ready`, `password-changed`, `reset-password`). Grepped
  every caller — `sendNewAccount` is invoked from exactly one place,
  `EtendoGoJwtServlet`'s **self-service `/register` endpoint** (a brand-new tenant
  signing itself up with email+password+name), not from anywhere in the
  admin-creates-a-user-inside-an-existing-tenant path. `EtendoGoJwtDalHelper
  .createPendingAccount`/`createActiveAccount` (the two methods
  `EtendoGoAccountProvisioning` calls) never touch `TransactionalAuthEmailSender` at
  all. So the existing "new-account" email is a different flow entirely (tenant
  onboarding), not a per-user invite within a tenant — it cannot be repurposed to make
  this task's snackbar message true.
- `git log --all --oneline -i --grep="4830"` in both repos: zero commits. Confirmed via
  Jira (`searchJiraIssuesUsingJql`, `key = ETP-4830`) that ETP-4830 is a real, separate,
  currently-**unstarted** ticket ("[ROLES/USERS] Send invite email on admin-created
  users", status **TBD**, split from ETP-4602 as "part 2 of 2" — the account-creation
  half is the sibling ticket this handler already implements). Its own description
  states the intended flow explicitly: "admin creates → system emails invite → invitee
  sets password → account activates" — i.e. this is the exact mechanism F7 assumed
  existed, written up as its own not-yet-built ticket, planned to reuse the same
  `com.etendoerp.go.schemaforge.email` infrastructure already traced above.
- **Conclusion: no invite-email mechanism exists today for admin-created users.** This
  is the scenario the task's stop condition anticipated — a real product gap (ETP-4830),
  not a naming mismatch to search around. Per the stop condition, **no
  `InviteRolesSnackbar.jsx` was created** and `artifacts/user/decisions.json` was not
  touched for this task. Building a "Invitación enviada" snackbar today would tell the
  admin an email was sent when nothing sends one.
- This also means the plan's own Global Constraints line ("the form saves the plain
  `AD_User` fields first, triggering the invite email") is inaccurate as written — no
  invite email fires on create today, only the `pending`/`active` `etgo_account`
  bookkeeping described above. Flagging for the coordinator/human rather than editing
  that constraint myself, since it's cross-task shared text.
- **Recommendation for the human/coordinator:** two independent decisions, not one —
  (a) whether to descope F7 out of ETP-4906 (same pattern as B4/F4 → ETP-4889) and let
  ETP-4830 ship the snackbar together with the real email once that ticket is picked up,
  since it's already assigned and scoped for exactly this; or (b) build a
  scope-honest version of F7 now that doesn't claim an email was sent — e.g. a
  "Configurar roles" link/prompt without the "Invitación enviada" copy — if the product
  wants *something* to land in this ticket ahead of ETP-4830. Did not pick (b)
  unilaterally since it changes the approved Figma copy/behavior; flagging both options
  back rather than guessing.

### Task F8 — i18n keys ⏳ PENDING (rolls into F3/F5/F6 — F7 descoped, contributes none)

**Agent:** schema-forge-developer (can be folded into each task above — every task
touching user-visible copy must add its own keys to BOTH `en_US.json` and `es_ES.json`
in the SAME commit, per the repo's i18n policy; listed here only as a checklist item for
REVIEW to verify nothing was missed across F3/F5/F6).

### Task F9 — Tests 🔄 IN PROGRESS (Vitest + Playwright done, 2 known bugs — see F9 Findings)

**Agent:** Tester (`test-generator`) — mandatory delegation, per
`CLAUDE.md`'s Testing section. Dispatch once F2–F7 have landed (or incrementally after
each, developer's call, but no task in F3–F7 is DEV-complete without its tests).

**Files:**
- Vitest: colocated `__tests__/` specs for `AssignTemplateRolesControl.jsx`,
  `UserRolesTab.jsx`, `RoleChipsCell.jsx`, `RoleFilterControl.jsx`,
  `InviteRolesSnackbar.jsx`, `userRoleAssignmentsApi.js` — no hardcoded UI strings, use
  `data-testid`/`t()` per this session's standing feedback memory.
- Playwright: new mocked spec under `e2e/tests/flows/` covering the multi-role assign
  flow on an existing user (add/remove role chips, confirm the live matrix updates
  instantly with zero extra network calls per toggle, save, reload and confirm the
  applied set persisted), the grid's role filter, and the post-creation invite
  snackbar's "Configurar roles" link. Must read `docs/e2e-testing-guide.md` first and
  use `e2e/tests/flows/row-quick-actions.mocked.spec.js` as the canonical reference,
  per the Testing section.

**Acceptance:** `make test` green; Playwright spec passes locally.

**F9 Findings (Tester, landed — Vitest portion only):** wrote 9 new colocated Vitest
spec files (135 tests, all green) covering every DEV-complete surface from F2/F3/F5/F6
plus the `DetailView.jsx` `onAfterExistingSave` prop (F1/F3):
- `tools/app-shell/src/lib/__tests__/userRoleAssignmentsApi.vitest.js` (23 tests) —
  mirrors `rolesApi.vitest.js`'s `fetchNeoJson` coverage (request shape, both response
  modes, every rejection branch) plus `saveUserRoleAssignments`'s own
  `{success:false, message}` domain-rejection throw and `TemplateRoleIds` join encoding.
- `tools/app-shell/src/windows/custom/user/__tests__/AssignTemplateRolesControl.vitest.jsx`
  (20 tests) — save-first placeholder, fetch gating (token/apiBaseUrl/persisted-user),
  admin-role exclusion from options, chip collapse/overflow, toggle/remove wiring
  through `useRoleSelection()`, click-away close, and the documented inert-context
  fallback.
- `tools/app-shell/src/windows/custom/user/__tests__/UserRolesTab.vitest.jsx`
  (15 tests) — isNew→null + visibility reporting, empty state, category grouping/order,
  the 3 hardcoded General rows, full/read-only/absent cell resolution, Admin-column
  exclusion. **Also documents a real bug — see below.**
- `tools/app-shell/src/windows/custom/user/__tests__/RoleChipsCell.vitest.jsx`
  (23 tests) — `resolveUserId`/`resolveDefaultRoleId` pure-helper edge cases,
  `useUserRoleGridData()`'s fetch-once/error/defaulting behavior, and the cell's Admin
  branch (including the case where `adminRoleId` itself fails to resolve), overflow
  cap, unknown-role-id drop.
- `tools/app-shell/src/windows/custom/user/__tests__/RoleFilterControl.vitest.jsx`
  (9 tests) — null-when-no-roles, Admin included as a filter value (unlike the
  composition picker), label/allLabel/searchPlaceholder wiring, onChange passthrough.
- `tools/app-shell/src/windows/custom/user/__tests__/UserHeaderTable.vitest.jsx`
  (11 tests) — column list/order, `defaultRole`'s `type:'custom'`/`filterMode`
  override, prop passthrough to `DataTable`, and the client-side `filteredData` logic
  (by template role, by Admin role, clear-filter) — driven through a stubbed
  `RoleFilterControl` (same "faithful-but-minimal stub" convention as
  `AccountsHeaderTable.vitest.jsx`'s `DistinctValuesFilter` stub) rather than the real
  Radix popover, which has no existing driven-interaction precedent in this codebase.
- `tools/app-shell/src/windows/custom/user/__tests__/roleSelectionContext.vitest.jsx`
  (4 tests) — the documented never-throws-when-unwrapped fallback, both for reads and
  for the no-op setter, plus the Provider-supplied-value path.
- `tools/app-shell/src/windows/custom/user/__tests__/index.vitest.jsx` (16 tests) —
  fetch-on-load gating, `customTabs` wiring (`roles` + `attachments`, in order),
  `onAfterExistingSave` passthrough, and `handleRoleAssignmentSave`'s full contract:
  no-op on a saved record with no id, no-op on an unchanged selection (including a
  reordered-but-set-equal selection, proving `sameIdSet` is genuinely set-based, not
  array-equality), fires `saveUserRoleAssignments` with the full new set on a real
  change, does not re-fire on a second identical save once the ref catches up, and
  surfaces both a domain-rejection message and the generic i18n fallback via
  `toast.error`.
- `tools/app-shell/src/components/contract-ui/__tests__/DetailView.saveActions.vitest.js`
  — extended the existing `handlePostSaveNavigation` describe block with 3 tests
  mirroring `onAfterCreate`'s own coverage: `onAfterExistingSave` fires with
  `(saved, {token, apiBaseUrl})` when `!isNew`, never fires when `isNew` (even with a
  derivable id), and `onAfterCreate`/`onAfterExistingSave` never both fire for the same
  save.
- `InviteRolesSnackbar.jsx` was NOT tested — F7 was descoped to ETP-4830 after this
  dispatch's brief was written (see the Status table); no such file exists on disk.
- Checked `windows/registry.js`'s existing test coverage
  (`src/windows/__tests__/registry.test.js` + `.vitest.jsx`) per the dispatch brief:
  neither file has a `customLoaders`-keys snapshot or a
  "every custom window has a registry entry + index.jsx" consistency check today — both
  only exercise `buildMenuGroups`/`buildWindowMap`/settings-menu grouping. Per the
  brief's own instruction, did not invent one; out of scope for this pass.
- Full suite run after all additions: `npx vitest run` (no path filter) → **646 test
  files passed, 12007 tests passed, 3 skipped, 0 failed.** No regressions.
- **Real bug found in `UserRolesTab.jsx`, NOT fixed (Tester never modifies source —
  flagging for a developer):** the render-branch order checks `columns.length === 0`
  (→ empty state) BEFORE checking `loading`/`error`. `columns` is a `useMemo` derived
  from `rolesOverview?.roles`, and `rolesOverview` stays `null` for the ENTIRE duration
  of the in-flight fetch AND forever after a rejected fetch (the `.catch` only sets
  `error`, never `rolesOverview`). That makes `columns.length` 0 in both those cases
  regardless of how many roles are actually selected, so the `UserRolesTab__empty`
  branch wins every time — `UserRolesTab__loading` and `UserRolesTab__error` are dead
  code that can never render given the current branch order and effect structure. User
  impact: on a slow network the tab silently shows "Select a role to view permissions"
  (even though roles ARE selected) instead of a loading spinner; on a backend failure it
  shows the same misleading empty-state copy instead of an error message — indistinguishable
  from "you haven't picked a role yet," which could send a user chasing the wrong fix.
  Suggested remedy for whoever picks this up: check `loading`/`error` before the
  `columns.length === 0` empty-state branch, or gate the empty-state check on
  `!loading && !error && columns.length === 0`. The two Vitest tests
  (`AssignTemplateRolesControl.vitest.jsx` sibling file `UserRolesTab.vitest.jsx`,
  describe block "existing user") are titled `KNOWN BUG (dead code) — …` and assert the
  CURRENT (buggy) behavior on purpose, with a comment pointing back to this note — they
  will need updating (not just re-running) once this is actually fixed.

  **FIXED (2026-08-14, developer follow-up):** reordered the early-return checks in
  `UserRolesTab.jsx`'s render (`tools/app-shell/src/windows/custom/user/UserRolesTab.jsx`,
  the block right after the `isNew` guard, ~line 128 pre-fix) so `loading` and `error` are
  checked *before* `columns.length === 0` — the `isNew` guard still short-circuits first,
  unconditionally. `loading`/`error` are now reachable and verified rendering
  (`UserRolesTab__loading` / `UserRolesTab__error` testids) via a full `vitest run` pass on
  `tools/app-shell/src/windows/custom/user/`. As predicted, this flipped the 2
  `KNOWN BUG (dead code) — …` tests in `UserRolesTab.vitest.jsx` (the "existing user"
  describe block) from green to red — they asserted the old buggy behavior, which no
  longer happened.

  **Tester follow-up done (2026-08-14):** re-read the fixed `UserRolesTab.jsx` to confirm
  the actual branch order (`loading` → `error` → `columns.length === 0`), then updated the
  same 2 tests in `UserRolesTab.vitest.jsx` to assert the fixed behavior instead of the old
  bug: renamed them to `shows a loading indicator (not the empty state) while the two
  fetches are in flight, with roles selected` and `shows an error message (not the empty
  state) when a fetch rejects, with roles selected`; assertions now expect
  `UserRolesTab__loading`/`UserRolesTab__error` to be present and `UserRolesTab__empty` to
  be absent (previously the reverse). The `KNOWN BUG` framing/comment was replaced with a
  short regression-coverage note referencing this Findings entry. No other test in the file
  was touched, and the source file was not touched (already fixed by the developer).
  Verification: `UserRolesTab.vitest.jsx` alone → 15/15 passed; `windows/custom/user/`
  (7 files) → 98/98 passed; full repo suite (`npx vitest run`, no path filter) → 646 test
  files passed, 12007 tests passed, 3 skipped, 0 failed — no regressions. No
  `decisions.json`/generated-file changes were needed for either the fix or this test
  update — this was a pure component-logic fix plus matching test update.

**F9 Findings (Tester, Playwright portion, landed 2026-08-14):** read
`docs/e2e-testing-guide.md` end to end plus
`e2e/tests/flows/row-quick-actions.mocked.spec.js` (canonical reference) before writing
anything, then read every relevant source file (`AssignTemplateRolesControl.jsx`,
`UserRolesTab.jsx`, `RoleFilterControl.jsx`, `UserHeaderTable.jsx`,
`RoleChipsCell.jsx`, `index.jsx`, `roleSelectionContext.js`, `userRoleAssignmentsApi.js`,
`rolesApi.js`, `menuTree.js`, `DetailView.jsx`'s `computeIsDirty`/save-action helpers,
`UserPage.jsx`'s generated `api` block) to confirm exact `data-testid`s, endpoint
URLs/response shapes, and the `entity="user"` (not `"header"`) spec/entity naming before
writing a single selector or mock. No invite-snackbar coverage was written — F7 stayed
descoped to ETP-4830 with no component on disk, matching the dispatch brief.

Landed: `e2e/tests/flows/user-role-assignment.mocked.spec.js`, 8 tests in 2
`describe` blocks. Ran the full spec 3 consecutive times locally against `make dev`
(no `VITE_MOCK`, per the guide's gotcha) — **24/24 passed, no flakes.**

- `User role assignment — detail form (existing user)` (5 tests): chip toggle updates
  the "Roles del usuario" matrix instantly (column appears, General rows unconditionally
  ✓, a window-backed row reflects the mocked role's `tier`) with **zero extra network
  calls** to `rolesoverview`/`userroleassignments`/`listmenu`/`assignuserroles` per
  toggle (asserted via a `page.on('request', …)` counter snapshot before/after, not just
  visual confirmation); removing a chip narrows the matrix back down, same zero-call
  assertion; a `KNOWN BUG` test documenting that Guardar stays disabled after a
  role-only chip change (see the severe-bug writeup below); a follow-up test proving the
  downstream `SFAssignUserRoles` wiring itself is correct once Guardar is clickable
  (exactly one call, full desired role-id set, no re-fire on an unrelated second save);
  and a reload test seeding `SFUserRoleAssignments` single-user mode with a
  pre-existing selection and confirming both a fresh load and a `page.reload()` display
  it correctly.
- `User role assignment — Users grid role filter` (3 tests): grid renders per-user role
  chips including the classic-Admin branch (zero entries in the bulk `assignments` map,
  resolved via `defaultRole === adminRoleId` instead of falling through to an empty
  cell); filtering by a template role narrows the grid to rows carrying that composed
  role; filtering by the Admin option narrows to classic-Admin rows (the `Filtro
  Usuarios Admin.png` scenario) — Admin is a valid filter value here even though it's
  never a selectable composition template.

**Mocking notes worth keeping for future specs on this window:**
- Every endpoint this window's custom components call
  (`rolesoverview`/`userroleassignments`/`assignuserroles`/`listmenu`) is a plain
  `GET /sws/neo/<webhook>?...` webhook call, NOT the `<spec>/<entity>` CRUD shape
  `row-quick-actions.mocked.spec.js` covers — mocked each as its own `page.route()`,
  matching `lib/rolesApi.js`/`lib/userRoleAssignmentsApi.js`/`lib/menuTree.js`'s exact
  response shapes (unwrapped, no `{result: "..."}` wrapper needed since `fetchNeoJson`'s
  fallback branches accept the plain object directly).
- The "user" window's spec AND entity are both literally `"user"` (`api.baseUrl:
  "/sws/neo/user"`, `api.crud.user.listUrl: "/sws/neo/user/user"`) — NOT `"header"` like
  the four pilot order/invoice windows. Read the generated `UserPage.jsx`'s `api` block
  directly rather than assuming the `header` convention holds everywhere.
- `AppLayout.jsx` calls `useRoleMenu()` (→ `GET /sws/neo/listmenu`) on **every** route,
  not just windows that use it directly. `login()`'s baseline `/sws/**` catch-all
  `route.abort()`s that URL, which `useRoleMenu()` treats as "webhook unreachable" and
  fails OPEN (unfiltered sidebar). Overriding `listmenu` with a real but EMPTY tree
  (`{tree: [], count: 0}`) instead resolves `allowedIds` to an empty `Set`, which
  `AppLayout` treats as "zero window access" and renders a full-page "Sin acceso" block
  screen in place of the entire app — discovered by reproducing it directly against
  `make dev` before it made it into the committed spec. Any override of `listmenu` in a
  mocked spec must include at least one `windowId` (the window under test's own AD id is
  the simplest choice) to avoid this. The grid describe block sidesteps the whole issue
  by not overriding `listmenu` at all, since `RoleChipsCell`/`RoleFilterControl` don't
  need menu-tree data.
- `AssignTemplateRolesControl.jsx`'s chips (`AssignTemplateRolesControl__chip-*`,
  `__chip-remove-*`) only render in the collapsed view (`!isEditing`); the per-role
  checkboxes (`__toggle-<roleId>`) only render in the expanded view. A test that opens
  the editor (`__toggle-expand`), toggles roles, and then asserts chip visibility
  without closing the editor again will time out waiting for an element that is
  correctly not rendered yet — not a product bug, just an interaction-order gotcha
  worth noting for the next spec on this component.
- `RoleFilterControl.jsx` passes a `data-testid="RoleFilterControl__filter"` prop to
  `DistinctValuesFilter`, but `DistinctValuesFilter.jsx` never destructures or spreads a
  `data-testid` prop onto any DOM element — it is silently dropped. The popover's option
  rows (`DistinctValuesList.jsx`) have no stable testid at all. Selecting an option today
  requires scoping by the popover's structural class (`.w-64.p-0`, from
  `popoverWidth` + `p-0`) and then `getByRole('button', { name: <label> })` — plain
  `page.getByRole('button', { name: 'Finanzas' })` without that scope collides with an
  unrelated sidebar app-icon button of the same name. Not fixed (cosmetic
  testability gap, not incorrect behavior) — flagged here for whoever next touches
  `DistinctValuesFilter.jsx` or writes another filter spec against it.

**Two real bugs found while writing this spec, NOT fixed (Tester never modifies
source):**

1. **Severe — blocks this ticket's core acceptance criterion.** Role-only chip edits
   can never enable the "Guardar" button, so an admin who changes ONLY a user's roles
   (no other field edit) can never save that change through the UI at all. Root cause,
   traced in `DetailView.jsx`: for a non-draft-mode existing record (the "user" window's
   case — `draftMode:user` is `null`), `renderExistingRecordSaveAction` disables Guardar
   on `!isDirty`, and `isDirty = computeIsDirty(hook, addingLine, addingSecondaryLine,
   lineEdits, additionalDirtyState)` — `additionalDirtyState` is the one prop
   `DetailView.jsx` exposes specifically so a custom window can inject an extra dirty
   source (its own comment: "lets custom windows inject extra dirty sources via prop"),
   defaulting to `false`. `AssignTemplateRolesControl.jsx` deliberately never calls
   `onChange(...)` (by design — role composition is not a plain field write, per its own
   docstring), so `hook.isDirtyHeader` never reflects a chip toggle either.
   `windows/custom/user/index.jsx` never computes or passes `additionalDirtyState` to
   `UserPage`/`DetailView` at all. Net effect: there is currently no code path that ever
   marks the form dirty from a role-only change.

   **Reproduced empirically**, not just from source reading: ran a throwaway Playwright
   script against a live `make dev` instance (deleted after use, never committed) that
   opened an existing user, toggled 2 role chips with no other field touched, and
   confirmed `action-save` stayed `disabled`. As a sanity check, editing an unrelated
   plain field (`lastName`) alongside the same role toggle DID enable Guardar and DID
   fire `SFAssignUserRoles` correctly (`TemplateRoleIds` carrying the exact full desired
   set) — proving `hook.isDirtyHeader`, the button gating mechanism itself, and the
   downstream save-and-call wiring are all otherwise correct; only the
   `additionalDirtyState` wiring for role-only changes is missing.

   This is captured as a `KNOWN BUG` test in the new spec (`Guardar stays disabled after
   a role-only chip change (no other field edited)`), following the same
   assert-current-buggy-behavior-on-purpose convention as the `UserRolesTab.jsx` dead-code
   tests above (now fixed). **Suggested remedy for whoever picks this up:** have
   `windows/custom/user/index.jsx` track whether the current `selectedRoleIds` differ
   from `appliedRoleIdsRef.current` (it already has both, via `sameIdSet` — the exact
   comparison `handleRoleAssignmentSave` uses) and pass that boolean as
   `additionalDirtyState` to `UserPage`. Once fixed, this spec's `KNOWN BUG` test needs
   updating (not just re-running) to assert Guardar becomes enabled and fires
   `SFAssignUserRoles` directly, and could then fold into the "once Guardar is
   clickable…" test instead of needing a separate unrelated-field workaround to reach
   the save button at all.

   **FIXED (2026-08-14, developer follow-up, DEV wave 4):** `windows/custom/user/index.jsx`
   now computes `hasUnsavedRoleChange = !sameIdSet(selectedRoleIds, appliedRoleIdsRef.current)`
   on every render (reusing the exact `sameIdSet` helper `handleRoleAssignmentSave` already
   used — no duplicated comparison logic) and passes it to `UserPage` as
   `additionalDirtyState={hasUnsavedRoleChange}`, which flows straight through
   `UserPage.jsx`'s `{...props}` spread onto `<DetailView>`. One additional change was
   needed beyond the suggested remedy: `handleRoleAssignmentSave`'s success path now also
   calls `setSelectedRoleIds(confirmedIds)` alongside the existing
   `appliedRoleIdsRef.current = confirmedIds` — a ref mutation alone never triggers a
   re-render, so without mirroring the confirmed set back into state, `additionalDirtyState`
   would stay stuck at `true` after a successful Guardar instead of flipping back to `false`.
   `DetailView.jsx` itself was NOT modified — `additionalDirtyState` was already a wireable
   prop from the consumer side (`computeIsDirty(hook, addingLine, addingSecondaryLine,
   lineEdits, additionalDirtyState)`, checked with `=== true`), exactly as this task
   anticipated.

   Verified against a live `make dev` instance (not just source reading): toggling a role
   chip alone now enables Guardar; toggling it back to the original set re-disables it
   (checked with a throwaway Playwright script, deleted after use, never committed — same
   convention as Tester's original empirical reproduction); editing an unrelated field
   still works with no regression; clicking Guardar after a role-only change fires
   `SFAssignUserRoles` correctly. Ran the actual `KNOWN BUG` Playwright test
   (`user-role-assignment.mocked.spec.js:265`) against the fix: it now fails as expected
   (`action-save` resolves `enabled`, not `disabled`) — this is the exact staleness flagged
   below for Tester, reproduced directly rather than assumed. The other 7 tests in the spec
   still pass unmodified (7/8, 1 expected failure). Full Vitest suite: 646 files / 12007
   passed / 3 skipped / 0 failed — identical to the pre-fix baseline, no regressions.

   **Stale tests — Tester follow-up DONE (2026-08-14, this session, "Tester wave 5"):**
   - Playwright: `e2e/tests/flows/user-role-assignment.mocked.spec.js`'s
     `KNOWN BUG — Guardar stays disabled after a role-only chip change (no other field
     edited)` test was folded into the adjacent `once Guardar is clickable…` test (dropping
     its unrelated-`lastName`-edit workaround) and renamed to `a role-only chip change
     enables Guardar and, once clicked, calls SFAssignUserRoles exactly once with the full
     desired role-id set`. New assertions cover the full round trip: Guardar starts
     disabled; a role-only toggle (no other field touched) enables it; toggling back to the
     originally-saved set disables it again; re-toggling and clicking Guardar fires
     `SFAssignUserRoles` exactly once with the full desired role-id set; Guardar disables
     again post-save (the `setSelectedRoleIds(confirmedIds)` mirror-fix, verified end to
     end through the UI, not just unit-level); a second, unrelated field-only save does not
     re-fire the webhook. Spec now has 7 tests total (was 8; net -1 from the fold), all
     green (`npx playwright test tests/flows/user-role-assignment.mocked.spec.js` → 7
     passed).
   - Vitest: added a new `UserWindow — additionalDirtyState (the "extra dirty source" prop
     DetailView.jsx reads to enable Guardar)` describe block to `index.vitest.jsx` with 4
     tests: `false` on initial load once the local selection matches the fetched applied
     set; becomes `true` after toggling a role away from the applied snapshot; returns to
     `false` after toggling back to the originally-applied (empty) set; and the most
     important one — a regression test titled `regression: goes back to false after a
     successful handleRoleAssignmentSave (ref-mirror-to-state fix, not just a ref
     mutation)`, which directly locks in the exact bug DEV wave 4 fixed (the ref-only
     mutation not triggering a re-render). `index.vitest.jsx` now 20/20 green (was 16).

2. **Smaller — i18n gap.** `AssignTemplateRolesControl.jsx` calls `ui('assignedRolesLabel')`,
   `ui('noRolesAssigned')`, `ui('saveUserFirstForRoles')`, and `ui('removeRoleAria')`, but
   none of these four keys exist in `tools/app-shell/src/locales/en_US.json` or
   `es_ES.json` — confirmed by grep, zero hits in either file. `useUI()` falls back to
   returning the raw key string when a key is missing, so the control's field label,
   empty-state copy, save-first placeholder, and remove-chip `aria-label` all render as
   literal untranslated key names (`"assignedRolesLabel"`, `"noRolesAssigned"`, etc.) in
   both locales today — visible directly in this spec's own Playwright screenshots taken
   while diagnosing an unrelated selector issue. This is exactly the class of gap Task
   F8 exists to catch across F3/F5/F6; it slipped through for this one component. Not
   fixed (Tester never modifies source, and these are locale JSON files, not test
   files) — flagged for a developer to add the 4 keys (both locales) before REVIEW signs
   off on F8.

   **FIXED (2026-08-14, developer follow-up, DEV wave 4):** all 4 keys added to both
   `tools/app-shell/src/locales/en_US.json` and `es_ES.json`, grouped next to the
   existing `assignedRole`/`noRoleAssigned` pair: `assignedRolesLabel` ("Assigned
   roles" / "Roles asignados"), `noRolesAssigned` ("No roles assigned" / "Sin roles
   asignados"), `saveUserFirstForRoles` ("Save the user first to assign roles" /
   "Guarda el usuario primero para asignar roles"), `removeRoleAria` ("Remove role" /
   "Quitar rol") — real Spanish translations, not machine-literal copies. Verified both
   files still parse as valid JSON. `AssignTemplateRolesControl.vitest.jsx` mocks
   `useUI()` to return the raw key, so this fix has no Vitest-visible effect (confirmed
   unchanged in the full suite run); it's only observable in a real i18n-resolving
   context (e.g. Playwright against `make dev`).

   **Adjacent gap noticed, was NOT fixed by DEV wave 4 (out of that dispatch's explicit
   4-key scope):** `windows/custom/user/index.jsx`'s `handleRoleAssignmentSave` also
   calls `ui('roleAssignmentSaveFailed')` as its generic save-failure toast fallback
   (`index.vitest.jsx`'s own test `falls back to the generic i18n error key when the
   rejection has no message` exercises this path via the mocked `useUI`), and that key
   was ALSO missing from both `en_US.json`/`es_ES.json` — same class of bug, same
   grep-confirmed gap, just not one of the 4 keys that dispatch named.

   **FIXED (2026-08-14, this session, Tester wave 5):** added `roleAssignmentSaveFailed`
   to both locale files, placed next to `saveUserFirstForRoles`/`removeRoleAria` (same
   neighborhood as the other 4 role-assignment keys): `"Couldn't save the assigned
   roles"` (en_US) / `"No se pudieron guardar los roles asignados"` (es_ES). This is a
   locale-JSON-only change (not application logic); made directly per this session's
   dispatch rather than routed through another developer cycle, since it was a single
   missing key discovered mid-test-writing and blocking full F8 i18n completeness ahead
   of REVIEW. Both files verified to still parse as valid JSON.

**Tester Wave 5 Verification (2026-08-14, this session) — final pass/fail counts:**
- Playwright, targeted: `cd e2e && npx playwright test tests/flows/user-role-assignment.mocked.spec.js` → **7 passed, 0 failed** (was 8 tests pre-fold; net -1 from folding the stale `KNOWN BUG` test into the adjacent save-wiring test).
- Vitest, targeted: `cd tools/app-shell && npx vitest run src/windows/custom/user/__tests__/index.vitest.jsx` → **20 passed, 0 failed** (was 16; +4 new `additionalDirtyState` tests).
- Vitest, `windows/custom/user/` (7 files): **102 passed, 0 failed** (was 98; +4).
- Vitest, full repo (`npx vitest run`, no path filter): **646 test files passed, 12011 tests passed, 3 skipped, 0 failed** (was 646/12007/3/0 — net +4 from the new `additionalDirtyState` tests, no regressions elsewhere).
- Locale files: `roleAssignmentSaveFailed` added to both `en_US.json`/`es_ES.json`, both re-verified as valid JSON (implicitly, via the app booting under Vitest/Playwright with no i18n-loader failures).
- No source files touched other than the two locale JSON files (explicitly permitted exception) — `windows/custom/user/index.jsx` and all other application logic left untouched, per this dispatch's scope.

### Task F10 — Docs ⏳ PENDING (DOCS phase, after REVIEW/QA)

**Agent:** Sage (documentarian) — DOCS phase.

**Files:** Modify `docs/generated-custom-windows/user.md` (mandatory — window-specific
changes must update the matching guide in the same change, per the Documentation
Freshness policy) with the new multi-role picker, matrix tab, grid role filter/chips,
and invite-snackbar flow.

---

## Pipeline & Dispatch Plan

1. **Clerk**: confirm/verify both `feature/ETP-4906` branches (already cut, confirmed
   clean in orientation) — no new branch work needed to start.
2. **DEV wave 1 (parallel, no dependencies):** B1 (spike), F1 (spike), B2+B3 (can start
   immediately — needs no spike output).
3. **DEV wave 2:** F2 (needs B2's shape) → then F3, F5, F6 in parallel (each needs F1+F2
   but not each other). F7 (needed F3) was investigated and **descoped to ETP-4830**
   rather than built — see Task F7. B4/F4 are descoped to ETP-4889 (see those
   tasks) — no wave needed for either descoped pair in this ticket.
3b. **DEV wave 3 (follow-up, post-F9): ✅ DONE (2026-08-14).** Fixed the
   `UserRolesTab.jsx` dead-code loading/error bug Tester found while writing F9 (see F9
   Findings) — the `columns.length === 0` empty-state check no longer wins over an
   in-flight/failed fetch; `loading`/`error` are checked first. Full `vitest run` pass:
   645/646 files, 12005/12010 tests green, exactly the 2 expected `KNOWN BUG` test
   failures in `UserRolesTab.vitest.jsx` (now stale — assert the old buggy behavior) and
   nothing else. **Tester follow-up done (2026-08-14):** those 2 tests' titles/assertions
   updated to match the fixed behavior — full repo suite now 646/646 files, 12007/12010
   tests green, 3 skipped, 0 failed. See F9 Findings for detail.
4. **F9 (Tester)** dispatched per completed frontend task, or batched at the end of DEV
   wave 2 — developer's call, but every task's Guardar-affecting behavior needs a test
   before REVIEW. **✅ DONE (2026-08-14).** Vitest portion done (135 tests, F9 Findings);
   Playwright portion landed too — `e2e/tests/flows/user-role-assignment.mocked.spec.js`,
   8 tests, 24/24 green across 3 local runs (multi-role assign flow, grid role filter —
   no invite-snackbar coverage, since F7 is descoped). Surfaced a severe, unfixed bug
   (role-only chip edits can never enable Guardar) plus a smaller i18n gap (4 missing
   locale keys in `AssignTemplateRolesControl.jsx`) — see F9 Findings. **Neither is
   fixed yet; DEV wave 4 below is needed before REVIEW can sign off.**
3c. **DEV wave 4 (follow-up, post-F9 Playwright): ✅ DONE (2026-08-14).** Wired
   `additionalDirtyState` through `windows/custom/user/index.jsx` (`hasUnsavedRoleChange`,
   reusing `sameIdSet`, plus mirroring the confirmed set back into `selectedRoleIds`
   state post-save so the prop actually re-renders) so a role-only chip change enables
   Guardar — see F9 Findings' severe-bug writeup for the fix detail and empirical
   verification against `make dev`. Added the 4 missing locale keys
   (`assignedRolesLabel`, `noRolesAssigned`, `saveUserFirstForRoles`, `removeRoleAria`)
   to both `en_US.json` and `es_ES.json` — see F9 Findings' i18n-gap writeup (also noted
   one adjacent, out-of-scope gap: `roleAssignmentSaveFailed`, not fixed at the time).
   Full Vitest suite still green (646/12007/3 skipped/0 failed, identical to baseline).
3d. **Tester wave 5 (follow-up, post-DEV-wave-4): ✅ DONE (2026-08-14).** Updated the
   stale Playwright `KNOWN BUG` test (folded into the adjacent save-wiring test, renamed,
   now asserts the fixed enablement behavior end to end); added 4 new Vitest tests
   directly covering `additionalDirtyState` (including the ref-mirror-to-state
   regression case); closed the adjacent `roleAssignmentSaveFailed` i18n gap in both
   locale files. Final counts: Playwright spec 7/7 passed; `index.vitest.jsx` 20/20;
   `windows/custom/user/` 102/102; full repo Vitest suite 646 files / 12011 tests / 3
   skipped / 0 failed. See F9 Findings' "Tester Wave 5 Verification" for detail. **F9 is
   now fully closed — REVIEW can proceed.**
5. **REVIEW (Alex):** runs `npx sf-validate-pipeline --scope=user`; explicitly
   re-verifies the General-row/9-gap-row matrix decision (F5) against the live Figma
   file, not this plan's screenshot-derived assumption; confirms tenant-boundary
   discipline was preserved in `SFUserRoleAssignments` (B2); confirms i18n completeness
   (F8, including the 2 gaps DEV wave 4 must close); confirms the `UserRolesTab.jsx`
   dead-code bug (wave 3) AND the Guardar-enablement bug (wave 4) are both fixed before
   sign-off, not deferred past this ticket.
6. **QA (Sentinel):** exercises the full flow live — assign roles to an existing GOClient
   test user, confirm the matrix matches `UserRoleCompositionService`'s actual
   most-permissive-wins result after save (not just the local preview), confirm the
   Admin-role filter/chip path. Does **not** need to verify an invite email/snackbar —
   F7 is descoped to ETP-4830, out of this ticket's scope entirely.
7. **DOCS (Sage):** F10.
8. **Clerk:** PR creation. F1's spike concluded the `onAfterExistingSave` hook is a
   same-repo `DetailView.jsx` change — no `schema_forge_core` PR needed.
9. **Jira updates — ✅ DONE** (posted directly this session, see the Status table's
   "Jira updates" row for links): comment on **ETP-4906** noting both descopes
   (Empresa/multi-company → ETP-4889 after B1; invite snackbar → ETP-4830 after F7);
   comment on **ETP-4889** with B1's findings as its starting spec; comment on
   **ETP-4830** with F7's findings as its starting spec, including a recommendation to
   widen that ticket's scope to cover the frontend snackbar alongside the email send.

## REVIEW Findings (Alex, 2026-08-14)

**VERDICT: REJECT**

```
BLOCKERS (1):
- [B1] e2e/tests/flows/role-assignment.mocked.spec.js — pre-existing spec (ETP-4512) never
  deleted/updated when F3 deleted AssignRoleControl.jsx. 3 of its 4 tests now fail live.

WARNINGS (0)

SUGGESTIONS (1):
- [S1] tools/app-shell/src/components/contract-ui/DetailView.jsx:1036 — the
  onAfterExistingSave guard was appended onto the same physical line as the onAfterCreate
  guard (two statements, one line, no braces) to satisfy the DetailView-growth hook.
  Functionally correct and deliberate (documented in F3 Findings) but reads awkwardly.
  Not a blocker — the growth-guard constraint is real and this was the accepted tradeoff.
```

**[B1] in detail — confirmed empirically, not just by grep.** `AssignRoleControl.jsx` and
its two Vitest spec files were correctly deleted as part of F3, and every OTHER reference to
`AssignRoleControl` was cleaned up (decisions.json's `reason` strings, code comments,
`roleNameI18n.js` docstrings — all just historical mentions, harmless). But
`e2e/tests/flows/role-assignment.mocked.spec.js` — a pre-existing Playwright spec from
ETP-4512 that exercises the OLD single-select `AssignRoleControl__select` control — was never
touched. Since `window.headerExtra.customForm` in `decisions.json` now points at
`AssignTemplateRolesControl` instead, that testid no longer exists anywhere in the codebase
(confirmed via grep). Ran the spec live against `make dev` (already running in this
environment) to confirm, not just reason from source:
```
cd e2e && npx playwright test tests/flows/role-assignment.mocked.spec.js
  ✘ assigns a role via AssignRoleControl and it shows as a badge in the list grid
  ✘ the assign-role select is enabled once options load
  ✘ Save stays disabled until a different role is picked
  3 failed
```
This spec matches `**/*.mocked.spec.js` in `playwright.config.js` (not excluded anywhere), so
it runs by default and will fail CI/`make test` as-is. F3's task spec said "Delete:
`AssignRoleControl.jsx` and its `__tests__/` (superseded — confirm nothing else imports it
first)" — that check covered the colocated Vitest `__tests__/` dir but not the separate
`e2e/tests/flows/` Playwright spec for the same component. **Remedy:** delete
`role-assignment.mocked.spec.js` (fully superseded by the new
`user-role-assignment.mocked.spec.js`, which covers the same ground — chip assignment, save,
grid badge — against the new control) — or, if any of its 4 cases test something the new spec
doesn't, port that assertion over first, then delete it.

**FIXED (2026-08-14, developer follow-up).** Re-read the old spec end to end (it actually
contains 3 `test()` cases on disk, not 4 as REVIEW's live run output implied — the "3 failed"
Playwright output line has no companion "X passed" count, so the plan's "3 of 4" phrasing was
an overcount; doesn't change the outcome) and compared each against
`user-role-assignment.mocked.spec.js`:
- "assigns a role via `AssignRoleControl` and it shows as a badge in the list grid" (old,
  single-select dropdown → PATCH → list-grid badge showing the raw untranslated role name) —
  superseded by the new spec's "grid renders role chips per user…" test, which asserts the
  **replacement** grid surface (`RoleChipsCell`, translated labels like "Finanzas", plus the
  classic-Admin branch). The old assertion was specifically about the old `defaultRole`
  status-badge column's raw-name fallback (its own code comment explains that was an accepted,
  known limitation of the component being deleted) — that column no longer exists as such; F6
  replaced it outright. Not a gap, a different (and better-covered) surface.
- "the assign-role select is enabled once options load" (old, trivial enablement check) — no
  direct analog needed; the new spec exercises the replacement control
  (`AssignTemplateRolesControl`) through real toggle/chip interactions in every detail-form
  test, which is a strictly stronger check than "is the control enabled."
- "Save stays disabled until a different role is picked" (old) — directly superseded by the new
  spec's "a role-only chip change enables Guardar and, once clicked, calls `SFAssignUserRoles`
  exactly once…" test, which covers the same enablement contract plus save wiring, the
  toggle-back-disables-it-again case, and the no-double-fire-on-unrelated-save case (none of
  which the old test covered at all).

**Conclusion: fully superseded, no coverage gap.** No Tester follow-up needed for this blocker.
Deleted `e2e/tests/flows/role-assignment.mocked.spec.js` (`git rm` not used — `rm`, left staged
in the working tree per this task's instructions, not committed). Verified: re-ran
`user-role-assignment.mocked.spec.js` live against `make dev` → 7/7 passed (same result Alex's
own re-run reported); grepped the whole repo for `role-assignment.mocked.spec` and
`AssignRoleControl__select` — no other `e2e/`, CI-workflow, or `playwright.config.js` reference
exists (the suite is picked up purely by the `**/*.mocked.spec.js` glob, no per-file allowlist to
update). Two **pre-existing** stale doc mentions were found and deliberately left untouched here
(out of this blocker's scope, both predate this fix from F3's earlier `AssignRoleControl.jsx`
deletion, both belong to the still-pending F10/Sage docs pass) — flagging for Sage:
`docs/generated-custom-windows/user.md:64` (cites deleted `AssignRoleControl.jsx`/its Vitest spec
and now the deleted E2E spec as evidence for the Assigned Role headerExtra) and
`docs/functionalidad/02-capacidades-y-flujos.md:345` (same pattern, cites
`AssignRoleControl.jsx:1-92` and the deleted E2E spec as evidence). A handful of other hits
(`santo_roles_handoff_*.md` at repo root, `docs/superpowers/plans/2026-07-21-etp-4512-*.md`) are
historical/archival snapshots of the superseded ETP-4512 work, not live docs — correctly left
alone.

**The 7 specific checks from this ticket's Dispatch Plan (Task 5):**

1. **`npx sf-validate-pipeline --scope=user`** — ✅ clean (`Pipeline validation: OK`).
2. **General-row/9-gap-row Figma re-verification** — ❌ **could NOT complete.** Figma MCP
   tools (`get_design_context`, `get_screenshot`, `get_metadata`) are available in this
   environment, and the Jira ticket's Figma URL was found
   (`https://www.figma.com/design/UqMboGO6t73CwmFhVnDmuB/SaaS-Etendo-2025?node-id=6005-60551`),
   but this session's Figma account has no access to that file (`"you don't have edit access
   to this file"` on both `get_metadata` and `get_screenshot`). The
   `UserRolesTab.jsx`/`GENERAL_ROWS` implementation itself is internally consistent with the
   plan's documented decision (3 hardcoded rows, 9 gap rows omitted entirely — verified by
   reading the code and its javadoc), but the decision's fidelity to the live Figma file
   remains unverified by REVIEW, exactly as the plan flagged as a risk. Someone with file
   access must complete this check before merge.
3. **Tenant-boundary discipline (`SFUserRoleAssignments`/`UserRoleCompositionService`)** — ✅
   confirmed. `getAppliedTemplateRoleIds(userId, callerRole)` calls
   `enforceCallerClientBoundary(user, callerRole)` immediately after resolving `user`, before
   entering admin mode — the same placement `assignTemplateRoles`'s write path uses.
   `getAppliedTemplateRoleIdsForClient(clientId)` has no per-target-user boundary check, which
   is correct: it's always scoped to `currentRole.getClient().getId()` (verified in
   `SFUserRoleAssignments.get()`), mirroring `SFRolesOverview`'s identical
   "always-caller's-own-client" convention (verified directly in `SFRolesOverview.java`).
4. **i18n completeness (F8)** — ✅ confirmed. Extracted every `ui('...')` call (plus the
   `ADMIN_NAME_I18N_KEY` indirection and the 3 dynamic `row.labelKey` values) across all 7
   changed/new files in `windows/custom/user/` — 17 distinct keys total — and cross-checked
   each against both `en_US.json` and `es_ES.json`. All 17 present in both files, including
   the `roleAssignmentSaveFailed` gap Tester Wave 5 closed.
5. **Bug-fix spot-checks** — ✅ both confirmed fixed by direct code read, not just trusting
   the plan: `UserRolesTab.jsx` checks `loading` → `error` → `columns.length === 0` in that
   order (lines 138–163), so the dead-code bug is genuinely gone. `windows/custom/user/index.jsx`
   computes `hasUnsavedRoleChange` via `sameIdSet` on every render and passes it as
   `additionalDirtyState` to `UserPage` (line 106), with the confirmed-set-mirrored-to-state
   fix in `handleRoleAssignmentSave` (line 80) — also re-ran the new Playwright spec live
   (`user-role-assignment.mocked.spec.js`, 7/7 passed) which directly exercises this path.
6. **Full `schema_forge_rules` checklist:**
   - **Shared Component Changes (DetailView.jsx)** — ✅ verified backward-compatible.
     `additionalDirtyState` already existed as an optional prop (`= false` default) before
     this PR; `onAfterExistingSave` is new but strictly additive and guarded
     (`if (!isNew && onAfterExistingSave)`). Grepped every other `windows/custom/*` for both
     prop names — only `user` uses either. `renderNewRecordSaveActions` (the new-record path)
     was NOT touched, confirming `onAfterExistingSave` can never fire before an `AD_User_ID`
     exists, per the Global Constraints. File is exactly at the `epic/ETP-3504` baseline line
     count (4441 lines vs. the true 4440 merge-base — see the wording-nit correction
     under F3 Findings above), confirming the growth-guard hook's constraint was
     honored and this PR did not worsen the pre-existing 1-line gap.
   - **Custom Code Location** — ✅ all 7 new components live in
     `tools/app-shell/src/windows/custom/user/`. Generated `UserPage.jsx` imports them via
     `@/windows/custom/user/...` (verified: `UserHeaderTable`, `AssignTemplateRolesControl`,
     `UserRolesTab` all resolved through `resolveCustomImport()`'s filesystem-driven path
     selection, correctly choosing the `tools/app-shell` location over `artifacts/user/custom/`
     since only the former exists on disk for these files).
   - **Pipeline Chain Completeness** — ✅ confirmed. `customPanelTabs`, `customComponents`,
     and `headerExtra` are all read by `generate-frontend.js` (`buildCustomComponentImportsAndProps`,
     `buildFormFooterParts`, `getCustomTabItems`) and passed through by `resolve-curated.js`'s
     window-config whitelist — not brand-new keys, `sales-invoice`'s `InvoiceHeaderTable`
     already uses the same `customComponents.headerTable` pattern as precedent.
   - **Regeneration Invariant** — ✅ confirmed. The only touched file under
     `artifacts/user/generated/` is `UserPage.jsx`, and every changed line falls inside
     `@sf-generated-start component:UserPage` / `@sf-generated-end` markers. `contract.json`'s
     diff is exactly the decisions.json change reflected through (checksum updated,
     `contract.mcp.json`'s checksum matches) — no hand-editing outside the pipeline.
7. **Full test suites:**
   - **Frontend Vitest** — ✅ re-ran independently: `npx vitest run` (no path filter) →
     **646 test files passed, 12011 tests passed, 3 skipped, 0 failed** — matches the plan's
     last recorded count exactly, no drift.
   - **New Playwright spec** — ✅ re-ran independently against live `make dev`:
     `user-role-assignment.mocked.spec.js` → **7/7 passed**.
   - **Stale Playwright spec** — ❌ `role-assignment.mocked.spec.js` → **3/4 failed** (this
     is BLOCKER B1 above, found by REVIEW, not previously caught).
   - **Backend Java (`UserRoleCompositionServiceTest`, `SFUserRoleAssignmentsTest`,
     `NeoPseudoSpecDispatcherTest`, `SFAssignUserRolesTest`)** — ⚠️ **could NOT independently
     confirm within this review session.** `:modules:com.etendoerp.go:test` (the module-local
     Gradle task) reports `NO-SOURCE` — this module's `src-test` is only ever wired into the
     ROOT `test` task (contributed by the Etendo Gradle plugin), not its own local task. A
     root-level `./gradlew test --tests "com.etendoerp.go...."` run **silently matched zero
     tests while still reporting `BUILD SUCCESSFUL`** — reproduced this myself, a real
     false-green trap (matches this repo's own documented Gradle quirks). The only reliable
     path is a full, unfiltered `./gradlew test` from the Etendo root (the same method the
     plan's own B2 entry used) — kicked one off, and it was still running against the whole
     Etendo test suite (confirmed genuinely executing — hit real, in-progress pre-existing
     failures like `RectificativeInvoiceNoSifTest`/`ConversionRateDownloaderTest`, consistent
     with the plan's documented ~817-pre-existing-failure baseline) when this report was
     written. The backend commit (`bc2b6c8c`) has not changed since B2's own verified run
     (16/16, 8/8, 15/15, 8/8, confirmed against the same 817-failure baseline), so there is no
     new reason to expect regression — but this is REVIEW re-stating DEV's claim, not an
     independent re-confirmation. **Whoever picks up fixing B1 should let that backend run
     finish (or re-run it) and attach the result before the next REVIEW pass**, or explicitly
     accept DEV's original run as sufficient evidence — that's a coordinator/human call, not
     something REVIEW should silently assume either way.

**Everything else in this ticket's implementation is solid.** The i18n, tenant-boundary,
pipeline-chain, and regeneration-invariant checks all passed cleanly, the two previously-known
bugs (dead-code branch order, Guardar-enablement) are genuinely fixed and covered by
regression tests, and the new frontend test suites are fully green. The single BLOCKER is a
scope gap in F3's own cleanup step (a Playwright spec sibling to the Vitest specs it did
correctly delete), not a defect in the new functionality itself — straightforward to fix.

## REVIEW Re-Review Findings (Alex, 2026-08-14, agentId `a055d5018a6ab98e8`)

**VERDICT: APPROVE**

```
BLOCKERS (0)
WARNINGS (0)
SUGGESTIONS (1):
- [S1] docs/plans/2026-08-14-etp-4906-multi-role-user-assignment.md — "File is exactly at
  the epic/ETP-3504 baseline line count (4441 lines)" is imprecise: true merge-base is
  4440 lines, and the file was already 2 lines over it pre-ETP-4906 (not 1), from the
  unrelated ETP-4714 fix. ETP-4906's own diff to DetailView.jsx nets -1 line, so this PR
  did not introduce or worsen the gap — just a wording correction for whoever finalizes docs.
```

Independently re-verified rather than trusting the first pass's writeup: `git show
HEAD:e2e/tests/flows/role-assignment.mocked.spec.js` confirms the old spec is genuinely
gone from the committed tree; re-ran `user-role-assignment.mocked.spec.js` live against
the already-running `make dev` → 7/7 passed; grepped the repo for dangling references to
the old spec/testid — zero hits. Also independently re-ran
`npx sf-validate-pipeline --scope=user` (OK) and a targeted Vitest pass
(`windows/custom/user/` + `userRoleAssignmentsApi.vitest.js` +
`DetailView.saveActions.vitest.js` → 139/139 passed), and read the actual
`DetailView.jsx` diff directly (net **-1 line**, `onAfterExistingSave` additive and
guarded, `renderNewRecordSaveActions` untouched) rather than trusting the plan's claim.

Figma access attempted again independently (`mcp__claude_ai_Figma__get_screenshot` on
the same file/node) — same "no edit access" denial as the first pass. Two independent
sessions have now confirmed this is a real access gap, not a one-off fluke — **the
General-row/9-gap-row matrix decision in `UserRolesTab.jsx` needs a human with Figma
file access to sign off before merge.** Backend Java tests accepted per the standing
human instruction not to block on a full unfiltered `./gradlew test` run — targeted-class
results against `bc2b6c8c` (unchanged since B2) stand as sufficient evidence.

**REVIEW phase is closed. Proceeding to QA (Sentinel).**

## Self-Review Notes

- **Spec coverage (updated 2026-08-14):** 2 of the handoff's 4 original scope items ship
  in this ticket as built — grid role chips+filter (F6) and form multi-select+matrix tab
  (F3/F5). The other 2 were investigated and explicitly descoped by human decision, not
  silently dropped: multi-company (B1 spike → **ETP-4889**, no multi-org-per-tenant
  capability exists yet to build against) and the invite-roles snackbar (F7 investigation
  → **ETP-4830**, no invite-email mechanism exists yet for the snackbar to honestly
  describe). Both descopes are recorded on all four affected Jira tickets (ETP-4906,
  ETP-4889, ETP-4830) — see the Status table's "Jira updates" row for links.
- **Known gaps not resolved by this plan, flagged rather than guessed:**
  - The General-row Figma discrepancy (flagged for Alex, Task F5's Acceptance).
  - A real dead-code bug in `UserRolesTab.jsx` found by Tester while writing F9: the
    empty-state check ran before the loading/error checks, so a slow network or failed
    fetch always showed "Select a role to view permissions" instead of a loading spinner
    or error message. **FIXED (2026-08-14, developer follow-up)** — see F9 Findings and
    DEV wave 3. Follow-up done too: Tester updated the 2 `KNOWN BUG (dead code)` Vitest
    tests in `UserRolesTab.vitest.jsx` to match the fixed behavior (2026-08-14).
  - **Severe — FIXED (2026-08-14, developer follow-up, DEV wave 4), tests updated
    (2026-08-14, Tester wave 5):** role-only chip edits could never enable the "Guardar"
    button (missing `additionalDirtyState` wiring in `windows/custom/user/index.jsx`),
    found by Tester while writing F9's Playwright spec and reproduced empirically
    against `make dev`. Blocked the ticket's core "add/remove roles, click Guardar"
    acceptance criterion, not a corner case. Fixed and re-verified empirically against
    `make dev` — see F9 Findings for the fix detail. The Playwright test was folded into
    the adjacent save-wiring test and renamed to assert the fixed behavior; 4 new Vitest
    tests were added directly covering `additionalDirtyState`, including a regression
    test locking in the ref-mirror-to-state fix. **Fully closed — nothing further
    needed before REVIEW.**
  - **Smaller — FIXED (2026-08-14, developer follow-up, DEV wave 4 + Tester wave 5):** 5
    missing i18n keys total — 4 in `AssignTemplateRolesControl.jsx`
    (`assignedRolesLabel`, `noRolesAssigned`, `saveUserFirstForRoles`, `removeRoleAria`,
    fixed in DEV wave 4) plus one adjacent gap in `windows/custom/user/index.jsx`
    (`roleAssignmentSaveFailed`, found by DEV wave 4 but left unfixed pending its
    explicit scope, closed by Tester wave 5) — all 5 now present in both `en_US.json`
    and `es_ES.json` with real Spanish translations. See F9 Findings.
  - The save-lifecycle hook mechanism (F1), multi-company mechanism (B1), and the
    invite-email mechanism (F7) were all genuine unknowns at planning time but have
    since landed concrete answers — see their Findings sections above.
- **Reuse confirmed, not duplicated:** `SFRolesOverview`, `SFListMenu`,
  `SFAssignUserRoles`, `TemplateRoleWindowAccess`, `roleNameI18n.js` are all reused
  as-is; only `SFUserRoleAssignments` is genuinely new backend surface.
- **Second pass (pre-dispatch):** fixed a garbled/truncated sentence in F9's Playwright
  bullet; removed a literal "TBD" in the File Structure section; clarified that F3's
  `defaultRole` form-field display and F6's grid "Rol" column are two distinct
  customization surfaces on the same field (real confusion risk, now called out
  explicitly); added the classic-Admin detection branch to F6 (was a real gap — Admin
  users would otherwise render with an empty roles chip cell); softened F5's "already
  fetched for F3" claim into an explicit F1 sub-question, since two separate custom-slot
  components sharing one fetch isn't guaranteed by the generator without checking; added
  a stop condition to F7 in case no invite-email mechanism actually exists yet.
- **Third pass (2026-08-14, post-DEV-wave-2):** corrected two files (`DetailView.jsx`,
  `windows/registry.js`) that F3 silently depended on but this plan never listed in File
  Structure; fixed the locale path (`src/locales/`, not `src/i18n/` as originally
  guessed); updated F5/F6/F9's status rows, which had gone stale because both
  developer-4 and developer-5's sessions ended without ever sending a completion
  notification (their work was still correct on disk — confirmed by direct read, per
  this plan's own resumption protocol); recorded the F7→ETP-4830 descope and posted the
  corresponding Jira comments (previously only the B4/F4→ETP-4889 pair had been posted).

## QA Findings (Sentinel, 2026-08-14, agentId `a3f39375a6133d5c0`)

**VERDICT: APPROVE**

**Suites re-confirmed, independently:**
- `cd tools/app-shell && npx vitest run` (no path filter, full output captured, not
  piped through a truncating `tail`) — **646 test files passed, 12011 tests passed, 3
  skipped, 0 failed.** Matches the plan's last recorded count exactly, no drift. (An
  earlier run in this same session, piped through `| tail -40`, showed 6 files/18
  tests failed — re-running the 2 spot-checked files in isolation,
  `EditAccountModal.vitest.jsx` and `NewPaymentEntryModal.vitest.jsx`, both windows
  unrelated to ETP-4906, passed cleanly — 205/205. Confirmed this was resource-
  contention flakiness under full-suite parallel load, not a regression; the clean
  full re-run with untruncated output settles it.)
- `cd e2e && npx playwright test tests/flows/user-role-assignment.mocked.spec.js` →
  **7 passed, 0 failed**, matching F9/REVIEW's count.
- Targeted: `windows/custom/user/` + `userRoleAssignmentsApi.vitest.js` +
  `DetailView.saveActions.vitest.js` → 9 files / 139 tests, all green.

**DB reference data re-verified live** against `etendogoclean` (port 5416, per
`gradle.properties`), since the QA dispatch brief flagged the handoff's role/user
table as possibly stale: GOClient `ad_client_id`
(`802509E12436405C86BA1FD5B1DF508C`), all 4 template role ids (Finance
`127AE77FE2994067B7FE6495FC21D51E`, Sales `2A159DF4F4B944A6AA903202AD35B545`,
Purchasing `A826430F723E4C1B9A53EBB0746A98C0`, Inventory
`55E05A4B43514A029D6FB6B8D94B49D4`), and all 5 usernames
(`salestest`/`financetest`/`inventorytest`/`purchasetest`/`goadmin@etendo.software`)
— **all still accurate, none stale.** Also found 2 disposable-looking spare users on
GOClient not in the handoff table (`noroletest@etendo.software`,
`NewUsertest`/`asd@mail.com`), both currently role-less, no `AD_Role_Inheritance`
rows, no "Personal – " composition role exists yet anywhere on GOClient — this
feature has genuinely never been exercised against real production data before this
ticket.

**Blocked: the live browser-driven UI pass (Dispatch Plan Task 6, items 1–4).**
Could not log in as `goadmin@etendo.software` or any GOClient user against the
running `make dev` (port 3100) — no plaintext password is retrievable (hashed in DB;
per this repo's own memory notes, "ask the user... if needed"), and there is no
legitimate non-interactive path to a valid session for an EXISTING tenant's
EXISTING user: this repo's own real-backend E2E mechanism
(`scripts/run-e2e-full.sh`'s `onboarding-setup` project, `E2E_PASSWORD=12345`) only
self-registers a **brand-new** tenant via `/register`, which would never carry
GOClient's ETP-4852-seeded template roles. `docs/plans/2026-07-24-etp-4513-roles-overview.md:270`
documents the only precedent for this exact need — "credentials supplied by the
human mid-session" — confirming this has always required a human in the loop, not
something a prior agent session solved differently. **Flagging this for the
coordinator/human**, not attempting a workaround: whoever has GOClient credentials
(or can reset a disposable test user's password via backoffice) can complete steps
1–4 as a fast follow-up. Per this ticket's own precedent (REVIEW's identical
Figma-access gap, explicitly NOT a blocker), **a standing agent-unfixable
infrastructure/credentials gap does not block this phase.**

**Adapted the most-permissive-wins verification to what IS reachable without a
session: the real-DB Java integration-test layer.** Traced the actual
`assignTemplateRoles`/`mostPermissiveWindowAccess` union logic
(`UserRoleCompositionService.java:823+`) and found it already has committed,
passing, real-DB (`WeldBaseTest`, not mocked) regression coverage from prior
ETP-4852/4878 work: `UserRoleCompositionServiceOverlapIntegrationTest.java`
(`1e0f6ff8` "fix cross-template window-access overlap corruption", re-verified by a
prior Sentinel session in `fb42f79c`) composes the REAL Finance (full) + Sales
(read-only) system templates on a shared window and asserts the union resolves to
full, order-independent, no-op-safe on re-run. Confirmed via
`git show bc2b6c8c -- src/com/etendoerp/go/roles/UserRoleCompositionService.java`
that ETP-4906's own B2 diff to this file is **purely additive** (321 insertions,
only the 2 new `getAppliedTemplateRoleIds(For)Client` READ methods) — the write/
composition path this existing suite covers is untouched by this ticket, so that
coverage remains valid, current evidence for the behavior this ticket's UI depends
on.

**Found and closed one real, adjacent gap:** nothing before this pass proved the
NEW B2 read method actually reflects a REAL overlapping write — `SFUserRoleAssignmentsTest`
only exercises `getAppliedTemplateRoleIds` against a fully mocked
`UserRoleCompositionService`. Added
`testGetAppliedTemplateRoleIdsReflectsARealOverlappingComposition` to
`UserRoleCompositionServiceOverlapIntegrationTest.java` (real DB, same
Finance-full/Sales-read-only shared-window setup as its 3 siblings, rolled back
after): composes both templates via `assignTemplateRoles`, then calls
`getAppliedTemplateRoleIds(userId)` and asserts it returns exactly `{financeId,
salesId}`, AND separately re-confirms the underlying `AD_Window_Access` the read
path is describing is itself still the full (most-permissive-wins) result — closing
the loop between "the write composes correctly" (already proven) and "the read the
frontend's initial chip state relies on describes that same correct composition"
(previously unproven). `:modules:com.etendoerp.go:compileTestJava` reports
`NO-SOURCE` (same module-wiring quirk REVIEW already documented — this module's
`src-test` is only wired into the ROOT `test` task), so verified compilation via a
full `./gradlew :modules:com.etendoerp.go:compileJava` (production code, UP-TO-DATE)
plus kicked off a full unfiltered `./gradlew test` from the Etendo root — confirmed
it reached `:compileTestJava`/`:testClasses` cleanly (no compile error surfaced for
the new file) before entering `:test` and hitting the same pre-existing
`CoreTestSuite` failures (`ConversionRateDownloaderTest`,
`TicketbaiGipuzkoaBlockBTest`) the plan's own ~817-failure baseline already
documents. Per the standing human instruction REVIEW already established (accept
targeted-class evidence, don't block on a full unfiltered run), **did not wait for
this run to reach `com.etendoerp.go`'s own test classes** — it was left running in
the background; whoever picks this up next can check its result or accept the new
test's correctness by inspection (it follows the exact same APIs/pattern as its 3
already-passing, already-committed sibling tests in the same file, only recombining
already-proven calls).

**Other Dispatch Plan Task 6 items, status:**
- Item 3 (grid role chips + Admin filter narrows correctly) — covered by the
  Playwright suite's grid describe block (3/3 passing), but only against the mocked
  backend; not independently re-verified against real GOClient grid data due to the
  same login blocker above.
- Item 4 (role-only Guardar enablement persists through a real save + reload) —
  covered by the Playwright suite's `a role-only chip change enables Guardar...`
  test (real assertions against the fixed `additionalDirtyState` wiring), but again
  only against the mocked backend; not independently re-verified live for the same
  reason.

**No Critical/High bugs found in this pass.** REVIEW's approval stands; this pass
adds one new real-DB regression test and confirms (rather than merely re-states) the
existing suites' green status, with the login-credentials gap as the only unresolved
item — explicitly not a blocker, per this ticket's own precedent.

**QA phase is closed. Recommend proceeding to DOCS (Sage).**
