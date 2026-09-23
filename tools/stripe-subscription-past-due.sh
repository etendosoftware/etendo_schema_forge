#!/usr/bin/env bash
set -Eeuo pipefail

# Drive a REAL Stripe Test Mode subscription past due, and back, through the
# real webhooks -- exercising the subscription lifecycle path documented in
# docs/stripe-local-testing.md §1 "Subscription lifecycle (ETP-5443)" end to
# end, instead of the hand-signed payloads in §4.
#
# Unlike tools/stripe-webhook-simulate.sh (which posts a synthetic payload
# directly to the webhook endpoint), this script performs real Stripe
# mutations -- attach a payment method, create+finalize+pay an invoice -- and
# relies on a running `stripe listen` to forward the resulting real events to
# the local backend. Both `fail` and `recover` mutate the Stripe Test Mode
# account. `status` is read-only.
#
# Usage:
#   tools/stripe-subscription-past-due.sh [fail|recover|status] <id> [options]
#
# <id> is either an etgo_checkout_request_id or an etgo_billing_event_id
# (case-insensitive). A billing event id is resolved to its
# etgo_checkout_request_id first; either way the checkout request row
# supplies stripe_subscription_id, stripe_customer_id, created_client_id and
# client_name.
#
# Subcommands:
#   fail <id> [--amount CENTS]   (default when the subcommand is omitted)
#       Attaches pm_card_chargeCustomerFail as the subscription's default
#       payment method, creates+finalizes+pays a manual invoice against the
#       subscription (the pay is EXPECTED to be declined), then polls the DB
#       for the invoice.payment_failed billing event and the PAST_DUE
#       projection. Saves recovery state to a file under $TMPDIR for `recover`.
#       --amount overrides the invoice item amount (cents); default is the
#       subscription price's own unit_amount.
#
#   recover <id>
#       Restores the previous default payment method (or attaches
#       pm_card_visa if none was recorded), pays the SAME invoice `fail` left
#       unpaid (expected to succeed this time), then polls the DB for the
#       invoice.paid billing event and the CURRENT projection with the due
#       date cleared. Requires a state file saved by a prior `fail <id>` run.
#
#   status <id>
#       Read-only. Prints the resolved ids, the live Stripe subscription
#       detail, and the stored AD_Preference lifecycle values.
#
#   -h, --help
#
# Requires: stripe CLI (test mode), psql, and jq or python3.
# A `stripe listen --forward-to <base>/sws/go/checkout/webhook` must be
# running for the webhooks to reach the backend -- the script warns (does
# not block) when it cannot detect one.
#
# Env:
#   STRIPE_ETENDO_ROOT   Etendo root containing gradle.properties.
#                        Default: <repo root>/etendo_core
#                        NOTE: deliberately NOT named ETENDO_ROOT -- the
#                        Makefile does a bare `export` of ETENDO_ROOT (default
#                        "..", a legacy/sibling checkout with a DIFFERENT DB
#                        on a different port), which would silently point this
#                        script at the wrong Etendo instance under `make`.
#   ENV_FILE             Sourced if present. Default: <repo root>/.env

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env}"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

usage() {
  sed -n '4,52p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

log() {
  echo "==> $*"
}

for command_name in stripe psql; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "ERROR: required command not found: $command_name" >&2
    exit 1
  }
done

JSON_TOOL=""
if command -v jq >/dev/null 2>&1; then
  JSON_TOOL="jq"
elif command -v python3 >/dev/null 2>&1; then
  JSON_TOOL="python3"
else
  echo "ERROR: need jq or python3 to parse Stripe JSON responses." >&2
  exit 1
fi

# json_path <json> <dotted.path> -- numeric segments index arrays, others
# index object keys. Missing keys, null values and type mismatches all
# resolve to an empty string rather than aborting or printing "null".
# Booleans are normalized to the lowercase "true"/"false" JSON spelling on
# both backends (Python's default str(bool) is "True"/"False").
#
# ALWAYS returns exit 0, even when $json itself fails to parse (e.g. a CLI
# banner mixed into stdout) -- under `set -e`, a non-zero return here would
# abort the whole script the same way the un-guarded `stripe_call` capture
# used to (see the note above stripe_call). Never remove the `|| echo ""`.
json_path() {
  local json="$1" path="$2"
  if [[ "$JSON_TOOL" == "jq" ]]; then
    local filter="." part
    while IFS= read -r part; do
      [[ -n "$part" ]] || continue
      if [[ "$part" =~ ^[0-9]+$ ]]; then
        filter="${filter}[${part}]"
      else
        filter="${filter}[\"${part}\"]"
      fi
    done < <(tr '.' '\n' <<<"$path")
    printf '%s' "$json" | jq -r "try ((${filter}) // \"\") catch \"\"" 2>/dev/null || echo ""
  else
    printf '%s' "$json" | python3 -c '
import json, sys
path = sys.argv[1].split(".")
try:
    data = json.load(sys.stdin)
except Exception:
    print("")
    raise SystemExit
for p in path:
    try:
        data = data[int(p)] if isinstance(data, list) else data[p]
    except Exception:
        data = None
        break
if data is None:
    print("")
elif isinstance(data, bool):
    print("true" if data else "false")
else:
    print(data)
' "$path" 2>/dev/null || echo ""
  fi
}

