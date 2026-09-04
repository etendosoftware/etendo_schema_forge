# CI parity install (`make ci-parity`)

Brings the **local** Etendo checkout into the same shape a CI build installs — same
source modules, same branches — then optionally drops an isolated database and runs
the same four gradle commands CI runs.

**Dry run is the default.** `make ci-parity` never executes anything; it prints a plan.
Execution requires `DRY_RUN=0` explicitly.

- Tool: `cli/src/ci-parity.js`
- Profiles: `pipelines/ci-parity-profiles.json`
- Targets: `make ci-parity`, `make ci-parity-help`

---

## 1. What CI actually does

Every claim below is anchored to a line in `pipelines/Jenkinsfile`, which is the
authoritative description of the etendo_schema_forge CI job.

### 1.1 Layout

CI clones schema-forge *inside* core, so **core is the parent**:

| Var | Value | Line |
|---|---|---|
| `CORE_DIR` | `etendo_core` | `pipelines/Jenkinsfile:33` |
| `SCHEMA_FORGE_DIR` | `${CORE_DIR}/etendo_schema_forge` | `pipelines/Jenkinsfile:34` |
| `GO_MODULE_DIR` | `${CORE_DIR}/modules/com.etendoerp.go` | `pipelines/Jenkinsfile:35` |

On a typical dev machine the layout is **inverted** — core is a *subdirectory* of
schema-forge (`schema-forge/etendo_core`). `resolveCoreDir()` probes for
`<candidate>/modules` and accepts either, reporting which one it found as
`layout: core-as-subdir | core-as-parent`.

### 1.2 Branch resolution

`checkoutChain()` (`pipelines/Jenkinsfile:173-185`) builds a per-repo chain:

| Driving branch (`$GIT_BRANCH`) | First checkout | Then always |
|---|---|---|
| `hotfix/*` | `main` | `git checkout $GIT_BRANCH \|\| keep previous` |
| `feature/*` | `epic/PARENT \|\| develop` | `git checkout $GIT_BRANCH \|\| keep previous` |
| anything else (incl. `mergeblock/*`) | `develop` | `git checkout $GIT_BRANCH \|\| keep previous` |

The trailing `git checkout $GIT_BRANCH || echo …` means **the exact branch wins if it
exists in the target repo**, otherwise the previous checkout stands. `resolveExpectedBranch()`
mirrors this by taking the *last* candidate in chain order that actually exists.

Two hardcoded overrides break that chain:

- **`etendo_core` is pinned to `epic/ETP-3504`** on every non-hotfix build
  (`pipelines/Jenkinsfile:195-198`), because core's `develop` is behind it — classes such as
  `InitialOrgSetupAccounting*` exist only on the epic branch. `$GIT_BRANCH` still wins if
  it exists in core.
- **Eight extra modules are pinned to `epic/ETP-3504` with NO `$GIT_BRANCH` override**
  (list at `pipelines/Jenkinsfile:230-239`, applied at `:246-252`). They are the eight
  entries of `pipelines/extra-modules.txt`.

Both overrides carry a `TODO: Remove this block` in the Jenkinsfile. When they go,
update `branchPolicy` in `pipelines/ci-parity-profiles.json` — no code change needed.

### 1.3 Modules cloned from source

| Source | What it clones | Line |
|---|---|---|
| `CORE_URL_REPO` | `etendo_core` | `:203-208` |
| `GO_MODULE_SSH` | `com.etendoerp.go` into `modules/` | `:210-218` |
| `EXTRA_MODULES_FILE` = `pipelines/extra-modules.txt` | **8** modules into `modules/` | `:30`, `:220-263` |

Everything else resolves as a **published JAR**. The list format is one SSH URL per
line, `#` comments and blank lines ignored (`:224-227`).

A second, differently-formatted list exists: `modules/com.etendoerp.go/jenkinsExtraModules.txt`
— a *single comma-separated line* of **15** SSH URLs. It is consumed by the
**com.etendoerp.go repository's own** Jenkins job, **not** by this repo's Jenkinsfile.
Both formats are parsed (`parseNewlineModuleList`, `parseCommaModuleList`).

### 1.4 Install

