# Handoff: cross-client invitation self-invite may land in the wrong client

**Status:** active investigation, not started
**Branch:** `feature/ETP-4999` (both `etendo_schema_forge` and `com.etendoerp.go`, already checked out)
**Found:** 2026-08-26, while validating the fixes below via
`e2e/tests/flows/user-invitation.email.integration.spec.js`'s third test
(`'completes the same-account cross-client invitation flow and switches back'`)

## Context — what's already fixed and confirmed working today (do not re-investigate)

This session closed three real, confirmed bugs on this branch, all now compiled/applied
uncommitted:

1. **`PersonalRoleAccessProvisioningService.findFirstActiveWarehouse`** (`com.etendoerp.go`) —
   now falls back from exact-org match to client-wide match when looking up a warehouse for a
   newly-invited user's `Default_M_Warehouse_ID`.
2. **Onboarding admin identity gap (`OnboardingAdminIdentityService`, new file, `com.etendoerp.go`)**
   — self-registered admins never got `Default_Ad_Client_ID`/`Default_Ad_Org_ID`/
   `Default_M_Warehouse_ID`/`EM_SMFSWS_Default_WS_Role_ID` set at all (`InitialClientSetup` only
   knows the root org `'0'`); now wired as step 9 in `EtendoGoJwtServlet#ensureOnboardingDataset`.
   Corrective data-fix: `cli/src/data-fixes/sql/20260826T120000Z__R26-admin-identity-real-org.sql`.
   **Important: do NOT re-attempt repointing `AD_User_Roles.AD_Org_ID`** — core only ever allows
   that table at the root org `'0'` (`"Entity ADUserRoles may only have instances with
   organization *"`); an earlier version of today's fix tried that and broke onboarding for every
   new tenant. Reverted same day.
3. **`CompanyInvitationDalHelper.hasActiveRoleForOrganization`** (`com.etendoerp.go`) — was
   comparing against `AD_User_Roles.organization` (which per finding #2 can never be anything but
   `'0'` for ANY tenant, so this check could never return `true` for a non-root org — a
   pre-existing, always-latent bug). Fixed to check the role's `AD_Role_OrgAccess` grants instead,
   via the HQL entity name `ADRoleOrganization` (NOT `RoleOrganization` — that's only the Java
   class's simple name; the mapped HQL entity name, confirmed via `RoleOrganization.ENTITY_NAME`
   in `src-gen`, is `ADRoleOrganization`).
4. **`e2e/tests/flows/user-invitation.email.integration.spec.js`** — several test-only fixes:
   the first test now uses two real accounts instead of a self-invite (dedup-pollution root
   cause); `prepareInvitedUser` now calls the real `/sws/neo/systemroletemplates` +
   `/sws/neo/assignuserroles` role-composition webhooks instead of a raw `PATCH defaultRole`
   (which corrupted `EM_SMFSWS_Default_WS_Role_ID`); both those webhook responses needed a
   `unwrapNeoWebhookResult()` double-JSON-decode helper (NEO pseudo-spec bridge wraps payloads as
   `{"result": "<JSON string>"}`); the coworker's company-switcher fix (`data-testid="company-switcher"`
   on `SideMenu.jsx`, `getByTestId` instead of the untranslated `getByLabel('switchCompany')`) is
   also applied.

All four were validated together via **three separate `--headed --trace on` runs** of the
cross-client test (fresh `onboarding-setup` before each), and all three produced a FULLY correct,
complete `artifacts/delivery-evidence/ETP-4894/ETP-4894-cross-client-http.json` (current-run
client names, `returnedTo` matching the expected org, every HTTP signal at `200`,
`idempotentFirstLink: true`) — i.e. the underlying feature genuinely works end-to-end when run
`--headed --trace on`. Do not doubt or re-derive that baseline; start from "the feature works,
something else is wrong" for both mysteries below.

## Mystery #1 (primary target): self-invite lands in the WRONG client, headless-only

**Reproduction:** fresh `onboarding-setup`, then (note: **no** `--headed --trace on`):

```bash
E2E_USE_MOCK=0 BASE_URL=http://localhost:4173 E2E_EMAIL_SINK=0 E2E_EMAIL_SINK_URL=http://127.0.0.1:8025 E2E_PASSWORD=12345 \
  npx playwright test tests/flows/user-invitation.email.integration.spec.js \
    --project=integration -g "cross-client"
```

Failed with a REAL (non-spurious) error:

```
Error: Timed out waiting for custom to e2e-2824bcb7@test-onboarding.com
    at helpers/email-sink.js:30
    at .../user-invitation.email.integration.spec.js:435:26
```

Line 435 is the SECOND `waitForEmail` call in the test — the one that follows
`createInvitationAsAdmin(request, adminA.sessionToken, invitee.email)` (admin A / org1 inviting
`invitee.email`, which is admin A's OWN email — a legitimate self-invite exercising the
`requireExistingRole=true` explicit-invite path). The FIRST `waitForEmail` (line 422, for the
org2 invite via `prepareInvitedUser`) had already succeeded — the test reached line 435 at all,
and `createInvitationAsAdmin`'s own `expect(status).toBe(201)` (line 234ish) passed too.

**DB evidence gathered** (query pattern below, reuse it):

```bash
node -e "
const { createDbPool } = require('./cli/src/db.js');
(async () => {
  const pool = await createDbPool();
  const inv = await pool.query(\"SELECT etgo_invitation_id, email, status, created, ad_client_id FROM etgo_invitation WHERE lower(email) LIKE '%2824bcb7%' ORDER BY created\");
  console.log(JSON.stringify(inv.rows, null, 2));
  const users = await pool.query(\"SELECT ad_user_id, name, email, ad_client_id FROM ad_user WHERE lower(email) LIKE '%2824bcb7%'\");
  console.log('USERS:', JSON.stringify(users.rows, null, 2));
  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
"
```

Result: only **ONE** `etgo_invitation` row exists for `e2e-2824bcb7@test-onboarding.com`
(`ad_client_id = C97116C9519343A69E4CA86CED761304`), and only **ONE** `AD_User` row named
`"E2E Invitation User"` (the one `prepareInvitedUser` creates for the org2/admin-B invite),
**also** scoped to that SAME `ad_client_id`. If `createInvitationAsAdmin` (admin A's self-invite
into org1) had worked correctly, it should have produced a SECOND, separate `etgo_invitation` row
scoped to admin A's own (different) client — it didn't. Combined with the timeout at line 435,
this strongly suggests `createInvitationAsAdmin`'s call actually landed in **admin B's client**
(the SAME client `prepareInvitedUser` just used), not admin A's — i.e. either:

- the invite got created in the wrong client and its email never got sent to `invitee.email`
  as the SIN/dedup-visible recipient the test expects (worth checking `etgo_invitation`'s row
  more closely — was ITS status `SENT` too? if so, to whom, and did the sink actually receive
  it but the test's `recipient` filter somehow didn't match?), or
- `createInvitationAsAdmin`'s status-201 assertion is somehow passing against a RESPONSE that
  doesn't mean what the test assumes (e.g. a dedup no-op response reusing the FIRST invitation,
  mis-shaped in a way that still satisfies `status === 201`+`invitationBody.status === 'success'`
  — re-read `CompanyInvitationService#existingInvitationResponse`'s exact HTTP status/body shape
  to rule this in or out first, it's a cheap check).

**Leading hypothesis, unconfirmed — start here:** `CompanyInvitationService.createInvitation`
(`com.etendoerp.go/src/com/etendoerp/go/rest/CompanyInvitationService.java`, the method behind
`POST /sws/go/company-invitations`, called from `EtendoGoJwtServlet.handleCompanyInvitationCreate`
→ `runWithAuthenticatedAccount`) resolves `inviterAccount` from the bearer token
(`adminA.sessionToken`) and then calls `resolveInviter(Account)`
(`CompanyInvitationService.java`, ~line 758) to get `inviter.client`/`inviter.org`. If that
resolution is somehow returning admin B's client/org instead of admin A's — e.g. a caching bug,
a stale/shared `OBContext`, or a genuine account/session mixup specific to running back-to-back
`loginAsAdmin` calls for TWO DIFFERENT accounts in the same test — that would explain the whole
observed state. Read `resolveInviter` and `runWithAuthenticatedAccount` in full and trace exactly
how `adminA.sessionToken` maps to a `Client`/`Organization` on this call. Also check whether
`loginAsAdmin(request, secondAdminCredentials)` (called for adminB, right after adminA, both
against the same `request` fixture / same Playwright `APIRequestContext`) could somehow leave
server-side session state that a LATER call under a DIFFERENT bearer token reads by mistake —
this is exactly the kind of bug that would reproduce differently under headless vs. headed timing
(different request pacing) without being fundamentally about headed/headless per se.

