# Transactional Email Security Runbook

This runbook covers operational controls for transactional email in Etendo Go. Use it during implementation reviews, incidents, provider rotation, and production support.

## Security Boundary

The email provider is a backend-only dependency.

Never place these values in frontend code, generated artifacts, browser-visible JSON, screenshots, or committed fixtures:

- provider endpoint API key
- provider signing secret
- sender mailbox credentials
- internal provider URLs that are not public product endpoints
- raw message body from support custom sends

Frontend code may call only Etendo Go contract endpoints such as:

```http
POST /sws/neo/email-contracts/{contractName}/send
```

## Provider Configuration

Store provider configuration in server-side configuration only.

Recommended variables:

| Variable | Purpose |
|----------|---------|
| `ETGO_EMAIL_PROVIDER_BASE_URL` | Provider/API Gateway base URL |
| `ETGO_EMAIL_PROVIDER_API_KEY` | Secret API key |
| `ETGO_EMAIL_PROVIDER_TIMEOUT_MS` | Provider call timeout |
| `ETGO_EMAIL_PROVIDER_ENABLED` | Adapter-level kill switch |
| `ETGO_EMAIL_SENDER_ADDRESS` | Owned sender identity |
| `ETGO_EMAIL_SENDER_NAME` | Display sender name |

Configuration must be loaded at runtime by the backend. It must not be exported into Vite variables or any `public/` asset.

## Secret Rotation

Rotate provider credentials when onboarding the service, after suspected exposure, and on the regular security schedule.

Procedure:

1. Create a new provider key in the provider console.
2. Add the new key to the server secret store.
3. Deploy/restart the backend so the adapter uses the new key.
4. Send a test through a low-risk contract in staging.
5. Send a production smoke test to an internal mailbox.
6. Revoke the old provider key.
7. Check logs and metrics for `PROVIDER_FAILED` spikes.
8. Record the rotation in the operational change log.

If the key was exposed, also enable the provider kill switch until rotation is complete.

## Throttle Policy

Each contract defines its own limits, but operations must support these dimensions:

| Dimension | Example Use |
|-----------|-------------|
| User/account | Password reset and login alert bursts |
| Tenant/client | Tenant-level runaway workflows |
| Contract/template | Misconfigured contract or frontend loop |
| Recipient | Mailbox flooding |
| Domain | Abuse toward one customer domain |
| Source IP | Public auth endpoints |
| Record | Duplicate document sends |
| Global | Provider or reputation safety cap |

Throttle outcomes must be audited and counted as metrics. Do not call the provider after a throttle block.

## Suppression Policy

Suppression blocks delivery before provider submission.

Suppression sources:

- provider bounce or complaint events
- manual support suppression
- tenant-level disablement
- domain-level block
- legal or compliance block

Suppression records should include recipient or domain, reason, source, actor, timestamp, and optional expiry. Avoid storing full message content.

The safety store keeps a per-address and per-domain suppression list (ETP-4226). Per-address entries are keyed by the SHA-256 hash of the normalized address; per-domain entries store the plaintext lower-cased domain. Suppression is checked for **every** address in the final recipient set — base, user-added To, and CC alike — before the provider is called; any hit returns `SUPPRESSED`. User-edited document recipients get no relaxed treatment: an address added through `recipientEdits` is suppressed exactly like a server-resolved one.

## Kill Switches

Kill switches are required at multiple levels.

| Switch | Scope | Expected Result |
|--------|-------|-----------------|
| Global email | All contracts | Return `KILL_SWITCHED`, audit, no provider call |
| Provider adapter | All provider calls | Return `KILL_SWITCHED` or `PROVIDER_FAILED` depending on state |
| Tenant/client | One tenant | Return `KILL_SWITCHED` for that tenant |
| Contract/template | One contract | Return `KILL_SWITCHED` for that contract |
| Recipient/domain | One target | Return `SUPPRESSED` |

Emergency response should prefer kill switches over code rollback when the risk is email abuse.

## Abuse Incident Response

Use this procedure when suspicious send volume, recipient complaints, or provider warnings appear.