`pipelines/Jenkinsfile:425-470` writes a `gradle.properties` from scratch, then runs
from the core dir, in this order:

```
./gradlew prepareConfig --info --stacktrace
./gradlew setup --info --stacktrace
./gradlew expandModules --info --stacktrace
./gradlew install -PignoreConsistency=true --info --stacktrace
```

CI's database is an **empty postgres sidecar**: `bbdd.sid=etendo`, `bbdd.port=5432`,
`bbdd.systemUser=postgres` (`:5-11`). There is no `createdb` step — `install` creates
the database itself. That is why the `db` phase here only *drops*.

---

## 2. Profiles

A profile declares which **source** modules must exist for a local checkout to match
a given CI job. Profiles point at the two list *files* rather than duplicating URLs,
so the lists stay single-source-of-truth; only extras present in neither list are literal.

| Profile | Required from source | Use it when |
|---|---|---|
| **`union`** (default) | `com.etendoerp.go` ∪ the 15 from `jenkinsExtraModules.txt` ∪ `com.etendoerp.go.localization.es.data` → **17** | You want one checkout that satisfies **both** CI jobs, so a green local install predicts green on either side. The only profile under which the local pgvector work is exercised from source. |
| `schema-forge-ci` | `com.etendoerp.go` + the 8 from `pipelines/extra-modules.txt` → **9** | Reproducing a red **etendo_schema_forge** build faithfully, including the 7 modules that job takes as published JARs. |
| `go` | `com.etendoerp.go` + the 15 → **16** | The failure under investigation belongs to the **com.etendoerp.go** repo's pipeline. |

### 2.1 Why `com.etendoerp.go.localization.es.data` is in `union`

It is a declared `AD_MODULE_DEPENDENCY` of `com.etendoerp.go` — dependency name
*"Etendo Go - Spanish Fiscal Taxes Data"*, see
`modules/com.etendoerp.go/src-db/database/sourcedata/AD_MODULE_DEPENDENCY.xml` — yet it
appears in **neither** Jenkins list. It is present locally. The `union` profile includes
it so the profile matches what the module graph actually requires.

### 2.2 Excluded modules (never flagged, never touched)

| Module | Why |
|---|---|
| `com.etendoerp.docker` | Local dev infrastructure, enabled by `docker_com.etendoerp.docker_db=true`. Provisions the local postgres container; CI uses an empty sidecar and has no equivalent module. |
| `com.etendoerp.tomcat` | Local dev infrastructure, enabled by `docker_com.etendoerp.tomcat=true`. Provisions the local Tomcat; CI runs in a `compiler` container. |

Anything else present under `modules/` and not required by the profile is **EXTRA**.

### 2.3 The published-JAR warning

Under `union`, seven modules are required from source but are absent from
`pipelines/extra-modules.txt`, so **this repo's CI resolves them as published JARs** and
local source changes to them are not exercised there:

`com.etendoerp.copilot`, `com.etendoerp.db.extended`, `com.etendoerp.psd2.bank.integration`,
`com.smf.currency.apiconfig`, `com.smf.currency.conversionrate`,
`org.openbravo.module.aeat303.es`, `org.openbravo.module.bptaxidkey`

This is reported as an informational **WARN**, not a failure. It carries one explicit
callout: **`com.etendoerp.db.extended` as a published JAR would NOT carry the ETP-5077
pgvector work**, which exists only on its local source branch.

---

## 3. Phases

Four phases, each independently selectable via `PHASES=`, each gated.

### `verify` — refreshed classification

Classifies every directory under `<core>/modules`, plus both host repos
(`etendo_core`, `etendo_schema_forge`), into a traffic-light table with branch,
expected branch, CI delta, and an independent freshness verdict. Before it
measures, it runs `git fetch --all --prune` in every checkout. Fetch updates
remote-tracking refs only; it does not change a worktree, index, branch, or
commit.

The **`CI Δ`** column reads **`+ahead/-behind`** versus `origin/develop`, computed as two separate counts so
the direction cannot be misread:

- `+N` = `git rev-list --count origin/develop..HEAD` — commits this branch has that
  `origin/develop` does **not**. This is the number that matters for work loss.
- `-N` = `git rev-list --count HEAD..origin/develop` — commits `origin/develop` has that
  this branch does not.

