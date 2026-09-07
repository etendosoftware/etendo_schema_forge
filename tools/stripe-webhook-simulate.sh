#!/usr/bin/env bash
set -Eeuo pipefail

# Simulate a Stripe checkout webhook against the local Etendo Go backend.
#
# The backend verifies the Stripe signature with the raw UTF-8 bytes of the
# configured webhook secret (CheckoutWebhookVerifier), so any agreed string
# works locally: no Stripe account, no sk_test_ key and no `stripe listen`
# process are required to exercise the webhook -> status -> provisioning half
# of the flow.
#
# Usage:
#   tools/stripe-webhook-simulate.sh [options]
#
# Options:
#   --request-id ID    Correlation id. Default: a fresh sim-<epoch> value.
#                      Pass the requestId of a real Checkout Session to mark
#                      that session as paid.
#   --email ADDRESS    Etendo account email. Must match the authenticated
#                      account that polls the status endpoint.
#   --client-name NAME Tenant name recorded with the payment.
#   --event-id ID      Stripe event id. Reuse a previous value to exercise
#                      duplicate-event de-duplication (SF-STRIPE-LOCAL-06).
#   --type TYPE        checkout.session.completed (default) or
#                      checkout.session.async_payment_succeeded.
#   --secret SECRET    Webhook secret. Default: $ETGO_CHECKOUT_WEBHOOK_SECRET.
#   --base-url URL     Default: $ETENDO_BASE_URL or http://localhost:8080/etendo
#   --invalid-signature  Corrupt the signature to assert the 400 rejection
#                      path (SF-STRIPE-LOCAL-05).
#   --skew SECONDS     Offset the signature timestamp to test the 300s
#                      tolerance window.
#   --status           After posting, poll the checkout status endpoint.
#                      Requires ETENDO_SESSION_TOKEN, or ETENDO_TEST_EMAIL and
#                      ETENDO_TEST_PASSWORD for automatic login.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env}"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

BASE_URL="${ETENDO_BASE_URL:-http://localhost:8080/etendo}"
WEBHOOK_PATH="${ETGO_CHECKOUT_WEBHOOK_PATH:-/sws/go/checkout/webhook}"
SESSION_PATH="${ETGO_CHECKOUT_SESSION_PATH:-/sws/go/checkout/sessions}"
SECRET="${ETGO_CHECKOUT_WEBHOOK_SECRET:-}"
REQUEST_ID=""
EMAIL="${ETENDO_TEST_EMAIL:-}"
CLIENT_NAME="${ETGO_CHECKOUT_TEST_CLIENT_NAME:-Stripe Simulated Tenant}"
EVENT_ID=""
EVENT_TYPE="checkout.session.completed"
INVALID_SIGNATURE=0
SKEW=0
POLL_STATUS=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --request-id) REQUEST_ID="$2"; shift 2 ;;
    --email) EMAIL="$2"; shift 2 ;;
    --client-name) CLIENT_NAME="$2"; shift 2 ;;
    --event-id) EVENT_ID="$2"; shift 2 ;;
    --type) EVENT_TYPE="$2"; shift 2 ;;
    --secret) SECRET="$2"; shift 2 ;;
    --base-url) BASE_URL="$2"; shift 2 ;;
    --invalid-signature) INVALID_SIGNATURE=1; shift ;;
    --skew) SKEW="$2"; shift 2 ;;
    --status) POLL_STATUS=1; shift ;;
    -h|--help) sed -n '4,36p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "ERROR: unknown option: $1" >&2; exit 1 ;;
  esac
done

for command_name in curl openssl; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "ERROR: required command not found: $command_name" >&2
    exit 1
  }
done

if [[ -z "$SECRET" ]]; then
  echo "ERROR: missing webhook secret." >&2
  echo "Pass --secret, or set ETGO_CHECKOUT_WEBHOOK_SECRET to the same value as" >&2
  echo "etendo.go.checkout.webhook.secret in etendo_core/config/Openbravo.properties." >&2
  exit 1
fi
if [[ -z "$EMAIL" ]]; then
  echo "ERROR: missing account email. Pass --email or set ETENDO_TEST_EMAIL." >&2
  exit 1
fi

NOW="$(date +%s)"
[[ -n "$REQUEST_ID" ]] || REQUEST_ID="sim-${NOW}-$$"
[[ -n "$EVENT_ID" ]] || EVENT_ID="evt_sim_${NOW}_$$"
TIMESTAMP=$((NOW + SKEW))