# find_pending_invoice_item_json <invoiceitems-list-json> <description>
# Returns the first item whose `description` matches, as a compact JSON
# object (or "{}" if none). Read the result with json_path (id/invoice/
# amount/currency). Same "never fail" guarantee as json_path.
find_pending_invoice_item_json() {
  local list_json="$1" description="$2"
  if [[ "$JSON_TOOL" == "jq" ]]; then
    printf '%s' "$list_json" \
      | jq -c --arg d "$description" \
          '(((.data // []) | map(select(.description == $d)) | .[0]) // {})' \
          2>/dev/null \
      || echo "{}"
  else
    printf '%s' "$list_json" | python3 -c '
import json, sys
desc = sys.argv[1]
try:
    data = json.load(sys.stdin)
except Exception:
    print("{}")
    raise SystemExit
for item in data.get("data", []):
    if item.get("description") == desc:
        print(json.dumps(item))
        break
else:
    print("{}")
' "$description" 2>/dev/null || echo "{}"
  fi
}

epoch_to_iso() {
  local epoch="$1"
  [[ -n "$epoch" ]] || { echo ""; return; }
  date -u -r "$epoch" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
    || date -u -d "@${epoch}" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
    || echo "$epoch"
}

if [[ -n "${STRIPE_API_KEY:-}" && "$STRIPE_API_KEY" == sk_live_* ]]; then
  echo "ERROR: refusing to run with a live Stripe key (STRIPE_API_KEY starts with sk_live_)." >&2
  exit 1
fi

# stripe_call [--allow-error] <stripe args...>
# Runs the Stripe CLI and aborts the whole script on any failure: a
# transport/CLI-level error (non-zero exit), a Stripe API error in the JSON
# body (the CLI itself exits 0 for these -- verified empirically against CLI
# 1.45.1), or a livemode:true object coming back from a "test mode" key. Pass
# --allow-error for the one call in this script that is allowed to fail
# (the deliberately-declined invoice payment); the caller then inspects
# STRIPE_ERROR_TYPE/_CODE/_MESSAGE itself.
#
# CAUTION (bug fixed 2026-09-23): `STRIPE_OUT="$(stripe ... 2>"$err_file")"`
# on its own, under `set -e`, aborts the WHOLE SCRIPT the instant `stripe`
# returns non-zero -- the assignment's exit status IS the command
# substitution's exit status, so the very next line (capturing $?) never
# runs, and the "ERROR: stripe ... failed" message below never prints. The
# `|| exit_code=$?` is load-bearing: it is what lets the failure be handled
# here instead of dying silently one line too early. Do not remove it.
STRIPE_OUT=""
STRIPE_ERR=""
STRIPE_BANNER=""
STRIPE_ERROR_TYPE=""
STRIPE_ERROR_CODE=""
STRIPE_ERROR_MESSAGE=""
stripe_call() {
  local allow_error=0
  if [[ "${1:-}" == "--allow-error" ]]; then
    allow_error=1
    shift
  fi
  local err_file exit_code=0
  err_file="$(mktemp)"
  STRIPE_OUT="$(stripe "$@" 2>"$err_file")" || exit_code=$?
  STRIPE_ERR="$(cat "$err_file")"
  rm -f "$err_file"

  if [[ $exit_code -ne 0 ]]; then
    echo "ERROR: stripe $* failed (exit $exit_code):" >&2
    echo "$STRIPE_ERR" >&2
    exit 1
  fi

  # Some mutating commands (observed on invoiceitems delete --confirm, and
  # potentially others) print a confirmation banner ("This command will be
  # executed on the account with the following details: > Mode: Test ...")
  # to STDOUT before the JSON body. Strip everything before the first '{' so
  # every json_path lookup below sees valid JSON; the banner text itself is
  # kept in $STRIPE_BANNER as an extra live-mode signal (the JSON body's own
  # `livemode` field, checked below, is still the primary guard).
  STRIPE_BANNER=""
  if [[ "$STRIPE_OUT" == *"{"* ]]; then
    STRIPE_BANNER="${STRIPE_OUT%%\{*}"
    STRIPE_OUT="{${STRIPE_OUT#*\{}"
  fi
  if [[ "$STRIPE_BANNER" == *"Mode: Live"* ]]; then
    echo "ERROR: refusing to continue -- the stripe CLI's own confirmation banner reports Mode: Live." >&2
    echo "This script only operates in Stripe TEST MODE." >&2
    exit 1
  fi

  STRIPE_ERROR_TYPE="$(json_path "$STRIPE_OUT" "error.type")"
  STRIPE_ERROR_CODE="$(json_path "$STRIPE_OUT" "error.code")"
  STRIPE_ERROR_MESSAGE="$(json_path "$STRIPE_OUT" "error.message")"
  if [[ -n "$STRIPE_ERROR_TYPE" && "$allow_error" != "1" ]]; then
    echo "ERROR: stripe $* returned an API error (type=$STRIPE_ERROR_TYPE code=$STRIPE_ERROR_CODE):" >&2
    echo "  $STRIPE_ERROR_MESSAGE" >&2
    exit 1
  fi

  local livemode
  livemode="$(json_path "$STRIPE_OUT" "livemode")"
  if [[ "$livemode" == "true" ]]; then
    echo "ERROR: refusing to continue -- 'stripe $*' returned a LIVE MODE object." >&2
    echo "This script only operates in Stripe TEST MODE. Check STRIPE_API_KEY / 'stripe config --list'." >&2
    exit 1
  fi
}