So `+162/-1` means 162 ahead and 1 behind. Do not read it off
`git rev-list --left-right --count origin/develop...HEAD`, whose `left right` output puts
**behind first** — that ordering is exactly what got the direction reversed in the first
place.

**`CI Δ` is not a freshness result.** A feature branch can legitimately be far ahead of
`develop` and still be completely current with its own remote. The separate **`UPSTREAM Δ`**
column compares `HEAD` with the branch's configured `@{upstream}` and reads the same way:
`+local-ahead/-remote-ahead`. `FRESHNESS` turns that into a direct verdict:

| `FRESHNESS` | Meaning |
|---|---|
| `CURRENT` | Exactly matches its configured upstream. |
| `STALE` | The upstream has commits this checkout lacks. |
| `DIVERGED` | Both local and upstream have unique commits; it is stale and cannot fast-forward without resolving divergence. |
| `AHEAD` | Local commits have not reached the upstream. This is not stale, but it is useful publication information. |
| `NO-UPSTREAM` | Detached or untracked branch; freshness cannot be asserted. |
| `UNKNOWN` | Git could not compute the comparison. |

The report header says whether refs were **fetched** or **cached**. Set `NO_FETCH=1`
(or pass `--no-fetch`) only for offline use; it retains the cached comparison but explicitly
marks that it may no longer describe the remote.

| Status | Light | Meaning |
|---|---|---|
| `OK` | green | Required, present, on the expected branch, clean. |
| `DRIFT` | yellow | Required and clean, but on a different branch than CI would resolve. `align` fixes it. |
| `MISSING` | yellow | Required but absent. `align` clones it. |
| `EXTRA` | yellow | A real module, present, not required by the profile. `align` parks it. |
| `UNPINNED` | grey | Present from source as required, but **no expected branch is asserted** — see below. |
| `EXCLUDED` | grey | Deliberately out of scope. Never touched. |
| `DIRTY-BUILD` | yellow | Dirt confined to tracked gradle output under `build/`. `align` proceeds over it. |
| `DIRTY` | **RED** | Uncommitted changes to **source** (anything outside `build/`). **Blocker.** |
| `STRAY` | **RED** | Present but has neither `.git` nor `src-db/database/sourcedata/AD_MODULE.xml`, so it is not a module checkout at all. **Blocker.** |

#### `DIRTY` vs `DIRTY-BUILD`

Three third-party modules — `com.etendoerp.sif.general`, `com.etendoerp.verifactu`,
`com.smf.ticketbai` — **track their compiled `.class` files**. A plain build therefore
leaves them permanently "dirty" with deleted tracked artifacts under `build/classes/`.
Treating that as a blocker would wedge `align` forever on a checkout that has nothing
wrong with it, so the dirt is split:

- dirt confined to tracked paths under `build/` → `DIRTY-BUILD`, a WARN. A checkout
  restores those files; no human work exists to lose. `align` proceeds, and the reason
  line names the paths.
- **any** dirty path outside `build/` → `DIRTY`, a hard blocker, and `align` skips the
  module. One source path among a hundred build paths is enough to block.

`isBuildOutputPath()` requires a strict `build/` **prefix** relative to the module root,
which is where gradle writes. A deeper segment such as `src/main/build/x` is *not*
treated as disposable — being generous there would weaken the guarantee.

**`UNPINNED` is deliberate honesty.** A module reachable only through
`com.etendoerp.go`'s own `jenkinsExtraModules.txt` is never cloned by *this* repo's
Jenkinsfile, and the Go job's branch logic lives in a repo not readable from here.
Nothing available locally grounds an expected branch for it, so none is claimed and no
checkout is ever planned. `branchPolicySourceFor()` classifies each module as
`jenkinsfile-hardcoded`, `jenkinsfile-chain`, or `ungrounded`.

#### `unpinnedPolicy` — what happens to `UNPINNED` modules

`UNPINNED` is honest, but on its own it is also a **gap**: those modules are simply not
aligned. Under `union` that leaves, for example, `com.etendoerp.psd2.bank.integration`
sitting on `feature/ETP-5061`, 162 commits ahead of `develop`, inside an install that is
supposed to be CI parity.

