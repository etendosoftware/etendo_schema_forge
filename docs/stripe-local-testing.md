# Stripe sandbox: local testing guide

This guide validates the hosted Checkout flow against a local Etendo Go backend. It covers two
levels:

- **Offline simulation** — sign and post a Checkout webhook yourself. No Stripe account, no
  `sk_test_` key and no `stripe listen` process. This exercises everything after the redirect:
  signature verification, de-duplication, payment correlation, status polling and paid onboarding
  resume.
- **Stripe Test Mode** — the real hosted Checkout page, real events forwarded by Stripe CLI.

It never uses live keys and never sends raw card data to Etendo.

## 1. What is being tested

The browser sends an authenticated intent to Etendo Go. The backend chooses the configured Price,
creates a hosted Checkout Session at Stripe, and returns a redirect URL. Stripe handles the card
form. Stripe then delivers `checkout.session.completed`, which the backend verifies and correlates
back to the originating account so onboarding can resume.

All of it is implemented on this branch:

- `POST <base>/sws/go/checkout/sessions` creates a hosted session.
- `GET  <base>/sws/go/checkout/sessions/{requestId}` reports `pending` or `paid`.
- `POST <base>/sws/go/checkout/webhook` verifies the Stripe signature, de-duplicates by event id,
  and records the payment.
- Server-side Price ID and subscription/payment mode configuration.
- Paid onboarding resume: the `requestId` is passed back as `paymentToken` on the onboarding call.

### Payment state is durable (ETP-5045)

Checkout state lives in `ETGO_CHECKOUT_REQUEST`, one row per attempt, written before Stripe is
contacted and advanced by each step that succeeds:

```sql
select request_id, checkout_status, creating_at, created_at, paid_at,
       provisioning_at, provisioned_at, created_client_id, failure_reason
  from etgo_checkout_request order by created desc limit 5;
```

Expect `CREATING -> CREATED -> PAID -> PROVISIONING -> PROVISIONED`. The status only moves
forward: a replayed webhook or a browser reload is silently ignored rather than rewinding it,
and each phase timestamp is first-write-wins, so `paid_at` keeps meaning *when the payment was
confirmed*.

Consequences to plan around:

- **A Tomcat restart no longer loses a payment.** Restart between the webhook and the poll and
  the status endpoint still answers `paid`. That is the acceptance criterion of ETP-5045 and is
  worth re-running whenever this path changes.
- **A webhook only records a payment against a request row that already exists.** An invented
  `requestId` is accepted with `200 {"received":true}` and recorded nowhere -- silently. Start
  the flow with `POST /checkout/sessions` first (see the offline stub in section 4), or the
  simulation looks like it worked and did nothing.
- `GET /checkout/sessions/{requestId}` answers `200 {"status":"pending"}` for *any* unknown id,
  and for a request belonging to another account. It deliberately never 404s and never reveals
  another account's payment or client name, so the "another user's status" scenario is verified
  by a non-disclosing `pending`, not by an error code.
- A second onboarding call with an already-claimed `paymentToken` is refused with
  `409 PROVISIONING_ALREADY_IN_PROGRESS`. That is the reload-during-provisioning guard; it also
  means a spent token cannot create a second environment.
- `DERIVED_STATUS` is a computed column, not a stored one -- read it through the DAL or inline
  the expression from `AD_COLUMN.SQLLOGIC`. `SELECT derived_status` fails. It reports `DONE`,
  `IN_FLIGHT`, `ABANDONED`, `EXPIRED` or `STALLED`; **`STALLED` on a `PAID` row is the one that
  should page someone** -- charged, not provisioned.

## 2. Base URL and ports

Nothing here is fixed by the module; read the real values from your checkout:

| Value | Where it comes from | Typical local value |
| --- | --- | --- |
| Context path | `etendo_core/gradle.properties` → `context.name` | `etendo` |
| Base URL | port 8080 + context path | `http://localhost:8080/etendo` |
| Frontend origin | `tools/app-shell/vite.config.js` (`strictPort`) | `http://localhost:3100` |

```bash
grep '^context.name' ../gradle.properties
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:8080/etendo/sws/go/checkout/webhook
```

