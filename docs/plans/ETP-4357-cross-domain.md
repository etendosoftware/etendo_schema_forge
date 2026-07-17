# ETP-4357 — Cross-domain plan

**Feature:** Email send stress test harness — double-send (idempotency dedup) and
concurrent-load (throttle ceiling) scenarios for the email contract pipeline.

This PR is approved as cross-domain because it spans the CLI test suite
(`generator-change`), the design spec (`repo-infra`), and a repo-level
gitignore update (`unknown`). No production code is changed; all new files
are test infrastructure and documentation.

## Domains touched

### `generator-change`

- `cli/test/stress/runner.js` — CLI entry point; orchestrates scenarios,
  intercepts `global.fetch` for per-worker metrics via `AsyncLocalStorage`.
- `cli/test/stress/report.js` — terminal report with latency percentiles
  and pass/fail exit code.
- `cli/test/stress/scenarios/double-send.js` — N workers, same documentId,
  verifies idempotency dedup (expected: 1 accepted, N-1 deduplicated).
- `cli/test/stress/scenarios/concurrent-load.js` — K workers, distinct
  documents, finds throttle ceiling (429 threshold).
- `cli/test/stress-test-runner.test.js` — 6 integration tests against a
  real in-process HTTP server; no production mocks.

### `repo-infra`

- `docs/superpowers/specs/2026-06-29-email-stress-test-design.md` —
  design spec for the harness (branch reference corrected to ETP-4357).

### `unknown`

- `.gitignore` — adds `.active-locale` (runtime locale state file,
  personal to the developer's machine).

## Tests

- `node --test cli/test/stress-test-runner.test.js` — 6/6 pass (~1s).
- No production files changed; full CLI suite unaffected.

## Rollback

- **generator-change:** delete `cli/test/stress/` and
  `cli/test/stress-test-runner.test.js`; no runtime behavior changes.
- **repo-infra:** revert spec doc; design knowledge only.
- **unknown:** revert `.gitignore` line; `.active-locale` becomes
  untracked again (harmless).
