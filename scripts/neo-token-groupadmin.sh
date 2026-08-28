#!/usr/bin/env bash
# Generate a JWT token for F&B International Group Admin
# Role: F&B International Group Admin | Org: F&B US, Inc. | Warehouse: US West Coast
# Usage: ./scripts/neo-token-groupadmin.sh
#   or:  TOKEN=$(./scripts/neo-token-groupadmin.sh)
# Env vars: ETENDO_URL, ETENDO_USER, ETENDO_PASSWORD

set -euo pipefail

BASE_URL="${ETENDO_URL:-http://localhost:8080/etendo}"
USERNAME="${ETENDO_USER:-admin}"
PASSWORD="${ETENDO_PASSWORD:-admin}"

ROLE_ID="42D0EEB1C66F497A90DD526DC597E6F0"          # F&B International Group Admin
ORG_ID="2E60544D37534C0B89E765FE29BC0B43"            # F&B US, Inc.
WAREHOUSE_ID="4D45FE4C515041709047F51D139A21AC"      # US West Coast

parse_token() {
  python3 -c "
import json, sys
data = json.loads(sys.stdin.buffer.read().decode('utf-8','replace'))
if data.get('status') == 'error':
    print('ERROR: ' + data.get('message','unknown'), file=sys.stderr)
    sys.exit(1)
print(data['token'])
"
}

# Single login with username, password, role, org, and warehouse
RESPONSE=$(/usr/bin/curl -s --connect-timeout 5 -X POST "$BASE_URL/sws/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\",\"role\":\"$ROLE_ID\",\"organization\":\"$ORG_ID\",\"warehouse\":\"$WAREHOUSE_ID\"}" 2>/dev/null) || {
  echo "ERROR: Cannot connect to Etendo at $BASE_URL" >&2
  exit 1
}

TOKEN=$(echo "$RESPONSE" | parse_token 2>/dev/null) || {
  echo "ERROR: Login failed. Response: $RESPONSE" >&2
  exit 1
}

echo "$TOKEN"