A `400` means the servlet is reachable and rejected the missing signature — that is the healthy
answer. A `404` means the context path is wrong.

Export the base URL once so every command and script below picks it up:

```bash
export ETENDO_BASE_URL=http://localhost:8080/etendo
```

The **`Origin` header matters**: `HostedCheckoutService` builds Stripe's `success_url` and
`cancel_url` from it, so a stale origin sends the browser back to a dev server that is not running.
It must also be CORS-allowlisted. `http://localhost:3100` is allowlisted by default; override with
`etgo.allowed.origins` / `ETGO_ALLOWED_ORIGINS` if you serve the SPA elsewhere.

## 3. Configure the local backend

Configuration resolves in this order (`ConfigPropertyReader`):

**JVM system property → `Openbravo.properties` → environment variable → default.**

| Property | Environment variable | Needed for |
| --- | --- | --- |
| `etendo.go.checkout.webhook.secret` | `ETGO_CHECKOUT_WEBHOOK_SECRET` | webhook (offline **and** Stripe) |
| `etendo.go.checkout.secret.key` | `ETGO_CHECKOUT_SECRET_KEY` | creating sessions |
| `etendo.go.checkout.price.id` | `ETGO_CHECKOUT_PRICE_ID` | creating sessions |
| `etendo.go.checkout.mode` | `ETGO_CHECKOUT_MODE` | optional, default `subscription` |
| `etendo.go.checkout.api.base.url` | `ETGO_CHECKOUT_API_BASE_URL` | optional, default `https://api.stripe.com` |

### Use `Openbravo.properties`, not environment variables

`etendo_core/config/Openbravo.properties` is gitignored and untracked, and `smartbuild` copies it
into the deployed webapp. Prefer it for local testing:

```properties
etendo.go.checkout.webhook.secret=whsec_local_simulation
etendo.go.checkout.secret.key=sk_test_REPLACE_WITH_TEST_SECRET
etendo.go.checkout.price.id=price_1U1pJgAwtDoN8Dg5nt6Mi1lM
etendo.go.checkout.mode=subscription
```

```bash
cd etendo_core && ./gradlew smartbuild
```

**Do not rely on `set -a; source .env; ./gradlew smartbuild`** unless Tomcat itself is launched by
that same shell. On a standalone Tomcat (or a container started separately), `smartbuild` only
redeploys the webapp — the running JVM keeps the environment it was started with, so exported
variables are invisible and you get `503 CHECKOUT_NOT_CONFIGURED` forever. The equivalent
JVM-property route is `CATALINA_OPTS="-Detendo.go.checkout.webhook.secret=..."` plus a real Tomcat
restart.

Never commit real keys, and never use `sk_live_...`/`pk_live_...` locally.

## 4. Offline simulation (no Stripe account)

`CheckoutWebhookVerifier` uses the raw UTF-8 bytes of the configured secret as the HMAC key, so any
agreed string is a valid local webhook secret. Set
`etendo.go.checkout.webhook.secret=whsec_local_simulation`, redeploy, and mirror it in `.env`:

```dotenv
ETENDO_BASE_URL=http://localhost:8080/etendo
ETGO_CHECKOUT_WEBHOOK_SECRET=whsec_local_simulation
ETENDO_TEST_EMAIL=goadmin@etendo.software
ETENDO_TEST_PASSWORD=...
```

Then:

```bash
make stripe-simulate
```

That posts a correctly signed `checkout.session.completed`, then logs in and polls the status
endpoint until it reports `paid`. It prints the `requestId`, which is exactly what the upgrade page
sends back as `paymentToken` to resume provisioning.

### Starting the flow without Stripe

Since ETP-5045 the webhook only records a payment against a request row that already exists, and
that row is written by `POST /checkout/sessions` -- which calls the provider. So a webhook alone
is no longer enough to reach `paid` on a fresh id: it is accepted and recorded nowhere.

`tools/stripe-session-stub.py` closes that gap. It answers the one endpoint the backend calls
with a plausible Checkout Session, so the whole flow runs with no Stripe account, no test key
and no network access:

```bash
tools/stripe-session-stub.py &          # listens on 127.0.0.1:8099
```

