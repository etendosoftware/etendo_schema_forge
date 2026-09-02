# Authentication methods on an Etendo Go account

Status: **proposal, not started** · Created 2026-09-02 · Supersedes the narrower AUTH-05-only draft
Jira: **ETP-5115** (Historia, Crítico, epic ETP-3504 Etendo Next) ·
https://etendoproject.atlassian.net/browse/ETP-5115
Findings covered: **AUTH-05** (P0 — password reset never arrives), **AUTH-09** (P1 — SSO signup does
not recognise an existing account). AUTH-05 is Phase 2 of this plan, not the whole of it.

## 0. Goal

Treat an account as **a set of authentication methods**, not as one method with an exception:

- an account created with a password can later link Google;
- an account created with Google can later set a password;
- account settings shows which methods are enabled and lets the user remove any of them, **provided
  at least one always remains**;
- adding a new provider later (Apple, GitHub, another OIDC) is configuration plus one verifier
  class — never a schema change and never a new column.

## 1. Where we are today

Verified in code on 2026-09-02.

| Capability | State | Evidence |
|---|---|---|
| Local password | 1 optional, inline | `ETGO_ACCOUNT.PASSWORD_HASH` |
| SSO identity | **at most one, inline** | `ETGO_ACCOUNT.AUTH_PROVIDER / EXTERNAL_SUBJECT / EXTERNAL_EMAIL / LAST_SSO_LOGIN`, unique `ETGO_ACCOUNT_SSO_UQ` |
| Provider verification | already multi-provider | `EtendoGoSsoProviderRegistry` holds a `Map<String, EtendoGoSsoAssertionVerifier>`; only `google` is registered (`:37,42`) |
| SSO → password | **blocked** | `handlePasswordResetRequest` gates on `hasLocalPassword` (`EtendoGoJwtServlet.java:894`); `handleChangePassword` dead-ends with `NO_LOCAL_PASSWORD` (`:1120`) |
| Password → link SSO | **implicit only** | happens as a side effect of SSO *login* when the email matches and the assertion is authoritative (`EtendoGoJwtServlet.java:796-810`, `linkSsoIdentityIfCompatible` `EtendoGoJwtDalHelper.java:312-324`). No explicit, authenticated "link" action exists. |
| Remove a method | **does not exist** | no caller anywhere clears `AUTH_PROVIDER`, and no path sets `PASSWORD_HASH` back to null |
| See enabled methods | **not exposed** | `GET /me` returns id, email, name, created, `emailVerified`, `emailVerificationPending` (`:1185-1196`) — nothing about credentials |

### The AUTH-05 bug, in one paragraph

`createSsoAccount` sets `passwordHash = null` (`EtendoGoJwtDalHelper.java:280`) and `hasLocalPassword`
is simply "is `passwordHash` non-blank" (`:304-306`). So for an SSO-born account the `if` at
`EtendoGoJwtServlet.java:894` never enters: no token is stored, no email is sent, and the user is
still shown the neutral "if an account exists we sent a link" response (`:896`). Confirmed
out-of-band on 2026-09-02 — the reporter's account on `go.experimental.etendo.cloud` is Google-born.
Ruled out as causes: app base URL unset (experimental sets the legacy `ETGO_APP_URL`,
`etendo-go-infraestructure/07-ecs-experimental.yaml:127`, which `resolveConfiguredAppBaseUrl` accepts
at `PublicUrlResolver.java:37,95-101`) and the INF-04 `127.0.0.1` mail sink (that is Stack B / Core
SMTP; this email is Stack A).

## 2. The real ceiling is the data model

Everything above except the last row is a flow problem, fixable in the servlet. **Multiple SSO
providers is not.** The identity lives in four columns on the account row with a unique constraint
over them, which structurally means *one* identity. `linkSsoIdentityIfCompatible` already encodes
that limit — it refuses when a different provider/subject is present (`:322-323`).

So the target model is a child table:

```
etgo_account_identity
  etgo_account_identity_id   (PK)
  etgo_account_id            (FK → etgo_account, indexed)
  provider                   'google' | 'apple' | 'github' | …
  external_subject           the IdP's stable subject claim
  external_email             the address the IdP asserted (may differ from account.email)
  linked                     timestamp
  last_login                 timestamp
  UNIQUE (provider, external_subject)     -- globally: one IdP identity, one account
  UNIQUE (etgo_account_id, provider)      -- one identity per provider per account
```

