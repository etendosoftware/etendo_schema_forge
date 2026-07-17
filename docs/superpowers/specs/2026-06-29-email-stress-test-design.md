# Email Send Stress Test — Design Spec

**Date:** 2026-06-29  
**Branch:** feature/ETP-4357  
**Scope:** Frontend contract layer + real Etendo backend (email provider mocked at config)  

---

## Goal

Find the limits of the email send pipeline between the Schema Forge frontend and the Etendo Go contract executor — without involving the external email provider (Amazon SES). Two failure modes to discover:

1. **Double-send** — does the idempotency key actually deduplicate? Does the frontend block the button fast enough?
2. **Concurrent load** — at what concurrency does the throttle kick in? How does the frontend handle 429?

---

## What is NOT tested

- Amazon SES delivery — the provider adapter must be mocked/no-op in Etendo config before running.
- E2E user flows — no Playwright, no real browser.
- PDF rendering — `cacheDocumentPreviewFile` is called with a synthetic blob; real PDF generation is out of scope.

---

## Architecture

```
runner.js  (CLI entry, orchestrator)
    │
    ├── scenarios/double-send.js   → N workers, same document + same idempotencyKey
    └── scenarios/concurrent-load.js → K workers, distinct documents, same contract

Both scenarios call sendDocumentEmail() from cli/src/documentEmailSend.js (real code).
Results flow to report.js → terminal table + exit code.
```

**File layout:**
```
cli/test/stress/
├── runner.js
├── report.js
└── scenarios/
    ├── double-send.js
    └── concurrent-load.js
```

---

## Scenario A — double-send

**Purpose:** Verify that idempotency deduplication works under burst. Simulates a user clicking Send N times before the first response arrives.

**Mechanics:**
- All N workers share the same `documentId`, `windowName`, and computed `idempotencyKey`.
- Workers are launched simultaneously with `Promise.allSettled()` — no delay between them.
- Each worker calls `sendDocumentEmail()` (includes `cacheDocumentPreviewFile` + POST to `/email-contracts/{window}-send/send`).

**What to measure:**
| Metric | Description |
|--------|-------------|
| `sent_count` | How many requests reached the server |
| `accepted` | Responses with HTTP 200 / accepted status |
| `deduplicated` | Responses indicating idempotency hit (200 with dedup flag, or contract-defined dedup body) |
| `errors` | Non-200, non-dedup responses |
| `latency_ms[]` | Per-request round-trip time |
| `pdf_cache_failures` | Failures in the preview-cache step before the send |

**Expected outcome (passing):** exactly 1 `accepted`, N-1 `deduplicated`, 0 `errors`.

**Limit discovery:** Run with increasing N (5 → 10 → 20 → 50) to find where dedup breaks or latency spikes.

**CLI:**
```bash
node cli/test/stress/runner.js \
  --scenario double-send \
  --workers 20 \
  --document-id E2F7A13B \
  --window-name sales-order \
  --base-url http://localhost:8080 \
  --token $JWT
```

---

## Scenario B — concurrent-load

**Purpose:** Find the throttle ceiling. Simulates K distinct users sending different documents through the same contract simultaneously.

**Mechanics:**
- Each worker gets a distinct `documentId` from a provided list (or auto-generated sequential IDs).
- Workers are launched simultaneously with `Promise.allSettled()`.
- Optional `--delay-ms` introduces a stagger between worker launches (ramp-up mode).
- Each worker calls `sendDocumentEmail()` with its own document — idempotency keys are unique per worker.

**What to measure:**
| Metric | Description |
|--------|-------------|
| `total_requests` | Total workers launched |
| `accepted` | HTTP 200 responses |
| `throttled` | HTTP 429 responses |
| `errors` | Other failures |
| `latency_p50_ms` | Median latency |
| `latency_p95_ms` | 95th percentile latency |
| `first_throttle_at` | Worker index where first 429 appeared |
| `throttle_rate_pct` | `throttled / total_requests * 100` |

**Limit discovery:** Run with increasing K (5 → 10 → 25 → 50 → 100) to find the throttle threshold. The `first_throttle_at` metric tells you where the contract's rate limit kicks in.

**CLI:**
```bash
node cli/test/stress/runner.js \
  --scenario concurrent-load \
  --workers 50 \
  --document-ids id1,id2,id3,...   # comma-separated, or --count 50 for auto-sequential
  --window-name sales-order \
  --base-url http://localhost:8080 \
  --token $JWT \
  --delay-ms 0                     # 0 = all at once, >0 = stagger
```

---

## Parametrization

