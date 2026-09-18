# ETP-5345: Self-Service Public API Key Provisioning

## Goal

Allow an authenticated Etendo Go user to create and manage credentials for the
public API from Etendo Go, without creating a second credential store or
exposing secrets outside the one-time creation flow.

The existing `ETGO_OAUTH2_CLIENT` table and OAuth2 token exchange remain the
storage and authentication foundation. The public API gateway continues to be
the only external API surface and continues to call NeoServlet, never Etendo
Core directly.

## Current implementation and gap

The module already provides client administration in
`etendo_core/modules/com.etendoerp.go/src/com/etendoerp/go/oauth2/OAuth2Servlet.java`:

- `GET /oauth2/clients`
- `POST /oauth2/clients`
- `PUT /oauth2/clients/{id}`
- `DELETE /oauth2/clients/{id}`
- `PUT /oauth2/clients/{id}/regenerate-secret`
- `POST /oauth2/revoke`

These operations currently require the System Administrator role. The existing
app-shell page at `/oauth2-clients` calls those endpoints and allows arbitrary
user, role, and scope IDs to be submitted. That is suitable for administration,
but not for self-service public API credentials.

## Design decisions

### 1. Separate public API resource from MCP administration

Add a dedicated public API credential resource rather than weakening the
authorization of `/oauth2/clients`:

- `GET /oauth2/api-keys`
- `POST /oauth2/api-keys`
- `PUT /oauth2/api-keys/{id}`
- `DELETE /oauth2/api-keys/{id}`
- `POST /oauth2/api-keys/{id}/rotate`
- `POST /oauth2/api-keys/{id}/revoke-tokens`

The implementation reuses the existing table through the generated DAL
entities and `OBDal`/`OBQuery`; it must not add raw SQL to the self-service
routes. These routes enforce public-API ownership rules independently from
MCP client administration. Existing `/oauth2/clients` behavior remains
unchanged for administrators and MCP integrations.

### 2. Server derives tenant and identity

The request may provide only a display name and requested public capabilities.
The server derives and persists all security-sensitive bindings from the
authenticated session:

- `ad_client_id` from the JWT client claim;
- `ad_org_id` from the JWT organization claim;
- `ad_user_id` from the authenticated user claim;
- `ad_role_id` from the active role/session context, after verifying the user
  can use that role in the tenant.

The server ignores or rejects caller-supplied `adClientId`, `adOrgId`,
`adUserId`, and `adRoleId`. Every list, update, rotate, revoke, and delete query
must include both tenant and owner predicates. An ID from another tenant must
behave as not found, not as forbidden-with-information.

### 3. Public capability allowlist

Do not expose the raw `neo:*` scope picker to self-service users. Define a
small server-owned capability map for the public contract, initially:

- `public-api:read` → the gateway's read operations for the currently
  published public schema;
- `public-api:write` → the gateway's declared create/update/delete operations,
  only when the role has the corresponding Etendo Go access;
- `public-api:process` → explicitly declared public processes only.

The server maps capabilities to the internal scopes accepted by the existing
OAuth2 implementation. A request containing unknown capabilities, wildcard
scope, MCP-only scope, or a capability not allowed for the active role is
rejected. The gateway still enforces entity, operation, field, and version
allowlists independently; a key scope is never a substitute for those filters.

### 4. One-time secret handling

Creation and rotation return the plaintext secret exactly once. The database
stores only the existing hash. The implementation must:

- generate the secret with the existing cryptographically secure helper;
- never log the plaintext secret, request body, or complete credential;
- never return the secret from list or update endpoints;
- revoke active tokens when rotating, by default;
- make rotation visibly destructive in the UI;
- return a stable client identifier separately from the secret.

### 5. Lifecycle and limits

The backend must enforce:

- a maximum number of active public API keys per user and tenant;
- a maximum name length and normalized non-empty name;
- no duplicate active names for the same owner;
- inactive keys cannot issue new tokens;
- deletion or revocation is idempotent and does not reveal another tenant's key;
- audit events for create, update, rotate, revoke, and delete without secrets.