# --- DB access: mirrors scripts/seed-go-food-products.sh (read_property +
# PGPASSWORD psql), never prints the password. Uses STRIPE_ETENDO_ROOT, not
# ETENDO_ROOT -- see the note above the Env section. ---
STRIPE_ETENDO_ROOT="${STRIPE_ETENDO_ROOT:-${ROOT_DIR}/etendo_core}"
GRADLE_PROPERTIES="${STRIPE_ETENDO_ROOT}/gradle.properties"
[[ -f "$GRADLE_PROPERTIES" ]] || {
  echo "ERROR: gradle.properties not found at $GRADLE_PROPERTIES (set STRIPE_ETENDO_ROOT)." >&2
  exit 1
}

read_property() {
  awk -F= -v key="$1" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "$GRADLE_PROPERTIES"
}

DB_PORT="$(read_property bbdd.port)"
DB_NAME="$(read_property bbdd.sid)"
DB_USER="$(read_property bbdd.user)"
DB_PASSWORD="$(read_property bbdd.password)"
for required in DB_PORT DB_NAME DB_USER; do
  [[ -n "${!required}" ]] || {
    echo "ERROR: could not read $required from $GRADLE_PROPERTIES." >&2
    exit 1
  }
done

run_sql() {
  PGPASSWORD="$DB_PASSWORD" psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" "$@"
}

state_file_for() {
  echo "${TMPDIR:-/tmp}/etp5443-past-due-$1.env"
}

check_stripe_listen_running() {
  if pgrep -f "stripe listen" >/dev/null 2>&1; then
    log "Detected a running 'stripe listen' process."
  else
    echo "WARN: no 'stripe listen' process detected -- webhooks will not reach the backend." >&2
    echo "      Start it first: stripe listen --forward-to localhost:8080/etendo/sws/go/checkout/webhook" >&2
  fi
}

# Resolves <id> (billing event id or checkout request id, case-insensitive)
# into CHECKOUT_REQUEST_ID, REQUEST_ID, CHECKOUT_STATUS, STRIPE_SUBSCRIPTION_ID,
# STRIPE_CUSTOMER_ID, CREATED_CLIENT_ID, CLIENT_NAME, BILLING_EVENT_ID.
resolve_ids() {
  local input_id="$1"
  local lookup_id
  lookup_id="$(printf '%s' "$input_id" | tr '[:lower:]' '[:upper:]')"

  BILLING_EVENT_ID=""
  local billing_row
  billing_row="$(run_sql -At -F'|' -c \
    "select etgo_billing_event_id, etgo_checkout_request_id, event_type
       from etgo_billing_event
      where etgo_billing_event_id = '${lookup_id}';")"
  if [[ -n "$billing_row" ]]; then
    local billing_event_id linked_checkout_id billing_event_type
    IFS='|' read -r billing_event_id linked_checkout_id billing_event_type <<<"$billing_row"
    BILLING_EVENT_ID="$billing_event_id"
    if [[ -z "$linked_checkout_id" ]]; then
      echo "ERROR: billing event $BILLING_EVENT_ID (type $billing_event_type) has no linked" >&2
      echo "etgo_checkout_request_id. Lifecycle events never carry this link (see" >&2
      echo "docs/stripe-local-testing.md, 'Correlation is different from the checkout path')." >&2
      echo "Pass the etgo_checkout_request_id directly instead." >&2
      exit 1
    fi
    lookup_id="$linked_checkout_id"
  fi

  local checkout_row
  checkout_row="$(run_sql -At -F'|' -c \
    "select etgo_checkout_request_id, request_id, checkout_status,
            stripe_subscription_id, stripe_customer_id, created_client_id, client_name
       from etgo_checkout_request
      where etgo_checkout_request_id = '${lookup_id}';")"
  if [[ -z "$checkout_row" ]]; then
    echo "ERROR: no etgo_checkout_request row found for '${input_id}'" >&2
    echo "(looked up both as a billing event id and as a checkout request id)." >&2
    exit 1
  fi

  IFS='|' read -r CHECKOUT_REQUEST_ID REQUEST_ID CHECKOUT_STATUS \
    STRIPE_SUBSCRIPTION_ID STRIPE_CUSTOMER_ID CREATED_CLIENT_ID CLIENT_NAME <<<"$checkout_row"

  [[ -n "$STRIPE_SUBSCRIPTION_ID" ]] || {
    echo "ERROR: checkout request $CHECKOUT_REQUEST_ID has no stripe_subscription_id." >&2
    exit 1
  }
  [[ -n "$STRIPE_CUSTOMER_ID" ]] || {
    echo "ERROR: checkout request $CHECKOUT_REQUEST_ID has no stripe_customer_id." >&2
    exit 1
  }
  [[ -n "$CREATED_CLIENT_ID" ]] || {
    echo "ERROR: checkout request $CHECKOUT_REQUEST_ID has no created_client_id (never provisioned)." >&2
    exit 1
  }
}

