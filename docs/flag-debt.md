# Flag Debt Scorecard (v0)

Every feature flag is a loan. It buys the ability to ship unfinished work safely,
and it charges interest for as long as it lives: extra branches to reason about,
extra paths to test, and a removal cost that grows the further its references
spread. This scorecard measures that interest **per flag**, so the cost is a
number someone can act on instead of a feeling.

`make flag-debt` reads flag metadata from [`flags-registry.json`](../flags-registry.json)
and derives a score from the working tree. Higher is worse. Each repo owns its own
registry; `make flag-debt-rollup` scores a feature across all of them
(see [Per-repo registries and the rollup](#per-repo-registries-and-the-rollup)).

**v0 is report only.** The command always exits 0. Thresholds, trend lines and
CI gating are deliberately out of scope — first make the number visible, then
argue about what it should be.

---

## What it measures

Five dimensions, summed into one score.

### 1. Touch points — how expensive is removal?

Every reference to the flag that lives **outside** the flag's own files. These
are what a person has to find and delete when the flag is retired, so their
count is the removal cost.

The scorer greps each flag's `symbols` across every repo it covers and buckets every
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

### 5. Open items — what the flag is still holding

Not every liability a flag carries is a test gap or a stray reference. A flag can
also be holding open decisions: a correctness precondition that blocks the next
step, a cosmetic follow-up parked behind a package bump. Those live in
`deferredItems`, and they are rendered on the flag's card in both the console
report and the HTML so that when the TTL fires, whoever picks up the removal sees
them *before* starting the work they block, not during it.

**Points:** per item, by kind — `precondition: 5`, `open: 3`, `cosmetic: 1`.
A bundled item (one theme, several `components`) adds `1 per component beyond the
first`.

An explicit `points` on an item overrides the formula, but only as a **whole,
non-negative number** — it is labelled *declared* in the report. Anything else
(negative, fractional, non-numeric) is **ignored**, the derived score stands, and
the report says the override was dropped. Debt cannot be negative and the scale
has no halves, so there is no honest guess at the intent; clamping `-50` to `0`
would repair it into something that reads exactly like a deliberate zero, which
is a value someone may legitimately want. A `points: 0` therefore means zero on
purpose, and a rejected override is always visible rather than silently absorbed.

An unrecognised `kind` falls back to the `open` rate rather than suppressing the
item — a typo must never hide debt — and renders as `[preconditon → open rate]`
so the fallback is not mistaken for a valid kind.

`precondition` is anchored to the missing-unit-spec penalty: one decision that
blocks the next step costs the same as one untested unit. `cosmetic` is
deliberately non-zero, because a free bucket is the bucket everything gets
labelled into.

> **Why these score at all** (they did not, at first). The scale already charges
> accepted-debt specs *per item*, on the grounds that a standing decision is owned
> individually and does not evaporate when other work lands. A deferred item is
> exactly that kind of decision — someone chose not to do this yet, and the flag
> carries the consequence until they do. Recording it on the card while leaving it
> out of the number made the number describe less than the card did, which is the
> failure mode this scorecard exists to prevent.

```jsonc
"deferredItems": [
  {
    "id": "targeting-key-divergence",
    "kind": "precondition",              // precondition | cosmetic | open
    "note": "What is open, and what it blocks.",
    "refs": ["docs/feature-flags.md — 'Open: targeting keys do not match'"]
  },
  {
    "id": "real-payment-readiness",
    "kind": "precondition",
    "note": "One theme, several distinct fixes.",
    "components": [                      // 5 + 1 per component beyond the first
      { "id": "gap-replay", "note": "What it is.", "ref": "where to look" }
    ]
  }
]
```

**Bundle a theme, split a schedule.** Use `components` when several fixes share
one trigger and one owner decision — they are one decision with several parts, and
a card with eight sibling entries is a card nobody reads. The moment a component
gets scheduled on its own, promote it to its own item: it has stopped being part
of one decision, and it should carry its own points and its own closure.

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
| Open items | per deferred item of kind `precondition` | 5 |
| Open items | per deferred item of kind `open` | 3 |
| Open items | per deferred item of kind `cosmetic` | 1 |
| Open items | per bundled component beyond the first | 1 |

All of it lives in the `POINTS` object at the top of
`cli/src/flag-debt.js` in the `schema_forge_core` repo — one place to tune the scale.

---

## How to run it

```bash
make flag-debt                      # every registered flag, console report
make flag-debt FLAG=tenant-upgrade  # one flag
make flag-debt JSON=1               # also write flag-debt.json
make flag-debt HTML=1               # also write flag-debt.html (the per-flag panel)
npx sf-flag-debt --help             # full flag list
make flag-debt LOCAL_CORE=1         # run the core CLI from sibling source
make flag-debt-rollup               # this repo + schema_forge_core + com.etendoerp.go, merged by feature id
```

The scorer is **code owned by `schema_forge_core`** and published in
`@etendosoftware/schema-forge-cli` as the `sf-flag-debt` bin; the registry it reads is
**data owned by this repo**. `make` bridges the two with `SF_ROOT`, which is why the
CLI scores this working tree rather than core's. That split is deliberate: the scale
belongs to one place, the flags belong to whoever declares them. See
[`repo-topology.md`](repo-topology.md) for the two dev profiles.

Environment:

| Variable | Effect |
|----------|--------|
| `SONAR_TOKEN`, `SONAR_HOST_URL` | Enable the coverage dimension. Unset ⇒ coverage reported as unavailable, 0 pts. |
| `SCHEMA_FORGE_CORE` | `make flag-debt-rollup` only: the `schema_forge_core` checkout (default `../schema_forge_core`). |
| `ETENDO_GO_MODULE` | `make flag-debt-rollup` only: the `com.etendoerp.go` checkout (default `../modules/com.etendoerp.go`). |

---

## Per-repo registries and the rollup

Registry **format v3**: a registry has exactly one implicit root — the directory it sits
in. There is no `roots` block, `paths` is a flat list, and a spec carries no `root:`.
Three repos, three registries:

| Registry | Holds | `sonarProject` |
|----------|-------|----------------|
| `etendo_schema_forge/flags-registry.json` | **Headers**, plus this repo's own paths and specs | `schema-forge` |
| `com.etendoerp.go/flags-registry.json` | **Contributions** (backend paths, backend specs) | `etendo-go` |
| `schema_forge_core/flags-registry.json` | **Contributions** — empty today, none of core's packages carry a flag | `schema-forge-core` |

A **header** is the entry as described in *Registering a new feature*: `id`, `description`,
`owner`, `jira`, `created`, the `flag` object (`ttl`, `defaultValue`, `symbols`) and any
`deferredItems` that span repos. A **contribution** is a repo's own slice of a feature whose
header lives elsewhere:

```jsonc
{
  "id": "paid-second-tenant",     // the header's id — this is the join key
  "flagKey": "my-flag",           // the live flag; dropped at retirement (then add "contribution": true)
  "symbols": ["MyFlagService"],   // optional: terms that exist only in this repo
  "paths": ["src/com/etendoerp/go/payment/"],
  "testSpecs": { "unit": [{ "path": "src-test/…/TenantPaywallServiceTest.java" }], "e2e": [] },
  "deferredItems": []
}
```

`ttl`, `ttlNote`, `defaultValue` and a `flag` object are **forbidden** in a contribution; the
local validator rejects the file. TTL and staleness belong to the header, and a
contribution-only registry renders them as *"TTL governed by the header"*. On retirement a
contribution drops `flagKey` the same way a header drops its `flag` object — the entry always
survives.

`sonarProject` replaces the old hardcoded table: it names the Sonar project the registry's
owned files are measured against, and must be a name `cli/sonar-coverage.sh` knows (it builds
that roster from each repo's `sonar-project.properties`). A registry that declares none gets no
coverage score, and the report says why.

A `flag` with `"scope": "backend"` is read only by `com.etendoerp.go` and must not be in
`FLAG_DEFAULTS`; everything else must be (see *Key-sync tests* below).

### `--rollup`: merge, then score

```bash
sf-flag-debt --rollup flags-registry.json ../schema_forge_core/flags-registry.json ../modules/com.etendoerp.go/flags-registry.json
```

The rollup merges entries **by feature id** — one header plus its contributions — and only then
scores the merged feature. It never sums per-repo scores: the flat spec penalties
(`+5` unit, `+8` e2e) belong to the feature, so a feature with pending specs in two repos pays
once, not twice. Touch points are scanned in every repo with the union of the symbols, owned
paths applying per repo; lifecycle comes from the header; open items are the header's plus every
contribution's.

The rollup reports, and never hides:

| Finding | Meaning |
|---------|---------|
| **orphan contribution** | A contribution whose id has no header in any registry. Reported, not scored. |
| **duplicate header** | The same id declared as a header twice. The first is used. |
| **flag key mismatch** | A contribution names a different `flagKey` than its header. |
| **unverifiable** | A registry path that does not exist — an absent checkout. Its contributions are not in the score, and the specs of a merged feature that sit in an absent checkout are listed as *unverifiable* and **not charged**, so the score never depends on which checkouts happen to be on a machine. |

### Key-sync tests

Two hand-edited lists must agree with the registries, in both directions:

- `tools/app-shell/src/lib/flags/__tests__/flag-keys.sync.vitest.js` — `FLAG_DEFAULTS` ↔ the
  headers (the telemetry kill switches in `NO_EXPOSURE_FLAGS` are not features and are exempt).
- `GoFeatureFlagsRegistrySyncTest` in `com.etendoerp.go` — `GoFeatureFlags.FLAG_*` ↔ its
  contributions' `flagKey` ↔ the documented `etendo.go.flags.*` / `ETGO_FLAG_*` names, plus a
  literal-regex backstop that fails on any `isEnabled("…")` call that bypasses a constant.

---

## Where debt lives

| Thing | Committed? | Why |
|-------|-----------|-----|
| `flags-registry.json` | **yes** | Metadata only: who owns the flag, what it gates, which files are its own, when it should die. |
| The score | **no** | Always derived, on demand, from the current tree. A stored score is a stale score. |
| `flag-debt.json`, `flag-debt.html` | **no** — git-ignored | Generated output. |

Each registry lives at its **repo root** (next to `package.json` and the `Makefile`
here, at the module root in `com.etendoerp.go`) and describes only that repo. Filing it under
`cli/` or `docs/` would imply it belongs to one tool or is documentation; it is neither.

---

## Registering a new feature (and its flag)

**The feature is the unit of accounting; the flag is a temporary attribute of it.**
Durable facts — owned paths, declared specs, deferred decisions, and therefore the
debt — live on the feature and keep scoring after the flag is retired. What expires
at the TTL is the *ability to hide*, never the feature or its measurement.

Add an entry to `flags-registry.json`:

```jsonc
{
  "id": "my-feature",                     // durable — survives the flag
  "description": "What the feature does, in one sentence.",
  "owner": "github-username",
  "jira": "ETP-1234",
  "created": "2026-07-27",                // ISO date
  "flag": {                               // temporary — delete this object at retirement
    "key": "my-flag",                     // matches the frontend constant and the backend property suffix
    "scope": "backend",                   // only when the browser never reads it (absent from FLAG_DEFAULTS)
    "defaultValue": false,
    "ttl": "2026-10-25",                  // ISO date — when this flag should be gone
    "symbols": ["my-flag", "MY_FLAG"]     // grep terms that find every reference
  },
  "paths": ["tools/app-shell/src/lib/my-feature/"],   // this repo only — flat, relative to the registry
  "testSpecs": {
    "unit": [{ "path": "…/__tests__/my-feature.test.js", "expected": true }],
    "e2e":  [{ "path": "e2e/tests/flows/my-flag.mocked.spec.js", "expected": true }]
  }
}
```

The backend half goes in `com.etendoerp.go/flags-registry.json` as a contribution with the same
`id` (see *Per-repo registries and the rollup*): its `paths`, its `testSpecs`
(`"acceptedDebt": true, "note": "why the team chose to carry this"` works there too).

A feature with no `flag` object is a **shipped** feature: touch points and lifecycle
stop applying (there is nothing to retire and no expiry to miss), while tests,
coverage and open items keep scoring. Retiring a flag therefore lowers the score
without deleting the accounting — deleting the whole entry would delete the
*evidence*, not the debt.

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
entry (in `com.etendoerp.go`'s registry) has no `src/` prefix (it also covers `src-test/`).

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
