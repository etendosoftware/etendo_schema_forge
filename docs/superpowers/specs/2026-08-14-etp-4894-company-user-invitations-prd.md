# Company User Invitations

**Status:** Proposed replacement for the current ETP-4894 implementation
**Jira:** ETP-4894
**Date:** 2026-08-14
**Owners:** Etendo Go team

## 1. Summary

Allow a company administrator to invite a person to their company by entering only an email address. The invitation remains pending until the recipient accepts the emailed link.

The recipient experience has two branches:

1. An existing Etendo Go account holder signs in, returns to the invitation, and accepts the company invitation.
2. A recipient without an Etendo Go account creates a minimal platform account, then accepts the same invitation.

Neither branch may enter the company-creation onboarding flow. A company invitation is not a password reset.

## 2. Problem

The current branch repurposes the User window and the password-reset flow. It requires a user record before invitation, creates or changes password-reset state, and sends the recipient to `/onboarding?resetToken=...`. This does not meet the required user journey:

- administrators must be able to invite with an email only;
- invitation state must be visible as pending;
- existing users must accept without creating or resetting an account;
- new users must create only their Etendo Go account and then join the invited company;
- company onboarding must never be shown as part of acceptance.

## 3. Goals

- Create an invitation from a single syntactically valid email address.
- Persist a lifecycle record for the target company, recipient email, hashed token, expiry, delivery result, and accepted membership.
- Send a server-side, versioned `company-invitation` transactional email.
- Let an existing Etendo Go account holder authenticate with their existing account before accepting; the email link identifies the invitation but is not sufficient authority to create membership.
- Let a non-account recipient register a minimal Etendo Go account using the email bound to the invitation, then accept it.
- Create the target-company user/membership only when the invitation is accepted.
- Make accepted invitations idempotent and prevent duplicate active invitations for the same company/email pair.
- Expose pending and accepted invitation state to company administrators.

## 4. Non-goals

- Password reset or password-change flows.
- Company or tenant onboarding, client creation, billing, or plan selection.
- Inviting a recipient into arbitrary companies selected by the browser.
- Browser access to an email provider, raw provider payload, or secrets.
- Role-selection UI in the first invitation modal; the first iteration accepts only an email.
- Reusing the generated User CRUD create form as the invitation UI.

## 5. Roles and terminology

- **Inviter:** authenticated administrator of the current company.
- **Recipient:** person identified by the invitation email.
- **Existing account:** an active Etendo Go account matching the normalized invitation email.
- **New account:** no active Etendo Go account matching the invitation email.
- **Company membership:** the target company `AD_User` plus its effective tenant role/access assignment.
- **Invitation:** a short-lived bearer token stored only as a hash and tied to one company and one normalized email.

## 6. User experience

### 6.1 Invite a user

The User window's primary action is **Invite user**. It opens a dedicated modal containing exactly one required editable field: email.

On submit, the modal shows confirmation that the invitation is pending and that an email was sent. The user list or a dedicated Invitations section shows the recipient email and `Pending` status. It must not ask the inviter for the recipient name, password, username, company setup data, or onboarding data.

### 6.2 Existing Etendo Go account

The recipient opens the email link. The public invitation page displays the target company and a sanitized recipient email, then asks them to **Sign in to accept**. Login uses the normal Etendo Go account-login flow and must preserve the invitation return context without exposing the raw token in UI or logs.

After login, the backend verifies that the authenticated account's normalized email matches the invitation email. Only then does the page offer **Accept invitation**. Acceptance creates the company membership using the tenant invitation-access policy, marks the invitation accepted, and shows a success page with an open-company action.

The invitation page must not reset or collect the existing account password itself and must not route to company onboarding.

### 6.3 New Etendo Go account

The recipient opens the same link. The public invitation page displays an account-creation form, prefilled and locked to the invitation email. The form requests only the minimum platform-account fields approved by the existing registration policy (at least display name and strong password).

After successful registration, the backend accepts the invitation in the same transaction or compensating workflow, creates the company membership, and displays the same acceptance success page. It must not create a company or enter company onboarding.

