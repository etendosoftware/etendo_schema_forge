# Flag Debt Scorecard (v0)

Every feature flag is a loan. It buys the ability to ship unfinished work safely,
and it charges interest for as long as it lives: extra branches to reason about,
extra paths to test, and a removal cost that grows the further its references
spread. This scorecard measures that interest **per flag**, so the cost is a
number someone can act on instead of a feeling.

`make flag-debt` reads flag metadata from [`flags-registry.json`](../flags-registry.json)
and derives a score from the working tree. Higher is worse.

**v0 is report only.** The command always exits 0. Thresholds, trend lines and
CI gating are deliberately out of scope — first make the number visible, then
argue about what it should be.

---

## What it measures

Four dimensions, summed into one score.

### 1. Touch points — how expensive is removal?

Every reference to the flag that lives **outside** the flag's own files. These
are what a person has to find and delete when the flag is retired, so their
count is the removal cost.

The scorer greps each flag's `symbols` across both repos and buckets every
matching file:

| Bucket | What it is | Scored? |
|--------|-----------|---------|
| **owned** | Files under the flag's `paths` — deleted wholesale at removal | no |
| **framework** | `conventions.frameworkPaths` — shared flag infrastructure, belongs to no flag | no |
| **code** | Everything else: the shared files that reach into the flag | **yes** |
| **docs** | `*.md` | no — counted and shown, but documenting a flag is not debt |
| **tests** | `__tests__/`, `src-test/`, `*.spec.*`, `*.vitest.*`, `*Test.java`, and any declared spec | no — already priced by dimension 2 |

**Points:** `2 per code file beyond the first 3`. Three are free because a
flag legitimately needs a route registration, a menu entry and a backend
enforcement point. The fourth shared file is where smearing starts.

### 2. Tests — is the flagged behaviour actually pinned?

Each path in `testSpecs` is checked for existence on disk, and every spec is in
one of four states. The distinction between the last two is the point:

| State | Declared as | Meaning |
|-------|-------------|---------|
| **present** | — | On disk. |
| **pending** | `expected: true` | Missing, and someone is expected to write it. Transient. |
| **accepted-debt** | `acceptedDebt: true` | Missing, and the team decided **not** to write it. Standing. |
| **missing** | neither marker | Missing with no declared intent either way. |

An empty promise never scores as a kept one, and `acceptedDebt` wins over
`expected` if both are set — overloading "expected" to mean both *queued* and
*deliberately deferred* is how a registry stops being trusted. An optional
`note` on any spec overrides the default label in the report.

**Points:** `+5 if any unit spec is pending`, `+8 if any e2e spec is pending` —
flat per list, because the signal is "this flag's suite has a hole", and e2e
costs more because a flag most often breaks in the wiring, not the unit.
Accepted-debt specs are charged the same amount but **per item**: a standing
decision not to test something is owned individually, and unlike a pending spec
it does not disappear when the rest of the suite lands. That is deliberate — an
accepted gap should still be visible on the scorecard once everything else is
green, which is exactly when it would otherwise be forgotten.

**Points:** `+5 if any unit spec is missing`, `+8 if any e2e spec is missing`.
Flat per list, not per file — the signal is "this flag's suite has a hole",
and e2e costs more because a flag most often breaks in the wiring, not the unit.

### 3. Coverage — how much of the owned code is untested?

If `SONAR_TOKEN` is set, every owned source file is passed to
`sonar-coverage.sh`, which reads the **existing** SonarQube analysis (it runs no
scan). See [`sonar-file-coverage-investigation.md`](sonar-file-coverage-investigation.md).

**Points:** `1 per 10 uncovered lines`, per owned file.

If `SONAR_TOKEN` is unset, the script is not installed, or the server has no
analysis for a file, the dimension prints `coverage: unavailable (<reason>)` and
adds **0 points**. It never fails the run — missing infrastructure must not look
like a clean bill of health, but it must not block the report either.

### 4. Lifecycle — is the flag overdue?

`ttl` is the date the flag should be gone.

**Points:** `0` while the TTL is in the future; `3 per started week` once it is
past. A flag a day overdue costs 3; a flag eight days overdue costs 6.

### Open items (`deferredItems`) — carried, not scored

Not every liability a flag carries is a test gap or a stray reference. A flag can
also be holding open decisions: a correctness precondition that blocks the next
step, a cosmetic follow-up parked behind a package bump. Those live in
`deferredItems` and are **unscored in v0** — they are rendered on the flag's card
in both the console report and the HTML so that when the TTL fires, whoever picks
up the removal sees them *before* starting the work they block, not during it.

```jsonc
"deferredItems": [
  {
    "id": "targeting-key-divergence",
    "kind": "precondition",              // precondition | cosmetic | open
    "note": "What is open, and what it blocks.",
    "refs": ["docs/feature-flags.md — 'Open: targeting keys do not match'"]
  }
]
```

Keep `refs` specific enough to navigate to — a document plus the section or line,
not just a filename. A reference nobody can follow is the same as no reference.

---

## The points scale

| Dimension | Rule | Points |
|-----------|------|--------|
| Touch points | per code file beyond the first 3 | 2 |
| Tests | any unit spec pending (flat) | 5 |
| Tests | any e2e spec pending (flat) | 8 |
| Tests | per accepted-debt unit spec | 5 |
| Tests | per accepted-debt e2e spec | 8 |
| Coverage | per 10 uncovered lines in an owned file | 1 |
| Lifecycle | per started week past TTL | 3 |

