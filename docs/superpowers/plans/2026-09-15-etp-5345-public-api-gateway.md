# ETP-5345 Public API Gateway (v1: Product + Customer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a working, local end-to-end version of the Etendo Go public API gateway,
exposing the `businessPartner` entity (Customer) and `product` entity read-only, via API-key
auth, through the new isolated gateway — never touching Etendo Core directly.

**Architecture:** Field-level `publicApi` curation in `decisions.json` flows through
`generate-contract.js` into `contract.json`, then a new generator resolves it into one flat
allowlist artifact per API version. A new NestJS gateway (package `gateway/` in this repo,
consuming a new generic engine package `@etendosoftware/api-gateway-core` published from
`schema_forge_core`) loads that artifact, authenticates API keys by exchanging them for a
short-lived JWT via Etendo Go's existing OAuth2 `client_credentials` endpoint, and proxies
GET/LIST requests to NeoServlet with a fail-closed field filter applied on both the request and
the response.

**Tech Stack:** NestJS + TypeScript (gateway), Node.js ESM (generators, matching this repo's
existing `cli/src/*.js`), `@nestjs/swagger` + Scalar (`@scalar/api-reference`) for docs,
`@nestjs/throttler` for rate limiting.

**Spec:** `docs/plans/ETP-5345-public-api-gateway-design.md`

## Global Constraints

- Never call Etendo Core directly — the gateway's only network calls are to Etendo Go
  (NeoServlet, and the existing OAuth2 token endpoint at `POST /oauth2/token`).
- Allowlist, fail-closed, both directions: a field not explicitly marked
  `publicApi.exposed: true` in `decisions.json` must never appear in a request or a response.
- No generated code per entity — the gateway's request-handling logic is fixed, generic code
  driven entirely by the resolved schema artifact.
- No new signing secret — the gateway never mints its own JWT; it always exchanges the API key
  via Etendo Go's existing `client_credentials` grant and forwards the JWT it receives.
- v1 only for this plan — no multi-version cascading-resolution logic is built yet (see spec
  §Versioning surface); the resolver in Task 2 handles exactly one version and is structured so
  a second version can be added later without a rewrite.
- Read-only for this plan — operations are `GET`/`LIST` only. Write support is out of scope
  here (see Non-Goals in the spec).
- MVP fields, not the full 44/56-field set — see Task 5/6 for the exact field lists.
- "Create an API key" uses the EXISTING admin-gated Etendo Go endpoint
  (`POST /oauth2/clients`) as-is. No new Java code for key creation in this plan. The
  self-service creation UI page is an explicit follow-up plan, not part of this one — this plan
  proves the key works by creating one with `curl` as an admin.

## Errata (found during Task 4 execution, applies to every task below it)

**All relative TypeScript import specifiers use `.ts`, not `.js`.** Every code block below this
point that writes `from './something.js'` or `from '../../src/something.js'` for a RELATIVE
import (same package, `./` or `../`) is wrong as written — it must read `from './something.ts'` /
`from '../../src/something.ts'` instead. Confirmed during Task 4: this repo's Node version runs
tests via `--experimental-strip-types`, which strips types but does not resolve a `.js` specifier
to a sibling `.ts` file (no bundler-style extension rewriting) — only an explicit `.ts` specifier
resolves. Since these packages (`api-gateway-core`, `gateway`) have zero prior precedent in this
repo, there is no existing convention being broken by this fix. This does NOT apply to importing
the published package itself (`@etendosoftware/api-gateway-core` as a bare specifier in `gateway/`
code) — that resolves via `node_modules`/`package.json` `main`/`types`, pointing at built
`dist/*.js`/`dist/*.d.ts`, and is unaffected.

**Build-before-link gap (relevant to Task 8/12):** because `packages/api-gateway-core/package.json`
points `main`/`types` at `./dist/index.js`/`./dist/index.d.ts`, `npm run build` (tsc) must run in
`packages/api-gateway-core` BEFORE `gateway/` can successfully consume it via `npm link` — Task 8's
`LOCAL_CORE` wiring or Task 12's setup must include this build step; neither explicitly said so as
originally written.

---

## Part A — `schema_forge_core` repo

Repo path: `/Users/sebastianbarrozo/Documents/work/epic/schema_forge_core`. This repo publishes
`@etendosoftware/schema-forge-cli` (the generators) and will publish a new
`@etendosoftware/api-gateway-core` package. For local iteration without publishing, this repo's
own dev profile (`LOCAL_CORE=1`, per `docs/repo-topology.md` in the functional repo) is used —
Task 8 covers wiring that up from the consumer side.

### Task 1: Stamp `publicApi` into `contract.json`

**Files:**
- Modify: `cli/src/generate-contract.js` (the per-field mapping block found at the existing
  `fields.map(f => {...})` loop, immediately after the existing `if (f.onChangeFunction) {...}`
  line in that block)
- Test: `cli/test/generate-contract.test.js` (existing test file — add a case to it; if it does
  not exist under this exact name, find the existing test file that covers
  `generate-contract.js` field mapping and add the case there instead)

**Interfaces:**
- Consumes: a `decisions.json` field object that may carry a `publicApi` key, shaped
  `{ exposed: boolean, name?: string, type: "passthrough" | "custom", handlerId?: string | null }`
- Produces: the same shape copied verbatim onto `mapped.publicApi` in the generated
  `contract.json` field entry, so Task 2 can read `field.publicApi` directly off `contract.json`.

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapFieldForContract } from '../src/generate-contract.js';

test('stamps publicApi onto the mapped contract field when present', () => {
  const decisionField = {
    name: 'name',
    visibility: 'editable',
    grid: true,
    form: true,
    publicApi: { exposed: true, name: 'name', type: 'passthrough', handlerId: null },
  };
  const mapped = mapFieldForContract(decisionField, { rules: [] });
  assert.deepEqual(mapped.publicApi, {
    exposed: true,
    name: 'name',
    type: 'passthrough',
    handlerId: null,
  });
});

test('omits publicApi from the mapped field when absent', () => {
  const decisionField = { name: 'internalNotes', visibility: 'editable' };
  const mapped = mapFieldForContract(decisionField, { rules: [] });
  assert.equal('publicApi' in mapped, false);
});
```

If `mapFieldForContract` is not already an exported function in `generate-contract.js` (the
per-field mapping may currently be an inline closure inside a larger function), export it as a
named function first — this is required for both tests to import it directly, and does not
change any existing behavior.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test cli/test/generate-contract.test.js`
Expected: FAIL — `mapped.publicApi` is `undefined` in the first case (no stamping logic yet).

- [ ] **Step 3: Write minimal implementation**

In the per-field mapping block, immediately after the existing
`if (f.onChangeFunction) { mapped.onChangeFunction = { name: f.onChangeFunction }; }` line, add:

