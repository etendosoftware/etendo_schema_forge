# Public API configuration (product cells)

What a window publishes through the public API is configured in that window's
`artifacts/<window>/decisions.json`. Nothing per-window lives in the generator.
Reference for the mechanism: [Public API (unified reference)](public-api.md).
Risk analysis: the risk analysis shared by the Platform team.

The base manifest is conservative: with no configuration, a window publishes its
primary entity and linked children, the fields its form shows, no actions.

## 1. Publish or hide a field

Per field, `entities.<entity>.fields.<field>.publicApi`:

```json
"searchKey": {
  "visibility": "editable",
  "publicApi": { "exposed": true, "name": "searchKey" }
}
```

Curated-entity rule: as soon as **one** field of an entity has `publicApi.exposed: true`, the entity
publishes **only** its `exposed: true` fields (plus `id` and `updated`). To hide a field of a curated
entity, leave `exposed` out. In a non-curated entity the window-form fields are published and
`exposed` has no effect; to hide one there, curate the entity.

## 2. Make a field or an entity read-only

Field (works on curated and non-curated entities); the field becomes `direction: out`:

```json
"searchKey": { "visibility": "editable", "publicApi": { "exposed": true, "readOnly": true } }
```

Or list internal field names at entity level (use it when the field has no entry in `fields`):

```json
"businessPartner": { "publicApi": { "readOnlyFields": ["searchKey"] } }
```

Entity: only `GET`/`LIST`, every field `out`:

```json
"costing": { "publicApi": { "readOnly": true }, "fields": { } }
```

The entity is the one under that key in `decisions.json`. When `decisions.json` keys the entity
under another name and renames it with `name` (for example `conversion-rates`, whose
`entities.header` declares `"name": "conversionRate"`), declare the entity-level keys on that entry:
the generator finds it by its contract name.

## 2b. Mark a writable field as required

Declare it on the field; the OpenAPI POST and PUT bodies then list it under `required` (a PATCH requires nothing):

```json
"searchKey": { "visibility": "editable", "publicApi": { "exposed": true, "required": true } }
```

Real example: `artifacts/business-partner-category/decisions.json` declares it on `searchKey` and
`name` (`contact-category`).

Declare only fields the API really refuses to create without. The contract's own `required`
is not used: it also covers fields NEO fills by itself (an order's address, price list or
payment terms). A read-only field is never marked required.

## 3. Add input-only fields

Values the API accepts that are not contract fields. `readable: true` also returns them on GET
(`inout`); otherwise they are `in`. Ignored on a resource without write endpoints.

`writable: false` declares a read-only value instead (`out`, never `required`): one the entity's
handler adds to every read, published even on a resource without write endpoints (`readable` and `required` are ignored). The handler
must really return it under `internalPath`, or the attribute never appears.

```json
"locationAddress": {
  "publicApi": {
    "inputFields": [
      { "name": "city_name", "internalPath": "cityName", "dataType": "string", "required": true, "readable": true },
      { "name": "country_code", "internalPath": "countryCode", "dataType": "string", "writable": false }
    ]
  }
}
```

Every input field is generated with `queryable: false`: it is not a column of the entity, so the gateway
answers `400 invalid_query_parameter` to a `filter` or `sort` on it and the OpenAPI document lists no
`filter` parameter for it.

A name that collides with a published field fails the generation.

Real example: the headers of `sales-quotation`, `sales-order` and `purchase-order` publish the
exchange rate, a field the form does not show (`form: false`, the rate picker edits it), as
`{ "name": "currency_rate", "internalPath": "eTGOCurrencyRate", "dataType": "number", "readable": true }`.

## 4. Enable or disable an action

Actions are opt-in per window, at `window.publicApi.actions`. v1 knows only `complete`, and only for
windows with a completion flow (`draftMode` on `documentAction`):

```json
"window": { "publicApi": { "actions": ["complete"] } }
```

Remove the key (or leave the list empty) to publish no action. Child resources never publish actions.

## 4b. Publish a lookup

