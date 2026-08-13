# ETP-4298 — Posting & Not Posted Documents (Etendo GO) — Design

- **Jira:** [ETP-4298](https://etendoproject.atlassian.net/browse/ETP-4298) — *[Accounting] Posting & Not posted documents window (Etendo GO)*
- **Parent / relates:** ETP-4244 (Transactions). Workstream D (posting model), Accounting-GO epic ETP-3504.
- **Branch:** `feature/ETP-4298`
- **Date:** 2026-06-22
- **Functional refs:** §2.2 (Document posting), §2.3 (Documentos no contabilizados), §2.4 (Descontabilizar).

## 1. Goal & Scope

Bring manual document posting, unposting, and the *Not Posted Documents* management window to Etendo GO,
reusing the **Bulk Posting** module (`com.etendoerp:bulk.posting:3.0.0` + `bulk.posting.es_es:1.4.0`,
already added to `com.etendoerp.go/build.gradle`).

**In scope (this slice):**
1. **Not Posted Documents window** — a read-only list of pending-to-post documents, with bulk **Post** and per-row **Post**.
2. **Generic Post action** — manual posting, exposed on document windows (header action) and in the Not Posted window.
3. **Generic Unpost action (descontabilizar)** — exposed on document windows as a single-document header action.
4. Document windows getting Post/Unpost this slice: `sales-invoice`, `purchase-invoice`, `simple-g-l-journal`,
   `amortization`, `goods-movements`, `goods-receipt`, `goods-shipment`. (All 7 already have `decisions.json`.)

**Out of scope (split out):**
- **Auto-posting verification (§2.2):** confirming whether scheduled auto-posting is enabled by onboarding — separate
  parallel spike (see §7). Initial reading of `com.etendoerp.go/docs/onboarding-flow.md` suggests it is **not** wired today.
- **Payments (payment-in / payment-out):** deferred to a later slice (capability is generic; enabling is config-only).
- **Bulk Unpost:** intentionally excluded — unposting a batch by accident is dangerous. Unpost is single-document only.
- **Role gating:** Etendo GO has no role model yet (see §5).

## 2. Architecture

The slice reduces to **two reusable backend capabilities** plus per-window configuration. No window-specific Java —
all custom behavior lives in dedicated `NeoHandler` CDI beans (per CLAUDE.md NeoHandler rules), and per-window
enablement is declared in `decisions.json`.

```
                            ┌─────────────────────────────────────────────────┐
 Not Posted Docs window ────┤ NeoHandler @Named("not-posted-documents")        │── NoPostedDocumentDS.getData(...)
 (custom layout, app-shell) │   → unposted grid + filter options as JSON       │   (reuse bulk.posting)
                            │                                                   │
 Post/Unpost (header)  ─────┤ entity NeoHandler.handle(): endpointType==ACTION  │
 via /action/{post|unpost}  │   fieldName==post|unpost → DocumentPostingService │── AcctServer.get(...).post(id,false,..)
 Bulk Post (from window) ───┤ DocumentPostingService (shared, NOT a NeoHandler) │── ResetAccounting.delete(client,org,
                            └─────────────────────────────────────────────────┘                   tableId, recordId,"","")
```

### Capability A — Not Posted Documents data
- **Source of truth:** `ETBLKP_NotPostedDocument` is a *datasource-backed virtual table* (`DATAORIGINTYPE: Datasource`),
  served by `com.etendoerp.bulk.posting.datasource.NoPostedDocumentDS`. It is **not** a physical table — a NEO entity
  cannot `SELECT` it directly, and the accounting-status codes are **computed in-application** (no stored procedure), so
  the status must come from the module, not be reimplemented.
- **Handler:** `NotPostedDocumentsHandler` (`@Named("not-posted-documents")`) **reuses** the module's `NoPostedDocumentDS`
  (obtained via CDI / `WeldUtils`): `getData(params, 0, -1)` with `params = { org, accountingStatus, document }`. The
  returned `List<Map<String,Object>>` rows carry `{ documentType, documentId, description, accountingDate, organization,
  accountingStatus }`; the handler maps these to grid JSON, adding each row's `adTableId` (resolved from `documentType`)
  so the Post action knows what to post.
- **Filter-options:** the same handler serves the dropdown values by reading the `AD_Ref_List` entries of the two AD
  References (§3 / §4).

### Capability B — Post / Unpost (shared service + action-endpoint interception)
NEO routes action endpoints (`POST /{spec}/{entity}/{recordId}/action/{name}`) **by the entity's `Java_Qualifier`** — its
`NeoHandler.handle()` runs with `context.getEndpointType() == NeoEndpointType.ACTION` and
`context.getFieldName() == "post" | "unpost"`. There is no standalone handler reachable on arbitrary entities by an opaque
`{tableId, recordId}` call, so the capability is a shared service + thin per-entity interception:

- **`DocumentPostingService`** (shared DRY core — a plain CDI bean / static helper, *not* a `NeoHandler`):
  - `post(adTableId, recordId)` → `AcctServer.get(tableId, clientId, orgId, conn).post(recordId, false, vars, conn, txnCon)`
    on a transaction connection; checks the boolean result **and** `acct.errors`; commit on success, rollback on failure.
    **`force = false`** — posts only not-yet-posted documents; re-posting is not a goal of this slice.
  - `unpost(adTableId, recordId)` → `org.openbravo.financial.ResetAccounting.delete(clientId, orgId, adTableId, recordId,
    "", "")` — deletes `Fact_Acct` rows, sets `Posted='N'`, validates open period; returns the `{deleted, updated}` counts.
- **Action interception:** each in-scope entity's `NeoHandler.handle()` adds a branch — when `endpointType == ACTION` and
  `fieldName` is `post`/`unpost`, call `DocumentPostingService` with the entity's `AD_Table_ID` + `context.getRecordId()`
  and return a `NeoResponse`; otherwise return `null` (fall through to default CRUD). Windows with no handler today get a
  thin handler that does only this; windows that already have one (e.g. `salesInvoiceHeaderHandler`) gain the branch.
- **`adTableId` source:** the entity's own static `AD_Table_ID`. The Not Posted Documents window's bulk Post calls the same
  service per selected row using that row's `adTableId` (§2 Capability A).
- **Generator extension (tooling — Schema Forge Developer):** add a new `menuAction` kind (e.g. `"action": "post"`) that
  emits a `POST` to `/{spec}/{entity}/{id}/action/{name}` via a shared `useNeoAction` hook. The existing `documentAction`
  (AD button-column → process) and `columnName` paths do **not** fit a custom posting action — so this is a real, small
  generator/component change, declared once and reused by all 7 windows.

> **CDI rule (CLAUDE.md):** `NeoHandler` beans are annotated `@Named(...)` **only** — never `@ApplicationScoped` or any
> normal scope, or `lookupHandler()` silently skips them (Weld client proxy drops the non-`@Inherited` `@Named`).
> `@Named`-only defaults to `@Dependent` (no proxy).

## 3. Components

### Etendo GO (`com.etendoerp.go`)
- `src/com/etendoerp/go/schemaforge/handlers/DocumentPostingService.java` — shared post/unpost core (`AcctServer` /
  `ResetAccounting`); reused by both document-window handlers and the Not Posted window's bulk Post.
- `src/com/etendoerp/go/schemaforge/handlers/NotPostedDocumentsHandler.java` — `@Named("not-posted-documents")`; list +
  filter-options, reusing `NoPostedDocumentDS`.
- Per-entity action interception for the 7 document windows: a thin `@Named` `NeoHandler` for windows that lack one, or a
  `post`/`unpost` branch added to the window's existing handler (e.g. `salesInvoiceHeaderHandler`). All delegate to
  `DocumentPostingService`.
- `ETGO_SF_SPEC` / `ETGO_SF_ENTITY` / `ETGO_SF_FIELD` config so NEO serves the endpoints (pushed via Schema Forge
  `push-to-neo.js`; `Java_Qualifier` on the entity routes to the matching handler).

### Schema Forge tooling (generator extension — Schema Forge Developer)
- `cli/src/generate-frontend.js` — extend `getMenuActionsProp()` to support a new `action` kind that wires a call to
  `/{spec}/{entity}/{id}/action/{name}`.
- `tools/app-shell/src/hooks/useNeoAction.js` (new) — shared hook performing the `POST .../action/{name}` + refresh +
  inline success/error (mirrors `useDocumentAction`).

### Schema Forge
- New custom window artifact **`not-posted-documents`** — custom `layoutType` with a **two-pane layout**: a **filter panel
  on the left** (narrow) and the **document grid on the right** (wide — the grid is the primary focus, given more space).
  The grid is read-only with per-row **Post** and a bulk-selection **Post**. UI files in
  `tools/app-shell/src/windows/custom/not-posted-documents/`, registered in
  `tools/app-shell/src/windows/registry.js`. Never overwritten by the pipeline.

  **Filter panel fields** (option values come from AD List references, served by the filter-options endpoint — see §4):
  | Field | Widget | Source / behavior |
  |-------|--------|-------------------|
  | Organization | — (none) | Not rendered. The list is implicitly scoped to the current organization. |
  | Document | single-select | `AD_Reference` **`DE94535164E741AB9B1A560EF3F72854`** (`ETBLKP_Documents`). One value. |
  | Accounting status | multi-select | `AD_Reference` **`D674E22A40DE4CEE931AB96F4CD914F9`** (account-status selector). One or more values. |
  | From date / To date | date pickers | Inclusive document-date range. |

  Both option lists are read from `AD_Ref_List` entries of the referenced AD References (labels already localized via the
  `bulk.posting.es_es` module — surface the translated `name`/`description`, do not hardcode).
- `decisions.json` edits on the 7 document windows: a shared `menuAction` **Post** and **Unpost** calling the NEO
  endpoints. Declared in `window.menuActions`; regenerated via `make regen ONLY=<window>` per window.
- i18n: new keys in **both** `en_US.json` and `es_ES.json` (`Post`, `Unpost`, `Not posted documents`, result messages).

## 4. Data Flow

- **Filter options:** on window load → NEO `not-posted-documents` filter-options request → handler returns the
  `AD_Ref_List` values of `AD_Reference` `DE94535164E741AB9B1A560EF3F72854` (`ETBLKP_Documents`, → Document selector) and
  `D674E22A40DE4CEE931AB96F4CD914F9` (account-status, → Accounting status selector), with localized labels.
- **List:** window → NEO `not-posted-documents` with filter params `{ document?, accountingStatus?[], dateFrom?, dateTo? }`
  (organization implicit = current org) → handler → `NoPostedDocumentDS` → JSON grid. Changing any filter re-queries.
- **Post (single / header):** action → NEO `post-document {adTableId, recordId}` → `AcctServer.post` → `Posted='Y'` → refresh.
- **Post (bulk, Not Posted window):** selection → loop per row → per-row `{recordId, ok, message}` → summary toast.
- **Unpost (single, header):** action → NEO `unpost-document` → `ResetAccounting.delete` (removes `Fact_Acct`,
  `Posted='N'`, validates open period) → refresh.

## 5. Roles & Permissions

Etendo GO has **no role model yet**, so this slice ships Post/Unpost **ungated**. Intended gating is annotated in code and
docs as `TODO(roles)` so it is wired the moment roles land:
- **Post:** `financiero` + `admin`.
- **Unpost:** `admin` only (more sensitive operation).

## 6. Error Handling

- **Post failure:** surface `AcctServer`'s document-level error message verbatim to the UI.
- **Unpost failure:** surface period-closed / validation errors from `ResetAccounting`.
- **Bulk Post:** per-document pass/fail summary — never a silent partial success. Each document is its own transaction
  (all-or-nothing per document; one failure does not roll back already-posted documents in the batch).
- **Transactions:** single OBDal transaction per document, all-or-nothing rollback (no Sagas).

## 7. Auto-posting Verification (parallel, separate deliverable)

Split to a **spike task** (owner: Remedy / tenant-fixer): confirm whether the onboarding client-creation flow enables the
scheduled auto-posting process. Initial reading of `onboarding-flow.md` indicates it does **not** today (onboarding does
data setup + sequences + org-ready + fiscal + customer, no posting job). Finding is documented and fed back to ETP-4298.
Does not block Capabilities A/B. If confirmed OFF, manual Post is the primary path, not a backup.

## 8. Testing

- **JUnit (GO):** `NotPostedDocumentsHandler`, `PostDocumentHandler`, `UnpostDocumentHandler` — happy path + error paths
  (post failure message, unpost period-closed, unknown table/record).
- **Contract tests:** the new NEO entities (Node.js).
- **E2E:** one mocked Playwright spec for the Not Posted window + per-row/bulk Post and a document-window Unpost
  (per `docs/e2e-testing-guide.md`, `data-testid`-based; reference `e2e/tests/flows/row-quick-actions.mocked.spec.js`).
  All test strings via `t()` / `data-testid` — no hardcoded UI labels.
- Test authoring delegated to Tester (`test-generator`).

## 9. Pipeline & Delivery

- **DEV:** Capability A (window + handler) and Capability B (post/unpost handlers + per-window `decisions.json`).
  Split across developer slots where independent.
- **REVIEW (Alex):** includes `node cli/src/validate-pipeline.js --scope=<windows-touched>` → 0 violations, and the
  Window Change Integrity Protocol checks for each regenerated window.
- **QA (Sentinel):** systematic coverage incl. error paths and bulk-summary behavior.
- **DOCS (Sage):** `docs/generated-custom-windows/not-posted-documents.md` guide + update touched window guides
  (self-documentation policy — code change + doc update is one atomic unit).
- **After any `push-to-neo.js`:** run `./gradlew export.database` in Etendo root.
- **Commits:** `Feature ETP-4298: <desc>` (≤80 chars, no `Co-Authored-By`). Branch ops + PR delegated to Clerk.

## 10. Key Identifiers

| Item | Identifier |
|------|-----------|
| Bulk Posting module | `com.etendoerp:bulk.posting:3.0.0` (+ `bulk.posting.es_es:1.4.0`) |
| Not Posted Documents window | `35A7B3ED3AD441F5897AE1174AD49DD1` (`OBUIAPP_PickAndExecute`) |
| Not Posted datasource | `com.etendoerp.bulk.posting.datasource.NoPostedDocumentDS` |
| Not Posted virtual table | `ETBLKP_NotPostedDocument` (datasource-backed) |
| Document filter reference | `AD_Reference` `DE94535164E741AB9B1A560EF3F72854` (`ETBLKP_Documents`) |
| Accounting status reference | `AD_Reference` `D674E22A40DE4CEE931AB96F4CD914F9` (account-status selector) |
| Posting class | `org.openbravo.erpCommon.ad_forms.AcctServer#post(...)` |
| Unposting class | `org.openbravo.financial.ResetAccounting#delete(...)` |
| In-scope windows | sales-invoice (167), purchase-invoice (183), simple-g-l-journal (B917E8A7…), amortization (800026), goods-movements (170), goods-receipt (184), goods-shipment (169) |
