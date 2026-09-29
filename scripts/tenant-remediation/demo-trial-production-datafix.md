# Production demo trial metadata repair

Status: authorized production repair applied on 2026-09-29 to exactly 45 reviewed legacy demo clients. Each received `ETGO_LegacyTransitionStartedAt = 2026-09-28T00:00:00Z`. Existing trial dates and excluded accounts were preserved; post-apply verification is recorded below.

## Production execution record

The production database was accessed through localhost:15432, database `etendo`, with the approved AWS profile `go` system credential. The reviewed dry-run inventory contained 124 clients: 45 eligible, 39 excluded paid/productive, 24 with existing lifecycle dates, and 16 pool/unowned clients. User authorization limited the apply to those exact 45 IDs and the explicit UTC start instant above.

The standalone reviewed repair ran with `--expected-audit /private/tmp/demo-trial-prod-dry-run.json --apply`; it reclassified under transaction locks and matched the approved eligible ID set before inserting. Execution succeeded with 45 inserted preferences. It did not deploy backend code or change application properties.

Post-apply read-only verification passed: exactly 45 approved client IDs have the exact inserted preference/value, all 79 other clients' audited preferences are unchanged, and no eligible client remains without a lifecycle date. Final classification is 39 excluded paid/productive, 69 with preserved lifecycle dates, and 16 pool/unowned. Verification compared every client's full audited preference rows against the apply before image plus the exact inserted row; no unrelated preference changes were observed.

Secure audit artifacts:

- Reviewed inventory: `/private/tmp/demo-trial-prod-dry-run.json`.
- Exact before images and inserted rows: `/private/tmp/demo-trial-prod-apply-20260928.json`.
- Follow-up read-only inventory: `/private/tmp/demo-trial-prod-after-20260928.json`.
- Snapshot verification utility: `/private/tmp/verify-demo-trial-prod-apply.cjs`.

The apply audit supports the standalone guarded rollback if reversal is explicitly authorized; no rollback of production has been performed. The production apply used the standalone path with its exact snapshot rollback support; the canonical SQL entry remains available for ordinary runner-managed repairs.

## Canonical datafix framework

The supported repair is now the SQL catalog entry `cli/src/data-fixes/sql/20260929T180000Z__R41-demo-legacy-trial-start.sql`, executed by the existing runner. It uses the same metadata, `@check`, tenant-scoped guarded `@apply`, optional `@report`, per-client transaction, and atomic `ETGO_DATA_FIX_HISTORY` ledger as other datafixes. The standalone script below remains available as an inventory/rollback diagnostic; it is not the canonical repair entry point.

Read-only preview, all clients (add `--client <ID>` to isolate one):

```sh
ETENDO_GRADLE_PROPERTIES="$PWD/etendo_core/gradle.properties" \
node cli/src/data-fixes/run.js --fix 20260929T180000Z__R41-demo-legacy-trial-start --dry-run
```

Explicit application, all eligible clients, with an operator-approved UTC start:

```sh
PGOPTIONS='-c etendo_go.demo_transition_started_at=<AGREED-UTC-INSTANT>' \
ETENDO_GRADLE_PROPERTIES="$PWD/etendo_core/gradle.properties" \
node cli/src/data-fixes/run.js --fix 20260929T180000Z__R41-demo-legacy-trial-start
```

The existing runner binds only AD IDs. PostgreSQL's per-connection `PGOPTIONS` supplies the explicit date without expanding runner functionality or changing a global application property. Missing/invalid settings fail atomically if an eligible client needs the repair. Date values are preserved exactly as entered. Existing lifecycle preferences, even malformed/empty ones, are skipped for review rather than overwritten. `--fix` intentionally bypasses the watermark while selecting only this fix; the all-client default is already provided by the framework.

Before applying, save an inventory from the standalone `--audit-only` command and the runner output. The canonical `@report` records inserted preference IDs/values in the success ledger detail; the standalone script's rollback command cannot roll back a canonical runner audit. To undo a canonical apply, use a separately reviewed, tenant-scoped deletion of only the recorded inserted preference ID after verifying its value/audit timestamps and absence in the before image, and record the manual reversal without deleting the ledger. No rollback has been executed.

This is legacy-transition metadata, not a new onboarding gap: current onboarding already writes the original ready trial start. Do not bump the onboarding cutoff or rewrite that start date. The ETP-5548 preventive paid-provisioning change remains separate and in progress.

## Commands

Run from the repository root. Localhost port 55432 is the default, as requested. Credentials and database name resolve from `etendo_core/gradle.properties`; `ETENDO_DB_NAME`, `ETENDO_DB_USER`, `ETENDO_DB_PASSWORD`, and `ETENDO_DB_PORT` explicitly override them. The script never prints credentials.

```sh
node scripts/tenant-remediation/repair-demo-trial.cjs --audit-only --audit /private/tmp/demo-trial-inventory.json
node scripts/tenant-remediation/repair-demo-trial.cjs --trial-start <AGREED-UTC-INSTANT> --audit /private/tmp/demo-trial-preview.json
```

The instant must be an explicit UTC value such as `YYYY-MM-DDTHH:mm:ssZ`; there is no default. After reviewing the preview, an explicit apply would be:

```sh
node scripts/tenant-remediation/repair-demo-trial.cjs --trial-start <AGREED-UTC-INSTANT> --apply --audit /private/tmp/demo-trial-apply.json
```