All of it lives in the `POINTS` object at the top of
[`cli/src/flag-debt.js`](../cli/src/flag-debt.js) — one place to tune the scale.

---

## How to run it

```bash
make flag-debt                      # every registered flag, console report
make flag-debt FLAG=tenant-upgrade  # one flag
make flag-debt JSON=1               # also write flag-debt.json
make flag-debt HTML=1               # also write flag-debt.html (the per-flag panel)
node cli/src/flag-debt.js --help    # full flag list
```

Environment:

| Variable | Effect |
|----------|--------|
| `SONAR_TOKEN`, `SONAR_HOST_URL` | Enable the coverage dimension. Unset ⇒ coverage reported as unavailable, 0 pts. |
| `ETENDO_GO_MODULE` | Path to the `com.etendoerp.go` checkout. |

The backend module is a separate, git-ignored checkout, so it is **absent from a
worktree**. The scorer looks for it under the repo root, then under the main
checkout (a worktree lives at `<main>/.worktrees/<name>`), then at
`ETENDO_GO_MODULE`. If none exists it prints a warning and scores the frontend
alone rather than failing.

---

## Where debt lives

| Thing | Committed? | Why |
|-------|-----------|-----|
| `flags-registry.json` | **yes** | Metadata only: who owns the flag, what it gates, which files are its own, when it should die. |
| The score | **no** | Always derived, on demand, from the current tree. A stored score is a stale score. |
| `flag-debt.json`, `flag-debt.html` | **no** — git-ignored | Generated output. |

The registry lives at the **repo root**, next to `package.json` and the
`Makefile`, because it spans both repos: it names frontend paths in this repo
and backend paths in `com.etendoerp.go`. Filing it under `cli/` or `docs/`
would imply it belongs to one tool or is documentation; it is neither.

---

## Registering a new flag

Add an entry to `flags-registry.json`:

```jsonc
{
  "key": "my-flag",                       // matches the frontend constant and the backend property suffix
  "description": "What it gates, in one sentence.",
  "owner": "github-username",
  "jira": "ETP-1234",
  "created": "2026-07-27",                // ISO date
  "ttl": "2026-10-25",                    // ISO date — when this flag should be gone
  "defaultValue": false,
  "symbols": ["my-flag", "MY_FLAG"],      // grep terms that find every reference
  "paths": {
    "frontend": ["tools/app-shell/src/lib/my-feature/"],
    "backend":  ["src/com/etendoerp/go/myfeature/"]
  },
  "testSpecs": {
    "unit": [
      { "root": "frontend", "path": "…/__tests__/my-feature.test.js", "expected": true },
      { "root": "backend",  "path": "…/SomeServiceTest.java",
        "acceptedDebt": true, "note": "why the team chose to carry this" }
    ],
    "e2e":  [{ "root": "frontend", "path": "e2e/tests/flows/my-flag.mocked.spec.js", "expected": true }]
  }
}
```

Three things are worth getting right:

- **`paths` are owned code only** — files that exist *because* the flag exists
  and are deleted with it. A shared file the flag merely touches does not belong
  here; leaving it out is what lets it be counted as removal cost.
- **`symbols` must find references that never name the flag.** `tenant-upgrade`
  declares `UpgradePage` and `lib/upgrade` alongside the key and its constants,
  because `runtime-routes.jsx` only lazy-imports the page — a key-only grep
  would miss a real touch point and under-report the debt.
- **`ttl` is a commitment, not a formality.** A placeholder date is fine as a
  starting point as long as it is labelled (`ttlNote`), but a flag whose TTL is
  never revisited is exactly the flag this scorecard exists to surface.

`frameworkPaths` under `conventions` are shared across all flags and normally
need no change — they are matched as path fragments, which is why the backend
entry has no `src/` prefix (it also covers `src-test/`).

---

## Relationship to the flag layout rule

This scorecard only works because of the code layout rule documented in
[`feature-flags.md`](feature-flags.md) → *Architecture: flag code layout*:

1. Each flag owns its files.
2. Shared files hold greppable toggle points only, never business logic.
3. Framework files belong to no flag.

Rule 1 is what makes `paths` (and therefore the coverage dimension) meaningful.
Rule 2 is what makes touch points countable instead of an archaeology exercise.
Rule 3 is why `lib/flags/` and the backend `featureflags/` package are excluded
from every flag's attribution.

Break the layout and the score silently stops meaning anything — the numbers
stay plausible while the flag's real code hides in files nobody attributed to it.

---

## Roadmap (out of scope for v0)

- **An internal `/flags` panel in app-shell.** The HTML output is the minimal
  version of it. A real panel would follow the existing `VITE_SHOW_ARTIFACTS`-gated
  `/artifacts` page pattern: an internal-only route that renders the same report
  live, instead of a file someone has to remember to regenerate.
- **CI snapshots for trends.** Score on every build, keep the JSON, and chart it.
  A flag's debt going up week over week is a stronger signal than any absolute
  number this scale produces.
- **Thresholds and gating.** Only once there is enough history to know what a
  bad score actually looks like.
