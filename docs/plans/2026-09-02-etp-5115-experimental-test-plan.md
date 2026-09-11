# ETP-5115 — what still needs experimental, and how to check it

Companion to `2026-09-02-account-authentication-methods.md`. Everything that could be verified on a
developer machine already has been; this lists only what could not, why, and what evidence closes
each item.

## Why these cannot be checked locally

Two hard limits, both properties of the local environment rather than of the code:

1. **No SSO provider is configured locally.** Nothing can produce a real Google assertion, so every
   path that starts at `POST /sws/go/sso/{provider}` is unreachable — which is most of Phase 0.
2. **The local database has no SSO-born account.** 62 accounts, all with a local password, none with
   `auth_provider`. A row can be faked with SQL (and was, for the AUTH-05 check), but a faked row
   proves the code handles the shape, not that the shape occurs.

Experimental has neither limit: SSO is configured (`ETGO_SSO_GOOGLE_CLIENT_ID` is set on the task
definition) and real Google-born accounts exist — the AUTH-05 report came from one.

## Measured on experimental, 2026-09-02

Reached over SSH (`etendo-go-experimental`, `/opt/EtendoERP/gradle.properties`) against
`etendo-experimental.cfm2qm242otk.eu-west-3.rds.amazonaws.com` — the experimental RDS, not
production. Read-only queries.

| | |
|---|---|
| Accounts | 152 |
| With an SSO identity | 20 |
| With no local password | 14 |
| Both — SSO and no password | **14** |

**The AUTH-05 root cause is confirmed against the reported row itself**: the reporter's account on
this environment carries `auth_provider = google` and `password_hash = null`. That is no longer an
inference from code or a second-hand report.

**Fourteen accounts on experimental currently have no way to recover access at all** — no password to
reset, and until this change no way to give themselves one. That is the blast radius, counted rather
than estimated, and it is the number to weigh when scheduling the deploy.

The 20 SSO accounts are also the population for **E1**: each needs a child row, and none has one
yet, so the lazy migration has 20 real subjects waiting.

## Before anything else: a pre-deploy check that can fail the deploy

**E0 — orphan rows behind the four new foreign keys. ✅ PASSED on experimental 2026-09-02** — all
four counts zero. Still to be run on any other environment before the constraints reach it; the
result below is for experimental only. Not a test of this feature; a gate on it
reaching the environment at all. The constraints were verified to have no orphans **on the local
database only**, and `update.database` applies them everywhere. One orphan row and the deploy stops
half-applied.

Run on the target environment *before* deploying:

```sql
select 'invoiceline' as src, count(*) from c_invoiceline t
  where t.em_etgo_source_invoiceline_id is not null
    and not exists (select 1 from c_invoiceline x
                    where x.c_invoiceline_id = t.em_etgo_source_invoiceline_id)
union all
select 'inout_currency', count(*) from m_inout t
  where t.em_etgo_currency_id is not null
    and not exists (select 1 from c_currency x where x.c_currency_id = t.em_etgo_currency_id)
union all
select 'support_conv_user', count(*) from etgo_support_conversation t
  where t.ad_user_id is not null
    and not exists (select 1 from ad_user x where x.ad_user_id = t.ad_user_id)
union all
select 'survey_resp_user', count(*) from etgo_survey_response t
  where t.ad_user_id is not null
    and not exists (select 1 from ad_user x where x.ad_user_id = t.ad_user_id);
```

**Every row must read 0.** Anything else is data to clean first, not a reason to skip the constraint.

## E1 — The lazy migration, against an account that was never migrated

The single most important item here. Phase 0 has no backfill by design: an account carrying only the
legacy inline columns is moved to a child row the first time anything reads its identity. That
mechanism has only ever run against a row this session created with SQL.

**Precondition.** At least one account with `auth_provider is not null` and no row in
`etgo_account_identity`. On experimental this is every pre-existing SSO account, so the count below
is the population.

```sql
select count(*) from etgo_account a
 where a.auth_provider is not null
   and not exists (select 1 from etgo_account_identity i
                   where i.etgo_account_id = a.etgo_account_id);
```

**Steps.** Note that count. Sign in with Google as one of those accounts. Re-read.

**Expected.** The count drops by exactly one. The new row carries the same `auth_provider`,
`external_subject` and `external_email` the account row holds, `last_sso_login` copied, and
**`linked` null** — the account never recorded when the provider was linked, and the creation date
would answer when the migration ran, which is a different question.

**How this gives a false pass.** Signing in as an account that already has a child row proves
nothing. Check the account is in the unmigrated set *before* signing in, not after.

## E2 — SSO login keeps working, both branches

Phase 0 claims to be behaviour-identical. Locally that rests on 157 unit tests and no execution.

