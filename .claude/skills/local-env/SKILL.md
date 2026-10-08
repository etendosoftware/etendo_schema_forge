---
name: local-env
description: >
  Run an isolated Etendo GO environment (its own PostgreSQL, Tomcat and SPA) for one task's
  branches of com.etendoerp.go, etendo_core or schema_forge, without touching the main checkout
  /Users/futit/Workspace/etendo_develop. Use when a task needs a running backend or SPA for its
  own branch, when another session asks the coordinator for an environment, or when an
  environment under /Users/futit/Workspace/.worktrees/ fails: update.database on a missing
  AD_COLUMN, vite "Failed to resolve import" from schema_forge_core, the SPA on the wrong port,
  status without the SPA line. Triggers on: "local-env", "entorno aislado", "levantar un
  entorno", "worktree environment", "backend for my branch", "run JUnit against a DB".
---

# local-env for Etendo GO

The generic tool is covered by the global `etendo-worktrees` skill: command table,
`worktree.conf` and `sync`, `adopt`, readiness check. Load it for any command not
listed here. This skill carries what is specific to Etendo GO and to this machine.

- **Main checkout:** `/Users/futit/Workspace/etendo_develop`. It is the user's. Its
  config, DB and build stay untouched.
- **Environments:** `/Users/futit/Workspace/.worktrees/<name>`, one per task.
- **GO plugin:** `schema_forge/local-env.d/plugins/etendo-go`. What it does per hook:
  [docs/local-env-plugin.md](../../../docs/local-env-plugin.md).
- **Progress mod:** if the user has not installed it, recommend it before a long `up`:
  `/plugin install local-env-progress --marketplace etendosoftware/etendo-localenv`.
  It shows every environment's phase, gradle task and elapsed time above the prompt,
  including runs started in the background. Without it, the progress lives only in
  `<env>/build/local-env/progress.json` and the logs.

## Rules

1. **Ask before `up`.** `local-env up` runs install or update.database, smartbuild and
   Tomcat, and the user controls build/deploy. Creating the environment
   (`local-env worktree ...`) only reads the main checkout and runs `git worktree add`:
   no approval needed for that step.
2. **Lifecycle commands run inside the environment.** `up`, `off`, `stop`, `reset`,
   `sync` and every `./gradlew` act on the checkout you stand in, so run them from
   `<env>`. The only commands run from `etendo_develop` are `local-env worktree ...`
   and `local-env worktree rm`. Confirm with `local-env status` before acting.
3. **Copies are frozen snapshots.** Every repo not named at creation is an APFS copy of
   the main checkout as it was at that moment, with its own `.git`. A later `git pull`
   in the main checkout never reaches the environment. Commit only in the repos you
   named (real worktrees); a commit in a copy lands in a throwaway `.git`.
4. **Module branches are checked before creating, because copies freeze them.** An
   environment only builds when every module matches what `com.etendoerp.go` expects.
   The GO module carries `ETGO_SF_FIELD` rows that point at columns from other modules.
   If one of those modules is behind, `update.database` fails on a missing `AD_COLUMN`
   or smartbuild fails on a missing getter. The rule:
   - **Modules that follow the epic** (today `epic/ETP-3504`; as of 2026-10-08:
     `com.etendoerp.psd2.bank.integration`, `com.etendoerp.db.extended`,
     `com.etendoerp.go.localization.es.data`, `com.etendoerp.go.template`,
     `com.etendoerp.sif.general`, `com.etendoerp.verifactu`, `com.smf.currency.*`,
     `com.smf.ticketbai`, `org.openbravo.module.aeat*`, `bptaxidkey`, `intrastat`, `sii`,
     `taxreportlauncher`) are on the epic branch, **pulled to its latest commit**, or on
     a branch cut from it.
   - **`com.etendoerp.go`** is on `develop` or on a `feature/ETP-XXXX` cut from
     `origin/develop`.
   - The rest (`copilot`, `docker`, `tomcat`, `devassistant`, `hqlquerytool`) stay on
     whatever the user has; they do not shape the DB model GO depends on.

   Before `local-env worktree`, run this from `etendo_develop/modules` and report any
   module that is not on the expected branch or shows `behind>0`:

   ```bash
   for d in */; do d=${d%/}; [ -e "$d/.git" ] || continue; git -C "$d" fetch -q origin
     u=$(git -C "$d" rev-parse --abbrev-ref @{u} 2>/dev/null)
     printf '%-42s %-22s behind=%s\n' "$d" "$(git -C "$d" branch --show-current)" \
       "$([ -n "$u" ] && git -C "$d" rev-list --count HEAD.."$u" || echo '?')"; done
   ```

   Pulling is the user's call (it changes their main checkout): ask, then create the
   environment after they pull. When a module must be on a task branch, name it with
   `--module <module>=<branch>` so it becomes a real worktree instead of a copy.
   Recompute the epic list with the same loop (the modules whose branch is `epic/*`)
   instead of trusting the dated list above.