Rather than invent a branch policy in code, each profile declares one in
`pipelines/ci-parity-profiles.json`:

| `unpinnedPolicy` | Behavior |
|---|---|
| **`report-only`** (default) | Ungrounded modules are **reported but NOT aligned**. Their EXPECTED column stays `-` and `align` plans no step for them. Safe: nothing is moved off a branch that is ahead of `develop`. |
| `develop-then-branch` | Applies the **else** branch of `checkoutChain()` (`pipelines/Jenkinsfile:179-181`) — the chain a non-feature driving branch gets: `develop`, then `$GIT_BRANCH` if it exists in that repo. They then classify as `OK`/`DRIFT` like any other module. |

`report-only` is the default because it is both the **honest** and the **safe** choice.

Honest: nothing readable from this repo says which branch those modules belong on. This
repo's Jenkinsfile never clones them (they are published JARs), and the Go job's branch
logic lives in the `com.etendoerp.go` repo. Picking `develop` for them would be this tool
asserting a policy no pipeline states.

##### Safe: the work-loss risk of `develop-then-branch`

These modules are not merely on a *different* branch — several are far **ahead** of
`develop`, carrying commits `develop` does not have:

| Module | Branch | Ahead of `develop` | What would be lost from the install |
|---|---|---|---|
| `com.etendoerp.psd2.bank.integration` | `feature/ETP-5061` | **+162** | the entire PSD2 bank-integration branch |
| `org.openbravo.module.aeat303.es` | `epic/ETP-3504` | +26 | epic work not yet on `develop` |
| `com.etendoerp.copilot` | `epic/ETP-3504` | +24 | epic work not yet on `develop` |
| `com.smf.currency.conversionrate` | `epic/ETP-3504` | +13 | epic work not yet on `develop` |
| `com.etendoerp.db.extended` | `feature/ETP-5077` | +11 | **the ETP-5077 pgvector work** |
| `com.smf.currency.apiconfig` | `epic/ETP-3504` | +8 | epic work not yet on `develop` |
| `org.openbravo.module.bptaxidkey` | `epic/ETP-3504` | +8 | epic work not yet on `develop` |

Switching a profile to `develop-then-branch` would move each of these down to `develop`.
**The checkout is non-destructive to the repository** — every one of those commits stays
on its branch and nothing is lost from git. But **the module that gets INSTALLED is the
working tree**, so all of that work silently drops out of the install. You would get a
checkout that reports as aligned and an Etendo that quietly lacks 162 commits of PSD2 and
the pgvector capability.

That is why the flag is opt-in per profile, recorded in version control next to a
`unpinnedPolicyReason`. To stop anyone flipping it blind, **the `align` plan prints the
ahead count for every module it is about to move off an ahead-of-`develop` branch**, as a
`WORK-LOSS RISK` block plus a `[+N ahead of develop]` tag on the step line:

```
  !! WORK-LOSS RISK: this plan moves module(s) OFF a branch that carries
     commits origin/develop does not have. The commits stay on the branch,
     but they DROP OUT of the INSTALLED module:
       - com.etendoerp.psd2.bank.integration    feature/ETP-5061 -> develop  (+162 ahead)  [not moved: MANUAL]
       - com.etendoerp.db.extended              feature/ETP-5077 -> develop  (+11 ahead)  [not moved: MANUAL]
     This is a consequence of unpinnedPolicy: "develop-then-branch".
     Revert to "report-only" to leave these modules where they are.
```

One safety net beyond the warning: because `develop-then-branch` usually resolves to
`develop` for these modules, the never-touch-protected-branches rule catches them and they
report as `MANUAL` (`not moved`) rather than being checked out. So the flag surfaces the
decision without the tool silently moving you onto `develop`. Do not rely on that alone —
a module whose `$GIT_BRANCH` *does* exist would be moved for real, and the
`[WOULD MOVE]` marker in the block is what tells you so.

An **unknown** value is refused with a non-zero exit rather than falling back to a default,
because the fallback would silently decide whether eight modules get aligned.

#### Exit codes