An account's methods are then: *optionally* a password, plus *N* rows here.

### Recommendation: build this table in Phase 0, not later

It is tempting to ship AUTH-05 against the existing columns and add the table when Apple or GitHub
actually appears. Do not. Right now every account has zero or one identity, so the cutover is a
lazy read-time fallback and nothing more (§Phase 0). Once users have started linking a second
provider there is no longer a single legacy value to fall back *to*, and the same move needs a real
dual-write/dual-read period. More providers are already on the roadmap; that is enough to decide it
now.

The legacy columns stay in place as the fallback source and are never written again after Phase 0.

## 3. Phases

### Phase 0 — Data model · prerequisite

**There is no backfill, and no data-migration script of any kind.** The deployment model (Docker
images on ECS, blue/green) makes a `ModuleScript` data migration unusable, and none is needed:
every read of an identity is **per account**, never global. Resolving an SSO login is "find by
(provider, subject)"; painting the security section is "list the ones for this account". So a
fallback inside one helper covers 100% of cases, permanently.

1. ~~Create `etgo_account_identity`~~ — **DONE 2026-09-02.** Created through the `/etendo:alter-db`
   webhooks rather than by hand, so no AD record ID was ever typed. `ETGO_Account_Identity`,
   `AD_TABLE_ID = FC7C9995350741E1BBB1FB76EE9B3623`, entity
   `com.etendoerp.go.schemaforge.data.AccountIdentity`, `accesslevel = 4` (System only, mirroring
   `ETGO_Account`).

   Physical model and AD agree on all 14 columns: sizes mirror the source exactly
   (`auth_provider` 60, `external_subject` 255, `external_email` 255), `ismandatory` matches the
   physical NOT NULL, `isparent = Y` on the parent FK, no `fieldlength` left at 0, every column
   linked to an element. Constraints:

   ```
   [f] etgo_acct_ident_account_fk   → etgo_account(etgo_account_id)
   [u] etgo_acct_ident_sso_uq       → (auth_provider, external_subject)
   [u] etgo_acct_ident_accprov_uq   → (etgo_account_id, auth_provider)
   ```

   **No separate index on `etgo_account_id`** — the composite unique
   `(etgo_account_id, auth_provider)` already indexes it as the leading column, so a standalone
   index would be redundant. The plan called for one; it is not needed.

   Two things this depends on, both the human's to run: `export.database` to materialise the model
   XML and the AD sourcedata, and entity generation before any Java can reference
   `AccountIdentity`. The module was left at `isindevelopment = Y` for the export
   (`ISINDEVELOPMENT` is not among the fields exported in `AD_MODULE.xml`, so it does not pollute
   the diff).
2. Introduce a single `AccountIdentityDalHelper` and route **every** existing access through it:
   `findActiveAccountBySsoIdentity`, `linkSsoIdentityIfCompatible`, `createSsoAccount`,
   `updateSsoSession`. Nothing else may touch the legacy columns after this phase.
3. **Migrate lazily, on read.** The helper resolves child rows first; when an account has none and
   `AUTH_PROVIDER` is not null, it materialises the row on the spot and returns it. Accounts migrate
   one at a time, the first time anything touches them — no script, no deploy step, no maintenance
   window.
   - Idempotent and concurrency-safe by construction: `UNIQUE (etgo_account_id, provider)` makes a
     duplicate insert impossible. Two simultaneous requests race, one gets a constraint violation —
     catch it and re-read rather than pre-checking, since a pre-check is itself racy across ECS
     tasks.
4. **Write to the child table only** from this phase on. Stop writing the legacy columns.
5. **Do not clear the legacy columns.** Clearing them would require exactly the script this phase
   avoids, and it destroys the fallback: an account with no child row *and* emptied columns has lost
   its identity, which locks the user out. Four nullable columns on a small table cost nothing.
   They retire on their own — when
   `SELECT count(*) FROM etgo_account a WHERE a.auth_provider IS NOT NULL AND NOT EXISTS (SELECT 1
   FROM etgo_account_identity i WHERE i.etgo_account_id = a.etgo_account_id)`
   reaches zero, drop them from the model and let `update.database` do the rest. No urgency, no risk.
6. Behaviour must be byte-identical after this phase. No endpoint changes, no UI changes. The
   existing SSO login/link tests passing **unmodified** is the acceptance criterion.

