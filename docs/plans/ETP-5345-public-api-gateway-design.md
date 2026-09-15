# ETP-5345: Etendo Go Public API Gateway — Design

**Epic:** ETP-3504 (filed there per explicit human decision; documented scope mismatch — see Notes)
**Status:** Design approved by human, pending implementation planning
**Author:** Forge (coordinator), from a brainstorming session with the human

## Problem

External developers need to consume Etendo data (starting with Business Partners /
"Customer" and Products) via a self-service API-key flow:

1. A page to create API keys.
2. Via Etendo Go, in production (`app.etendo.software`), the key holder can consume curated
   APIs.
3. The key holder receives developer documentation explaining how to use the API.

The hard constraint carried through the whole design: **API exposure must always go through
Etendo Go — never directly against Etendo Core.** This was independently verified for the
current codebase (see the audit that preceded this design: all frontend traffic, MCP server
configs, and the webhook migration already route through `/sws/neo/*`; no violation found).

## MVP Scope

Only **Business Partner (Customer)** and **Product** entities are exposed publicly at launch.
Every other window stays unexposed (`publicApi` unset/false) until explicitly curated later —
this is a per-field opt-in, not a default.

## Architecture Overview

```
External developer
      │  API key (client_id / client_secret)
      ▼
┌─────────────────────────────┐
│  New gateway service         │   NestJS (TypeScript), self-contained,
│  (isolated from Core/Go)     │   no external dependencies besides Etendo Go itself
│                               │
│  - Auth: exchanges API key   │
│    for a short-lived JWT     │──────► Etendo Go OAuth2 token endpoint
│    via existing client_      │        (OAuth2Servlet, grant_type=client_credentials)
│    credentials grant         │◄────── scoped JWT (AD_Client_ID/AD_Org_ID/SCOPES embedded)
│  - Throttling                │
│  - Fail-closed field filter  │
│    (in + out), versioned     │
│  - OpenAPI generation        │
│    (@nestjs/swagger)         │
└──────────────┬────────────────┘
               │  proxied request, JWT attached
               ▼
      NeoServlet (Etendo Go / NEO Headless)
               │
               ▼
      Etendo Core (AD Windows/Processes data)
```

The gateway is a new, standalone, self-contained deployable. It never talks to Etendo Core
directly and never touches a database of its own — its only external interaction is with
Etendo Go (NeoServlet + the existing OAuth2 token endpoint). This isolates the blast radius of
a perimeter bug away from the Core-embedded Etendo Go process, without duplicating Etendo Go's
serving/curation logic.

## Components

### 1. Curation (Schema Forge — extends the existing pipeline, no new source of truth)

`decisions.json` gains a `publicApi` declaration per field, alongside the existing
`editable`/`readOnly`/`system`/`discarded` visibility model:

```json
{
  "publicApi": {
    "exposed": true,
    "name": "documentNo",
    "type": "passthrough",
    "handlerId": null
  }
}
```

- `type: "passthrough"` — maps 1:1 (with optional rename) to a real NeoServlet field.
- `type: "custom"` — resolved by a registered handler, identified by `handlerId` (explicit
  identifier declared here, not inferred from the field name — avoids collisions, mirrors the
  `Java_Qualifier` convention already used for `NeoHandler` routing in `ETGO_SF_ENTITY`). Used
  for computed/aggregated public-API-only fields, and for the version-compatibility handlers
  described below.

`generate-contract.js` stamps `publicApi` into `contract.json` (same generator, additive
field — no new generator needed for this step).

### 2. Versioned public schema artifact (new pipeline step)

A new generator, `generate-public-api-schema.js`, aggregates every `contract.json` with
`publicApi.exposed: true` fields across all windows into one versioned schema+mapping
document, resolved and flat — never left as an unresolved inheritance chain.

**Cascading override, resolved at build time:** a new API version (`v1.1`, `v2`, ...) only
declares its delta against the prior version — added, changed, or removed fields — not the
full schema again. The generator walks the chain (`v1 → v1.1 → v2 → ...`) and emits one flat,
fully-resolved artifact per still-supported version. The gateway never resolves inheritance at
request time; it only ever loads flat, ready artifacts.

