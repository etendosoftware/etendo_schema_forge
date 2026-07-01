# Connecting an MCP client to the Etendo GO MCP server

How to connect an MCP client (e.g. Claude Code) to the Etendo GO MCP server, for **two
environments**:

- **LOCAL** — the MCP running on your own machine (Tomcat `:8080` behind the Vite dev server `:3100`).
- **EXPERIMENTAL** — the shared cloud server at `go.experimental.etendo.cloud`.

These let a developer drive the MCP tools (`neo_*`, `generate_*`) from their PC, either against
their own build or against the experimental server for testing.

> **Always name the registered server after its environment** (`etendo-go-local` vs
> `etendo-go-exp`). The same client can have both configured at once — distinct names are
> the only thing that stops you from testing locally while accidentally hitting experimental (or
> vice-versa). Throughout this doc, every command and property is labelled with its environment.

> **For Tracer (mcp-ticket-resolver):** a `401`/`404` on the OAuth `/register` or `/.well-known/*`
> step while connecting **locally** is a **setup gap**, not a validation-bot ticket. Never classify
> it as a `code-bug`.

---

## LOCAL environment

### TL;DR (LOCAL)

Connect the client to the **Vite dev server** (`http://localhost:3100/mcp`), **not** the raw Tomcat
backend (`:8080`), and set two public-URL properties to the `:3100` origin. The dev server is the
**local edge** — the equivalent of the production CloudFront/ingress that makes OAuth discovery
work. Pointing the client at `:8080` directly fails because nothing bridges the OAuth discovery URL
shapes locally.

```bash
# LOCAL — register against the dev-server edge, never :8080
claude mcp add --transport http etendo-go-local http://localhost:3100/mcp
```

```properties
# LOCAL — gradle.properties (and config/Openbravo.properties), both gitignored
etgo.oauth2.public.url=http://localhost:3100        # BARE origin, no /oauth2 path
etgo.mcp.public.url=http://localhost:3100/mcp       # WITH /mcp
```

Then **restart Tomcat**, make sure `make dev` (the `:3100` server) is running and you are **logged
into the PWA** at `http://localhost:3100`, and authenticate: `/mcp` → `etendo-go-local` →
Authenticate.

### Why it fails against `:8080` directly (the URL-shape mismatch)

The MCP SDK does RFC 8414 / RFC 9728 OAuth discovery: it only ever requests the
**path-insertion / origin-root** well-known shape
(`http://host/.well-known/oauth-authorization-server/<path>`,
`http://host/.well-known/oauth-protected-resource`). The Etendo `OAuth2Servlet` instead serves its
metadata as a **path-append** sub-path of each servlet
(`…/etendo/oauth2/.well-known/oauth-authorization-server`,
`…/etendo/sws/mcp/.well-known/oauth-protected-resource`).

The two sets of URLs **never overlap**, so every discovery request against `:8080` `404`s. The SDK
then falls back to default endpoints at the issuer **origin** and POSTs to
`http://localhost:8080/register` → `404`.

**Production / experimental works** because it sits behind a reverse proxy (CloudFront /
`infra/cloudfront-functions/etendo-path-rewrite.js`) that serves origin-root discovery and routes
`/mcp`, `/oauth2/*`, `/authorize`, `/token` to the right backend paths. **Locally the Vite dev
server `:3100` is that same edge** — so you connect to it, not to `:8080`.

### How `:3100` bridges it (LOCAL)

`tools/app-shell/vite.config.js` is the local edge. It:

- **Serves RFC-compliant discovery at origin-root** via `mcpWellKnownPlugin()` — the exact
  path-insertion shapes the SDK asks for, built from the request `Host` (`http://localhost:3100`).
- **Rewrites `/mcp` → `/sws/mcp`** (`vite-plugins/mcp-proxy.js`) and **proxies `/oauth2/*`, `/sws/*`**
  to the Tomcat backend (`ETENDO_URL`, default `http://localhost:8080/etendo`).

So the client only ever talks to `:3100`, which presents the production-shaped surface and forwards
to Tomcat underneath.

### The two properties — why these exact values (LOCAL)

Resolved by `PublicUrlResolver` (`com.etendoerp.go/.../common/PublicUrlResolver.java`), which reads
them and stamps them into the metadata the backend emits. They MUST match what the `:3100` edge
advertises, or the SDK rejects the flow:

| Property | Value (LOCAL) | Why this value |
|---|---|---|
| `etgo.oauth2.public.url` | `http://localhost:3100` | The dev plugin returns `issuer = http://localhost:3100` (bare origin). The SDK validates that AS-metadata `issuer` equals `authorization_servers[0]`. Adding `/oauth2` breaks that match. |
| `etgo.mcp.public.url` | `http://localhost:3100/mcp` | The token is issued with `resource = http://localhost:3100/mcp`; the backend validates the token audience against this property. It must equal the resource the client connects to. |

Put them in **`gradle.properties`** (persistent, gitignored). For immediate effect mirror them in
**`config/Openbravo.properties`** (gitignored; Java-escape colons:
`http\://localhost\:3100`). Properties load at context init, so a **Tomcat restart** is required.

> ⚠️ Do **not** add `/oauth2` to `etgo.oauth2.public.url` and do **not** drop `/mcp` from
> `etgo.mcp.public.url`. The first breaks the issuer match; the second breaks the token audience.
> These properties are **LOCAL-only** values — they belong in gitignored files and must never be
> committed (they would break experimental/production, whose edge sets its own public URLs).

### Steps (LOCAL)

1. **Run the dev server** — `make dev` (serves `:3100`).
2. **Set the two properties** to the `:3100` values in `gradle.properties` +
   `config/Openbravo.properties` (Java-escaped).
3. **Restart Tomcat** so the backend picks up the new public URLs.
4. **Register the MCP server** against the edge, not the backend:
   ```bash
   claude mcp add --transport http etendo-go-local http://localhost:3100/mcp
   ```
5. **Log into the PWA** at `http://localhost:3100` (the OAuth consent page needs your session).
6. **Authenticate** — in the client: `/mcp` → `etendo-go-local` → Authenticate → ✔ Connected.

### What does NOT work locally (and why)

- **Connecting to `http://localhost:8080/etendo/sws/mcp` directly** — OAuth discovery `404`s
  (URL-shape mismatch above); the SDK falls back to `POST :8080/register` → `404`. There is no
  reverse proxy locally to bridge it.
- **Setting the public-URL properties to the `:8080` backend** — the advertised `issuer` /
  `resource` then point at a host that does not serve the SDK-shaped discovery, and the issuer /
  audience checks fail. The values must be the **client-facing `:3100` edge**, not the internal
  backend.
- **Adding `/oauth2` to `etgo.oauth2.public.url`** — `OAuth2Servlet` is mapped at `/oauth2/*`;
  the issuer would no longer match the dev-server metadata issuer (bare origin).

---

## EXPERIMENTAL environment

The experimental server is already behind CloudFront, which **is** the edge (the cloud equivalent
of the local `:3100` dev server). It serves origin-root OAuth discovery and routes `/mcp`,
`/oauth2/*`, `/authorize`, `/token` to the backend — so there is **nothing to configure on your
machine**. You do not set `etgo.*.public.url` (those are server-side, owned by the experimental
deployment) and you do not run a local dev server.

### Steps (EXPERIMENTAL)

1. **Register the MCP server** against the public CloudFront URL:
   ```bash
   claude mcp add --transport http etendo-go-exp https://go.experimental.etendo.cloud/mcp
   ```
2. **Authenticate** — `/mcp` → `etendo-go-exp` → Authenticate. You will be sent through
   the experimental login + OAuth consent in the browser, then ✔ Connected.

That's it — no properties, no Tomcat restart, no `make dev`. The CloudFront edge already presents
the RFC-compliant surface (see `docs/ops/cloudfront-alb-routing.md` for how the edge rewrites paths
and fixes the `Host`/`resource_metadata` URLs).

> Use `etendo-go-exp` as the name so it never gets confused with `etendo-go-local`. They
> can both be registered at the same time; the name is how you (and the client) tell them apart.

---

## Which one am I hitting?

Run `claude mcp list` (or `claude mcp get <name>`) and read the URL:

- `http://localhost:3100/mcp` → **LOCAL** (your machine, via the dev-server edge).
- `https://go.experimental.etendo.cloud/mcp` → **EXPERIMENTAL** (shared cloud server).

If a server is registered as a bare `etendo-go` with no environment suffix, rename it
(`claude mcp remove etendo-go` then re-add with the suffixed name) so the environment is always
explicit — re-authentication will be required after a rename.
