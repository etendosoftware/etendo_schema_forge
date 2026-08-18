# Stripe sandbox: local testing guide

This guide validates the hosted Checkout flow against the Stripe **Test Mode** account and a
local Etendo Go backend. It does not use live keys and it never sends raw card data to Etendo.

## 1. What is being tested

The browser sends an authenticated intent to Etendo Go. The backend chooses the configured Price
(`price_1U1pJgAwtDoN8Dg5nt6Mi1lM`), creates a hosted Checkout Session at Stripe, and returns a
redirect URL. Stripe handles the card form. Webhook events are forwarded to localhost by Stripe
CLI.

Current local implementation status:

- [Implemented] `POST /etendo_sf2/sws/go/checkout/sessions` creates a hosted session.
- [Implemented] Server-side Price ID and subscription/payment mode configuration.
- [Implemented] Signature verification and duplicate-event processor classes.
- [Implemented] Signed webhook correlation, checkout status polling, and paid onboarding resume.
  The local flow now provisions the productive environment after Stripe confirms payment.

## 2. Prerequisites

- Etendo Core running locally on port `8080` with context `/etendo_sf2`.
- Schema Forge frontend running locally (usually port `5173`).
- A valid Etendo Go account/session token.
- Stripe CLI installed and authenticated with the Etendo Software account:

```bash
stripe login
```

- Stripe Dashboard switched to **Test Mode**.
- Test-mode Price already created:

```text
Product: prod_V1t5ck5A6rDPTh
Price:   price_1U1pJgAwtDoN8Dg5nt6Mi1lM
Amount:  49 EUR / month
```

## 3. Configure the local backend

Create a local, gitignored `.env` or export variables in the shell that starts Etendo:

```dotenv
ETGO_CHECKOUT_SECRET_KEY=sk_test_REPLACE_WITH_TEST_SECRET
ETGO_CHECKOUT_PRICE_ID=price_1U1pJgAwtDoN8Dg5nt6Mi1lM
ETGO_CHECKOUT_MODE=subscription
ETGO_CHECKOUT_API_BASE_URL=https://api.stripe.com
```

The webhook secret is printed by `stripe listen` and must be added before restarting Etendo:

```bash
export ETGO_CHECKOUT_WEBHOOK_SECRET=whsec_REPLACE_WITH_LISTEN_SECRET
```

Java does not automatically parse `.env`. Export it before launching the backend:

```bash
set -a
source .env
set +a
./gradlew smartbuild
```

Never commit the file or use `sk_live_...`/`pk_live_...` in local testing.

## 4. Start Stripe webhook forwarding automatically

The recommended path is the repository smoke command. It loads `.env`, validates that the key is
Test Mode, captures the listener signing secret, starts forwarding, and calls the authenticated
Checkout Session endpoint:

```bash
make test-stripe-local
```

The script loads `ETENDO_TEST_EMAIL` and `ETENDO_TEST_PASSWORD` from the root `.env`, logs in to
`/sws/go/login`, and keeps the returned bearer token in memory. An existing
`ETENDO_SESSION_TOKEN` can still be supplied to skip login. The script stops the listener on exit
and never prints the signing secret or password.

The webhook secret is captured from the same `stripe listen --forward-to` process that receives the
events. Therefore `etendo.go.checkout.webhook.secret` must match that listener's `whsec_...`; do not
reuse a secret from a different listener session.

The Etendo backend must also be started after loading the same file, because a running Java process
does not see environment variables added later:

```bash
set -a
source .env
set +a
cd etendo_core
./gradlew smartbuild
```

If the smoke command receives `503 CHECKOUT_NOT_CONFIGURED`, restart Etendo with this sequence and
run `make test-stripe-local` again.

### Account email binding

Checkout identity comes from the authenticated Etendo account, not from browser input. The backend
sends that value to Stripe as `customer_email` and records it in `metadata[account_email]`. The
email shown in hosted Checkout, the Stripe Customer created by the subscription, and the Etendo
account that initiated the upgrade therefore refer to the same account. The local smoke test logs
in with `ETENDO_TEST_EMAIL` from `.env`; use that same account when checking the Customer and
subscription in Stripe Test Mode.

For debugging, the equivalent manual command is:

Run this in a separate terminal and leave it running:

```bash
stripe listen --forward-to localhost:8080/etendo_sf2/sws/go/checkout/webhook
```

Copy the `whsec_...` value printed by the CLI into `ETGO_CHECKOUT_WEBHOOK_SECRET`, then restart
Etendo. Do not use `--live`.

To inspect delivery attempts while the listener is running:

```bash
stripe events list --test-mode --limit 10
```

### Recover a payment when the listener was offline

If Checkout completed but the browser returned with a pending status, the payment event may have
been created while no local `stripe listen` process was running. The payment does not need to be
repeated; replay the existing Test Mode event instead:

1. Start `stripe listen` with the forwarding command above.
2. Copy the `whsec_...` printed by that exact listener into
   `ETGO_CHECKOUT_WEBHOOK_SECRET` (or `etendo.go.checkout.webhook.secret`) and restart Etendo.
3. Find the completed event and confirm its metadata contains the Checkout `request_id`:

   ```bash
   stripe events list --test-mode --limit 20
   stripe events retrieve evt_REPLACE_ME --test-mode \
     | jq '{type, metadata: .data.object.metadata}'
   ```

4. Replay the event to the local webhook:

   ```bash
   stripe events resend evt_REPLACE_ME --test-mode
   ```

5. Poll the Checkout status endpoint with the same authenticated Etendo token. It should change
   from `pending` to `paid`, after which the upgrade page can resume provisioning:

   ```bash
   curl -sS \
     -H "Authorization: Bearer $ETENDO_SESSION_TOKEN" \
     "http://localhost:8080/etendo_sf2/sws/go/checkout/sessions/REQUEST_ID"
   ```

