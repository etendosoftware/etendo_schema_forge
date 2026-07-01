# ETP-4228 Identity Hardening Plan

## Status

Draft plan for the onboarding identity hardening work.

Primary ticket: https://etendoproject.atlassian.net/browse/ETP-4228

Related evidence:

- Confluence "Onboarding | Test Plan": https://etendoproject.atlassian.net/wiki/spaces/PYPI/pages/5028478986
- Frontend registration surface: `tools/app-shell/src/pages/OnboardingPage.jsx`
- Onboarding API helpers: `tools/app-shell/src/pages/onboarding/onboardingApi.js`
- Google SSO frontend adapter: `tools/app-shell/src/pages/onboarding/onboardingSso.js`
- Backend account endpoints: `etendo_core/modules/com.etendoerp.go/src/com/etendoerp/go/rest/EtendoGoJwtServlet.java`
- Backend Google token verifier: `etendo_core/modules/com.etendoerp.go/src/com/etendoerp/go/rest/EtendoGoGoogleIdentityVerifier.java`
- Backend auth email sender: `etendo_core/modules/com.etendoerp.go/src/com/etendoerp/go/rest/TransactionalAuthEmailSender.java`
- Account table model: `etendo_core/modules/com.etendoerp.go/src-db/database/model/tables/ETGO_ACCOUNT.xml`
- Auth and SSO architecture docs: `docs/architecture/07-auth-and-security.md`
- Transactional email contracts: `docs/email-contracts.md`

## Diagnosis

ETP-4228 is a valid security issue. The current local account registration flow accepts trivially weak passwords, including values such as `123`, and the backend returns a platform token after account creation.

The problem should not be treated as a frontend-only validation gap. It is an identity policy gap across three related surfaces:

1. Local registration password strength.
2. Pending account email verification.
3. Google SSO ownership and account-linking behavior.

Current repository evidence shows that the frontend registration password field only requires a value (`required` attribute) and does not enforce password strength before submit. The existing API helper posts the registration form directly to `/sws/go/register`. On the backend, `EtendoGoJwtServlet.handleRegister` validates only that `email`, `password`, and `name` are non-empty, creates the account, returns a platform session token immediately (HTTP 201 with `token` in the body), and sends the `new-account` email best-effort. The same non-empty-only validation applies to `/sws/go/password-reset/confirm` (`token`, `password`) and `/sws/go/change-password` (`currentPassword`, `newPassword`).

The current email contract documentation also states that `new-account` is a post-registration notification, not an email verification flow. Local login and onboarding are not gated by email verification today, and `ETGO_ACCOUNT` has no verification-state columns (it does have the `RESET_TOKEN_HASH` / `RESET_TOKEN_EXPIRES` / `RESET_TOKEN_CONSUMED` pattern that the verification token storage should mirror).

Google SSO is already well bounded on both sides. The browser sends only the Google `credential` to `/sws/go/sso/google`, not browser-provided identity authority fields such as `email`, `name`, or `subject`. The backend (`EtendoGoGoogleIdentityVerifier` + `EtendoGoJwtServlet.handleSsoLogin`) already validates the Google ID token server-side via the official `GoogleIdTokenVerifier` (signature, audience, expiry, issuer), extracts `sub`, `email`, and `email_verified`, persists the provider identity in `ETGO_ACCOUNT` (`AUTH_PROVIDER`, `EXTERNAL_SUBJECT`, unique constraint `ETGO_ACCOUNT_SSO_UQ`), and implements partial collision handling: linking to an existing local account by email is rejected with HTTP 409 when `email_verified` is false, and linking is rejected with HTTP 409 when the account is already bound to a different SSO subject. The remaining SSO gaps are narrower than full reimplementation (see DEV 5).

## Security Principles

- Backend enforcement is mandatory. Frontend validation is only UX.
- Local email ownership must be verified before a local account can create or enter an environment.
- Google SSO can count as email ownership only when the backend validates the Google token and `email_verified` claim.
- Browser clients must not send arbitrary email provider payloads.
- Browser clients must not send account authority fields for SSO linking.
- Account linking must never rely on browser-provided email alone.
- A local unverified account must not be silently linked to a Google account by matching email.
- Existing users with weak passwords must not be locked out retroactively; enforcement should apply on registration, password reset, and password change.

