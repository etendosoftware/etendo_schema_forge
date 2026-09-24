# Cross-Domain Plan — ETP-5275

## Domains

- `unknown` — `cli/src/data-fixes/sql/20260910T120000Z__R36-psd2-bank-statement-schedule-removal.sql`. The boundary policy shipped by `@etendosoftware/schema-forge-core` has no rule for `cli/src/data-fixes/sql/`, so every corrective data-fix lands as `unknown`. This is a gap in the policy, not a genuine second domain — see "Why mixed".
- `generator-change` — `cli/test/data-fixes-r36-psd2-bank-statement-schedule-removal.test.js`, classified by its `cli/test/` prefix. It is the regression test **for the file above**, not a change to any generator.
- `repo-infra` — three docs: the onboarding/data-fixes map, the tenant-remediation knowledge log and the NEO extensibility reference. All three describe the onboarding step this ticket removes and would be stale without the edit, per the repo's documentation-freshness policy.

## Why mixed

This is a single-domain change — one corrective data-fix — that the classifier splits three ways because a data-fix necessarily ships as `<fix>.sql` + `<fix>.test.js` + the doc updates that keep the catalog honest. Every data-fix in this repo has the same shape (compare `R34-fin-account-cleared-payment-accounts`, whose commit touched the same three areas).

The real fix is a policy rule mapping `cli/src/data-fixes/**` to a `tenant-data-fix` scope, which belongs in `schema_forge_core` and is out of scope here: this ticket must not ship a boundary-policy change alongside a tenant remediation.

Nothing in this branch touches a window, the app shell, the generators, or any runtime code path in this repo. The preventive half of the ticket lives in `com.etendoerp.go` and is a separate commit in that repo.

## Tests

- `cli/test/data-fixes-r36-psd2-bank-statement-schedule-removal.test.js` — 30 assertions: header metadata, `:client_id` isolation on **both** `@apply` statements, keying on `ad_process_id` (with negative assertions that the fix never joins `ad_process` and never matches the process by name), both historical description markers, the mandatory UPDATE-before-DELETE ordering, blast radius, and two-layer idempotency.
- Full CLI suite green: 1055 tests, 240 suites.
- Verified against a live tenant DB inside a rolled-back transaction: `UPDATE 127` → `DELETE 127` across 127 tenants, `@check` afterwards 0, `ad_process_run` 77634 → 62313, and the one unmarked manual `COM` row untouched.

## Rollback

- The `.sql` and its test are new files: delete both. The runner discovers fixes by directory listing, so removing the file removes the fix — nothing references it by name.
- Already-applied tenants are **not** restored by that. The fix deletes an `AD_Process_Request` and cascades its `AD_Process_Run` history; neither comes back. Recovering a tenant means re-creating the schedule by hand in Classic's "Proceso Programado" window (daily, `Get Bank Statements`), and the run history is gone for good. That loss is the accepted decision on this ticket.
- The three doc edits revert cleanly and carry no runtime effect.