Point the deployed `WEB-INF/Openbravo.properties` at it and restart Tomcat -- all three keys are
required, because `isConfigured()` demands the secret key, the price id and the webhook secret:

```properties
etendo.go.checkout.secret.key=sk_test_offline_stub
etendo.go.checkout.price.id=price_offline_stub
etendo.go.checkout.api.base.url=http://localhost:8099
etendo.go.checkout.webhook.secret=whsec_local_simulation
```

Then drive the full lifecycle:

```bash
TOKEN=$(curl -s -X POST "$ETENDO_BASE_URL/sws/go/login" -H 'Content-Type: application/json' \
  -d '{"email":"'"$ETENDO_TEST_EMAIL"'","password":"'"$ETENDO_TEST_PASSWORD"'"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')

RID=$(curl -s -X POST "$ETENDO_BASE_URL/sws/go/checkout/sessions" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -H 'Origin: http://localhost:3100' -d '{"clientName":"Offline Test Tenant"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["requestId"])')

ETENDO_SESSION_TOKEN=$TOKEN tools/stripe-webhook-simulate.sh \
  --request-id "$RID" --client-name "Offline Test Tenant" --status
```

The `requestId` then goes to `POST /sws/go/onboarding` as `paymentToken`. Note the paid path only
engages for an account that **already owns an environment** -- the first one is always free, so a
brand-new account provisions without touching the checkout row at all.

To assert the failure path instead, stop the stub and submit an upgrade: the call answers `502
CHECKOUT_PROVIDER_ERROR` and the `CREATING` row deliberately survives, because it is the evidence
that someone tried to buy something.

The underlying script covers the rest of the matrix:

```bash
# Mark a real Checkout Session as paid (requestId from POST /checkout/sessions)
tools/stripe-webhook-simulate.sh --request-id <requestId> --status

# SF-STRIPE-LOCAL-05 — rejected signature (expects HTTP 400)
tools/stripe-webhook-simulate.sh --invalid-signature

# SF-STRIPE-LOCAL-06 — duplicate delivery: same event id twice, no restart in between
tools/stripe-webhook-simulate.sh --event-id evt_dup_001 --request-id req_dup_001
tools/stripe-webhook-simulate.sh --event-id evt_dup_001 --request-id req_dup_001

# Outside the 300s tolerance window (expects HTTP 400)
tools/stripe-webhook-simulate.sh --skew -400

# Async capture variant
tools/stripe-webhook-simulate.sh --type checkout.session.async_payment_succeeded --status
```

Run `tools/stripe-webhook-simulate.sh --help` for the full option list.

### Doing it by hand

The signature is `HMAC-SHA256("<timestamp>.<raw body>")` keyed by the secret, hex-encoded, with a
300-second tolerance. The signed bytes must be byte-identical to the bytes sent, so build the
payload once:

```bash
BASE=http://localhost:8080/etendo
SECRET=whsec_local_simulation
REQ_ID="req-$(date +%s)"
EMAIL=goadmin@etendo.software
TS=$(date +%s)
PAYLOAD=$(printf '{"id":"evt_%s","type":"checkout.session.completed","data":{"object":{"metadata":{"request_id":"%s","account_email":"%s","client_name":"Sandbox Tenant"}}}}' "$TS" "$REQ_ID" "$EMAIL")
SIG=$(printf '%s.%s' "$TS" "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" -r | cut -d' ' -f1)

curl -i -X POST "$BASE/sws/go/checkout/webhook" \
  -H 'Content-Type: application/json' \
  -H "Stripe-Signature: t=$TS,v1=$SIG" \
  --data-raw "$PAYLOAD"
```

`metadata.request_id` **and** `metadata.account_email` are both mandatory — without either, the
backend answers `200 {"received":true}` and records nothing. The email must match the account that
later polls the status endpoint (matching is case-insensitive).

## 5. Stripe Test Mode

### Prerequisites

- Stripe CLI installed and authenticated (`stripe login`), Dashboard in **Test Mode**.
- Test-mode Price already created:

```text
Product: prod_V1t5ck5A6rDPTh
Price:   price_1U1pJgAwtDoN8Dg5nt6Mi1lM
Amount:  49 EUR / month
```

