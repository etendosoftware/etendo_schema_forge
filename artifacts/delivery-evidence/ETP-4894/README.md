# ETP-4894 delivery evidence

## Functional flow

ETP-4894 is a company-membership invitation flow, not a password-reset flow.

1. A company administrator opens **Invite user**, enters only an email address, and submits it. The server creates a pending invitation and sends the company-invitation email.
2. A recipient with an existing Etendo Go account opens the email link, signs in through the normal Etendo Go login flow, returns to the invitation, and then accepts it. The server verifies that the authenticated email matches the invitation before creating the target-company membership and marking it accepted.
3. A recipient without an Etendo Go account opens the same link, creates the minimum platform account using the email locked to the invitation, and then accepts the company invitation. This route never enters company onboarding.

## Visual evidence

- Environment: local App Shell mock (`VITE_MOCK=true`, `http://127.0.0.1:3100`)
- Playwright command: `E2E_WORKERS=1 npx playwright test tests/flows/user-invitation.mocked.spec.js --project=mocked --workers=1 --reporter=list`
- UI unit-test command: `npx vitest run src/windows/custom/user/__tests__/index.vitest.jsx src/windows/custom/user/__tests__/InviteUserDialog.vitest.jsx src/pages/__tests__/InviteAcceptancePage.vitest.jsx`
- UI unit-test result: passed — 10 tests in 3 files.
- Playwright result: passed — 7 tests in 22.7s.
- Playwright scope: the browser flows use intercepted API responses. They prove routing, request shape, the existing-account login gate, the canonical `etendo-go-core` login surface, locked email behavior, and screenshot checkpoints; they do not prove database persistence, authorization, email delivery, or tenant role assignment.

### 1. Pending invitation

[`ETP-4894-user-invitation-pending.png`](./ETP-4894-user-invitation-pending.png) shows the administrator flow after entering only the recipient email. The dialog displays `Pending`, proving that invitation creation is distinct from generic User CRUD and does not collect a password, name, company setup, or onboarding data.

### 2. Existing Etendo Go account

[`ETP-4894-invitation-existing-login.png`](./ETP-4894-invitation-existing-login.png) shows the invitation link resolving to the existing-account branch and rendering the canonical Etendo Go `LoginStep`: the real Etendo Go brand, layout, SSO option, language selector, password recovery, shared fields, and shared translations. The invited email is read-only and the recipient must authenticate before acceptance.

[`ETP-4894-invitation-authenticated.png`](./ETP-4894-invitation-authenticated.png) shows the invitation after normal Etendo Go login. The page is still `/invite`, with the authenticated state established and the explicit **Accept invitation** action available; it does not enter company onboarding.

[`ETP-4894-invitation-existing-account.png`](./ETP-4894-invitation-existing-account.png) shows the successful membership acceptance. The backend receives both the invitation token and bearer session, verifies the authenticated account email matches the invitation, and then provisions the company membership.

### 3. New Etendo Go account registers and accepts

[`ETP-4894-invitation-new-account-registration.png`](./ETP-4894-invitation-new-account-registration.png) shows the canonical Etendo Go registration surface. The recipient enters the minimum account data, while the invitation email remains locked to the trusted invitation record.

[`ETP-4894-invitation-new-account.png`](./ETP-4894-invitation-new-account.png) shows the successful result using the same Etendo Go authentication shell. The recipient registers from `/invite` and joins the company without entering company onboarding.

### 4. Invalid or expired invitation

[`ETP-4894-invitation-expired.png`](./ETP-4894-invitation-expired.png) shows the safe error state returned for an invalid or expired invitation link. The page does not expose token details or backend internals and offers the standard sign-in action.

### 5. Remaining corrected states

[`ETP-4894-invitation-loading.png`](./ETP-4894-invitation-loading.png) shows the Etendo Go loading shell while the invitation token is being resolved.

[`ETP-4894-invitation-already-accepted.png`](./ETP-4894-invitation-already-accepted.png) shows the idempotent confirmation when the invitation was already accepted.

[`ETP-4894-invitation-accept-error.png`](./ETP-4894-invitation-accept-error.png) shows an acceptance failure after authentication while preserving the Etendo Go shell and displaying the actionable error state.

## Delivery limitations and QA

- Backend validation remains required for invitation authorization, explicit tenant invitation-role policy, transaction/compensation behavior, lifecycle persistence, and transactional-email contract behavior. The authenticated existing-account gate is now implemented and covered by the service, UI, and Playwright tests.
- A real email-provider and deployed-backend browser acceptance test have not been evidenced here.
- Pending validation by QA: Matías Bernal / Emilio Polliotti.
