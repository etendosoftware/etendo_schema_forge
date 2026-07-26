# ETP-4513 — Read-only Roles view (Configuración > Roles) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. All 14 tasks are now DONE — Task 14 (Tester-authored Vitest/Playwright coverage) landed, and the documentation open question in "File Structure" is resolved (see below). The dev-mock timing limitation (see "Known Limitation Discovered") remains a known, out-of-scope environment gap, not a blocker.
>
> **Status (2026-07-26):** Both PRs (`etendo_schema_forge` #958, `com.etendoerp.go` #772) went through REVIEW; the only blocker raised on either was a documentation-freshness gap (`com.etendoerp.go/docs/neo-headless.md` missing the `SFRolesOverview` webhook + `isAdminOrClientAdmin` capability entries, and this repo's `app-shell-functional-flows.md` missing the `/roles` flow) — closed in a follow-up docs-only commit on each repo. No other findings were raised, which also confirms Task 6's static-analysis pass was clean.
>
> **Update (same day, later in the session):** the branch base changed — Clerk restacked both `feature/ETP-4513` branches onto `feature/ETP-4520`'s tip (PR #944, still open) instead of `epic/ETP-3504`, because `SFWindowAccessMap` (needed for the human's capability-flag decision below) only exists on that branch. The stash-pop after the restack produced one Javadoc-only merge conflict in `NeoAccessHelper.java`, resolved in Task 2b. Two decisions from the human were then applied (Tasks 2b/3b), and the frontend (originally gated behind coordinator review) was built in Tasks 7–13.

**Goal:** A new `Configuración > Roles` page listing GOClient's 5 fixed roles with description, assigned-windows list, and a per-role user count. Edit shows a "próximamente" (coming soon) notice; no create/delete actions anywhere.

**Architecture (decision already made, not up for re-litigation):** This is explicitly **NOT** a Schema Forge generated window. The native Etendo "Role" AD window (id `111`) is the full security-admin screen (Window/Org/Process/Table/Field Access tabs) — far more than this narrow, read-only aggregate view needs, and it doesn't fit the pipeline's CRUD-entity assumptions for an aggregate "count users, list windows" display. Instead:

- **Backend:** a new webhook in `com.etendoerp.go`, `SFRolesOverview`, modeled on `SFWindowAccessMap`'s shape/conventions (ETP-4520, not yet merged into this branch's base as of this writing — read via `git show feature/ETP-4520:src/com/etendoerp/go/schemaforge/webhooks/SFWindowAccessMap.java`) but answering a fundamentally different question: `SFWindowAccessMap` returns "what can the CURRENT caller's own role reach" for any authenticated role; `SFRolesOverview` is a **cross-role aggregate** that always returns all 5 roles' data regardless of the caller's own role, and is therefore gated to admin/client-admin callers only.
- **Frontend:** a hand-built custom page in `etendo_schema_forge`'s `tools/app-shell/`, following the standalone-custom-page convention (`runtime-routes.jsx` + `menu.json`, no `decisions.json`/pipeline artifact) already used by `OAuth2ClientsPage.jsx` and `SmartScanPage.jsx` under the same `Settings` menu group — **not** the `AppLayout.jsx` `NoAccessScreen` pattern (that one is a full-shell-replacement blocking screen with no route/menu entry at all, which doesn't fit a navigable settings page).

**Tech Stack:** Java (`com.etendoerp.go` webhook, JUnit/Mockito), React (`tools/app-shell`, to be built), i18n (`en_US.json`/`es_ES.json`, to be added once the frontend exists).

## Global Constraints