get_preference_value() {
  local attribute="$1"
  run_sql -At -c \
    "select value from ad_preference
      where ad_client_id = '${CREATED_CLIENT_ID}' and attribute = '${attribute}' and isactive = 'Y';"
}

# poll_preference_value <attribute> <expected> [max_wait_seconds]
# Echoes the last-observed value regardless of outcome; returns 0 once it
# matches <expected>, 1 if <max_wait_seconds> elapses first.
poll_preference_value() {
  local attribute="$1" expected="$2" max_wait="${3:-30}"
  local waited=0 val
  while true; do
    val="$(get_preference_value "$attribute")"
    if [[ "$val" == "$expected" ]]; then
      echo "$val"
      return 0
    fi
    if (( waited >= max_wait )); then
      echo "$val"
      return 1
    fi
    sleep 2
    waited=$((waited + 2))
  done
}

# poll_billing_event <event_type> <needle> [max_wait_seconds]
# <needle> is matched against payload_summary (the invoice/subscription id
# this run created -- lifecycle events never carry etgo_checkout_request_id,
# see docs/stripe-local-testing.md, so payload_summary is the only handle).
# Prints "event_id|event_result|failure_reason|received_at" on success.
poll_billing_event() {
  local event_type="$1" needle="$2" max_wait="${3:-30}"
  local waited=0 row
  while true; do
    row="$(run_sql -At -F'|' -c \
      "select etgo_billing_event_id, event_result, failure_reason, received_at
         from etgo_billing_event
        where event_type = '${event_type}' and payload_summary like '%${needle}%'
        order by received_at desc
        limit 1;")"
    if [[ -n "$row" ]]; then
      echo "$row"
      return 0
    fi
    if (( waited >= max_wait )); then
      return 1
    fi
    sleep 2
    waited=$((waited + 2))
  done
}

print_resolved_ids() {
  echo "Checkout request id    : $CHECKOUT_REQUEST_ID"
  [[ -n "$BILLING_EVENT_ID" ]] && echo "Billing event id        : $BILLING_EVENT_ID"
  echo "Request id (internal)  : $REQUEST_ID"
  echo "Checkout status         : $CHECKOUT_STATUS"
  echo "Created client           : $CLIENT_NAME ($CREATED_CLIENT_ID)"
  echo "Stripe subscription      : $STRIPE_SUBSCRIPTION_ID"
  echo "Stripe customer          : $STRIPE_CUSTOMER_ID"
}

print_lifecycle_projection() {
  echo "Stored lifecycle projection (AD_Preference, client $CREATED_CLIENT_ID):"
  echo "  ETGO_SubscriptionStatus  : $(get_preference_value ETGO_SubscriptionStatus)"
  echo "  ETGO_SubscriptionDueAt   : $(get_preference_value ETGO_SubscriptionDueAt)"
  echo "  ETGO_SubscriptionEventAt : $(get_preference_value ETGO_SubscriptionEventAt)"
}

cmd_status() {
  local id="$1"
  resolve_ids "$id"
  print_resolved_ids
  echo

  log "Retrieving live subscription detail from Stripe"
  stripe_call subscriptions retrieve "$STRIPE_SUBSCRIPTION_ID" --expand latest_invoice
  local sub_json="$STRIPE_OUT"

  local status default_pm latest_invoice period_start period_end
  status="$(json_path "$sub_json" "status")"
  default_pm="$(json_path "$sub_json" "default_payment_method")"
  latest_invoice="$(json_path "$sub_json" "latest_invoice.id")"
  [[ -n "$latest_invoice" ]] || latest_invoice="$(json_path "$sub_json" "latest_invoice")"
  period_start="$(json_path "$sub_json" "current_period_start")"
  [[ -n "$period_start" ]] || period_start="$(json_path "$sub_json" "items.data.0.current_period_start")"
  period_end="$(json_path "$sub_json" "current_period_end")"
  [[ -n "$period_end" ]] || period_end="$(json_path "$sub_json" "items.data.0.current_period_end")"

  echo "Stripe status            : $status"
  echo "Default payment method   : ${default_pm:-<none>}"
  echo "Latest invoice           : ${latest_invoice:-<none>}"
  echo "Current period           : $(epoch_to_iso "$period_start") -> $(epoch_to_iso "$period_end")"
  echo
  print_lifecycle_projection
}