5. **Know where each branch is checked out before creating.** A task branch can sit in
   the main checkout's repo, in a manual or agent worktree (`schema_forge-ETP-XXXX`,
   `.claude/worktrees/*`, `modules/*` worktrees), or nowhere. git allows a branch in one
   place only, and the right flag depends on where it is. For every repo the task
   touches (core = `etendo_develop`, `modules/<m>`, `schema_forge`, `schema_forge_core`),
   run `git -C <repo> worktree list --porcelain` and find the path whose `branch` line is
   `refs/heads/<branch>`. Then state it to the user as a table before creating:

   | Repo | Branch | Where it is checked out now | What the environment does |
   |---|---|---|---|
   | `modules/com.etendoerp.go` | `feature/ETP-X` | nowhere | `--module …=feature/ETP-X` (new worktree) |
   | `schema_forge` | `feature/ETP-X` | `etendo_develop/schema_forge-ETP-X` (manual worktree) | `--repo schema_forge=feature/ETP-X@adopt` |
   | `schema_forge` | `feature/ETP-X` | the main checkout itself (`etendo_develop/schema_forge`) | copy (no flag) if it is clean enough to snapshot, or `@adopt` to share it live; ask |
   | other modules | (whatever is checked out) | main checkout | copy, frozen at creation |

   - **Nowhere:** `--module/--repo <name>=<branch>` creates a real worktree.
   - **Another worktree:** `@adopt` links it. local-env never modifies it, but the SPA's
     `make` may write into it, so tell its owner (often another Claude session).
   - **The main checkout:** a copy takes its current state, uncommitted changes
     included, frozen. `@adopt` shares the user's live checkout instead. Never pick one
     silently.
   - A copy is never the branch: commits made there are lost. If the user will commit
     on that repo inside the environment, it must be a worktree or an adoption.
