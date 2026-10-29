# ETP-5730 — Product import: Tax category, Availability and Stock management columns

- **Jira:** ETP-5730 (Story, parent ETP-3504, related ETP-5417) — assignee Jorge Ortolano
- **Branch:** `feature/ETP-5730` (from `origin/develop`, no worktrees)
- **Status:** first implementation done in the working tree (uncommitted), using the recommended answers to Q1-Q4 until the functional analyst reviews them. Vitest for `src/windows/custom` + `src/locales` green (514 files), `sf-validate-pipeline --scope=product` clean. Not yet verified end to end against a running instance (needs this code deployed, see §8).
- **Repos touched:** `etendo_schema_forge` only (`decisions.json`, descriptor, locales, tests). `com.etendoerp.go` is expected to need no change (see §3.4).

## 1. What the ticket asks

Three new **optional** columns in the Products import template (the ticket text lists five; see the scope note below); empty cell / missing column keeps today's behaviour.

| Column | target | Field | Accepted values |
|---|---|---|---|
| Tax category | `taxCategory` | `C_TaxCategory_ID` | name of an existing tax category |
| Stocked | `stocked` | `IsStocked` | Yes / No |
| Returnable | `returnable` | `Returnable` | Yes / No |

> **Scope note (revised):** the ticket also asked for Sold (`sale`) and Purchased (`purchase`). They were dropped: those fields are `form: false` and the form always saves them as true (ETP-5696, `ProductStockDefaultsWatcher`), so the product sheet has no such fields and the ticket text is outdated. Wherever the sections below mention `sale` / `purchase` as import columns, read them as removed.

- Unknown tax category → row goes to **Errors** with a message naming the value; never dropped silently, never auto-created.
- Export (`registerExportHints`) returns the three columns with readable values so export → import round-trips.
- Spanish aliases, example and translated label in `en_US` and `es_ES` (and `es_AR`, which carries the same keys today).

## 2. Current state (verified in code)

| Piece | File | Today |
|---|---|---|
| Import fields | `artifacts/product/decisions.json` → `window.import.fields` | 10 columns; none of the five |
| Descriptor | `tools/app-shell/src/windows/custom/product/productImportDescriptor.js` | `PRODUCT_TARGETS = ['searchKey','name','description']`; comment says "taxCategory still resolves server-side through the product handler" |
| Default injection | `modules/com.etendoerp.go/.../ProductDefaultsHandler.java` | POST pre-hook injects `uOM` and `taxCategory` (the `IsDefault='Y'` row, client then System) **only when missing from the body**; an explicit value wins (`injectIfMissing`). Also forces `stocked`/`returnable` to `false` when the body says `productType` S/E/R |
| FK resolution | `productFkResolvers.js` + `resolveForeignKeys.js` | `product-uom` resolver via `simSearchEveryLanguage({entityName:'UOM'})` + `matchEntity:'UOM'` on the field for the preview. Template for tax category |
| Boolean parsing | `src/lib/parseBoolean.js` | accepts true/false, y/n, yes/no, 1/0 — **not `sí`/`si`** |
| Export | `registerExportHints('product', { sourceKeys, valueLabels })` | `valueLabels` already used for `productType` via `codeLabels` |
| Locale keys | `locales/{en_US,es_ES,es_AR}.json` (`importHeaderCost`, `importExampleProductCost`, …) with a guard test `locales/__tests__/etp5350-product-cost-import-keys.vitest.js` | pattern to copy |

Why it is a gap: `sale`/`purchase` are `grid:false, form:false` in decisions and `taxCategory` is never sent by the import, so imported products always get the handler's default tax category and AD defaults for the flags.

## 3. Solution

### 3.1 `decisions.json` — five new fields (all optional, none `required`)
- `taxCategory`: `matchEntity: 'FinancialMgmtTaxCategory'` (DAL name of `C_TaxCategory` — **to verify** against `AD_Table.classname`), aliases `grupo de impuesto`, `grupo de impuestos`, `categoria de impuesto`, `categoría de impuesto`, `tax category`; `labelKey`/`exampleKey`.
- `sale` / `purchase` / `stocked` / `returnable`: boolean cells, aliases `se vende`, `vendible`, `se compra`, `comprable`, `almacenable`, `retornable`, etc.; `labelKey`/`exampleKey`.
- Run `make` / the decisions → contract regeneration that other import-column tickets use (ETP-5350 is the precedent) and commit the regenerated artifacts if any change.