| Code | Meaning |
|---|---|
| `0` | No blockers. |
| `1` | A **blocker** — something `align` cannot resolve: a `DIRTY` (source) worktree or a `STRAY` directory. Also returned when the `db`/`install` guard rejects the target sid, including when it fails closed because the local sid is unreadable. |
| `2` | A **usage/config error** — unknown profile, unknown phase, unknown `unpinnedPolicy`, a sid that is not a plain PostgreSQL identifier, or an unresolvable layout. |

`DRIFT`, `MISSING`, `DIRTY-BUILD` and `UNPINNED` are findings, not blockers: `align`
handles the first three and the fourth is governed by `unpinnedPolicy`, so none of them
fails the command.

> `make` reports **its own** exit code, not the tool's. Any failing recipe makes GNU make
> exit **2** with a `make: *** [ci-parity] Error 1` line, where `Error 1` is the tool's
> real code. Read the `Error N` value, or call `node cli/src/ci-parity.js` directly, when
> you need to distinguish a blocker (1) from a usage error (2).

### `align` — make the module set match

- **MISSING** → `git clone <ssh url>` into `modules/`, then the expected checkout chain.
  For an `ungrounded` module, the clone runs with **no** checkout: it lands on the remote
  default branch.
- **DRIFT** → `git fetch --all --prune` then the expected checkout chain.
- **EXTRA / STRAY** → **moved** to `<core>/.modules-disabled/<name>.<timestamp>/`.
  Never `rm -rf`, never `git clean`.
- **EXCLUDED** → prints `SKIPPED` plus the reason; touches nothing.

A `DIRTY-BUILD` module already on its expected branch needs no step: the dirt is tracked
gradle output that any later checkout restores.

Two hard rules:

1. **Never check out over source dirt.** A `DIRTY` module is reported as a blocker and
   skipped. `DIRTY-BUILD` is the one exception, and only because a `build/`-confined diff
   contains nothing a human wrote.
2. **Never check out `develop`, `main`, or `master` — and never leave you on one.** When
   CI would resolve a protected branch, the step is reported as `MANUAL` and skipped, so
   the decision stays with you.

   This promise is about what `align` *runs*, and it is enforced by not reusing CI's chain.
   `expectedCheckoutChain()` faithfully mirrors the Jenkinsfile, which means it contains an
   intermediate literal `git checkout develop` **and** a trailing
   `git checkout $GIT_BRANCH || echo …` that swallows every failure — so a checkout failing
   for any reason other than "branch not found" would silently strand the module on
   `develop`. That chain is used **only to explain what CI does**. What `align` executes is
   `buildAlignCheckoutCommands(target)`: `git fetch --all --prune` then a single
   `git checkout <resolved target>`, which refuses to be built for a protected branch and
   lets a failure propagate instead of hiding it. `resolveExpectedBranch()` has already
   done the "last candidate that exists wins" work that the `||` chain expresses in CI.

### `db` — make the target database absent

Reads `bbdd.*` from `<core>/gradle.properties`. There is no `bbdd.host` key locally and
CI sets none either, so the host defaults to `localhost`.

Two `psql` statements as `bbdd.systemUser`:

1. `pg_terminate_backend(…)` for every backend on the target sid — a live connection
   blocks `DROP DATABASE`.
2. `DROP DATABASE IF EXISTS <sid>;`

**That is the whole phase.** There is deliberately no `createdb` / `create.database`
step: `./gradlew install` owns database creation, exactly as it does against CI's empty
postgres sidecar.

### `install` — CI's four gradle commands

1. Back up `<core>/gradle.properties` to `tmp/ci-parity/<timestamp>/gradle.properties.backup`
   — in the run's log dir, deliberately **not** beside the original (see §5).
2. Write the parity `gradle.properties`.
3. Run the four commands from §1.4, from the core dir.
4. **Always restore** the original and then **delete the backup** — in a `finally`, and
   from a `SIGINT`/`SIGTERM` handler, so Ctrl-C restores too. If the restore itself fails,
   the backup path is printed for manual recovery along with a warning that it holds
   secrets.

Each gradle command streams its output straight to your terminal. This is not cosmetic:
buffering the child would impose Node's default 1 MB `maxBuffer`, and
`./gradlew install --info --stacktrace` emits far more than that — the child gets killed
with `ENOBUFS` **mid-migration, leaving a half-built database**. Streaming also makes a
20-minute run watchable instead of silent until it ends.

