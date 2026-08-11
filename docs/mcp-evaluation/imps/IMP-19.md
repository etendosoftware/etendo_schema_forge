# IMP-19 — Type the report-generator contract

**Registry row:** `mcp-improvements-registry.md` → IMP-19 (P2, C3, 0 / 3, `com.etendoerp.go`).
**Registered:** 2026-08-06 run (§5), from evidence **B3, B4, B5**.
**Status:** 🔧 fix implemented 2026-08-11 (`7282112e`), live verification pending.
**Scope authorized by the human:** hide the five unusable `generate_*` tools ("Sí, ocultarlos").

Status lives only in the registry; this file describes the work.

---

## 1. What the registry cell said, and what was actually wrong

The cell read: *"`parameters` is an untyped object (first call always fails); `format` documents
`pdf/xlsx/csv` but JSON is always returned; flat error envelope"*. All three clauses hold. The cell
missed a fourth defect that is larger than the other three together, and it mis-stated the cause of
the first.

| # | Defect | Registry cell |
|---|---|---|
| A | `parameters` published as a bare `{"type":"object"}` on all 8 tools | named, cause wrong |
| B | `format` advertised as `pdf, xlsx, csv (default: pdf)` and never read | named |
| C | Ad-hoc, per-handler error shapes for a missing mandatory input | named |
| D | **5 of the 8 tools could never succeed at all** | not named |

### 1.1 A — the untyped `parameters` is not a configuration gap

The obvious reading of A is that somebody forgot to fill in the report specs. That reading is wrong,
and it matters because it would have sent the fix to the wrong place.

`ToolRegistry.buildProcessParamSchema` emits a property only when `field.getADColumn() != null`:

```java
for (SFField field : fields) {
  if (field.getADColumn() == null) { continue; }   // ← every report field
  …
}
```

Every one of the 8 report specs has **zero** `ETGO_SF_FIELD` rows. And no number of rows would have
helped: a report's inputs (`dateFrom`, `recOrPay`, `column1`, `glId`) are **not AD columns of any
table**. They are arguments to a query, not fields of an entity. There is nowhere in
`ETGO_SF_*` for them to live, so the schema was empty by construction, not by omission.

This is the same shape of problem `NeoHandler.servesActions()` already answered under ETP-4254, and
the javadoc there states the principle: *there is no action metadata on `ETGO_SF_ENTITY`, so the
handler is the only authority*. Report parameters are in exactly that position. The handler reads
them; nothing else knows they exist.

### 1.2 D — five tools that cannot be called

`McpToolRouterSupport` and `ToolRegistry` treated a spec as a callable report if **any** of its
entities declared a `Java_Qualifier`. But a qualifier means "a handler serves this entity", not
"this handler generates a report". Five of the eight qualifiers named UI handlers:

| Tool | Handler | What it actually is |
|---|---|---|
| `generate_financial_accounts_page` | `financialAccountsPageHandler` | React page data, dispatches on `?action=` |
| `generate_bank_reconciliation` | `reconciliationHandler` | React reconciliation screen |
| `generate_bank_statements` | `bankStatementsHandler` | React statement list |
| `generate_financial_account_transactions` | `financialAccountTransactionsHandler` | React transaction list |
| `generate_financial_account_bank_connection` | `financialAccountBankConnectionHandler` | connect/disconnect actions |

`McpToolRouter#handleReport` invokes the handler with a POST body and **no query parameters**. Those
five dispatch on an `action` query parameter, so every one of them could only ever answer `405` or
`400`. They were advertised in the catalog, looked callable, and were impossible to use. Only three
tools — `generate_tax_report`, `generate_aging_receivable`, `generate_inventory_stock_report` — were
ever real.

That is why D is not a separate item: A, B, C and D are all the same missing fact. Nothing in the
system recorded *what a report generator accepts*, so it could neither be published, nor validated,
nor used to tell a report generator apart from a page handler.

---

## 2. What was built

One declaration, one resolved object, every surface reading from it.

