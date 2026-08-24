# Etendo Go Invitation E2E Learnings

This reference records the project-specific knowledge learned while validating ETP-4894 against local Tomcat and the Schema Forge App Shell. It complements the reusable global `delivery-evidence-captures` skill.

## Runtime and token contract

The invitation API and NEO API use different tokens:

1. `POST /sws/go/login` authenticates an Etendo Go account and returns the account session token.
2. `GET /sws/go/environments` uses that session token and returns environment records, including `adminUserId`.
3. `GET /sws/go/login?userId=<adminUserId>` exchanges the account session for the Etendo environment JWT.
4. `/sws/neo/*` requests must use the environment JWT.

Using the account session token directly against NEO produces `401 Invalid or expired token` even though the account login itself succeeded.

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