Do not create a second Checkout Session for this recovery path. Replaying the original event is
idempotent and does not charge the card again.

## 5. Create a Checkout Session directly

Obtain a valid Etendo Go session token through the local login flow. Then call the backend with
only the tenant intent; the browser must not send card number, CVC, amount, currency, or Price ID.

```bash
curl -i \
  -X POST \
  http://localhost:8080/etendo_sf2/sws/go/checkout/sessions \
  -H "Authorization: Bearer $ETENDO_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:5173" \
  -d '{"clientName":"Stripe Sandbox Tenant","language":"en_US","countryCode":"AR"}'
```

Expected response when configured:

```json
{
  "requestId": "<server-generated-id>",
  "checkoutUrl": "https://checkout.stripe.com/c/pay/...",
  "mode": "subscription"
}
```

Open `checkoutUrl` in the browser. A missing secret, Price ID, or webhook secret must fail closed
with HTTP `503` and code `CHECKOUT_NOT_CONFIGURED`; the client must not fall back to a mock card
form.

When testing locally, keep the authenticated account email shown in Checkout. Do not replace it
with another address when validating account-to-customer binding.

Recommended local test values:

| Field | Value |
| --- | --- |
| Email | `goadmin@etendo.software` (or the value of `ETENDO_TEST_EMAIL` in `.env`) |
| Card | `4242 4242 4242 4242` |
| Expiry | `12/34` |
| CVC | `123` |
| Cardholder name | `Etendo Sandbox Tester` |
| Country | `Argentina` |

The email must remain the authenticated Etendo account email. The backend binds it to Stripe's
Checkout Customer; it must not be supplied as a different browser-controlled identity.

## 6. Test cards

Use Stripe's standard Test Mode cards in the hosted Checkout page. The most useful baseline is:

| Scenario | Card number | Expected result |
| --- | --- | --- |
| Successful payment | `4242 4242 4242 4242` | Checkout succeeds and emits a successful event |
| Generic decline | `4000 0000 0000 0002` | Checkout shows a decline; no tenant is provisioned |
| 3DS authentication | `4000 0025 0000 3155` | Authentication challenge appears, then succeeds when completed |

Use any future expiry date, any three-digit CVC, and a valid billing postal code when Stripe asks
for them. These values stay inside Stripe Checkout.

## 7. Verify webhook delivery

After a successful test payment, the `stripe listen` terminal should show a delivered event. The
exact event set depends on the configured mode:

- `subscription`: checkout completion plus subscription/invoice lifecycle events.
- `payment`: checkout completion plus payment-intent/charge lifecycle events.

Record:

1. Stripe event ID (`evt_...`).
2. HTTP status returned by the local webhook endpoint.
3. Whether the event was accepted once or reported as duplicate.
4. The resulting tenant/payment state in Etendo.

Replay the same event to verify idempotency only after the durable webhook route is available:

```bash
stripe events resend evt_REPLACE_ME
```

The second delivery must not create a second tenant or charge.

## 8. Functional test matrix

| ID | Scenario | Expected result | Priority |
| --- | --- | --- | --- |
| SF-STRIPE-LOCAL-01 | Valid token and configured sandbox | Returns hosted Checkout URL; no card fields in request | P0 |
| SF-STRIPE-LOCAL-02 | Missing secret/Price/webhook configuration | Returns `503 CHECKOUT_NOT_CONFIGURED` | P0 |
| SF-STRIPE-LOCAL-03 | Successful `4242` payment | Stripe accepts payment and emits webhook | P0 |
| SF-STRIPE-LOCAL-04 | Declined `4000...0002` payment | Checkout declines; tenant remains unprovisioned | P0 |
| SF-STRIPE-LOCAL-05 | Invalid webhook signature | Event rejected; no provisioning side effect | P0 |
| SF-STRIPE-LOCAL-06 | Duplicate webhook event | Event acknowledged/deduplicated; one tenant maximum | P0 |
| SF-STRIPE-LOCAL-07 | Account attempts another user's status | Status request denied; no information disclosure | P1 |
| SF-STRIPE-LOCAL-08 | First free onboarding | Existing free flow remains unchanged | P1 |

## 9. Troubleshooting

### `stripe listen` receives 404

Confirm the context path and port:

```bash
curl -i http://localhost:8080/etendo_sf2/sws/go/checkout/webhook
```

The current branch does not yet expose the durable webhook handler, so a 404/501 is expected until
that backend slice is completed.

### `CHECKOUT_NOT_CONFIGURED`

Check that variables were exported in the same shell/environment that starts Etendo. Verify the
Price ID is the Test Mode value and restart the backend after changing `.env`.

### Checkout succeeded but status remains `pending`

Confirm that `stripe listen` is still running and that its current `whsec_...` matches the
configured webhook secret. If the listener was stopped during payment, follow the recovery steps
above and resend the existing `checkout.session.completed` event.

### Checkout uses the wrong amount

The amount is intentionally not accepted from the browser. Verify `ETGO_CHECKOUT_PRICE_ID` and
the corresponding Stripe Test Mode Price instead of changing frontend code.

### No event appears in the listener

Confirm the Dashboard is in Test Mode, the Checkout Session was created with the `sk_test_...`
key, and the `stripe listen` process is still running without `--live`.

## 10. Evidence to attach to QA

- Terminal output showing `stripe listen` startup and the generated `whsec_...` configured locally.
- Checkout Session response with `requestId` and hosted URL (redact tokens).
- Screenshot or export of the successful/declined Test Mode payment.
- Stripe event IDs and local webhook HTTP responses.
- Etendo tenant/payment state before and after each scenario.
