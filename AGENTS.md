# AGENTS.md - OpenCode/Codex Instructions for Schema Forge

This file provides portable instructions for coding agents (OpenCode, Codex CLI, Cursor, Copilot).

## Language Policy

- All versioned repository content must be in English (code, comments, docs, tests, commit messages, file names).

## Core Architecture

Schema Forge defines what to expose; Etendo Go (NEO Headless) serves it at runtime.

Data flow:

`Menu Cache -> extract-from-db.js -> artifacts/{spec}/(schema-raw + rules-raw) -> decisions.json -> resolve-curated.js (in memory) -> push-to-neo.js -> ETGO_SF_* tables -> NEO Headless -> React SPA`

## Non-Negotiable Rules

1. Never hardcode or guess window/process/menu IDs. Use DB queries or `node cli/src/menu-cache.js search "<name>"`.
2. Never manually edit generated outputs in `artifacts/*/generated/`.
   - Fix generators/extractors/shared sources instead (`cli/src/generate-*.js`, `cli/src/extract-*.js`, `tools/app-shell/src/`).
3. Spec names are kebab-case using `toSpecName()` in `cli/src/push-to-neo.js`.
4. If `push-to-neo.js` is executed, run `./gradlew export.database` in the Etendo root afterward.
5. Use feature branches and PRs; do not work directly on `main`.
6. Use NEO-native configuration explicitly for window and report generation.
   - Prefer Schema Forge + NEO contracts/specs and handlers (`push-to-neo`, `ETGO_SF_*`, NEO endpoints).
   - Avoid classic AD/Jasper/classic-process patterns as the default implementation path.

## Transactional Email Rules

Transactional email must follow `docs/transactional-email-framework.md` and `docs/email-contracts.md`.

1. Never call an external email provider directly from frontend code.
2. Never commit provider endpoints, API keys, signing secrets, sender credentials, or other email provider secrets.
3. Never expose a browser endpoint that accepts an arbitrary provider payload such as `to`, `template`, and `data`.
4. Every email send must go through an explicit versioned email contract with authorization, recipient resolution, throttle, idempotency, audit, suppression, and kill switch behavior.
5. Resolve recipients server-side from trusted records by default. Caller-provided recipients are allowed only for explicit admin/support contracts.
6. `custom` email is allowed only as a controlled contract with role checks, sanitizer, strict throttle, reason capture, and audit.
7. Each email contract must document at least 3 edge cases and include behavioral/security test coverage before it is considered complete.

## Pipeline Expectations

Canonical phase order:

`DEV -> REVIEW -> QA -> DOCS`

When relevant, preserve this order and do not skip quality gates.

## Orientation Before Coding

Before making changes:
1. If the task touches a window, first find its functional guide via `docs/generated-custom-windows/INDEX.md` and open `docs/generated-custom-windows/<window>.md` before editing code or artifacts.
2. Confirm branch and repository context (`git branch --show-current`, `pwd`).
3. Read existing files before editing.
4. If DB access is needed, verify connectivity from Etendo `gradle.properties`.
5. Check existing artifacts and known issues (`artifacts/`, `feedback.md`, `docs/feedback.md` if present).

## Documentation Freshness

Behavior-changing code updates must include corresponding documentation updates in the same change.
Window-specific changes must also update the matching `docs/generated-custom-windows/<window>.md` guide.

## Testing Baseline

- CLI tests: `make test`
- E2E guidance: `docs/e2e-testing-guide.md`
- Every process should declare at least 3 edge cases.
- Every kept business rule should have behavioral test coverage.

## Deploy Reminder

Final deployment step is typically `make deploy` (or `make deploy MODULE_WEB={path}`).

## Extending NEO Headless — NeoHandler Pattern

Never add window-specific logic to `NeoSelectorService`, `NeoDefaultsService`, `NeoCrudHandler`, or `NeoServlet`.
Use the `NeoHandler` CDI extension point in `com.etendoerp.go` instead:

1. Set `Java_Qualifier` on the `ETGO_SF_ENTITY` record (e.g. `"internal-consumption-line"`).
2. Create a CDI bean annotated `@ApplicationScoped @Named("internal-consumption-line")` implementing `NeoHandler`.
3. `handle()` runs before default CRUD (return `null` to continue); `afterHandle()` runs after.
4. Place under `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/handlers/`.

Full reference: `docs/neo-headless-extensibility.md`

## Primary References

- `docs/architecture-overview.md`
- `docs/branch-workflow.md`
- `docs/decisions-reference.md`
- `docs/self-documentation-policy.md`
- `docs/developer-tools.md`

<!-- BEGIN TESTSPRITE AGENT SECTION (testsprite agent install codex) -->
<!-- testsprite-skill: testsprite-verify+testsprite-onboard v0.11.0 sha256:c67b36d1eb44 -->
# TestSprite Verification Loop

After a feature/fix, run relevant tests and inspect failures before reporting done.
Skip docs-only/build-config edits. Missing credentials mean unverified.
Honor the user's explicit choice of CLI or MCP.

## 1. Preflight and project

```bash
testsprite --version
testsprite auth status
```

If missing, tell the user to install the CLI or run `testsprite setup` respectively.
Resolve the project from `$TESTSPRITE_PROJECT_ID`, `.testsprite/config.json`, then
`testsprite project list --output json`; ask if multiple projects match.

For a local app with no project, start it and bootstrap:

```bash
testsprite project create --type frontend --name "<repo name>" --local <port> --local-host <host>
testsprite test create --plan-from plan.json --project <projectId>
testsprite test run <test-id> --local <port> --local-host <host> --output json
```

Local projects need V3 (V2-only: exit 7, `local-origin-requires-v3`). They skip
exploration; `test plan generate` is refused before charge (exit 6). Author plans
with `test create --plan-from` without `--run`, then run each id with `--local`.
Portal runs are blocked for free until `project update <id> --url https://…` sets
a public URL. Deployed projects retain `project create --url`; an empty deployed
suite can use `test plan generate --project <id>` then `test plan accept`.

## 2. Run against the change

Reuse a test covering the change or create one. Public `--target-url` must contain
the new deployment. The CLI does not build/host apps. For local-only changes use
`testsprite test run <test-id> --local <port>` (frontend only).

```bash
# Deployed frontend: create + run, or run an existing test
testsprite test create --plan-from plan.json --run --wait \
  --target-url https://staging.example.com --timeout 600 --output json
testsprite test run <test-id> --target-url https://staging.example.com \
  --wait --timeout 600 --output json
# Backend Python assertion
testsprite test create --type backend --name "Login rejects empty password" \
  --project <id> --code-file /tmp/test.py --run --wait --timeout 600
# Deployed replay (V3 FE: 0.5 credit)
testsprite test rerun <test-id> --wait --output json
# Dependency batch; optional --filter <substring>
testsprite test run --all --project <id> --wait --max-concurrency 4 --output json
```

- Local runs need `run:tunnel`; keys minted before that scope existed must be
  replaced if the CLI names it as missing (exit 3). Free-plan local runs work;
  a V3 frontend run costs 0.5 credit. Backend tests cannot use `--local`.
- `--local` implies `--wait`; timeout defaults to 1200 seconds, ordinary waits
  to 600. `--local-host` accepts `localhost`, `127.0.0.1` (default), or `::1`.
  A dead port exits 5 before charge; `--skip-preflight` bypasses the probe.
  Public `--target-url` rejects localhost/private addresses and excludes `--local`.
- One test per local invocation; parallel invocations are fine. `--all --local`
  exits 5. A user has 5 live tunnel bindings; `tunnel_binding_limit` is exit 11,
  not auto-retried. Stop an unused tunnel or reuse one with `--tunnel-client`.
- Keep the early **stderr** `Run <runId>` receipt, emitted after triggering;
  `Dashboard: <url>` follows when supplied. Stdout remains the JSON result channel.
- An **owned** local timeout, Ctrl-C, or polling failure cancels the run by
  default and closes the tunnel. Check the reported cancellation outcome.
  A run cancelled before it finished is refunded. `--no-cancel-on-interrupt`
  detaches instead, but the owned tunnel still closes and the run remains billable.
- Owned local timeout: start a **new**
  `testsprite test run <test-id> --local <port> --timeout 1800`,
  keeping `--local-host <host>` if used. `test wait` cannot reopen the tunnel.
  Ordinary/adopted waits can resume with `testsprite test wait <run-id>`
  while the target is reachable.
- `tunnel start` (no port) holds a tunnel in a terminal; keep it alive.
  Borrow via `--local <port> --tunnel-client <uuid>`; no automatic cancel or close.
  A second `tunnel start`/process using the same credential takes over; the first exits **10**.
- A case last run through a tunnel stays local: later Portal Run, schedules, or
  bare CLI runs are free BLOCKED (`tunnel-required`, exit 6). Use `--local` again
  or explicitly retarget with public `--target-url`. V3 local runs use the agent
  path, never saved-code replay, and preserve saved code.
- `--wait` handles polling/backoff; do not wrap it in a retry loop.
- Backend Python runs top-to-bottom, not via pytest: call your `test_*` functions.
  The sandbox has stdlib, `requests`, `pytest`, `numpy`, and `scipy`; use HTTP,
  not imports from the project's source or uninstalled packages.
- Backend `--produces`/`--needs` are repeatable; `--category teardown` marks cleanup.
  Set dependencies with `test create` or edit with `test update`; do not delete
  and recreate. Use `test run --all` for producer → consumer → teardown ordering
  and variable passing. A BE `test rerun` includes that closure and its side effects;
  `--skip-dependencies` selects only the named test. Triage failed producers before
  blaming consumers starved of their token/fixture.

## 3. Inspect and report

```bash
testsprite test artifact get <run-id> --out ./.testsprite/runs/<run-id>/
testsprite test steps <test-id> --run-id <run-id> --output json
```

Read the failing step, screenshots and root cause. Bare `test steps <test-id>`
means the latest run's steps; pin the receipt's
run id. An empty latest run does not substitute earlier steps; choose an earlier
id from `test result <test-id> --history`. Report the verdict and dashboard link.

Exits: 0 passed; 1 failed/blocked/cancelled; 3 auth/scope; 4 not found;
5 validation; 6 conflict/precondition; 7 timeout/unsupported; 10 unavailable;
11 rate limited; 12 insufficient credits.

## Dry-run and setup

`--dry-run` works without credentials:

```bash
testsprite test run <test-id> --dry-run --output json
testsprite test create --plan-from plan.json --dry-run --output json
```

Setup: `npm install -g @testsprite/testsprite-cli`, then `testsprite setup`.

**First-time setup:** if this repo has no TestSprite tests yet, seed a *broad* first suite across its main user flows — not just one test — each with a concrete, observable assertion, before reporting setup as done.
<!-- END TESTSPRITE AGENT SECTION -->