| Flag | Env var | Default | Description |
|------|---------|---------|-------------|
| `--scenario` | `STRESS_SCENARIO` | required | `double-send` or `concurrent-load` |
| `--workers` | `STRESS_WORKERS` | `10` | Number of concurrent workers |
| `--document-id` | `STRESS_DOC_ID` | required for double-send | Single document ID |
| `--document-ids` | `STRESS_DOC_IDS` | required for concurrent-load | Comma-separated IDs |
| `--count` | `STRESS_COUNT` | — | Auto-generate N sequential synthetic IDs |
| `--window-name` | `STRESS_WINDOW` | `sales-order` | Contract name source |
| `--base-url` | `ETENDO_BASE_URL` | `http://localhost:8080` | Etendo server root |
| `--token` | `ETENDO_TOKEN` | required | JWT bearer token |
| `--delay-ms` | `STRESS_DELAY_MS` | `0` | Stagger between worker launches (ms) |
| `--timeout-ms` | `STRESS_TIMEOUT_MS` | `10000` | Per-request timeout |
| `--pdf-blob` | `STRESS_PDF_BLOB` | synthetic 1KB blob | Path to a real PDF for preview cache |
| `--reset-safety` | `STRESS_RESET_SAFETY=1` | off | Delete pre-existing `ETGO_EMAIL_SAFETY` record-throttle rows and matching audit rows before the run |
| `--db-gradle-properties` | `STRESS_DB_GRADLE_PROPERTIES` | `etendo_core/gradle.properties` when present | Gradle properties file used to connect to the Etendo DB for `--reset-safety` |

`--reset-safety` is intended for repeatable local/staging limit discovery. It clears stale
`THROTTLE` rows only for `scope=RECORD` and the target document IDs before the workers launch, so
the run measures the current burst instead of a previous per-record throttle window. It also removes
matching `AUDIT` rows for the target contract/document IDs so idempotency starts clean. It does not
remove tenant/global/template/recipient/domain throttle rows, `KILL_SWITCH`, or `SUPPRESSION` rows;
those validations remain part of the real contract behavior.

---

## Report format

Terminal output after all workers settle:

```
Email Stress Test — double-send (20 workers)
────────────────────────────────────────────
  Accepted:      1   (5%)
  Deduplicated:  19  (95%)
  Throttled:     0
  Errors:        0
  PDF cache fails: 0

  Latency (ms):  min=42  p50=87  p95=201  max=312

  Result: PASS — idempotency dedup working correctly
────────────────────────────────────────────
```

Exit code: `0` = all assertions pass, `1` = unexpected errors or dedup failures.

## Limit probe runner

Use Make for repeatable local/staging runs that discover limits across multiple worker counts:

```bash
make email-stress-limits \
  TOKEN="$JWT" \
  DOC_ID=E2F7A13B \
  WORKER_STEPS=1,2,5,10,20,50
```

Equivalent concurrent-load probe:

```bash
make email-stress-limits \
  SCENARIO=concurrent-load \
  TOKEN="$JWT" \
  DOC_IDS=id1,id2,id3,id4,id5 \
  WORKER_STEPS=5,10,25,50
```

Generate a Jest/JUnit-style HTML report during the same run:

```bash
make email-stress-limits-report \
  TOKEN="$JWT" \
  DOC_ID=E2F7A13B \
  WORKER_STEPS=1,2,5,10,20,50,75,90,95,96,97 \
  EMAIL_STRESS_REPORT=docs/reports/email-stress-limit-report.html
```

The report target writes the HTML file even when the probe exits with a failure because a limit was
found. Tokens are redacted from the command block in the generated report.

The limit runner executes every worker step, prints per-step progress, then prints a final table:

```
Email Stress Limit Probe — double-send
────────────────────────────────────────────────────────────────────────────────────────────
  reset-safety: yes

  workers | accepted | dedup | throttled | errors | pdf_fail | p50_ms | p95_ms | max_ms | verdict
  --------+----------+-------+-----------+--------+----------+--------+--------+--------+---------
        1 |        1 |     0 |         0 |      0 |        0 |    120 |    120 |    120 | dedup-ok
        2 |        1 |     1 |         0 |      0 |        0 |    180 |    220 |    220 | dedup-ok
       20 |       20 |     0 |         0 |      0 |        0 |   2843 |   2973 |   2985 | dedup-broken
```

For double-send, the important limit signal is the first worker count where `accepted > 1`,
`dedup != workers - 1`, `errors > 0`, or `pdf_fail > 0`. `accepted/dedup` isolates email idempotency,
while `errors/pdf_fail` captures the complete document-email flow. For concurrent-load, the important
signal is the first step with throttling and the `first_429` worker index.

---

## Pre-conditions (before running)

1. Etendo Go running locally or on staging.
2. Email provider adapter mocked — set `ETGO_EMAIL_PROVIDER=noop` (or equivalent config) so no real emails are sent.
3. Valid JWT token with role that can execute the target contract.
4. At least one real document ID in the DB for the chosen window.
5. `ETENDO_TOKEN` and `ETENDO_BASE_URL` exported in the shell.

---

## What this does NOT replace

- Contract unit tests (throttle logic, idempotency key generation) — those live in Etendo Go's JUnit suite.
- Vitest component tests for button disable state in `SendDocumentModal` — those are separate and already exist.
- This harness finds *system limits* under real load, not behavioral correctness.