```js
if (f.publicApi) {
  mapped.publicApi = f.publicApi;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test cli/test/generate-contract.test.js`
Expected: PASS — both cases green.

- [ ] **Step 5: Commit**

```bash
git add cli/src/generate-contract.js cli/test/generate-contract.test.js
git commit -m "Feature ETP-5345: Stamp publicApi decisions into contract.json"
```

### Task 2: `generate-public-api-schema.js` — resolve the v1 allowlist artifact

**Files:**
- Create: `cli/src/generate-public-api-schema.js`
- Test: `cli/test/generate-public-api-schema.test.js`
- Test fixtures: `cli/test/fixtures/public-api/contract-product.json`,
  `cli/test/fixtures/public-api/contract-business-partner.json` (small, hand-written
  `contract.json`-shaped fixtures with 2-3 fields each, at least one `publicApi.exposed: true`
  and one without it, to prove filtering)

**Interfaces:**
- Consumes: an array of `{ windowName: string, contractPath: string }` and an `apiVersion:
  string` (e.g. `"v1"`).
- Produces: a resolved schema object, written to
  `artifacts/_public-api/allowlist.<version>.json`, shaped:
  ```ts
  {
    apiVersion: string,
    entities: {
      [entityName: string]: {
        publicApi: true,
        operations: string[], // ["GET", "LIST"] for this plan
        fields: {
          [publicFieldName: string]: {
            publicApi: true,
            direction: "in" | "out" | "inout",
            internalPath: string, // the field's name in the NeoServlet response
            type: "passthrough" | "custom",
            handlerId: string | null,
          }
        }
      }
    }
  }
  ```
  This exact shape is what Task 6 (the gateway's filter) and Task 7 (OpenAPI builder) consume —
  their interfaces depend on these exact key names.

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePublicApiSchema } from '../src/generate-public-api-schema.js';
import { readFileSync } from 'node:fs';

test('resolves only publicApi-exposed fields into the flat allowlist', () => {
  const productContract = JSON.parse(
    readFileSync(new URL('./fixtures/public-api/contract-product.json', import.meta.url))
  );
  const result = resolvePublicApiSchema({
    apiVersion: 'v1',
    windows: [{ entityName: 'product', contract: productContract }],
  });
  assert.equal(result.apiVersion, 'v1');
  assert.ok(result.entities.product);
  assert.deepEqual(Object.keys(result.entities.product.fields).sort(), ['name', 'searchKey']);
  assert.equal(result.entities.product.fields.name.direction, 'out');
});

test('a field without publicApi never appears in the resolved schema', () => {
  const productContract = JSON.parse(
    readFileSync(new URL('./fixtures/public-api/contract-product.json', import.meta.url))
  );
  const result = resolvePublicApiSchema({
    apiVersion: 'v1',
    windows: [{ entityName: 'product', contract: productContract }],
  });
  assert.equal(result.entities.product.fields.internalCostBasis, undefined);
});
```

Create the two fixture files referenced above. `contract-product.json` fixture — a minimal
`contract.json`-shaped document with a `frontendContract.entities.product.fields` array
containing three fields: `searchKey` and `name` with
`publicApi: { exposed: true, name: <same>, type: "passthrough", handlerId: null }`, and
`internalCostBasis` with no `publicApi` key at all. `contract-business-partner.json` mirrors
this shape for the `businessPartner` entity with two `publicApi`-exposed fields (e.g. `name`,
`taxID`) and one non-exposed field (e.g. `creditLimit`).

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test cli/test/generate-public-api-schema.test.js`
Expected: FAIL — `resolvePublicApiSchema` is not defined (module does not exist yet).

- [ ] **Step 3: Write minimal implementation**

```js
// cli/src/generate-public-api-schema.js
export function resolvePublicApiSchema({ apiVersion, windows }) {
  const entities = {};
  for (const { entityName, contract } of windows) {
    const fields = contract.frontendContract.entities[entityName].fields;
    const exposedFields = {};
    for (const field of fields) {
      if (!field.publicApi || field.publicApi.exposed !== true) continue;
      exposedFields[field.publicApi.name || field.name] = {
        publicApi: true,
        direction: 'out',
        internalPath: field.name,
        type: field.publicApi.type,
        handlerId: field.publicApi.handlerId ?? null,
      };
    }
    if (Object.keys(exposedFields).length === 0) continue;
    entities[entityName] = {
      publicApi: true,
      operations: ['GET', 'LIST'],
      fields: exposedFields,
    };
  }
  return { apiVersion, entities };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test cli/test/generate-public-api-schema.test.js`
Expected: PASS.

- [ ] **Step 5: Add the CLI entry point and write-to-disk behavior**

```js
// appended to cli/src/generate-public-api-schema.js
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function writePublicApiSchema({ apiVersion, windows, outputPath }) {
  const resolved = resolvePublicApiSchema({ apiVersion, windows });
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(resolved, null, 2) + '\n');
  return resolved;
}

export function loadContractsForWindows(entries, artifactsRoot) {
  return entries.map(({ entityName, windowName }) => ({
    entityName,
    contract: JSON.parse(
      readFileSync(`${artifactsRoot}/${windowName}/contract.json`, 'utf-8')
    ),
  }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const artifactsRoot = process.argv.includes('--artifacts-root')
    ? process.argv[process.argv.indexOf('--artifacts-root') + 1]
    : 'artifacts';
  const windows = loadContractsForWindows(
    [
      { windowName: 'product', entityName: 'product' },
      { windowName: 'contacts', entityName: 'businessPartner' },
    ],
    artifactsRoot
  );
  const result = writePublicApiSchema({
    apiVersion: 'v1',
    windows,
    outputPath: `${artifactsRoot}/_public-api/allowlist.v1.json`,
  });
  console.log(`Wrote ${Object.keys(result.entities).length} entities to allowlist.v1.json`);
}
```

- [ ] **Step 6: Run the CLI entry point against real artifacts and inspect output**

Run (from the functional repo root, since that's where `artifacts/` lives — see Task 4 for the
`LOCAL_CORE` wiring that makes this runnable from there):
`node cli/src/generate-public-api-schema.js --artifacts-root ../etendo_schema_forge/artifacts`
Expected: prints `Wrote 2 entities to allowlist.v1.json`; the file at
`../etendo_schema_forge/artifacts/_public-api/allowlist.v1.json` exists and is valid JSON. This
step is a manual sanity check, not an automated test — the fields will be empty at this point
since Task 5/6 (adding `publicApi` to the real `decisions.json` files) haven't run yet; an empty
`entities: {}` here is expected and fine for now.

- [ ] **Step 7: Commit**

```bash
git add cli/src/generate-public-api-schema.js cli/test/generate-public-api-schema.test.js cli/test/fixtures/public-api/
git commit -m "Feature ETP-5345: Add generate-public-api-schema resolver"
```

