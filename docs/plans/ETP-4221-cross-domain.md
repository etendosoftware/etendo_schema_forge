# ETP-4221 Cross-Domain Plan: Contract-UI Churn Report + Ratchet Guardrails (Wave 0)

## Domains

- `repo-infra`: CI workflow `.github/workflows/ratchet-guards.yml` (wires the window-leak ratchet into PR/push) and `Makefile` targets `method-budget` / `window-leak-budget`.
- `generator-change`: ratchet test suites `cli/test/method-budget.test.js` and `cli/test/window-leak-budget.test.js`.
- `unknown` (tooling/scripts + report): ratchet implementations and config `cli/src/method-budget.js`, `cli/method-budget.json`, `cli/src/window-leak-budget.js`, `cli/window-leak-budget.json`, churn metrics helper `cli/git-file-stats.sh`, and the analysis report `docs/reports/contract-ui-churn-analysis.md`.

## Why This Cannot Be Split Cleanly

This is the Wave 0 deliverable of the contract-ui churn remediation plan (ETP-3504): a single, behavior-neutral guardrails change. The analysis report, the two "fail-if-grows" ratchets (method count + window-specific leaks), their tests, the Makefile targets that run them, and the CI workflow that enforces them are one atomic unit — a ratchet committed without its test, config, Make target, or CI hook is dead code that enforces nothing. There is no product/window code in this commit; nothing is generated or regenerated, so it is innocuous by construction across all windows.

## Review Order

1. Report — `docs/reports/contract-ui-churn-analysis.md`: the diagnosis and the full wave plan (T01-T34) that this commit's guardrails belong to.
2. Ratchets — `cli/src/method-budget.js` + `cli/src/window-leak-budget.js` and their JSON baselines: confirm they fail only on growth and lower the baseline via `--update`.
3. Tests — `cli/test/method-budget.test.js` + `cli/test/window-leak-budget.test.js`.
4. Wiring — `Makefile` targets and `.github/workflows/ratchet-guards.yml` (note: method-budget is intentionally NOT enforced here; its file lives in com.etendoerp.go).
5. Review this plan.

## Tests

- `make method-budget` — green (method ratchet at frozen baseline).
- `make window-leak-budget` — green (window-leak ratchet at baseline 8).
- CLI test suite (`make test`) covering both ratchets (positive/negative, comments ignored, monotonicity).

## Rollback

Reverting is a standard git revert of the commit. All changes are additive tooling/CI/docs with zero behavior change to any window; no data migration, schema change, or frontend regeneration is involved.
