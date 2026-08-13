# ETP-4215 — Cross-domain plan

**Feature:** Close the Etendo GO tenant provisioning gaps on **both fronts** —
preventive onboarding fixes for new tenants *and* a corrective data-fixes
framework for existing ones. A single gap (e.g. missing chart of accounts,
period control, default customer location, org-info location, tax posting
accounts) is fixed once in the onboarding path so new tenants never hit it, and
once as an idempotent corrective `.sql` so already-provisioned tenants can be
remediated. The two halves are designed and validated together against the same
tenants, so they land in one branch.

This PR is approved as cross-domain because the work is inherently multi-domain:
the corrective tooling (a new `cli/src/data-fixes/` subsystem), the preventive
onboarding code (`platform-change`), and the supporting knowledge/process docs
(`repo-infra`) are one cohesive change and cannot be split without breaking the
"preventive + corrective stay in lockstep" invariant.

## Domains touched

### Tenant data-fixes framework (corrective tooling)
The Flyway-style runner that applies timestamped corrective `.sql` fixes to
existing tenants, recording state in the System-owned `ETGO_DATA_FIX_HISTORY`
ledger:
- `cli/src/data-fixes/run.js` — runner: baseline sweep, per-fix `@check`/`@apply`
  with per-fix transaction + ledger write, `--client`, `--fix`, `--dry-run`,
  `--mark-fixed`, and the new `--list-clients` read-only overview. Output now
  labels each tenant as `Name (id)`.
- `cli/src/data-fixes/parse-fix.js` — fix-file parser + apply-time templating
  (`:client_id`/`:org_id` inlining, `@name_client@`, `@uuid_<KEY>@` fresh ids).
- `cli/src/data-fixes/lib/sampledata-xml.js` — sampledata XML helper.
- `cli/src/data-fixes/sql/*.sql` — the corrective catalog: R1 chart-of-accounts
  (now wrapped in `ad_disable_triggers()`/`ad_enable_triggers()` so the explicit
  `C_ELEMENTVALUE_TRL` / `AD_TREENODE` rows don't collide with the AD translation
  trigger), R3 periodcontrol, R4 default-customer-location, R6 org-info-location,
  R7 tax-accounts (system-level taxes → client-level `C_TAX_ACCT`).
- `cli/src/data-fixes/sql/README.md` — authoring rules + skeleton.

### `platform-change` (preventive onboarding)
The onboarding path so new tenants are provisioned correctly up front:
- `tools/app-shell/src/pages/onboarding/onboardingApi.js`,
  `onboardingState.js` (+ `__tests__/onboardingHelpers.vitest.js`,
  `__tests__/onboardingState.test.js`).

### `repo-infra` (process, tooling config, knowledge docs)
- `Makefile` — `make data-fixes` wrapper gains `LIST_CLIENTS=1` + help.
- `run-sonar.sh` — static-analysis helper.
- `CLAUDE.md` — coordinator/team + data-fixes guidance.
- `.claude/agents/tenant-fixer.md` — Remedy agent definition (owns this subsystem).
- `docs/plans/2026-06-11-ETP-4215-tenant-data-fixes-plan.md`,
  `docs/plans/onboarding-gaps-remediation-plan.md`,
  `docs/superpowers/specs/2026-06-10-tenant-data-fixes-framework-design.md` —
  design + remediation plan + framework spec.
- `docs/etendo-ad/onboarding-and-datafixes-map.md`,
  `docs/etendo-ad/onboarding-gaps.md`,
  `docs/etendo-ad/onboarding-gaps-research-notes.md`,
  `docs/etendo-ad/tenant-remediation-knowledge.md` — AD findings + the lockstep
  map between each preventive fix and its corrective twin.

The corresponding preventive Java (`OnboardingDatasetDefinition`,
`OnboardingAccountingWiringService`) lives in the sibling `com.etendoerp.go`
repo and is committed on the matching `feature/ETP-4215` branch there (shared
branch workflow).

## Tests / validation

- **Onboarding (Vitest):** `onboardingHelpers.vitest.js`, `onboardingState.test.js`
  cover the onboarding state/api helpers.
- **Data-fixes runner — validated against the live local DB (read-only / rolled
  back where it mutates):**
  - R1 reproduced statement-by-statement to isolate the
    `c_elementvalue_trl_elementv_un` collision → root-caused to the
    `c_elementvalue_trg` AD translation trigger; fix verified by re-running the
    full `@apply` body (7872 rows: 1790 element values, 3580 translations, 1
    acctschema, 1790 tree nodes) inside a transaction and rolling back.
  - Full chain applied end-to-end on a freshly onboarded tenant (Prueba4):
    R1 = 7872, R3 = 531, R4 = 4, R6 = 2, R7 = 653 `C_TAX_ACCT` rows — all
    `APPLIED` in the ledger.
  - `--list-clients` cross-checked against `ETGO_DATA_FIX_HISTORY` for accuracy.
- **No automated tests for the runner yet** — follow-up to add Node-test coverage
  for `cmdListClients` and the `parse-fix` templating.

## Rollback

The change is additive and gated; nothing runs automatically.

- **Data-fixes:** the runner is opt-in (operator runs `make data-fixes`); every
  fix is idempotent (`@check` + `NOT EXISTS` guards) and runs in its own
  transaction that rolls back on failure, leaving the tenant untouched. Reverting
  the schema_forge commits removes the runner and catalog; no data is migrated by
  merging the PR. The `ETGO_DATA_FIX_HISTORY` ledger is System-owned bookkeeping
  and carries no tenant data.
- **Onboarding (platform):** revert the onboarding-page commits; the helpers fall
  back to prior behaviour (purely additive wiring).
- **Docs / Makefile / config:** revert with the commits; `LIST_CLIENTS` and the
  new docs simply disappear, no runtime impact.
- **Preventive Java:** revert the matching `com.etendoerp.go` `feature/ETP-4215`
  commits independently; the two repos share the branch but each reverts cleanly.