- All code, comments, commits, docs in English (repo-wide policy).
- Commit format: `Feature ETP-4513: <description>` (first line ≤ 80 chars), no `Co-Authored-By`.
- Two repos, two feature branches (already created before this plan was authored, per the coordinator, then restacked by Clerk): `feature/ETP-4513` in `com.etendoerp.go`, now based on `feature/ETP-4520`'s tip (was `epic/ETP-3504`); `feature/ETP-4513` in `etendo_schema_forge`, same base change. Branch/PR operations are delegated to Clerk — never done directly by the developer agent.
- Never guess Etendo AD/UUID values — query the DB or use `make uuid`. The 5 GOClient role IDs are already known (see `artifacts/user/decisions.json`'s `defaultRole.enumValues`) and must not be re-derived or guessed.
- Vitest/Playwright test authoring for the frontend is delegated to the `test-generator` (Tester) subagent per this repo's CLAUDE.md — never write those tests directly. JUnit tests in `com.etendoerp.go` are outside Tester's scope and are written directly by the developer.
- Every new frontend UI string → add to **both** `tools/app-shell/src/locales/en_US.json` and `es_ES.json`, under `genericLabels` (`docs/i18n-guide.md`). Not applicable yet — no frontend strings exist until Task 7+ lands.
- After any direct DB write + `./gradlew export.database` (Task 5), remind whoever runs the pipeline next that NEO config only persists in the exported seed XML, not automatically anywhere else.

---

## File Structure

**`com.etendoerp.go`** (backend — DONE):
- Modified: `src/com/etendoerp/go/schemaforge/util/NeoAccessHelper.java` — widened `isAdminOrClientAdmin(Role)` from `private` to `public`. Merge-conflicted during the restack (Task 2b) because `feature/ETP-4520` independently made the same change for `SFWindowAccessMap`'s benefit; resolved into one Javadoc naming both callers. Also now uses the branch's pre-existing `resolveCurrentRole()` (deduped into `NeoAccessHelper` by `feature/ETP-4520`) instead of a private local copy.
- Created: `src/com/etendoerp/go/schemaforge/webhooks/SFRolesOverview.java` — the new webhook. `description` renamed to `rawDescription` (Task 3b — decision 1) with class-javadoc callouts that it is NOT display copy.
- Created: `src-test/src/com/etendoerp/go/schemaforge/webhooks/SFRolesOverviewTest.java` — JUnit/Mockito coverage (10 tests, all passing).
- Modified: `src/com/etendoerp/go/schemaforge/webhooks/SFWindowAccessMap.java` — added `capabilities.isAdminOrClientAdmin` (Task 3b — decision 2), computed the same way as `showAccountingFields` (`true` in the admin/client-admin bypass branch, `false` otherwise).
- Modified: `src-test/src/com/etendoerp/go/schemaforge/webhooks/SFWindowAccessMapTest.java` — new assertions + a dedicated test for `isAdminOrClientAdmin` in both the bypass and restricted-role branches.
- Modified (seed data, via direct DB insert + `./gradlew export.database`): `src-db/database/sourcedata/SMFWHE_DEFINEDWEBHOOK.xml`, `src-db/database/sourcedata/SMFWHE_DEFINEDWEBHOOK_ROLE.xml` — registers the webhook (id `361436EE3D50484BBA012C226B1A3861`) and grants it `ALLOW_GROUP_ACCESS='Y'` (open invocation; the actual admin/client-admin gate is enforced inside the Java class, mirroring `SFListMenu`'s self-gating convention rather than an infra-level per-role ACL, since client-admin roles are per-tenant and can't be enumerated in a fixed ACL row).

**`etendo_schema_forge`** (frontend — DONE, Tasks 7–13 below):
- Created: `tools/app-shell/src/pages/RolesOverviewPage.jsx` — the list view (5 role cards, each with name/description, user-count badge, window chips with tier, and an Edit button that opens the coming-soon dialog).
- Created: `tools/app-shell/src/lib/rolesApi.js` — thin fetch wrapper for `GET /webhooks/SFRolesOverview`, mirroring `lib/menuTree.js`'s direct-webhook-fetch shape (NOT `lib/oauth2Api.js`'s `/oauth2/*`-route convention — see Task 7).
- Modified: `tools/app-shell/src/runtime-routes.jsx` — `lazyRoute('roles', RolesOverviewPage)`, alongside `smart-scan`/`oauth2-clients`.
- Modified: `tools/app-shell/src/menu.json` — new `roles` entry in the `Settings` group, no `windowId`, gated by `"capability": "isAdminOrClientAdmin"` (Task 9 — decision 2, superseding this plan's original Task 9 draft which had assumed no reliable client-side signal existed yet).
- Modified: `tools/app-shell/src/windows/registry.js` — `filterMenuGroupsByAccess()` gained a third, independent filtering axis (`capabilities`) for menu.json items that declare `"capability": "<key>"`.
- Modified: `tools/app-shell/src/layout/AppLayout.jsx` — reads `useCapabilitiesSafe()` and passes it into `filterMenuGroupsByAccess()`.
- Modified: `tools/app-shell/src/lib/mockFetch.js` — `SFWindowAccessMap` mock now also returns `isAdminOrClientAdmin: true`; added a new `SFRolesOverview` mock handler (5-role fixture) so `make dev-mock`/E2E can exercise this page without a live backend.
- Modified: `tools/app-shell/src/locales/en_US.json`, `tools/app-shell/src/locales/es_ES.json` — new `genericLabels` keys (role names' sibling `roleDesc*` curated descriptions, page copy, `accessTierFull`/`accessTierReadOnly`) — see Task 10.
- Documentation: no `docs/generated-custom-windows/<window>.md` entry applies (this isn't a pipeline window). **Resolved:** a hand-built settings page still needs a functional-flows entry — added as a new "6b. Roles overview (Configuración > Roles)" section in `docs/generated-custom-windows/app-shell-functional-flows.md`, mirroring the existing `OAuth2ClientsPage` (§6) precedent, plus a cross-reference update in `docs/generated-custom-windows/INDEX.md`'s one-line description of that guide (same pattern ETP-4514 used when it added the roleless-user "No access" screen case).

---

## Task 1: Confirm DAL property names and the access-check convention — DONE

**Files:** none (read-only investigation).

- [x] **Step 1: Read `SFWindowAccessMap.java` (ETP-4520, unmerged) for webhook conventions**

Confirmed via `git show feature/ETP-4520:src/.../SFWindowAccessMap.java`: captures the caller's role via a local `resolveCurrentRole()` (or, on that branch, `NeoAccessHelper.resolveCurrentRole()` — not yet present on this branch's `NeoAccessHelper`) **before** `OBContext.setAdminMode()`, exactly like `SFListMenu` on this branch. Uses `NeoAccessHelper.isAdminOrClientAdmin(role)` for the admin bypass (private on this branch at investigation time — see Task 2).

- [x] **Step 2: Confirm `AD_Window_Access` / `AD_User_Roles` DAL property names**

From `{etendo_root}/src-gen/org/openbravo/model/ad/access/WindowAccess.java` and `UserRoles.java`:
- `WindowAccess.PROPERTY_WINDOW = "window"` (getter `getWindow()`), `PROPERTY_ROLE = "role"`, `PROPERTY_ACTIVE = "active"`, `PROPERTY_EDITABLEFIELD = "editableField"` (`IsReadWrite` column, getter `isEditableField()`).
- `UserRoles.PROPERTY_USERCONTACT = "userContact"` (getter `getUserContact()` → `User`), `PROPERTY_ROLE = "role"`, `PROPERTY_ACTIVE = "active"`.
- `Role.PROPERTY_CLIENTADMIN = "clientAdmin"` (getter `isClientAdmin()`), `PROPERTY_NAME`/`PROPERTY_DESCRIPTION` as expected.

These all matched what `NeoAccessHelper`/`SFWindowAccessMap` already assumed — no surprises.

- [x] **Step 3: Confirm real data for the 5 GOClient roles**

Queried the shared local dev DB directly:

| Role | id | description (`AD_Role.description`) | active `AD_Window_Access` rows | active `AD_User_Roles` (distinct users) |
|---|---|---|---|---|
| GOClient Admin | `9B8D736190724807AB256DC95F20EC5E` | "GOClient Admin" | 266 (all native + GO windows) | 2 |
| Finance | `127AE77FE2994067B7FE6495FC21D51E` | "Etendo Go system role — do not edit or delete" | 9 | 2 |
| Sales | `2A159DF4F4B944A6AA903202AD35B545` | same generic text | 6 | 1 |
| Purchasing | `A826430F723E4C1B9A53EBB0746A98C0` | same generic text | 5 | 0 |
| Inventory | `55E05A4B43514A029D6FB6B8D94B49D4` | same generic text | 6 | 0 |

**Important finding — window-set scoping:** GOClient Admin's 266 active `AD_Window_Access` rows include every native Etendo window it happens to also have access to, not just the ~47 windows Etendo GO actually exposes (confirmed: intersecting against `ETGO_SF_SPEC` where `SPEC_TYPE='W' AND ISACTIVE='Y'` narrows GOClient Admin's list from 266 → exactly 47). **Design decision:** `SFRolesOverview`'s `windows` list is scoped to the Etendo-GO window set only (mirrors `SFWindowAccessMap`'s `resolveActiveEtendoGoWindowIds()` bypass-list logic) — showing all 266 native windows for the admin role would be meaningless noise in a "simplified Etendo Go" settings page.