**Also worth ruling out cheaply first:** a client NAME collision in the onboarding fixture (two
freshly-onboarded accounts this run coincidentally resolving to the same underlying
`AD_Client_ID` via `EtendoGoJwtSupport.findClientIdByName`'s existing-client "resume" path,
`EtendoGoJwtServlet.resolveOrCreateClient`) — check `ad_client_id` for BOTH
`onboardingCredentials`/`secondAdminCredentials`' admin users directly in the DB for this specific
failing run's `.auth-credentials.json`/`.auth-credentials-2.json` emails, independent of the
invitation-flow reasoning above. If they're already the same client at the SOURCE (before any
invitation logic runs), the bug is in onboarding/naming, not in `CompanyInvitationService`.

**Correlation, not yet explained:** this failure was NOT observed in any of the three `--headed
--trace on` runs (all fully succeeded) — only in the ONE run without those flags. That could mean
headed vs. headless timing masks/exposes a genuine race, or it could be coincidence (only one
headless run has been attempted so far). Get at least 2-3 more headless runs (fresh onboarding
each time) before treating "headless-specific" as a real signal rather than N=1 noise.

## Mystery #2 (secondary, lower priority): spurious `Test timeout of 60000ms exceeded` under `--headed --trace on`

All three of today's confirmed-successful `--headed --trace on` runs were nonetheless reported by
Playwright as **FAILED** with `Test timeout of 60000ms exceeded`, despite:
- `artifacts/delivery-evidence/ETP-4894/ETP-4894-cross-client-http.json` being written fresh and
  complete each time (proof the full test body executed to its final statement),
- the file declaring `test.describe.configure({ mode: 'serial', timeout: 180_000 })` (fixed today
  from a previously-broken standalone `test.setTimeout(180_000)` call, which is a documented
  Playwright no-op outside a running test/hook — that fix was applied and confirmed via
  `node_modules/playwright/types/test.d.ts` supporting `timeout` on `describe.configure`, but did
  **not** change this symptom at all),
- the reported duration next to the failed test in the CLI list output being suspiciously short
  each time (8.2s, 20.5s, 6.7s, 5.7s) relative to any 60s-or-180s ceiling — suggesting that number
  is not real total elapsed time.

This smells like something hanging or crashing during Playwright's own teardown (browser/context
close, fixture cleanup) AFTER the test body's last statement — NOT a problem with the test's own
declared timeout. `--headed` keeps a real (non-headless) browser window open, which behaves
differently in teardown than headless; investigate whether `--trace on`'s trace-file finalization
(recall: an earlier `trace.zip` from one of these "timeout" runs was found CORRUPTED/unreadable by
`unzip`, "End-of-central-directory signature not found" — consistent with the trace writer being
killed mid-write) is the actual hang, independent of the business logic already completing. Try:
`--headed` alone (no trace), `--trace on` alone (headless), and neither, across a few repeats each,
to isolate which flag combination triggers it. `DEBUG=pw:api` or Playwright's own verbose internals
logging may show exactly what's still in flight when the 60s mark hits.

## Notes for whoever picks this up

- Don't conflate the two mysteries — they may be unrelated. Mystery #1 is the higher-value target
  (a real correctness bug: an invitation email going to/being scoped for the wrong tenant would be
  a serious issue if it also happens outside this test's specific self-invite shape). Mystery #2 is
  a test-harness reporting nuisance that doesn't block confidence in the feature itself, given the
  three successful full runs.
- All DB access in this session went through `node -e "const { createDbPool } = require('./cli/src/db.js'); ..."` run from `etendo_schema_forge` (credentials auto-resolve from `gradle.properties`). Direct SQL writes are fine to propose but should be run by the human via `!` prefix per this session's established pattern — reads are fine to run directly.
- Tomcat logs (for server-side stack traces) are read via `docker logs etendogoclean-tomcat-1 --since <window>`, not a local file — this repo's Tomcat runs in an OrbStack container.
- Java changes need `cd /Users/gremiger/workspaces/etendogoclean/etendo && ./gradlew :modules:com.etendoerp.go:compileJava` (running gradle from inside the module directory fails with an unrelated plugin-configuration error in this environment — always invoke from the Etendo root) and a Tomcat restart to take effect.
- Test-file changes in `e2e/tests/flows/*.spec.js` are governed by this repo's CLAUDE.md: "any task that writes, extends, or fixes tests ... MUST be delegated to the `test-generator` subagent (Tester)." Product/Java code changes are not subject to that rule.