**The version-bump contract:**
- **Additive field** → non-breaking → documented and added directly to the current active
  version. No new version required.
- **Field removed or its shape/meaning modified** → breaking → requires declaring a new
  version explicitly. The prior version keeps being served, unchanged from the caller's
  perspective, via a `type: "custom"` compatibility handler (`handlerId`) that reconstructs the
  old shape from the new internal reality.
- **Honest limit:** this insulates consumers from *reshaping* (renamed internal path,
  restructured internal JSON), not from genuine *removal* of the underlying data. If a field's
  data no longer exists anywhere internally, no version can keep serving it — that is a real
  capability regression, not a mapping problem, and must be called out explicitly when it
  happens.

**Governance (recommended, not yet built):** a new `sf-validate-pipeline` rule (F11+, same
mechanism as the existing F1–F10 rules) that detects a `publicApi` field being removed or
reshaped without an accompanying new version declaration + compatibility handler, and blocks
the regen. Open item — see Non-Goals.

### 3. The gateway service (new, NestJS/TypeScript, inside this repo)

**Location:** a new top-level folder in `schema-forge` (e.g. `gateway/`) — not a separate repo.
Decided explicitly over a dedicated repo to keep deploy/ops overhead lower for this service.

**Deployment/URL:** path-based under the existing production domain, `app.etendo.software/api/v1/...`
— not a new `api.etendo.software` subdomain. This follows the same-origin precedent already
established and documented in `docs/ops/cloudfront-alb-routing.md` ("No new DNS. No new ALB
listener rules."): a new CloudFront cache behavior (`/api/*`) is added on the *existing*
distribution/certificate, pointed at a *new* origin (this gateway's own target, isolated from
the Etendo Core ALB) — reusing the domain/cert while still keeping the gateway's runtime
isolated from Core/Go, consistent with the isolation goal in the Architecture Overview.

**Rollout:** local development first; once verified, promote directly to production
(`app.etendo.software`) — no intermediate staging hop for this service.

- **Framework:** NestJS. Chosen because its architecture maps directly onto this design:
  built-in API versioning (URI-based, matching the `v1`/`v1.1`/`v2` scheme), providers +
  dependency injection by token (the mechanism for `handlerId`-matched custom handlers —
  conceptually the same pattern as `NeoHandler`/`@Named` in Etendo Go, translated to NestJS's
  DI container), Guards (fail-closed input filtering, API-key/JWT validation), Interceptors
  (fail-closed output filtering, version-based response mapping), `@nestjs/throttler` (rate
  limiting), `@nestjs/swagger` (OpenAPI generation from the resolved schema).
- **Codegen:** a `make` target generates the gateway's route scaffolding, DTOs, and the
  `@nestjs/swagger`-decorated OpenAPI source directly from the resolved versioned schema
  artifact — minimizing boilerplate. Generated files are never hand-edited (same discipline as
  every other generated artifact in this repo); `type: "custom"` handlers live in a
  hand-written, non-generated file, matched by `handlerId`, and survive regeneration —
  mirroring `tools/app-shell/src/windows/custom/{window}/` for windows.
- **No external dependencies at runtime.** No database, no live calls to Etendo Go to fetch
  configuration — the resolved schema/mapping artifacts are embedded at deploy time. The only
  runtime calls out are the OAuth2 token exchange and the proxied request, both to Etendo Go.

### 4. Auth — API key → scoped JWT (token exchange, not new auth code)

Reuses Etendo Go's existing OAuth2 `client_credentials` grant (`OAuth2Servlet`,
`ETGO_OAUTH2_CLIENT` — already supports `CLIENT_IDENTIFIER`/`CLIENT_SECRET_HASH`/`SCOPES`/
`AD_CLIENT_ID`/`AD_ORG_ID`/`ISACTIVE`). No new Java auth code, no new signing secret shared
with the gateway.

