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
4. **Change repos with `sync`, not by recreating.** Edit `<env>/worktree.conf`, then
   `local-env sync --dry-run` and `local-env sync`. When the branch is already checked
   out elsewhere (a manual worktree, another session's), add `adopt` as the 4th field.
   local-env never modifies an adopted worktree, but `make dev-local-core` can: it runs
   `npm install` for the AI BFF, which may rewrite `tools/ai-bff/package-lock.json`
   there. Tell the owner of that worktree.
5. **Create volume data in the environment's DB only.** It is `etendo_local`, user
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
| `update.database` fails on an `AD_COLUMN` that an `ETGO_SF_FIELD` row references | A copied module is behind the GO branch (2026-10-07: go develop referenced a PSD2 column from `com.etendoerp.psd2.bank.integration` `origin/epic/ETP-3504`) | Pull the missing modules in the main checkout, then `worktree rm` and recreate. Or fast-forward that module's copy inside the environment |
| No `SPA` line in `local-env status`; SPA never starts | The environment's `schema_forge` branch predates the plugin | Prefix every `up`, `status` and `stop` with `LOCALENV_PLUGINS=/Users/futit/Workspace/etendo_develop/schema_forge/local-env.d/plugins`. Leaving it off a later call drops the plugin's manifest line and status misreports |
| SPA binds 3100/3400, clashing with the main checkout | That `schema_forge` branch has no `SPA_PORT` support | Free 3100/3400 first. `/api/ai` then hits the BFF on 3400 |
| Login from the SPA: 403 "Origin not allowed" | The backend trusts only :3000/3100/4173/5173 plus `ETGO_ALLOWED_ORIGINS`, and this Tomcat started without the SPA's port in it | The plugin adds the line itself. If `up` warned that it added it while a Tomcat was already running, restart that Tomcat once (`pkill -f -- "-Dcatalina.base=<env>/"`, then `local-env up`). Check: `grep ETGO_ALLOWED_ORIGINS <env>/build/local-env/env` |
| Tomcat: `UnknownHostException: host.docker.internal`, "El intento de conexión falló", 404 on `/etendo`, after an `up` that ran smartbuild | `docker_com.etendoerp.tomcat=true` in the user's `gradle.properties`: smartbuild's `tomcatDeploy` rewrote `bbdd.url` in `WEB-INF/Openbravo.properties` to `host.docker.internal` | Fixed in local-env (`up` forces the flag off and puts a wrong deployed `bbdd.url` back, with a warning). On an older local-env: set the flag to `false` in `<env>/gradle.properties` and `bbdd.url=jdbc:postgresql://localhost:<env PG port>` in `<env>/WebContent/WEB-INF/Openbravo.properties` and `<env>/build/local-env/catalina/webapps/etendo/WEB-INF/Openbravo.properties`, then restart Tomcat |
| vite: `Failed to resolve import "write-excel-file/universal"` (or any core dep) | A git-worktree'd `schema_forge_core` has no `node_modules`; git does not carry ignored files. Known tool gap | `cp -cR /Users/futit/Workspace/etendo_develop/schema_forge_core/node_modules <env>/schema_forge_core/` |
| Warning about `CATALINA_HOME` with an empty `conf/` | Broken local Tomcat install | Nothing: local-env skips it and uses a complete Tomcat 9 from its cache or `~/Downloads`, or downloads one |

## Limits

- **No pgvector** in the bundled PostgreSQL: vector search and record results in the
  CommandPalette do not work. Test those against a full instance.
- **Tiny seed:** GOClient has 5 products and 2 warehouses. Create any volume data in the
  environment's DB (rule 5).

## When another session asks for an environment

Answer with the exact `local-env worktree` command for its branches, the ports it will
get, and the caveats that apply (frozen copies, `schema_forge_core` `node_modules`,
`LOCALENV_PLUGINS` for old branches, no pgvector). Create it and run `up` only after
the user approves.