1. Enable the narrowest effective kill switch.
2. Check metrics by contract, tenant, recipient, domain, and source IP.
3. Identify whether traffic came from UI, system job, public auth flow, or support/admin contract.
4. Review audit events for unauthorized attempts, throttle misses, duplicate keys, custom HTML usage, and suspicious recipient-edit patterns (per-channel added/removed hash lists from edited document sends).
5. Suppress affected recipients or domains if required.
6. Rotate provider secrets if exposure is possible.
7. Patch the contract, throttle, or authorization gap.
8. Re-enable only after a staging smoke test and production canary.
9. Document the incident, root cause, affected contracts, and follow-up tickets.

## Bounce and Complaint Handling

When provider events are available:

- map hard bounces to recipient suppression
- map complaints to recipient or domain suppression depending on policy
- keep soft bounces as metrics first, then suppress after repeated failures
- audit provider event IDs and timestamps
- never expose bounce/complaint internals to general users

## Email Audit Redaction & Storage Policy

This is the formally named redaction and storage policy for transactional email audit data. Earlier documents referenced this policy by name without defining it; this section is the canonical definition. The Logging Rules, observability sink table, and metrics guidance below implement it.

**Persistence rules:**

- Only **SHA-256 hashes** of recipient addresses are persisted. Raw email addresses are never written to audit rows, structured logs, or metrics labels.
- Multi-recipient sends (ETP-4226) persist **per-channel hash lists** as audit evidence: base recipient hashes, added recipient hashes by channel (`to`/`cc`), removed recipient hashes, and final recipient hashes by channel. The legacy single `recipientHash` field stays populated with the first final `to` hash for dashboard compatibility.
- **Plaintext domains are allowed**: `recipientDomain` and the final-recipient domain list may be stored and logged in plaintext (domains are low-sensitivity and needed for abuse triage), matching the existing `recipientDomain` precedent.
- Audit rows never store provider secrets, full message bodies, raw HTML from custom sends, or reset tokens.

**Observability rules:**

- Metrics labels never carry raw addresses or `recipientHash` (high cardinality + PII risk). Use `recipientDomain` and the low-cardinality labels listed under Metrics and Alerts.
- `recipientHash` values appear only in logs and investigation queries.

**Edited document recipients (ETP-4226):**

- When a send carried `recipientEdits`, the audit row's base/added/removed/final hash lists make the user's edit reconstructable in hashed form — who was proposed, what was removed, what was added per channel, and what was finally delivered. No reason text is captured for the edit (waived by stakeholder decision 2026-06-11; see the framework rule 6 amendment).
- During incident review, compare added-recipient hashes against suppression entries and known-abuse hashes, and check the final-domain list for unexpected external domains. Investigators query by hash; raw addresses are requested only where support policy explicitly permits it and the storage location is approved for PII.
- Suspicious edit patterns (high add volume, repeated removed-base sends, throttle hits on added domains) feed the Abuse Incident Response procedure below; the narrowest fix is a per-address or per-domain suppression entry, not a code change.

## Logging Rules

Structured logs should include:

- `requestId`
- `auditId`
- `contract`
- `version`
- `tenantId`
- `userId`
- `recordId` when applicable
- `status`
- `throttleBucket` when blocked
- `providerStatus` without provider secret values
- `durationMs`

Do not log:

- provider API keys
- reset tokens
- full message body
- raw HTML from custom sends
- complete recipient lists for bulk-like support operations

The runtime emits one redacted terminal event per executor outcome through the
email observability sink. The default sink writes structured logs with these
fields:

| Field | Purpose | Redaction rule |
|-------|---------|----------------|
| `metrics` | Comma-separated metric names that can be derived from the event | No secret values |
| `status` | Executor outcome such as `SENT`, `THROTTLED`, `DUPLICATE`, `SUPPRESSED`, `PROVIDER_FAILED`, or `VALIDATION_FAILED` | Safe enum |
| `contract`, `version` | Contract identity and command version | Safe metadata |
| `tenantId`, `userId`, `recordId` | Abuse and support correlation | Do not add business payload fields |
| `template` | Provider template resolved by the contract | Safe identifier |
| `recipientDomain` | Destination domain | Domain only |
| `recipientHash` | Stable SHA-256 hash of the destination address | Never log the raw address in metric labels |
| `providerStatus`, `providerDurationMs` | Provider outcome and latency | No provider body |
| `throttleScope`, `killSwitchScope` | Anti-abuse control that stopped the send | Scope only |
| `errorClass` | Generic provider/configuration failure class | No stack trace in metric labels |
| `durationMs` | End-to-end executor duration | Numeric |