## Scope

### In Scope

- Enforce password strength on `/sws/go/register`.
- Enforce the same password policy on `/sws/go/password-reset/confirm`.
- Enforce the same password policy on `/sws/go/change-password`.
- Add frontend password feedback for the registration form.
- Add translated frontend messages for English and Spanish.
- Add or define an explicit `account-verification` email contract.
- Gate local account onboarding until email ownership is verified.
- Define Google SSO account creation and linking rules.
- Add tests for weak passwords, verification gating, and Google SSO collision cases.
- Update architecture, onboarding flow, and email contract documentation.

### Out Of Scope

- Replacing the existing authentication storage model.
- Migrating localStorage tokens to httpOnly cookies.
- Adding additional SSO providers beyond Google.
- Retrofitting historical weak-password users with forced lockout.
- Exposing any generic email send endpoint to the browser.

## Target Behavior

### Local Registration

When a user registers with local credentials:

1. Backend validates name, email, and password.
2. Backend rejects weak passwords with HTTP 400 and a stable error code such as `WEAK_PASSWORD`.
3. Backend creates the account only after the password passes validation.
4. Backend marks the account as pending email verification.
5. Backend triggers the `account-verification` email contract after the account transaction commits.
6. The frontend shows a "check your email" state instead of granting a full onboarding session.
7. The user can continue only after consuming a valid verification token.

### Email Verification

The account verification flow should use a dedicated contract, not `new-account`.

Expected contract: `account-verification`.

Required properties:

- Server-side recipient resolution from the account record.
- One-time token.
- Token expiry.
- Idempotency for duplicate verification sends.
- Per-account, per-recipient, and per-IP throttling where source IP is available.
- Audit for sent, duplicate, throttled, expired, already-used, suppressed, kill-switched, and provider-failed outcomes.
- Kill switch behavior.
- Neutral resend behavior where possible to avoid account enumeration.

Required edge cases:

- Unknown email on resend returns a neutral response and sends nothing.
- Already verified account returns a neutral success response and does not create a new active token unless the product explicitly chooses to resend an informational email.
- Expired or already-used token is rejected and does not activate the account.
- Provider failure is audited and does not leave partially committed account state.
- Duplicate registration or resend attempts are idempotent or throttled.

### Google SSO

When a user signs in with Google:

1. Frontend sends only the Google ID credential to `/sws/go/sso/google`.
2. Backend validates token signature, issuer, audience, expiry, subject, email, and `email_verified`.
3. Backend rejects tokens without `email_verified=true`.
4. Backend uses Google `sub` as the stable provider identity.
5. Backend can create a new SSO-backed account when no matching account exists.
6. Backend can link to an existing verified local account only through an explicit safe policy.
7. Backend must not silently link to an existing unverified local account by email.

Required collision behavior (with verified current behavior per `EtendoGoJwtServlet.handleSsoLogin`):

| Existing Account State | Google SSO Same Email | Current Behavior | Expected Behavior |
| --- | --- | --- | --- |
| No account | Verified Google token | Creates SSO-backed account | Create SSO-backed account (already implemented) |
| No account | Unverified Google token | Creates SSO-backed account anyway | Reject — `email_verified=true` required (GAP) |
| Verified local account | Verified Google token | Silently links via `linkSsoIdentityIfCompatible` | Allow explicit safe linking or login according to product policy (decide whether silent link stays acceptable for verified accounts) |
| Unverified local account | Verified Google token | Silently links (no local verification state exists today) | Do not silently link; require verification, account recovery, or controlled replacement policy (GAP — depends on DEV 3/4) |
| Local account | Unverified Google token | HTTP 409 "requires explicit linking" | Same (already implemented) |
| Disabled account | Verified Google token | Lookup filters by active; creation path then hits `ETGO_ACCOUNT_EMAIL_UQ` and fails with a server error | Reject cleanly and do not create a duplicate (GAP — verify and harden) |
| Existing Google account with same `sub` | Verified Google token | Logs in existing account | Login existing account (already implemented) |
| Existing Google account with different `sub` but same email | Verified Google token | HTTP 409 "already linked to a different SSO identity" | Same (already implemented) |