**Known limitation, stated so nobody trips on it later:** the child table is not authoritative until
each account has been touched at least once. Nothing in this plan needs a cross-account query, so it
does not matter today. The day someone wants "how many accounts sign in with Google", that report
would undercount — and *that* is when the one-off `INSERT … SELECT … WHERE NOT EXISTS` gets written,
against what will by then be a small remainder.

### Phase 1 — Expose the methods · P0

Extend `GET /me` with the shape the settings screen needs and nothing more:

```json
"authMethods": {
  "password": { "enabled": true, "lastChanged": "2026-08-01T…" },
  "identities": [
    { "provider": "google", "email": "v@…", "linked": "2026-06-…", "lastLogin": "2026-09-…" }
  ],
  "removable": ["password"]
}
```

`removable` is **computed on the server** from the last-method invariant (§4) and is the only thing
the UI is allowed to trust when enabling a Remove button. Never expose `external_subject` or any
token hash.

### Phase 2 — SSO account sets a password · P0, closes AUTH-05

Two independent entry points (2a, 2c) plus the traceability the finding explicitly asks for (2b).
Both entry points are needed: they serve different users.

**2a — through recovery (the anonymous path).** Drop `hasLocalPassword` from the condition at
`EtendoGoJwtServlet.java:894` and pick the email contract from the account's state:

```
password-reset/request
  ├─ no active account            → nothing sent            (unchanged)
  ├─ account WITH password        → "reset-password" email  (unchanged)
  └─ account WITHOUT password     → "set-password" email, same token machinery
  HTTP response identical in all three branches
```

The confirm side already works: `handlePasswordResetConfirm` resolves by reset-token hash with **no**
`hasLocalPassword` precondition (`:943-949`), and `changePassword` does not clear the SSO fields
(`EtendoGoJwtDalHelper.java:398-408`). The ETP-4830 invitation flow already relies on exactly this
for `pending` accounts (`:243-246`). So 2a is a gate change plus copy.

New contract `set-password`: register an `AccountLinkEmailContract` beside `reset-password`
(`CoreEmailContractProvider.java:69`), same 900 s window, recipient limit 3. Copy must say **create**,
not **reset** — "we received a request to reset your password" is nonsense to someone who never had
one — and must name the provider the account currently uses. Add `set-password.*` keys to **both**
`emails_es_ES.properties` and `emails_en_US.properties`; `EmailMessagesTest` fails on a one-sided
key. The expiry note interpolates the real TTL via `ValidityWindow.minutesUntil`, never a literal.

**2b — traceability, in the same edit.** Add a structured log at the `password-reset/request`
decision point naming the branch taken (`no-account` / `enrol` / `reset`), **without the address in
clear**. This is not a Phase 6 nicety: the relevamiento's stated expectation for AUTH-05 is
literally *"envío confirmado + trazabilidad de entrega consultable"*, and the whole bug class here
is one neutral response hiding several outcomes — today only two of them leave even a `log.warn`.
Since 2a is already editing this handler, it costs almost nothing here and is the only thing that
makes the next occurrence diagnosable. Do not defer it.

**2c — from account settings (authenticated).** Turn the `NO_LOCAL_PASSWORD` dead end at `:1120`
into an enrolment branch: no `currentPassword` to verify (the session is the proof of identity), run
`PasswordPolicy.isStrong`, then `changePassword`.

### Phase 3 — Password account links a provider · P1

Add an explicit, **authenticated** link action rather than relying on the implicit side effect at
SSO login. The user starts from settings, completes the provider flow, and the resulting assertion
is bound to the *already authenticated* account instead of being looked up by email.

This also gives AUTH-09 its answer: the "create account with SSO when one already exists" case stops
being an accident of the login path and becomes a real branch that can say "this address already has
an account — sign in and link it".

Decide explicitly what happens to the existing implicit auto-link on email match (`:796-810`).
Recommendation: **keep it, still gated on `isEmailAuthoritative()`**, because dropping it would break
users who rely on it today — but stop it being the *only* way to link.

### Phase 4 — Remove a method · P1

`DELETE`-style endpoints for the password and for one identity, both enforcing §4.

### Phase 4b — Account settings surface · P1, ships with Phase 4

The UI restructure in §6: a **Cuenta** entry replacing **Cambiar contraseña** in the user menu, an
account settings surface, and a Security section driven entirely by `authMethods`. It depends on
Phase 1 (the server must be able to answer "what does this account have") and lands together with
Phase 4 (removal), since a list with a dead Remove button is worse than no list.