**Resolved (decision 1, applied in Task 3b/10):** the human confirmed `AD_Role.description` is junk boilerplate ("*** Please, do not edit this role. Use Copy Record instead ***" for 4 of the 5 roles) and decided on option (b) above — curated, i18n-keyed descriptions in the frontend (`roleDescGoClientAdmin`, `roleDescFinance`, `roleDescSales`, `roleDescPurchasing`, `roleDescInventory`), following the exact same id→i18n-key pattern already established for role *names* in `artifacts/user/decisions.json`'s `defaultRole.enumValues`. The backend's field was renamed `description` → `rawDescription` and is documented as debug/fallback only, never display copy. The 5 curated descriptions actually shipped (Task 10) are grounded in each role's real window-access scope, queried from the DB in Task 1 Step 3 above (e.g. Finance's real windows are Account Tree/Financial Account/Payment In/Payment Out/Purchase Invoice/Sales Invoice/Simple G-L Journal/Tax Category/Tax Rate → "Manages accounting, financial accounts, payments, invoices and tax configuration").

---

## Task 2: Widen `NeoAccessHelper.isAdminOrClientAdmin` to `public` — DONE

**Files:** `com.etendoerp.go/src/com/etendoerp/go/schemaforge/util/NeoAccessHelper.java`

- [x] Changed `private static boolean isAdminOrClientAdmin(Role role)` → `public static boolean isAdminOrClientAdmin(Role role)`, with an added javadoc note explaining why (ETP-4513's cross-role aggregate needs "is the CALLER an admin", not "does a role reach window X"). No other behavior change. This is a minimal, additive, backward-compatible visibility widening — every existing internal caller (`hasWindowAccess`, `hasProcessAccess`, `hasObuiappProcessAccess`) is unaffected.

---

## Task 2b: Resolve the post-restack merge conflict in `NeoAccessHelper.java` — DONE

**Files:** `com.etendoerp.go/src/com/etendoerp/go/schemaforge/util/NeoAccessHelper.java`

Clerk restacked both `feature/ETP-4513` branches onto `feature/ETP-4520`'s tip (needed for `SFWindowAccessMap`, which decision 2 below depends on) and stash-popped this session's WIP back on top. The stash-pop conflicted at `isAdminOrClientAdmin`'s Javadoc: both `feature/ETP-4520` (citing `SFWindowAccessMap` as the caller) and this session's stashed WIP (citing `SFRolesOverview`) had independently widened the same method to `public` with their own doc comment — functionally identical, Javadoc-only conflict.

- [x] **Step 1:** Merged both doc comments into one naming both callers (`SFWindowAccessMap` (ETP-4520) and `SFRolesOverview` (ETP-4513)) instead of picking one side.
- [x] **Step 2:** Confirmed no `<<<<<<<`/`=======`/`>>>>>>>` markers remain (`grep`), `git add`, `git status` clean of "Unmerged paths".
- [x] **Step 3:** Adopted the branch's now-present `NeoAccessHelper.resolveCurrentRole()` (added by `feature/ETP-4520`'s "Dedup resolveCurrentRole into NeoAccessHelper" commit) in `SFRolesOverview.java`, removing its own private local copy — matches `SFListMenu`/`SFWindowAccessMap`'s now-shared convention.
- [x] **Step 4:** `git stash drop stash@{0}` ("ETP-4513 backend WIP before restack") — the unrelated pre-existing `stash@{1}` ("WIP on feature/ETP-4177") was left untouched throughout.
- [x] **Step 5:** Re-ran `./gradlew compile.complete` (BUILD SUCCESSFUL) and `./gradlew test --tests "*SFRolesOverviewTest"` (all 10 pass) to confirm nothing broke.

