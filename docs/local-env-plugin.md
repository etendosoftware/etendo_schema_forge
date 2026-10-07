# local-env plugin: Etendo GO per environment

`local-env` (repo `etendo-localenv`) gives an Etendo checkout a cached local
PostgreSQL + build + Tomcat, and parallel environments per branch (worktrees). It
knows Etendo Classic only. Everything about Etendo GO lives here, in the plugin
`local-env.d/plugins/etendo-go`, which local-env discovers on its own because
`schema_forge/` is a top-level directory of the checkout. Plugin contract (discovery,
hooks, `LOCALENV_*` variables, failure policy): `etendo-localenv` →
`docs/design.md` §6.7.

## What it does

| local-env hook | The plugin |
|---|---|
| `manifest` | prints `seed GOClient v1`, which becomes part of the DB fingerprint, so a DB with the GO sample client never shares a cached snapshot with one without it |
| `db-seed` | prints the gradle invocations that load it, one per line: `import.sample.data -Pclient=GOClient`, then `prepareOnboardingSampledata --info`. local-env runs them right after `install`, against its own guarded DB, before the DB is snapshotted; every later DB comes from a snapshot that already carries the seed. A failed seed aborts `local-env up` |
| `worktree-create` | reserves a free `SPA_PORT` (from 3101) and `BFF_PORT` (from 3401) for the new environment, skipping the ports other environments reserved and anything listening, and appends them to the environment's `build/local-env/env`. The main checkout keeps 3100 / 3400 |
| `up` | in the background, in this environment's `schema_forge`: `make install` when `node_modules` is missing or `package-lock.json` changed since the last install, then `make dev-local-core ETENDO_URL=<this environment's Tomcat URL> SPA_PORT=… BFF_PORT=…`. Prints the SPA URL; log and pid in `build/local-env/plugins/etendo-go/` |
| `status` | `SPA  http://localhost:<port> (running\|stopped)` |
| `stop`, `off`, `worktree-rm` | stops this environment's SPA + BFF (one process group), nobody else's |
| `sync` | nothing for now (it exits 0). `local-env sync` refuses to run while this SPA is up, since it runs from inside the environment: `local-env stop` first |

`manifest` and `db-seed` print nothing when `modules/com.etendoerp.go` is not in
the checkout, and `up` then does not start the SPA either. A plugin failure never
stops local-env: it prints a warning and carries on.

## Using it

```bash
local-env up                                   # Etendo + the GO SPA on :3100 against :8080
local-env worktree ETP-1234 --module com.etendoerp.go=feature/ETP-1234 \
  --repo schema_forge=feature/ETP-1234 --repo schema_forge_core=feature/ETP-1234
cd ../.worktrees/ETP-1234 && local-env up      # its own Tomcat, and its own SPA on e.g. :3101
local-env status                               # ... SPA  http://localhost:3101 (running)
# one more module on a branch after all? add `module <module> feature/ETP-1234` to
# that environment's worktree.conf, Ctrl-C its Tomcat, then:
#   local-env stop && local-env sync && local-env up    (stop also stops its SPA)
local-env worktree rm ETP-1234                 # stops that SPA too
```

Skip the SPA for one run with `local-env up --skip-plugin=etendo-go` (or
`ETENDO_GO_SPA=0 local-env up`); the DB seed is unaffected. `LOCALENV_SKIP_PLUGINS=etendo-go`
disables the plugin entirely, seed included, and therefore changes the DB fingerprint.

Because the seed is part of the fingerprint, the first `up` of a checkout with
`modules/com.etendoerp.go` needs a GO-seeded snapshot: from the shared cache if
someone published one for these versions, otherwise a one-off `install` + seed. An
existing live DB is only brought up to date (`update.database`) and keeps the data
it had; `local-env up --fresh` replaces it with a seeded one.

`make dev-local-core` needs `schema_forge_core` next to `schema_forge` (see
[repo-topology.md](repo-topology.md)); when it is missing the plugin warns and does
not start the SPA. In a worktree, `schema_forge_core` is an APFS clone of the main
checkout's unless it is passed with `--repo`.

## Ports outside local-env

`make dev` and `make dev-local-core` read `SPA_PORT` (default 3100) and `BFF_PORT`
(default 3400): vite serves on `SPA_PORT` (still `strictPort`), proxies `/api/ai` to
`BFF_PORT`, and the AI BFF listens on `BFF_PORT`. `dev-local-core` frees only those
two ports before starting. Unset, both targets behave exactly as before.

```bash
make dev-local-core SPA_PORT=3191 BFF_PORT=3491 ETENDO_URL=http://localhost:8082/etendo
```

Pass them as make variables (as above, or exported): a value given on the make
command line also beats one in `schema_forge/.env`, which the Makefile includes.
The E2E suite and the backend's dev CORS / OAuth2 allowlist assume :3100; a SPA on
another port works through the vite proxy, but run E2E against the :3100 one.