```
NeoHandler.reportParameters() : Optional<List<NeoReportParam>>   ← the only declaration
NeoHandler.reportFormats()    : List<String>
        │
        └─ NeoReportCallability.contractOf(handler, qualifier) → Optional<NeoReportContract>
                 │
                 ├─ ToolRegistry.buildReportTool      → the published tool schema
                 ├─ McpToolRouter.validateReportRequest → the 422 an agent gets
                 ├─ NeoReportCallability.isReportCallable → discover / resources / the catalog gate
                 └─ AgingReportHandler.describeReport  → the GET descriptor
```

New files, all in `com.etendoerp.go/src/com/etendoerp/go/schemaforge/util/`:

- **`NeoReportParam`** — one input. `required(name, type, desc)`, `optional(...)`,
  `options(name, desc, allowedValues)`. `TYPE_DATE` is deliberately distinct from `TYPE_STRING`:
  IMP-16 recorded silent date corruption produced by exactly that conflation, so a date is typed as
  a date and its expected `yyyy-MM-dd` shape is spelled out in the description too.
- **`NeoReportContract`** — the parameters plus the formats served, with `getDefaultFormat()`,
  `supportsFormat()`, `getRequiredParameterNames()`, `findParameter()`.
- **`NeoHandlerLookup`** — the CDI qualifier lookup, extracted out of `McpHookExecutor` so
  `schemaforge` code can resolve a handler without a second copy of the loop.
  `McpHookExecutor.resolveEntityHandler` now delegates to it and is kept as-is, so its 7 call sites
  and the existing `MockedStatic` tests keep working.

### 2.1 `Optional.empty()` vs. the empty list

This distinction is the whole of fix D and is easy to get wrong:

| Declaration | Means | Effect |
|---|---|---|
| `Optional.empty()` (the default) | "I am not a report generator" | **no `generate_*` tool is emitted** |
| `Optional.of(List.of())` | "a real report that takes no inputs" | tool emitted, `properties: {}` |

The default is `Optional.empty()`, so the five UI handlers drop out of the MCP catalog without being
touched. They keep serving the React UI over the ordinary NEO REST route — which is the only caller
they have today, and the route they were written for.

The empty *list* case is not hypothetical: it is `generate_inventory_stock_report`, where evidence
**B5** recorded an agent unable to tell from the schema whether the report needed inputs at all.
"No required inputs" and "unknown inputs" are different statements and now render differently. An
empty `properties: {}` is pinned explicitly in `buildReportTool`, because the shared
`objectPropWithProperties` helper omits the key when the map is empty — right for process specs,
whose parameters come from the `AD_Process` definition, but for a report an absent `properties`
reads as "any object", which is the ambiguity being removed.

### 2.2 `format`

`reportFormats()` defaults to `["json"]` and no handler overrides it, because **nothing here renders
a document**. That is a finding, not an assumption — see §3. The tool schema publishes an enum of
what is served, and an unsupported value is a 422 naming `supportedFormats` with the hint *"Etendo
Go returns report data as JSON; it does not render documents."* The single override point is there
for the day one of them does.

### 2.3 The 422

`validateReportRequest` runs **before** the handler and uses the canonical flat envelope the rest of
the MCP surface uses — `status` / `error` / `detail` / `field`, plus `hint` — via
`McpConstants.KEY_*` rather than string literals. A blank value counts as missing, because every
handler reads with `optString(name, "")` and treats `""` as unset; accepting it would only move the
failure back into the handler's own ad-hoc path, which is defect C.

### 2.4 Declared parameters, per handler

Only what the code demonstrably reads. Each was taken from the `body.optString(...)` calls in the
handler, not from its javadoc.

| Handler | Declared | Required |
|---|---|---|
| `TaxReportHandler` | 12 | `dateFrom`, `dateTo` |
| `AgingReportHandler` | 10 | none |
| `InventoryStockReportHandler` | 2 | none |

---

## 3. The format question, answered from the code

Before declaring `["json"]` the claim was checked rather than remembered:

- The three real report handlers return `NeoResponse.ok(jsonObject)` and contain **zero** mentions
  of pdf, xlsx, csv or jsreport.
- Jasper is prohibited by ETP-4255. `NeoReportService` names `ReportingUtils.exportJR` only inside a
  comment recording that it was removed.
- The only `application/pdf` path in the module is `NeoDocumentDownloadService`, which downloads an
  **existing attachment** — it renders nothing.
