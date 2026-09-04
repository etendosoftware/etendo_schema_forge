#!/bin/bash
# Regression test for invalid parent IDs during new Sales Order line defaults.
#
# This is intentionally a network + runtime-log test. The defaults endpoint can
# return HTTP 200 while NeoCalloutService catches and logs the callout exception,
# so the response status alone cannot prove the regression is absent.
#
# Usage:
#   ETENDO_TEST_USER=goadmin \
#   ETENDO_TEST_PASSWORD='password' \
#   ./tests/test-sales-order-defaults-callouts.sh
#
# Optional context overrides:
#   ETENDO_TEST_ROLE_ID, ETENDO_TEST_ORG_ID, ETENDO_TEST_WH_ID,
#   ETENDO_TEST_SWS_URL, ETENDO_TEST_TOMCAT_CONTAINER,
#   ETENDO_TEST_PARENT_ID

set -euo pipefail

SWS_URL="${ETENDO_TEST_SWS_URL:-http://localhost:8080/etendo/sws}"
NEO_URL="$SWS_URL/neo"
LOGIN_USER="${ETENDO_TEST_USER:-admin}"
LOGIN_PASSWORD="${ETENDO_TEST_PASSWORD:-admin}"
ROLE_ID="${ETENDO_TEST_ROLE_ID:-42D0EEB1C66F497A90DD526DC597E6F0}"
ORG_ID="${ETENDO_TEST_ORG_ID:-7BABA5FF80494CAFA54DEBD22EC46F01}"
WH_ID="${ETENDO_TEST_WH_ID:-9CF98A18BC754B99998E421F91C5FE12}"
TOMCAT_CONTAINER="${ETENDO_TEST_TOMCAT_CONTAINER:-etendo_sf2-tomcat-1}"
PARENT_ID="${ETENDO_TEST_PARENT_ID:-new}"

if ! command -v docker >/dev/null 2>&1; then
  echo "FAIL: docker is required to inspect the Tomcat logs." >&2
  exit 1
fi

if ! docker inspect "$TOMCAT_CONTAINER" >/dev/null 2>&1; then
  echo "FAIL: Tomcat container '$TOMCAT_CONTAINER' was not found." >&2
  echo "Set ETENDO_TEST_TOMCAT_CONTAINER to the local container name." >&2
  exit 1
fi

LOGIN_RESPONSE=$(curl -sS -X POST "$SWS_URL/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$LOGIN_USER\",\"password\":\"$LOGIN_PASSWORD\",\"role\":\"$ROLE_ID\",\"organization\":\"$ORG_ID\",\"warehouse\":\"$WH_ID\"}")

AUTH_TOKEN=$(echo "$LOGIN_RESPONSE" | perl -ne 'print $1 if /"token"\s*:\s*"([^"]+)"/')
if [ -z "$AUTH_TOKEN" ]; then
  echo "FAIL: local login did not return a JWT." >&2
  echo "$LOGIN_RESPONSE" >&2
  exit 1
fi

LOG_LINE_BASELINE=$(docker logs "$TOMCAT_CONTAINER" 2>&1 | wc -l | tr -d ' ')
RESPONSE_FILE=$(mktemp)
trap 'rm -f "$RESPONSE_FILE"' EXIT

HTTP_STATUS=$(curl -sS -o "$RESPONSE_FILE" -w '%{http_code}' \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H 'Accept: application/json' \
  -H 'Accept-Language: es_ES' \
  "$NEO_URL/sales-order/lines/defaults?parentId=$PARENT_ID")

NEW_LOGS=$(docker logs "$TOMCAT_CONTAINER" 2>&1 | tail -n "+$((LOG_LINE_BASELINE + 1))")
FAILURES=0

if [ "$HTTP_STATUS" = "200" ]; then
  echo "PASS: defaults endpoint returned HTTP 200."
else
  echo "FAIL: defaults endpoint returned HTTP $HTTP_STATUS." >&2
  sed -n '1,20p' "$RESPONSE_FILE" >&2
  FAILURES=$((FAILURES + 1))
fi

assert_log_absent() {
  local label="$1"
  local pattern="$2"
  if grep -Fq "$pattern" <<< "$NEW_LOGS"; then
    echo "FAIL: $label" >&2
    FAILURES=$((FAILURES + 1))
  else
    echo "PASS: $label"
  fi
}

assert_log_absent "new pseudo-ID was not passed to the parent key" \
  "Parent key already set: inpcOrderId = new"
assert_log_absent "Openbravo ID filtering accepted no invalid new pseudo-ID" \
  "Input: new not accepted by filter"
assert_log_absent "SL_Order_Amt did not attempt to load a missing ID" \
  "Error executing callout: id to load is required for loading"

if [ "$FAILURES" -gt 0 ]; then
  echo ""
  echo "Captured callout diagnostics:" >&2
  echo "$NEW_LOGS" | grep -E \
    'NEO-CALLOUT|Input: new not accepted|Error executing callout: id to load is required' \
    | tail -40 >&2 || true
  exit 1
fi

echo "PASS: new Sales Order line defaults completed without hidden callout errors."