6. **Change repos with `sync`, not by recreating.** Edit `<env>/worktree.conf`, then
   `local-env sync --dry-run` and `local-env sync`. When the branch is already checked
   out elsewhere (a manual worktree, another session's), add `adopt` as the 4th field.
   local-env never modifies an adopted worktree, but `make dev-local-core` can: it runs
   `npm install` for the AI BFF, which may rewrite `tools/ai-bff/package-lock.json`
   there. Tell the owner of that worktree.
7. **Create volume data in the environment's DB only.** It is `etendo_local`, user
   `tad`/`tad`, on the environment's PG port (`source <env>/build/local-env/env`), via
   `/opt/homebrew/opt/libpq/bin/psql`.

## Typical run (go-only task)

```bash
cd /Users/futit/Workspace/etendo_develop
local-env worktree ETP-XXXX --module com.etendoerp.go=feature/ETP-XXXX   # add --base=origin/develop for a new branch
cd ../.worktrees/ETP-XXXX
local-env up > /tmp/ETP-XXXX-up.log 2>&1 &                                # after the user approves
```

Ports are printed at creation; `local-env worktree ls` lists them later. Expect on this
machine: Docker holds 8080/8081, so Tomcat lands on 8081/8082/8083…; PostgreSQL on
55433+; SPA on 3101+ and AI BFF on 3401+ (the main checkout keeps 3100/3400).

What the GO plugin adds on `up`:

- after `install`, seeds **GOClient** (users `GOuser`, `goadmin@etendo.software`), so
  the seed is baked into the DB snapshot;
- starts the SPA with `make dev-local-core ETENDO_URL=<env Tomcat> SPA_PORT=… BFF_PORT=…`;
- runs the environment's own `schema_forge` / `schema_forge_core`, not the main ones;
- lets its Tomcat accept the SPA's origin: on a port other than 3100 it writes
  `export ETGO_ALLOWED_ORIGINS=http://localhost:<port>,http://127.0.0.1:<port>` into
  `<env>/build/local-env/env` (merged with any value already there) at creation, or on
  the first `up` of an older environment. Tomcat inherits it from that file.

JUnit inside an environment, from `<env>`: `./gradlew test --no-daemon --tests '...'`.
Its config already points at the environment's DB.

## Stop and remove

```bash
pkill -f -- "-Dcatalina.base=<env>/"        # Tomcat
cd <env> && local-env stop                  # SPA + PostgreSQL
cd /Users/futit/Workspace/etendo_develop && local-env worktree rm <name>   # branches are kept
```

## Failures and fixes

| Symptom | Cause | Fix |
|---|---|---|
| `update.database` fails on an `AD_COLUMN` that an `ETGO_SF_FIELD` row references | A copied module is behind the GO branch (2026-10-07: go develop referenced a PSD2 column from `com.etendoerp.psd2.bank.integration` `origin/epic/ETP-3504`) | Run the module check from rule 4. Have the user pull the lagging modules in the main checkout, then `worktree rm` and recreate. Or fast-forward that module's copy inside the environment (`git -C <env>/modules/<m> fetch && merge --ff-only origin/<epic>`) |
| smartbuild: `cannot find symbol` on a getter/setter of a column that exists in the env DB (2026-10-08: `getPSD2LastSyncDate()`), and `./gradlew generate.entities` "succeeds" without adding it | The environment carried the main checkout's `src-gen`, generated against a DB without that column. Entity generation is timestamp-based and judges the carried files up to date | From `<env>` only, after checking its config points at the env DB: `rm -rf src-gen build/classes && ./gradlew --no-daemon compile.complete -Dbuild.maxmemory=3072M` (~3 min), then `local-env up`. Deleting `src-gen` alone breaks smartbuild (`srcdir src-gen does not exist`). A local-env fix is pending |
| No `SPA` line in `local-env status`; SPA never starts | The environment's `schema_forge` branch predates the plugin | Prefix every `up`, `status` and `stop` with `LOCALENV_PLUGINS=/Users/futit/Workspace/etendo_develop/schema_forge/local-env.d/plugins`. Leaving it off a later call drops the plugin's manifest line and status misreports |
| SPA binds 3100/3400, clashing with the main checkout | That `schema_forge` branch has no `SPA_PORT` support | Free 3100/3400 first. `/api/ai` then hits the BFF on 3400 |
| Login from the SPA: 403 "Origin not allowed" | The backend trusts only :3000/3100/4173/5173 plus `ETGO_ALLOWED_ORIGINS`, and this Tomcat started without the SPA's port in it | The plugin adds the line itself. If `up` warned that it added it while a Tomcat was already running, restart that Tomcat once (`pkill -f -- "-Dcatalina.base=<env>/"`, then `local-env up`). Check: `grep ETGO_ALLOWED_ORIGINS <env>/build/local-env/env` |
| Tomcat: `UnknownHostException: host.docker.internal`, "El intento de conexión falló", 404 on `/etendo`, after an `up` that ran smartbuild | `docker_com.etendoerp.tomcat=true` in the user's `gradle.properties`: smartbuild's `tomcatDeploy` rewrote `bbdd.url` in `WEB-INF/Openbravo.properties` to `host.docker.internal` | Fixed in local-env (`up` forces the flag off and puts a wrong deployed `bbdd.url` back, with a warning). On an older local-env: set the flag to `false` in `<env>/gradle.properties` and `bbdd.url=jdbc:postgresql://localhost:<env PG port>` in `<env>/WebContent/WEB-INF/Openbravo.properties` and `<env>/build/local-env/catalina/webapps/etendo/WEB-INF/Openbravo.properties`, then restart Tomcat |
| vite: `Failed to resolve import "write-excel-file/universal"` (or any core dep) | `schema_forge_core` without `node_modules`, or with ones older than its branch's `package-lock.json`. local-env now clones the source repo's ignored content (`node_modules`, `.env`, outputs) into every new `--repo`/`--module` worktree, and the GO plugin runs `npm install` in `schema_forge_core` on `up` when its lockfile is newer than the last install | Environments created with an older local-env: `cp -cR /Users/futit/Workspace/etendo_develop/schema_forge_core/node_modules <env>/schema_forge_core/`, or let the next `up` install. An adopted `schema_forge_core` is never installed into: the plugin warns and skips the SPA; install there yourself |
| Warning about `CATALINA_HOME` with an empty `conf/` | Broken local Tomcat install | Nothing: local-env skips it and uses a complete Tomcat 9 from its cache or `~/Downloads`, or downloads one |

## Limits

- **No pgvector** in the bundled PostgreSQL: vector search and record results in the
  CommandPalette do not work. Test those against a full instance.
- **Tiny seed:** GOClient has 5 products and 2 warehouses. Create any volume data in the
  environment's DB (rule 5).

## When another session asks for an environment

First run the module check from rule 4 and the checkout check from rule 5, and list any lagging, off-branch or busy repo in the
answer. Then give the exact `local-env worktree` command for its branches, the ports it will
get, and the caveats that apply (frozen copies, carried `node_modules` that may lag the branch,
`LOCALENV_PLUGINS` for old branches, no pgvector). Create it and run `up` only after
the user approves.
