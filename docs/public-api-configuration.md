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

## 2b. Mark a writable field as required

Declare it on the field; the OpenAPI POST and PUT bodies then list it under `required` (a PATCH requires nothing):

```json
"searchKey": { "visibility": "editable", "publicApi": { "exposed": true, "required": true } }
```

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

A name that collides with a published field fails the generation.

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
  `payment-method`).
- Declare a lookup only for a field an integrator really has to fill and cannot know the id of; a
  value that is a published resource (a contact, a product) is found by listing that resource.

Published today: `sales-order` and `purchase-order` `paymentMethod` (`IsSOTrx` `Y` / `N`) and
`contacts` `paymentMethod` / `pOPaymentMethod` (`FIN_ISRECEIPT` `Y` / `N`).

## 5. What the platform guarantees (you cannot override it)

These live in the generator and win over any decision:

- `neverExposedFields` (`policy.excludedFields` in the manifest): `client`, `organization`,
  `grantPortalAccess`, bank identifiers (`accountNo`, `bankName`, `displayedAccount`, `iBAN`,
  `swiftCode`) and the accounting bulk-posting fields. `exposed: true` does not publish them.
- Fiscal monitors (`monitor-verifactu`, `sii-monitor`, `tbai-facturas-enviadas`): read-only, `id` and
  `updated` only, no actions.
- Conservative defaults: `system`/`discarded` fields are never published, excluded categories,
  windows and child tabs stay out, no action without opt-in, a resource with no writable field is
  read-only.

## 6. Regenerate, verify, commit

1. Edit only `decisions.json`. Do not touch `contract.json` or `generated/`; the manifest generator
   reads `decisions.json` directly, so `make regen` is not needed for these keys. Exception:
   `exposed` and `name` on a curated entity travel through `contract.json`, so after changing them
   run `make regen ONLY=<window>` first.
2. `schema-raw.json` is gitignored: if missing, `make regen ONLY=<window>` or copy it
   from a checkout that has it.
3. `make generate-base-public-api-manifest` (also validates the result).
4. `git diff public-api/base.v1.json`: only the resources you meant to change differ; check the
   `direction` of each touched field, its `lookup`, and `operations` / `processes` of each touched resource.
5. `node --test scripts/__tests__/*.test.js` and `cd gateway && npm test`.
6. Commit `decisions.json` and `public-api/base.v1.json` together.