- **New account.** Sign in with a Google account that has never used the instance. Expect one
  `etgo_account` **and** one `etgo_account_identity` row, created together, with the account's four
  legacy columns left **null** — nothing writes them any more.
- **Returning account.** Sign in again. No second identity row; `last_sso_login` on the **identity**
  row moves; the account's own `last_sso_login` stays where it was.
- **Existing local account, matching address.** Sign in with Google using the address of an account
  that already has a password. Expect the identity to attach to that account rather than a second
  account appearing, and the password to keep working afterwards.

## E3 — Two providers still refuse, on purpose

Phase 0 deliberately kept the old rule: an account carrying one identity refuses a second, different
one. The child table makes several *possible*; allowing them belongs to explicit linking (Phase 3).

Not reachable until a second provider exists, so this is a **regression guard for the day Apple or
GitHub is added**, not a check for today. Written down so nobody reads the new table and assumes the
rule already changed.

## E4 — AUTH-05 against a genuinely SSO-born account

Verified locally end to end (mail received, password created, both methods working) — but against an
account faked with SQL. Repeat with a real one, ideally the reporter's.

**Steps.** From the login screen, "¿Olvidaste tu contraseña?" with the address of a Google-born
account. **Expected:** the `set-password` mail (subject *Crea una contraseña para tu cuenta de Etendo
Go*, button *Crear contraseña*), the link works, and afterwards the account signs in **both** with
Google and with the new password.

**Evidence to capture:** the log line `Password reset request resolved to branch enrol for <masked>`
and, on the same request, `contract="set-password" status="SENT"`.

**Throttle:** 3 per recipient per 900 s, counted in the safety store. Deleting rows does not reset
it; raising the ceiling does, because the rule is matched on its limits too.

## E5 — Phase 2c, which has no local end-to-end at all

Adding a first password from inside the app needs an authenticated SSO session, so locally it rests
entirely on unit tests.

**Steps.** Sign in with Google. Change password from the user menu, supplying **only** a new
password. **Expected:** it succeeds, the `password-added` mail arrives (subject *Ya puedes entrar con
contraseña a Etendo Go*), and the session is rotated. Then confirm both methods sign in.

**And the negative half, which matters as much:** an account that already has a password must still
be refused without `currentPassword` (400) and with a wrong one (401). The parsing changed for
everybody, not only for SSO accounts.

## E6 — The unique constraint actually fires

`AccountIdentityDalHelperTest` proves the code *handles* a lost insert race by making `flush()`
throw. It cannot prove the constraint exists and fires — that needs two real transactions.

Cheap check, no concurrency needed: try to insert a second `etgo_account_identity` row with an
`(auth_provider, external_subject)` pair that already exists, and a second row for an account that
already has that provider. **Both must be rejected.** Roll back.

## E7 — The set-password mail rendered by the real gateway

Locally the mail was read in a real inbox, so this is largely covered. What differs on experimental
is the gateway configuration and the `ETGO_APP_URL` used to build the link.

**Check the link host** in the received mail is `https://go.experimental.etendo.cloud/...` and not a
localhost URL. `resolveConfiguredAppBaseUrl` reads the legacy `ETGO_APP_URL` there
(`etendo-go-infraestructure/07-ecs-experimental.yaml:127`); a wrong host means the mail is going out
with a link nobody can follow.

## Still open, and not a test

The reset **request** screen says *"te enviaremos un enlace para restablecer tu contraseña"* to
somebody who is about to create a first one. It lives in `@etendosoftware/etendo-go-core`
(`LoginStep.jsx`) and is decision §8.2 in the main plan. The confirm screen is already correct
(*Crear nueva contraseña*), so this is one sentence, not a flow.

## Coverage matrix — every flow, and where it stands

Added 2026-09-02, after the local end-to-end pass and the deploy. Three states, and the middle one
is the one worth reading carefully:

- **LOCAL** — exercised end to end on a developer machine, through the real UI or the real API
  against the deployed backend. Believed working.
- **UNIT** — covered by tests, and by tests only. The code path has never run against a real
  request. A green unit test says the logic is right, not that the wiring is.
- **EXP** — cannot be checked locally at all; needs experimental. The reason is in the E-item.

### Authentication and recovery