The parity file is a **minimal diff** of the local file, not a rewrite. CI regenerates it
wholesale because its postgres is a clean sidecar, but locally the database is served by
the pgvector container configured through the `docker_*` / `etendo.db.*` keys, gradle
needs `org.gradle.java.home`, and the nexus/github credentials must survive. So every
existing key is preserved verbatim and only these change:

| Key | Change |
|---|---|
| `bbdd.sid` | overridden to the target sid |
| `allow.root` | added if absent (`true`) |
| `org.gradle.jvmargs` | added if absent (`-Dfile.encoding=UTF-8`) |
| `org.gradle.daemon` | added if absent (`false`) |

In dry run the diff is printed, redacted.

---

## 4. Variables

| Variable | Default | Meaning |
|---|---|---|
| `PHASES` | `verify,align,db,install` | Comma-separated subset. |
| `DRY_RUN` | **`1`** | `0` = actually execute. |
| `PROFILE` | `union` | `union` \| `schema-forge-ci` \| `go`. |
| `BBDD_SID` | `etendo_ci` | Target database. |
| `ALLOW_LOCAL_SID` | unset | `1` permits a target sid equal to the local dev sid. |
| `JSON` | unset | `1` = machine-readable report. **Report-only**: `JSON=1` never executes, even with `DRY_RUN=0`. |
| `NO_FETCH` | unset | `1` = offline mode: do not refresh remote refs before measuring freshness. The report labels results as cached. |
| `HELP` | unset | `1` = same as `make ci-parity-help`. |

`PHASES`, `DRY_RUN`, `PROFILE` and `BBDD_SID` are names **already used by unrelated
targets** in the Makefile (`DRY_RUN ?= 0` for `data-fixes`, `PROFILE ?=` for
`regen-check`). A plain `?=` would lose to those in-file defaults — which for `DRY_RUN`
would silently flip `ci-parity` from dry run to live. So each value is read only from an
explicit **command-line or environment** assignment (`$(origin …)`); an in-file default
belonging to another target can never reach `ci-parity`.

---

## 5. Guardrails

- **Dry run is the default.** Only the exact string `0` disables it, on the command line
  or in the environment.
- **The database guard.** The `db` and `install` phases **refuse to run** when the target
  sid equals the sid in `<core>/gradle.properties` — your local dev database — and exit 1.
  `ALLOW_LOCAL_SID=1` overrides, and then prints a loud warning that all local data will
  be lost. The default target (`etendo_ci`) is a separate, isolated database.
  The guard **fails closed**: if `bbdd.sid` cannot be read at all, there is nothing to
  compare against, so the destructive phases are refused rather than allowed through.
- **The sid is normalized and validated before it reaches the guard or any SQL.**
  PostgreSQL folds unquoted identifiers to lower case, so `Etendo2` and `etendo2` are the
  **same database** — a guard comparing raw strings would let `BBDD_SID=Etendo2` through
  and then `DROP DATABASE IF EXISTS Etendo2` would destroy `etendo2`. `normalizeSid()`
  lower-cases once and requires `/^[a-z_][a-z0-9_]*$/`, refusing anything else (exit 2)
  rather than escaping it, which also closes the injection path into the SQL string.
- **The postgres password is never in a command string.** The `db` phase executes `psql`
  as **argv, with no shell**, and delivers `PGPASSWORD` through the child process
  environment. The printable form of the command is permanently `PGPASSWORD=***`, so the
  secret cannot reach stdout or the log even in principle — it is absent by construction
  rather than filtered out by a redactor that a new command shape could slip past.
- **Secrets are redacted everywhere this process prints them.** `gradle.properties` holds
  a real `githubToken`, `nexusPassword`, `bbdd.systemPassword`, `bbdd.password`,
  `sonarToken`, API keys and checkout secrets. Any key matching
  `/password|token|secret|key/i` is redacted to `***` in the human table, the properties
  diff, the `--json` payload, and the run log.