---

## Task 3: `SFRolesOverview` webhook — DONE

**Files:** `com.etendoerp.go/src/com/etendoerp/go/schemaforge/webhooks/SFRolesOverview.java`

- [x] **Step 1: Access gate** — capture the caller's role before `OBContext.setAdminMode()` (same convention as `SFListMenu`). If no role, or `!NeoAccessHelper.isAdminOrClientAdmin(role)` → return `{"roles": []}` (empty, not a 403 — matches this webhook family's existing "deny silently" convention; there is no precedent anywhere in this webhook family for an explicit 403/error-on-deny shape, so introducing one here would be inconsistent).
- [x] **Step 2: Resolve the Etendo-GO window set** — `resolveActiveEtendoGoWindowIds()`, same query shape as `SFWindowAccessMap`'s bypass-list helper (active `SFSpec` where `specType='W'`, distinct `getADWindow().getId()`).
- [x] **Step 3: Per-role aggregation** — for each of the 5 hardcoded `GOCLIENT_ROLE_IDS` (in display order: Admin, Finance, Sales, Purchasing, Inventory): resolve the `Role` via `OBDal.get()` (skip + log a warning if not found — defensive, so one bad id never breaks the other 4); `userCount` = distinct `getUserContact().getId()` over active `AD_User_Roles` rows for that role; `windows` = active `AD_Window_Access` rows for that role, filtered to the Etendo-GO window set, each with `{id, name, tier}` (`tier` = `"full"` if `isEditableField()==true` else `"read-only"`), sorted by window name.
- [x] **Step 4: Build** — `../../gradlew compile.complete` from the Etendo root: `BUILD SUCCESSFUL`.

### Response shape

```json
{
  "roles": [
    {
      "id": "9B8D736190724807AB256DC95F20EC5E",
      "name": "GOClient Admin",
      "rawDescription": "GOClient Admin",
      "userCount": 2,
      "windows": [
        { "id": "108", "name": "User", "tier": "full" },
        { "id": "146", "name": "Price List", "tier": "full" }
        // ... every Etendo-GO window this role has active AD_Window_Access to
      ]
    },
    { "id": "127AE77FE2994067B7FE6495FC21D51E", "name": "Finance", "...": "..." },
    { "id": "2A159DF4F4B944A6AA903202AD35B545", "name": "Sales", "...": "..." },
    { "id": "A826430F723E4C1B9A53EBB0746A98C0", "name": "Purchasing", "...": "..." },
    { "id": "55E05A4B43514A029D6FB6B8D94B49D4", "name": "Inventory", "...": "..." }
  ]
}
```

When denied (no role, or non-admin/non-client-admin caller): `{"roles": []}`.

### Access/auth model

`GET /webhooks/SFRolesOverview`, `ALLOW_GROUP_ACCESS='Y'` at the webhook-definition level (open invocation for any authenticated token, same as `SFListMenu`/`SFWindowAccessMap`) — **but** the Java code itself requires `NeoAccessHelper.isAdminOrClientAdmin(callerRole)` to return anything non-empty. This mirrors the existing self-gating pattern (webhook infra access ≠ data access; the latter is always enforced in Java) rather than trying to encode "admin or per-tenant client-admin" as a `SMFWHE_DEFINEDWEBHOOK_ROLE` ACL row, which can't represent "whichever role has `is_client_admin='Y'` for this caller's client" (that's a per-tenant, dynamically-provisioned role, not a fixed id an ACL table row could reference).

---

## Task 3b: `SFWindowAccessMap.isAdminOrClientAdmin` capability (decision 2) — DONE

**Files:** `com.etendoerp.go/src/com/etendoerp/go/schemaforge/webhooks/SFWindowAccessMap.java`, `src-test/.../SFWindowAccessMapTest.java`