# save_fail_state <state_file>
# Writes whatever of FAILING_PAYMENT_METHOD_ID / PREVIOUS_DEFAULT_PAYMENT_METHOD
# / INVOICE_ITEM_ID / INVOICE_ID is known so far. Called after EVERY mutating
# step in cmd_fail (not just at the end) so a run interrupted partway through
# -- a bad flag, a network blip, Ctrl-C -- leaves an accurate, resumable
# record instead of an all-or-nothing file. This is what makes a rerun able
# to tell "already attached the failing card" from "still on the original
# one" even though Stripe's own PaymentMethod object carries no such marker
# (attach pm_card_chargeCustomerFail vs. attach pm_card_visa produce
# objects that are byte-identical apart from `id`/`created` -- verified
# empirically; the behavior is keyed server-side by id, not visible here).
save_fail_state() {
  local state_file="$1"
  cat > "$state_file" <<EOF
CHECKOUT_REQUEST_ID=$CHECKOUT_REQUEST_ID
CREATED_CLIENT_ID=$CREATED_CLIENT_ID
CLIENT_NAME=$CLIENT_NAME
STRIPE_SUBSCRIPTION_ID=$STRIPE_SUBSCRIPTION_ID
STRIPE_CUSTOMER_ID=$STRIPE_CUSTOMER_ID
FAILING_PAYMENT_METHOD_ID=${FAILING_PAYMENT_METHOD_ID:-}
PREVIOUS_DEFAULT_PAYMENT_METHOD=${PREVIOUS_DEFAULT_PAYMENT_METHOD:-}
INVOICE_ID=${INVOICE_ID:-}
INVOICE_ITEM_ID=${INVOICE_ITEM_ID:-}
SAVED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF
}