### 6.4 Invalid states

Expired, revoked, consumed, or malformed links show a clear non-enumerating error and no account or membership action. Reopening an accepted link shows an idempotent accepted state, never creates another membership.

## 7. Functional requirements

### FR-1: Create invitation

`POST /sws/go/company-invitations` requires an authenticated inviter and accepts `{ "email": "..." }` only. The server derives the target company and inviter from authorization context; it never accepts company, client, organization, user, or role identifiers from the browser.

The endpoint normalizes email for matching, validates syntax, enforces invitation authorization, and creates one active invitation. Duplicate requests for the same pending company/email must be idempotent or return the current pending invitation without producing another active token.

### FR-2: Persisted lifecycle

Invitation storage must support `PENDING`, `SENT`, `ACCEPTED`, `EXPIRED`, `REVOKED`, and `DELIVERY_FAILED`. It must persist target client/company, normalized recipient email, hashed token, expiry, inviter/audit data, and accepted membership references when available.

`ETGO_INVITATION` must not require an `ETGO_ACCOUNT_ID` or `AD_USER_ID` before acceptance. Those references are populated only when known. Enforce at most one open invitation per target company/email, not globally per platform account.

### FR-3: Transactional email

The backend sends a versioned `company-invitation` email contract. Recipient resolution comes exclusively from the persisted invitation. The contract must have authorization, throttle, idempotency, audit, suppression, and kill-switch behavior documented in the transactional-email documentation.

The email link points to a dedicated invitation-acceptance route such as `/invite?token=...`, never to a password-reset or onboarding route.

### FR-4: Resolve invitation link

`GET /sws/go/company-invitations/resolve?token=...` is public and returns only the information needed to render the acceptance page: valid invitation state, target company display name, masked email, expiry, and whether the next step is sign-in or registration. It must not leak account details beyond this token-bound flow.

### FR-5: Existing-account acceptance

`POST /sws/go/company-invitations/accept` requires the authenticated Etendo Go account session plus `{ "token": "..." }`. It verifies that the authenticated account email matches the invitation email before it creates or reuses the target-company membership, marks the invitation `ACCEPTED`, and returns a success response. The operation is idempotent. A token alone must be rejected for an existing account.

### FR-6: New-account registration and acceptance

`POST /sws/go/company-invitations/register-and-accept` accepts `{ "token": "...", "name": "...", "password": "..." }`. The backend verifies the token, creates the Etendo Go account using the invitation email only, validates the existing password policy, creates or reuses target-company membership, and marks the invitation accepted.

It must reject a token/email mismatch, existing-account race, weak password, expired/revoked link, or membership authorization failure without leaving a partial accepted invitation or orphan membership.

### FR-7: Membership and authorization policy

The server derives the membership's client and organization from the invitation. It must use an explicit tenant-configured **invitation default role/access policy**. It must not hardcode a role ID, infer the inviter's administrative role, or grant more access than the policy allows.

The exact configuration record and fallback behavior are an implementation decision that must be resolved before coding. If no valid default invitation role exists, invitation creation must fail with an actionable administrator error.

### FR-8: Public UI

Add a dedicated public invitation page outside `OnboardingFlow`. It renders one of: loading, existing-account acceptance, new-account creation, accepted success, or invalid/expired/revoked error. It must remove tokens from browser history after a successful action and never render raw token values.

### FR-9: Administrator UI

Replace the current User CRUD invitation wrapper with a custom email-only invitation entry point. Show pending/accepted delivery state without exposing token values. User CRUD may remain available separately for advanced administration, but it is not the invitation path.

### FR-10: Compatibility and migration

Existing password-reset behavior must remain unchanged. Existing pending accounts and the current reset-token-based invitation code must not be treated as company invitations. Migrate or supersede the current ETP-4894 branch changes deliberately; do not leave two competing invitation implementations.

## 8. Security requirements

