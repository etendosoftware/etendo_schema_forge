# ETP-4204 Cross-Domain Plan: Move Change Password to the logout menu

**Feature:** Relocate "Change Password" from the onboarding create-environment
view into the user/logout menu via a new `ChangePasswordDialog`. On success the
user is logged out and, thanks to a one-shot flag, lands on the onboarding
**Sign In** panel to re-authenticate with the new password.

This PR is approved as cross-domain because a single self-contained UI feature
unavoidably touches two shared areas: the shared i18n catalog and the app-shell
frontend. The change is small and the two parts are inseparable — the dialog
cannot compile or render without its translation keys.

## Scope addition: onboarding draft recovery

The same branch also adds "resume onboarding where you left off": the create
wizard's step + form values persist server-side per account
(`ETGO_ACCOUNT.ONBOARDING_DRAFT`, see
`modules/com.etendoerp.go/docs/onboarding-flow.md`) and are restored on the
next login when the account still has zero environments.

- Backend (com.etendoerp.go): new `ONBOARDING_DRAFT` column (model XML +
  AD_ELEMENT/AD_COLUMN registration), `GET/POST /sws/go/onboarding/draft`
  handlers in `EtendoGoJwtServlet`, draft accessors in `EtendoGoJwtDalHelper`,
  auto-clear after a committed onboarding.
- Frontend (`platform-change`): `onboardingApi.js` gains
  `fetchOnboardingDraft`/`saveOnboardingDraft`; `OnboardingPage.jsx` restores
  the draft before showing the create view, autosaves it debounced, and shows a
  `draft-restored-notice` banner.
- `app-shell-core`: adds the `onboardingDraftRestoredNotice` i18n key (en/es).

## Domains

- `app-shell-core`: shared i18n catalog — adds the `changePasswordLogoutNotice`,
  `onboardingPasswordChangedNotice` and `onboardingDraftRestoredNotice` keys
  (en/es parity) in
  `packages/app-shell-core/src/locales/en_US.json` and
  `packages/app-shell-core/src/locales/es_ES.json`. There is no per-window/per-
  component locale file; all app strings live in the shared catalog by design,
  so any UI string addition touches this domain.
  Also `src/auth/session.js` — `authStorage.clear()` additionally removes the
  new `sf_platform_auth_method` key (one line, next to the existing
  `sf_platform_token` removal) so logout fully clears platform session state.
- `platform-change`: app-shell frontend under `tools/app-shell` —
  - `components/ChangePasswordDialog.jsx` (new) — modal reusing the existing
    `changePassword()` API; on success discards the rotated platform token and
    calls `onSuccess` (logout).
  - `components/UserAvatarButton.jsx` — adds the "Change Password" menu item
    above Logout (guarded by `sf_platform_token`, and hidden when
    `sf_platform_auth_method === 'sso'` — SSO accounts have no local password
    and the backend rejects the change) and sets a one-shot
    `sf_onboarding_initial_view='login'` flag before logout.
  - `pages/OnboardingPage.jsx` — auth success handlers persist
    `sf_platform_auth_method` ('password' | 'sso') alongside the platform
    token; logout / invalid-token / reset-confirm paths clear it.
  - `pages/OnboardingPage.jsx` — removes the old change-password entry from the
    create view and consumes the one-shot flag so the post-logout landing is the
    Sign In panel instead of the Create panel.
  - `components/__tests__/ChangePasswordDialog.vitest.jsx` (new) and
    `pages/__tests__/OnboardingPage.vitest.jsx` — coverage for the dialog and the
    flag-driven login landing.

## Why This Cannot Be Split Cleanly

The dialog (`platform-change`) references the new `changePasswordLogoutNotice`
locale key (`app-shell-core`) at render time. Splitting the i18n key into a
separate PR would leave the component rendering an untranslated key, and merging
the component without the key would ship a visible English fallback. The two
parts compile, render and test together as one inseparable unit.

## Review Order

1. `ChangePasswordDialog.jsx` — fields, validation, API call, logout-on-success.
2. `UserAvatarButton.jsx` — menu item placement, token guard, one-shot flag.
3. `OnboardingPage.jsx` — old entry removal + flag consumption (Sign In landing).
4. Locale keys — `en_US.json` / `es_ES.json` parity for `changePasswordLogoutNotice`.
5. Review this plan.

## Tests

- **Frontend (Vitest):**
  - `ChangePasswordDialog.vitest.jsx` — success → onSuccess(logout), password
    mismatch blocks submit, server error keeps the user signed in (3/3).
  - `OnboardingPage.vitest.jsx` — lands on the login view consuming the one-shot
    flag, flag is cleared after use; existing suite green (38/38 total).
- `npm run build` — production build passes (no import/resolution errors).

## Rollback

The feature is purely additive and behaviour-preserving elsewhere; no DB schema
change is involved.

- **Frontend:** revert the `feature/ETP-4204` change-password commits. The
  user/logout menu falls back to just Logout; the onboarding create view no
  longer needs the old entry (already removed); the one-shot flag is only read in
  a guarded branch and is harmless if unused.
- **i18n:** the `changePasswordLogoutNotice` key becomes unused (harmless) and is
  dropped with the revert.