| # | Flow | State | Evidence / why not |
|---|---|---|---|
| 1 | Register with a password | LOCAL | `201`, post-deploy smoke |
| 2 | Log in with a password | LOCAL | `200`, post-deploy smoke |
| 3 | `GET /me` returns `authMethods` | LOCAL | password-only, SSO-only and both, read in the browser |
| 4 | Reset request, account **with** a password → `reset-password` mail | LOCAL | pre-existing behaviour, unchanged |
| 5 | **Reset request, SSO account with no password → `set-password` mail** | LOCAL | AUTH-05. Real inbox, correct accents, "Crear contraseña" button |
| 6 | Reset confirm creates the password, SSO identity intact | LOCAL | DB showed `password_hash` set **and** `auth_provider = google` |
| 7 | Log in with the newly created password on an SSO account | LOCAL | both methods coexist, proven at runtime |
| 8 | Change password (supplying the current one) | LOCAL | pre-existing behaviour |
| 9 | Enrol a password through change-password when there is none | LOCAL | browser, once the dialog stopped demanding a password that does not exist |
| 10 | SSO login, existing account | **EXP** | E2. Needs a real Google assertion |
| 11 | SSO login, brand-new account | **EXP** | E2 |
| 12 | Throttle: 3 mails per recipient per 900 s | **EXP** | E7 area; local sink does not exercise the real limiter |

### Method management (phase 4)

| # | Flow | State | Evidence / why not |
|---|---|---|---|
| 13 | Remove an SSO identity | LOCAL | browser; row gone from the DB |
| 14 | Remove the password, supplying the current one | LOCAL | browser; `enabled: false` afterwards |
| 15 | Remove the only remaining method → `409 LAST_AUTH_METHOD` | LOCAL | API and browser, twice |
| 16 | Remove a method the account lacks → `404` | LOCAL | API |
| 17 | Remove the password without the current one → `400` | LOCAL | API. Was the bug: no UI path supplied it |
| 18 | **Session token rotates and the browser keeps it** | LOCAL | `ff4e…` → `1c5f…`, `/me` 200 after. Was the bug |
| 19 | Legacy identity materialised lazily on read | LOCAL | one `/me` created the child row; 4 more left exactly 1 |
| 20 | A second, different identity is refused | UNIT | `linkIfCompatible`; E3 confirms it on real data |
| 21 | The `(auth_provider, external_subject)` constraint fires | **EXP** | E6. Needs the real schema after `update.database` |
| 22 | `soleIdentityOf` throws on a second identity | UNIT | unreachable by design; no account has two |

### Account settings UI (phase 4b)

| # | Flow | State | Evidence / why not |
|---|---|---|---|
| 23 | `/account` lists the methods the server reports | LOCAL | browser |
| 24 | Sole method: Remove disabled, with the explaining tooltip | LOCAL | drawn from `removable: []` |
| 25 | Two methods: both Remove buttons enabled | LOCAL | browser |
| 26 | Confirmation asks for the current password, and only for the password | LOCAL | browser |
| 27 | Screen redraws from the server's `removable` after a removal | LOCAL | password button re-disabled on its own |
| 28 | **Load failure shows an error, never "no password set"** | LOCAL | forced a 500; was the bug |
| 29 | Retry after a failed load recovers | LOCAL | browser |
| 30 | The 409 reaches the user translated, not as the generic sentence | LOCAL | forced the real race; toast read the Spanish copy |
| 31 | Account entry in the user menu, unconditional | LOCAL | browser |
| 32 | Password change still signs the user out | LOCAL | browser; redirected to `/onboarding?returnTo=/account` and back after signing in |

### Deploy-time and infrastructure

| # | Flow | State | Evidence / why not |
|---|---|---|---|
| 33 | **Orphan pre-check before deploying** | partial | E0 passed on experimental; **must still be run against production** |
| 34 | No account already holds two identities | LOCAL | zero rows; re-run before any deploy that carries the guard |
| 35 | `set-password` mail rendered by the real gateway | **EXP** | E7. The local sink is not the provider |
| 36 | Reset link points at the real host | **EXP** | E5 |

### What the matrix says

Everything in **phases 4 and 4b is LOCAL** — the removal flow and its screen were used, not just
tested. That is where the three defects came from, and none of them would have been found any other
way.

**Every remaining EXP item is an SSO login or an email.** Both need something a developer machine
cannot provide: a real Google assertion, and the real mail gateway. That is the honest shape of the
risk — the parts we could exercise, we exercised; the parts we could not are the ones that touch
another system.

Both of those UNIT items were closed the same afternoon, by sitting in front of the screen — and
item 9 turned out to be a **fourth defect of the same family**. `ChangePasswordDialog` demanded the
current password as a `required` field regardless, so on an account with no password the form could
not be submitted at all: the browser refused it before any request left. The server's `enrolling`
branch was reachable only through the mailed recovery link, never from settings. The dialog now
takes `hasPassword`, hides the field, retitles itself *Crear una contraseña*, sends no
`currentPassword`, and the row's button reads *Crear*.

That is now four defects found by using the screen and zero found by reading it. The pattern is
consistent enough to state plainly: **a capability the server supports is not shipped until some
path in the UI reaches it.** Each of the four was a server branch that worked perfectly and a UI
that could not get there.
