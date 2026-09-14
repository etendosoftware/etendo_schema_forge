# Etendo Go Invitation E2E Learnings

This reference records the project-specific knowledge learned while validating ETP-4894 against local Tomcat and the Schema Forge App Shell. It complements the reusable global `delivery-evidence-captures` skill.

## Runtime and token contract

The invitation API and NEO API use different tokens:

1. `POST /sws/go/login` authenticates an Etendo Go account and returns the account session token.
2. `GET /sws/go/environments` uses that session token and returns environment records, including `adminUserId`.
3. `GET /sws/go/login?userId=<adminUserId>` exchanges the account session for the Etendo environment JWT.
4. `/sws/neo/*` requests must use the environment JWT.

Using the account session token directly against NEO produces `401 Invalid or expired token` even though the account login itself succeeded.

## Opening /invite with a session already open (ETP-5202)

`/invite` is a public route, but it now inspects the session before rendering any credential
surface. What a test sees depends on who is signed in:

- **No session** (a fresh browser context — every project in `e2e/playwright.config.js` runs this
  way, none sets `storageState`): the acceptance flow renders directly, unchanged.
- **A session whose account email matches the invitation**: no prompt, and on the
  `existing_account` branch the login step is skipped entirely — the page goes straight to
  `invite-authenticated-step`. A spec that expects `invite-shared-login` here will fail.
- **A session belonging to anybody else**, or one whose identity cannot be resolved:
  `invite-session-conflict` renders instead of the acceptance flow. Continuing requires clicking
  `action-close-session`, which logs the previous user out and reloads `/invite?token=…`.

The identity comes from `GET /sws/neo/session` (`accountEmail`), tried with the tenant JWT first
and the platform token second. Add it to the routes a mocked spec stubs, or the guard will fail
safe into the conflict screen.

After accepting, `action-go-to-app` no longer means `navigate('/')`: it enters the inviting tenant
through `useEnvironmentSwitch.enterByClientName`, which is a full page load. When the signed-in
user has a tenant to return to, `action-stay-in-current` offers staying put.

### `canStayInCurrent` is per-browser-context, not per-account (ETP-5327)

`InviteAcceptancePage` decides whether to render `action-stay-in-current` from two `localStorage`
keys read directly off `globalThis.localStorage`, not from anything about the invitee's account:

```js
const currentClientName = readStoredValue('sf_auth_client_name');
const canStayInCurrent = Boolean(readStoredValue('sf_auth_token') && currentClientName);
```

`sf_auth_token`/`sf_auth_client_name` are written **only** by `persistEnvironmentSession()`
(`@etendosoftware/etendo-go-core/src/onboarding/state.js`), which only runs from
`useEnvironmentSwitch.switchTo()`/`enterByClientName()` — i.e. only after the user actually enters a
tenant (clicking `action-go-to-app`, or switching companies from the side menu). Logging in
(`LoginStep`) writes only `sf_platform_token`; accepting an invitation via the POST endpoint writes
no storage at all.

The trap for a spec: a fresh `browser.newContext()` starts with empty `localStorage`. If a test opens
a SECOND, separate context to accept a sibling invitation for the same invitee — reasoning "the
invitee already belongs to org1 in the database, so `canStayInCurrent` must be true" — that reasoning
does not hold. `canStayInCurrent` asks "did THIS browser context ever enter a tenant", not "does this
account belong to more than one tenant". A brand-new context never entered anything, so the button
structurally cannot render, no matter what the invitee owns. This is exactly the bug ETP-5327 fixed:
`user-invitation.email.integration.spec.js`'s cross-client test asserted `action-stay-in-current` on
an org2 acceptance that ran in its own fresh context. The fix is to run both acceptances through the
SAME `page`/`browser context` (`acceptExistingInvitation`'s `existingPage` option) — that context
genuinely enters org1 via `action-go-to-app` before the org2 acceptance ever loads, so
`sf_auth_token`/`sf_auth_client_name` are real.

One side effect of reusing the context: when the org2 invite page loads with an already-active
session for the SAME invitee, the section above ("no prompt... login step is skipped entirely")
applies — `invite-shared-login` never renders and the page goes straight to
`invite-authenticated-step`. A helper written to always expect the login form first will fail; it
must accept either render.

## Invitation fixture contract

The invitation flow assumes that the administrator has already created:

- an active `AD_USER` matching the invited email inside the target `AD_CLIENT`;
- an active `AD_USER_ROLES` assignment for the target organization;
- the Etendo Go account only when exercising the existing-account branch.

The invitation is email-only. It links the prepared ERP user to the account at acceptance and must not create, clone, or alter roles. A test that only calls `/sws/go/register` creates a platform account, not the ERP user required by the invitation service; it fails correctly with `INVITED_USER_NOT_FOUND`.

## Email sink and deploy configuration

For real email integration without contacting an external provider:

- run `e2e/support/email-sink.mjs` on host port `8025`;
- configure the effective Tomcat `Openbravo.properties` provider URL with `host.docker.internal:8025/send`;
- keep the sink API key and provider key aligned without documenting their values;
- verify `GET /health` before creating the invitation;
- if the Playwright-managed server exits between retries, keep the sink running independently and run the test with `E2E_EMAIL_SINK=0`.

The source `etendo_core/gradle.properties` is ignored by Git, so it is local deployment configuration and must still be checked manually against the effective file under `etendo_core/volumes/tomcat/webapps/etendo/WEB-INF/`.

## Stable dashboard evidence

The navigation assertion must prove both:

```text
URL matches /dashboard
AND
a loaded dashboard content block is visible
```

A URL match can occur while the dashboard still displays its skeleton. Capture only after a stable functional text block is visible, such as the localized pending-tasks panel. The screenshot should show the loaded Etendo Go dashboard, not the invitation success page or a loading state.

## Cross-client / multi-organization scenario

`ETGO_INVITATION.AD_CLIENT_ID` is set from the inviting administrator's ERP user. The invitation also stores its target organization. Therefore the intended cross-client test is:

1. Admin A invites the same email in Client 1 / Organization 1.
2. The user accepts and enters Organization 1.
3. Admin B invites the same email in Client 2 / Organization 2.
4. The user accepts the second link with the same Etendo Go account and enters Organization 2.
5. The first link resolves as already accepted, and the environment selector can return the user to Organization 1.

This requires prepared ERP users and roles in both clients plus two administrator credentials. Do not create tenants or roles implicitly inside the invitation test merely to manufacture this fixture.

## Evidence hygiene

Do not store raw invitation tokens, passwords, authorization headers, or real email contents in screenshots, logs, or Markdown. Record only sanitized recipient assertions, endpoint paths/statuses, visible states, and screenshot filenames.