# The signed bytes must be byte-identical to the bytes curl sends, so the
# payload is built once and reused verbatim.
PAYLOAD="$(printf '{"id":"%s","object":"event","type":"%s","data":{"object":{"id":"cs_sim_%s","object":"checkout.session","metadata":{"request_id":"%s","account_email":"%s","client_name":"%s"}}}}' \
  "$EVENT_ID" "$EVENT_TYPE" "$NOW" "$REQUEST_ID" "$EMAIL" "$CLIENT_NAME")"

SIGNATURE="$(printf '%s.%s' "$TIMESTAMP" "$PAYLOAD" \
  | openssl dgst -sha256 -hmac "$SECRET" -r | cut -d' ' -f1)"
if [[ "$INVALID_SIGNATURE" == "1" ]]; then
  SIGNATURE="$(printf '%s' "$SIGNATURE" | tr '0-9a-f' '1-9a-f0')"
fi

echo "==> POST ${BASE_URL}${WEBHOOK_PATH}"
echo "    event      $EVENT_ID ($EVENT_TYPE)"
echo "    requestId  $REQUEST_ID"
echo "    account    $EMAIL"
RESPONSE_FILE="$(mktemp)"
trap 'rm -f "$RESPONSE_FILE"' EXIT
HTTP_STATUS="$(curl -sS -o "$RESPONSE_FILE" -w '%{http_code}' \
  -X POST "${BASE_URL}${WEBHOOK_PATH}" \
  -H 'Content-Type: application/json' \
  -H "Stripe-Signature: t=${TIMESTAMP},v1=${SIGNATURE}" \
  --data-raw "$PAYLOAD")"
echo "<== HTTP $HTTP_STATUS $(cat "$RESPONSE_FILE")"

if [[ "$INVALID_SIGNATURE" == "1" ]]; then
  [[ "$HTTP_STATUS" == "400" ]] || {
    echo "ERROR: expected HTTP 400 for a corrupted signature, got $HTTP_STATUS" >&2; exit 1;
  }
  echo "PASS: corrupted signature rejected"
  exit 0
fi
[[ "$HTTP_STATUS" == "200" ]] || {
  echo "ERROR: webhook returned HTTP $HTTP_STATUS" >&2; exit 1;
}

if [[ "$POLL_STATUS" != "1" ]]; then
  echo "PASS: webhook accepted. Poll the status with:"
  echo "  curl -sS -H \"Authorization: Bearer \$ETENDO_SESSION_TOKEN\" \\"
  echo "    ${BASE_URL}${SESSION_PATH}/${REQUEST_ID}"
  exit 0
fi

if [[ -z "${ETENDO_SESSION_TOKEN:-}" ]]; then
  if [[ -z "${ETENDO_TEST_EMAIL:-}" || -z "${ETENDO_TEST_PASSWORD:-}" ]]; then
    echo "ERROR: --status needs ETENDO_SESSION_TOKEN, or ETENDO_TEST_EMAIL and ETENDO_TEST_PASSWORD." >&2
    exit 1
  fi
  LOGIN_FILE="$(mktemp)"
  trap 'rm -f "$RESPONSE_FILE" "$LOGIN_FILE"' EXIT
  login_status="$(curl -sS -o "$LOGIN_FILE" -w '%{http_code}' \
    -X POST "${BASE_URL}/sws/go/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"${ETENDO_TEST_EMAIL}\",\"password\":\"${ETENDO_TEST_PASSWORD}\"}")"
  [[ "$login_status" == "200" ]] || {
    echo "ERROR: local Etendo login failed with HTTP $login_status" >&2; exit 1;
  }
  ETENDO_SESSION_TOKEN="$(sed -n 's/.*"token":"\([^"]*\)".*/\1/p' "$LOGIN_FILE")"
  [[ -n "$ETENDO_SESSION_TOKEN" ]] || {
    echo "ERROR: login response did not contain a session token" >&2; exit 1;
  }
fi

echo "==> GET ${BASE_URL}${SESSION_PATH}/${REQUEST_ID}"
STATUS_BODY="$(curl -sS \
  -H "Authorization: Bearer ${ETENDO_SESSION_TOKEN}" \
  "${BASE_URL}${SESSION_PATH}/${REQUEST_ID}")"
echo "<== $STATUS_BODY"
grep -q '"status":"paid"' <<<"$STATUS_BODY" || {
  echo "ERROR: status did not flip to paid. The account email must match the" >&2
  echo "authenticated account, and Tomcat must not have restarted (the payment" >&2
  echo "registry is in-memory)." >&2
  exit 1
}
echo "PASS: requestId ${REQUEST_ID} is paid and can be sent as paymentToken"
