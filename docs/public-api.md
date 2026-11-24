# Etendo Go Public API

Reference for the public REST API of Etendo Go: how fields are selected (curated, or derived
from the window form), how the contract is generated, what the gateway exposes under
`/api/v1/*`, how updates are protected against concurrent changes, how API keys are managed under
`/oauth2/api-keys`, and how the UI and the OpenAPI documents relate to them.

Source locations are given as file paths. Paths without a prefix belong to this repository;
`core:` is the `schema_forge_core` repository; `go:` is the `com.etendoerp.go` module
(`src/com/etendoerp/go/...`). Line numbers are intentionally omitted.

## Contents

1. [Overview](#1-overview)
2. [Field selection: `publicApi` curation and window-form default](#2-field-selection-publicapi-curation-and-window-form-default)
3. [Generation chain](#3-generation-chain)
4. [Public resource contract (`/api/v1/*`)](#4-public-resource-contract-apiv1)
5. [API key management contract (`/oauth2/api-keys`)](#5-api-key-management-contract-oauth2api-keys)
6. [UI exposure](#6-ui-exposure)
7. [OpenAPI sources and endpoint matrix](#7-openapi-sources-and-endpoint-matrix)
8. [Authentication and token flow](#8-authentication-and-token-flow)
9. [Operational notes](#9-operational-notes)
10. [Validation checklist](#10-validation-checklist)

---

## 1. Overview

"Public API" names three distinct layers with different owners, authentication and failure modes.

```
 (1) UI flag            tools/app-shell: feature flag `public-api-keys`
     "show the page"    Shows or hides the /api-keys page. Not a security boundary.
                                  |  calls (Etendo session)
 (2) Credential API     go: OAuth2Servlet  /oauth2/api-keys[/...]
     "make a key"       Owner-scoped lifecycle of API keys. Auth: Etendo session.
                                  |  key = clientId:clientSecret
 (3) Resource API       gateway/ (NestJS)  /api/v1/*  -> PublicApiKeyGuard
     "use the key"        -> POST /oauth2/token (client_credentials)
                          -> /sws/neo/{specName}/{entityName}  (NEO Headless)
```

| Layer | Question it answers | Code owner | Authenticates with | Section |
|-------|--------------------|------------|--------------------|---------|
| 1. UI flag | Does the user see the "Public API Keys" page? | `tools/app-shell` | not applicable (frontend gating) | [6](#6-ui-exposure) |
| 2. Credential API | How is a key created, rotated, revoked? | `com.etendoerp.go` (`OAuth2Servlet`) | Etendo session (bearer JWT or cookie session) | [5](#5-api-key-management-contract-oauth2api-keys) |
| 3. Resource API | How does an integrator read and write the published business data? | `gateway/` and `public-api/base.v1.json` | `Authorization: Bearer <clientId>:<clientSecret>` | [4](#4-public-resource-contract-apiv1) |

The feature flag controls only the visibility of the page. It does not enable or disable the
credential API or the resource API.

### Glossary

| Term | Meaning |
|------|---------|
| API key | A row in `ETGO_OAUTH2_CLIENT` flagged as a public key, identified by `clientId` (`etgo-` + 16 hex characters) and a `clientSecret` (64 hex characters). |
| Capability | Public permission name: `public-api:read`, `public-api:write`, `public-api:process`. |
| Scope | Internal OAuth2 name a capability maps to: `etendo:read`, `etendo:write`, `etendo:process` (legacy aliases `neo:*`). |
| Resource | One public path segment under `/api/v1/` (for example `contacts`). Also called the public name. |
| specName | The Schema Forge artifact/spec directory name in kebab-case, for example `contacts`. |
| entityName | The entity inside the spec, for example `businessPartner`. The NEO URL is `/sws/neo/{specName}/{entityName}`. |
| Manifest | `public-api/base.v1.json`, the file the gateway loads at runtime. |
| Fail-closed | Anything not listed in the manifest is rejected or omitted, never passed through. |

---

## 2. Field selection: `publicApi` curation and window-form default

Each public resource publishes its fields in one of two ways, decided per entity:

| Entity | Fields published |
|--------|------------------|
| Curated: at least one field declares `publicApi.exposed: true` | Exactly the curated fields. The rest of the window form is ignored. |
| Not curated | The fields its window form shows (see [Default exposure: window form](#default-exposure-window-form)). |

In both cases `id` and `updated` are added as described in [Field rules](#field-rules-applied-by-the-manifest-generator).
The manifest records the rule as `policy.fieldSelection: "curated-publicApi-else-window-form"`.

### `publicApi` curation in `decisions.json`

Per-field key at `entities.<entity>.fields.<field>.publicApi`:

```json
"publicApi": { "exposed": true, "name": "searchKey" }
```

| Property | Type | Meaning |
|----------|------|---------|
| `exposed` | boolean | Only the exact value `true` opts the field in. In a curated entity, absent, `false` or any other value means the field is not exposed. In a non-curated entity it has no effect (see [Default exposure](#default-exposure-window-form)). |
| `name` | string | Requested public field name. The manifest generator derives the final public name from it (see [Name derivation](#name-derivation)). |
| `readOnly` | boolean | `true` publishes the field `out` (read-only) even when the window edits it. |
| `lookup` | `true` or `{ "context": { "<param>": "<value>" } }` | Publishes `GET /api/v1/<resource>/lookups/<field>`, the field's valid values ([4.2.2](#422-lookups)). Top-level resources, published reference fields only; read by the manifest generator straight from `decisions.json`. |
| `description` | string | Published as the field's OpenAPI description, for rules its type cannot express (when the field is required, when it is refused). A non-empty text that cites no internal reference (a ticket or Jira); anything else fails the generation. Read by the manifest generator straight from `decisions.json`. |

A public field is its NEO value under a public name: nothing transforms it. The keys `type` and `handlerId` of an earlier format promised custom field handlers that were never implemented; the manifest generator refuses them, naming the field.

Examples in the repository:

- `artifacts/contacts/decisions.json` (entity `businessPartner`): `name`, `searchKey`, `taxId`, `web`, `email`, `phone`, `paymentMethod`, `pOPaymentMethod`, `businessPartnerCategory` (the last three with a lookup); the person-or-company fields `etgoIsperson`, `etgoFirstname`, `etgoLastname` and `oBTIKTaxIDKey` (an AD list, published as an enum); and the type flags `customer` and `vendor` (public `is_customer`, `is_vendor`). `name`, `taxID`, the person fields and the type flags carry a `description`.
- `artifacts/product/decisions.json` (entity `product`): `searchKey`, `name`, `category` (internal `productCategory`), `description`, `salePrice` (internal `eTGOSalePrice`), `stock` (internal `eTGOStock`).
- `artifacts/conversion-rates/decisions.json` (entity `header`, contract name `conversionRate`): `currency`, `toCurrency`, `validFromDate`, `validToDate`, `multipleRateBy`, `divideRateBy`. The curation keeps the downloader's `sMFCRSynced` flag out of the API while the window still shows it.

Pipeline handling: `resolve-curated.js` copies `publicApi` as a whitelisted decision property
(`core: cli/src/resolve-curated.js`) and `generate-contract.js` stamps it onto each contract
field (`core: cli/src/generate-contract.js`).

### Default exposure: window form

For an entity that is not curated, the generator publishes every field of the entity in
`artifacts/<window>/contract.json` (`frontendContract.entities.<entity>.fields`) that:

- is shown in the window form: `form` is not `false` (a field without `form` counts as shown); and
- has a `visibility` other than `system` or `discarded` (in the contracts, `editable` or `readOnly`).

Fields shown only in the grid (`form: false`) are not published. Each published field keeps the
form's internal name as its internal path, and its public name follows [Name derivation](#name-derivation).

Some fields are never published, whether curated or derived. The manifest lists them in
`policy.excludedFields`:

| Field | Reason |
|-------|--------|
| `client`, `organization` | Tenant and organization ownership come from the API key, never from the caller. |
| `grantPortalAccess` | Grants a contact access to the customer portal; it stays a decision taken in the application. |
| `accountNo`, `bankName`, `displayedAccount`, `iBAN`, `swiftCode` | Bank account identifiers of a business partner. |
| `etblkpAccountingstatus`, `etblkpBulkposting` | Accounting bulk-posting fields; accounting is outside the public API scope. |

To configure what a window publishes (fields, read-only, input-only fields, actions, lookups, descriptions) step by step, see
[Public API configuration](public-api-configuration.md).

### Name derivation

`scripts/generate-base-public-api-manifest.mjs` passes `publicApi.name` (or the field name when
absent) through `publicFieldName()`:

1. A fixed override table is applied first. Its keys are matched against the requested name (`publicApi.name`, or the field name when absent), not against the internal path. For example a requested `etgoWeb` becomes `website`, `taxID` becomes `tax_id` and `uOM` becomes `uom`; the contacts window curates `etgoWeb` with the name `web`, so its public name stays `web` (internal path `etgoWeb`).
2. Otherwise the generic rule applies: the prefixes `etgo`, `eTGO` and `oBTIK` are stripped case-insensitively, in that order; a leading `pO` followed by an uppercase letter becomes `purchase` (`pOFoo` becomes `purchase_foo`, `pOxyz` becomes `p_oxyz`); and camelCase becomes snake_case, with acronym runs split as well (`VIESStatus` becomes `vies_status`).

| `publicApi.name` in `decisions.json` | Public name in the manifest | Internal path |
|---|---|---|
| `searchKey` | `search_key` | `searchKey` |
| `taxId` (contacts; not in the override table, generic rule) | `tax_id` | `taxID` |
| `category` (product) | `category` | `productCategory` |

### Field rules applied by the manifest generator

- Fields with `visibility` `system` or `discarded` are skipped even when `exposed` is `true`.
- Fields in `policy.excludedFields` are skipped even when `exposed` is `true` or the form shows them.
- Two fields resolving to the same public name make the generator throw (`Public field name collision`).
- `direction` is `inout` only when the entity has at least one `POST`, `PUT` or `PATCH` endpoint in `backendContract.endpoints` and the field's visibility is `editable`; otherwise `out`. The rule is the same for curated and derived fields, so a `readOnly` form field is always `out`. Entity-level and field-level read-only policies also force the corresponding fields to `out`.
- API-only fields declared in `publicApi.inputFields` ([configuration guide](public-api-configuration.md#3-add-input-only-fields)) are `in`, or `inout` with `readable: true`, and only on a resource with a write endpoint. With `writable: false` the field is read-only (`out`, never `required`) and is published on any resource: a value the entity's handler adds on read.
- `id` is always present and its internal path is always `id` (the NEO response key). When `id` is not curated it is added as a read-only (`out`) field; when it is curated, its curated direction is kept and only the internal path is forced to `id`.
- `dataType` comes from the contract field `type`: `amount`, `decimal`, `price`, `quantity` and `number` give `{ "type": "number", "format": "double" }`; `integer` gives `{ "type": "integer", "format": "int32" }`; `boolean` gives `{ "type": "boolean" }`; `date` gives `{ "type": "string", "format": "date" }`; `dateTime` (and the older spelling `datetime`) gives `{ "type": "string", "format": "date-time" }`. Every other type (`string`, `text`, `textarea`, `enum`, `list`, `button`, `foreignKey`, `productAttribute`, `image`) gives `{ "type": "string" }`. The `dataType` is what the OpenAPI document declares for the field and decides which filter operators it accepts ([4.10](#410-list-queries-pagination-sorting-and-filtering)).
- A string field that carries the values of an AD list (the contract field's `enumValues`, typically type `enum`) publishes them: the codes as `dataType.enum` and a label per code as `enumLabels` (`{ "<code>": "<label>" }`, the list value's name in the Application Dictionary). This is generic, it needs no decision and applies to every published resource. NEO reads and writes the **code**; the OpenAPI document lists the codes under `enum`, their labels as `x-enumDescriptions` and in the field description (`One of: \`1\` (NIF), ...`). A reference field (a foreign key) never publishes an enum, and a response attribute also accepts `null`. The manifest's `enum` documents the accepted values; NEO is what refuses an unknown code.
- `updated` is added as a read-only (`out`) field only when the entity's raw schema (`schema-raw.json`) has a field named `updated`. A resource whose entity has none carries no `updated` field. A resource that publishes `updated` is a versioned resource: its updates use [optimistic concurrency](#45-optimistic-concurrency-etag-and-if-match).

---

## 3. Generation chain

One generator, one artifact: `scripts/generate-base-public-api-manifest.mjs` writes `public-api/base.v1.json`, and that manifest is the only source of the public API schema. The gateway, the OpenAPI document and the field filtering all read it.

```
decisions.json (publicApi per field)
   | resolve-curated.js      copies `publicApi` (in memory)
   v
generate-contract.js         stamps field.publicApi onto contract.json
   v
artifacts/<window>/contract.json
   |
   +-- scripts/generate-base-public-api-manifest.mjs
         (make generate-base-public-api-manifest, followed by the validator)
         -> public-api/base.v1.json
               -> gateway/ (loaded via PUBLIC_API_SCHEMA_PATH)
                     -> /api/v1/*   and   /api/openapi.json (alias /api/v1/openapi.json)
```

### Manifest: `generate-base-public-api-manifest.mjs` to `base.v1.json`

- The gateway loads `process.env.PUBLIC_API_SCHEMA_PATH`, defaulting to `../public-api/base.v1.json`; the Docker image sets it to `/app/public-api/base.v1.json` (`gateway/src/schema/schema.provider.ts`, `gateway/Dockerfile`).
- V1 publishes an explicit allowlist from `publicApiV1Entities` in the generator. It is checked before loading contracts or raw schemas, so excluded artifacts cannot block generation or silently expand the API. The manifest records this map in `policy.allowedResources`.

  | Window | Published resources | Access |
  |--------|---------------------|--------|
  | Contacts | `contacts`, `contacts-locationAddress`, `contacts-contact` | Read and write |
  | Products | `product`, `product-category` | Read and write |
  | Product costs | `product-costing` | `GET`, `LIST` only |
  | Sales orders | `sales-order`, `sales-order-lines` | Read and write; header `complete` |
  | Purchase orders | `purchase-order`, `purchase-order-lines` | Read and write; header `complete` |
  | Quotations | `sales-quotation`, `sales-quotation-quotationLine` | Read and write |
  | Contact categories | `contact-category` (window and NEO spec `business-partner-category`) | Read and write; the Accounting tab is not published |
  | Taxes | `tax` | `GET`, `LIST` only; the tax zone, translation, accounting and parameter tabs are not published |
  | Tax categories | `tax-category` | `GET`, `LIST` only |
  | Conversion rates | `conversion-rates` | `GET`, `LIST` only |

  Invoices and their lines/exchange rates, shipments, receipts, goods movements, internal consumption, physical inventory, return receipts/shipments, warehouses, matched purchase invoices and fiscal monitors are outside V1. Contacts expose only addresses and contact persons as children. Excluded collections answer `404` (a gateway error, without `code`); removing a collection does not remove the app's corresponding window.

- **The allowlist is the per-window opt-in, and it overrides the category exclusion.** The generator keeps a list of categories outside the public API scope (`accounting`, `configuration`, `crm`, `finance`, `hr`, `settings`, `setup`; `policy.excludedCategories` in the manifest), but a window listed in `publicApiV1Entities` is published whatever its category: listing it is the scope decision. `tax` (category `settings`), `tax-category` (`configuration`) and `conversion-rates` (`finance`) are published this way. Every window that is not in the allowlist stays out, whatever its category. The windows in `excludedWindows` (`policy.excludedWindows`) stay out even if someone lists them. The manifest records the rule as `policy.windowSelection: "allowlist-overrides-excluded-categories"`.

- Every published window must have `artifacts/<window>/schema-raw.json`. The file is gitignored, so a clean checkout lacks it; when it is missing the generator fails and names the file, instead of producing a manifest without child resources and `updated`. Windows that are not published do not need it.
- Resources must belong to the explicit allowlist. Allowed child tabs must also have their parent foreign key in `schema-raw.json`. When `decisions.window.secondaryTabs` is non-empty, only the listed tabs are published. Child tabs whose name matches `accounting`, or is exactly `Bank Account`, are skipped. The manifest lists these patterns in `policy.excludedChildTabs`. A tab under a child tab (`level: subline` in `schema-raw.json`, AD tab level 2, e.g. the order's *Line Tax*) is not published either: Etendo filters it by the child record, while the gateway nests one level and would pass the window's id, so it always read empty (ETP-6012).
- The public resource name is `specName` for the primary entity and `specName-entityName` for the others. A window whose artifact name is not the name an integrator should see is renamed in `publicResourceNames` in the generator (`policy.publicResourceNames` in the manifest); today only `business-partner-category`, published as `contact-category`. The public name is the manifest key, the route (`/api/v1/contact-category`), the JSON:API `type`, the `parent.resource` of its children and the target of every relationship and lookup `type` that points to it. The entity keeps `specName: "business-partner-category"`, which is what the gateway sends to NEO (`/sws/neo/business-partner-category/businessPartnerCategory`); the gateway never derives the NEO spec from the public name.
- Operations come from `backendContract.endpoints` plus a forced `GET` and `LIST`; `PATCH` is added whenever `PUT` exists. A resource with no field of direction `in` or `inout` is read-only: its operations are reduced to `GET`, `LIST`.
- The functional texts (`functional.functionalSummary`, `functional.functionalCapabilities`) come from `docs/generated-custom-windows/<window>.md`. Capability lines and summary sentences that cite a ticket (`ETP-<number>`) or Jira are not published; when no summary sentence remains, the summary is `Public API resource for the <window> window.`
- A relationship is added to a field whose `reference` resolves to another public resource. When that field also publishes a lookup, the lookup `type` becomes the related resource's public name, so the ids a lookup lists are sent back with the type the relationship expects.
- `scripts/validate-base-public-api-manifest.mjs` checks: `publicApi` is `true`; `fields.id.internalPath` is `id`; no resource named or titled `accounting`; every child has a parent, a foreign key, a path segment, `GET` and `LIST`, and either none or all of `POST`, `PUT`, `PATCH`, `DELETE`; every relationship target exists and has a valid cardinality and foreign key; every lookup is well formed; every enum is a non-empty list of distinct string codes of a string field, with a label for each code and none for any other; every field description is a non-empty string.

---

## 4. Public resource contract (`/api/v1/*`)

Implemented by the NestJS application in `gateway/` (`gateway/src/public-api/public-api.controller.ts`).
All routes carry the global prefix `api/v1`. The gateway listens on `GATEWAY_PORT` (default 4300)
and forwards to `NEO_BASE_URL` (default `http://localhost:8080/etendo`).

### 4.1 Authentication: `PublicApiKeyGuard`

The guard is applied to the whole controller (`core: packages/api-gateway-core/src/http/public-api-key.guard.ts`).

| Input | Result |
|-------|--------|
| No `Authorization` header, or one not matching `^Bearer\s+(.+)$` (the word `Bearer` is case-sensitive and at least one whitespace character must follow it) | `401 Missing API key` |
| Credential that does not split on `:` into a non-empty id and a non-empty secret (only the first two `:`-separated parts are used) | `401 Malformed API key` |
| Token exchange fails for any reason | `401 Invalid API key` |
| Token exchange succeeds | The token returned by Etendo is attached to the request and used for the upstream call |

- The credential format is `Authorization: Bearer <clientId>:<clientSecret>`; one or more whitespace characters after `Bearer` are accepted.
- Token exchange is `POST {NEO_BASE_URL}/oauth2/token` with `grant_type=client_credentials`, form-encoded, without a `scope` parameter (`core: packages/api-gateway-core/src/auth/token-exchange.service.ts`).

### 4.2 Routes

The route table is fixed controller code; resource and child lookup use the manifest at runtime.

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/v1/{resource}` | List. Top-level resources only. Pages, sorts and filters ([4.10](#410-list-queries-pagination-sorting-and-filtering)). |
| GET | `/api/v1/{resource}/{id}` | Read one. |
| POST | `/api/v1/{resource}` | Create. |
| PUT, PATCH | `/api/v1/{resource}/{id}` | Update. Requires `If-Match` on versioned resources ([4.5](#45-optimistic-concurrency-etag-and-if-match)). |
| DELETE | `/api/v1/{resource}/{id}` | Delete. Answers `204 No Content` with no body ([4.8](#48-success-and-error-documents-and-statuses)). |
| GET, POST | `/api/v1/{parent}/{parentId}/{child}` | Child collection; the GET takes the same query parameters as a list.  `parentId` is sent upstream as the query parameter `parentId`; on POST it is also set in the body as `parentId`. |
| GET, PUT, PATCH, DELETE | `/api/v1/{parent}/{parentId}/{child}/{id}` | Child item. PUT and PATCH require `If-Match` on versioned resources. |
| POST | `/api/v1/{resource}/{id}/actions/{action}` | Run a business action on a record ([4.2.1](#421-business-actions)). Top-level resources only. |
| GET | `/api/v1/{resource}/lookups/{field}` | List the valid values of a reference field ([4.2.2](#422-lookups)). Top-level resources only. |

- A resource that has a `parent` in the manifest is not reachable at top level: `404 Child resource must be addressed through its master: <name>`.
- An unknown resource returns `404 Unknown public entity: <name>`; an unknown child path returns `404 Unknown child resource: <parent>/<child>`.
- An operation absent from the resource's `operations` returns `404 Operation <METHOD> is not exposed for <name>`. `LIST` in `operations` also allows `GET`.

#### 4.2.1 Business actions

`POST /api/v1/{resource}/{id}/actions/{action}` runs a named action declared in the manifest's
`processes` (each entry has a public `action` name, `method`, `path` and optional `body`).

- **Declared actions.** `complete` exists on a resource whose window has a completion flow
  (`draftMode` with `processField: documentAction`) **and** opts in with `window.publicApi.actions: ["complete"]`
  in its `decisions.json` (absent means no actions; see [Public API configuration](public-api-configuration.md)); the generator derives it structurally and sends
  `{"docAction": "<processValue>"}` to `POST /sws/neo/{specName}{path}`. In v1 `complete` is the only
  public action: declared `processEndpoints` are not exposed. Child resources declare none.
- **Published today.** `sales-order` and `purchase-order` publish `complete`
  (`POST /api/v1/sales-order/{id}/actions/complete`, `POST /api/v1/purchase-order/{id}/actions/complete`); no
  other resource publishes an action. Completing runs the same document process as the application's
  confirm button, so it moves the order from `document_status` `DR` to `CO`.
- **Request.** No body is needed; a body is accepted and ignored in v1. An action the resource does not declare, or a child resource, answers `404`.
- **Permission.** The key needs `public-api:process`. A key with only `public-api:write` is refused by Etendo with `403`.
- **Response.** `200` with the record re-read after the action (the normal single-record document, so `document_status` shows the new state) plus `meta.message` with Etendo's message. If the record was already in the target status, `meta.alreadyApplied` is `true` and nothing was run again, so retrying is safe. If the action succeeded but the re-read failed, the answer is still `200` with only `meta` and `meta.hint` ("read the record to see its current state"); a committed action is never reported as an error. The re-read is a plain `GET` of the same record, so it needs `public-api:read`: a process-only key always gets the hint.
- **Refusals.** A document rule that refuses the action (for example completing an empty order) passes through with Etendo's status and message (`422`, `403`, ...).
- **Orders need a payment method.** Etendo completes an order only when it has a payment method; otherwise the action answers `422 business_rule` ("the payment method field is required") and the order stays `DR`. The order inherits its payment method from its contact when it is created: a sales order takes the contact's `payment_method`, a purchase order its `purchase_payment_method`. A contact created through the API has none, so the flow with no id known beforehand is: list the valid values with the lookup ([4.2.2](#422-lookups)) `GET /api/v1/contacts/lookups/payment_method` (or `purchase_payment_method`), set the id on the contact with a `PATCH` (with `If-Match`), create the order, complete it. Setting `payment_method` on the order itself (on create or with a `PATCH`) works as well; `GET /api/v1/{sales-order|purchase-order}/lookups/payment_method` lists its valid values.
- **A completed order is closed to writes.** A `PATCH` and a `DELETE` on a completed order answer `422` and change nothing; the API publishes no action to reopen or void it.
- **Synchronous.** The action completes within the request; there is no status endpoint in v1. If the connection fails or times out the answer is `502` with `meta.hint` ("The action may have been applied. Read the record before retrying."); read the record before retrying. The ids `.` and `..` are refused with `404`.

Upstream mapping: the gateway calls
`{NEO_BASE_URL}/sws/neo/{specName}/{entityName}[/{id}][?parentId=...]` with the token from the
guard. Example: `GET /api/v1/contacts/ABC` calls `GET /sws/neo/contacts/businessPartner/ABC`.

#### 4.2.2 Lookups

`GET /api/v1/{resource}/lookups/{field}` lists the values a reference field accepts (its valid ids
and their labels), the same ones the application offers in that field's selector. A caller uses it
to find an id it cannot know beforehand, for example a payment method.

- **Declared lookups.** A field publishes a lookup when its window declares
  `publicApi.lookup` on it in `decisions.json` ([Public API configuration](public-api-configuration.md));
  the generator puts it on the manifest field as `lookup: { selector, type, context }`. Only
  top-level resources and published reference fields can have one; anything else fails the
  generation. A field without a lookup, a field that is not published and a child resource answer
  `404` (code `unknown_lookup` for a field of the resource), and nothing is sent to Etendo.
- **Published today.** Four payment-method lookups (`type` `payment-method`), two order warehouse lookups (`type` `warehouse`) and the contact category lookup (`type` `contact-category`):

  | Route | Field | Fixed context sent to Etendo |
  |-------|-------|------------------------------|
  | `GET /api/v1/sales-order/lookups/payment_method` | The sales order's payment method | `IsSOTrx=Y` |
  | `GET /api/v1/purchase-order/lookups/payment_method` | The purchase order's payment method | `IsSOTrx=N` |
  | `GET /api/v1/contacts/lookups/payment_method` | The contact's payment method as a customer | `FIN_ISRECEIPT=Y` |
  | `GET /api/v1/contacts/lookups/purchase_payment_method` | The contact's payment method as a vendor | `FIN_ISRECEIPT=N` |
  | `GET /api/v1/sales-order/lookups/warehouse` | The sales order's warehouse | None |
  | `GET /api/v1/purchase-order/lookups/warehouse` | The purchase order's warehouse | None |
  | `GET /api/v1/contacts/lookups/category` | The contact's category | None |

  Choose an order's warehouse with that order's warehouse lookup and send the selected id as
  `data.attributes.warehouse` on create. The field is optional: if it is omitted, Etendo assigns
  a warehouse when the order is created. There is no `relationships.warehouse`, because the
  warehouse collection is outside V1. Partial `PATCH` requests may omit an unchanged warehouse.
  On completed orders the app locks the field; the public API applies the same upstream
  document validation.

  The category lookup lists the categories the app offers in the contact form: the field has no
  validation rule, so the list is the tenant's active categories the key's role can read, with no
  further filter (no context is sent). `category` is optional on create: when it is omitted, Etendo
  assigns the default category, as the app does. Contact categories are a published resource
  (`contact-category`), so `category` is a relationship: send the id under
  `data.relationships.category` as `{ "data": { "type": "contact-category", "id": "..." } }`, and
  read it there. The lookup answers values of `type` `contact-category`, ready to be sent as the
  relationship; listing `GET /api/v1/contact-category` gives the same ids with all their fields.

  Each payment-method lookup lists the tenant's active payment methods, the same list the app offers in that field. The
  fixed context is forwarded to the field's selector; whether it narrows the list depends on that
  field's validation rule, as in the app. Integrators must not rely on the list being filtered by
  sales or purchase.
- **Query.** Only `filter[search]` (values whose label contains the text, case-insensitive, at most
  255 characters), `page[number]` and `page[size]` (default 50, maximum 100). **Any other parameter
  is refused with `400`** (`invalid_query_parameter`, `source.parameter` names it) before anything
  is sent to Etendo. The caller never sends selector context: the context is fixed in the manifest.
- **Permission.** A read: the key needs `public-api:read`. A key without access to the window gets
  Etendo's `403`, passed through.
- **Response.** `200` with a collection: `{ "data": [{ "type": "payment-method", "id": "...", "attributes": { "label": "..." } }], "meta": { "page": { "number", "size", "total" } }, "links": { ... } }`,
  the same pagination members as a list ([4.10](#410-list-queries-pagination-sorting-and-filtering)).
  The values are not a published resource: `type` names what they are, and `id` is what the field takes.
- **Failures.** A `401` from Etendo drops the cached token, as on any route. A lookup Etendo does
  not know (its `404`), no answer, or an answer without `items` is a `502`: the manifest and Etendo
  disagree, it is not the caller's fault.

Upstream mapping: `GET {NEO_BASE_URL}/sws/neo/{specName}/{entityName}/selectors/{selector}?limit={size}&offset={(number-1)*size}[&q={search}]&{context}`.
Example: `GET /api/v1/sales-order/lookups/payment_method?filter[search]=trans` calls
`GET /sws/neo/sales-order/header/selectors/paymentMethod?limit=50&offset=0&q=trans&IsSOTrx=Y`. The
selector answers `{ items: [{ id, label }], totalCount, hasMore }`, scoped to the tenant of the key.

The route is declared before the child-list route (`/{parent}/{parentId}/{child}`), which would
otherwise take `{resource}/lookups/{field}`. As a result, a child list whose parent id is literally
`lookups` is not reachable; record ids are generated UUIDs, so this does not happen in practice. As
hygiene, the generator and the validator also refuse a child resource whose path segment is
`lookups`, so the two kinds of route stay visibly apart.

### 4.3 Fields and fail-closed filtering

- **Outbound:** each upstream record is projected through `filterOutboundRecord` (`core: packages/api-gateway-core/src/filter/field-filter.ts`): only manifest fields whose `internalPath` is present in the record are emitted, under their public name. A field absent from the manifest never appears in a response.
- **Inbound (write bodies):** every attribute must be a manifest field with direction `in` or `inout`; otherwise `400 Field "x" is not writable by the public API`. Attributes are mapped to their `internalPath`. An attribute that is a relationship (a foreign key) is refused with `400 "x" is a relationship: send it under "relationships"`, so a link is never written, or read back, in two places. A relationship key must be a field that has a `relationship` and a write direction; otherwise `400 Relationship "x" is not writable by the public API`.
- A body is JSON:API (`{"data": {"type": "<resource>", "id": "<id>", "attributes": {...}, "relationships": {...}}}`) or flat (`{"name": "..."}`, attributes only). In a JSON:API body `attributes` and `relationships` are **each optional**: a body that carries only relationships is valid. `type` and `id` are resource members, never attributes. A `type` that is not the resource's, or an `id` that differs from the URL id, returns `409 Conflict`. `data` that is not a single resource object returns `400`.
- Responses use the JSON:API envelope: `{ "data": <resource> }` for a single record (read, create or update) and `{ "data": [ <resource>, ... ] }` for a collection. Etendo wraps a single record in a one-element array; the gateway unwraps it, so `data` of a single-record response is always one resource object (an empty answer to a read is `404`; an empty answer to a write, or an answer with several records, is `502`, because it says nothing reliable about the write). A resource is built as follows:
  - `type` is the public resource name; `id` is the record's `id` (or the id in the request path) and is removed from `attributes`.
  - A field that has a `relationship` and is present in the upstream record is removed from `attributes` and returned under `relationships.<field>`: `{ "data": { "type": "<related resource>", "id": "<id>" }, "links": { "related": "/api/v1/<related resource>/<id>" } }`. A relationship field absent from the upstream record is omitted from `relationships` entirely.
  - When the value is an object, the related id is its `id`, else its `identifier`, else its `_id`; otherwise the scalar value itself is the id. When the value is null, or an object carrying none of those three keys, the result is `{ "data": null }` without `links`.
  - The ids inside `links.related` and `links.self` are URL-encoded.
  - `links.self` (`/api/v1/<resource>/<id>`) is present only when an id exists.
  - `meta.etag` is present on resources of versioned entities whose record carries `updated` ([4.5](#45-optimistic-concurrency-etag-and-if-match)), including the items of a list.
- **Person or company (`contacts`):** a contact is a person or a company, and `is_person` (a JSON boolean) says which. A contact created without it is a company.
  - A **company** sends `name`; `first_name` and `last_name` are refused (`400`). A create that sends `first_name` or `last_name` without `is_person: true` is a company, so it is refused too, and the error tells the caller to send `is_person: true` to create a person.
  - A **person** sends `is_person: true` with `first_name` and `last_name`, both required (`400` without either). Etendo derives `name` from the first and last name (`first_name + " " + last_name`) and a read returns the derived value; send none; a value other than first name + last name is refused (`400`). An empty string or `null` counts as absent.
  - An `is_person` value that is not recognized as true is treated as a company. A `PATCH` with `is_person: true` on an existing person re-derives `name` from its first and last name.
  - On `PATCH`, the rules apply only when the body carries `is_person`, `name`, `first_name` or `last_name`. Switching a person to a company (`is_person: false`, with `name`) clears its stored first and last name.
  - A missing field answers `400` with code `missing_required_field` and a `source.pointer` to the public field (for example `/data/attributes/last_name`), like any other missing field. A refused field answers `400` with Etendo's message as `detail`, which states the rule.
  - None of these fields is marked `required` in the manifest or the OpenAPI document, because each is required only for one kind of contact; the field descriptions state the rule and Etendo enforces it. `phone`, `email` and the other contact fields apply to both kinds.
  - `tax_id_key` is the kind of tax id in `tax_id`, one of the codes of its AD list (`1` NIF, `2` intra-community VAT number, `3` passport, ...; the OpenAPI document lists them all with their labels). When it is omitted, Etendo applies the default kind before it validates `tax_id`, and an invalid tax id is refused on create.
- **Address country (`contacts-locationAddress`):** on a write, `country` accepts the ISO 3166-1 alpha-2 code (`ES`) or the internal country id; a code no country has returns `400`. On a read, `country` is the internal id and `country_code` (read-only) is the ISO code, `null` when the address has no country or the country has no code. The address fields (`address_line1`, `city_name`, `country`, `country_code`, ...) are added by the address handler on read and are not columns of the resource: do not use them in `filter` or `sort`. The gateway refuses them with `400 invalid_query_parameter` and the OpenAPI document lists no `filter` parameter for them.
- **Customer and vendor (`contacts`):** `is_customer` and `is_vendor` (JSON booleans, read and write) are the Cliente / Proveedor flags of the contact form. `is_customer` lets the contact be used on sales documents, `is_vendor` on purchase documents: the purchase order only accepts a vendor as its contact and answers `422` with code `reference_not_allowed` otherwise. When a flag is omitted on create, Etendo applies the default (`is_customer` true, `is_vendor` false) or the type the contact's category defines; to create a contact for a purchase order, send `is_vendor: true`, or set it later with a `PATCH` (with `If-Match`). With the `contact-category-type` feature flag on, a contact cannot be left with no type: a create or `PATCH` that ends with `is_customer: false` and `is_vendor: false` is refused by `ContactTypeRules` (message key `ETGO_BPartnerContactTypeRequired`) with `400`, code `bad_request` and Etendo's message as `detail`.
- On a write, a relationship is `{ "data": { "type": "<related resource>", "id": "<id>" } }`; `{ "data": null }` clears it. The `type` must be the related resource, else `409`. A relationship object without a `data` member, or with an array (to-many is not supported) or an identifier without a string `id`, returns `400`.

Example response (values illustrative):

```http
GET /api/v1/product/8F2A... HTTP/1.1
Authorization: Bearer etgo-0123456789abcdef:<64-hex-secret>
```
```json
{ "data": { "type": "product", "id": "8F2A...",
            "attributes": { "search_key": "P-001", "name": "Widget", "sale_price": 12.5,
                            "updated": "2026-10-15T10:42:07Z" },
            "links": { "self": "/api/v1/product/8F2A..." },
            "meta": { "etag": "\"MjAyNi0xMC0xNVQxMDo0MjowN1o\"" } } }
```

### 4.4 Capability enforcement

The gateway itself does not evaluate capabilities. They are enforced by Etendo when the token is
used on `/sws/neo/*` (see [section 8](#8-authentication-and-token-flow)).

### 4.5 Optimistic concurrency: `ETag` and `If-Match`

> **Status:** the `ETag`/`If-Match` behavior below (and `meta.etag`, `412`, `428`) is delivered by ETP-5766 (PR #1869). Until that PR is merged, `develop`'s gateway does not implement it: updates carry Etendo's `updated` value as before and a stale value returns `409`. The 412/428 OpenAPI responses are added by whichever of ETP-5766 and ETP-5369 merges second.

Applies to versioned resources: those whose manifest entity publishes `updated`
([Field rules](#field-rules-applied-by-the-manifest-generator)). For resources without `updated` the gateway
does not require `If-Match` and returns no `ETag`.

| Case | Behavior |
|------|----------|
| `GET` of one record, `POST`, `PUT`, `PATCH` (top-level and child) | The response carries an `ETag` header with the record's current version. |
| Every resource in a response, including list items | Carries `meta.etag`; for a single-record response it equals the `ETag` header. |
| `PUT` or `PATCH` without `If-Match`, or with `If-Match: *` | `428 Precondition Required`; nothing is sent to Etendo. |
| `PUT` or `PATCH` with an `If-Match` that is not a strong, quoted ETag whose decoded value is a timestamp (weak, unquoted or malformed) | `412 Precondition Failed`; nothing is sent to Etendo. |
| `PUT` or `PATCH` with an ETag of a version that is no longer current | `412 Precondition Failed`; the record is not changed. |
| `PUT` or `PATCH` with the current ETag | The update is applied and the response carries the new `ETag`. |
| `DELETE` | Does not use `If-Match`. Etendo does not check `updated` on delete today; revisit whether DELETE should require `If-Match` when it does. |

- The ETag is a strong, opaque, quoted value derived from the record's `updated`; it is issued only when `updated` is an ISO-8601 timestamp with a time zone. Clients must treat it as opaque and send it back unchanged.
- No other response carries an `ETag` header.
- `updated` stays read-only: sending it in the body returns `400 Field "updated" is not writable by the public API`. The version travels only in `If-Match`; the gateway forwards it to Etendo, which compares it with the stored record and refuses a stale write.
- After a `412`, the client reads the record again, reapplies its change and retries with the new ETag.

```http
PATCH /api/v1/sales-order/C918... HTTP/1.1
Authorization: Bearer etgo-0123456789abcdef:<64-hex-secret>
If-Match: "MjAyNi0xMC0xNVQxMDo0MjowN1o"
Content-Type: application/json

{"data":{"attributes":{"order_date":"2026-10-14"}}}
```

### 4.6 Relationships

A foreign key is a JSON:API relationship, never an attribute. A relationship appears only under `relationships`, with `type` + `id` linkage, in responses and in write bodies. The manifest (`public-api/base.v1.json`) declares each one with `relationship: { resource, cardinality, foreignKey }`; the compliance tests ([4.9](#49-automated-compliance-checks)) check every relationship of the manifest, whatever it contains.

- **Product category (foreign key).** `product.category` points to `product-category`.

```json
{ "data": { "type": "product", "id": "8F2A...",
            "attributes": { "name": "Widget" },
            "relationships": { "category": { "data": { "type": "product-category", "id": "5C1D..." },
                                             "links": { "related": "/api/v1/product-category/5C1D..." } } } } }
```

  Create a product linked to a category with a body that carries only the relationship (no `attributes`), or both; clear it with `{ "data": null }`:

```http
POST /api/v1/product HTTP/1.1
Content-Type: application/vnd.api+json

{"data":{"type":"product","attributes":{"name":"Widget"},"relationships":{"category":{"data":{"type":"product-category","id":"5C1D..."}}}}}
```

- **Master-child documents (lines).** A child resource is addressed through its master (`/api/v1/{master}/{masterId}/{child}`), for example `sales-order/{id}/lines`. The master foreign key (for example `salesOrder`) is never an attribute and is not part of the body: the gateway takes it from the URL and sends it to Etendo as `parentId`. A child resource's `type` is its own public name (`sales-order-lines`).
> **Change for integrators (V1, contact categories and taxes published).** Publishing `contact-category` and `tax` turned two existing write fields into relationships: `contacts.category` and the `tax` of order and quotation lines. Before, both were plain id attributes; now a body that sends either under `attributes` is refused with `400` (`"<field>" is a relationship`), and responses carry them under `relationships` only. Send `{ "data": { "type": "contact-category", "id": "..." } }` or `{ "data": { "type": "tax", "id": "..." } }` instead. The contact's category lookup now answers values of `type` `contact-category`.

- **Contact category (foreign key).** `contacts.category` points to `contact-category`. It is written and read under `relationships` like the product category; sending it under `attributes` is refused with `400`.
- **Tax category (foreign key).** `tax.tax_category` points to `tax-category`. Both resources are read-only, so the relationship only appears in responses.
- **Tax of a line (foreign key).** `tax` on `sales-order-lines`, `purchase-order-lines` and `sales-quotation-quotationLine` points to `tax`. It stays writable: send it under `relationships` as `{ "data": { "type": "tax", "id": "..." } }` and find the ids with `GET /api/v1/tax`. Before `tax` was published it was a plain id attribute.
- Linkage types are validated on write: a relationship whose `type` is not the related resource returns `409`.

#### 4.6.1 Relations between documents (technical debt)

V1 publishes no relation between two business documents: an integrator cannot read which shipment delivered an order line, which invoice billed it or which quotation an order came from, and cannot create one document from another. This is out of V1 by the scope agreed on 2026-11-06 (shipments, receipts and invoices are not published, see [3](#manifest-generate-base-public-api-manifestmjs-to-basev1json)) and is planned for the next quarter. The rule that decides the work is parity: a relation is published exactly as the app shows and creates it, and a relation the app does not offer is not published.

**What V1 carries today.** No relationship in `public-api/base.v1.json` points to a document, and `sales-order`, `purchase-order`, `sales-quotation` and their lines publish no quotation, shipment, receipt or invoice field. The only downstream trace is a set of read-only integer status fields with no linkage: `delivery_status` and `invoice_status` on `sales-order`, `deliv_status_purchase` and `invoice_status` on `purchase-order` (the stored computed columns `EM_ETGO_Delivery_Status`, `EM_ETGO_Invoice_Status` and `EM_ETGO_Deliv_Status_Purchase` of `C_Order`).

**Limits of the current contract.** Any document relation runs into these, in addition to its target not being published:

| Limit | Where |
|-------|-------|
| One level of nesting. Routes are `/api/v1/{resource}` and `/api/v1/{parent}/{parentId}/{child}`; a tab under a child tab (AD tab level 2, `level: subline`) is not published. This is why the order's *Line Tax* is not published (ETP-6012, see [3](#manifest-generate-base-public-api-manifestmjs-to-basev1json)). | `gateway/src/public-api/public-api.controller.ts`, `scripts/generate-base-public-api-manifest.mjs` |
| To-one only. The generator writes `cardinality: 'one'` on every relationship, and a write that sends an array as relationship `data` is refused with `400` ([4.3](#43-fields-and-fail-closed-filtering)). | `scripts/generate-base-public-api-manifest.mjs`, `gateway/src/public-api/json-api-request.ts` |
| A relationship exists only when its target is a published resource. A reference to an unpublished resource stays a plain id attribute (for example `warehouse` and `price_list` on the orders). | `scripts/generate-base-public-api-manifest.mjs` |
| The target is found by entity name. The generator matches the field's `reference` (the Java entity: `Order`, `OrderLine`, `GoodsShipmentLine`) against the `entityName` of the published resources, ignoring case and punctuation. The order resources are the entities `header` and `lines`, so a reference to `Order` or `OrderLine` would not become a relationship even with both ends published. | `scripts/generate-base-public-api-manifest.mjs` |
| One table, several resources. `C_Order` holds sales orders, purchase orders and quotations (a quotation is a `C_Order` whose target document type has `DocSubTypeSO = 'OB'`), while `relationship.resource` names one resource. The `C_Order_ID` of a sales invoice points to an order or to a quotation, and the app probes both. | `go: schemaforge/SalesQuotations.java`, `tools/app-shell/src/components/related-documents/salesRelatedDocs.js` |
| `links.related` is `/api/v1/<resource>/<id>`. For a child resource that path answers `404 Child resource must be addressed through its master`, so a line-to-line link also needs the master id. | `gateway/src/public-api/public-api.controller.ts` |
| The link columns are hidden in the windows. In `decisions.json`, `salesOrder` (header) and `salesOrderLine` (lines) of `goods-shipment`, and `salesOrder`, `salesOrderLine` and `goodsShipmentLine` of `sales-invoice`, have `visibility: system`, which the generator never publishes, even when curated ([2](#field-rules-applied-by-the-manifest-generator)). In `goods-receipt` and `purchase-invoice` the same fields are not shown by the form (`form: false` in the contract), so the window-form default does not publish them either. | `artifacts/<window>/decisions.json`, `artifacts/<window>/contract.json` |

**Relations, as stored in Etendo and as the app uses them.** The table covers every relation of the sales and purchase document flow that the app's related-documents definitions read (`tools/app-shell/src/components/related-documents/salesRelatedDocs.js`, `purchaseRelatedDocs.js` and `relatedSources.js`), plus the core match tables. Two other related-documents panels exist and are not document-to-document relations of that flow: a payment's invoices (`artifacts/payment-in/custom/RelatedDocuments.jsx`, `artifacts/payment-out/custom/RelatedDocuments.jsx`, read through the invoice's payment plan) and an amortization's assets (`artifacts/amortization/custom/RelatedDocuments.jsx`); payments are never listed as related documents of an order or an invoice. Columns and fields come from `AD_COLUMN`, `AD_FIELD`, `AD_TAB` and `AD_WINDOW`; the third column lists the field in the windows the app also has (Classic-only windows such as Business Partner Info are left out) and says when the field is not displayed or not active. Every link column lives on a header or lines table, or on a level-1 tab of the invoice, so none of them needs deeper nesting. No side of any of these relations is published in V1.

| Relation | Column | AD field (window › tab) | How the app creates and reads it |
|----------|--------|-------------------------|----------------------------------|
| Shipment or receipt line → order line | `M_InOutLine.C_OrderLine_ID` | Lines of Goods Shipment, Goods Receipt, Return Material Receipt and Return to Vendor Shipment; displayed in all four | Created by the order actions `createShipment` (`go: schemaforge/CreateShipmentHandler.java`) and `createGoodsReceipt` (`go: schemaforge/CreateGoodsReceiptHandler.java`), and by `importOrderLines` on a draft shipment or receipt (`go: schemaforge/ImportOrderLinesIntoInOutHandler.java`). Read as the movement's `linkedOrders`. |
| Shipment or receipt → order | `M_InOut.C_Order_ID` | Header of Goods Shipment, Goods Receipt and Return Material Receipt, displayed; Header of Return to Vendor Shipment, not displayed | The order lists its shipments or receipts with a criteria query on `salesOrder` (`criteriaSource` in `salesRelatedDocs.js` and `purchaseRelatedDocs.js`). The movement's `linkedOrders` is the header order plus every order its lines point to (`go: schemaforge/GoodsShipmentHeaderHandler.java`, `go: schemaforge/GoodsReceiptHeaderHandler.java`), so the header column alone does not list every order of a movement. |
| Invoice → order | `C_Invoice.C_Order_ID` | Header of Sales Invoice and Purchase Invoice; displayed | Created by `createDraftInvoice` from a sales order, a quotation or a goods shipment (`go: schemaforge/CreateDraftInvoiceHandler.java`) and by `createPurchaseInvoice` from a purchase order or a goods receipt (`go: schemaforge/CreatePurchaseInvoiceHandler.java`). The order lists its invoices through the `listInvoices` header action, which also finds invoices linked only through their lines. |
| Invoice line → order line | `C_InvoiceLine.C_OrderLine_ID` | Lines of Sales Invoice and Purchase Invoice; displayed | Created by `importOrderLines` on a draft invoice (`go: schemaforge/ImportOrderLinesIntoInvoiceHandler.java`). Read as the invoice's `linkedOrders` (`go: schemaforge/InvoiceDetailEnrichment.java`). |
| Invoice line → shipment or receipt line | `C_InvoiceLine.M_InOutLine_ID`, plus the match tables `M_MatchSI` (sales) and `M_MatchInv` (purchase) | Lines of Sales Invoice and Purchase Invoice; Matched Sales Invoices › Matched Sales Invoice and Matched Purchase Invoices › Matched Invoice; displayed in all | The link is the union of the column and the match table (`go: schemaforge/InOutInvoiceLinks.java`); on the sales side two documents are never related through a shared order line. Created by `importShipmentLines` / `importReceiptLines` on a draft invoice (`go: schemaforge/ImportInOutLinesIntoInvoiceHandler.java`), and by `importOrderLines`, which binds the invoice line to both the order line and the movement line. Read as the invoice's `linkedShipments` / `linkedReceipts` (deliveries and returns told apart by `isReturn`) and the movement's `linkedInvoices`. The app has a read-only Matched Purchase Invoices window (`artifacts/matched-purchase-invoices`). |
| Return → returned shipment or receipt line | `M_InOutLine.Canceled_InOutLine_ID` (a return line points at the line it returns) | Lines of Goods Shipment and Goods Receipt, not active; no field in Return Material Receipt or Return to Vendor Shipment | Created by `createReturn` on a goods shipment (`go: schemaforge/CreateReturnReceiptHandler.java`), `createPurchaseReturn` on a goods receipt (`go: schemaforge/CreatePurchaseReturnHandler.java`), and `importShipmentLines` / `importReceiptLines` on a draft return (`go: schemaforge/ReturnMaterialReceiptHeaderHandler.java`, `go: schemaforge/ReturnToVendorShipmentHeaderHandler.java`); all of them set the column through `NeoReturnReceiptService.createReturnLineShell`. Read as the shipment's `returnReceipts`, the receipt's `linkedReturns` and the return's `sourceShipments` / `sourceReceipts` (`go: schemaforge/ReturnShipmentUtils.java`). The credit invoice of a return (`createReturnInvoice`, read as `returnInvoices`) is linked through `C_InvoiceLine.M_InOutLine_ID` on the return's lines, the row above. |
| Rectifying invoice → origin invoice | `C_Invoice_Reverse` (`C_Invoice_ID` the rectifying invoice, `Reversed_C_Invoice_ID` the origin); line level: `C_InvoiceLine.EM_Etgo_Source_Invoiceline_ID` | Sales Invoice and Purchase Invoice › Reversed Invoices (level 1): `Reversed_C_Invoice_ID` displayed, `C_Invoice_ID` not displayed. The app does not show that tab (it is not in `secondaryTabs`). `EM_Etgo_Source_Invoiceline_ID` has no field in any window | Created by "Import from source invoice": `importOriginInvoiceLines` (`go: schemaforge/ImportOriginInvoiceLinesHandler.java`) writes one `C_Invoice_Reverse` row per origin and the source line on each new line; an `originInvoices` value sent on an invoice write is persisted by `go: schemaforge/InvoiceRectificationLinkSupport.java`. Read from `C_Invoice_Reverse` in both directions: `originInvoices`, what the invoice rectifies (`go: schemaforge/InvoiceRectificationLinkSupport.java`), and `rectifyingInvoices`, what rectifies it (`go: schemaforge/AbstractInvoiceHeaderHandler.java`). |
| Sales order → quotation | `C_Order.Quotation_ID`, `C_OrderLine.Quotationline_ID` | Header and Lines of Sales Order, displayed; the same fields in Purchase Order are not active | Set by Etendo core's `ConvertQuotationIntoOrder` (`setQuotation`, `setQuotationLine`), which the quotation's `Convertquotation` action calls (`go: schemaforge/SalesQuotationHeaderHandler.java`). The order shows its quotation; the quotation lists its orders with a criteria query on `quotation` and its invoices through `listInvoices`, and never lists shipments. |
| Matched purchase orders | `M_MatchPO` (`C_OrderLine_ID`, `M_InOutLine_ID`, `C_InvoiceLine_ID`) | Matched Purchase Orders › Matched Purchase Order; displayed | No app window (no artifact) and not read by the related-documents code, so by the parity rule it is not a candidate. |

**What supporting them takes.**

1. **Publish the targets.** The shipment, receipt and invoice windows, with their lines, have to enter `publicApiV1Entities` (a scope decision, [3](#manifest-generate-base-public-api-manifestmjs-to-basev1json)).
2. **Resolve targets by document, not by entity name.** The generator has to map `Order` and `OrderLine` to the order resources, and a `C_Order` reference whose record can be an order or a quotation needs either one relationship per target or a relationship whose `type` is taken from the record.
3. **Publish the link fields.** The `system` link fields of the sales windows need a visibility or curation decision that the generator honours; the purchase ones need `publicApi.exposed`.
4. **Line-to-line links.** `links.related` to a child has to carry its master (`/api/v1/{master}/{masterId}/{child}/{id}`), or line resources have to be addressable without one.
5. **The reverse direction is to-many and derived.** An order's shipments, receipts and invoices are the union the app computes on the server (header column, line columns, match tables, `listInvoices`). Exposing them needs to-many relationships (related links or `include`) or a documented filter, and either way it must reuse that server-side definition: a filter on `C_Order_ID` alone would miss documents linked only through their lines.
6. **Creating a document from another is a business action.** `createShipment`, `createGoodsReceipt`, `createDraftInvoice`, `createPurchaseInvoice`, `Convertquotation`, `createReturn`, `createPurchaseReturn`, `createReturnInvoice`, `importOrderLines`, `importShipmentLines`, `importReceiptLines` and `importOriginInvoiceLines` would each be a declared public action ([4.2.1](#421-business-actions)); today `complete` is the only one.
7. **Deeper nesting** is needed only for level-2 tabs such as *Line Tax*, either with two-level routes or by publishing those tabs as resources filtered by their line. No document relation listed here depends on it: the rectification link is itself a level-1 tab of the invoice (*Reversed Invoices*).

### 4.7 Content negotiation

- Responses (success and error) are `Content-Type: application/vnd.api+json`, with no media-type parameters. `204` has no body and no `Content-Type`. `/api/v1/openapi.json`, `/api` and `/docs` are not part of the resource API and keep their own types.
- `Accept` may be absent, `*/*`, `application/*`, `application/json` or `application/vnd.api+json`. `406 Not Acceptable` is returned only when no entry is acceptable, including when every `application/vnd.api+json` entry carries a media-type parameter other than `ext` or `profile`.
- A request body must be `application/vnd.api+json` or `application/json`. `415 Unsupported Media Type` is returned for another type and for `application/vnd.api+json` with a parameter other than `ext` or `profile`.
- Both checks run after authentication, so a missing key is still `401`.

### 4.8 Success and error documents and statuses

| Operation | Success |
|-----------|---------|
| `GET` collection | `200 { "data": [ ... ], "meta": { "page": { ... } }, "links": { ... } }` ([4.10](#410-list-queries-pagination-sorting-and-filtering)) |
| `GET` one | `200 { "data": { ... } }` |
| `POST` | `201 { "data": { ... } }` |
| `PUT`, `PATCH` | `200 { "data": { ... } }`; if Etendo answers `204`, `200 { "meta": { "status": "updated" } }` (JSON:API: only top-level meta, never `null`) |
| `DELETE` | `204`, empty body (whatever success status Etendo answered) |

Every failure is an error document, built from Etendo's answer when Etendo refused the request:

```json
{ "errors": [ { "status": "409", "code": "stale_record", "title": "Conflict",
                "detail": "<Etendo's message>",
                "meta": { "detail": "<Etendo's explanation>", "hint": "<what to do>" } } ] }
```

- `status` is the HTTP status as a string; `title` its standard name; `detail` is Etendo's message; `code`, `meta.hint`, `meta.detail` and `meta.field` appear when Etendo provides them. `code` is always snake_case: an Etendo code in another form (`QUOTA_EXCEEDED`, `invoiceLinesWithoutAmount`) is rewritten (`quota_exceeded`, `invoice_lines_without_amount`), and a refusal without one gets the code of its status (`bad_request`, `forbidden`, `not_found`, `conflict`, `unprocessable_entity`, `service_unavailable`...). A gateway-originated error (unknown resource, not writable, `401 Missing API key`) has the same shape without `code`.
- Statuses Etendo answers are passed through: `400`, `401`, `402` (blocked tenant: always `code: "tenant_blocked"` with a generic `detail` asking to contact the account owner or support; Etendo's reason is logged server side, never returned), `403`, `404`, `409`, `412`, `422`, `428`, `429`, and `503` (Etendo's transient `service_unavailable`: database timeout or lost connection; retrying is right). Any other upstream status (every other `5xx`, an unexpected `4xx`) becomes `502 Bad Gateway` with a generic `detail` and `meta.upstreamStatus`; Etendo's text and stack are logged server side, never returned. The one exception is Etendo's `hint`: when a failure happens after the main write committed, Etendo's `500` carries a hint ("The record may already be saved. Read it before re-sending the request."); the `502` then returns it in `meta.hint` with the `detail` "Check meta.hint before retrying." instead of "Retry later". Read the record before re-sending, or the write may be duplicated.
- A `400` caused by a query parameter carries `code: "invalid_query_parameter"` and `source.parameter` with the offending parameter ([4.10](#410-list-queries-pagination-sorting-and-filtering)).
- `429 Too Many Requests` is the per-key rate limit of the gateway itself ([4.11](#411-rate-limiting)): `code: "rate_limit_exceeded"`, `meta.retryAfter` and the `Retry-After` header.
- An unexpected gateway failure is `500` with `detail: "Unexpected error."`.
- The OpenAPI document lists these responses on every operation (`400`, `401`, `402`, `403`, `404`, `406`, `429`, `502`, `503`, plus `409`, `415` and `422` on writes; DELETE has no `415`/`422`).

### 4.9 Automated compliance checks

`gateway/test/json-api-compliance.test.ts` reads the real manifest and the generated OpenAPI and fails when: a relationship is duplicated inside `attributes`; a relationship lacks `type` + `id` linkage or points to an unknown resource; a child's master foreign key is an attribute; `id` is an attribute; a single-record response documents `data` as an array; an operation lacks its error responses; DELETE documents anything but `204`; a runtime document carries a top-level member other than `data`, `errors`, `meta`, `links`, `jsonapi`, `included`; or a relationship is writable as an attribute. `gateway/test/json-api-http.test.ts` exercises media-type negotiation, the error document, the `Content-Type`, the list query parameters through the real query parser, and the per-key rate limit (headers, 429, isolation between keys) over real HTTP; `gateway/test/json-api-query.test.ts` covers every operator, type validation and pagination links. Run with `cd gateway && npm test`.

#### Running the end-to-end suite

`gateway/e2e/` holds an end-to-end suite that drives a **running** gateway over HTTP (`node:test` plus global `fetch`). It is not part of `npm test` and not part of the deploy gate; the full CI pipelines run it unattended through `make public-api-e2e-ci` (below). One file per flow: `contacts` (with its location address, and the person-or-company rules: a person with a derived name, a company, the `400` for a company with `first_name`, a person without `last_name` and a person with `name`, the category lookup, `tax_id_key` and an invalid NIF), `product`, `sales-order` and `purchase-order` (header plus lines), and `errors` (the JSON:API error contract). Each flow creates a record, reads it, lists it, `PATCH`es it with the `If-Match` of the read, checks `412` for a stale ETag and `428` for a missing one, deletes it and checks `404` afterwards. The order flows (`gateway/e2e/support/orders.ts`, shared by both orders) then follow an integrator's flow with no id known beforehand: an order for the new contact (no payment method) is refused with `422` and stays `DR`, and an undeclared action answers `404 unknown_action`; the payment-method lookup of the contact (`payment_method` for sales, `purchase_payment_method` for purchases) and of the order list a value (an empty list fails with a message naming the missing tenant setup), `filter[search]` finds it by its label, and an undeclared lookup answers `404 unknown_lookup`; the value is set on the contact with `If-Match`; a new order inherits it; completing it answers `200` with `document_status` `CO`, a second call answers `meta.alreadyApplied`, and a `PATCH` and a `DELETE` on the completed order answer `422`. Every successful response body is also validated with Ajv against the schema of its operation in the gateway's own `/api/openapi.json`, so a drift between the document and the real answers fails the run with the path and the schema error.

```bash
export PUBLIC_API_BASE_URL=http://localhost:4399
export PUBLIC_API_KEY='<clientId>:<clientSecret>'      # sent as Authorization: Bearer <value>
export PUBLIC_API_KEY_READONLY='<clientId>:<secret>'   # optional: enables the 403 test
make public-api-e2e                                    # or: cd gateway && npm run test:e2e
```

- The key needs `public-api:read`, `public-api:write` (deletes included) and `public-api:process` (the order flows complete an order; without it the `complete` call answers `403`) over the published windows. The test tenant needs at least one warehouse (the orders select it through their warehouse lookups) and at least one active payment method (the order flows find it through the lookups; a tenant created by the onboarding has them).
- **Localhost guard.** The suite writes and deletes records, so it refuses to start (every file fails with a clear message) when the host of `PUBLIC_API_BASE_URL` is not `localhost` or `127.0.0.1`. `PUBLIC_API_E2E_ALLOW_REMOTE=1` lifts the guard; use it only against a disposable environment, never production.
- **Data hygiene.** Every record carries a per-run prefix `e2e-<timestamp>-<random>` in its name or search key. An `after` hook deletes whatever the run created, newest first, even when a test failed; a record it could not delete is printed to stderr. A completed order cannot be deleted, so a run that completes orders leaves, per order flow, the completed order and its line, and the contact (with its address) and product the order uses, which their references keep from being deleted (`409`). All of them carry the run prefix. Every complete run therefore leaves, per order flow, one completed order with its line, one contact with its address, and one product; the draft orders are deleted.
- **Rate limit.** The gateway allows 100 requests per key per 60 s by default ([4.11](#411-rate-limiting)); the client waits for `Retry-After` and retries on `429`, so a full run takes a little longer than its request count suggests. Raise `PUBLIC_API_RATE_LIMIT` on the local gateway to run faster.
- Locally, creating a contact can answer `502` when the tenant lacks the `EM_Etgo_Identifier` sequence; the failure message says so.

#### Running the suite unattended (CI)

`make public-api-e2e-ci` runs the same suite with no key prepared by hand. It needs a running NEO and an Etendo GO account (email and password) whose own environment has a warehouse and the `EM_Etgo_Identifier` sequence, which a tenant created through onboarding has. `scripts/public-api-e2e-ci.mjs` then:

1. signs in with `POST /sws/go/session`, lists `GET /sws/go/environments` and enters the one the account owns (`relationship: OWNER`, else the first) with `POST /sws/go/session/environment` (the SPA's cookie session: the session cookie, the `X-Go-CSRF` token of each answer, and the NEO's own origin as `Origin`, which the same-origin rule always allows);
2. deletes the active keys named `e2e-ci-*` that a cancelled or crashed run left behind (an owner may hold 10 active keys, [5.4](#54-limits-and-constraints)), then creates two keys through `POST /oauth2/api-keys` ([5.2](#52-endpoints)), named `e2e-ci-<run id>-full` (`public-api:read`, `public-api:write`, `public-api:process`, so business actions can run) and `e2e-ci-<run id>-readonly` (`public-api:read`), so the `403` test runs too. A `409` on create says the remaining keys belong to someone else;
3. starts the built gateway (`gateway/dist/main.js`) on a free `127.0.0.1` port against that NEO, with `PUBLIC_API_RATE_LIMIT=100000` so the throttle never slows the run, and waits for `/healthz`;
4. runs `npm run test:e2e` with `PUBLIC_API_BASE_URL`, `PUBLIC_API_KEY` and `PUBLIC_API_KEY_READONLY` set, adding a JUnit reporter through `NODE_OPTIONS`;
5. always (failure and `SIGINT`/`SIGTERM` included) stops the suite's whole process group, then the gateway, deletes both keys and closes the session, and exits with the suite's status (`1` when the setup failed, `130`/`143` when interrupted).

It prints the key ids, never a password, cookie, CSRF token or secret. The gateway and the suite get a minimal environment: `PATH`, `HOME`, the temp/locale variables, `CI`, `NODE_*`, `npm_config_*` (either case) and `PUBLIC_API_*` (minus the sign-in account), plus what the script sets for them; other CI secrets in the caller's environment do not reach them.

| Variable | Meaning |
|----------|---------|
| `NEO_BASE_URL` | NEO to test, default `http://localhost:8080/etendo`. A host other than `localhost`/`127.0.0.1` is refused unless `PUBLIC_API_E2E_ALLOW_REMOTE=1` |
| `PUBLIC_API_E2E_CREDENTIALS_FILE` | JSON `{ "email", "password" }`, the shape Playwright's onboarding setup writes to `e2e/.auth-credentials*.json` |
| `PUBLIC_API_E2E_EMAIL`, `PUBLIC_API_E2E_PASSWORD` | the account given directly instead (they win over the file) |
| `PUBLIC_API_E2E_RESULTS_DIR` | where `junit.xml` and `gateway.log` go, default `gateway/e2e-results/` (gitignored); `PUBLIC_API_E2E_JUNIT=0` skips the JUnit file |
| `PUBLIC_API_E2E_GATEWAY_PORT` | fixed gateway port instead of a free one |
| `PUBLIC_API_E2E_TIMEOUT_MINUTES` | overall limit of the run, default `30`; when it is reached the script stops the suite and the gateway, deletes the keys and exits `124` |

The gateway must be built first: `make public-api-e2e-ci-install` installs the exact published `@etendosoftware/api-gateway-core` pin from `gateway/package.json` and builds the gateway. npm requires GitHub Packages read credentials. No Core clone, `PUBLIC_API_CORE_DIR` or `PUBLIC_API_CORE_REPO` is needed. A second call with the same pin only rebuilds. See the [gateway deployment runbook](ops/public-api-gateway-deploy.md#0-published-gateway-dependency-etp-6150) for registry access and verified stable package releases.

```bash
make public-api-e2e-ci-install
PUBLIC_API_E2E_CREDENTIALS_FILE=e2e/.auth-credentials.json make public-api-e2e-ci
```

**Isolation from the Playwright integration suite.** The full pipelines run this in a lane parallel to the Playwright integration suite, on the same Tomcat: the lane builds the gateway while Playwright builds its bundle and onboards, waits until onboarding has written the credentials of its **second** account (`e2e/.auth-credentials-2.json`; `e2e/onboarding-accounts.json` asks for two; only a file newer than the lane's start counts, so a reused workspace cannot supply a previous run's account), runs the suite with them and publishes `junit.xml` plus `gateway.log`. The whole lane, the core clone and `npm install` included, is bounded at 45 minutes; the script is given the time left as `PUBLIC_API_E2E_TIMEOUT_MINUTES`, so it normally stops first and still deletes its keys. The integration specs work in the first account's tenant; the second tenant is only touched by the cross-client invitation spec, which creates users and invitations there, not the contacts, products and orders this suite writes. That spec also invites the second account into the first tenant, which is why the script enters the environment the account owns rather than simply the first one listed. A separate tenant shares no records, document sequences or warehouses with the browser specs, and every record of this suite also carries its `e2e-<timestamp>-<random>` prefix.

**When the lane runs.** A push build (for example `main` or a `mergeblock/*` cut) always runs it. A pull request build runs it only when `git diff --name-only origin/<target>...HEAD` in the repository that triggered the build touches the public API: in `etendo_schema_forge`, any path under `gateway/` or `public-api/`, `scripts/public-api-e2e-ci.mjs`, `scripts/lib/pack-gateway-core.mjs`, `package.json`, `package-lock.json` or `Makefile`; in `com.etendoerp.go`, any path that is not under `docs/` or `src-test/` and does not end in `.md`. Otherwise the lane logs `Public API E2E skipped: no public API change in this PR` and is reported as skipped, not failed. A build from any other repository, or a diff that cannot be computed, runs the lane.

### 4.10 List queries: pagination, sorting and filtering

A list (`GET /api/v1/{resource}` and `GET /api/v1/{parent}/{parentId}/{child}`) accepts only the parameters below. The gateway validates them against the manifest, translates them and sends NEO a single window (`_startRow`/`_endRow`), a `_sortBy` and one `criteria` parameter; the client never writes a NEO parameter, operator or property name. **Anything else is refused with `400`** and an error whose `source.parameter` names the parameter, so a typo never silently returns unfiltered data (fail closed). Nothing is sent to Etendo for a refused query. The same rules apply to child lists (`parentId` comes from the path and cannot be given as a query parameter).

| Parameter | Meaning | Limits |
|-----------|---------|--------|
| `page[number]` | Page to read, starting at 1 (default 1) | positive integer |
| `page[size]` | Records per page (default 50) | 1 to 100 |
| `sort` | Comma-separated public field names; a leading `-` is descending | up to 5 fields, no repeats; only readable scalar fields (not relationships: they would sort by the foreign key id) |
| `filter[<field>]=<value>` | Equals | up to 20 filters in total (each `field`+operator counts one) |
| `filter[<field>][<operator>]=<value>` | `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `contains`, `in` | see the table below |

Field names are the public names of the manifest (not internal paths) and only fields with direction `out` or `inout` can be filtered or sorted, and not those the manifest marks `queryable: false` (values an entity handler adds on read, the `inputFields`): they answer `400 invalid_query_parameter`. Send each parameter once: a repeated parameter (`filter[name]=a&filter[name]=b`) is a `400`; use `in` for a list of values.

Values are parsed against the field's data type before anything is forwarded:

| Field type | Operators | Value |
|------------|-----------|-------|
| string | `eq`, `ne`, `contains` (case-insensitive substring), `in` | text up to 255 characters, not empty |
| relationship (a foreign key such as `category`) | `eq`, `ne`, `in` | the related record id |
| integer | `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in` | integer (`-12`) |
| number | `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in` | decimal with a point (`-12.5`); no exponent, no `NaN` |
| boolean | `eq`, `ne` | `true` or `false` |
| date and date-time | `eq`, `gt`, `gte`, `lt`, `lte` | calendar date `yyyy-MM-dd` that exists (`2026-02-30` is refused) |

`contains` is case-insensitive and matches anywhere in the text; `%`, `_` and `|` are literal (NEO escapes them), but each space in the value matches any run of characters (`acme corp` matches `Acme Holding Corp`). `in` takes a comma-separated list (up to 100 values, none empty); a value cannot contain a comma. Dates are whole calendar days with no timezone: `filter[updated][gte]=2026-10-01` means from that day on, and `filter[updated]=2026-10-01` is the whole day, on date and date-time fields alike (the same day-level semantics as the Etendo grids). A timestamp with a time or an offset is refused. Date-time fields are not filterable at second precision in v1.

Examples (brackets are shown unencoded; clients may percent-encode them):

```http
GET /api/v1/contacts?page[number]=2&page[size]=25
GET /api/v1/contacts?sort=name,-search_key
GET /api/v1/contacts?filter[name][contains]=acme&filter[tax_id]=B12345678
GET /api/v1/contacts?filter[name][in]=Acme,Globex&sort=-name&page[size]=10
GET /api/v1/{resource}?filter[category]=<related-id>&filter[active]=true
GET /api/v1/{resource}?filter[updated][gte]=2026-10-01&filter[updated][lt]=2026-11-01
GET /api/v1/contacts/{id}/contacts?filter[phone][contains]=555
```

`contacts` is used above because its fields (`name`, `search_key`, `tax_id`) are published today; the OpenAPI document lists the filterable fields of every resource, with the operators each accepts.

**Sort stability.** When `sort` is given the gateway appends `id` as a tie-breaker, so records with equal keys do not move between pages. Without `sort`, the gateway sends no order: a top-level list uses NEO's default (by `id`, stable). A child list (for example `lines`) follows the document's own order (the tab's order such as the line number); NEO applies that default only when no sort is sent, so the gateway does not add `id` there, because that would replace the natural line order. Such an order can contain ties, so to page a child list reliably send an explicit `sort` that includes a unique field (the `id` tie-breaker is then added for you).

**Response.**

```json
{
  "data": [ { "type": "contacts", "id": "...", "attributes": { ... }, "links": { "self": "/api/v1/contacts/..." } } ],
  "meta": { "page": { "number": 2, "size": 25, "total": 95 } },
  "links": {
    "self":  "/api/v1/contacts?filter[name][contains]=acme&page[number]=2&page[size]=25",
    "first": "/api/v1/contacts?filter[name][contains]=acme&page[number]=1&page[size]=25",
    "prev":  "/api/v1/contacts?filter[name][contains]=acme&page[number]=1&page[size]=25",
    "next":  "/api/v1/contacts?filter[name][contains]=acme&page[number]=3&page[size]=25",
    "last":  "/api/v1/contacts?filter[name][contains]=acme&page[number]=4&page[size]=25"
  }
}
```

- `links` are root-relative, like the `links.self` of every resource, and keep the client's `filter` and `sort` parameters; `page[size]` is always explicit. `prev` and `next` are `null` when there is no such page.
- `meta.page.total` is the exact number of records matching the filters. NEO computes it with a count query (the gateway never asks it to skip the count). If NEO ever answers without a usable count, the gateway omits `meta.page.total` and `links.last` and offers `next` only while the page came back full; it never reports an estimate.
- A page beyond the last one answers `200` with `data: []`, the real `total`, and a `prev` that points at the last page. (NEO's datasource would answer its first page for such a request; the gateway turns that into the empty page.)
- A single record read has no `meta.page` and no `links` other than the resource's own.

### 4.11 Rate limiting

The gateway limits requests **per API key**: 100 requests per 60 seconds by default. The key is the `clientId` of the `Authorization: Bearer <clientId>:<clientSecret>` header, counted only after `PublicApiKeyGuard` accepted the key, so a client cannot spend another key's quota by sending its id. The window is sliding: each request counts for 60 seconds from the moment it was made, and a refused key is accepted again as soon as its oldest request leaves the window (there is no extra penalty period). All routes under `/api/v1` share one quota per key (reads, writes and actions alike, whichever handler serves them); `/api`, `/docs`, `/healthz` and the OpenAPI document are not limited.

| Header | On | Meaning |
|--------|----|---------|
| `X-RateLimit-Limit` | every response to an authenticated request, 429 included | requests allowed per window |
| `X-RateLimit-Remaining` | every such response | requests left in the current window (0 on a 429) |
| `X-RateLimit-Reset` | every such response | **seconds** until all requests counted so far have left the window, i.e. the quota is fully restored (not an epoch timestamp) |
| `Retry-After` | `429` only | seconds to wait before the next request is accepted (until the oldest counted request leaves the window) |

A request refused for a missing, malformed or invalid key is `401` without these headers and does not use any key's quota.

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/vnd.api+json
Retry-After: 23
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 23

{"errors":[{"status":"429","code":"rate_limit_exceeded","title":"Too Many Requests","detail":"Rate limit exceeded for this API key. Retry in 23 seconds.","meta":{"retryAfter":23}}]}
```

Configuration (environment of the gateway): `PUBLIC_API_RATE_LIMIT` (requests, default 100) and `PUBLIC_API_RATE_WINDOW_SECONDS` (default 60); an invalid value falls back to the default. The counters live in memory of each gateway process: with N gateway tasks the effective limit per key is up to N times the configured one until a shared store is introduced. Requests with invalid keys are not limited by this guard; limiting them (per IP) belongs to the load balancer or WAF.

---

### 4.12 Document currency, exchange rate and line prices

`sales-quotation`, `sales-order` and `purchase-order` publish the header's `currency` (`inout`, the
id of a currency) and `currency_rate` (`inout`, number, internal `eTGOCurrencyRate`): the
organization-to-document multiply rate, the one the application shows next to the currency as
"USD — 1,47" and lets the user edit with the pencil. One unit of the organization's currency is
`currency_rate` units of the document's currency. It is `1` or empty on a document in the
organization's own currency. The API applies the application's rules (Etendo enforces them, the
gateway only maps the name):

- **Recalculated** on a create, and on a write that changes `currency` or `order_date` without
  sending `currency_rate`: the tenant's conversion rate valid on `order_date`, replacing a rate set
  earlier by hand.
- **A rate sent is kept**: a write that sends a positive `currency_rate` (alone, or together with a
  new currency or date) saves it as sent, as when the user types it.
- **Kept** by a write that changes neither the currency nor the date and does not send it.
- **Back to the organization currency** sets it to `1`.
- **Locked once completed**: a write that changes `currency_rate` on a completed document is
  refused with `422` (nothing saved), whatever its currency, as in the application, where the rate
  cannot be edited once the document is processed. Sending the stored value back is not a change.
- **Refused without one** (`422`, nothing saved): a write that sends both `currency` and
  `order_date` (or an update, which knows them from the stored document) and leaves a
  foreign-currency document with an empty rate, because no conversion rate is configured for
  `order_date` and none was sent, or because the write sent `null`/`0`. Completing such a
  document is refused too.
- **Exception, a create that omits `currency` or `order_date`.** Etendo fills them after the
  record is saved, so it cannot refuse the create any more: when no rate is configured, the
  document is created (`201`) without a rate. Etendo attaches a warning to its answer, which the
  gateway does not relay. The document's next write and its completion are refused with `422`
  until it has a rate. Send both fields on create to get the refusal up front.

**Line prices in the document currency.** A line created without a price (`list_price` absent) is
priced from the document's price list, as in the application. When the document is in a foreign
currency and its price list is in the organization's currency, those prices are converted with the
document's `currency_rate` (price × rate, rounded to the currency's price precision, 2 for EUR and
USD). Every new line for a product takes the document's currency, whether its price came from the
price list or from the caller. With a rate of 1.47, a product priced 12 EUR is created at 17.64 USD, the same
line the application creates. That holds when the product's list price equals its standard price.
When they differ, the API converts each one separately and keeps the discount between them, while
the application sets both to the converted price. A `list_price` sent by the caller is taken as a
price in the document's currency and is never converted. When the document has no rate, or the
price list is in a third currency, the line takes the document's currency but keeps the price
list's prices unconverted (a foreign-currency document without a rate is normally refused, see
above). Changing the
header's `currency` or `currency_rate` later does not re-price existing lines (neither does the
application); delete and re-create a line to price it at the new rate.

## 5. API key management contract (`/oauth2/api-keys`)

Implemented in `go: oauth2/OAuth2Servlet.java` (inner class `PublicApiKeyHandlers`) with the
policy in `go: oauth2/PublicApiKeyPolicy.java`.

### 5.1 Authentication and context

- Every route authenticates through the shared `EnvironmentRequestAuthenticator` under `SurfacePolicy.NEO_DATA`, so a bearer session JWT or the SPA cookie session is accepted.
- Client, organization, user and role are derived from the session, never from the request. Creation reads only `name` and `capabilities` from the body.
- `403 Active session context required` is returned when the user, role, client or organization is inactive or the role does not belong to the client. `403 Active role is not available in this tenant` is returned when the role assignment or the role's organization check fails.
- No administrator role is required by these routes; any authenticated, active role may call them.
- The routes accept a cookie session or a bearer session JWT. An OAuth2 `client_credentials` access token is not accepted on these routes (`401`); a client must authenticate with a session.
- A cookie session on an unsafe method (`POST`, `PUT`, `DELETE`) must come from an allowed `Origin` (or `Referer`) and carry a valid `X-Go-CSRF` header; a failure returns `403` with error `access_denied`.
- With a cookie session, an `X-Go-Account` header naming a different account than the session's returns `403` `access_denied` on any method.
- A dead or unknown session cookie is final: the request is refused with `401` and a bearer token sent alongside it is not tried.
- A bearer session JWT is accepted only while the legacy bearer switch (`GoLegacyBearer`) is enabled; when it is off, the request is refused with `401`.
- A commercially blocked tenant is refused with `402` (surface policy `SurfacePolicy.NEO_DATA` requires commercial access).
- CORS allows `GET, POST, PUT, DELETE, OPTIONS`.

### 5.2 Endpoints

| Method | Path | Success |
|--------|------|---------|
| GET | `/oauth2/api-keys` (also with trailing `/`) | 200 `{ "apiKeys": [ key, ... ] }`, ordered by name |
| POST | `/oauth2/api-keys` | 201 `key` plus `clientSecret` |
| GET | `/oauth2/api-keys/{id}` | 200 `key` |
| PUT | `/oauth2/api-keys/{id}` | 200 |
| DELETE | `/oauth2/api-keys/{id}` | 200 `{ "deleted": true, "id": "..." }` |
| POST | `/oauth2/api-keys/{id}/rotate` | 200 with `clientSecret` and `tokensRevoked` |
| POST | `/oauth2/api-keys/{id}/revoke-tokens` | 200 `{ "revoked": true, "id": "...", "tokensRevoked": n }` |

`PUT` on `.../rotate` or `.../revoke-tokens` returns `405 Use POST for this API-key action`;
`GET` on those paths returns `404` with error `invalid_request` and description `Unknown endpoint: <path>`.

The `key` object is `{ "id", "name", "clientId", "capabilities": [...], "isActive" }`. It is the
body of the list items, get, create, update and rotate responses (rotate adds `clientSecret` and
`tokensRevoked`). The internal scopes, owner marker, user and role identifiers and the secret
hash are never serialized.

Create request:

```http
POST /oauth2/api-keys
Authorization: Bearer <session-jwt>
Content-Type: application/json

{"name":"Production integration","capabilities":["public-api:read"]}
```

Create response (201). `clientSecret` is present only on create and rotate:

```json
{ "id": "...", "name": "Production integration", "clientId": "etgo-0123456789abcdef",
  "capabilities": ["public-api:read"], "isActive": true,
  "clientSecret": "<64 hex characters, shown once>" }
```

- `clientId` is `etgo-` followed by 16 hex characters; the secret is 32 random bytes rendered as 64 hex characters (`go: oauth2/OAuth2Utils.java`). The gateway credential is `<clientId>:<clientSecret>`.
- `PUT` accepts only `name` and `isActive` (`isActive` is read as a boolean flag); capabilities cannot be changed after creation. When the resulting `isActive` is `true` and the new name differs from the current one by exact (case-sensitive) comparison, the name is checked against the owner's active keys case-insensitively, including the key itself; a duplicate returns `409 An active public API key with this name already exists`. A case-only rename of an active key therefore returns `409`.
- `DELETE` removes the key's tokens and then the key. An id that the caller does not own, or that no longer exists, returns `200 {"deleted": false, "id": "..."}`.
- `rotate` replaces the secret hash and marks the key's non-revoked tokens as revoked; `tokensRevoked` is their count. It works on inactive keys and does not change `isActive`.
- `revoke-tokens` marks the key's non-revoked tokens as revoked and leaves the key and its secret valid.

### 5.3 Capabilities and internal mapping

| Public capability | Internal scope | Legacy alias still accepted |
|-------------------|----------------|-----------------------------|
| `public-api:read` | `etendo:read` | `neo:read` |
| `public-api:write` | `etendo:write` | `neo:write` |
| `public-api:process` | `etendo:process` | `neo:process` |

- Only these three values are accepted. A wildcard, an empty or null entry, or an unknown value returns `400`. A missing `capabilities` array returns `400 capabilities is required`; an empty one returns `400 at least one public capability is required`.
- `public-api:write` requires an active window-access row for the role with `editableField = true`, whose client is the tenant's client or `'0'` and whose organization is the tenant's organization or `'0'`. `public-api:process` requires an active process-access row for the role with the same client and organization conditions. Otherwise `400 public-api:<x> is not allowed for the active role`.
- The stored scope string is `neo:public-api-key <etendo scopes> neo:public-api-owner-org:<orgId>`. The two `neo:public-api-*` entries are private markers; they are never returned and never accepted from callers.
- A key created with legacy `neo:*` scopes lists the corresponding `public-api:*` capabilities.
- Responses list only the capabilities that map to the three public names; a stored wildcard scope (`etendo:*`, `neo:*`) maps to none, so a key holding only a wildcard reports no capabilities.

### 5.4 Limits and constraints

| Rule | Value |
|------|-------|
| Active keys per (client, organization, user) | 10. Creating an 11th returns `409 The maximum number of active public API keys is 10`. |
| Names | Required; trimmed; internal whitespace collapsed; not blank; at most 120 characters (`400` otherwise). |
| Name uniqueness | Among active keys of the same owner, case-insensitive. Duplicate returns `409 An active public API key with this name already exists`. |
| Access token lifetime issued by the `client_credentials` grant | 3600 seconds |

### 5.5 One-time secret and storage

- The secret is returned only by create and rotate. List, get, update, delete and revoke payloads never contain it.
- The secret is stored as a salted SHA-256 hash in the form `hexSalt:hexHash`; tokens are stored as hashes.
- Successful JSON responses carry `Cache-Control: no-store` and `Pragma: no-cache`. Error responses set only the status and the JSON content type.
- The audit log line contains only the event name, key id, user id, client id and organization id.

### 5.6 Security behavior

| Case | Behavior |
|------|----------|
| Key id owned by another user, organization or tenant | Treated as unknown: GET, PUT, rotate and revoke-tokens return `404` with error `not_found` and description `API key not found`; DELETE returns `200 {"deleted": false}`. Ownership is matched on id, owner-organization marker, user and public-key marker. |
| Missing or invalid authentication | `401` with error code `access_denied` |
| Inactive or unauthorized role | `403` |
| Inactive key | Cannot obtain tokens (`401 invalid_client`); its already-issued tokens are refused |
| Deleted key | Key and tokens are removed |
| Wrong secret or unknown client at the token endpoint | `401 invalid_client`, description `Client authentication failed` (same for both) |
| Requested scope outside the key's scopes | `400 invalid_scope` |
| Revoked tokens | Refused on use; the key itself remains valid and can mint new tokens |
| Error body | RFC 6749 style: `{ "error": "<code>", "error_description": "<text>" }`, not the NEO `{ "error": { "message": ... } }` envelope |

---

## 6. UI exposure

| Item | Value |
|------|-------|
| Feature flag key | `public-api-keys` (constant `PUBLIC_API_KEYS`, `tools/app-shell/src/lib/flags/flag-keys.js`) |
| Default in code | `false`. An unknown key also resolves to `false`. |
| Nature | Frontend-only visual gate; not an authorization boundary. No backend feature-flag entry exists for this key. |
| Value management | Provided by the feature-flag provider (OpenFeature with ConfigCat as the remote control plane; local override through `VITE_FEATURE_FLAGS`). The flag is managed in ConfigCat. |
| Route | `/api-keys`, registered unconditionally (`tools/app-shell/src/runtime-routes.jsx`), so a deep link always loads the page component |
| Page self-gate | `ApiKeysPage` renders nothing unless the flag is on, `capabilities.isAdminOrClientAdmin === true` and `capabilities.publicApiKeyManagement === true` |
| Menu item | `api-keys`, label "Public API Keys", with `featureFlag: "public-api-keys"` and `capability: "isAdminOrClientAdmin"` (`tools/app-shell/src/menu.json`) |
| Command palette | The item is filtered by `featureFlag` and by `capabilities[capability] === true` (`tools/app-shell/src/components/CommandPalette.jsx`) |
| Capability `publicApiKeyManagement` | Returned as `true` by the `SFWindowAccessMap` webhook whenever the request's role resolves, whatever that role is. When no role resolves, `capabilities` is an empty object (`go: schemaforge/webhooks/SFWindowAccessMap.java`) |
| Capability `isAdminOrClientAdmin` | `true` only for admin and client-admin roles (same webhook) |

Net effect: the backend capability is `true` for every role, but the UI also requires
`isAdminOrClientAdmin`, so the page is visible to admin and client-admin users when the flag is
on. The credential API in [section 5](#5-api-key-management-contract-oauth2api-keys) does not
require an administrator role and is not affected by the flag.

---

## 7. OpenAPI sources and endpoint matrix

Two independent OpenAPI documents exist; neither contains the other's routes.

The gateway document lists, on every operation, the JSON:API error responses of [4.8](#48-success-and-error-documents-and-statuses) (`application/vnd.api+json` and `application/json`), documents `DELETE` as `204`, and describes request bodies as a JSON:API document with a required `data` member and optional `attributes`/`relationships`. A write body lists only writable fields (`in`/`inout`) and marks under `required` the fields declared `publicApi.required`; a response lists only readable ones (`out`/`inout`). Every operation references the security scheme `bearerAuth` (`http` bearer, format `clientId:clientSecret`). The `/api` page loads Scalar `@scalar/api-reference@1.74.0` from jsDelivr, pinned with a `sha384` integrity hash: upgrading it means changing the URL and the hash together in `gateway/src/main.ts`. `ETag`, `If-Match`, `412` and `428` appear in it only once ETP-5766 is merged ([4.5](#45-optimistic-concurrency-etag-and-if-match)).

| | Etendo-side document | Gateway document |
|---|---|---|
| Generated by | `NeoOpenAPIEndpoint` (`go: schemaforge/NeoOpenAPIEndpoint.java`), a class implementing the `OpenAPIEndpoint` interface of the `com.etendoerp.openapi` module | `@nestjs/swagger` `SwaggerModule.createDocument`, after which `document.paths` is replaced by `buildPerEntityOpenApiPaths(schema)` (`gateway/src/main.ts`, `gateway/src/openapi/build-per-entity-paths.ts`) |
| Built from | Active `ETGO_SF_SPEC` rows (window, process, report), discovery endpoints and the API-key paths | The entities of `public-api/base.v1.json` |
| Tag filter | `?tag=` accepts `Etendo` and the legacy `EtendoGo` | not applicable |
| Served at | Not covered by this document | Gateway: `GET /api/openapi.json` and `GET /api/v1/openapi.json` (same document); Scalar documentation page at `/api` and `/docs`; `GET /healthz` |
| Caching (gateway) | not applicable | Both routes send `Cache-Control: no-cache`: a client may keep the document but must revalidate it (with the `ETag` Express sends) before reuse |
| Authentication to read (gateway) | not applicable | None: these routes are registered on the HTTP adapter outside `PublicApiKeyGuard` |

### Endpoint matrix

| Route | In the Etendo document | In the gateway document | Implemented in |
|-------|:----------------------:|:-----------------------:|----------------|
| `/oauth2/api-keys` (GET, POST) | Yes | No | `OAuth2Servlet` |
| `/oauth2/api-keys/{id}` (GET, PUT, DELETE) | Yes | No | `OAuth2Servlet` |
| `/oauth2/api-keys/{id}/rotate` (POST) | Yes | No | `OAuth2Servlet` |
| `/oauth2/api-keys/{id}/revoke-tokens` (POST) | Yes | No | `OAuth2Servlet` |
| `/sws/neo/{spec}/{entity}` and sub-routes | Yes, per active spec | No | `NeoServlet` |
| `/api/v1/{resource}` and nested child routes | No | Yes, per manifest entity | `gateway/` |
| `/api/openapi.json`, `/api/v1/openapi.json`, `/api`, `/docs`, `/healthz` | No | No (infrastructure routes, not document paths) | `gateway/src/main.ts` |

`/oauth2/api-keys` in the Etendo document (`NeoOpenAPIEndpoint.addPublicApiKeyPaths`):

- Four path items holding seven operations: the base path (GET, POST), `{base}/{id}` (GET, PUT, DELETE), `{base}/{id}/rotate` (POST) and `{base}/{id}/revoke-tokens` (POST).
- The base path is read from the configuration property `etgo.public.api.keys.path` or the environment variable `ETGO_PUBLIC_API_KEYS_PATH`, default `/oauth2/api-keys`.
- Create request schema: `name` (maximum length 120) and `capabilities` (enum of the three public capabilities). Update request schema: `name` and `isActive`.
- The `clientSecret` property is marked write-only and appears only on the create and rotate responses.

The gateway document's introduction shows `POST /oauth2/api-keys` in a `curl` example for
obtaining a key; that endpoint is not listed among the document's `paths`.

For versioned resources ([4.5](#45-optimistic-concurrency-etag-and-if-match)) the gateway document
also declares:

- the response header `ETag` on item `GET`, collection `POST`, and item `PUT` and `PATCH`;
- a required `If-Match` header parameter and the responses `412` and `428` on item `PUT` and `PATCH`;
- a `meta.etag` property in the resource schema.

The gateway document is OpenAPI 3.0, so it marks values that can be null with `nullable: true`
(`gateway/src/openapi/build-per-entity-paths.ts`):

- every attribute of a **response** resource is nullable, because Etendo answers an empty value as
  `null` (a product just created has `"sale_price": null`, `"stock": null`); an attribute with an
  `enum` also lists `null` in it;
- the `data` of every to-one relationship is nullable on responses (`{ "data": null }` for an empty
  link) and on requests (`{ "data": null }` clears the link);
- **request** attributes keep their plain type: sending `null` to clear an attribute is not part of
  the contract;
- the resource `id` is never nullable;
- the pagination links `prev` and `next` of a list are nullable.

---

## 8. Authentication and token flow

```
integrator                gateway (Nest)                     Etendo (com.etendoerp.go)
    | Bearer id:secret         |                                      |
    |------------------------->| PublicApiKeyGuard                    |
    |                          |-- POST /oauth2/token --------------->| OAuth2Servlet client_credentials grant
    |                          |   grant_type=client_credentials      |   verify secret, intersect scopes,
    |                          |   client_id, client_secret           |   store token hash, expires_in=3600
    |                          |<-- { access_token (opaque), expires_in, refresh_token, scope }
    |                          | GET/POST ... /sws/neo/{spec}/{entity}|
    |                          |-- Authorization: Bearer <opaque> --->| NeoServlet -> NeoAuthenticator
    |                          |                                      |   -> EnvironmentRequestAuthenticator
    |<-- JSON:API response ----|                                      |   -> OAuth2Filter.validateToken -> OBContext
```

| Step | Behavior |
|------|----------|
| `/oauth2/token` request | Accepts a form-encoded body or, when the content type is `application/json`, a JSON body. A `grant_type` other than `client_credentials`, `authorization_code` or `refresh_token` returns `400 unsupported_grant_type`. |
| `client_credentials` grant | Requires `client_id` and `client_secret` (`400 invalid_request` otherwise). Unknown client or wrong secret returns `401 invalid_client`. An optional `scope` must be a subset of the key's scopes, otherwise `400 invalid_scope`; without `scope`, all the key's valid scopes are granted. The response contains `access_token` (64 hex characters, opaque), `token_type` (`bearer`, lowercase), `expires_in` (3600), `refresh_token` and `scope`. (`go: oauth2/OAuth2Servlet.java`) |
| Issued scopes | The private `neo:public-api-*` markers are not valid scopes and are not included in the issued scope. |
| Token validation | Tokens are stored hashed. `OAuth2Filter.validateToken` looks the hash up and rejects unknown, revoked and expired tokens and tokens of an inactive client. Effective scopes are the token's scopes, otherwise the client's. (`go: oauth2/OAuth2Filter.java`) |
| `/sws/neo/*` authentication | `NeoAuthenticator` delegates to `EnvironmentRequestAuthenticator` under `SurfacePolicy.NEO_API`; the OAuth2 path calls `OAuth2Filter.validateToken` (`go: schemaforge/NeoAuthenticator.java`, `go: auth/EnvironmentRequestAuthenticator.java`). |
| Scope check | `GET` and `HEAD` require `etendo:read`; every other method requires `etendo:write`. `neo:*` aliases and `etendo:*` are honored, and a token holding the wildcard `etendo:*` or `neo:*` satisfies any required scope. A failed check is refused as unauthenticated (HTTP 401). |
| Consequence | A key with only `public-api:write` cannot perform `GET` requests. |
| Commercial access | A tenant whose commercial access is not allowed is refused with `402` by the shared authenticator. |

---

## 9. Operational notes

- The gateway Docker image bundles `public-api/` and `gateway/public`, listens on port 4300 and runs as the `node` user (`gateway/Dockerfile`).
- The image builds `@etendosoftware/api-gateway-core` from `.schema_forge_core/packages/api-gateway-core`, packs it as the tarball `etendosoftware-api-gateway-core-0.1.0.tgz` and installs that tarball, so the gateway is compiled against the core source present at build time.
- `make generate-base-public-api-manifest` regenerates and validates the manifest.

---

## 10. Validation checklist

Testable statements derived from this document, each linked to its section.

### Field selection and generation ([2](#2-field-selection-publicapi-curation-and-window-form-default), [3](#3-generation-chain))
- [ ] A curated entity publishes only its fields with `publicApi.exposed === true` ([2](#2-field-selection-publicapi-curation-and-window-form-default))
- [ ] A non-curated entity publishes its window form fields (`form` not `false`, visibility not `system` or `discarded`) and no grid-only field ([2](#default-exposure-window-form))
- [ ] The manifest publishes exactly the sixteen V1 resources listed in `policy.allowedResources`, including only address/contact-person children of contacts and read-only product costs, taxes, tax categories and conversion rates ([3](#manifest-generate-base-public-api-manifestmjs-to-basev1json))
- [ ] An allowlisted window is published whatever its category; a window outside the allowlist is not, whatever its category ([3](#manifest-generate-base-public-api-manifestmjs-to-basev1json))
- [ ] A window renamed in `publicResourceNames` is published under its public name and keeps its `specName` for NEO; relationships and lookup types that point to it use the public name ([3](#manifest-generate-base-public-api-manifestmjs-to-basev1json))
- [ ] No field in `policy.excludedFields` appears in the manifest, curated or derived ([2](#default-exposure-window-form))
- [ ] The manifest declares `policy.fieldSelection` `curated-publicApi-else-window-form` and lists `policy.excludedFields` ([2](#2-field-selection-publicapi-curation-and-window-form-default))
- [ ] Fields with `visibility` `system` or `discarded` are excluded even when exposed ([2](#field-rules-applied-by-the-manifest-generator))
- [ ] A public name collision makes the generator throw ([2](#field-rules-applied-by-the-manifest-generator))
- [ ] A `publicApi.type` or `publicApi.handlerId` key in a curation makes the generator throw, naming the field ([2](#2-field-selection-publicapi-curation-and-window-form-default))
- [ ] Every manifest resource has an `id` field with internal path `id`; `updated` (read-only) is present only when the entity's raw schema has an `updated` field ([2](#field-rules-applied-by-the-manifest-generator))
- [ ] `amount`, `decimal`, `price`, `quantity` and `number` fields are declared `number`/`double`; `dateTime` and `datetime` are `string`/`date-time`; ids, codes and text are `string` ([2](#field-rules-applied-by-the-manifest-generator))
- [ ] A curated `id` keeps its curated direction and gets internal path `id` ([2](#field-rules-applied-by-the-manifest-generator))
- [ ] Field `direction` is `inout` only for editable fields of an entity with a write endpoint ([2](#field-rules-applied-by-the-manifest-generator))
- [ ] The public name derivation matches the table, including the override table, the `pO` to `purchase` rule and the generic snake_case rule ([2](#name-derivation))
- [ ] `make generate-base-public-api-manifest` produces a manifest that passes the validator ([3](#manifest-generate-base-public-api-manifestmjs-to-basev1json))
- [ ] `document`, `project`, `uom`, the `Bank Account` child tab and tabs under a child tab (`subline`) are not published ([3](#manifest-generate-base-public-api-manifestmjs-to-basev1json))
- [ ] A resource without any writable field exposes only `GET` and `LIST`, and every resource that accepts writes publishes `updated` ([3](#manifest-generate-base-public-api-manifestmjs-to-basev1json))
- [ ] No published functional text cites `ETP-<number>` or Jira ([3](#manifest-generate-base-public-api-manifestmjs-to-basev1json))
- [ ] Generation fails, naming the file, when a published window has no `schema-raw.json` ([3](#manifest-generate-base-public-api-manifestmjs-to-basev1json))
- [ ] The gateway reads `PUBLIC_API_SCHEMA_PATH`, defaulting to `../public-api/base.v1.json` ([3](#manifest-generate-base-public-api-manifestmjs-to-basev1json))

### Resource API ([4](#4-public-resource-contract-apiv1))
- [ ] Missing, malformed and invalid credentials return `401` with the three messages; `bearer` in lowercase and a header without whitespace after `Bearer` return `401 Missing API key` ([4.1](#41-authentication-publicapikeyguard))
- [ ] Responses contain only manifest fields, under their public names ([4.3](#43-fields-and-fail-closed-filtering))
- [ ] A write with an unknown or read-only field returns `400` ([4.3](#43-fields-and-fail-closed-filtering))
- [ ] A relationship key without write direction returns `400` ([4.3](#43-fields-and-fail-closed-filtering))
- [ ] Unknown resource, unknown child, operation not exposed and child at top level return `404` with the documented message texts ([4.2](#42-routes))
- [ ] Child routes forward `parentId` upstream, and POST sets it in the body ([4.2](#42-routes))
- [ ] `GET /api/v1/contacts/{id}` calls `/sws/neo/contacts/businessPartner/{id}` ([4.2](#42-routes))
- [ ] Flat and JSON:API request bodies are both accepted; a JSON:API body with only `relationships` (no `attributes`) is accepted ([4.3](#43-fields-and-fail-closed-filtering))
- [ ] A relationship sent as an attribute returns `400`; a wrong `type` or a different `id` returns `409` ([4.3](#43-fields-and-fail-closed-filtering), [4.6](#46-relationships))
- [ ] Every relationship in the manifest has `cardinality` `one`, none points to a business document (order, quotation, shipment, receipt, invoice), and no order or quotation resource publishes its quotation, shipment, receipt or invoice link ([4.6.1](#461-relations-between-documents-technical-debt))
- [ ] A single-record `GET`, `POST`, `PUT` and `PATCH` return `data` as one object; a collection returns an array; an empty read is `404`; an empty write answer, or several records, is `502` ([4.3](#43-fields-and-fail-closed-filtering))
- [ ] Responses are `application/vnd.api+json` without parameters; `Accept` that excludes JSON returns `406`; an unsupported body type returns `415` ([4.7](#47-content-negotiation))
- [ ] A list query with an unknown parameter, field, operator or invalid value returns `400` with `source.parameter`; `page[size]` above 100 is refused ([4.10](#410-list-queries-pagination-sorting-and-filtering))
- [ ] Every authenticated response carries `X-RateLimit-Limit/Remaining/Reset`; the 101st request in a window returns `429` with `Retry-After` ([4.11](#411-rate-limiting))
- [ ] Etendo's `400`, `401`, `403`, `404`, `409`, `422` reach the integrator with Etendo's message and a snake_case `code`; `402` is always `tenant_blocked` with a generic message; `503` passes through; other `5xx` return `502` with no Etendo internals (only `meta.hint`, when Etendo sends one) ([4.8](#48-success-and-error-documents-and-statuses))
- [ ] `DELETE` answers `204` with no body, as the OpenAPI documents ([4.8](#48-success-and-error-documents-and-statuses))
- [ ] Every operation of the OpenAPI document lists its error responses ([4.8](#48-success-and-error-documents-and-statuses))
- [ ] `cd gateway && npm test` passes, including the compliance checks ([4.9](#49-automated-compliance-checks))
- [ ] Response resources: `id` is removed from `attributes`; relationship fields present upstream appear under `relationships` with `data` and `links.related`, absent ones are omitted ([4.3](#43-fields-and-fail-closed-filtering))
- [ ] Relationship id resolution: object value uses `id`, else `identifier`, else `_id`; scalar value is the id; null or an object with none of them gives `data: null` without `links`; ids in links are URL-encoded ([4.3](#43-fields-and-fail-closed-filtering))
- [ ] `links.self` is present only when an id exists ([4.3](#43-fields-and-fail-closed-filtering))
- [ ] A write with `relationships.<field>.data` `{ type, id }` sets the field's internal path; `{ data: null }` clears it; a relationship without `data` returns `400` ([4.3](#43-fields-and-fail-closed-filtering))
- [ ] On a versioned resource, a single-record `GET`, `POST`, `PUT` and `PATCH` return an `ETag` header equal to `meta.etag`, and list items carry `meta.etag` ([4.5](#45-optimistic-concurrency-etag-and-if-match))
- [ ] `PUT` or `PATCH` without `If-Match`, or with `*`, returns `428` ([4.5](#45-optimistic-concurrency-etag-and-if-match))
- [ ] `PUT` or `PATCH` with a stale ETag returns `412` and leaves the record unchanged; with a malformed one returns `412`, never `500` ([4.5](#45-optimistic-concurrency-etag-and-if-match))
- [ ] `PUT` or `PATCH` with the current ETag succeeds and returns an `ETag` equal to the updated record's `meta.etag` ([4.5](#45-optimistic-concurrency-etag-and-if-match))
- [ ] Sending `updated` in a write body returns `400` ([4.5](#45-optimistic-concurrency-etag-and-if-match))
- [ ] `DELETE` succeeds without `If-Match` ([4.5](#45-optimistic-concurrency-etag-and-if-match))
- [ ] A `PATCH` that changes `currency_rate` on a completed order answers `422` and leaves the rate unchanged, also on an order in the organization's currency ([4.12](#412-document-currency-exchange-rate-and-line-prices))
- [ ] On a foreign-currency order, a line created without `list_price` is priced from the price list converted by the header's `currency_rate`, in the order's currency; a `list_price` sent is kept as sent ([4.12](#412-document-currency-exchange-rate-and-line-prices))
- [ ] `currency_rate` sent with a currency change is kept; a currency or `order_date` change without it recalculates it; a write that sends `currency` and `order_date` (or an update) leaving a foreign-currency order with no rate is refused with `422`; a create omitting either is saved without a rate and its next write is refused ([4.12](#412-document-currency-exchange-rate-and-line-prices))
- [ ] `GET /api/v1/{resource}/lookups/{field}` of a declared lookup calls `/sws/neo/{spec}/{entity}/selectors/{selector}` with `limit`, `offset`, `q` and only the manifest's fixed context, and answers `data` items of the lookup `type` with `attributes.label` plus `meta.page` and `links` ([4.2.2](#422-lookups))
- [ ] A lookup with any parameter other than `filter[search]`, `page[number]`, `page[size]` returns `400`; an undeclared lookup returns `404 unknown_lookup`; neither reaches Etendo ([4.2.2](#422-lookups))
- [ ] A lookup Etendo answers with `404` returns `502`; a `403` passes through; a `401` evicts the cached token ([4.2.2](#422-lookups))
- [ ] `publicApi.lookup` on a child resource, on an unpublished field or on a field without a reference makes the generator throw; a child path segment `lookups` is refused ([4.2.2](#422-lookups))
- [ ] A published string field holding an AD list carries `dataType.enum` and `enumLabels`, and the OpenAPI document lists the codes under `enum`, with their labels as `x-enumDescriptions` and in the description ([Field rules](#field-rules-applied-by-the-manifest-generator))
- [ ] `contacts` publishes `is_person`, `first_name`, `last_name`, `tax_id_key` (enum) and `category` (lookup); no person-or-company field is `required`, and their descriptions state the rule ([4.3](#43-fields-and-fail-closed-filtering))
- [ ] `contacts` publishes `is_customer` and `is_vendor` as writable booleans, so a contact created through the API can be used on a purchase order ([4.3](#43-fields-and-fail-closed-filtering))

### Key management ([5](#5-api-key-management-contract-oauth2api-keys))
- [ ] Update and rotate responses contain the `key` object fields (`id`, `name`, `clientId`, `capabilities`, `isActive`); rotate adds `clientSecret` and `tokensRevoked` ([5.2](#52-endpoints))
- [ ] `PUT` with a case-only rename of an active key returns `409` ([5.2](#52-endpoints))
- [ ] `GET` on `.../rotate` and `.../revoke-tokens` returns `404 invalid_request`; `PUT` returns `405` ([5.2](#52-endpoints))
- [ ] Create returns 201 with the secret once and a `clientId` of the form `etgo-` plus 16 hex characters ([5.2](#52-endpoints))
- [ ] List, get, update, delete and revoke payloads never contain the secret ([5.5](#55-one-time-secret-and-storage))
- [ ] Identity fields in the create body are ignored ([5.1](#51-authentication-and-context))
- [ ] Unknown, wildcard, empty, null and missing capabilities return `400` ([5.3](#53-capabilities-and-internal-mapping))
- [ ] `public-api:write` requires an active window access with `editableField` for client (tenant or `'0'`) and organization (tenant or `'0'`); `public-api:process` requires an active process access with the same conditions; otherwise `400` ([5.3](#53-capabilities-and-internal-mapping))
- [ ] A key holding only a wildcard scope reports no capabilities in list responses ([5.3](#53-capabilities-and-internal-mapping))
- [ ] Name rules: blank, longer than 120, whitespace collapse, case-insensitive duplicate returns `409` ([5.4](#54-limits-and-constraints))
- [ ] The 11th active key returns `409` ([5.4](#54-limits-and-constraints))
- [ ] `PUT` changes only `name` and `isActive` ([5.2](#52-endpoints))
- [ ] Rotate returns a new secret and `tokensRevoked`; the old secret is rejected and the new one accepted ([5.2](#52-endpoints))
- [ ] Revoke-tokens refuses the key's existing tokens while the key still mints new ones ([5.6](#56-security-behavior))
- [ ] Delete of an owned key returns `deleted: true`; a non-owned or missing id returns `deleted: false` ([5.2](#52-endpoints))
- [ ] Another user's, organization's or tenant's key returns `404` (DELETE: `deleted: false`) ([5.6](#56-security-behavior))
- [ ] Unauthenticated returns `401`; an inactive or unauthorized role returns `403` ([5.1](#51-authentication-and-context))
- [ ] Error bodies are `{ "error", "error_description" }` ([5.6](#56-security-behavior))
- [ ] A key with legacy `neo:*` scopes lists the matching `public-api:*` capabilities ([5.3](#53-capabilities-and-internal-mapping))
- [ ] Successful JSON responses carry `Cache-Control: no-store` and `Pragma: no-cache`; error responses do not set them ([5.5](#55-one-time-secret-and-storage))
- [ ] A client-credentials access token on `/oauth2/api-keys` returns `401` ([5.1](#51-authentication-and-context))
- [ ] A cookie-session `POST`, `PUT` or `DELETE` without a valid `X-Go-CSRF` header, or from a disallowed `Origin`, returns `403 access_denied` ([5.1](#51-authentication-and-context))
- [ ] A cookie session with an `X-Go-Account` naming another account returns `403` on any method ([5.1](#51-authentication-and-context))
- [ ] A dead session cookie returns `401` even when a valid bearer token is also sent ([5.1](#51-authentication-and-context))
- [ ] A commercially blocked tenant receives `402` with code `tenant_blocked` and no internal reason on the key routes ([5.1](#51-authentication-and-context))
- [ ] With the legacy bearer switch off, a bearer session JWT returns `401` ([5.1](#51-authentication-and-context))

### Authentication and token flow ([8](#8-authentication-and-token-flow))
- [ ] `client_credentials` success payload, `expires_in` of 3600 and `token_type` `bearer`; form and JSON bodies both accepted; an unsupported `grant_type` returns `400 unsupported_grant_type` ([8](#8-authentication-and-token-flow))
- [ ] A token with `etendo:*` or `neo:*` passes both the read and the write scope checks ([8](#8-authentication-and-token-flow))
- [ ] Unknown client and wrong secret return `401 invalid_client` ([5.6](#56-security-behavior))
- [ ] An inactive key cannot mint tokens, and its issued tokens are refused ([5.6](#56-security-behavior))
- [ ] A `read`-only key can `GET` and is refused on `POST` with `401` ([8](#8-authentication-and-token-flow))
- [ ] A `write`-only key is refused on `GET` ([8](#8-authentication-and-token-flow))
- [ ] A requested scope outside the key's scopes returns `400 invalid_scope` ([5.6](#56-security-behavior))

### UI ([6](#6-ui-exposure))
- [ ] The flag defaults to `false`; menu item and palette entry are hidden ([6](#6-ui-exposure))
- [ ] Flag on with a non-admin role hides the item; with an admin role shows it ([6](#6-ui-exposure))
- [ ] `/api-keys` with the flag off renders nothing ([6](#6-ui-exposure))
- [ ] `SFWindowAccessMap` returns `publicApiKeyManagement: true` whenever the role resolves, and an empty `capabilities` object when it does not ([6](#6-ui-exposure))
- [ ] The flag being off does not disable `/oauth2/api-keys` ([1](#1-overview))

### OpenAPI ([7](#7-openapi-sources-and-endpoint-matrix))
- [ ] The Etendo document contains four `/oauth2/api-keys` path items holding seven operations ([7](#7-openapi-sources-and-endpoint-matrix))
- [ ] The gateway document contains no `/oauth2/*` paths ([7](#7-openapi-sources-and-endpoint-matrix))
- [ ] `/api/openapi.json` and `/api/v1/openapi.json` return the same document; only the latter is `no-store` ([7](#7-openapi-sources-and-endpoint-matrix))
- [ ] `/api`, `/docs`, `/healthz` and the two OpenAPI routes need no key ([7](#7-openapi-sources-and-endpoint-matrix))
- [ ] Every manifest resource and operation appears as a gateway path ([7](#7-openapi-sources-and-endpoint-matrix))
- [ ] For versioned resources the gateway document declares the `ETag` response header, the required `If-Match` parameter with `412` and `428` on `PUT` and `PATCH`, and `meta.etag` ([7](#7-openapi-sources-and-endpoint-matrix))
- [ ] Response attributes and relationship `data` (responses and requests) are `nullable: true`; request attributes and the resource `id` are not; an enum attribute lists `null` on responses ([7](#7-openapi-sources-and-endpoint-matrix))
