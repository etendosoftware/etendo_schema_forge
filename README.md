# Schema Forge

Design and tooling layer for building a simplified Etendo interface. Schema Forge analyzes Etendo metadata, helps humans make design decisions, and configures the runtime module ([NEO Headless](docs/neo-headless-extensibility.md)) — no backend code generation needed.

```
┌─────────────────────────────┐         ┌──────────────────────────────┐
│       SCHEMA FORGE          │         │      com.etendoerp.go        │
│    (design + tooling)       │ writes  │    (runtime / NEO Headless)  │
│                             │ ──────▶ │                              │
│  cli/    → extractors, etc  │  via DB │  NeoServlet (/sws/neo/*)     │
│  tools/  → decision UIs     │         │  ETGO_SF_SPEC/ENTITY/FIELD   │
│  artifacts/ → per-window    │         │  Webhooks, CDI hooks         │
└─────────────────────────────┘         └──────────────────────────────┘
```

Schema Forge decides **what** to expose. Etendo Go decides **how** to serve it.

## Repositories

Schema Forge is split across three repos. Know which one a change belongs to before you start (details: [`docs/repo-topology.md`](docs/repo-topology.md)).

| Repo | Remote | Role |
|------|--------|------|
| `etendo_schema_forge` (this repo) | `etendosoftware/etendo_schema_forge` | Functional: windows, artifacts, decisions, app-shell, per-client config |
| `schema_forge_core` | `etendosoftware/schema_forge_core` | Tooling/platform: generators, extractors, pipeline, shared React runtime (`app-shell-core`) |
| `com.etendoerp.go` | `etendosoftware/com.etendoerp.go` | Runtime (NEO Headless, Java), lives in `modules/` of Etendo Core |

Most developers only work in `schema_forge` and consume the published `@etendosoftware/*` packages. Clone `schema_forge_core` only if you also change the tooling.

## Prerequisites

