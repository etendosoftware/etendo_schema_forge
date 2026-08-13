# ETP-4228 — Cross-domain plan

Password strength validation on the onboarding registration flow. The change is a
single cohesive feature but, by the monorepo's `domain-boundary-check` scopes, it
touches more than one domain, so this cross-domain plan documents why they ship
together, the test coverage, and the rollback.

## Domains touched

- **platform-change** — the registration UX and its client logic:
  - `tools/app-shell/src/pages/OnboardingPage.jsx` — live password-requirements
    checklist and "Create account" disabled until the policy is met.
  - `tools/app-shell/src/pages/onboarding/passwordPolicy.js` — new shared
    frontend policy helper (mirrors the backend `PasswordPolicy`).
  - `tools/app-shell/src/pages/onboarding/onboardingApi.js` — propagate the
    backend `error.code` / `userMessage` (e.g. `WEAK_PASSWORD`).
- **app-shell-core** — translated strings for the new feedback:
  - `packages/app-shell-core/src/locales/en_US.json`
  - `packages/app-shell-core/src/locales/es_ES.json`
- **repo-infra** — this plan and the related planning doc under `docs/plans/`.

These are inseparable: the policy helper, the page that consumes it, and the
es/en strings it renders are one user-visible behavior. Splitting them would ship
a half-working feature (UI without translations, or logic without UI).

## Tests

- `tools/app-shell/src/pages/onboarding/__tests__/passwordPolicy.test.js` — unit
  tests for every rule and edge case (null/empty, too short, missing class,
  whitespace-is-not-special).
- `tools/app-shell/src/pages/__tests__/OnboardingPage.vitest.jsx` — checklist is
  shown, submit stays disabled for a weak password and enables for a strong one.
- Backend counterpart (`com.etendoerp.go`): `PasswordPolicyTest` plus the
  servlet tests for `register` / `password-reset/confirm` / `change-password`,
  including a `WEAK_PASSWORD` (HTTP 400) regression test.

## Rollback

Frontend feedback can be reverted independently of the backend: revert the three
`tools/app-shell` files and the two locale files. The backend enforcement
(`com.etendoerp.go`) is the security boundary and should remain unless an
incident blocks legitimate registrations; if so, revert the backend commits
separately. No data migrations are involved, so rollback is a plain revert.