cmd_fail() {
  local id="$1"; shift || true
  local amount_override=""
  while (($#)); do
    case "$1" in
      --amount) amount_override="${2:?"--amount requires a value"}"; shift 2 ;;
      *) echo "ERROR: unknown option for 'fail': $1" >&2; exit 1 ;;
    esac
  done

  resolve_ids "$id"
  check_stripe_listen_running
  print_resolved_ids
  echo

  # Idempotent/resumable: load whatever a previous (possibly interrupted)
  # `fail` run already recorded, so this run does not re-attach a second
  # failing payment method, create a duplicate invoice item, or -- worst of
  # all -- capture the ALREADY-failing card as "the previous default".
  local state_file
  state_file="$(state_file_for "$STRIPE_SUBSCRIPTION_ID")"
  FAILING_PAYMENT_METHOD_ID=""
  PREVIOUS_DEFAULT_PAYMENT_METHOD=""
  INVOICE_ID=""
  INVOICE_ITEM_ID=""
  if [[ -f "$state_file" ]]; then
    log "Found existing state at $state_file -- resuming instead of starting over"
    # shellcheck disable=SC1090
    source "$state_file"
  fi

  # Hygiene, not resume logic: a genuinely PENDING (uninvoiced) item with our
  # description is always a leftover from a run that died before attaching
  # it to an invoice -- never a step of the current flow, since the item is
  # now created directly ON an invoice (see below) rather than left pending.
  # Deleting it here is safer than reusing it: a pending item with no
  # subscription link would otherwise get silently swept into the tenant's
  # NEXT REAL renewal invoice instead of our throwaway test invoice.
  log "Checking for stray PENDING invoice items (customer $STRIPE_CUSTOMER_ID, description 'ETP-5443 past-due test')"
  stripe_call invoiceitems list --customer "$STRIPE_CUSTOMER_ID" --pending=true --limit 100
  local stray_item_json stray_item_id
  stray_item_json="$(find_pending_invoice_item_json "$STRIPE_OUT" "ETP-5443 past-due test")"
  stray_item_id="$(json_path "$stray_item_json" "id")"
  if [[ -n "$stray_item_id" ]]; then
    log "Deleting stray pending invoice item $stray_item_id"
    stripe_call invoiceitems delete "$stray_item_id" --confirm
  fi

  log "Retrieving subscription (current default payment method + price)"
  stripe_call subscriptions retrieve "$STRIPE_SUBSCRIPTION_ID"
  local sub_json="$STRIPE_OUT"
  local current_default_pm currency unit_amount amount
  current_default_pm="$(json_path "$sub_json" "default_payment_method")"
  currency="$(json_path "$sub_json" "items.data.0.price.currency")"
  unit_amount="$(json_path "$sub_json" "items.data.0.price.unit_amount")"
  amount="${amount_override:-$unit_amount}"
  [[ -n "$currency" && -n "$amount" ]] || {
    echo "ERROR: could not determine currency/amount from the subscription's price. Pass --amount." >&2
    exit 1
  }

  if [[ -z "$PREVIOUS_DEFAULT_PAYMENT_METHOD" ]]; then
    PREVIOUS_DEFAULT_PAYMENT_METHOD="$current_default_pm"
    log "Recording the ORIGINAL default payment method: ${PREVIOUS_DEFAULT_PAYMENT_METHOD:-<none>}"
    save_fail_state "$state_file"
  else
    log "Original default payment method already on file: $PREVIOUS_DEFAULT_PAYMENT_METHOD"
  fi
  log "Price: $amount $currency"

  if [[ -n "$FAILING_PAYMENT_METHOD_ID" ]]; then
    log "Failing payment method already on file: $FAILING_PAYMENT_METHOD_ID"
    if [[ "$current_default_pm" != "$FAILING_PAYMENT_METHOD_ID" ]]; then
      log "Re-asserting it as the subscription's default (currently $current_default_pm)"
      stripe_call subscriptions update "$STRIPE_SUBSCRIPTION_ID" --default-payment-method "$FAILING_PAYMENT_METHOD_ID"
    fi
  else
    log "Attaching pm_card_chargeCustomerFail to $STRIPE_CUSTOMER_ID"
    stripe_call payment_methods attach pm_card_chargeCustomerFail --customer "$STRIPE_CUSTOMER_ID" --confirm
    FAILING_PAYMENT_METHOD_ID="$(json_path "$STRIPE_OUT" "id")"
    [[ -n "$FAILING_PAYMENT_METHOD_ID" ]] || {
      echo "ERROR: attach did not return a payment method id:" >&2
      echo "$STRIPE_OUT" >&2
      exit 1
    }
    log "New failing payment method: $FAILING_PAYMENT_METHOD_ID"
    save_fail_state "$state_file"

    log "Setting it as the subscription's default payment method"
    stripe_call subscriptions update "$STRIPE_SUBSCRIPTION_ID" --default-payment-method "$FAILING_PAYMENT_METHOD_ID"
  fi

  # Invoice FIRST, then the item goes directly onto it via --invoice.
  # `invoices create --subscription` REJECTS `--pending-invoice-items-behavior`
  # ("You may only specify one of these parameters: pending_invoice_items_behavior,
  # subscription" -- confirmed against the real API) so this can't be one call
  # with pending items swept in; and a genuinely pending (unattached) item
  # would risk being swept into the tenant's NEXT REAL renewal invoice instead
  # of this throwaway one (see the cleanup step above) -- so the item is
  # created with --invoice, never left pending, not even briefly.
  if [[ -z "$INVOICE_ID" ]]; then
    log "Creating invoice (draft)"
    # NOTE: --auto-advance is a true|false flag. This CLI's boolean flags do
    # NOT take a space-separated value (Cobra/pflag treats a bare
    # `--auto-advance` as already satisfied and the following token as a
    # stray positional argument -- confirmed empirically: `--auto-advance
    # false` fails with "requires exactly 0 positional arguments" via
    # --dry-run, `--auto-advance=false` works). Always use `=` for a boolean
    # flag on this CLI.
    stripe_call invoices create --customer "$STRIPE_CUSTOMER_ID" --subscription "$STRIPE_SUBSCRIPTION_ID" \
      --collection-method charge_automatically --auto-advance=false
    INVOICE_ID="$(json_path "$STRIPE_OUT" "id")"
    [[ -n "$INVOICE_ID" ]] || {
      echo "ERROR: invoice create did not return an id:" >&2
      echo "$STRIPE_OUT" >&2
      exit 1
    }
    log "Invoice: $INVOICE_ID"
    save_fail_state "$state_file"
  else
    log "Invoice already on file: $INVOICE_ID"
  fi

  if [[ -n "$INVOICE_ITEM_ID" ]]; then
    log "Invoice item already on file: $INVOICE_ITEM_ID"
  else
    log "Creating invoice item ($amount $currency) directly on invoice $INVOICE_ID"
    stripe_call invoiceitems create --customer "$STRIPE_CUSTOMER_ID" --invoice "$INVOICE_ID" \
      --amount "$amount" --currency "$currency" --description "ETP-5443 past-due test"
    INVOICE_ITEM_ID="$(json_path "$STRIPE_OUT" "id")"
    [[ -n "$INVOICE_ITEM_ID" ]] || {
      echo "ERROR: invoice item create did not return an id:" >&2
      echo "$STRIPE_OUT" >&2
      exit 1
    }
    save_fail_state "$state_file"
  fi

  log "Retrieving invoice $INVOICE_ID to resume at the right step"
  stripe_call invoices retrieve "$INVOICE_ID"
  local invoice_status
  invoice_status="$(json_path "$STRIPE_OUT" "status")"
  if [[ "$invoice_status" == "paid" ]]; then
    echo "ERROR: invoice $INVOICE_ID is already paid, but a decline was expected from this flow." >&2
    echo "The subscription may not be past due. Check the Stripe dashboard / run 'status $id'." >&2
    exit 1
  fi
  if [[ "$invoice_status" == "draft" ]]; then
    log "Finalizing invoice"
    stripe_call invoices finalize_invoice "$INVOICE_ID"
  else
    log "Invoice already finalized (status=$invoice_status)"
  fi

  log "Paying invoice (EXPECTED to be declined by pm_card_chargeCustomerFail)"
  # Explicit --payment-method rather than relying on the subscription's
  # default falling through: the invoice's own default_payment_method and
  # the customer's invoice_settings.default_payment_method are both null
  # (verified against the real invoice/customer), so `pay` would otherwise
  # depend on an unstated fallback chain. Be explicit about which card.
  stripe_call --allow-error invoices pay "$INVOICE_ID" --payment-method "$FAILING_PAYMENT_METHOD_ID"
  if [[ -z "$STRIPE_ERROR_TYPE" ]]; then
    echo "ERROR: the invoice was paid successfully, but a decline was expected from" >&2
    echo "pm_card_chargeCustomerFail. The subscription will NOT go past due; nothing to poll for." >&2
    exit 1
  fi
  if [[ "$STRIPE_ERROR_TYPE" != "card_error" ]]; then
    echo "ERROR: 'stripe invoices pay' failed with an unexpected error" \
      "(type=$STRIPE_ERROR_TYPE code=$STRIPE_ERROR_CODE):" >&2
    echo "  $STRIPE_ERROR_MESSAGE" >&2
    exit 1
  fi
  log "Payment declined as expected (code=$STRIPE_ERROR_CODE)"
  save_fail_state "$state_file"
  log "Saved recovery state to $state_file"

  log "Polling for the invoice.payment_failed billing event and the PAST_DUE projection (up to 30s)"
  local event_row ev_result=""
  if event_row="$(poll_billing_event invoice.payment_failed "$INVOICE_ID" 30)"; then
    local ev_id ev_reason ev_received
    IFS='|' read -r ev_id ev_result ev_reason ev_received <<<"$event_row"
    log "billing event $ev_id: event_result=$ev_result failure_reason=${ev_reason:-<none>} received_at=$ev_received"
  else
    echo "WARN: no invoice.payment_failed billing event found for invoice $INVOICE_ID within 30s." >&2
    echo "      Is 'stripe listen --forward-to <base>/sws/go/checkout/webhook' running and reachable?" >&2
  fi

  local status_val due_val
  status_val="$(poll_preference_value ETGO_SubscriptionStatus PAST_DUE 30)" || true
  due_val="$(get_preference_value ETGO_SubscriptionDueAt)"

  echo
  echo "=================== RESULT ==================="
  echo "Checkout request              : $CHECKOUT_REQUEST_ID  ($CLIENT_NAME)"
  echo "Subscription                  : $STRIPE_SUBSCRIPTION_ID"
  echo "Invoice                       : $INVOICE_ID"
  echo "invoice.payment_failed event  : ${ev_result:-<not found>}"
  echo "ETGO_SubscriptionStatus       : ${status_val:-<not found>}"
  echo "ETGO_SubscriptionDueAt        : ${due_val:-<empty>}"
  if [[ "$ev_result" == "APPLIED" && "$status_val" == "PAST_DUE" && -n "$due_val" ]]; then
    echo "PASS: subscription lifecycle moved to PAST_DUE with a due date."
  else
    echo "FAIL: expected an APPLIED invoice.payment_failed event and" \
      "ETGO_SubscriptionStatus=PAST_DUE with a non-empty due date."
    echo "================================================"
    exit 1
  fi
  echo "================================================"
  echo "Next: tools/stripe-subscription-past-due.sh recover $id"
}