Flow: external developer presents the API key → gateway calls Etendo Go's existing token
endpoint with `grant_type=client_credentials` → Etendo Go returns a JWT already scoped to that
client's org/role/scopes → gateway forwards only that JWT to NeoServlet for the actual proxied
call, never the raw API key.

**TTL requirement:** the internally-minted JWT must be short-lived (seconds to a few minutes).
Revoking an API key (`ISACTIVE = N`) stops new JWTs from being minted, but does not invalidate
one already issued — a short TTL is what makes revocation effectively immediate in practice.
The gateway caches the JWT for its TTL window rather than re-authenticating on every proxied
call.

**API keys are scope-bound** — enforced via the existing `SCOPES` column, nothing new needed
there.

### 5. The hard filter — fail-closed, both directions

Generic, fixed code (never generated per entity, never per-entity boilerplate):

1. **Inbound** (query params, filters, write bodies): any field/param not present in the
   resolved allowlist for that entity+version is rejected (400), never silently dropped or
   forwarded.
2. **Outbound** (NeoServlet's response): filtered again against the same allowlist before
   returning to the caller — defense in depth, independent of whatever NeoServlet already does
   for internal consumers.

**Allowlist, not denylist.** A new internal field never becomes publicly visible by accident —
it requires an explicit `publicApi.exposed: true` in `decisions.json`.

### 6. Documentation

- OpenAPI spec generated on the gateway side (`@nestjs/swagger`), from the same resolved
  versioned schema that drives the filter and the codegen — not duplicated from a separate
  Java-side generator.
- Rendered as interactive developer docs via **Scalar** (`@scalar/api-reference`) — embedded in
  the API-key self-service page, with "try it out" pre-filled with the caller's own key.

### 7. Versioning surface

- Reserved from day one: `/api/v1/...` on the gateway, a namespace separate from the internal
  `/sws/neo/*` used by the first-party app-shell (which stays unversioned — single first-party
  client, deployed atomically with its backend, nothing to version-negotiate).
- No multi-version-serving machinery is built before it's needed — today there are zero
  external consumers and nothing to protect compatibility against yet. The cascading-override +
  compatibility-handler mechanism (Component 2) is what gets exercised the first time a
  genuine breaking change ships.

## Error Handling

- Inbound field/param outside the allowlist → `400` (not silently stripped).
- Unknown or inactive API key, or scope insufficient for the requested entity → `401`/`403`
  from the gateway, before any call reaches Etendo Go.
- Rate limit exceeded → `429` (`@nestjs/throttler`).
- Etendo Go/NeoServlet failure → propagated with the gateway's own envelope, never a raw
  internal stack trace or Core-shaped error body.

## Testing (to be detailed in the implementation plan)

- Contract tests for the fail-closed filter: a field not in the allowlist must never appear in
  a response, and must never reach NeoServlet on the way in, for every active version.
- A test per declared version confirming its resolved schema matches what cascading-override
  resolution produces from `decisions.json`.
- A regression test that a breaking change without a compatibility handler fails the pipeline
  validator (once the F11+ rule exists).
- Token-exchange tests: expired/invalid API key never reaches the point of calling NeoServlet;
  short-TTL JWT is not reused past expiry.

## Non-Goals / Open Items (deferred, not decided against)

- The `sf-validate-pipeline` F11+ governance rule (Component 2) is recommended but not yet
  built — until it exists, the version-bump contract is enforced by discipline/review, not
  tooling.
- Multi-version-serving machinery beyond `v1` is not built until a real breaking change needs
  it (see Versioning surface).
- Where the gateway's own source code will live (new repo vs. a location inside an existing
  one) is an implementation-planning decision, not a design decision — not resolved here.
- Deploy/ops details for the gateway (how it's built, deployed, scaled) are implementation
  concerns, deferred to the implementation plan.

## Notes

- Filed under epic **ETP-3504** ("Etendo Next / New New UI") by explicit human decision, despite
  that epic's documented concrete scope (process-button support in the window migration
  pipeline) not thematically matching this design. Flagged during Jira task creation; the human
  chose to keep it there anyway.
