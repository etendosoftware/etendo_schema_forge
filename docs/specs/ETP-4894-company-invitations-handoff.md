# Handoff: ETP-4894 Company User Invitations

## Objective

Replace the current ETP-4894 password-reset-style implementation with a real company invitation flow. Read the PRD first:

`docs/superpowers/specs/2026-08-14-etp-4894-company-user-invitations-prd.md`

## Required user journeys

1. An administrator enters only an email and receives a visible `Pending` invitation confirmation.
2. An existing Etendo Go user opens the emailed link, signs in through the normal account-login flow, returns to the invitation, and accepts the target-company invitation.
3. A recipient without an Etendo Go account opens the same link, creates the minimum platform account, and immediately accepts the target-company invitation.

Neither recipient journey may use company `/onboarding`, `OnboardingFlow`, `/password-reset/*`, or password-reset token fields. Existing-account login is required; the invitation token alone is not authority to accept.

## Current branch: work that must be superseded

The branch contains an incorrect first attempt. Do not extend it as the primary flow:

- `tools/app-shell/src/windows/custom/user/index.jsx` only renames generic User CRUD to invitation.
- `e2e/tests/flows/user-invitation.mocked.spec.js` tests reset-password UI, not company invitation acceptance.
- `PasswordResetInvitationService` persists invitation data but drives the password-reset token and email contract.
- `EtendoGoAccountProvisioning` creates pending accounts during generic User CRUD creation.
- `EtendoGoJwtDalHelper.markInvitationAccepted` marks invitations accepted from password-reset consumption.
- `docs/generated-custom-windows/user.md` and `docs/transactional-email-contracts.md` document the wrong reset-based semantics.

Replace or remove these ETP-4894-specific semantics deliberately. Preserve normal password-reset behavior for actual password resets.

## Recommended implementation order

1. Confirm the three repository branches are `feature/ETP-4894`, stacked on `feature/ETP-4905`, and inspect uncommitted changes before editing.
2. Resolve the mandatory tenant invitation-role policy with product/QA. Do not hardcode a role UUID or grant the inviter's role.
3. In `com.etendoerp.go`, design a dedicated `CompanyInvitationService` and endpoints:
   - authenticated `POST /sws/go/company-invitations` with `{email}`;
   - public resolve endpoint for a valid token;
   - authenticated accept-existing-account endpoint that verifies the logged-in account email;
   - public register-and-accept endpoint.
4. Update `ETGO_INVITATION` so pending invitations can exist before `ETGO_ACCOUNT` and `AD_USER` references exist. Enforce one open invitation per target company/email.
5. Implement tenant-derived membership creation at acceptance, including configured default role/access, idempotency, expiry, and audit.
6. Add a distinct `company-invitation` transactional email contract; raw tokens must be generated once, hashed for storage, and never logged.
7. In Schema Forge, build an email-only invitation modal and a public `/invite` acceptance page outside `OnboardingFlow`.
8. Assess `schema_forge_core`: add only reusable API/UI primitives that genuinely belong there; keep the company flow out of shared onboarding components.
9. Replace the current mocked Playwright spec with behavioral tests for pending creation, existing-account acceptance, and new-account registration-and-acceptance. Add sanitized screenshots through `delivery-evidence-captures`.
10. Update functional and transactional-email documentation. Run focused tests, then the repository-required tests.

## Minimum API contract

### Create

```http
POST /sws/go/company-invitations
Authorization: Bearer <inviter token>
Content-Type: application/json

{ "email": "recipient@example.com" }
```

The server derives company and inviter from authorization. Expected result includes only safe invitation metadata such as `id`, masked/normalized email, `status`, and `expiresAt`.

### Resolve

```http
GET /sws/go/company-invitations/resolve?token=<bearer-token>
```

Return token-bound display information and branch: `existing_account` or `registration_required`. Never expose account details to arbitrary callers.

### Accept existing account

```http
POST /sws/go/company-invitations/accept
Authorization: Bearer <authenticated Etendo Go account session>

{ "token": "<invitation-token>" }
```

### Register and accept

```http
POST /sws/go/company-invitations/register-and-accept

{ "token": "<bearer-token>", "name": "Recipient name", "password": "<strong password>" }
```

The registered account email always comes from the invitation; client input cannot override it. For an existing account, the backend must reject a missing session or an authenticated-email mismatch.

## Definition of done

- PRD acceptance criteria are met.
- The User UI collects only email and shows pending state.
- Existing-account branch requires login, preserves invitation return context, verifies the authenticated email, and never navigates to company onboarding.
- Actual reset-password flow is unchanged and no invitation action mutates reset-token fields.
- Dedicated backend unit/integration tests pass.
- Dedicated Playwright tests pass and produce three sanitized screenshots: pending, existing accepted, and new-account accepted.
- Delivery evidence index records exact commands and results.
- QA validation is recorded as `Pending validation by QA: Matías Bernal / Emilio Polliotti` unless QA has completed it.