A lookup lets an integrator list the valid ids of a reference field, the same values the window's
selector offers (`GET /api/v1/<resource>/lookups/<field>`, see
[Public API §4.2.2](public-api.md#422-lookups)). Use it when the caller cannot know an id
beforehand (a payment method). Declare it on the field:

```json
"paymentMethod": {
  "reference": "PaymentMethod",
  "publicApi": { "lookup": { "context": { "IsSOTrx": "Y" } } }
}
```

- `"lookup": true` declares one without context.
- `context` holds the fixed parameters the window's own selector sends, as strings (for example
  `IsSOTrx` on an order, `FIN_ISRECEIPT` on a contact). The context is forwarded to the field's
  selector; whether it narrows the list depends on that field's validation rule, as in the app.
  Integrators must not rely on the list being filtered by sales or purchase. The values come from
  this file only; the gateway refuses any parameter a caller sends. The names `q`, `limit` and
  `offset` are reserved for the search and the page and are refused. Find the context names in the
  field's validation rule (`@IsSOTrx@`, `@FIN_ISRECEIPT@`, ...).
- The field must be published (on a curated entity, also `exposed: true`) and be a reference
  (a foreign key). Lookups exist on top-level resources only, never on a child. Anything else, or
  any other shape, fails the generation.
- The values carry the JSON:API `type` of the reference in kebab-case (`PaymentMethod` gives
  `payment-method`). When the reference is itself a published resource, the field is a
  relationship and the values carry that resource's public name instead (`BusinessPartnerCategory`
  gives `contact-category`), so an id from the lookup is sent back as the relationship as is.
- Declare a lookup only for a field an integrator really has to fill and cannot know the id of; a
  value that is a published resource (a contact, a product) is found by listing that resource.

Published today: `sales-order` and `purchase-order` `paymentMethod` (`IsSOTrx` `Y` / `N`) and
`warehouse` (no context), and `contacts` `paymentMethod` / `pOPaymentMethod` (`FIN_ISRECEIPT` `Y` / `N`)
and `businessPartnerCategory` (no context: the form's category selector has no validation rule).

## 4c. Describe a field, and list values

When a field has a rule its type cannot express (it is required only in some cases, or refused in
others), describe it on the field. The text is the field's description in the OpenAPI document:

```json
"name": { "publicApi": { "exposed": true, "description": "Required for a company. Refused for a person." } }
```

Real example: `artifacts/contacts/decisions.json`, where `name`, `etgoFirstname`, `etgoLastname`,
`etgoIsperson`, `taxID`, `oBTIKTaxIDKey` and `businessPartnerCategory` describe the person-or-company rules.

The description must be a non-empty string and must not cite an internal reference (a ticket or
Jira); anything else fails the generation. Write it for an external integrator. The manifest
`required` flag cannot express a conditional rule: leave a conditionally required field without
`required` and state the condition here. NEO is what enforces the rule.

AD list values need no decision: a published field that holds an AD list publishes its codes
(`dataType.enum`) and their labels (`enumLabels`) on its own, on every resource. Publishing the
field (`exposed: true` on a curated entity) is all it takes.

## 5. What the platform guarantees (you cannot override it)

These live in the generator and win over any decision:

- `neverExposedFields` (`policy.excludedFields` in the manifest): `client`, `organization`,
  `grantPortalAccess`, bank identifiers (`accountNo`, `bankName`, `displayedAccount`, `iBAN`,
  `swiftCode`) and the accounting bulk-posting fields. `exposed: true` does not publish them.
- The V1 allowlist (`publicApiV1Entities`, `policy.allowedResources` in the manifest): only
  `contacts`, `product`, `product-category`, `sales-quotation`, `sales-order`, `purchase-order`,
  `business-partner-category` (published as `contact-category`), `tax`, `tax-category` and
  `conversion-rates`, with the entities listed there, are published. A window outside it stays out
  whatever its `decisions.json` says; adding one is a change to the generator, not a decision.
  Listing a window is its scope decision, so it overrides the category exclusion: an allowlisted
  window is published even when its category (`settings`, `configuration`, `finance`, ...) is
  excluded.
- Public resource names (`publicResourceNames`, `policy.publicResourceNames` in the manifest): a
  window is published under its artifact name unless the generator renames it there
  (`business-partner-category` is `contact-category`). The NEO spec does not change.
- Conservative defaults: `system`/`discarded` fields are never published, excluded windows and
  child tabs stay out, no action without opt-in, a resource with no writable field is read-only.

## 6. Regenerate, verify, commit

1. Edit only `decisions.json`. Do not touch `contract.json` or `generated/`; the manifest generator
   reads `decisions.json` directly, so `make regen` is not needed for these keys. Exception:
   `exposed` and `name` on a curated entity travel through `contract.json`, so after changing them
   run `make regen ONLY=<window>` first.
2. `schema-raw.json` is gitignored: if missing, `make regen ONLY=<window>` or copy it
   from a checkout that has it.
3. `make generate-base-public-api-manifest` (also validates the result).
4. `git diff public-api/base.v1.json`: only the resources you meant to change differ; check the
   `direction` of each touched field, its `lookup`, `enum` and `description`, and `operations` / `processes` of each touched resource.
5. `node --test scripts/__tests__/*.test.js` and `cd gateway && npm test`.
6. Commit `decisions.json` and `public-api/base.v1.json` together.