### Phase 5 — A second provider · P2

If Phases 0–4 are right, adding Apple or GitHub is: one `EtendoGoSsoAssertionVerifier`
implementation, one entry in the registry map (`EtendoGoSsoProviderRegistry:39`), config for the
client id/secret, and a button. **No schema change, no new column, no change to the link/unlink
endpoints.** That is the acceptance test for whether this design actually worked.

Note the registry's default constructor hardcodes a singleton map (`:42`) — Phase 5 makes provider
registration config-driven.

### Phase 6 — Guard rails and observability · P1

- Notification email on **every** credential change: password set, password removed, identity
  linked, identity unlinked. Non-suppressible — this is the user's only signal that somebody is
  reshaping how their account can be entered. `password-changed` already exists
  (`CoreEmailContractProvider.java:86`) as the shape to copy; prefer distinct contracts over
  reusing one whose copy would be misleading.
- Config flag to forbid local-password enrolment for an SSO-mandated tenant. Default **on**
  (enrolment allowed) so nothing changes for existing self-service tenants.
  `ETGO_SSO_GOOGLE_HOSTED_DOMAIN` already identifies the corporate accounts. Register the flag in the
  flags registry on day one per the `feature-debt` policy.

## 4. The last-method invariant

**An account must always retain at least one usable authentication method.**

Enforce it **server-side, in one place, inside the same transaction as the removal** — re-reading
the method set and refusing if the removal would empty it. Never in the UI, and never by trusting a
`removable` list the client sends back: two concurrent removals from two tabs would each see one
remaining method and both succeed.

Cases the implementation has to answer, none of them obvious:

1. **Removing the method you are currently signed in with.** Allowed (a user who just added a
   password may well want to drop Google immediately), but decide whether the session survives.
   Recommendation: keep it, and notify by email.
2. **Email verification provenance.** An SSO-born account is marked verified at creation *because
   the IdP asserted it* (`EtendoGoJwtDalHelper.java:288-292`). Unlinking the last identity removes
   the thing that vouched for the address. Decide: keep `EMAIL_VERIFIED` as-is, or force
   re-verification. Recommendation: keep it — the user proved mailbox control again when they set
   the password by emailed link — but this must be a decision on the record, not an oversight.
3. **`EXTERNAL_EMAIL` diverging from `EMAIL`.** The identity may assert a different address than the
   account's. Unlinking must not silently change the account's email.
4. **A `pending` account** has `passwordHash = null` by design (`:256-268`) and therefore zero
   methods already. The invariant must be expressed over *usable* methods without breaking the
   invitation flow, which legitimately parks an account in that state.
5. **Re-authentication before removal.** Removing a credential is at least as sensitive as adding
   one. Recommendation: require the current password when removing the password, and a fresh
   assertion when removing an identity.

## 5. Security notes

- **The neutral response on `password-reset/request` stays.** Varying it by account state is the
  classic user-enumeration vector — it would confirm to an anonymous prober both that the address is
  registered and which IdP it uses. The disclosure belongs **in the email**, which only the mailbox
  owner reads. Behind an authenticated session the same disclosure is fine and already exists
  (`NO_LOCAL_PASSWORD`, `:1121`); the concern is strictly the anonymous endpoint.
- **`UNIQUE (provider, external_subject)` is a security control, not tidiness.** Without it one
  Google identity could be linked to two accounts.
- **Auto-linking by email is an account-takeover vector for any IdP that does not verify addresses.**
  Keep every implicit link gated on `isEmailAuthoritative()` (`EtendoGoSsoAssertion.java:61`), and
  re-check that gate for each new provider in Phase 5 — Apple in particular allows relay/hidden
  addresses.
- Enrolling a password by emailed link is **not** a downgrade for a Google-backed account: whoever
  controls the mailbox already controls the IdP identity. The genuine objection is policy, not
  cryptography, which is what the Phase 6 flag addresses.

## 6. UI — the account settings window

### 6.1 What the user menu looks like today

`tools/app-shell/src/components/UserAvatarButton.jsx` renders, in order: an identity header
(username, role, org), a language switcher, **Crear entorno productivo** (`navigate('/upgrade')`),
**Cambiar contraseña** (`ui('onboardingChangePasswordAction')`, opens `ChangePasswordDialog`), and
**Cerrar sesión**.