cmd_recover() {
  local id="$1"
  resolve_ids "$id"
  check_stripe_listen_running
  print_resolved_ids
  echo

  local state_file
  state_file="$(state_file_for "$STRIPE_SUBSCRIPTION_ID")"
  [[ -f "$state_file" ]] || {
    echo "ERROR: no saved state at $state_file." >&2
    echo "Run 'tools/stripe-subscription-past-due.sh fail $id' first." >&2
    exit 1
  }
  # shellcheck disable=SC1090
  source "$state_file"
  [[ -n "${INVOICE_ID:-}" ]] || {
    echo "ERROR: state file $state_file has no INVOICE_ID." >&2
    exit 1
  }

  local restore_pm
  if [[ -n "${PREVIOUS_DEFAULT_PAYMENT_METHOD:-}" ]]; then
    restore_pm="$PREVIOUS_DEFAULT_PAYMENT_METHOD"
    log "Restoring previous default payment method $restore_pm"
  else
    log "No previous default payment method was recorded; attaching pm_card_visa"
    stripe_call payment_methods attach pm_card_visa --customer "$STRIPE_CUSTOMER_ID" --confirm
    restore_pm="$(json_path "$STRIPE_OUT" "id")"
    [[ -n "$restore_pm" ]] || {
      echo "ERROR: attach did not return a payment method id:" >&2
      echo "$STRIPE_OUT" >&2
      exit 1
    }
    log "New payment method: $restore_pm"
  fi

  log "Setting $restore_pm as the subscription's default payment method"
  stripe_call subscriptions update "$STRIPE_SUBSCRIPTION_ID" --default-payment-method "$restore_pm"

  log "Paying invoice $INVOICE_ID (EXPECTED to succeed now)"
  # Explicit --payment-method for the same reason as in `fail`: the
  # invoice's own default_payment_method and the customer's
  # invoice_settings.default_payment_method are both null, so don't rely on
  # an unstated fallback -- name the restored card directly.
  stripe_call --allow-error invoices pay "$INVOICE_ID" --payment-method "$restore_pm"
  if [[ -n "$STRIPE_ERROR_TYPE" ]]; then
    echo "ERROR: the recovery payment was declined" \
      "(type=$STRIPE_ERROR_TYPE code=$STRIPE_ERROR_CODE):" >&2
    echo "  $STRIPE_ERROR_MESSAGE" >&2
    exit 1
  fi
  local paid_status
  paid_status="$(json_path "$STRIPE_OUT" "status")"
  log "Invoice $INVOICE_ID paid (status=$paid_status)"

  log "Polling for the invoice.paid billing event and the CURRENT projection (up to 30s)"
  local event_row ev_result=""
  if event_row="$(poll_billing_event invoice.paid "$INVOICE_ID" 30)"; then
    local ev_id ev_reason ev_received
    IFS='|' read -r ev_id ev_result ev_reason ev_received <<<"$event_row"
    log "billing event $ev_id: event_result=$ev_result failure_reason=${ev_reason:-<none>} received_at=$ev_received"
  else
    echo "WARN: no invoice.paid billing event found for invoice $INVOICE_ID within 30s." >&2
    echo "      Is 'stripe listen --forward-to <base>/sws/go/checkout/webhook' running and reachable?" >&2
  fi

  local status_val due_val
  status_val="$(poll_preference_value ETGO_SubscriptionStatus CURRENT 30)" || true
  due_val="$(get_preference_value ETGO_SubscriptionDueAt)"

  echo
  echo "=================== RESULT ==================="
  echo "Checkout request         : $CHECKOUT_REQUEST_ID  ($CLIENT_NAME)"
  echo "Subscription             : $STRIPE_SUBSCRIPTION_ID"
  echo "Invoice                  : $INVOICE_ID"
  echo "invoice.paid event       : ${ev_result:-<not found>}"
  echo "ETGO_SubscriptionStatus  : ${status_val:-<not found>}"
  echo "ETGO_SubscriptionDueAt   : ${due_val:-<empty>}"
  if [[ "$ev_result" == "APPLIED" && "$status_val" == "CURRENT" && -z "$due_val" ]]; then
    echo "PASS: subscription lifecycle recovered to CURRENT with the due date cleared."
    echo "================================================"
    rm -f "$state_file"
    log "Removed recovery state $state_file"
  else
    echo "FAIL: expected an APPLIED invoice.paid event and" \
      "ETGO_SubscriptionStatus=CURRENT with an empty due date."
    echo "================================================"
    exit 1
  fi
}

main() {
  local args=("$@")
  for arg in "${args[@]:-}"; do
    case "$arg" in
      -h|--help) usage; exit 0 ;;
    esac
  done

  local subcommand="fail"
  case "${1:-}" in
    fail|recover|status) subcommand="$1"; shift ;;
    "") echo "ERROR: missing <id>." >&2; usage; exit 1 ;;
    -*) echo "ERROR: unknown option: $1" >&2; usage; exit 1 ;;
    *) : ;; # subcommand omitted -- $1 is the id, defaults to 'fail'
  esac

  local id="${1:-}"
  [[ -n "$id" ]] || {
    echo "ERROR: missing <id> (etgo_checkout_request_id or etgo_billing_event_id)." >&2
    usage
    exit 1
  }
  shift || true

  case "$subcommand" in
    fail) cmd_fail "$id" "$@" ;;
    recover) cmd_recover "$id" ;;
    status) cmd_status "$id" ;;
  esac
}

main "$@"
