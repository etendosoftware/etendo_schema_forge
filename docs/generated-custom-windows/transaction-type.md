# Transaction Type

## Intent

`transaction-type` is a **user-definable lookup** behind the match-rule "Tipo de transacción" field. It lets a finance user grow the list of transaction types on the fly instead of being limited to a fixed code list. It is **not a standalone window**: there is no menu entry, no route and no maintenance screen — the only way a user touches it is the inline "+ Crear tipo de transacción" action inside the [match-rule](match-rule.md) create/edit modal.

## Pipeline registry (ETP-4658)

Predates the `cli/config/regen-windows.json` convention — see [match-rule](match-rule.md#pipeline-registry-etp-4658) for the shared history. ETP-4658 added it to the registry (`transaction-type` / `82922976BB524D1BAA3CF8462B9219FE`) and ran a full DB extraction + regen, producing a proper `contract.mcp.json` and a generated `TransactionTypePage.jsx` for the first time. That page is **not wired into `registry.js` or `menu.json`** — deliberately, since this remains backend-only by design (no menu entry, no route); it is unused generated output, same as any other artifact whose `layoutType` implies a frontend it doesn't actually need.

## Interaction model

- **No UI surface of its own**: no AD menu, no React route, no wired frontend (the artifact is backend-only in `registry.js`/`menu.json`; the validator's `BACKEND_ONLY_ARTIFACTS` set — published in `@etendosoftware/schema-forge-cli`'s `validate-pipeline.js` post-split — exempts it from the F3 "contract without registry entry" rule).
- **Backed by** the new core-style table `ETGO_Transaction_Type` (search key `Value` + `Name`), exposed as a NEO Headless **W spec** (`transaction-type`) with a technical AD window/tab that carries **no menu entry** — it exists only so NEO can serve the selector list and the create endpoint.
- **Where it is used**: the match-rule `transactionType` field is a FK (`ETGO_Transaction_Type_ID`) rendered as a searchable, inline-creatable selector.

## What this lookup should allow

- **List / search** transaction types from the match-rule "Tipo de transacción" selector (loaded via the FK selector endpoint, `Name` as the visible identifier).
- **Create** a new type on the fly: clicking "+ Crear tipo de transacción" opens a small name-only modal ("Nombre" field + Cancelar / Crear). On confirm the SPA `POST`s `{ name }` to `/sws/neo/transaction-type/transactionType`, the new record is auto-selected, and it becomes available to every later rule.

## Reactive behavior and dependencies

- **Server-side enrichment**: `TransactionTypeHandler` (`@Named("transaction-type")`) is a NEO write pre-hook. On create it:
  - requires a non-blank `name` (max 60) — HTTP 400;
  - derives the `Value` (search key) from the name as an uppercase, accent-stripped slug (e.g. "Comisión bancaria" → `COMISION_BANCARIA`) when the caller did not supply one, and injects it into the request body so the generic CRUD persists it (the create form only sends a name);
  - rejects a duplicate search key — HTTP 409.
- **Referential integrity**: match-rule rows reference a transaction type through the `ETGO_MR_TRXTYPE_FK` foreign key; the value shown in the rule list/grid is the type's `Name`.

## Verification (QA)

1. Open the match-rule modal → "Tipo de transacción" → confirm the selector lists existing types and shows "+ Crear tipo de transacción".
2. Type a new name and create it → the modal closes, the new type is selected, and reopening the selector shows it in the list.
3. Create a second type whose name slugifies to an existing search key → expect an error surfaced in the create modal (HTTP 409).
4. Create a rule with that type, save, and confirm the rule list shows the type's name.

## Critical files

- `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/TransactionTypeHandler.java` (validation + search-key derivation hook)
- `modules/com.etendoerp.go/src-db/database/model/tables/ETGO_TRANSACTION_TYPE.xml` (table model)
- `artifacts/transaction-type/decisions.json` (W spec config: `Name` editable, `Value` readOnly/auto, `javaQualifier`)
- `tools/app-shell/src/components/contract-ui/InlineCreateSelector.jsx` + `InlineCreateModal.jsx` (the inline-create selector + modal)
- match-rule `decisions.json` → `transactionType` field (`allowCreate`, `createSpec`, `createEntity`, `createTitleKey`, `createNamePlaceholderKey`)