### Task 3: `@etendosoftware/api-gateway-core` package skeleton + resolved-schema types

**Files:**
- Create: `packages/api-gateway-core/package.json`
- Create: `packages/api-gateway-core/tsconfig.json`
- Create: `packages/api-gateway-core/src/types.ts`
- Create: `packages/api-gateway-core/src/index.ts`
- Test: `packages/api-gateway-core/test/types.test.ts`

**Interfaces:**
- Produces: the TypeScript types `PublicApiSchema`, `PublicApiEntity`, `PublicApiField`
  mirroring exactly the JSON shape Task 2 writes — every later task in Part A and Part B imports
  these types from `@etendosoftware/api-gateway-core`, so the field names here are load-bearing.

- [ ] **Step 1: `package.json`**

```json
{
  "name": "@etendosoftware/api-gateway-core",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "node --test --experimental-strip-types test/**/*.test.ts"
  },
  "dependencies": {
    "@nestjs/common": "^10.4.0",
    "@nestjs/core": "^10.4.0",
    "@nestjs/swagger": "^7.4.0",
    "@nestjs/throttler": "^6.2.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "declaration": true,
    "outDir": "./dist",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Write the failing test**

```ts
// packages/api-gateway-core/test/types.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PublicApiSchema } from '../src/types.js';