- `McpToolRouter` never read the string `"format"` at all.

So the old schema was not merely optimistic; a request for `format:"pdf"` was answered with JSON and
nothing in the response said the argument had been ignored.

---

## 4. A phantom `required`, refused

`AgingReportHandler`'s GET descriptor declared `recOrPay` as **required**. The code does not:

```java
String recOrPay = body.optString(PARAM_REC_OR_PAY, "RECEIVABLES");
```

Declaring it required in the contract would have made the router reject calls that work today. It is
declared optional with a closed set of `RECEIVABLES` / `PAYABLES`, and the javadoc records that the
default is **not neutral** — omitting it silently ages receivables.

The same class of drift produced the rest of that descriptor's problems: the Aging contract was
written down in **three** places — the method, the GET descriptor, and the class javadoc — and no two
agreed. `glId` and `showDetails` were read by the code and appeared in none of them. `describeReport`
now renders from `reportParameters()`, so there is one copy and the drift is structurally impossible.

---

## 5. Tests

`AgingReportHandlerTest` had two tests asserting the old hand-written descriptor: a
`param(String, String, boolean, String)` helper that no longer exists, and `assertEquals(8, …)`
against a parameter count that is now 10. Both were **rewritten to guard the new behaviour**, not
deleted:

- the descriptor test now asserts the rendered array against `reportParameters()` itself — a second
  hardcoded count would just re-create the drift — plus that `glId` and `showDetails` are present
  and that `recOrPay` is **not** required;
- the helper test takes a `NeoReportParam`, with a second case for the `allowedValues` branch.

`McpToolRouterRouteTest.reportToolWithHandlerReturnsHandlerJson` broke for the right reason: its
`NeoHandler` mock declared no contract, so under the new gate the router answered not-configured.
Stubbing `Optional.of(List.of())` is the fix, and it is also the D case in miniature — the test now
has to state that the handler is a report generator.

New coverage:

- **Router** (`McpToolRouterRouteTest`) — handler without a contract → not-configured **and
  `verify(handler, never()).handle(...)`**, which is the point of the gate; missing required param →
  422 with `missingParameters`; blank counts as missing; unsupported `format` → 422 with
  `supportedFormats`; satisfied contract + `format:"JSON"` reaches the handler.
- **Catalog** (`ToolRegistryGenerateToolsTest`) — the declared parameters are published typed and
  named (`format:"date"`, the `yyyy-MM-dd` hint, the enum, integer, boolean), `required` holds only
  the two mandatory ones, a no-input report publishes `properties: {}` and no `required`, and the
  `format` enum matches what is served. The existing `isReportCallable` stubs were rewired to
  `resolveReportContract`.
- **Contract** (`NeoReportCallabilityTest`) — null handler, undeclared handler (the five), empty-list
  handler (callable), a handler that throws while declaring (non-callable, not fatal), and
  case-insensitive format matching.

`NeoReportCallabilityTest.returnsFirstNonBlankQualifier` asserted `isReportCallable == true` from a
qualifier alone — the exact belief that shipped the five dead tools. It now asserts **false** with
the qualifier still resolving, which is the distinction the change introduces.

**7269 / 7271 unit tests pass.** The 2 failures are pre-existing and unrelated:
`OnboardingDatasetNormalizerTest` needs `src-test/resources/.../sampledata/index.txt`, which the
ad-hoc `javac` classpath used here does not include.

---

## 6. Not verified

- **Live**: nothing has been probed against `etendo-go-local`. Owed on the next deploy — that the
  five tools disappear from the catalog, that `generate_tax_report` publishes typed dates, that
  omitting `dateTo` returns the 422, and that the React UI still drives the five handlers over NEO
  REST.
- **Score**: 0 / 3 stands. Like IMP-22, the status mark is 🔧 — code written, committed and
  unit-tested, product unmeasured — which is worth **zero**, the same as ⏳.
- **The stale-tool-description limit from IMP-23 §9.3 applies here too**: an MCP client that is
  already connected caches the tool list from session start, so it keeps offering the five retired
  tools until it reconnects. Removing them from the catalog does not retract them from a live
  session.