Provider response bodies, reset tokens, custom HTML, API keys, and sender
credentials must not be placed in observability fields.

## Metrics and Alerts

Required metrics:

| Metric | Type | Labels |
|--------|------|--------|
| `sf_email_send_total` | Counter | contract, version, tenant, status |
| `sf_email_provider_duration_seconds` | Histogram | provider, contract, status |
| `sf_email_throttle_total` | Counter | contract, tenant, throttle_bucket |
| `sf_email_duplicate_total` | Counter | contract, tenant |
| `sf_email_suppression_total` | Counter | contract, tenant, reason |
| `sf_email_kill_switch_total` | Counter | scope, contract, tenant |
| `sf_email_provider_error_total` | Counter | provider, contract, error_class |

Runtime events map to metrics as follows:

| Outcome | Required metric signals |
|---------|-------------------------|
| Any terminal outcome | `sf_email_send_total` |
| Provider call attempted | `sf_email_provider_duration_seconds` |
| `PROVIDER_FAILED` | `sf_email_provider_error_total` |
| `THROTTLED` | `sf_email_throttle_total` |
| `DUPLICATE` | `sf_email_duplicate_total` |
| `SUPPRESSED` | `sf_email_suppression_total` |
| Kill switch suppression | `sf_email_kill_switch_total` and `sf_email_suppression_total` |

Use low-cardinality labels for metrics: `contract`, `version`, `tenant`,
`template`, `status`, `throttle_scope`, `kill_switch_scope`, and
`error_class`. Use `recipientHash` only in logs or investigation queries, not
as a high-cardinality Prometheus label.

Recommended alerts:

- provider failure rate above threshold for 5 minutes
- throttled sends spike for one contract or tenant
- global send volume exceeds expected baseline
- suppression or complaint rate spikes
- kill switch activated
- custom support contract used outside expected support hours or volume

## Operational Queries

Adapt these examples to Loki, Elasticsearch, CloudWatch Logs, or the active log
backend. They assume the default email observability log shape.

| Question | Query shape |
|----------|-------------|
| Provider failures by contract | `event=email_contract status=PROVIDER_FAILED | stats count by contract,errorClass,providerStatus` |
| Throttle spike by tenant | `event=email_contract status=THROTTLED | stats count by tenantId,contract,throttleScope` |
| Duplicate/idempotent sends | `event=email_contract status=DUPLICATE | stats count by tenantId,contract,recordId` |
| Suppressed recipients by domain | `event=email_contract status=SUPPRESSED | stats count by tenantId,contract,recipientDomain,killSwitchScope` |
| Abuse toward one recipient | `event=email_contract recipientHash=<hash> | stats count by contract,status,tenantId` |
| Provider latency | `event=email_contract providerDurationMs=* | percentile(providerDurationMs, 95) by contract,status` |
| Kill switch activation | `event=email_contract killSwitchScope=* | stats count by killSwitchScope,tenantId,contract` |

During an incident, start with `status`, `contract`, `tenantId`, `template`,
`recipientDomain`, and `recipientHash`. Do not request provider bodies or raw
email addresses unless support policy explicitly requires it and the storage
location is approved for PII.

## Production Smoke Test

Use a controlled internal mailbox and a low-risk contract.

Checklist:

1. Confirm provider key is configured only server-side.
2. Confirm the contract is enabled for the test tenant.
3. Send one email with a unique idempotency key.
4. Repeat the same command and verify `DUPLICATE`.
5. Trigger a throttle scenario in staging, not production.
6. Confirm audit, metrics, and logs contain request IDs and no secrets.
7. Confirm the frontend maps success and duplicate states correctly.

## Custom Contract Review

Before enabling any controlled custom contract:

- role access is limited to support/admin roles
- every send requires a reason
- HTML sanitizer rejects scripts, event handlers, unsafe links, and tracking pixels unless explicitly allowed by policy
- throttle is stricter than fixed transactional contracts
- body storage is redacted or avoided in audit
- Reply-To uses allowlisted support mailboxes only
- metrics distinguish custom sends from fixed-template sends

## Local and CI Expectations

Documentation-only changes should at minimum pass whitespace checks and repository tests that are reasonable for the scope. Behavior changes must also pass the relevant backend/frontend tests and must account for the conditional Jenkins Etendo Go regeneration gate. If Jenkins is flaky, record the failing run and rerun once before treating it as a product failure.