test('a resolved schema literal matches the PublicApiSchema shape', () => {
  const schema: PublicApiSchema = {
    apiVersion: 'v1',
    entities: {
      product: {
        publicApi: true,
        operations: ['GET', 'LIST'],
        fields: {
          name: {
            publicApi: true,
            direction: 'out',
            internalPath: 'name',
            type: 'passthrough',
            handlerId: null,
          },
        },
      },
    },
  };
  assert.equal(schema.entities.product.fields.name.direction, 'out');
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd packages/api-gateway-core && npm test`
Expected: FAIL — `src/types.ts` does not exist, TypeScript compile error.

- [ ] **Step 5: Write the types**

```ts
// packages/api-gateway-core/src/types.ts
export type FieldDirection = 'in' | 'out' | 'inout';
export type FieldMappingType = 'passthrough' | 'custom';

export interface PublicApiField {
  publicApi: true;
  direction: FieldDirection;
  internalPath: string;
  type: FieldMappingType;
  handlerId: string | null;
}

export interface PublicApiEntity {
  publicApi: true;
  operations: string[];
  fields: Record<string, PublicApiField>;
}

export interface PublicApiSchema {
  apiVersion: string;
  entities: Record<string, PublicApiEntity>;
}
```

```ts
// packages/api-gateway-core/src/index.ts
export * from './types.js';
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd packages/api-gateway-core && npm install && npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/api-gateway-core/
git commit -m "Feature ETP-5345: Scaffold api-gateway-core package with resolved-schema types"
```

### Task 4: Auth service — API key to scoped JWT via Etendo Go's existing OAuth2 endpoint

**Files:**
- Create: `packages/api-gateway-core/src/auth/token-exchange.service.ts`
- Test: `packages/api-gateway-core/test/auth/token-exchange.service.test.ts`

**Interfaces:**
- Consumes: `{ apiKeyId: string, apiKeySecret: string }` and a `neoBaseUrl: string` (e.g.
  `http://localhost:8080/etendo/sws/neo` for local dev — confirm exact local path when Task 8
  wires environment config, this is the injected value, not hardcoded here).
- Produces: `exchangeApiKeyForJwt(apiKeyId, apiKeySecret): Promise<{ jwt: string, expiresAt:
  number }>` — `expiresAt` is a Unix-epoch-seconds timestamp computed from the response's
  `expires_in`, used by Task 6's caching.

The real token response shape (confirmed against `OAuth2Servlet.java`,
`handleClientCredentialsGrant`):
```json
{ "access_token": "...", "token_type": "Bearer", "expires_in": 300, "refresh_token": "...", "scope": "..." }
```

- [ ] **Step 1: Write the failing test**

```ts
// packages/api-gateway-core/test/auth/token-exchange.service.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TokenExchangeService } from '../../src/auth/token-exchange.service.js';

test('exchanges an API key for a JWT using the OAuth2 client_credentials grant', async () => {
  const fetchCalls: Array<[string, RequestInit]> = [];
  const fakeFetch = async (url: string, init: RequestInit) => {
    fetchCalls.push([url, init]);
    return new Response(
      JSON.stringify({
        access_token: 'jwt-abc123',
        token_type: 'Bearer',
        expires_in: 300,
        scope: 'neo:read',
      }),
      { status: 200 }
    );
  };
  const service = new TokenExchangeService('http://localhost:8080/etendo', fakeFetch as typeof fetch);
  const before = Math.floor(Date.now() / 1000);
  const result = await service.exchangeApiKeyForJwt('client-id-1', 'client-secret-1');

  assert.equal(result.jwt, 'jwt-abc123');
  assert.ok(result.expiresAt >= before + 300);
  assert.equal(fetchCalls.length, 1);
  const [url, init] = fetchCalls[0];
  assert.equal(url, 'http://localhost:8080/etendo/oauth2/token');
  const body = new URLSearchParams(init.body as string);
  assert.equal(body.get('grant_type'), 'client_credentials');
  assert.equal(body.get('client_id'), 'client-id-1');
  assert.equal(body.get('client_secret'), 'client-secret-1');
});

test('throws when the token endpoint responds with a non-200 status', async () => {
  const fakeFetch = async () => new Response(JSON.stringify({ error: 'invalid_client' }), { status: 401 });
  const service = new TokenExchangeService('http://localhost:8080/etendo', fakeFetch as typeof fetch);
  await assert.rejects(() => service.exchangeApiKeyForJwt('bad-id', 'bad-secret'), /invalid_client/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/api-gateway-core && npm test`
Expected: FAIL — `TokenExchangeService` module does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/api-gateway-core/src/auth/token-exchange.service.ts
export interface TokenExchangeResult {
  jwt: string;
  expiresAt: number;
}

export class TokenExchangeService {
  constructor(
    private readonly etendoBaseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async exchangeApiKeyForJwt(clientId: string, clientSecret: string): Promise<TokenExchangeResult> {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    });
    const response = await this.fetchImpl(`${this.etendoBaseUrl}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const json = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
    };
    if (!response.ok || !json.access_token) {
      throw new Error(`OAuth2 token exchange failed: ${json.error ?? response.status}`);
    }
    const now = Math.floor(Date.now() / 1000);
    return { jwt: json.access_token, expiresAt: now + (json.expires_in ?? 0) };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/api-gateway-core && npm test`
Expected: PASS.

- [ ] **Step 5: Export from the package index**

```ts
// packages/api-gateway-core/src/index.ts — add this line
export * from './auth/token-exchange.service.js';
```

- [ ] **Step 6: Commit**

```bash
git add packages/api-gateway-core/
git commit -m "Feature ETP-5345: Add API key to JWT token exchange service"
```

### Task 5: Cached token exchange (short-TTL cache, so revocation stays near-immediate)

**Files:**
- Create: `packages/api-gateway-core/src/auth/cached-token-exchange.service.ts`
- Test: `packages/api-gateway-core/test/auth/cached-token-exchange.service.test.ts`

**Interfaces:**
- Consumes: `TokenExchangeService` from Task 4 (constructor injection).
- Produces: `getJwtForApiKey(apiKeyId, apiKeySecret): Promise<string>` — same key pair
  re-requested before its cached JWT expires returns the cached JWT without a new network call;
  once expired, it re-exchanges.

- [ ] **Step 1: Write the failing test**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CachedTokenExchangeService } from '../../src/auth/cached-token-exchange.service.js';
import type { TokenExchangeService, TokenExchangeResult } from '../../src/auth/token-exchange.service.js';

function fakeExchanger(results: TokenExchangeResult[]) {
  let call = 0;
  return {
    calls: 0,
    exchangeApiKeyForJwt: async () => {
      const r = results[Math.min(call, results.length - 1)];
      call += 1;
      return r;
    },
  } as unknown as TokenExchangeService & { calls: number };
}

test('returns the cached JWT on a second call before expiry', async () => {
  const now = Math.floor(Date.now() / 1000);
  const exchanger = fakeExchanger([{ jwt: 'jwt-1', expiresAt: now + 300 }]);
  const cache = new CachedTokenExchangeService(exchanger);
  const first = await cache.getJwtForApiKey('id-1', 'secret-1');
  const second = await cache.getJwtForApiKey('id-1', 'secret-1');
  assert.equal(first, 'jwt-1');
  assert.equal(second, 'jwt-1');
});

test('re-exchanges once the cached JWT has expired', async () => {
  const now = Math.floor(Date.now() / 1000);
  const exchanger = fakeExchanger([
    { jwt: 'jwt-1', expiresAt: now - 1 }, // already expired
    { jwt: 'jwt-2', expiresAt: now + 300 },
  ]);
  const cache = new CachedTokenExchangeService(exchanger);
  const first = await cache.getJwtForApiKey('id-1', 'secret-1');
  const second = await cache.getJwtForApiKey('id-1', 'secret-1');
  assert.equal(first, 'jwt-1');
  assert.equal(second, 'jwt-2');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/api-gateway-core && npm test`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/api-gateway-core/src/auth/cached-token-exchange.service.ts
import type { TokenExchangeService } from './token-exchange.service.js';

export class CachedTokenExchangeService {
  private cache = new Map<string, { jwt: string; expiresAt: number }>();

  constructor(private readonly exchanger: TokenExchangeService) {}

  async getJwtForApiKey(apiKeyId: string, apiKeySecret: string): Promise<string> {
    const cached = this.cache.get(apiKeyId);
    const now = Math.floor(Date.now() / 1000);
    if (cached && cached.expiresAt > now) {
      return cached.jwt;
    }
    const result = await this.exchanger.exchangeApiKeyForJwt(apiKeyId, apiKeySecret);
    this.cache.set(apiKeyId, result);
    return result.jwt;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/api-gateway-core && npm test`
Expected: PASS.

- [ ] **Step 5: Export and commit**

```ts
// packages/api-gateway-core/src/index.ts — add this line
export * from './auth/cached-token-exchange.service.js';
```

```bash
git add packages/api-gateway-core/
git commit -m "Feature ETP-5345: Cache exchanged JWTs by API key until expiry"
```

### Task 6: Fail-closed field filter (input + output), driven by `PublicApiSchema`

**Files:**
- Create: `packages/api-gateway-core/src/filter/field-filter.ts`
- Test: `packages/api-gateway-core/test/filter/field-filter.test.ts`

**Interfaces:**
- Consumes: a `PublicApiEntity` (from Task 3's types) and either an inbound query-params object
  or an outbound NeoServlet response body.
- Produces:
  - `filterInboundParams(entity: PublicApiEntity, params: Record<string, unknown>):
    Record<string, unknown>` — throws `UnknownFieldError` if any key is not in
    `entity.fields`.
  - `filterOutboundRecord(entity: PublicApiEntity, record: Record<string, unknown>):
    Record<string, unknown>` — returns a new object containing ONLY keys present in
    `entity.fields`, renamed from `internalPath` to the public field name, and never throws (an
    internal field simply not being in the record is not an error).

- [ ] **Step 1: Write the failing test**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterInboundParams, filterOutboundRecord, UnknownFieldError } from '../../src/filter/field-filter.js';
import type { PublicApiEntity } from '../../src/types.js';

const productEntity: PublicApiEntity = {
  publicApi: true,
  operations: ['GET', 'LIST'],
  fields: {
    name: { publicApi: true, direction: 'out', internalPath: 'name', type: 'passthrough', handlerId: null },
    searchKey: { publicApi: true, direction: 'out', internalPath: 'searchKey', type: 'passthrough', handlerId: null },
  },
};

test('filterOutboundRecord keeps only allowlisted fields', () => {
  const record = { name: 'Widget', searchKey: 'WID-1', internalCostBasis: 42 };
  const result = filterOutboundRecord(productEntity, record);
  assert.deepEqual(result, { name: 'Widget', searchKey: 'WID-1' });
});

test('filterInboundParams rejects an unlisted field with UnknownFieldError', () => {
  assert.throws(
    () => filterInboundParams(productEntity, { name: 'Widget', internalCostBasis: 42 }),
    UnknownFieldError
  );
});

test('filterInboundParams passes through allowlisted params unchanged', () => {
  const result = filterInboundParams(productEntity, { searchKey: 'WID-1' });
  assert.deepEqual(result, { searchKey: 'WID-1' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/api-gateway-core && npm test`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/api-gateway-core/src/filter/field-filter.ts
import type { PublicApiEntity } from '../types.js';

export class UnknownFieldError extends Error {
  constructor(public readonly fieldName: string) {
    super(`Field "${fieldName}" is not exposed by the public API`);
    this.name = 'UnknownFieldError';
  }
}

export function filterInboundParams(
  entity: PublicApiEntity,
  params: Record<string, unknown>
): Record<string, unknown> {
  for (const key of Object.keys(params)) {
    if (!entity.fields[key]) {
      throw new UnknownFieldError(key);
    }
  }
  return { ...params };
}

export function filterOutboundRecord(
  entity: PublicApiEntity,
  record: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [publicName, field] of Object.entries(entity.fields)) {
    if (field.internalPath in record) {
      result[publicName] = record[field.internalPath];
    }
  }
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/api-gateway-core && npm test`
Expected: PASS.

- [ ] **Step 5: Export and commit**

```ts
// packages/api-gateway-core/src/index.ts — add this line
export * from './filter/field-filter.js';
```

```bash
git add packages/api-gateway-core/
git commit -m "Feature ETP-5345: Add fail-closed inbound/outbound field filter"
```

### Task 7: NestJS Guard + Interceptor wiring the filter and auth into the request lifecycle

**Files:**
- Create: `packages/api-gateway-core/src/http/public-api-key.guard.ts`
- Create: `packages/api-gateway-core/src/http/field-filter.interceptor.ts`
- Test: `packages/api-gateway-core/test/http/field-filter.interceptor.test.ts`

**Interfaces:**
- Consumes: `CachedTokenExchangeService` (Task 5), `filterInboundParams`/`filterOutboundRecord`
  (Task 6), a `PublicApiSchema` (Task 3) injected via NestJS DI token `PUBLIC_API_SCHEMA`.
- Produces: `PublicApiKeyGuard implements CanActivate` (validates `Authorization: Bearer
  <apiKeyId>:<apiKeySecret>` — MVP scheme, see Note below — and attaches the exchanged JWT to
  `request.neoJwt`) and `FieldFilterInterceptor implements NestInterceptor` (filters the
  response body of whatever entity the route declares via a NestJS custom decorator
  `@PublicApiEntityName('product')`, defined in this same file).

**Note on the MVP bearer scheme:** the design's `ETGO_OAUTH2_CLIENT` model has a `client_id` +
`client_secret` pair, not a single opaque "API key" string yet (that packaging is a follow-up
concern, same as the self-service creation page). For this plan, the gateway accepts
`Authorization: Bearer <client_id>:<client_secret>` and splits on the first `:` — documented
here explicitly as an MVP shortcut, not a final public contract.

- [ ] **Step 1: Write the failing test (interceptor only — the guard is exercised end-to-end in Task 10)**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { of } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { FieldFilterInterceptor, PUBLIC_API_SCHEMA } from '../../src/http/field-filter.interceptor.js';
import type { PublicApiSchema } from '../../src/types.js';

const schema: PublicApiSchema = {
  apiVersion: 'v1',
  entities: {
    product: {
      publicApi: true,
      operations: ['GET', 'LIST'],
      fields: {
        name: { publicApi: true, direction: 'out', internalPath: 'name', type: 'passthrough', handlerId: null },
      },
    },
  },
};

test('interceptor strips fields not in the allowlist from a single-record response', async () => {
  const interceptor = new FieldFilterInterceptor(schema);
  const context = {
    getHandler: () => ({ __publicApiEntityName: 'product' }),
    switchToHttp: () => ({ getResponse: () => ({}) }),
  } as any;
  const next = { handle: () => of({ name: 'Widget', internalCostBasis: 42 }) } as any;
  const result = await firstValueFrom(interceptor.intercept(context, next));
  assert.deepEqual(result, { name: 'Widget' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/api-gateway-core && npm test`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/api-gateway-core/src/http/field-filter.interceptor.ts
import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { map, type Observable } from 'rxjs';
import { filterOutboundRecord } from '../filter/field-filter.js';
import type { PublicApiSchema } from '../types.js';

export const PUBLIC_API_SCHEMA = 'PUBLIC_API_SCHEMA';

export function PublicApiEntityName(entityName: string) {
  return (target: object, _key: string, descriptor: PropertyDescriptor) => {
    (descriptor.value as { __publicApiEntityName?: string }).__publicApiEntityName = entityName;
    return descriptor;
  };
}

@Injectable()
export class FieldFilterInterceptor implements NestInterceptor {
  constructor(private readonly schema: PublicApiSchema) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const handler = context.getHandler() as unknown as { __publicApiEntityName?: string };
    const entityName = handler.__publicApiEntityName;
    const entity = entityName ? this.schema.entities[entityName] : undefined;
    return next.handle().pipe(
      map((body) => {
        if (!entity) return body;
        if (Array.isArray(body)) {
          return body.map((record) => filterOutboundRecord(entity, record));
        }
        return filterOutboundRecord(entity, body as Record<string, unknown>);
      })
    );
  }
}
```

```ts
// packages/api-gateway-core/src/http/public-api-key.guard.ts
import { Injectable, type CanActivate, type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { CachedTokenExchangeService } from '../auth/cached-token-exchange.service.js';

@Injectable()
export class PublicApiKeyGuard implements CanActivate {
  constructor(private readonly tokenExchange: CachedTokenExchangeService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing API key');
    }
    const [apiKeyId, apiKeySecret] = authHeader.slice('Bearer '.length).split(':');
    if (!apiKeyId || !apiKeySecret) {
      throw new UnauthorizedException('Malformed API key');
    }
    try {
      request.neoJwt = await this.tokenExchange.getJwtForApiKey(apiKeyId, apiKeySecret);
    } catch {
      throw new UnauthorizedException('Invalid API key');
    }
    return true;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/api-gateway-core && npm test`
Expected: PASS.

- [ ] **Step 5: Export and commit**

```ts
// packages/api-gateway-core/src/index.ts — add these lines
export * from './http/field-filter.interceptor.js';
export * from './http/public-api-key.guard.js';
```

```bash
git add packages/api-gateway-core/
git commit -m "Feature ETP-5345: Add API-key guard and field-filter interceptor"
```

---

## Part B — `schema-forge` (this repo): curation, generator run, gateway app

### Task 8: Wire `LOCAL_CORE=1` consumption of the new package and generator

**Files:**
- Modify: `Makefile` (find the existing `LOCAL_CORE` dispatcher targets, e.g. `regen`; add
  wiring for the new `generate-public-api-schema.js` script following the exact same
  `LOCAL_CORE=1` vs. published-package branching pattern already used there)
- Modify: `package.json` at repo root (add a `postinstall`-safe local link, or document the
  `npm link` step, for `@etendosoftware/api-gateway-core` — follow whatever mechanism
  `docs/repo-topology.md` already documents for `LOCAL_CORE=1`, do not invent a second one)

- [ ] **Step 1: Read `docs/repo-topology.md` in full** before touching the Makefile — this task
  must extend the EXISTING dispatcher pattern, not add a parallel one. If the existing pattern
  uses `npm link` for local packages, use `npm link @etendosoftware/api-gateway-core` from
  `gateway/` pointing at `../../schema_forge_core/packages/api-gateway-core` (adjust the
  relative path to wherever this repo and `schema_forge_core` actually sit as siblings on disk
  — confirmed earlier in this plan's research as
  `/Users/sebastianbarrozo/Documents/work/epic/schema_forge_core`).

- [ ] **Step 1b: Build the package before linking it.** `packages/api-gateway-core/package.json`
  (Task 3) points `main`/`types` at `./dist/index.js`/`./dist/index.d.ts`, not at TypeScript
  source — `npm link` alone is not enough. Before (and after every change to)
  `packages/api-gateway-core`, run `cd packages/api-gateway-core && npm run build` in
  `schema_forge_core` first, THEN `npm link` it from `gateway/`. Document this as a required
  step in whatever `make dev-local-core`-style target ends up driving `gateway/`'s local dev
  loop — a stale `dist/` after a source change is a silent bug, not a build failure.

- [ ] **Step 2: Add a `make regen-public-api` target**

```makefile
regen-public-api:
ifeq ($(LOCAL_CORE),1)
	node ../schema_forge_core/cli/src/generate-public-api-schema.js --artifacts-root artifacts
else
	npx sf-generate-public-api-schema --artifacts-root artifacts
endif
```

(The `sf-generate-public-api-schema` published bin name assumes `schema_forge_core`'s
`package.json` `bin` map is extended to include it — if that field doesn't already exist or
uses a different naming convention, match whatever convention `sf-validate-pipeline`'s own bin
entry uses instead of inventing a new one.)

- [ ] **Step 3: Run it once to confirm the dispatcher works**

Run: `make regen-public-api LOCAL_CORE=1`
Expected: same "Wrote N entities" output as Task 2 Step 6, now runnable via the standard
Makefile entry point.

- [ ] **Step 4: Commit**

```bash
git add Makefile
git commit -m "Feature ETP-5345: Wire regen-public-api target via LOCAL_CORE dispatcher"
```

### Task 9: Curate `publicApi` fields on `businessPartner` (Customer)

**Files:**
- Modify: `artifacts/contacts/decisions.json`

**Fields to mark** (inside `entities.businessPartner.fields`, adding a `publicApi` key as a
sibling to each field's existing keys — do not remove or alter any existing key):

```json
"name": { "publicApi": { "exposed": true, "name": "name", "type": "passthrough", "handlerId": null } },
"searchKey": { "publicApi": { "exposed": true, "name": "searchKey", "type": "passthrough", "handlerId": null } },
"taxID": { "publicApi": { "exposed": true, "name": "taxId", "type": "passthrough", "handlerId": null } },
"etgoEmail": { "publicApi": { "exposed": true, "name": "email", "type": "passthrough", "handlerId": null } },
"etgoPhone": { "publicApi": { "exposed": true, "name": "phone", "type": "passthrough", "handlerId": null } },
"etgoWeb": { "publicApi": { "exposed": true, "name": "web", "type": "passthrough", "handlerId": null } }
```

These merge into each field's EXISTING object (e.g. `name` already has
`{"visibility": "editable", "grid": true, ...}` — the `publicApi` key is added alongside those,
not replacing them). `creditLimit` and every other `businessPartner` field are deliberately left
untouched (no `publicApi` key at all) — they must not appear in the public API.

- [ ] **Step 1: Edit `artifacts/contacts/decisions.json`**, adding the `publicApi` key to
  exactly these 6 fields under `entities.businessPartner.fields`, matching the JSON shown above.

- [ ] **Step 2: Regenerate the contract**

Run: `make regen ONLY=contacts`
Expected: exits 0; `artifacts/contacts/contract.json` is rewritten.

- [ ] **Step 3: Verify the stamping landed correctly**

```bash
python3 -c "
import json
d = json.load(open('artifacts/contacts/contract.json'))
fields = d['frontendContract']['entities']['businessPartner']['fields']
exposed = [f['name'] for f in fields if f.get('publicApi', {}).get('exposed')]
print(sorted(exposed))
"
```

Expected output: `['email', 'etgoEmail', 'etgoPhone', 'etgoWeb', 'name', 'phone', 'searchKey', 'taxID', 'taxId', 'web']`
— adjust this expected list once you see the real field-name keys used by `contract.json` (the
`name` key in the printed list is the INTERNAL field name, e.g. `etgoEmail`, not the public
name `email` — if the check above prints only internal names, that confirms `mapped.publicApi`
carries the public `name` as a nested value, not the list key; re-run the check reading
`f['publicApi']['name']` instead of `f['name']` and confirm it returns the 6 public names:
`name`, `searchKey`, `taxId`, `email`, `phone`, `web`).

- [ ] **Step 4: Commit**

```bash
git add artifacts/contacts/decisions.json artifacts/contacts/contract.json
git commit -m "Feature ETP-5345: Expose 6 businessPartner fields via publicApi"
```

### Task 10: Curate `publicApi` fields on `product`

**Files:**
- Modify: `artifacts/product/decisions.json`

**Fields to mark** (inside `entities.product.fields`):

```json
"searchKey": { "publicApi": { "exposed": true, "name": "searchKey", "type": "passthrough", "handlerId": null } },
"name": { "publicApi": { "exposed": true, "name": "name", "type": "passthrough", "handlerId": null } },
"description": { "publicApi": { "exposed": true, "name": "description", "type": "passthrough", "handlerId": null } },
"productCategory": { "publicApi": { "exposed": true, "name": "category", "type": "passthrough", "handlerId": null } },
"eTGOSalePrice": { "publicApi": { "exposed": true, "name": "salePrice", "type": "passthrough", "handlerId": null } },
"eTGOStock": { "publicApi": { "exposed": true, "name": "stock", "type": "passthrough", "handlerId": null } }
```

- [ ] **Step 1: Edit `artifacts/product/decisions.json`**, adding `publicApi` to these 6 fields.

- [ ] **Step 2: Regenerate**

Run: `make regen ONLY=product`

- [ ] **Step 3: Verify via the same Python one-liner pattern as Task 9 Step 3**, pointed at
  `artifacts/product/contract.json` and `entities.product.fields`. Expected 6 exposed public
  names: `searchKey`, `name`, `description`, `category`, `salePrice`, `stock`.

- [ ] **Step 4: Commit**

```bash
git add artifacts/product/decisions.json artifacts/product/contract.json
git commit -m "Feature ETP-5345: Expose 6 product fields via publicApi"
```

### Task 11: Generate the v1 allowlist artifact from real curated data

**Files:**
- Generated (not hand-edited): `artifacts/_public-api/allowlist.v1.json`

- [ ] **Step 1:** Run `make regen-public-api LOCAL_CORE=1`
- [ ] **Step 2:** Verify the output contains both entities with exactly the fields curated in
  Tasks 9 and 10:

```bash
python3 -c "
import json
d = json.load(open('artifacts/_public-api/allowlist.v1.json'))
print(sorted(d['entities']['businessPartner']['fields'].keys()))
print(sorted(d['entities']['product']['fields'].keys()))
"
```

Expected: `['email', 'name', 'phone', 'searchKey', 'taxId', 'web']` and
`['category', 'description', 'name', 'salePrice', 'searchKey', 'stock']`.

- [ ] **Step 3: Commit**

```bash
git add artifacts/_public-api/allowlist.v1.json
git commit -m "Feature ETP-5345: Generate v1 public API allowlist artifact"
```

### Task 12: Scaffold the `gateway/` NestJS app

**Files:**
- Create: `gateway/package.json`
- Create: `gateway/tsconfig.json`
- Create: `gateway/src/main.ts`
- Create: `gateway/src/app.module.ts`
- Create: `gateway/.env.example`

- [ ] **Step 1: `package.json`**

```json
{
  "name": "etendo-go-public-api-gateway",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start:dev": "nest start --watch",
    "build": "nest build",
    "test": "node --test --experimental-strip-types test/**/*.test.ts"
  },
  "dependencies": {
    "@etendosoftware/api-gateway-core": "^0.1.0",
    "@nestjs/common": "^10.4.0",
    "@nestjs/core": "^10.4.0",
    "@nestjs/platform-express": "^10.4.0",
    "@nestjs/swagger": "^7.4.0",
    "@nestjs/throttler": "^6.2.0",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.4.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: `tsconfig.json`** — same compiler options as
  `packages/api-gateway-core/tsconfig.json` (Task 3 Step 2), copied verbatim, so both packages
  compile consistently.

- [ ] **Step 3: `.env.example`**

```
NEO_BASE_URL=http://localhost:8080/etendo
GATEWAY_PORT=3300
```

- [ ] **Step 4: `src/main.ts`**

```ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  await app.listen(process.env.GATEWAY_PORT ?? 3300);
}
bootstrap();
```

- [ ] **Step 5: `src/app.module.ts`** — minimal module, no controllers yet (Task 13 adds them)

```ts
import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])],
})
export class AppModule {}
```

- [ ] **Step 6: Install and confirm it boots**

Run: `cd gateway && npm install && npm run start:dev`
Expected: NestJS boot log, "Nest application successfully started", listening on 3300. Stop it
with Ctrl-C once confirmed.

- [ ] **Step 7: Commit**

```bash
git add gateway/
git commit -m "Feature ETP-5345: Scaffold the gateway NestJS app"
```

### Task 13: Load the resolved schema, wire the Product and BusinessPartner controllers

**Files:**
- Create: `gateway/src/schema/schema.provider.ts`
- Create: `gateway/src/public-api/public-api.controller.ts`
- Modify: `gateway/src/app.module.ts`
- Test: `gateway/test/public-api.controller.test.ts`

**Interfaces:**
- Consumes: `PUBLIC_API_SCHEMA` DI token (Task 7), `PublicApiKeyGuard` (Task 7),
  `FieldFilterInterceptor` + `PublicApiEntityName` decorator (Task 7), `PublicApiSchema` type
  (Task 3).
- Produces: `GET /api/v1/product` and `GET /api/v1/businessPartner` (list) plus
  `GET /api/v1/product/:id` and `GET /api/v1/businessPartner/:id` (single record), each
  filtered through the field allowlist for that entity.

- [ ] **Step 1: `schema.provider.ts`** — loads `artifacts/_public-api/allowlist.v1.json` at
  startup (the file Task 11 generates)

```ts
import { readFileSync } from 'node:fs';
import type { PublicApiSchema } from '@etendosoftware/api-gateway-core';
import { PUBLIC_API_SCHEMA } from '@etendosoftware/api-gateway-core';

export const schemaProvider = {
  provide: PUBLIC_API_SCHEMA,
  useFactory: (): PublicApiSchema => {
    const path = process.env.PUBLIC_API_SCHEMA_PATH ?? '../artifacts/_public-api/allowlist.v1.json';
    return JSON.parse(readFileSync(path, 'utf-8'));
  },
};
```

- [ ] **Step 2: Write the failing test for the controller's proxy+filter behavior**

```ts
// gateway/test/public-api.controller.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PublicApiController } from '../src/public-api/public-api.controller.js';
import type { PublicApiSchema } from '@etendosoftware/api-gateway-core';

const schema: PublicApiSchema = {
  apiVersion: 'v1',
  entities: {
    product: {
      publicApi: true,
      operations: ['GET', 'LIST'],
      fields: {
        name: { publicApi: true, direction: 'out', internalPath: 'name', type: 'passthrough', handlerId: null },
      },
    },
  },
};

test('list() calls NeoServlet at the right path and unwraps the response envelope', async () => {
  const fakeFetch = async (url: string) => {
    assert.equal(url, 'http://neo.local/etendo/sws/neo/product');
    return new Response(
      JSON.stringify({ response: { data: [{ name: 'Widget', internalCostBasis: 99 }] } }),
      { status: 200 }
    );
  };
  const controller = new PublicApiController(schema, 'http://neo.local/etendo', fakeFetch as typeof fetch);
  const result = await controller.list('product', { neoJwt: 'jwt-abc' } as any);
  assert.deepEqual(result, [{ name: 'Widget' }]);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd gateway && npm test`
Expected: FAIL — `PublicApiController` does not exist.

- [ ] **Step 4: Write minimal implementation**

```ts
// gateway/src/public-api/public-api.controller.ts
import { Controller, Get, Inject, NotFoundException, Param, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import {
  PUBLIC_API_SCHEMA,
  PublicApiKeyGuard,
  FieldFilterInterceptor,
  PublicApiEntityName,
  filterOutboundRecord,
  type PublicApiSchema,
} from '@etendosoftware/api-gateway-core';

@Controller()
@UseGuards(PublicApiKeyGuard)
@UseInterceptors(FieldFilterInterceptor)
export class PublicApiController {
  constructor(
    @Inject(PUBLIC_API_SCHEMA) private readonly schema: PublicApiSchema,
    private readonly neoBaseUrl: string = process.env.NEO_BASE_URL ?? 'http://localhost:8080/etendo',
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  @Get(':entityName')
  @PublicApiEntityName('__dynamic__') // resolved per-request below since entity comes from the path
  async list(@Param('entityName') entityName: string, @Req() req: { neoJwt: string }) {
    const entity = this.schema.entities[entityName];
    if (!entity) throw new NotFoundException(`Unknown public entity: ${entityName}`);
    const response = await this.fetchImpl(`${this.neoBaseUrl}/sws/neo/${entityName}`, {
      headers: { Authorization: `Bearer ${req.neoJwt}` },
    });
    const json = (await response.json()) as { response: { data: Record<string, unknown>[] } };
    return json.response.data.map((record) => filterOutboundRecord(entity, record));
  }
}
```

Note on Step 4: the `@PublicApiEntityName('__dynamic__')` decorator from Task 7 assumed a
per-route static entity name; here the entity name is dynamic (from the URL path param), so
this controller filters explicitly in its own body via `filterOutboundRecord` rather than
relying on the interceptor picking it up from the handler metadata — remove
`@UseInterceptors(FieldFilterInterceptor)` and the `@PublicApiEntityName` line from this
controller (the interceptor stays useful for a FUTURE static-per-route controller, e.g. once
custom per-entity endpoints exist, but this dynamic `:entityName` route filters directly). This
is a real adjustment to Task 7's originally-assumed usage, made here once the dynamic-route
shape became concrete — leave Task 7's interceptor code as-is (it's still correct, generic,
reusable), just don't wire it onto this particular controller.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd gateway && npm test`
Expected: PASS.

- [ ] **Step 6: Wire into `app.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { PublicApiController } from './public-api/public-api.controller.js';
import { schemaProvider } from './schema/schema.provider.js';
import { TokenExchangeService, CachedTokenExchangeService, PublicApiKeyGuard } from '@etendosoftware/api-gateway-core';

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])],
  controllers: [PublicApiController],
  providers: [
    schemaProvider,
    { provide: TokenExchangeService, useFactory: () => new TokenExchangeService(process.env.NEO_BASE_URL ?? 'http://localhost:8080/etendo') },
    { provide: CachedTokenExchangeService, useFactory: (t: TokenExchangeService) => new CachedTokenExchangeService(t), inject: [TokenExchangeService] },
    { provide: PublicApiKeyGuard, useFactory: (c: CachedTokenExchangeService) => new PublicApiKeyGuard(c), inject: [CachedTokenExchangeService] },
  ],
})
export class AppModule {}
```

- [ ] **Step 7: Commit**

```bash
git add gateway/
git commit -m "Feature ETP-5345: Wire schema-driven product/businessPartner list endpoint"
```

### Task 14: OpenAPI generation (`@nestjs/swagger`) + Scalar docs endpoint

**Files:**
- Modify: `gateway/src/main.ts`

- [ ] **Step 1: Add Swagger document generation to `main.ts`**

```ts
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
// inside bootstrap(), before app.listen():
const config = new DocumentBuilder()
  .setTitle('Etendo Go Public API')
  .setVersion('v1')
  .addBearerAuth()
  .build();
const document = SwaggerModule.createDocument(app, config);
app.getHttpAdapter().get('/api/v1/openapi.json', (_req, res) => res.json(document));
```

- [ ] **Step 2: Add the Scalar docs page** — a static HTML file served at `/docs`

```ts
// inside bootstrap(), before app.listen():
app.getHttpAdapter().get('/docs', (_req, res) => {
  res.type('html').send(`<!doctype html>
<html><head><title>Etendo Go Public API Docs</title></head>
<body>
  <script id="api-reference" data-url="/api/v1/openapi.json"></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body></html>`);
});
```

- [ ] **Step 3: Run and verify manually**

Run: `cd gateway && npm run start:dev`, then in a browser open `http://localhost:3300/docs`.
Expected: Scalar renders the API reference page with the `product`/`businessPartner` routes
listed under `/api/v1/{entityName}`.

- [ ] **Step 4: Commit**

```bash
git add gateway/src/main.ts
git commit -m "Feature ETP-5345: Serve OpenAPI spec and Scalar docs page"
```

### Task 15: End-to-end local verification

This task has no new code — it is the proof that the whole chain works, against a real local
Etendo Go instance.

- [ ] **Step 1: Start local Etendo Go/Core** (per this repo's existing local-dev instructions —
  not part of this plan, assumed already running per prior environment setup for this
  workspace).

- [ ] **Step 2: Create a real API key using the EXISTING admin endpoint**

```bash
curl -X POST http://localhost:8080/etendo/oauth2/clients \
  -H "Authorization: Bearer <an existing admin session JWT>" \
  -H "Content-Type: application/json" \
  -d '{"name": "ETP-5345 local test key", "adUserId": "<AD_User_ID>", "adRoleId": "<AD_Role_ID>", "scopes": "neo:read"}'
```

Save the returned `clientId` and `clientSecret` (shown once).

- [ ] **Step 3: Start the gateway**

Run: `cd gateway && NEO_BASE_URL=http://localhost:8080/etendo npm run start:dev`

- [ ] **Step 4: Call the product list endpoint with the key**

```bash
curl -H "Authorization: Bearer <clientId>:<clientSecret>" http://localhost:3300/api/v1/product
```

Expected: a JSON array of product records, each containing ONLY `searchKey`, `name`,
`description`, `category`, `salePrice`, `stock` — no other product field present, even though
NeoServlet's real response contains many more.

- [ ] **Step 5: Call the businessPartner list endpoint**

```bash
curl -H "Authorization: Bearer <clientId>:<clientSecret>" http://localhost:3300/api/v1/businessPartner
```

Expected: records containing ONLY `name`, `searchKey`, `taxId`, `email`, `phone`, `web` — in
particular, confirm `creditLimit` (a financial field deliberately NOT curated as `publicApi`)
never appears anywhere in the response.

- [ ] **Step 6: Confirm the fail-closed guarantee with an invalid key**

```bash
curl -i -H "Authorization: Bearer wrong:wrong" http://localhost:3300/api/v1/product
```

Expected: `401 Unauthorized`, no product data returned.

- [ ] **Step 7: Record the result** — this step has no commit; it is the plan's acceptance
  check. If any expectation above fails, that is a bug in one of the preceding tasks, not a new
  task — go back and fix the relevant task's implementation.

---

## Self-Review Notes

- **Spec coverage:** curation (Tasks 1, 9, 10), versioned schema resolution (Task 2, v1-only as
  scoped), gateway isolation + no external deps besides Etendo Go (Tasks 12-13), token exchange
  not new signing (Task 4-5), fail-closed filter both directions (Task 6-7, 13), OpenAPI +
  Scalar (Task 14), rate limiting (`ThrottlerModule` in Task 12). NOT covered by this plan,
  intentionally (see Global Constraints and the spec's own Non-Goals): the `sf-validate-pipeline`
  F11+ governance rule, multi-version cascading beyond v1, the self-service "create key" UI page,
  write operations, and production deploy/CloudFront wiring — each is real follow-up work, not
  silently dropped.
- **Type consistency check:** `PublicApiSchema`/`PublicApiEntity`/`PublicApiField` (Task 3) are
  the single shape referenced by Task 2's generator output, Task 6's filter, Task 7's
  interceptor/guard, and Task 13's controller — verified consistent field names
  (`internalPath`, `direction`, `handlerId`, `publicApi`) throughout.
- **Known adjustment surfaced during writing, not hidden:** Task 13 Step 4 explains why the
  dynamic `:entityName` route does its own filtering instead of using Task 7's
  `FieldFilterInterceptor` as originally sketched — flagged inline rather than silently
  papered over.

---

**Plan complete and saved to `docs/superpowers/plans/2026-09-15-etp-5345-public-api-gateway.md`.**