Rollback preview and explicit execution:

```sh
node scripts/tenant-remediation/repair-demo-trial.cjs --rollback /private/tmp/demo-trial-apply.json
node scripts/tenant-remediation/repair-demo-trial.cjs --rollback /private/tmp/demo-trial-apply.json --apply --audit /private/tmp/demo-trial-rollback.json
```

Audit paths must be new files. The script stores all before images and inserted rows before commit, with restrictive permissions. A commit error leaves a prepared audit that must be reconciled against the database. Each rollback checks the complete inserted row for unchanged state before deletion. AWS credentials are used only when explicitly enabling `ETGO_DATAFIX_AWS_PASSWORD=1` (profile `go`).

For an apply authorized against a previously reviewed candidate list, supply `--expected-audit <dry-run.json>`. After acquiring the transaction locks, the script reclassifies all clients and requires exact equality of the eligible client IDs with that audit, including database/mode and duplicate-ID validation. Any changed scope aborts before the first INSERT. `ETGO_DATAFIX_AWS_SECRET_ID` optionally selects the approved Secrets Manager secret without logging its value. Production connection host remains localhost; configure the tunnel port/user/database explicitly.

Standalone date validation verifies exact UTC calendar/time components after parsing, rejecting normalized impossible dates such as February 30. Canonical SQL validates the explicit UTC syntax and PostgreSQL timestamp conversion before insertion.

Safety is conservative: a paid checkout belonging to any current owner email excludes that client's demo too. Duplicated/targeted preferences, malformed dates, subscription metadata, available pool tenants, test fixtures, unowned clients, and associations to productive clients are reported without repair. Existing valid dates remain unchanged. Missing plan means free in the current runtime; unknown explicit marker values are excluded.

Paid projection exclusions include active `ETGO_SubscriptionStatus`, `ETGO_SubscriptionDueAt`, `ETGO_SubscriptionEventAt`, and `ETGO_AssociatedDemoClientId`, even if their values are empty. Such partial metadata requires manual classification rather than demo activation.

Schema is checked through execution of queries based on local exported XML definitions; a missing deployed column/table/function aborts the transaction. Before any apply, full tables involved in classification are locked with a five-second acquisition timeout, so concurrent checkout/claim/preference writes cannot invalidate classification. This can briefly block application writes; review the dry-run scope first.

## Confirmed behavior from source

`TenantEnvironmentLifecycleService.resolve` first honors productive environment or plan markers. For a free tenant without `ETGO_DemoTrialStartedAt`, it reads `ETGO_LegacyTransitionStartedAt`, or initializes the latter from the global activation property. With neither start date nor global activation, it returns no lifecycle snapshot. A missing trial banner alone does not prove failed paid provisioning.

## Required read-only evidence

For the selected client, inspect active preference values and duplicate counts for `ETGO_TenantPlan`, `ETGO_EnvironmentType`, `ETGO_DemoTrialStartedAt`, `ETGO_LegacyTransitionStartedAt`, and `ETGO_AssociatedProductiveClientId`. Resolve owner identities, pool status, and paid checkout associations before classifying it as an unpaid demo. Confirm production table columns before authoring the executable INSERT.

Production access uses the existing localhost port 15432 tunnel and AWS profile `go`; credentials must never be logged. The diagnostic script currently lives at `/private/tmp/audit-prod-demo-lifecycle.cjs` and opens a `BEGIN READ ONLY` transaction.

## Date semantics requiring an explicit decision

For an unmanaged legacy demo, prefer `ETGO_LegacyTransitionStartedAt` with an explicitly agreed transition UTC instant. This starts an access countdown, not merely a visual label. Do not derive this instant from `AD_Client.created`: pool creation can predate user ownership. Do not set a global activation property for an individual repair. Preserve all existing trial start instants.

For a paid environment incorrectly classified as demo, repair productive metadata instead; never initialize a demo countdown. That requires confirmed payment and ownership evidence.

## Scoped transaction and idempotency

Prepare the corrective SQL only after confirming the client ID, exact preference schema, payment exclusion, and selected start instant. Lock the target client, repeat classification assertions inside the transaction, and insert only the missing lifecycle preference with `WHERE NOT EXISTS`, scoped to the selected `ad_client_id`. Abort for existing productive markers, pool tenants not assigned to the user, associated productive environments, conflicting preferences, or paid checkout ambiguity. Record the generated preference ID and before/after snapshot in the audit artifact.

The second execution must return zero changes. Rollback must delete only the exact inserted preference ID for the same client, attribute, value, and unchanged audit timestamp; never delete all trial preferences by attribute. Validate the environment response after applying the repair.

## Preventive front

Paid pooled provisioning transaction fixes are already being developed under ETP-5548. Legacy demo activation intentionally remains opt-in; do not broaden that rollout through a datafix. Verify whether the affected tenant is a legacy demo or an interrupted paid provisioning before selecting the preventive action.

## Current blocker

On 2026-09-29, intermediate connection attempts were blocked or refused. Port 55432 was verified as the local database `etendo_local`; its first inventory had six pool/unowned exclusions and zero eligible repairs. Disposable local integration fixtures subsequently validated both repair paths, nine protected cases, idempotency, rollback, invalid/missing dates, and the expected-ID scope guard. The production tunnel on port 15432 was subsequently restored and audited separately before the authorized 45-client apply. Schema compatibility and execution were confirmed by that successful transaction.