- `etendo.go.checkout.secret.key` and `etendo.go.checkout.price.id` configured per §3.

### Automated smoke command

```bash
make test-stripe-local
```

It loads `.env`, refuses a non-`sk_test_` key, starts `stripe listen`, captures the listener's
signing secret, logs in with `ETENDO_TEST_EMAIL` / `ETENDO_TEST_PASSWORD` (or reuses
`ETENDO_SESSION_TOKEN`), and calls the Checkout Session endpoint with `Origin: $ETGO_CHECKOUT_APP_ORIGIN`
(default `http://localhost:3100`). It stops the listener on exit and never prints the secret or
password.

**Caveat:** the script captures the `whsec_...` into its own shell only. The backend must already be
configured with the *same* secret. Because `stripe listen` mints a new secret per session, either
use `stripe listen` with a fixed endpoint secret from the Dashboard, or copy the printed value into
`Openbravo.properties` and redeploy before the payment.

### Manual forwarding

```bash
stripe listen --forward-to localhost:8080/etendo/sws/go/checkout/webhook
```

Copy the printed `whsec_...` into `etendo.go.checkout.webhook.secret` and redeploy. Do not use
`--live`.

```bash
stripe events list --limit 10
```

### `stripe trigger` does not work here

```bash
stripe trigger checkout.session.completed   # accepted, but provisions nothing
```

The canned fixture carries no `metadata.request_id` / `metadata.account_email`, so the handler
acknowledges it and records nothing. Use the offline simulator (§4) for synthetic events, and
`stripe events resend` for real ones.

### Create a Checkout Session directly

```bash
curl -i -X POST "$ETENDO_BASE_URL/sws/go/checkout/sessions" \
  -H "Authorization: Bearer $ETENDO_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3100" \
  -d '{"clientName":"Stripe Sandbox Tenant","language":"en_US","countryCode":"AR"}'
```

```json
{
  "requestId": "<server-generated-id>",
  "checkoutUrl": "https://checkout.stripe.com/c/pay/...",
  "mode": "subscription"
}
```

Open `checkoutUrl` in the browser. The request carries no card number, CVC, amount, currency or
Price ID. A missing secret, Price ID or webhook secret fails closed with `503
CHECKOUT_NOT_CONFIGURED`; the client must not fall back to a mock card form.

#### Account email binding

Checkout identity comes from the authenticated Etendo account, not from browser input. The backend
sends it to Stripe as `customer_email` and records it in `metadata[account_email]`. Keep the email
Checkout shows — replacing it breaks the account-to-customer binding the test is verifying.

Recommended local values:

| Field | Value |
| --- | --- |
| Email | `goadmin@etendo.software` (or `ETENDO_TEST_EMAIL`) |
| Card | `4242 4242 4242 4242` |
| Expiry | `12/34` |
| CVC | `123` |
| Cardholder name | `Etendo Sandbox Tester` |
| Country | `Argentina` |

### Test cards

| Scenario | Card number | Expected result |
| --- | --- | --- |
| Successful payment | `4242 4242 4242 4242` | Checkout succeeds and emits a successful event |
| Generic decline | `4000 0000 0000 0002` | Checkout shows a decline; no tenant is provisioned |
| 3DS authentication | `4000 0025 0000 3155` | Challenge appears, then succeeds when completed |

Use any future expiry, any three-digit CVC, and a valid billing postal code. These stay inside
Stripe Checkout.

### Recover a payment when the listener was offline

The payment does not need to be repeated; replay the existing Test Mode event.

1. Start `stripe listen` and configure the backend with that listener's `whsec_...` (§3), then
   redeploy. Note that the redeploy/restart wipes the in-memory registry, so always resend *after*
   the backend is back up.
2. Confirm the event carries the correlation metadata:

   ```bash
   stripe events list --limit 20
   stripe events retrieve evt_REPLACE_ME | jq '{type, metadata: .data.object.metadata}'
   ```

3. Replay it:

   ```bash
   stripe events resend evt_REPLACE_ME
   ```

