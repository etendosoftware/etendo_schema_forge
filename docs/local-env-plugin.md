# local-env plugin: Etendo GO per environment

`local-env` (repo `etendo-localenv`) gives an Etendo checkout a cached local
PostgreSQL + build + Tomcat, and parallel environments per branch (worktrees). It
knows Etendo Classic only. Everything about Etendo GO lives here, in the plugin
`local-env.d/plugins/etendo-go`, which local-env discovers on its own because
`schema_forge/` is a top-level directory of the checkout. Plugin contract (discovery,
hooks, `LOCALENV_*` variables, failure policy): `etendo-localenv` →
`docs/design.md` §6.7.

Agents running a per-task environment: rules, ports, known failures and limits live in
the project skill [`.claude/skills/local-env/SKILL.md`](../.claude/skills/local-env/SKILL.md).

## What it does

| local-env hook | The plugin |
|---|---|
| `manifest` | prints `seed GOClient v1`, which becomes part of the DB fingerprint, so a DB with the GO sample client never shares a cached snapshot with one without it |
| `db-seed` | prints the gradle invocations that load it, one per line: `import.sample.data -Pclient=GOClient`, then `prepareOnboardingSampledata --info`. local-env runs them right after `install`, against its own guarded DB, before the DB is snapshotted; every later DB comes from a snapshot that already carries the seed. A failed seed aborts `local-env up` |
| `worktree-create` | reserves a free `SPA_PORT` (from 3101) and `BFF_PORT` (from 3401) for the new environment, skipping the ports other environments reserved and anything listening, and appends them to the environment's `build/local-env/env`, together with `ETGO_ALLOWED_ORIGINS` for that SPA port (see *Allowed origins* below), and points `etgo.mcp.public.url` / `etgo.oauth2.public.url` at that port (see *MCP and OAuth public URLs* below). The main checkout keeps 3100 / 3400 |
| `up` | in the background: `npm install` in this environment's `schema_forge_core` and `make install` in its `schema_forge`, each only when its `node_modules` is missing or its `package-lock.json` is newer than the last install (local-env clones `node_modules` into new worktrees from the source checkout, so they can lag the branch); then, in `schema_forge`, `make dev-local-core ETENDO_URL=<this environment's Tomcat URL> SPA_PORT=… BFF_PORT=… SCHEMA_FORGE_CORE=… ETENDO_MCP_URL=<Tomcat URL>/sws/mcp ETENDO_USAGE_URL=<Tomcat URL>/sws/neo/usage`. The AI BFF reads `ETENDO_MCP_URL`, not `ETENDO_URL`, and would otherwise call the main checkout's :8080. A branch whose Makefile predates `SPA_PORT` runs on :3100/:3400 and frees them first, so in a worktree it is started only while both are free (otherwise a warning, no SPA). Prints the SPA URL; log and pid in `build/local-env/plugins/etendo-go/` |
| `status` | `SPA  http://localhost:<port> (running\|starting\|stopped)`. `<port>` is the one the SPA really listens on (`lsof` on its process group, vite's listener), so a branch whose Makefile ignores `SPA_PORT` shows its own port, flagged `not the reserved :<SPA_PORT>`; until it listens, the reserved port with `(starting)`. local-env puts the URL into `progress.json` (`urls.SPA`) |
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

**Recommended in Claude Code: the progress mod.** etendo-localenv ships a Claude Code mod
that shows each environment's `local-env` run (phase, step N of M, gradle task, elapsed,
then the Tomcat/SPA URLs or the error) in a band above the prompt. Install it once with:

```
/plugin install local-env-progress --marketplace etendosoftware/etendo-localenv
```

It reads `build/local-env/progress.json`, which local-env writes during every run, so
it also covers runs started in the background.

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

The plugin always runs the **environment's** repos, `$ETENDO_ROOT/schema_forge` and
`$ETENDO_ROOT/schema_forge_core`, not the ones next to the file it was loaded from;
only when the environment has no such directory does it fall back to its own
checkout. Two cases depend on this:

- the plugin comes from another checkout (`LOCALENV_PLUGINS=<main>/schema_forge/local-env.d/plugins`,
  e.g. for a branch that predates the plugin);
- the environment's `schema_forge` is an adopted worktree (a `worktree.conf` line with
  `adopt`: a symlink to a worktree someone else owns). From inside it `../` resolves
  physically to that worktree's siblings, so the plugin passes
  `SCHEMA_FORGE_CORE=$ETENDO_ROOT/schema_forge_core` to vite explicitly. It never
  installs into an adopted worktree (`schema_forge` or `schema_forge_core`): if its
  `node_modules` are missing or stale it warns and does not start the SPA. Note that `make dev-local-core` itself may still
  write there (the AI BFF's `npm install`, vite's cache).

## Allowed origins

The backend (`com.etendoerp.go` `CorsUtils`) accepts a browser origin only when it is
`localhost:3000/3100/4173/5173`, the request's own origin, or listed in
`ETGO_ALLOWED_ORIGINS` (comma-separated, added to those defaults; a
`-Detgo.allowed.origins` system property replaces the variable). A SPA on any other
port is refused with 403 "Origin not allowed" at login.

So when an environment's `SPA_PORT` is not 3100 the plugin writes
`export ETGO_ALLOWED_ORIGINS=http://localhost:<port>,http://127.0.0.1:<port>` into
`<env>/build/local-env/env`: at `worktree-create`, and at `up` for an environment
created before this existed. An existing value (the file's line, else one inherited
from the shell) is kept and only the missing origins are appended. Tomcat inherits the
variable: local-env sources that file, and `tomcat-fast` sources it again right before
starting the JVM, so the Tomcat started by the same `up` already has it. Only a Tomcat
that was running when the line was added lacks it; `up` then warns to restart it once.

## MCP and OAuth public URLs

An MCP client (Claude Code) that logs in through a SPA's OAuth edge reads the vite
well-known metadata, which advertises resource `http://localhost:<SPA port>/mcp` and
issuer `http://localhost:<SPA port>`. The backend validates the token audience against
`etgo.mcp.public.url`, and the client requires the issuer to equal
`authorization_servers[0]`, which comes from `etgo.oauth2.public.url` (see
[agentic-validation/mcp-client-setup.md](agentic-validation/mcp-client-setup.md),
*The two properties*). A worktree copies both from the main checkout, so they say :3100
and the login against a SPA on any other port fails.

So when an environment's `SPA_PORT` is not 3100 the plugin rewrites them to
`http://localhost:<port>/mcp` and `http://localhost:<port>` (no `/oauth2`), at
`worktree-create` and at every `up` (which covers environments created before this
existed). Files, all inside the environment, never the main checkout:

- `<env>/gradle.properties` (plain: `http://localhost:<port>`);
- `<env>/config/Openbravo.properties` and `<env>/WebContent/WEB-INF/Openbravo.properties`;
- the deployed `<env>/build/local-env/catalina/webapps/*/WEB-INF/Openbravo.properties`, when it exists.

Each rewritten line keeps its own escaping (`http\://localhost\:<port>` in the
`Openbravo.properties` files). Only a value of the form `http://localhost:<other port>…`
is rewritten. A custom public URL (any other host) is kept, and so is a `127.0.0.1` one.
An absent property is **not** added: unlike `ETGO_ALLOWED_ORIGINS`, which is additive to
the backend's defaults and harmless when unused, an absent public URL makes
`PublicUrlResolver` derive it from the request (Tomcat's own URL), and adding one would
change that for an environment that never uses the SPA's OAuth edge. A value that
already points at the SPA port is left alone, so `up` is a no-op on an aligned
environment.

Properties load at context init. A Tomcat started by the same `up` reads the new values;
one already running does not, and `up` warns to restart it once.

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
`dev-local-core` checks for the core at `SCHEMA_FORGE_CORE` (default
`../schema_forge_core`), the same directory vite resolves it from.
The E2E suite and the backend's dev CORS / OAuth2 allowlist assume :3100; a SPA on
another port works through the vite proxy, but run E2E against the :3100 one.