- **Node.js >= 22** and npm — [download](https://nodejs.org/)
- **GitHub CLI (`gh`)** — window locks and PR workflow (`brew install gh && gh auth login`)
- **GitHub Packages token** — the `@etendosoftware/*` packages are private. Add to `~/.npmrc` a token with `read:packages`:
  ```
  //npm.pkg.github.com/:_authToken=<GITHUB_TOKEN_WITH_read:packages>
  ```
  Check with `npm whoami --registry=https://npm.pkg.github.com`.
- **A working Etendo Core** (compiles and runs) with access to its PostgreSQL development database. Not needed if you use [local-env](#option-a-local-env-isolated-environment-recommended).
- **Claude Code** with the **Chrome DevTools MCP server** (UI testing/debugging): `claude mcp add chrome-devtools`
- **Etendo Claude Marketplace**:
  ```
  /plugin marketplace add etendosoftware/etendo_claude_marketplace
  /plugin install dev-assistant@etendo_claude_marketplace
  /plugin install etendo-workflow-manager@etendo_claude_marketplace
  ```
  See the [marketplace repo](https://github.com/etendosoftware/etendo_claude_marketplace).

## Installation

Two ways to get a working setup. Use **local-env** unless you already maintain your own Etendo Core checkout.

### Option A: local-env (isolated environment, recommended)

[`local-env`](https://github.com/etendosoftware/etendo-localenv) builds an Etendo checkout with its own cached PostgreSQL, build and Tomcat, and can create one parallel environment per branch (git worktrees) so you never touch your main checkout. Schema Forge ships a plugin (`local-env.d/plugins/etendo-go`) that local-env discovers automatically and that adds everything Etendo GO needs.

Per hook, the plugin:

- seeds the **GOClient** sample client (users `GOuser`, `goadmin@etendo.software`) into the DB before it is snapshotted;
- starts the GO SPA (`make dev-local-core`) against the environment's own Tomcat, using the environment's own `schema_forge` and `schema_forge_core`;
- reserves a free `SPA_PORT` / `BFF_PORT` per environment and aligns CORS (`ETGO_ALLOWED_ORIGINS`) and the MCP/OAuth public URLs to that port.

**Step 0: install the tool (once per machine).** `etendo-localenv` is a separate repo and a tool, not part of the Etendo checkout. Clone it **outside** `etendo_develop`/`etendo_core`, anywhere (e.g. next to it) and run its installer, which symlinks `local-env` and `tomcat-fast` into `~/.local/bin` and the agent skills into `~/.claude/skills`:

```bash
git clone git@github.com:etendosoftware/etendo-localenv.git ~/Workspace/etendo-localenv
cd ~/Workspace/etendo-localenv && ./install.sh
# make sure ~/.local/bin is on your PATH (install.sh prints a NOTE if not)
```

Requirements on the host: JDK 17 and a `psql` client (`brew install libpq`); PostgreSQL itself is bundled and cached by local-env. `git pull` in that repo updates the tool, since everything is a symlink.

**local-env does not clone anything.** It needs a main checkout with Etendo Core, `schema_forge`, `schema_forge_core` and the modules already in place, each on the branch from the [branch table](#1-etendo-core-and-modules) (clone steps 1 and 2 of Option B, then skip steps 3 and 4: local-env installs and configures the DB itself). `local-env up` then runs every repo on whatever branch it has checked out, so verify the branches first with the check script in that section.

Layout it expects:

```
etendo_develop/                  ← Etendo Core (main checkout)
├── modules/
│   ├── com.etendoerp.go/        ← runtime (develop, or feature/ETP-XXXX cut from develop)
│   └── com.etendoerp.*/         ← other modules, on the branch com.etendoerp.go expects
├── etendo_schema_forge/         ← this repo
├── schema_forge_core/           ← sibling, required by `make dev-local-core`
└── gradle.properties
```

Environments for parallel tasks live outside the checkout, in `../.worktrees/<name>`.

```bash
# Main checkout: Etendo + GO SPA on :3100 against Tomcat :8080
local-env up

# Isolated environment for one task
cd /path/to/etendo_develop
local-env worktree ETP-1234 --dry-run \
  --module com.etendoerp.go=feature/ETP-1234     # preview: what becomes a worktree, adopt or copy
local-env worktree ETP-1234 \
  --module com.etendoerp.go=feature/ETP-1234 \
  --repo etendo_schema_forge=feature/ETP-1234
cd ../.worktrees/ETP-1234
local-env up                                     # own Tomcat, PostgreSQL, SPA (e.g. :3101)
local-env status                                 # ports and SPA state
local-env export                                 # serialise NEO config pushed to this env's DB into src-db
local-env stop                                   # SPA + PostgreSQL
cd /path/to/etendo_develop && local-env worktree rm ETP-1234   # branches are kept
```

Things to know:

- Repos not named at creation are **frozen APFS copies** of the main checkout. Commit only in repos you named (`--module` / `--repo`).
- Lifecycle commands (`up`, `stop`, `sync`, `export`, `./gradlew`) run **inside** the environment. Only `worktree` / `worktree rm` run from the main checkout.
- Modules must match what `com.etendoerp.go` expects (epic branch for most, e.g. `epic/ETP-3504`), otherwise `update.database` fails on a missing `AD_COLUMN`.
- Pushing NEO config (`sf-push-neo`) lives only in the environment's DB until `local-env export`.
- The bundled PostgreSQL has **no pgvector**: vector search in the CommandPalette does not work there.
- Skip the SPA for one run: `local-env up --skip-plugin=etendo-go`.
- Install the progress mod in Claude Code for phase/gradle/elapsed above the prompt: `/plugin install local-env-progress --marketplace etendosoftware/etendo-localenv`.

Full reference: [`docs/local-env-plugin.md`](docs/local-env-plugin.md) (plugin hooks, allowed origins, MCP/OAuth URLs, ports) and the project skill [`.claude/skills/local-env/SKILL.md`](.claude/skills/local-env/SKILL.md) (rules, failure table).

### Option B: manual setup

#### 1. Etendo Core and modules

Start from a working Etendo Core on the epic branch and verify it compiles and runs:

```bash
cd /path/to/etendo_core
git checkout epic/ETP-3504
```

**Branch model.** Two kinds of repos:

1. **Base repos** (`etendo_schema_forge`, `schema_forge_core`, `com.etendoerp.go`): sit on `main` (= production) or `develop` (= experimental/staging). Work goes through `feature/ETP-XXXX` cut from `develop`.
2. **Everything else** (`etendo_core` and all the module repos): for now they are positioned on the epic `epic/ETP-3504` (ask the team if it moved). Gradually they move to the usual `main`/`develop` model. The ones that will go **at most to the epic** are the **"fixed on epic"** ones in the tables below.

#### Base repos

| Repo (remote) | Target branch | Notes (as of 2026-10-21, after `git fetch`) |
|---|---|---|
| `etendosoftware/etendo_core` | — | **Not a base repo for now: fixed on epic** (see the module table below) |
| `etendosoftware/etendo_schema_forge` | `main` / `develop` | epic has 0 commits ahead: nothing is epic-only |
| `etendosoftware/schema_forge_core` | `main` / `develop` | epic is 36 commits ahead of `develop` |
| `etendosoftware/com.etendoerp.go` (in `modules/`) | `main` / `develop` | epic has 0 commits ahead; use `develop`, or `feature/ETP-XXXX` cut from `origin/develop` |

> **Naming:** clone each repo with its remote name (`etendo_core`, `etendo_schema_forge`, `schema_forge_core`, …) and do not rename the directory. `schema_forge_core` is the only base repo whose remote has no `etendo_` prefix. Some tooling and docs still reference the old directory names `../schema_forge` / `../schema_forge_core` (the `local-env` plugin, `SCHEMA_FORGE_CORE`, `docs/repo-topology.md`); those need updating together with the rename.

#### Module repos

Branch state of every module repo on the remote. **Fixed on epic** = the module's work lives on `epic/ETP-3504` and does not go beyond it (yet). "Ahead" = commits on the epic not in `develop`. "CI list" = where CI clones the module from source: `SF+GO` = `etendo_schema_forge/pipelines/extra-modules.txt` and the GO job's `jenkinsExtraModules.txt`; `GO` = only the latter. Anything not in those lists is resolved as a published JAR.

| Module | Remote | `main` | `develop` | Epic ahead of `develop` | CI list | Policy |
|---|---|---|---|---|---|---|
| `etendo_core` (Etendo Core) | GitHub etendosoftware | yes | yes | +118 (vs `main`: +124) | pipeline pin (`pipelines/Jenkinsfile`, `TODO: Remove this block`) | fixed on epic |
| `com.etendoerp.sif.general` | Bitbucket koodu_software | yes | yes | +43 | SF+GO | fixed on epic |
| `com.smf.ticketbai` | Bitbucket koodu_software | no | yes | +71 | SF+GO | fixed on epic |
| `com.etendoerp.verifactu` | Bitbucket koodu_software | no | yes | +84 | SF+GO | fixed on epic |
| `org.openbravo.module.aeat347apr.es` | Bitbucket koodu_software | no | yes | +7 | SF+GO | fixed on epic |
| `org.openbravo.module.aeat390.es` | Bitbucket koodu_software | no | yes | +3 | SF+GO | fixed on epic |
| `org.openbravo.module.intrastat` | Bitbucket koodu_software | no | yes | +3 | SF+GO | fixed on epic |
| `org.openbravo.module.sii` | Bitbucket koodu_software | no | yes | +50 | SF+GO | fixed on epic |
| `org.openbravo.module.taxreportlauncher` | Bitbucket koodu_software | no | yes | +14 | SF+GO | fixed on epic |
| `org.openbravo.module.aeat303.es` | Bitbucket koodu_software | no | yes | +61 | GO | fixed on epic |
| `org.openbravo.module.aeat349.es` | Bitbucket koodu_software | no (`master`) | yes | 0 (epic cut from `develop` for ETP-5059; push pending) | GO | fixed on epic |
| `org.openbravo.module.bptaxidkey` | Bitbucket koodu_software | no | yes | +8 | GO | fixed on epic |
| `com.smf.currency.apiconfig` | Bitbucket koodu_software | no | yes | +8 | GO | fixed on epic |
| `com.smf.currency.conversionrate` | Bitbucket koodu_software | no | yes | +15 | GO | fixed on epic |
| `com.etendoerp.psd2.bank.integration` | Bitbucket koodu_software | no | yes | +186 | GO | fixed on epic |
| `com.etendoerp.copilot` | GitHub etendosoftware | no | yes | +31 | GO | fixed on epic |
| `com.etendoerp.db.extended` | GitHub etendosoftware | yes | yes | +107 | GO | fixed on epic |
| `com.etendoerp.go.template` | GitHub etendosoftware | yes | yes | +3 | GO | fixed on epic |
| `com.etendoerp.go.localization.es.data` | GitHub etendosoftware | yes | yes | 0 | GO | fixed on epic |
| `org.openbravo.sepa.iso20022` | Bitbucket koodu_software | no (`master`) | yes | +8 | GO | fixed on epic |
| `org.openbravo.sepa.iso20022.template` | GitHub etendosoftware | yes | yes | +3 | GO | fixed on epic |
| `org.openbravo.sepa.iso20022.credittransfer.customertobank` | Bitbucket koodu_software | no (`master`) | yes | +8 | GO | fixed on epic |
| `org.openbravo.sepa.iso20022.coredirectdebit.customertobank` | Bitbucket koodu_software | no (`master`) | yes | +7 | GO | fixed on epic |
| `com.etendoerp.service.integration.amazon.s3` | Bitbucket koodu_software | not checked | not checked | not checked | GO | in CI list; branches not verified |
| `com.etendoerp.tomcat` | GitHub etendosoftware | yes | yes | 0 | none | usual model (epic exists, nothing ahead) |
| `com.etendoerp.docker`, `com.etendoerp.copilot.devassistant` | GitHub etendosoftware | yes | yes | no epic | none | usual model; not tied to the DB model GO depends on |
| `com.etendoerp.webhookevents` | GitHub etendosoftware | no | yes | no epic | none | usual model |
| `org.openbravo.utility.hqlquerytool` | GitHub etendosoftware | yes | no | no epic | none | usual model |
| `com.etendoerp.openapi` | GitHub etendosoftware | — | — | — | none | only if the build asks for it; `main` |

Rule: **"fixed on epic" modules must be on the epic branch, pulled to its latest commit** (or on a branch cut from it). If one lags, `update.database` fails on a missing `AD_COLUMN` that an `ETGO_SF_FIELD` row references, or smartbuild fails on a missing getter. This table is a snapshot: when a module's epic work merges into `develop`/`main`, it leaves the "fixed on epic" group.

**Your own branches.** You will usually be on a `feature/*` or `hotfix/*` branch, not on the base branch itself. It must have been cut from the right base:

| Repo kind | `feature/*` cut from | `hotfix/*` cut from |
|---|---|---|
| Fixed on epic (`etendo_core` + the epic modules) | `epic/ETP-3504` | `epic/ETP-3504` |
| Base repos and modules outside the epic | `develop` | `main` |

**Check everything with one command** (from this repo):

```bash
make check-modules             # fetches every repo, then checks them all
make check-modules FETCH=0     # no fetch (offline / faster)
make check-modules ONLY=com.etendoerp.go,com.smf.ticketbai

# local-env environments / worktrees (paths are relative to where you run make)
make check-modules ROOT=../../.worktrees/ETP-1234                        # one environment
make check-modules ROOT=../../.worktrees/ETP-1234,../../.worktrees/ETP-5640   # several
make check-modules ALL_ENVS=1                                            # main checkout + every ../.worktrees/*
```

`ROOT` is the Etendo root of the checkout to inspect (the directory that has `modules/`): the main checkout by default, or any local-env environment. Each root gets its own report. Inside an environment, repos that are real worktrees (`.git` file) are judged like the main checkout; repos that are **frozen copies** (own `.git` directory, made by `local-env worktree` for every repo you did not name) are reported with an extra note, because they never follow the main checkout.

What it reports, per repo:

- **Wrong branch (ERROR):** not cloned, detached HEAD, a fixed-on-epic repo that is not on the epic or on a feature/hotfix derived from it, a hotfix that carries develop-only (unreleased) commits, a feature in a non-epic repo that contains epic commits.
- **Outdated (WARN, ERROR on the epic itself):** commits of its base branch that the checked-out branch does not have: `develop` for features and for `develop`, `main` for hotfixes and for `main`, the epic for fixed-on-epic repos, or its own remote branch. Each message says *why it matters*, so an agent or a person knows that a build, `update.database` or runtime failure may come from that module being out of date. A feature that contains none of the develop-only commits is reported as "outdated or cut from main" (git cannot tell a stale branch from one cut from `main`).
- **Info:** for fixed-on-epic repos, how many `develop` commits the epic has not absorbed yet.
- **Environments and `worktree.conf`:** the `worktree.conf` of a local-env environment is a *patch* over the main checkout: it lists only the repos named at creation (`module <name> <branch>`, `repo <dir> <branch>`, `core - <branch>`), each on its own branch. Every repo it does not list is a frozen copy of the main checkout. For each repo the check reads the real branch with git and compares it with that patch: a listed repo on another branch than declared is a WARN (`local-env sync` or fix the conf), a listed repo that is not present is an ERROR, and an unlisted copy whose branch differs from the main checkout's current one is an INFO.
- **Also:** uncommitted changes, an `origin` that is not the expected remote, and module repos in `modules/` that are missing from the policy.

It exits non-zero on any `ERROR`. When you add a module or change its group, update `scripts/modules-policy.json` and the two tables above in the same change.

Clone the modules into `modules/`:

```bash
cd /path/to/etendo_core/modules

# Runtime (develop)
git clone -b develop git@github.com:etendosoftware/com.etendoerp.go.git

# GitHub modules on the epic
git clone -b epic/ETP-3504 git@github.com:etendosoftware/com.etendoerp.go.template.git
git clone -b epic/ETP-3504 git@github.com:etendosoftware/com.etendoerp.go.localization.es.data.git
git clone -b epic/ETP-3504 git@github.com:etendosoftware/com.etendoerp.db.extended.git
git clone -b epic/ETP-3504 git@github.com:etendosoftware/com.etendoerp.copilot.git
git clone -b epic/ETP-3504 git@github.com:etendosoftware/org.openbravo.sepa.iso20022.template.git

# Bitbucket modules on the epic: localization (ES)
for m in com.etendoerp.sif.general com.smf.ticketbai com.etendoerp.verifactu \
         org.openbravo.module.aeat347apr.es org.openbravo.module.aeat390.es \
         org.openbravo.module.aeat303.es org.openbravo.module.aeat349.es \
         org.openbravo.module.intrastat \
         org.openbravo.module.sii org.openbravo.module.taxreportlauncher \
         org.openbravo.module.bptaxidkey; do
  git clone -b epic/ETP-3504 git@bitbucket.org:koodu_software/$m.git
done

# Bitbucket modules on the epic: currency conversion rates + PSD2
for m in com.smf.currency.conversionrate com.smf.currency.apiconfig \
         com.etendoerp.psd2.bank.integration; do
  git clone -b epic/ETP-3504 git@bitbucket.org:koodu_software/$m.git
done

# Bitbucket modules on the epic: SEPA ISO 20022 (structured address / SEPA direct debit & credit transfer)
for m in org.openbravo.sepa.iso20022 \
         org.openbravo.sepa.iso20022.credittransfer.customertobank \
         org.openbravo.sepa.iso20022.coredirectdebit.customertobank; do
  git clone -b epic/ETP-3504 git@bitbucket.org:koodu_software/$m.git
done
```

Check at any time which modules are off-branch or behind (from `etendo_core/modules`):

```bash
for d in */; do d=${d%/}; [ -e "$d/.git" ] || continue; git -C "$d" fetch -q origin
  u=$(git -C "$d" rev-parse --abbrev-ref @{u} 2>/dev/null)
  printf '%-42s %-22s behind=%s\n' "$d" "$(git -C "$d" branch --show-current)" \
    "$([ -n "$u" ] && git -C "$d" rev-list --count HEAD.."$u" || echo '?')"; done
```

The epic list changes over time: the modules whose branch is `epic/*` in a healthy checkout are the source of truth. SWS must be configured from the Client window for the pipeline to reach the backend.

#### 2. Clone Schema Forge (and optionally the core)

Clone **inside** the Etendo project directory, sibling of `modules/`:

```bash
cd /path/to/etendo_core
git clone git@github.com:etendosoftware/etendo_schema_forge.git
git -C etendo_schema_forge checkout develop

# Only if you also change the tooling (core developer profile)
git clone git@github.com:etendosoftware/schema_forge_core.git schema_forge_core
(cd schema_forge_core && npm install)
```

#### 3. Install dependencies

```bash
cd etendo_schema_forge
make install
```

Installs all workspace dependencies and **activates the git hooks** (`.githooks`, see [Pipeline Validation](#pipeline-validation)).

#### 4. Configure environment

```bash
cp .env.example .env
```

```env
# Etendo root directory (relative or absolute path)
ETENDO_ROOT=..

# Etendo Database (staging/development - NEVER production)
ETENDO_DB_HOST=localhost
ETENDO_DB_PORT=5432
ETENDO_DB_USER=tad
ETENDO_DB_PASSWORD=tad
ETENDO_DB_NAME=etendo

# Etendo Java source directory (for Rule Extractor callout analysis)
ETENDO_SOURCE_DIR=../src
```

> The CLI tools auto-read DB credentials from `{ETENDO_ROOT}/gradle.properties`. The `.env` overrides are only needed if your setup differs. `.env.example` has more optional settings (Sonar, E2E, Stripe).

### Expected directory structure

```
etendo_core/                     ← branch: epic/ETP-3504
├── modules/
│   ├── com.etendoerp.go/        ← develop
│   ├── com.etendoerp.go.template/   ← epic/ETP-3504
│   ├── com.etendoerp.go.localization.es.data/ ← epic/ETP-3504
│   ├── com.etendoerp.openapi/   ← main (if needed)
│   └── ...                      ← other localization / currency / PSD2 modules, epic/ETP-3504
├── etendo_schema_forge/         ← develop
├── schema_forge_core/           ← optional, core developers only
└── gradle.properties
```

### Running the UI against the published core or your local core

```bash
make dev              # published @etendosoftware/app-shell-core
make dev-local-core   # hot reload from ../schema_forge_core (requires the sibling clone)
```

Both read `SPA_PORT` (default 3100) and `BFF_PORT` (default 3400). Pipeline commands accept `LOCAL_CORE=1` to run the CLI from the local core (`make regen ONLY=<window> LOCAL_CORE=1`). See [`docs/repo-topology.md`](docs/repo-topology.md).

## Data flow

```
AD_Menu cache (core-maps/ad-menu-cache.json)
    │ menu name → type + IDs
    ▼
extract-from-db.js / extract-from-process.js
    │ fields, rules, callouts, FK references
    ▼
artifacts/{spec}/ (schema-raw + rules-raw)
    ▼
Decision UIs or AI classification (/classify) → decisions.json
    │ a human or the AI curates field visibility and rule decisions
    ▼
resolve-curated.js → push-to-neo.js
    │ writes ETGO_SF_SPEC / ETGO_SF_ENTITY / ETGO_SF_FIELD
    ▼
NEO Headless (NeoServlet, /sws/neo/*)  — serves CRUD, selectors, processes, reports live
    ▼
React SPA (consumes the NEO Headless API)
```

After `push-to-neo.js`, run `./gradlew export.database` in the Etendo root (not in a local-env environment: use `local-env export` there).

## Key concepts

- **Visibility model:** `editable` (user input), `readOnly` (display only), `system` (auto-derived, hidden), `discarded` (excluded from the API).
- **Rule decisions:** every business rule is classified `Keep`, `Replace`, `Simplify` or `Omit`; decisions persist in `decisions.json`.
- **NEO Headless:** metadata-driven REST engine running inside Etendo. It exposes AD windows and processes as JSON APIs from config stored in the `ETGO_SF_*` tables.
- **Spec names** are kebab-case, from `toSpecName()` in `cli/src/push-to-neo.js`.

## jsreport Installation (Draft)

> ⚠️ **This section is in the process of official integration.** The `com.etendoerp:docker` dependency is not yet part of `com.etendoerp.go` — add it manually until it is integrated.

jsreport is the report engine used by NEO Headless for PDF report generation. It runs as a Docker container managed by the `com.etendoerp:docker` module.

### 1. Add the Docker dependency to build.gradle

In the Etendo project's `build.gradle`, add inside the `dependencies` block:

```groovy
implementation 'com.etendoerp:docker:latest.release'
```

### 2. Configure gradle.properties

Add the following to the project's `gradle.properties`:

```properties
docker_com.etendoerp.go=true
JSREPORT_PORT=5488
SCHEMA_FORGE_DIR=../../etendo_schema_forge
```

> **Note:** `SCHEMA_FORGE_DIR` is a placeholder — replace it with the actual path to your `etendo_schema_forge` directory (relative or absolute).

### 3. Build the jsreport Docker image

> **Temporary step:** This manual build will be removed once the image is published to a registry. In a future version, the image will be pulled automatically without needing to build from the Dockerfile.

```bash
cd modules/com.etendoerp.go/compose
docker buildx build -f Dockerfile -t etendo-jsreport:latest .
```

### 4. Start jsreport

From the Etendo root directory:

```bash
./gradlew resources.up
```

This starts the jsreport container (and any other configured Docker resources). The `com.etendoerp:docker` module manages the container lifecycle.

### 5. Server Deployment: Apache Proxy for jsreport

When deploying to a server (production, staging, experimental), the frontend accesses jsreport through a relative path (`/jsreport/api/report`). In development, Vite proxies this automatically. In a deployed environment, you need to configure your web server to proxy these requests to the jsreport container.

#### Apache (with SSL / Let's Encrypt)

Edit your Apache virtual host config (e.g., `/etc/apache2/sites-available/000-default-le-ssl.conf`) and add the jsreport proxy **before** the catch-all `ProxyPass "/"` rule:

```apache
<VirtualHost *:443>
    # ... existing config ...

    # jsreport proxy — must be BEFORE the catch-all ProxyPass
    ProxyPass "/jsreport/" "http://127.0.0.1:5488/"
    ProxyPassReverse "/jsreport/" "http://127.0.0.1:5488/"

    # Existing Etendo/app proxy (catch-all, must be last)
    ProxyPass "/" "http://127.0.0.1:3000/"
    ProxyPassReverse "/" "http://127.0.0.1:3000/"

    # ... SSL config ...
</VirtualHost>
```

> **Important:** Apache evaluates `ProxyPass` rules in order. The more specific `/jsreport/` rule must appear before the generic `/` rule, otherwise all requests will be caught by the generic rule first.

After editing, restart Apache:

```bash
sudo systemctl restart apache2
```

Verify the proxy is working:

```bash
curl https://your-domain.com/jsreport/api/ping
```

#### How it works

```
Browser → HTTPS (443) → Apache (SSL termination) → HTTP (5488) → jsreport
```

Apache handles SSL — jsreport does not need its own SSL configuration. The same build works across all environments as long as each server has this proxy rule configured.

---

## Environment Variables for Deployment

When deploying the application to a custom domain (e.g., `http://go.myproject.etendo.cloud/`), the following environment variables must be configured:

### Backend (Etendo / Tomcat)

| Variable | Where to set | Purpose |
|---|---|---|
| `etgo.app.url` | `Openbravo.properties` or `gradle.properties` | Frontend (PWA) base URL. Used by the OAuth2 `authorization_endpoint` to redirect users for login. |
| `ETGO_APP_URL` | OS env var or Docker `.env` | Alternative to `etgo.app.url` (env var fallback). |
| `ETGO_ALLOWED_ORIGINS` | OS env var or Docker `.env` | Comma-separated list of allowed CORS origins for the frontend. |
| `etgo.allowed.origins` | JVM `-D` flag in `TOMCAT_CATALINA_OPTS` | Alternative to `ETGO_ALLOWED_ORIGINS` (system property, takes precedence). |

**Resolution priority:**
- App URL: `etgo.app.url` (properties) > `ETGO_APP_URL` (env var) > dynamic from HTTP request
- CORS: `etgo.allowed.origins` (system property) > `ETGO_ALLOWED_ORIGINS` (env var) > hardcoded defaults (`localhost:3000`, `localhost:5173`)

Example (`gradle.properties` or `Openbravo.properties`):
```properties
etgo.app.url=http://go.myproject.etendo.cloud
```

Example (Docker `.env` or OS environment):
```env
ETGO_APP_URL=http://go.myproject.etendo.cloud
ETGO_ALLOWED_ORIGINS=http://go.myproject.etendo.cloud
```

Example (JVM flag in `TOMCAT_CATALINA_OPTS`):
```
-Detgo.allowed.origins=http://go.myproject.etendo.cloud
```

### Frontend (Vite / React)

| Variable | Where to set | Purpose |
|---|---|---|
| `VITE_API_BASE` | `.env.production` | Backend base path for all API and auth calls (e.g., `/etendo`). |
| `VITE_MOCK` | `.env.production` | Set to `false` for production (disables mock data). |
| `ETENDO_URL` | `.env.local` (dev only) | Full backend URL for the Vite dev proxy and the dev report API (e.g., `http://localhost:8080/etendo`). |
| `JSREPORT_URL` | `.env.local` (dev only) | jsreport base URL for the dev report API and the `/jsreport` proxy of `make dev` / `vite preview` (default `http://localhost:5488`). Not used by the production build; the deployed report-server gets its own value from its container environment. |

Example (`.env.production`):
```env
VITE_MOCK=false
VITE_API_BASE=/etendo
```

> **Note:** `VITE_API_BASE` should match the Tomcat context name. If Tomcat uses `etendo_sf2` as context, set `VITE_API_BASE=/etendo_sf2`.

### Minimal Configuration Checklist

```bash
# Backend
etgo.app.url=http://go.myproject.etendo.cloud
ETGO_ALLOWED_ORIGINS=http://go.myproject.etendo.cloud

# Frontend (.env.production)
VITE_MOCK=false
VITE_API_BASE=/etendo
```

---

## First Steps (Claude Guided) (Recommended)
This tool is designed to be used iteratively through the Claude Code interface, interacting with the agent.

> **Work with AI agents from the `etendo_schema_forge` directory.** Open Claude Code (or Codex/Cursor/Copilot) with that folder as the working directory, not the Etendo root: the agent instructions (`CLAUDE.md`/`AGENTS.md`), skills, hooks and `make` targets live in this repo. From there the agent reaches the rest through the sibling directories.

`CLAUDE.md` and `.claude/` are the source; everything else is generated by `make sync-agents` (never edit the mirrors by hand):

| Tool | Instructions | Skills | Subagents |
|---|---|---|---|
| Claude Code | `CLAUDE.md` | `.claude/skills/` | `.claude/agents/` |
| oh-my-pi (omp) | `AGENTS.md` / `CLAUDE.md` | `.agents/skills/` | `.omp/agents/` (generated: omp skips the other agent folders) |
| Codex | `AGENTS.md` | `.agents/skills/` | `.codex/agents/` |
| OpenCode | `AGENTS.md` | `.claude/skills/` | `.opencode/agents/` |
| pi (base) | `AGENTS.md` / `CLAUDE.md` | `.agents/skills/` | not supported (pi has no subagents; it needs a manual per-machine extension) |

No extra clone or install step is needed: the mirrors are committed. After changing anything under `.claude/`, run `make sync-agents`; `make sync-agents-check` fails when a mirror is stale.

### 0. Start Etendo
Make sure your Etendo instance is running and its database is accessible, so the agent can use the backend endpoints for testing and validation. Easiest: `local-env up` (see [local-env](#option-a-local-env-isolated-environment-recommended)); SmartTomcat or Dockerized Tomcat also work.

### 1. Start a new conversation in Claude Code
- Open Claude Code and start a new conversation. IMPORTANT: Open the conversation in the etendo_schema_forge directory to ensure the agent has access to the correct context and files.

### 2. Set up the agent
- In the conversation, ask to set up the agent with the configuration required to work, such as "Etendo path", "Database credentials", "Menu cache", etc.

### 3. Start the UI in development mode
- Ask the agent to start the UI. It will install dependencies and start the development server. The UI will be available at http://localhost:3100. This UI will auto-refresh on changes.

### 4. Ask the agent to run the pipeline for a specific window or process
- You can ask the agent to run the pipeline for a specific window or process by providing the menu name or ID. For example, "Run the pipeline for the Sales Order window" or "Run the pipeline for menu ID 143". The agent will execute the pipeline steps, including metadata extraction, rule classification, contract generation, and frontend generation.

It is recommended to give the agent the "decisions" from the start so they can be applied automatically. This is not mandatory, as they can be provided before the "classification" step, but if given from the start, they can be applied immediately in the "classification" step and also used to "validate" the rules with the decisions in mind.


### 5. Change decisions and re-run the pipeline
- If you want to change any design decisions (e.g., field visibility, rule classifications), you can do so through the chat with the agent, and then re-run the pipeline to see the changes reflected in the generated UI. This will modify the "decisions" file so the changes will be persisted for future runs, and the pipeline steps that run will be the post-classification steps (contract generation, push to NEO, frontend generation, etc.), skipping the extraction and classification steps. Example: "Change the visibility of the 'Credit Limit' field to hidden and re-run the pipeline for the Sales Order window".


### 6. Use Claude to solve problems and errors
- When you encounter any issues, errors, or unexpected behavior during the pipeline execution or in the generated UI, you can ask the agent for help. It's important to differentiate between errors that are expected during development (e.g., due to incomplete implementations or edge cases) and those that indicate a problem with the pipeline or the generated code. You can ask the agent to analyze error messages, logs, or unexpected UI behavior to identify potential causes and solutions. Example: "I'm getting a validation error in the pipeline related to the 'Order Total' field. Can you help me understand why and how to fix it?"

### 7. Use the agent to test the UI or investigate issues
- "I have an issue with the generated UI for the Sales Order window. The 'Add Line' button is not working as expected. Can you help me debug this issue?" The agent can guide you through using the Chrome DevTools MCP server to inspect the frontend code, check network requests, and analyze logs to identify the root cause of the issue.

### 8. Deploy the UI
- This step is now handled by the dedicated UI container during commits. Use the legacy copy flow only if you explicitly need to publish to the Etendo Go module. Example: "Deploy the UI legacy flow" or run `make deploy LEGACY_DEPLOY=1`.



## First Steps (Manual)
### 1. Refresh the menu cache

The menu cache indexes all Etendo windows, processes, and reports for fast lookup:

```bash
node cli/src/menu-cache.js refresh
```

### 2. Explore available windows and processes

```bash
# Search by name
node cli/src/menu-cache.js search "sales order"

# Filter by type
node cli/src/menu-cache.js search "invoice" --type window
node cli/src/menu-cache.js search "payment" --type process

# List all of a type
node cli/src/menu-cache.js list window
node cli/src/menu-cache.js list process
node cli/src/menu-cache.js list report
```

### 3. Run the pipeline for a window

The pipeline extracts metadata, classifies fields, generates contracts, configures NEO Headless, and generates the React frontend:

```bash
# By menu name (recommended — auto-detects type)
node cli/src/pipeline.js --menu-name "Sales Order"

# By menu ID
node cli/src/pipeline.js --menu-id 143
```

Pipeline steps (window mode):

| Phase | Step | Description |
|-------|------|-------------|
| F1a | extract-fields | Extract field metadata from Etendo DB |
| F1b | extract-rules | Extract business rules and callouts |
| F2 | validate | Validate schema (4 levels) |
| F3 | pre-classify | Auto-classify rules (deterministic + AI) |
| F4 | human-decisions | Open Decision Panel for human review |
| F6 | generate-contract | Generate frontend/backend contracts |
| F7 | push-to-neo | Configure NEO Headless (DB writes) |
| F8 | generate-frontend | Generate React components |
| F9 | run-tests | Run contract tests |

### 4. Start the dev server

Preview the generated UI with hot reload:

```bash
make dev
# → http://localhost:3100
```

By default it runs with mock data (`VITE_MOCK=true`). To connect to a live Etendo instance, create `tools/app-shell/.env.development.local` (gitignored — never `.env.development`, which is committed):

```env
VITE_MOCK=false
ETENDO_URL=http://localhost:8080/etendo
```

`ETENDO_URL` is the Vite dev proxy target (`server.proxy` in `vite.config.js` forwards
`/sws`, `/oauth2`, `/webhooks` to it), and the same resolved value is passed to the dev
report API plugin (`vite-plugins/report-api.js`) for its session checks and NEO calls. The
optional `JSREPORT_URL` (default `http://localhost:5488`) is resolved the same way and tells
that plugin, and the `/jsreport` proxy, where jsreport renders PDF/XLSX/CSV. Both are read at server start, so restart
`make dev` after changing them. **Do not also set `VITE_API_BASE` to the absolute `ETENDO_URL`.**
`VITE_API_BASE` is read by the browser (`detectBaseUrl()`, `menuTree.js`, `rolesApi.js`,
etc.) to build every fetch URL; an absolute `http://localhost:8080/...` value there makes
the *browser* call port 8080 directly, bypassing the proxy entirely and hitting a CORS
error, since the backend does not allow `localhost:3100` as an origin. Leave it unset
(defaults to `''`, so every call stays a same-origin relative path proxied server-side —
no CORS involved) unless your Tomcat context name differs from the proxy's default
(`/etendo`), in which case set it to the **relative** context path only, e.g.
`VITE_API_BASE=/etendo_sf2` — never the full `host:port` form. See the
[Frontend (Vite / React)](#frontend-vite--react) table above for the same rule stated for
production.

### 5. Legacy deploy to Etendo (optional)

```bash
make deploy
```

`make deploy` is deprecated. The UI is now compiled during commits and deployed in a separate container, so this command only prints a warning by default.

If you still need the old copy-to-Etendo flow, run:

```bash
make deploy LEGACY_DEPLOY=1
```

In legacy mode, the built SPA is copied to `modules/com.etendoerp.go/web/com.etendoerp.go/` and served by Tomcat at `/etendo/web/com.etendoerp.go/` — no restart needed.

### 6. Run tests

```bash
make test
```

## CLI Tools Reference

All tools live in `cli/src/`. Available as `sf-*` commands after `npm install`:

| Command | Description |
|---------|-------------|
| `sf-pipeline` | Full pipeline (auto-detects window/process/report from menu) |
| `sf-extract-db` | Extract fields + rules from Etendo DB |
| `sf-extract` | Field extraction with FK resolution |
| `sf-extract-rules` | Rule + callout extraction |
| `sf-push-neo` | Configure NEO Headless via DB writes |
| `sf-lock` | Window lock management (via GitHub Issues) |
| `sf-check-version` | Check contract version and classify changes |

## Make Targets

```
make help                Show all targets
make install             Install all workspace dependencies
make dev                 Start dev server (localhost:3100)
make build               Build app-shell for production
make deploy              Deprecated; use LEGACY_DEPLOY=1 for the old copy flow
make test                Run all CLI tests
make test-ci             Run all unit tests and write JUnit XML reports to test-results/ (CI mode)
make test-frontend       Run frontend generator tests
make validate-pipeline   Check artifact pipeline consistency (see docs/pipeline-validator-reference.md)
make check-modules       Check every Etendo repo/module is on its expected branch (FETCH=0, ONLY=a,b, ROOT=<env path>, ALL_ENVS=1)
make clean               Remove build artifacts
```

## Pipeline Validation

The pipeline validator catches incomplete runs — stale `decisions.json` vs `contract.json` vs `generated/`,
orphan registry entries, missing report mock-data, and missing aggregate contracts.
No DB access required; it works entirely on git-tracked files.

### Quick reference

| Scenario                                          | Command                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------ |
| Check the whole repo                              | `make validate-pipeline`                                           |
| Check a single window I'm working on              | `node cli/src/validate-pipeline.js --scope=sales-order`            |
| Check several windows                             | `node cli/src/validate-pipeline.js --scope=a,b,c`                  |
| Check only what I've staged for commit            | `node cli/src/validate-pipeline.js --staged`                       |
| Check what changed since main                     | `node cli/src/validate-pipeline.js --changed-since=main`           |
| Get JSON output (CI / scripts)                    | `node cli/src/validate-pipeline.js --format=json`                  |
| Skip a noisy rule temporarily                     | `node cli/src/validate-pipeline.js --skip=F4`                      |

### Pre-commit hook

`make install` activates the hook via `git config core.hooksPath .githooks`. The hook runs **only on staged
artifact / generator / registry files** — it's fast and won't fire on unrelated commits.

There is no useful bypass. A commit made with `git commit --no-verify` is left without
its `Hooks-Verified` trailer by `.githooks/commit-msg`, and the push gate and CI's
`verify` check refuse it, so skipping the hook only moves the failure to the push. Fix
what the hook reports and commit again. When an amend or a rebase leaves a commit whose
trailer no longer matches it, `.githooks/post-rewrite` says so right away and prints the
command that re-seals it. See **Bypass** in `CLAUDE.md`.

### CI behavior

`.github/workflows/pipeline-validate.yml` runs in **shadow mode** today (`continue-on-error: true`) — failures
annotate the PR but do not block merge. This will flip to enforce mode once the P3 backfill lands.

### What to do when it fails

| Code | What it means | Fix |
| ---- | ------------- | --- |
| F1 stale-decisions | `decisions.json` changed after `contract.json` was generated | `node cli/src/resolve-curated.js --window <name> --write` |
| F2 stale-generated | `generated/` is out of date with `contract.json` | Same command — regenerates `generated/` |
| F3 orphan-registry | `contract.json` exists but window is not in registry | Re-add the artifact **or** remove the entry from `tools/app-shell/src/windows/registry.js` |
| F4 orphan-output (WARN) | `generated/` exists but no `contract.json` | Safe to ignore for now |

Full rule reference: [`docs/pipeline-validator-reference.md`](docs/pipeline-validator-reference.md)

### Further reading

- [`docs/pipeline-validator-reference.md`](docs/pipeline-validator-reference.md) — complete rule table (F1–F10), severity, and resolution steps
- [`docs/plans/2026-04-16-pipeline-completeness-validator.md`](docs/plans/2026-04-16-pipeline-completeness-validator.md) — design plan

## Project Structure

```
etendo_schema_forge/
├── cli/                    # Node.js CLI tools (extractors, validators, generators)
├── tools/
│   ├── app-shell/          # Main UI shell (Vite + React + Tailwind)
│   ├── decision-panel/     # Field visibility + rule curation UI
│   └── ui-preview/         # Live preview with mock data
├── artifacts/              # Per-window/process outputs (schemas, contracts, generated code)
├── core-maps/              # Shared metadata (system columns, AD reference map, menu cache)
├── scripts/                # Helper scripts (JWT tokens for testing)
├── docs/                   # All documentation
├── Makefile                # Build, test, deploy commands
└── .env.example            # Environment configuration template
```

## Documentation

See [`docs/index.md`](docs/index.md) for the full documentation index, including:

- [Architecture Overview](docs/architecture-overview.md) — system design, data flow
- [PRD](docs/PRD.md) — product requirements and scope
- [TDD](docs/TDD.md) — technical design and data models
- [NEO Headless Extensibility](docs/neo-headless-extensibility.md) — how to extend the runtime API
- [Etendo AD Reference](docs/etendo-ad/index.md) — how the Application Dictionary works
- [local-env plugin](docs/local-env-plugin.md) — per-environment Etendo GO (seed, SPA, ports, origins, MCP/OAuth URLs)
- [Repo topology](docs/repo-topology.md) — functional vs core vs runtime repos, developer profiles
