# Flaky mocked tests: log and quarantine

A mocked Playwright test is flaky when it fails and then passes with no code change: Playwright
reports it as `flaky` (failed, passed on its retry), or a failed run passes when re-run as is.
Since ETP-5695 the mocked suite gates every pull request, so a flake now blocks whoever opened the
PR rather than whoever cuts develop into main. Four distinct mocked flakes showed up in one week of
October 2026. This page is where flakes are recorded, and where the rule for setting one aside lives.

## Where flakes show up

- **Pre-push:** the summary lists them under `⚠️ Flaky (failed once, passed on retry)`.
- **Jenkins and `make test-e2e-headless`:** Playwright's own summary at the end of the mocked run,
  a `N flaky` line followed by the test names.

A test that fails on every run is not flaky. It is a bug or a broken test: fix it, never
quarantine it.

## Log every flake

Add a row to the [log](#log) for each flake you see, even when the retry saved the run: the date,
the test as Playwright prints it, where it happened (pre-push, or the Jenkins job and build), and
what failed. The log is what tells a one-off apart from a pattern.

## When to quarantine

Quarantine a test when either holds:

- it flaked twice within 14 days, or
- it failed a run even with its retry, blocked a PR, and cannot be fixed the same day.

When the flake follows the machine's load (it fails with 4 workers and passes alone), the spec may
belong in `MOCKED_SERIAL_SPECS` in `e2e/playwright.config.js` instead (ETP-5307), which runs whole
files one at a time without leaving them out.

## How the quarantine works

`e2e/quarantine.json` lists the quarantined tests. Every gating run leaves them out (the pre-push,
the Jenkins mocked stage, the per-PR pipeline): `e2e/playwright.config.js` turns the list into the
`grepInvert` of the `mocked` and `mocked-serial` projects. Right after the mocked suite,
`scripts/run-e2e-full.sh` runs the quarantined tests on their own (`E2E_QUARANTINE=only`) without
blocking, and says whether they passed.

An entry names one test of one file:

```json
{
  "file": "tests/flows/accounting/calendar.mocked.spec.js",
  "title": "Calendar — Cerrar Año guard › stays disabled while a period is still open",
  "reason": "times out waiting for the periods grid, about one run in five",
  "ticket": "ETP-NNNN",
  "since": "2026-10-13",
  "until": "2026-10-27"
}
```

- `title` is the describe path and the test name joined by ` › `, as Playwright prints it.
- `ticket` is the task that fixes the test; its assignee owns the entry.
- `until` is at most 14 days after `since`.

`node scripts/lib/playwright-quarantine.js check` validates the list: required fields, a file and a
title that still exist, the 14-day cap. `run-e2e-full.sh` runs it before every quarantined pass and
warns about expired entries; `scripts/__tests__/playwright-quarantine.test.js` fails on a broken entry.

## Leaving the quarantine

- **Fixed:** remove the entry in the PR that fixes the test.
- **Expired without a fix:** whoever cuts develop into main decides: extend it once, with a new
  `until` and a comment on the ticket, or delete the test.
- **Passing again in the quarantined pass:** after a few clean runs, remove the entry.

## Log

| Date | Test | Where | What failed | Status |
|---|---|---|---|---|
| 2026-08-26 | `flows/calendar.mocked.spec.js` › Finance menu › shows only Calendar, not Fiscal Calendar or Periods | pre-push | passed on retry | test renamed or removed since |
| 2026-09-16 | `flows/fiscal-models-303-identification.mocked.spec.js` › FM 303 — sin_actividad checkbox › sin_actividad checkbox is rendered and initially unchecked | pre-push | passed on retry | test renamed since; the spec runs in `mocked-serial` |