### 3.2 Descriptor
1. **Booleans.** Write a small helper in the descriptor (not in `parseBoolean`, which is shared by other flows): accept `Sí/Si/Yes/No/Y/N/true/false/1/0`, blank → `undefined` (key omitted, so AD default applies). A non-blank cell that is not boolean → row error naming the column and value (same shape as `codedCellError`). Extend `parseBoolean` with `si`/`sí` only if the owners of its other callers agree — otherwise keep the local helper.
2. **Validation in review.** Extend `registerImportRowValidator('product', …)` so an unparseable Yes/No cell fails in the review queue, not at send time (same rule as ETP-4996).
3. **Tax category.** New `product-tax-category` FK resolver registered in `productFkResolvers.js` (`simSearchEveryLanguage`, `classifyCandidates`, `{ target: 'taxCategory' }` so send time reuses the preview's answer). Descriptor: blank → omit `taxCategory` (handler injects the default); filled → resolve, non-`auto-resolved` → `throw new Error(...)` with a translated message naming the value (`importErrorTaxCategoryUnresolved`), like `importErrorUomUnresolved`.
4. Copy resolved values onto `productBody`; leave `PRODUCT_TARGETS` as is.

### 3.3 Export hints
- `sourceKeys`: `taxCategory: 'taxCategory$_identifier'`; `sale/purchase/stocked/returnable` → the list-row keys. **To verify:** `sale`/`purchase` are `grid:false`, so they may not be on the list payload; if not, the export needs them added to the exported projection (otherwise the columns come out empty and the round-trip test case fails).
- `valueLabels`: Yes/No (localised) for the four booleans, and the importer must accept every label the export emits (same invariant as `productType`).

### 3.4 Backend / interaction rules to respect
- `ProductDefaultsHandler` forces `stocked`/`returnable = false` for Service/Expense/Resource. An import row with type Service and `Stocked = Yes` will therefore be saved as `false`. **Decision needed (Q1).**
- An explicit `taxCategory` wins over the default (`injectIfMissing`), so no Java change is needed.
- `sale`/`purchase` marked as required in the contract: sending `false` is valid; omitting keeps today's behaviour.

### 3.5 Locales
Add header/example/error keys to `en_US`, `es_ES` and `es_AR` (`importHeaderTaxCategory`, `importExampleProductTaxCategory`, … , `importErrorTaxCategoryUnresolved`, `importErrorInvalidBoolean`) plus a guard test modelled on `etp5350-product-cost-import-keys.vitest.js`.

## 4. Tests

Vitest (`productImportDescriptor.vitest.js`, plus resolver and locale tests):
1. Row without the five columns → body identical to today (no new keys).
2. Existing tax category + `Purchased = No` → body carries resolved id and `purchase: false`.
3. Unknown tax category → descriptor throws with the value in the message; row validator/preview marks it.
4. Blank cells → keys omitted.
5. `Sí`/`No`/`true`/`1` variants parsed; `maybe` → row error.
6. Export hints: `taxCategory$_identifier` source key, Yes/No labels, and export → import parses back with no errors.
7. Locale guard: keys present and non-empty in the three locales.

E2E / manual on the live environment (once available): download the template (columns present), import the two sample files below, check Errors tab and resulting product in the form; export → re-import.

## 5. Out of scope
- Auto-creating tax categories (explicitly forbidden by the ticket).
- Changing `ProductDefaultsHandler`.
- Extending the same columns to Contacts or other imports.

## 6. Open points / questions

- **Q1.** `Stocked`/`Returnable` on a non-Item row: keep the server override silently, or flag the row in review ("only Items can be stocked")? Plan assumes the server override stays and we add a review **warning/error only if the Product owner wants it**.
- **Q2.** Accept `Sí`/`Si` (needed for es_ES users) by extending the shared `parseBoolean`, or keep it local? Plan assumes local.
- **Q3.** Tax categories are not translated in C_TaxCategory the way UOM is; confirm `simSearchEveryLanguage` is still the right matcher (cheap to keep for parity).
- **Q4 (from the live check).** Ambiguity of tax-category names, see §7.

## 7. Live findings (app.etendo.ai, develop, tenant GOClient, 2026-10-20)

- Products list has the Import dialog (CSV / TXT / XLSX, "download CSV / Excel template" links). The templates themselves were not downloaded (needs explicit permission); their columns come straight from `window.import.fields`, i.e. today's ten.
- New product form (develop still has the old General / Additional info tabs; ETP-5696 not deployed): Additional info holds **Tax category** (default `IVA Normal`, mandatory), **Availability** (Sale + Purchase, both checked by default) and **Stock management** (Stocked + Returnable, both checked by default). This confirms the defaults the import must keep when cells are empty.
- The tenant has many tax categories with near-identical names: `Exento` / `Exento Servicios` / `Exento servicios por suplido`, `IGIC General` / `IGIC General Servicios`, `IGIC Incrementado 1` / `IGIC Incrementado 1 Servicios`, etc.
  - **Design impact:** a fuzzy simSearch for `IGIC General` can return several candidates. The resolver must prefer an exact normalised-name match (case/accents-insensitive) and only fall back to `classifyCandidates`; when it is still ambiguous the row must fail in Errors naming the value, never pick the first candidate. Add a vitest case with `Exento` vs `Exento Servicios`.
- Not yet verified live: an actual import with the new columns (needs the implementation first) and the export columns.

## 8. Implementation (first iteration) and what is still open

Decisions applied (to be reviewed with the functional analyst, all cheap to change):
- **Q1** — server override stays silent (a Service row with Stocked = Yes is saved as No). No review warning: nothing in the review queue models a warning, only errors.
- **Q2** — Yes/No parsing is local to the descriptor (`YES_NO_VALUES`), accent-insensitive: `Sí/Si/Yes/Y/1/true/Verdadero` and `No/N/0/false/Falso`. Shared `parseBoolean` untouched.
- **Q3/Q4** — `product-tax-category` resolver (`productFkResolvers.js`) accepts only a candidate whose name equals the cell (case/accent/whitespace-insensitive) and only when exactly one does; otherwise `needs-review`, which the descriptor turns into `importErrorTaxCategoryUnresolved` naming the value.

Nuance to know: the field also declares `matchEntity: 'FinancialMgmtTaxCategory'`, so the **preview** uses the generic fuzzy classifier (`classifyCandidates`) and lets the user pick a candidate in the review queue. A value the preview auto-resolves, or one the user picks, reaches the resolver through `fkResolutions` and is used as is. The strict rule therefore applies to values the preview did not resolve; tightening the preview itself would be a change in `schema_forge_core` (`resolveForeignKeys.js`), out of scope here.

Files: `artifacts/product/decisions.json` (+5 fields; `contract*.json` and `ProductPage.jsx` regenerated with `make regen ONLY=product SKIP_EXTRACT=1`), `productImportDescriptor.js`, `productFkResolvers.js`, locales `en_US/es_ES/es_AR` (12 keys each), tests in `productImportDescriptor.vitest.js` and `etp5350-product-cost-import-keys.vitest.js`.

Still to verify with a running instance:
1. `sale`/`purchase` are `grid:false`; confirm the NEO list payload still carries them, otherwise the export columns come out empty.
2. The export value map is keyed by the raw value; confirm the backend stringifies booleans to `true`/`false` so `Sí`/`No` are written.
3. A real import of the test cases in the ticket, including `Exento` vs `Exento Servicios`.
4. `make regen` warned the AD cache snapshot is stale (unrelated to this change); not refreshed here.

## 9. Strict matching (second iteration, uncommitted, three repos)

Live findings (2026-10-21): the preview sent "IVA Normal", "Exento", "Metro", "Pie" and "Día" to manual review because `SimSearch` scores a name that contains the term at 100 (`GREATEST(similarity, word_similarity)`, ETP-3963, Francisco Roig), so an exact name ties with every longer name and the modal's rule (80 % and 15 points over the runner-up) never fires. The same tie also decides the order under `LIMIT :qty`, so an exact match can fall outside the page.

Changes, all additive and opt-in:
- `com.etendoerp.copilot.toolpack` (`SimSearch.java`, branch `feature/ETP-5730` from `main`): the indexed query also selects `text_score` (whole-string similarity) and `exact_match`, and orders by `score desc, text_score desc, pk asc`. Response gains `text_similarity_percent` and `exact_match`; `similarity_percent` and the inclusion filter are unchanged. The non-indexed path adds the same two fields.
- `schema_forge_core` (`app-shell-core`, branch `feature/ETP-5730` from `develop`): `simSearch` keeps the new fields and, with `scoreMode: 'text'`, reports the whole-string similarity as `similarityPercent` and re-sorts best-first; `scoreModeForField` maps `matchMode: 'strict'` to it; `ImportDialog`, `resolveForeignKeys` and the review popover pass it.
- `schema_forge`: `matchMode: "strict"` on `taxCategory` and `uOM`; the `product-uom` resolver asks for the same score.

Verified: the new SQL against the local DB (exact name first for Meter, IVA Normal and Exento; Metrox stays in review), the compiled Java helpers through a harness, core `npm test` (2068) plus the import vitest suites (232), functional vitest (927), `sf-validate-pipeline`. Not verified: end to end in the browser (needs the toolpack deployed and the SPA on `LOCAL_CORE`), the Java tests in `SimSearchHelpersTest` (need the Etendo test environment), the extra query per result on the non-indexed path, and whether any Copilot agent depends on the previous tie order.

## 10. Edge-case findings (2026-10-22, live)

~30 edge rows were run through the real review + import. Whitespace, case, accents, punctuation and name families (`Exento` / `Exento Servicios`) resolve correctly; foreign-client names (`As Per BOM`, `Exempt`), ambiguous (`IVA`) and numeric (`21`) values go to Errors; every Yes/No synonym parses and invalid flags fail review with the translated message; Service/Expense/Resource rows end with `IsStocked`/`Returnable` = N (server guard, Q1).

**Accepted behaviour (decision of the owner, to be flagged by QA if it matters):** the review dialog's generic FK rule (best candidate >= 80 % whole-string similarity and >= 15 points over the runner-up) still auto-resolves small typos, so `IVA Normal Servicio` was saved as `IVA Normal Servicios`, `Exento Servicio` as `Exento Servicios` and `IVA, Normal` as `IVA Normal`. The send-time `product-tax-category` resolver is exact-only but only runs on what the dialog did not already resolve. Making the tax group exact-only would require a change in `schema_forge_core` (`classifyCandidates`) and a new core version.

Not covered live: English UI, very large files, duplicate names inside one client. Local test data left in the DB: products `TAX-*`, `ED-*` and `FL-*`.