- **The run log records commands and outcomes, not child output.** Children stream
  straight to your terminal (see §3, `install`), so their output never passes through this
  process and is never written to disk. That is deliberate: `gradle --info` can echo
  property values, and a log file this code cannot redact would be worse than a log that
  records only what was run and whether it succeeded. Redirect the whole command if you
  want a full transcript: `make ci-parity … 2>&1 | tee run.txt`.
- **The gradle.properties backup never sits beside the original.** `install` writes it to
  `tmp/ci-parity/<timestamp>/gradle.properties.backup` and **deletes it** after a
  successful restore. `etendo_core/.gitignore` ignores `gradle.properties` but not a
  suffixed sibling, so a backup left in the core dir would show up as untracked and is one
  `git add .` away from committing every secret in it.
- **Never deletes.** Extras and strays are *moved* to `<core>/.modules-disabled/`.
  No `rm -rf`, no `git clean`.
- **Never pushes.** No phase runs `git push`.
- **Never checks out `develop` / `main` / `master`, and never leaves you on one.**
  See the note in §3 (`align`) for exactly what this does and does not promise.
- **Never checks out over uncommitted source work** (`DIRTY-BUILD` excepted — see §3).
- **Run logs** land in `tmp/ci-parity/<timestamp>/run.log` on live runs only.

---

## 6. Examples

```bash
make ci-parity                          # dry run, all phases, union profile
make ci-parity PHASES=verify            # just the drift report
make ci-parity PHASES=verify JSON=1     # same, machine-readable
make ci-parity PHASES=verify NO_FETCH=1 # offline: use cached refs, clearly labeled
make ci-parity PROFILE=schema-forge-ci  # only what THIS repo's CI clones from source
make ci-parity PHASES=align DRY_RUN=0   # actually align the modules
make ci-parity DRY_RUN=0                # full parity run against etendo_ci
make ci-parity-help                     # option reference
```

> Under `PROFILE=schema-forge-ci`, the eight modules that only the Go job clones become
> `EXTRA` and `align` will **park** them — including `com.etendoerp.db.extended` with its
> pgvector work. That is faithful to what that CI job installs, and it is reversible (the
> directories are moved, not deleted), but do not run it with `DRY_RUN=0` unless that is
> what you want.

---

## 7. What this does NOT do

- **Does not run CI.** It reproduces the *install* stage locally. The Offline Regen check,
  Schema Forge Regen, Playwright and Sonar stages are out of scope.
- **Does not resolve the epic branch from Jira.** CI queries Jira for a feature branch's
  parent epic (`pipelines/Jenkinsfile:162-170`) and falls back to `epic/ETP-3504`. This
  tool always uses the `epicBranch` in `pipelines/ci-parity-profiles.json`.
- **Does not assert a branch for `ungrounded` modules** under the default
  `unpinnedPolicy: "report-only"` — see §3. Those modules are reported and left alone;
  opt in per profile to change that.
- **Does not check out `develop` / `main`**, even where CI would; those become `MANUAL`.
- **Does not create the database.** `install` does.
- **Does not touch published-JAR resolution.** It cannot make this repo's CI build a
  module from source — that requires adding it to `pipelines/extra-modules.txt`. It only
  *reports* the gap.
- **Does not commit, push, merge, or delete anything.**
- **Does not reproduce CI's PostgreSQL version.** CI installs against **`postgres:14`**
  (`pipelines/Agent.yaml:51`); a local run installs against whatever the local container
  serves, which here is **`pgvector/pgvector:pg16`** (`etendo.db.image` in
  `gradle.properties`). That is a **two-major-version gap**, and it materially weakens the
  headline claim that a green local install predicts a green CI build: anything depending
  on server version, planner behavior, or a `pg16`-only feature can pass locally and fail
  in CI. It bites hardest on `com.etendoerp.db.extended`, whose pgvector activation can
  only succeed on the local image — CI's `postgres:14` has no `vector` extension available
  at all. Treat a green local install as strong evidence about *module wiring and branch
  set*, and weak evidence about anything version-sensitive.
- **Does not migrate an existing database.** The `db` phase drops; there is no in-place
  upgrade path.
- **Does not manage the postgres container itself.** It assumes the local server (the
  `pgvector/pgvector:pg16` container, per `etendo.db.image`) is already up and reachable.