The exact numeric limit must be a named module constant and documented with the
API contract, rather than hidden in the frontend.

### 6. UI entry point

Add a dedicated Etendo Go page at `/api-keys`, using the current OAuth2 client
page components where behavior is reusable but with public-API language and
safe fields:

- list only the current user's public API keys;
- create with name and allowed public capabilities;
- show client ID and secret in a one-time reveal dialog;
- copy each value independently and warn that the secret cannot be recovered;
- edit name and active state only;
- rotate with confirmation and one-time reveal;
- revoke tokens and delete with confirmation;
- never render internal user, role, tenant, or raw OAuth scope IDs.

The old administrator page remains available for administrator-only MCP client
management. The new menu item is visible only when the backend capability for
public API key management is present.

## Implementation sequence

### Phase A — Backend contract and authorization

1. Add a dedicated API-key DTO/parser and route dispatch in
   `OAuth2Servlet.java`.
2. Extract reusable client persistence operations so the existing admin routes
   and the new owned routes share hashing, token revocation, and serialization
   without sharing authorization decisions.
3. Implement tenant/owner predicates and active-role validation.
4. Implement the capability allowlist and mapping to accepted OAuth2 scopes.
5. Add the active-key limit, duplicate-name rule, validation messages, and
   secret redaction.
6. Add audit logging and ensure logs contain IDs and event names only.
7. Add Java unit/integration coverage for every authorization and lifecycle
   rule.

### Phase B — App-shell integration

1. Add `apiKeysApi.js` with the new endpoints and defensive error parsing.
2. Add `ApiKeysPage.jsx`, reusing the existing secret reveal and confirmation
   primitives without exposing admin-only fields.
3. Add the `/api-keys` runtime route and a capability-gated menu entry.
4. Add English copy first and preserve locale-key parity for the existing
   supported locales.
5. Add render and interaction tests for loading, empty, create, one-time
   reveal, rotation, revoke, delete, and API errors.

### Phase C — Contract, documentation, and end-to-end validation

1. Document the endpoints in the Etendo Go OAuth2/API documentation.
2. Update the public API developer documentation with the credential lifecycle,
   scope meanings, rotation behavior, and examples that never contain real
   secrets.
3. Update `docs/generated-custom-windows/app-shell-functional-flows.md` with
   the new page and edge cases.
4. Add OpenAPI definitions for the provisioning endpoints, marking the secret
   response as write-only/one-time in the description.
5. Validate the full flow locally with a real tenant-scoped user:
   create → list → consume → rotate → old credential rejected → new credential
   accepted → revoke/delete.
6. Validate cross-tenant and cross-user access with negative tests.

## Required security tests

- A user cannot list, update, rotate, revoke, or delete another user's key.
- A user cannot select another tenant, organization, role, or user by altering
  request fields.
- A wildcard or unsupported scope is rejected server-side.
- A secret is absent from list, update, error, and audit responses.
- A rotated secret is returned once and the previous secret no longer works.
- A revoked or inactive key cannot obtain a new token.
- The active-key limit is enforced atomically under concurrent creates.
- A missing or invalid session receives a clean `401`; an unauthorized role
  receives `403` without tenant data disclosure.
- Existing administrator-only `/oauth2/clients` and MCP flows do not regress.

## Known dependency

The `client_credentials` grant returns an opaque token. NeoServlet now supports
that token through the existing `OAuth2Filter.validateToken` fallback, which
resolves the persisted identity and applies expiry, revocation, and NEO scope
checks. A real end-to-end run still depends on a locally deployed Etendo
context and tenant/user fixtures; it must not be marked complete from unit
tests alone.

## Acceptance criteria

- A normal authenticated user can create and manage only their own
  tenant-scoped public API keys from Etendo Go.
- API capabilities are server-curated and cannot be escalated through request
  parameters or UI manipulation.
- Secrets are hashed at rest, shown once, never logged, and rotated safely.
- Existing MCP administrator flows remain unchanged.
- The UI, OpenAPI document, and functional documentation describe the same
  contract.
- Backend, frontend, security, and end-to-end tests pass with evidence recorded
  under the Etendo Go delivery gate.