4. Poll the status endpoint with the same authenticated token; it must flip `pending` → `paid`:

   ```bash
   curl -sS -H "Authorization: Bearer $ETENDO_SESSION_TOKEN" \
     "$ETENDO_BASE_URL/sws/go/checkout/sessions/REQUEST_ID"
   ```

Do not create a second Checkout Session for this path. Replaying is idempotent and does not charge
the card again.

## 6. Verify webhook delivery

After a successful test payment the `stripe listen` terminal shows a delivered event. The event set
depends on the configured mode:

- `subscription`: checkout completion plus subscription/invoice lifecycle events.
- `payment`: checkout completion plus payment-intent/charge lifecycle events.

Record: the Stripe event id, the HTTP status returned by the local webhook, whether it was accepted
once or de-duplicated, and the resulting tenant/payment state in Etendo.

## 7. Functional test matrix

| ID | Scenario | How to run | Expected result | Priority |
| --- | --- | --- | --- | --- |
| SF-STRIPE-LOCAL-01 | Valid token and configured sandbox | `make test-stripe-local` | Returns hosted Checkout URL; no card fields in request | P0 |
| SF-STRIPE-LOCAL-02 | Missing secret/Price/webhook configuration | unset a property, redeploy | `503 CHECKOUT_NOT_CONFIGURED` | P0 |
| SF-STRIPE-LOCAL-03 | Successful `4242` payment | Test Mode (§5) | Stripe accepts payment and emits webhook | P0 |
| SF-STRIPE-LOCAL-04 | Declined `4000...0002` payment | Test Mode (§5) | Checkout declines; tenant remains unprovisioned | P0 |
| SF-STRIPE-LOCAL-05 | Invalid webhook signature | `tools/stripe-webhook-simulate.sh --invalid-signature` | `400 INVALID_CHECKOUT_SIGNATURE`; no side effect | P0 |
| SF-STRIPE-LOCAL-06 | Duplicate webhook event | same `--event-id` twice, no restart between | Second delivery acknowledged, not reprocessed; one tenant maximum | P0 |
| SF-STRIPE-LOCAL-07 | Account polls another account's requestId | `--status` with a mismatched `--email` | `200 {"status":"pending"}`; no information disclosure | P1 |
| SF-STRIPE-LOCAL-08 | First free onboarding | onboarding without `paymentToken` | Existing free flow unchanged | P1 |

## 8. Troubleshooting

### The webhook returns 404

Wrong context path. Compare against `context.name` in `etendo_core/gradle.properties` (see §2). A
reachable endpoint answers `400`, not `404`, to an unsigned POST.

### `CHECKOUT_NOT_CONFIGURED`

`isConfigured()` requires secret key, Price ID **and** webhook secret. Most often the values were
exported into a shell that did not start the JVM — put them in `Openbravo.properties` and redeploy
(§3).

### Checkout succeeded but status stays `pending`

One of: `stripe listen` was not running; its `whsec_...` differs from the configured secret; the
event lacked `metadata.request_id`/`metadata.account_email`; the polling account email differs from
the recorded one; or Tomcat restarted and cleared the in-memory registry. Resend the event (§5).

### CORS error in the browser

The SPA origin must be allowlisted. `http://localhost:3100` and `:3000` are defaults; anything else
needs `etgo.allowed.origins` / `ETGO_ALLOWED_ORIGINS`.

### Checkout returns to a dead page after paying

`success_url` is derived from the `Origin` header of the session request. Send the origin of the dev
server that is actually running.

### Checkout uses the wrong amount

The amount is intentionally not accepted from the browser. Verify `etendo.go.checkout.price.id` and
the corresponding Stripe Test Mode Price instead of changing frontend code.

### No event appears in the listener

Confirm the Dashboard is in Test Mode, the session was created with the `sk_test_...` key, and
`stripe listen` is still running without `--live`.

## 9. Evidence to attach to QA

- Terminal output showing `stripe listen` startup and the configured `whsec_...` (redacted).
- Checkout Session response with `requestId` and hosted URL (redact tokens).
- Screenshot or export of the successful/declined Test Mode payment.
- Stripe event ids and local webhook HTTP responses.
- Etendo tenant/payment state before and after each scenario.