## Implementation Plan

### DEV 1: Shared Password Policy

- Define one backend password policy helper used by register, reset confirm, and change password. All three handlers live in `EtendoGoJwtServlet` (`handleRegister`, `handlePasswordResetConfirm`, `handleChangePassword`) and today validate only that fields are non-empty.
- Note the actual request field names: register/reset use `password`; change-password uses `currentPassword` and `newPassword`. The policy applies to `password` (register, reset) and `newPassword` (change).
- Recommended minimum policy:
  - At least 8 characters.
  - At least one uppercase letter.
  - At least one lowercase letter.
  - At least one number.
  - At least one special character.
- Return HTTP 400 with a stable machine-readable error code, for example:

```json
{
  "error": {
    "code": "WEAK_PASSWORD",
    "message": "Password does not meet minimum strength requirements.",
    "userMessage": "Password must include at least 8 characters, uppercase and lowercase letters, a number, and a special character."
  }
}
```

- Add backend unit tests for each rejected rule and at least one accepted password.
- Add backend endpoint tests for `/sws/go/register`, `/sws/go/password-reset/confirm`, and `/sws/go/change-password`.

### DEV 2: Frontend Registration Feedback

- Add a frontend password policy helper that mirrors backend requirements for UX only.
- Show a translated checklist or compact validation feedback while the user types.
- Disable `Create account` only when the password is weak or registration is loading.
- Preserve backend error rendering for direct API rejection.
- Add locale keys in `packages/app-shell-core/src/locales/en_US.json` and `packages/app-shell-core/src/locales/es_ES.json`.
- Add unit tests in `tools/app-shell/src/pages/__tests__/OnboardingPage.vitest.jsx`.

### DEV 3: Account Verification Contract

- Add the `account-verification` contract in the Etendo Go runtime, wired through the existing auth email path (`TransactionalAuthEmailSender`, same channel as `new-account`, `reset-password`, `password-changed`, `environment-ready`).
- Generate verification tokens server-side.
- Store token hash, expiry, consumed timestamp, and verification status as new `ETGO_ACCOUNT` columns, mirroring the existing `RESET_TOKEN_HASH` / `RESET_TOKEN_EXPIRES` / `RESET_TOKEN_CONSUMED` pattern. This is a `src-db` model change: new AD records must use `make uuid` and the change must be exported with `./gradlew export.database`.
- Send the verification email after local account creation commits.
- Add a resend endpoint with neutral response semantics.
- Add a confirm endpoint that consumes the token once and activates the local account.
- Keep provider configuration server-side only.
- Do not expose `to`, `template`, `data`, `subject`, `body`, sender, Reply-To, or provider metadata in browser requests.

### DEV 4: Verification-Gated Onboarding

- Change local registration success behavior so unverified users do not receive a full onboarding session.
- Add frontend state for "verify your email" and "resend verification email".
- Gate `/sws/go/environments`, `/sws/go/onboarding`, and environment login from unverified local accounts.
- Keep password reset neutral and independent from account enumeration.
- Define whether a verified Google SSO login can satisfy the same account ownership requirement.

### DEV 5: Google SSO Linking Policy

Most of the SSO foundation already exists — this task closes specific gaps, it is not a reimplementation.

Already implemented (verify, do not rebuild):

- Server-side Google ID token validation via `GoogleIdTokenVerifier` in `EtendoGoGoogleIdentityVerifier` (signature, audience, expiry, issuer).
- Provider identity stored by provider and subject (`AUTH_PROVIDER`, `EXTERNAL_SUBJECT`, unique `ETGO_ACCOUNT_SSO_UQ`).
- Linking by email rejected with HTTP 409 when `email_verified=false` or when the account is bound to a different SSO subject.
- Frontend sends only the `credential` payload (`onboardingSso.js`).

Gaps to close:

- Require `email_verified=true` for ALL SSO outcomes, not only linking: today `handleSsoLogin` creates a new SSO account (and logs in an existing same-`sub` account) even when `email_verified=false`.
- Revisit silent auto-linking: today a verified Google email silently links to any existing active local account via `linkSsoIdentityIfCompatible`. Once local email verification exists (DEV 3/4), linking to an UNVERIFIED local account must stop being silent.
- Harden the disabled-account path: account lookups filter by active, so a disabled account's email currently falls through to the create path and fails on the `ETGO_ACCOUNT_EMAIL_UQ` constraint (server error) instead of a clean rejection.
- Add audit records for SSO create, login, link, rejected collision, disabled account, and invalid token outcomes (none exist today).

### REVIEW

- Review password policy consistency across register, reset, and change password.
- Review that the backend remains the security boundary.
- Review the email verification contract against `docs/transactional-email-framework.md` and `docs/email-contracts.md`.
- Review SSO account-linking rules with product/security before enabling automatic linking.
- Confirm no provider secrets, endpoints, sender credentials, or token values are committed.
- Confirm browser requests do not contain provider payload fields.

### QA

Required automated coverage:

- Weak password rejected on registration with HTTP 400.
- Weak password rejected on reset confirmation.
- Weak password rejected on authenticated password change.
- Strong password accepted.
- Frontend shows password feedback and disables submit for weak passwords.
- Registration with a strong password creates a pending verification state.
- Unverified local account cannot create an environment.
- Verification token activates the account once.
- Expired token is rejected.
- Resend is throttled or idempotent.
- Google SSO sends only `credential` from the frontend.
- Google SSO backend rejects unverified Google emails.
- Google SSO same-email collision with an unverified local account does not silently link.
- Existing weak-password users can still log in, but must use a strong password on reset or change.

Manual QA scenarios:

- Register locally, receive verification email, verify, then complete onboarding.
- Register locally and do not verify; confirm onboarding is blocked.
- Resend verification email multiple times; confirm no duplicate flood.
- Sign in with Google as a new user; confirm account creation and environment routing.
- Attempt Google SSO against an existing unverified local email; confirm safe collision behavior.

### DOCS

- Update `docs/email-contracts.md` with `account-verification`.
- Update `docs/transactional-email-framework.md` with verification lifecycle and edge cases.
- Update `docs/architecture/07-auth-and-security.md` with local verification and SSO linking rules.
- Update `docs/generated-custom-windows/app-shell-functional-flows.md` with the new onboarding behavior.
- Update the Confluence onboarding test plan after implementation evidence exists.

## Acceptance Criteria

- Backend rejects weak passwords on registration, reset, and change-password endpoints.
- Frontend gives immediate translated feedback for weak registration passwords.
- Local account registration no longer grants full onboarding access before email verification.
- Account verification email uses a dedicated server-side contract.
- Google SSO validates Google identity server-side and requires verified Google email.
- Same-email SSO collisions are handled explicitly and safely.
- Tests cover weak-password rejection, verification gating, and SSO collision behavior.
- Documentation reflects the final behavior in the same PR.

## Open Questions

- Should a newly verified local account receive a platform token immediately, or should the user log in again?
- Should Google SSO automatically satisfy email verification for a pending local account with the same email, or should that require explicit account recovery/linking? Note: silent auto-link of a verified Google email to an existing local account is CURRENT production behavior — changing it is a behavior change, not just a new rule.
- What is the verification token lifetime?
- Should resend verification be available before login, after login, or both?
- What migration behavior is required for existing accounts with no verification state?
- Should the initial `new-account` email remain as a welcome notification after verification, or be replaced by `account-verification` plus `environment-ready`?

## Rollout

1. Deploy password backend enforcement first if it can be isolated safely.
2. Deploy frontend password feedback after backend enforcement is available.
3. Deploy verification tables, contract, and endpoints behind a feature flag or tenant-level switch.
4. Enable verification gating for new local registrations.
5. Enable Google SSO collision policy after test coverage is in place.
6. Monitor registration failures, verification email sends, throttles, SSO rejections, and support tickets.

## Rollback

- Password frontend feedback can be reverted independently, but backend enforcement should not be rolled back unless an incident blocks legitimate registration.
- Verification gating should be behind a switch so operations can temporarily disable gating if email delivery fails.
- Provider failure should not roll back account creation, but unverified accounts must remain blocked from onboarding until verification succeeds or an admin recovery path is used.
- Google SSO linking changes should prefer disabling automatic linking over reverting token validation.
