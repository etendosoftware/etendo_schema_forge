#!/usr/bin/env bash
set -Eeuo pipefail

# Start Stripe Test Mode forwarding, capture its signing secret, and smoke-test
# the authenticated hosted Checkout Session endpoint. Card data stays in Stripe.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env}"
BASE_URL="${ETENDO_BASE_URL:-http://localhost:8080/etendo_sf2}"
WEBHOOK_PATH="${ETGO_CHECKOUT_WEBHOOK_PATH:-/sws/go/checkout/webhook}"
CHECKOUT_PATH="${ETGO_CHECKOUT_SESSION_PATH:-/sws/go/checkout/sessions}"
CLIENT_NAME="${ETGO_CHECKOUT_TEST_CLIENT_NAME:-Stripe Local Smoke Tenant}"
LOGIN_RESPONSE_FILE="${TMPDIR:-/tmp}/stripe-local-login.$$.json"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

for command_name in stripe curl; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "ERROR: required command not found: $command_name" >&2
    exit 1
  }
done

if [[ -z "${ETGO_CHECKOUT_SECRET_KEY:-}" ]]; then
  echo "ERROR: missing ETGO_CHECKOUT_SECRET_KEY." >&2
  echo "Add an sk_test_... key to ${ENV_FILE}, or export it before running make test-stripe-local." >&2
  exit 1
fi
if [[ -z "${ETGO_CHECKOUT_PRICE_ID:-}" ]]; then
  echo "ERROR: missing ETGO_CHECKOUT_PRICE_ID." >&2
  echo "Add the Stripe Test Mode price_... identifier to ${ENV_FILE}." >&2
  exit 1
fi
if [[ -z "${ETENDO_SESSION_TOKEN:-}" ]]; then
  if [[ -z "${ETENDO_TEST_EMAIL:-}" || -z "${ETENDO_TEST_PASSWORD:-}" ]]; then
    echo "ERROR: missing Etendo authentication." >&2
    echo "Set ETENDO_SESSION_TOKEN, or set ETENDO_TEST_EMAIL and ETENDO_TEST_PASSWORD for automatic login." >&2
    exit 1
  fi
  echo "==> Logging in to local Etendo Go test account"
  login_status="$(curl -sS -o "$LOGIN_RESPONSE_FILE" -w '%{http_code}' \
    -X POST "${BASE_URL}/sws/go/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"${ETENDO_TEST_EMAIL}\",\"password\":\"${ETENDO_TEST_PASSWORD}\"}")"
  [[ "$login_status" == "200" ]] || {
    echo "ERROR: local Etendo login failed with HTTP $login_status" >&2
    cat "$LOGIN_RESPONSE_FILE" >&2
    exit 1
  }
  ETENDO_SESSION_TOKEN="$(sed -n 's/.*\"token\":\"\([^\"]*\)\".*/\1/p' "$LOGIN_RESPONSE_FILE")"
  [[ -n "$ETENDO_SESSION_TOKEN" ]] || {
    echo "ERROR: local login response did not contain a session token" >&2
    exit 1
  }
  export ETENDO_SESSION_TOKEN
fi

[[ "$ETGO_CHECKOUT_SECRET_KEY" == sk_test_* ]] || {
  echo "ERROR: refusing to run with a non-Test-Mode Stripe key" >&2; exit 1;
}
[[ "$ETGO_CHECKOUT_PRICE_ID" == price_* ]] || {
  echo "ERROR: ETGO_CHECKOUT_PRICE_ID must be a Stripe price_... identifier" >&2; exit 1;
}

FORWARD_URL="${BASE_URL}${WEBHOOK_PATH}"
LISTENER_LOG="${TMPDIR:-/tmp}/stripe-local-listen.$$.log"
RESPONSE_FILE="${TMPDIR:-/tmp}/stripe-local-response.$$.json"
LISTENER_PID=""
cleanup() {
  [[ -n "$LISTENER_PID" ]] && kill "$LISTENER_PID" 2>/dev/null || true
  [[ -n "$LISTENER_PID" ]] && wait "$LISTENER_PID" 2>/dev/null || true
  rm -f "$LISTENER_LOG" "$RESPONSE_FILE" "$LOGIN_RESPONSE_FILE"
}
trap cleanup EXIT INT TERM

echo "==> Starting Stripe listener -> $FORWARD_URL"
stripe listen --forward-to "$FORWARD_URL" >"$LISTENER_LOG" 2>&1 &
LISTENER_PID=$!
for _ in {1..30}; do
  grep -Eq "Ready.*whsec_[A-Za-z0-9]+" "$LISTENER_LOG" && break
  kill -0 "$LISTENER_PID" 2>/dev/null || { cat "$LISTENER_LOG" >&2; exit 1; }
  sleep 1
done
grep -Eq "Ready.*whsec_[A-Za-z0-9]+" "$LISTENER_LOG" || {
  echo "ERROR: Stripe listener did not become ready" >&2; cat "$LISTENER_LOG" >&2; exit 1;
}
WEBHOOK_SECRET="$(sed -n 's/.*\(whsec_[A-Za-z0-9]*\).*/\1/p' "$LISTENER_LOG" | head -n 1)"
export ETGO_CHECKOUT_WEBHOOK_SECRET="$WEBHOOK_SECRET"

echo "==> Creating hosted Checkout Session"
HTTP_STATUS="$(curl -sS -o "$RESPONSE_FILE" -w '%{http_code}' \
  -X POST "${BASE_URL}${CHECKOUT_PATH}" \
  -H "Authorization: Bearer ${ETENDO_SESSION_TOKEN}" \
  -H 'Content-Type: application/json' \
  -H 'Origin: http://localhost:5173' \
  -d "{\"clientName\":\"${CLIENT_NAME}\",\"language\":\"en_US\",\"countryCode\":\"AR\"}")"
cat "$RESPONSE_FILE"; echo
if [[ "$HTTP_STATUS" == "503" ]] && grep -q 'CHECKOUT_NOT_CONFIGURED' "$RESPONSE_FILE"; then
  echo "ERROR: Etendo is running without the Stripe variables." >&2
  echo "Restart the backend from a shell that sourced ${ENV_FILE}, then rerun make test-stripe-local." >&2
  exit 1
fi
[[ "$HTTP_STATUS" == 2* ]] || {
  echo "ERROR: Checkout Session endpoint returned HTTP $HTTP_STATUS" >&2; exit 1;
}
grep -q 'checkoutUrl' "$RESPONSE_FILE" && grep -q 'requestId' "$RESPONSE_FILE" || {
  echo "ERROR: response did not contain checkoutUrl and requestId" >&2; exit 1;
}
echo "PASS: hosted Checkout Session created without browser card data"
echo "INFO: open checkoutUrl from the response to exercise Stripe Test Mode cards"