- Store only SHA-256 or stronger token hashes; never persist or log raw invitation tokens.
- Expire tokens within a documented TTL and validate status before every action.
- Rate-limit creation and acceptance attempts.
- Require normal Etendo Go authentication before an existing account can accept. Verify the authenticated account email against the invitation email server-side.
- Do not expose whether arbitrary emails have Etendo Go accounts outside a valid token-bound invitation page.
- Bind account registration to the invitation email; it cannot be changed in the browser request.
- Require server-side authorization for invitation creation and membership assignment.
- Sanitize all email templates and public-page content.
- Ensure accepted/revoked/expired links cannot create memberships.

## 9. Repository responsibilities

### Schema Forge

- Replace the User window's generic create-as-invite presentation with an email-only invitation modal and pending status presentation.
- Add the public invitation acceptance page and route, explicitly outside company onboarding.
- Add localized strings for invitation creation, pending, existing-account acceptance, registration, success, and invalid-link states.
- Add Playwright coverage and visual evidence for all three main paths.
- Update `docs/generated-custom-windows/user.md` and task documentation.

### `schema_forge_core`

- Add reusable auth/invitation API helpers or public-page primitives only if they belong in the shared core package.
- Do not couple shared onboarding components to company invitations. The acceptance page must remain independently routable.
- Add unit tests for any shared API helper or component introduced.

### `com.etendoerp.go`

- Create dedicated company-invitation endpoints and service; do not reuse `/password-reset/*` endpoints or account reset-token columns.
- Update `ETGO_INVITATION` schema/dictionary as required for pre-account/pre-user pending invitations and client/email uniqueness.
- Implement account detection, account creation, membership creation, tenant role policy, lifecycle transitions, email contract, expiry, idempotency, and authorization.
- Update transactional-email documentation and add unit/integration tests.

## 10. Acceptance criteria

1. An authorized company administrator can invite with only an email and sees a pending invitation confirmation.
2. A pending invitation stores the target company, normalized email, hash, expiry, and lifecycle state without requiring an existing account or target `AD_User`.
3. The invitation email links to a dedicated invitation page, not a reset-password or company-onboarding page.
4. A recipient with an existing Etendo Go account signs in through the normal account-login flow, returns to the invitation, and accepts with one confirmation action; a token-only acceptance request is rejected.
5. A recipient without an Etendo Go account creates a minimal account on the invitation page and then gains exactly the configured company access.
6. Both acceptance paths mark the same invitation `ACCEPTED`, are idempotent, and do not create duplicate memberships.
7. Expired, revoked, delivered-failed, malformed, and already-accepted links have safe, clear behavior.
8. Invitation creation is unauthorized outside the inviter's company and cannot grant an arbitrary role/client/organization from browser input.
9. Password reset and company onboarding behaviors remain unchanged.
10. Backend, frontend, and Playwright tests cover the flows, and the delivery includes sanitized screenshots with captions for invite-pending, existing-account acceptance, and new-account registration-and-acceptance.

## 11. Test plan

### Backend

- authorized creation with one email;
- unauthorized inviter and invalid email rejection;
- duplicate open invitation idempotency;
- existing account branch requires login and verifies authenticated email before acceptance;
- new account registration bound to invitation email;
- weak password and account-creation race handling;
- membership role-policy resolution and missing-policy failure;
- acceptance idempotency, expiry, revocation, and delivery failure;
- no mutation of password-reset token state;
- transactional email contract behavior and audit.

### Frontend and E2E

- invite modal submits only email and renders pending confirmation;
- existing-account invitation page redirects to login, resumes the invitation after authentication, and rejects an account/email mismatch without onboarding navigation;
- new-account page creates account and accepts without onboarding navigation;
- invalid/expired link behavior;
- browser history no longer contains the token after success;
- screenshots for pending invitation, existing-account accepted, and new-account accepted states.

## 12. Open implementation decision

The tenant-configured default role/access policy is mandatory before implementation. Product/QA must identify the configuration source and fallback rule. The UI remains email-only; this decision must be server-side and must not be replaced with a hardcoded role ID.