The human decided the "Roles" menu entry should be gated by a proactive capability flag (so the frontend can hide it entirely for non-admins) rather than shown to everyone and denied on the page itself (this plan's original Task 9 draft, superseded).

- [x] **Step 1:** Added `capabilities.isAdminOrClientAdmin` alongside the existing `capabilities.showAccountingFields`: `true` in the admin/client-admin bypass branch, `false` in the restricted-role branch (reaching that branch at all already proves the check failed — no extra query needed). Updated the class javadoc's resolution-order list and added a paragraph explaining the frontend use case.
- [x] **Step 2:** Updated `SFWindowAccessMapTest.java`: added `assertTrue(...isAdminOrClientAdmin)` to both existing bypass tests (System Administrator, client-admin), and a new dedicated test (`testIsAdminOrClientAdminFalseForRestrictedRole`) for the restricted-role `false` case, mirroring the existing `showAccountingFields` test structure.
- [x] **Step 3:** Rebuilt + reran both webhook test suites together: `./gradlew test --tests "*SFRolesOverviewTest" --tests "*SFWindowAccessMapTest"` → 27 tests total (10 + 17), all pass except the 3 pre-existing `--tests`-filter suite artifacts (see Task 4).

---

## Task 4: `SFRolesOverviewTest` (JUnit/Mockito) — DONE

**Files:** `com.etendoerp.go/src-test/src/com/etendoerp/go/schemaforge/webhooks/SFRolesOverviewTest.java`

- [x] Extends `BaseWebhookTest`, using its `mockCriteria(Class)` helper, mirroring `SFListMenuTest`'s role-mocking helpers (`givenNoCallerRole`/`givenRestrictedCallerRole`/`givenSystemAdminCallerRole`/`givenClientAdminCallerRole`).
- [x] 10 test cases: no-role → empty + no `Role` lookups; restricted role → empty; System Administrator (`"0"`) passes the gate; client-admin (non-zero id, `isClientAdmin()==true`) passes the gate; all 5 roles returned in order with id/name/description; a role id that fails to resolve is skipped gracefully (other 4 still returned); user count counts distinct users only (2 rows, same user → count 1); a window outside the Etendo-GO spec set is excluded from the `windows` list; tier resolves `full`/`read-only` correctly per `isEditableField()`; an exception during aggregation sets `error`, not `result`.
- [x] **Gotcha found and fixed while writing these:** nesting a `when(mock.method()).thenReturn(...)` stub as a constructor argument *inside* an outer, not-yet-completed `when(outerMock.list()).thenReturn(...)` chain trips Mockito's `UnfinishedStubbingException` (Mockito only tolerates one "pending" stub between `when(...)` and `.thenReturn(...)` at a time). Fixed by always building row/spec lists as separate local variables before the `when(...).thenReturn(...)` call that consumes them — worth calling out explicitly since it's an easy trap to reintroduce in future tests for this same webhook if new per-role fixtures are added.
- [x] **Step: Run** — `./gradlew test --tests "*SFRolesOverviewTest"` from the Etendo root: all 10 tests pass. (The 3 `CoreTestSuite`/`StandaloneTestSuite`/`WebserviceTestSuite` `NoTestsDiscoveredException` failures that also show up in this run are a pre-existing artifact of using a `--tests` filter — reproduced identically against the unmodified, pre-existing `SFListWindowsTest`, confirming they are unrelated to this change.)

---

## Task 5: Register the webhook definition (`SMFWHE_DEFINEDWEBHOOK` + role ACL row) — DONE

**Files:** `com.etendoerp.go/src-db/database/sourcedata/SMFWHE_DEFINEDWEBHOOK.xml`, `.../SMFWHE_DEFINEDWEBHOOK_ROLE.xml`

- [x] **Step 1: Generate a fresh UUID** — `make uuid` → `361436EE3D50484BBA012C226B1A3861` (the webhook definition row) and `E4802FC53ACA458BA77FDC7613E6F6B9` (its role-ACL row, granted to role `"0"` for parity with the existing webhooks' pattern — irrelevant to actual access since `ALLOW_GROUP_ACCESS='Y'`).
- [x] **Step 2: Insert directly via SQL** (DB creds resolved from `{etendo_root}/gradle.properties`) — inserted both rows, matching `SFListMenu`'s existing row shape exactly (`AD_CLIENT_ID='0'`, `AD_ORG_ID='0'`, `AD_MODULE_ID='94E1B433CF55451EABB764750AC5902A'`, `EVENT_CLASS='JAVA'`).
- [x] **Step 3: Export** — `./gradlew export.database` from the Etendo root: `BUILD SUCCESSFUL`.
- [x] **Step 4: Scrub unrelated leaked state before committing anything** — the shared local dev DB used by this session also had uncommitted `EM_ETGO_Show_Acct_Fields` (`AD_COLUMN`/`AD_ELEMENT`/`AD_FIELD`/`AD_ROLE` modified-table) and an `SFWindowAccessMap` webhook-definition row from **ETP-4520** (a separate, unmerged branch that was apparently exercised against this same local Postgres instance in an earlier session). `export.database` naturally surfaced all of it, not just this task's own change. **Reverted** the `AD_COLUMN.xml`/`AD_ELEMENT.xml`/`AD_FIELD.xml`/`model/modifiedTables/AD_ROLE.xml` diffs and the `SFWindowAccessMap` block from both `SMFWHE_DEFINEDWEBHOOK.xml` and `SMFWHE_DEFINEDWEBHOOK_ROLE.xml` before finishing, keeping only the `SFRolesOverview` rows. **Anyone else exporting from this same shared local DB should double-check `git diff --stat` before committing, for the same reason.**
- [x] **Step 5: Verify** — XML well-formedness check (`xml.etree.ElementTree.parse`) on both files passed; `grep`-confirmed exactly one `SFRolesOverview` block in each file and zero leftover `SFWindowAccessMap` references.

---

## Task 6: Static analysis — DONE

**Files:** none new.

- [x] **Step 1:** `cli/sonar-check.sh` was not present on this branch's `etendo_schema_forge` checkout (it exists on several other, unrelated feature-branch worktrees but hasn't landed on this branch's line yet) — ran a copy from one of those worktrees against all 5 changed/new Java files (`SFRolesOverview.java`, `NeoAccessHelper.java`, `SFWindowAccessMap.java`, `SFRolesOverviewTest.java`, `SFWindowAccessMapTest.java`). First run was started before the post-restack conflict resolution and Task 3b's edits landed, so it was analyzing stale content — killed and re-ran fresh against the final file state. **Result:** confirmed clean — REVIEW subsequently ran its own pass over both PRs and raised only the documentation-freshness blocker (see plan-header Status note), with no static-analysis findings on any of these 5 files.

---

## Task 7: `RolesOverviewPage.jsx` — the list view — DONE

**Files:**
- Created: `tools/app-shell/src/pages/RolesOverviewPage.jsx`
- Created: `tools/app-shell/src/lib/rolesApi.js`

**Interfaces:**
- Consumes: `GET /webhooks/SFRolesOverview`. Confirmed the direct-webhook-fetch convention (like `lib/menuTree.js`'s `SFListMenu` call) applies here, NOT `oauth2Api.js`'s `/oauth2/*`-route + `createApiFetch` convention — this is a raw webhook, not a dedicated REST route.
- Produces: nothing consumed by later tasks — this is the top-level page component.

- [x] **Step 1:** `fetchRolesOverview()` in `lib/rolesApi.js` mirrors `lib/menuTree.js`'s `callMenuWebhook()` exactly: same-`sf_auth_token` GET, no `Content-Type` header (avoids an unnecessary CORS preflight), defensively unwraps the `{result: "<json-string>"}` shape this webhook family returns, treats a non-JSON 200 (SPA-fallback served with no backend/dev-proxy) as a failure rather than a silently-empty roles list.
- [x] **Step 2:** `RolesOverviewPage.jsx`: fetches on mount, renders one `Card` per role (name/description via i18n, `userCount` badge, `windows` as `Badge` chips — `default` variant for `tier:"full"`, `outline` for `tier:"read-only"`, sorted by name, title-tooltip showing the tier label). Loading state = 3 `Skeleton` blocks; error state = message + Retry button; denied/empty state (`roles.length === 0`) = `rolesNoAccessTitle`/`rolesNoAccessMessage` card (defense-in-depth — the real gate is Task 9's capability-gated menu entry + the backend itself, per `SFRolesOverview.java`'s class javadoc).
- [x] **Step 3:** No create/delete actions. Each role card has an Edit (pencil) icon button that opens Task 8's dialog — no navigation to a detail route.

---

## Task 8: Edit "coming soon" notice — DONE

**Files:** inline in `RolesOverviewPage.jsx` (a shared `Dialog`, not a separate route).

- [x] Clicking Edit on any role opens a `Dialog` with `ui('rolesEditComingSoonTitle')` ("Próximamente"/"Coming soon") and `ui('rolesEditComingSoonMessage')`, and a `ui('close')` button (reused existing generic key, not a new one). No form fields, no save button. Verified live in the browser (see "Smoke Test Results" below) — clicking Edit on the GOClient Admin role opened the dialog with the exact translated Spanish copy.

---

## Task 9: Route + menu wiring — DONE (per decision 2, capability-gated — supersedes this plan's original draft)

**Files:**
- Modified: `tools/app-shell/src/runtime-routes.jsx`
- Modified: `tools/app-shell/src/menu.json`
- Modified: `tools/app-shell/src/windows/registry.js`
- Modified: `tools/app-shell/src/layout/AppLayout.jsx`

**Interfaces:**
- Consumes: `RolesOverviewPage` from Task 7; `capabilities.isAdminOrClientAdmin` from Task 3b (`SFWindowAccessMap`).

This plan originally drafted an unfiltered menu entry (no reliable client-side admin signal existed yet) with denial handled only on the page. The human's decision 2 (relayed by the coordinator after Task 3b landed) superseded that: gate the menu entry itself via the new capability flag.

- [x] **Step 1:** `runtime-routes.jsx` — `const RolesOverviewPage = lazy(() => import('./pages/RolesOverviewPage.jsx'));` + `lazyRoute('roles', RolesOverviewPage)`, alongside `smart-scan`/`oauth2-clients`.
- [x] **Step 2:** `menu.json`'s `"Settings"` group — new entry after `"user"`: `{ "name": "roles", "label": "Roles", "favname": "Roles", "capability": "isAdminOrClientAdmin" }`. Still deliberately no `windowId` (no backing `AD_Window`), but now carries a `capability` key.
- [x] **Step 3:** `registry.js`'s `filterMenuGroupsByAccess(groups, allowedIds, capabilities = null)` gained a **second, independent filtering axis**: an item with a `capability` key is hidden unless `capabilities[item.capability] === true` — fails closed (matches `isCapabilityVisible`'s existing fail-closed convention), and is fully backward compatible (when both `allowedIds` and `capabilities` are falsy, returns `groups` unchanged, exactly like before this change).
- [x] **Step 4:** `AppLayout.jsx` now also calls `useCapabilitiesSafe()` and passes it as the third argument to `filterMenuGroupsByAccess()`.
- [x] **Step 5:** Verified the pure filtering logic with a standalone Node reproduction of `filterMenuGroupsByAccess` (4 scenarios: capabilities unloaded `{}` → hidden; `true` → shown; `false` → hidden; both `allowedIds`/`capabilities` null → unchanged) — all 4 matched the intended fail-closed design exactly.
- [x] **Step 6 (label resolution):** Confirmed `menu.json` items are looked up via `tMenu(item.label)` → `dictionary.genericLabels[item.label]` (exact-string match against the literal `label` value, falling back to the raw string). Added `genericLabels["Roles"] = "Roles"` (Task 10) for this lookup — sibling items like `oauth2-clients` don't have one today (a pre-existing, out-of-scope i18n gap for that entry, not introduced here).

---

## Task 10: i18n keys — DONE

**Files:** `tools/app-shell/src/locales/en_US.json`, `tools/app-shell/src/locales/es_ES.json`

- [x] Added to **both** files under `genericLabels`, right after the existing `roleNameGoClientAdmin`/`roleNameFinance`/`roleNameSales`/`roleNamePurchasing`/`roleNameInventory` keys: the 5 sibling `roleDescGoClientAdmin`/`roleDescFinance`/`roleDescSales`/`roleDescPurchasing`/`roleDescInventory` curated descriptions (decision 1 — see Task 1/3b), plus `"Roles"` (menu-label lookup key), `rolesPageTitle`, `rolesPageSubtitle`, `rolesColUsers`, `rolesColWindows`, `rolesNoAccessTitle`, `rolesNoAccessMessage`, `rolesLoadError`, `rolesEditComingSoonTitle`, `rolesEditComingSoonMessage`, `accessTierFull`, `accessTierReadOnly`. Reused existing keys where they already fit: `edit`, `retry`, `close`, `loading` — no duplicates added for those. Both files validated as parseable JSON.

---

## Task 11: `mockFetch.js` — dev-mock support for the new feature — DONE (added during smoke-testing, not originally planned)

**Files:** `tools/app-shell/src/lib/mockFetch.js`

Discovered while smoke-testing via `make dev-mock`: without this, the "Roles" menu entry is invisible in mock mode (capability defaults to falsy) and `RolesOverviewPage` 404s. Both are now covered:

- [x] `handleWindowAccessMapRequest()`'s mock `capabilities` now also returns `isAdminOrClientAdmin: true` (alongside the pre-existing `showAccountingFields: true`).
- [x] New `handleRolesOverviewRequest()` mirrors `SFRolesOverview.java`'s real response shape for the 5 fixed roles (including deliberately-boilerplate `rawDescription` values, matching the real backend, since the frontend never displays that field directly), intercepted via a new `isRolesOverviewRequest()`/`ROLES_OVERVIEW_PATH` check placed alongside the existing `WINDOW_ACCESS_MAP_PATH` check (same reasoning: `/webhooks/*` isn't under `basePath`, so it needs its own early check before the `basePath` guard).

---

## Task 12: Build verification — DONE

- [x] `npm install` at the repo root (root `package.json` was already pinned to the correct `0.3.17-preview.feature-ETP-4520...` build of `@etendosoftware/app-shell-core` after the restack, but `node_modules` was stale at `0.3.16` — a plain reinstall synced it; this is what `useHasCapability`/`useWindowAccess` needed to even be importable).
- [x] `make build` (production `vite build`) — clean, no errors, `RolesOverviewPage-<hash>.js` present as its own code-split chunk in `dist/assets/`.

---

## Task 13: Live smoke test via `make dev-mock` — DONE, with one discovered limitation (see below)

- [x] Started `make dev-mock`, logged in as a real admin user (`goadmin@etendo.software`, credentials supplied by the human mid-session) against the real backend this dev environment points at, and separately via a mock-mode-only fake-token bypass (mirroring `e2e/tests/helpers/auth.js`'s `login()` seeding, since a raw fake token alone gets logged out by a real 401 without also stubbing `/sws/*`).
- [x] Navigating directly to `/roles` (either auth method) renders the page correctly end-to-end: heading, subtitle, all 5 role cards with curated Spanish descriptions, correct user counts (2/2/1/0/0), correct window chips per role (matching the new mock fixture), and tier styling.
- [x] Clicking Edit on a role opens the "Próximamente" dialog with the exact translated copy, closes cleanly.
- [x] Directly invoking `fetch('/webhooks/SFWindowAccessMap')` from the browser console (after the mock install had definitely completed) returned `capabilities: {showAccountingFields: true, isAdminOrClientAdmin: true}` exactly as coded — confirms Task 11's mock data and Task 3b's real capability logic are both correct.
- [ ] **Could NOT verify live: the "Roles" menu entry actually appearing in the "Configuración" flyout.** See "Known Limitation Discovered" below — root-caused to a pre-existing dev-mock timing gap, not a bug in this feature's own code (proven separately via a standalone pure-function test in Task 9 Step 5 and the direct-fetch check above).

---

## Task 14: Delegate test authoring to Tester — DONE

- [x] Tester delivered all three pieces: `tools/app-shell/src/pages/__tests__/RolesOverviewPage.vitest.jsx` (loading/empty/denied/error states, one card per role with curated i18n copy, userCount badge, window chips with tier-based variant, no-windows placeholder, Edit "coming soon" dialog open/close, no create/delete affordance, refresh action); `registry.vitest.jsx`'s new `"filterMenuGroupsByAccess — capability axis (ETP-4513)"` describe block (shown/hidden per `capabilities[cap]`, fail-closed when the key or map is absent, both filtering axes applied independently, no regression to the pre-existing windowId-only behavior); and `e2e/tests/flows/roles-overview.mocked.spec.js` (menu-entry capability gating, all 5 roles rendered from the mocked `SFRolesOverview` response, Edit-dialog coming-soon flow, non-admin denial via a second `addInitScript` layer), per `docs/e2e-testing-guide.md` and the `role-filtered-sidebar.mocked.spec.js`/`row-quick-actions.mocked.spec.js` precedents.

---

## Known Limitation Discovered: `fetchWindowAccess` vs. mock-install race in `make dev-mock`

Not a bug in this feature — flagging for the coordinator/QA before relying on `make dev-mock` (or Playwright's mock mode, which uses a different, network-level interception and is NOT affected) to verify **any** `SFWindowAccessMap`-derived `capabilities` flag end-to-end via the app's own menu:

**Symptom:** in `make dev-mock`, `/webhooks/SFWindowAccessMap` was repeatedly observed hitting the real network (401) instead of the in-app mock override, across multiple fresh sessions (both a real backend login and a fake-token bypass), verified via the DevTools Network panel. This happened even though `window.fetch.toString()` confirmed the app's own mock-install wrapper WAS active on the page by the time it was inspected.

**Root cause (most likely):** `App.jsx`'s `VITE_MOCK` `useEffect` installs the `window.fetch` override only after `loadAllMockData()` resolves (a large `Promise.all` of ~40 dynamic `import()`s for window mock data) — this is asynchronous and can easily take longer than `AuthProvider`'s own session-hydration effect, which calls `fetchWindowAccess()` once, early, as soon as `session.selectedRole` is available. If that one call fires before the mock install finishes, it goes out over the real (unpatched-at-that-moment) `fetch`, hits whatever real backend this dev environment happens to be configured against, gets a 401 (that backend doesn't have `SFWindowAccessMap`/doesn't accept this session's token), and `capabilities` is left at `{}` for the rest of the session — there is no retry.

**Why this isn't an ETP-4513 bug:** the gating **logic** itself (`registry.js`'s `filterMenuGroupsByAccess`, `AppLayout.jsx`'s wiring, `SFWindowAccessMap.java`'s new field, `mockFetch.js`'s new mock data) was independently verified correct three separate ways (pure-function reproduction, direct in-browser `fetch()` call after the mock was confirmed installed, and the full `RolesOverviewPage` render succeeding via the very same `SFRolesOverview` mock path). The race is in `App.jsx`'s pre-existing mock-bootstrap sequencing (an `ETP-4520`-authored effect, unrelated to this ticket's code), and it would affect `showAccountingFields` identically — it is not specific to the new `isAdminOrClientAdmin` flag. It also does not exist in a real deployment: production has no mock-install step at all, so `fetchWindowAccess()` always hits the real, live `SFWindowAccessMap` synchronously with no client-side timing race.

**Suggested follow-up (not done here, out of scope):** move the `window.fetch` override installation in `App.jsx` to run synchronously (before first paint / outside the async `.then()`), with the mock DATA populated lazily once `loadAllMockData()` resolves — e.g. a wrapper that queues/awaits readiness rather than not existing at all until then. This would benefit any future capability-gated feature tested via `make dev-mock`, not just this one.

---

## Self-Review Notes

- **Spec coverage:** "Lists the 5 fixed GOClient roles with description + assigned windows" → Task 3/3b (`SFRolesOverview` backend) covers roles+windows, Task 10's curated `roleDesc*` keys cover description; Task 7 covers rendering. "Shows a user count per role" → Task 3's `userCount` + Task 7's rendering. "Edit shows a próximamente notice; no create/delete" → Task 8 + Task 7 Step 3 (verified live).
- **Access-model decision applied, not left as an open risk:** the original draft's "menu entry visible to everyone, denial handled on the page" was superseded by decision 2 — Task 9 now gates the menu entry itself via `capabilities.isAdminOrClientAdmin` (Task 3b), with the page's own empty-state as defense-in-depth, not the primary gate.
- **Decision 1 applied, not left open:** `AD_Role.description` boilerplate → curated, i18n-keyed `roleDesc*` strings (Task 10), backend field renamed to `rawDescription` and documented as non-display (Task 3b).
- **Known regression trap called out for future maintainers:** Task 4's Mockito `UnfinishedStubbingException` gotcha (nested `when()` inside an outer `when().thenReturn()` argument) — documented in the test file's own comments too, not just here.
- **Environment limitation documented, not silently worked around:** see "Known Limitation Discovered" above — the dev-mock `fetchWindowAccess` timing race. Verified this feature's own logic is correct through 3 independent methods instead of declaring victory on an incomplete/misleading live click-through.
- **Data hygiene risk called out for future maintainers:** Task 5 Step 4 — this repo's local dev DB is shared across many parallel worktree sessions; `export.database` exports the DB's ENTIRE current diff against committed seed data, not just the current task's changes. Always inspect `git diff --stat` after running it and revert anything not attributable to the current task before committing.
- **Type/name consistency:** `SFRolesOverview` is the Java class name, the `JAVA_CLASS`/`NAME` value in the webhook-definition seed rows, and the name used throughout this plan and the response-shape example — kept consistent everywhere it appears. `isAdminOrClientAdmin` is the exact capability key across `SFWindowAccessMap.java`, `mockFetch.js`, `menu.json`, and `registry.js` — a typo in any one of those four would silently break the gate.