Two problems with the current state, both of which this plan removes:

1. **The password item is gated by a client-side guess.** `canChangePassword` reads
   `sf_platform_auth_method !== 'sso'` out of `localStorage` (`UserAvatarButton.jsx:41-45`). So an
   SSO user does not see the option *at all* — no entry, no explanation, nothing to click. That
   guess exists only because the server never told the client what the account can do. Phase 1's
   `GET /me → authMethods` replaces it with a real answer, and the localStorage keys stop being
   consulted for capability decisions.
2. **A credential action sits loose in a dropdown**, next to a language picker and a logout button,
   with no room to grow. Linking a provider, unlinking one, and listing what is enabled do not fit
   there.

### 6.2 Target

Replace the **Cambiar contraseña** item with a single **Cuenta** entry, immediately above **Cerrar
sesión**, that opens an account settings surface with a **Seguridad** section. The change-password
form moves inside it and stops being a top-level menu action.

```
User menu                        Account settings
─────────────                    ─────────────────────────────
 Valentín                         Perfil      name, email, verified badge
 Rol · Organización               Seguridad ◀ ── methods live here
 ─────────────                                 · Contraseña      [Cambiar] [Quitar]
 🇺🇸 🇪🇸  Idioma                                · Google (v@…)    [Quitar]
 ─────────────                                 · + Vincular Apple / GitHub
 🚀 Crear entorno productivo                    (Quitar disabled + reason when it is the last one)
 👤 Cuenta               ◀── new
 ⎋  Cerrar sesión
```

The Seguridad section renders straight off `authMethods` from `GET /me`: one row per method, a
Remove button enabled **only** when the server put that method in `removable`, and an Add row per
provider the instance has configured but the account has not linked. Nothing about which methods
exist is hardcoded in the component — that is what makes Phase 5 a config change rather than a UI
change.

### 6.3 Route, not dialog — recommendation

`runtime-routes.jsx` already exposes a flat registry (`{ path, public, element }`), so
`{ path: 'account', public: false, element: <AccountSettingsPage /> }` is a one-line addition next
to the existing `upgrade` entry. Prefer that over a modal:

- sections will keep arriving (Profile, Security, Notifications, and the language switcher is a
  natural later move out of the dropdown);
- it is deep-linkable — a security email can point at `/account#seguridad`;
- `ChangePasswordDialog` is itself a dialog, and nesting a dialog inside a dialog is awkward; as a
  page the password form is just a panel.

It can still *read* as a settings window. This is decision #7 in §8 — if you prefer a real modal,
the section layout is unchanged, only the container differs.

### 6.4 Component work

- `ChangePasswordDialog.jsx` becomes a panel rendered inside the Security section rather than a
  standalone dialog opened from the menu. Its current `onSuccess` forces a logout
  (`UserAvatarButton.jsx:49-53`); revisit whether that is still wanted when the action is one of
  several credential operations in a settings screen — an unavoidable logout after every change
  makes managing three methods tedious.
- `UserAvatarButton.jsx` loses `changePasswordOpen`, `canChangePassword`, `handlePasswordChanged`
  and the `ChangePasswordDialog` import; it gains one `navigate('/account')` item.
- New: `AccountSettingsPage.jsx` plus a `SecuritySection.jsx`.
- Reuse the existing `account` locale key — it is **already present and translated** in both
  bundles (`es_ES: "Cuenta"`, `en_US: "Account"`), currently used only as an `aria-label` fallback.
  Every new string goes into **both** `en_US.json` and `es_ES.json`; hardcoded English is a bug and
  Spanish is the primary client locale.
- All calls go through `useApiFetch` — never a bare `fetch`; two guardrail tests fail the build
  otherwise.
- Keep `data-testid` on the new menu item and on each method row (see `docs/e2e-testing-guide.md`).

### 6.5 Three repos, and which screen lives where

Confirmed by inspecting the installed package on 2026-09-02.

| Repo | Owns |
|---|---|
| `com.etendoerp.go` | `etgo_account_identity`, the endpoints, `hasLocalPassword`, the email contracts |
| `etendo_schema_forge` (this one) | the user menu (`UserAvatarButton.jsx`) and the new account settings surface |
| `etendo-go-core` (`@etendosoftware/etendo-go-core`) | the **logged-out** screens |

What is actually in `etendo-go-core`:

```
src/onboarding/steps/       LoginStep.jsx  (24.7K — login + forgot password + reset-confirm)
                            RegisterStep.jsx, VerifyEmailStep.jsx
src/onboarding/components/  AuthSsoOptions.jsx   ← the provider buttons
src/onboarding/             sso.js, passwordPolicy.js, api.js
```

So the account settings window and the user menu are **not** there — they are in this repo. Core owns
what the user sees before signing in.

Two consequences:

- **Phase 2a** needs a core PR if the reset-confirm copy is to say "create" rather than "reset" for
  an enrolling account. `LoginStep.jsx` also hardcodes the link TTL as a locale literal
  (`onboardingResetLinkDuration`) — known ETP-5003 debt, same file, worth fixing in the same pass.
- **Phase 5 touches core too.** A new provider is not just a verifier plus a registry entry: the
  button lives in `AuthSsoOptions.jsx`. Budget a core PR for every provider added, and check
  `sso.js` for anything provider-specific while you are there.

### 6.6 Drive-by: the logout item is unreadable on hover

`UserAvatarButton.jsx:169` sets `text-destructive focus:bg-destructive dark:focus:bg-destructive/20`.
Dark mode drops the background to 20% opacity and reads fine; **light mode paints a solid
`bg-destructive` behind `text-destructive`** — red text on a red block, so the label disappears on
hover. Reproduced from a user screenshot on 2026-09-02.

Fix with either `focus:bg-destructive/10` (keep the red text) or `focus:text-destructive-foreground`
(white on red). Fold it into the Phase 4b menu edit — it is the same file and the same few lines.

## 7. Testing

Delegate authoring to the `test-generator` subagent per CLAUDE.md.

- Phase 0 is a pure refactor: the existing SSO login/link tests must pass unmodified. That is the
  phase's acceptance criterion.
- The lazy migration: an account carrying only legacy columns resolves correctly and gains its child
  row as a side effect; a second read returns the same identity without creating another; and two
  concurrent first-reads end with exactly one row (the constraint violation is caught, not
  surfaced).
- `password-reset/request` returns a **byte-identical** neutral body for all three branches,
  including no-account. This is the anti-enumeration guard and it must be an explicit assertion.
- After enrolment, both `POST /sws/go/login` with the new password and SSO login resolve to the same
  `etgo_account` row.
- The last-method invariant: removing the only method is refused; **and** two concurrent removals do
  not both succeed.
- `UNIQUE (provider, external_subject)`: linking one identity to a second account is refused.
- UI: the Security section renders one row per method from a mocked `authMethods`, and a Remove
  button is disabled exactly when the server omitted that method from `removable` — never recomputed
  client-side. `UserAvatarButton` no longer reads `sf_platform_auth_method` for capability.
- `EmailMessagesTest` covers es/en key parity; `InitialEmailContractsTest` needs updating for the new
  registrations — update the assertions, do not delete them.

## 8. Decisions needed before starting

1. **Phase 0 now, or ship AUTH-05 against the existing columns?** Recommendation: now (§2).
2. **Does Phase 2a include the core PR?** The work spans three repos (§6.5); this decides whether
   the `etendo-go-core` reset-confirm copy ships in v1 or the enrolling user reads reset-flavoured
   wording for now.
3. **Keep the implicit auto-link on email match?** Recommendation: keep, still gated on
   `isEmailAuthoritative()`.
4. **Re-authentication** before adding and before removing a method: required, or is the session
   enough?
5. **Email verification after unlinking the last identity** (§4.2): keep verified, or re-verify?
7. **Account settings as a route or a modal?** Recommendation: route `/account` (§6.3).
8. **Does a password change still force a logout** once it lives in a settings screen (§6.4)?
9. **Jira**: AUTH-05 has no ticket. Branch and ticket creation go through Clerk.

## 9. Out of scope

- MFA/2FA, passkeys, magic links. The model in §2 accommodates them later; this plan does not add
  them.
- Admin-side credential management (an operator resetting another user's methods).
- The unverified question of whether a provider/throttle failure is *also* occurring on experimental.
  It would be masked by the same neutral response and is diagnosable from the logs
  (`grep 'Auth email reset-password'`) or from `etgo_email_safety` where `RECORD_TYPE = 'AUDIT'` —
  filter on the **`TENANT_ID`** column, not `AD_CLIENT_ID`. Not a blocker: the gate at `:894` fully
  explains the reported symptom on its own.
