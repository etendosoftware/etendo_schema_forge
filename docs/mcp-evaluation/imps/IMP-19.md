# IMP-19 — Type the report-generator contract

**Registry row:** `mcp-improvements-registry.md` → IMP-19 (P2, C3, 0 / 3, `com.etendoerp.go`).
**Registered:** 2026-08-06 run (§5), from evidence **B3, B4, B5**.
**Status:** implemented 2026-08-11 (`7282112e`), **verified live** 2026-08-12 (§6). Registry row ✅
with the score still 0 / 3. One new defect found and routed to IMP-5 as clause (iv) — §6.3.
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

## 6. Live verification (2026-08-12, `etendo-go-local`)

Five probes. All four registered defects behave as designed on the server, one is only half-provable
from this session for a reason the file itself predicted, and one **new** defect surfaced.

| Probe | Result |
|---|---|
| `generate_tax_report({})` — defect A/C | 422 `validation_error`, `missingParameters:["dateFrom","dateTo"]`, hint pointing at the tool schema — exactly §2.4's declared pair |
| `generate_tax_report(…, format:"pdf")` — defect B | 422, `field:"format"`, `supportedFormats:["json"]`, and §2.2's hint verbatim |
| `generate_tax_report({dateFrom,dateTo})` | Real data, and its `meta` echoes 8 of the 12 declared parameters with the defaults read from the code |
| `generate_bank_statements({})` — defect D | `callable:false`, `status:"not_configured_for_report_generation"` with the explanation |
| `generate_aging_receivable({})` — §4 | Passed parameter validation, then failed **inside the handler** on an environment gap — see §6.3 |

### 6.1 The session proved §9.3 before it proved anything else

The tool schemas this session holds are the **pre-deploy** ones, and they are the defect verbatim:
`parameters` is `{"description":"Report input parameters","type":"object"}` (defect A, untyped) and
`format` reads *"Output format: pdf, xlsx, csv (default: pdf)"* (defect B, advertising three formats
nothing renders). So IMP-23 §9.3's limit is not a theoretical caveat — it is the state this
verification had to work around, and it is why every probe below tests **server behaviour** rather
than the published schema.

That makes the `generate_bank_statements` result better than a bare failure would have been. A client
holding the old catalog still offers the five retired tools; calling one gets `callable:false` plus
*"Jasper/AD_Process reports are legacy migration sources only… Configure a NEO report handler to
enable it."* — an agent can act on that. The retirement itself is confirmed in code rather than live:
`ToolRegistry:143` is `resolveReportContract(spec).ifPresent(contract -> tools.add(...))`, so an empty
contract emits nothing. **Proving the absence from a live `tools/list` needs a reconnected client**;
an unauthenticated `POST /mcp` returns 401, so it was not forced from here.

### 6.2 §4's refusal was the right call, measured

§4 refused to honour the Aging descriptor's `recOrPay: required`, on the grounds that the code
defaults it and enforcing the descriptor would reject working calls. `generate_aging_receivable({})`
— no parameters at all — **passed validation** and reached the handler. Had the phantom `required`
been trusted, that call would have been rejected before running.

The Tax success is the positive half of the same point: `meta` comes back with `dateType:"acct"`,
`transactionType:"B"`, `taxType:"tax"`, `showDetails:false`, `groupByBp:false`,
`bpNameType:"commercial"` — parameters the handler reads and that §4 found declared in **no**
descriptor. They are now declared and their defaults are visible in the response.

### 6.3 A new defect: the report handlers' own errors are not enveloped

`generate_aging_receivable({})` failed with:

```json
{"error": {"message": "No accounting schema with currency is configured for organization 6184…", "status": 422}}
```

The *content* is fine — a real, actionable configuration gap in this local instance, not a code fault,
and the reason Aging cannot be exercised end to end here. The **shape** is not: `{"error":{message,
status}}` is the nested pre-IMP-5 form, not the flat `{status, error, detail, …}` envelope the rest of
the surface now uses. There is no `error` code an agent can branch on and no `seeAlso`.

This is a **fourth error funnel**, alongside the three IMP-17 §3 enumerated. IMP-17 fixed the CRUD
failure path, the router's catch-all and the not-null classifier; a report handler returning
`NeoResponse.error(...)` on its own reaches none of them, and `validateReportRequest` — which does use
the canonical envelope (§2.3) — runs *before* the handler and so never sees this.

**Where it belongs:** IMP-5, as a clause (iv), not a new number. Same reasoning as IMP-23 §5.1 and
§9.4 → IMP-17: enveloping errors is literally IMP-5's title, and a new item would force a quota
re-base for work that is one funnel of the same job. It is not IMP-19's — this item types the report
*contract*, and the contract behaved correctly here by letting a valid call through.

---

## 7. Not verified

- **The catalog itself.** That the five retired tools are absent from a live `tools/list` needs a
  reconnected MCP client (§6.1). Confirmed in code and by unit test only.
- **`generate_inventory_stock_report`** was not called — the third real handler is untested live.
- **Aging end to end.** It reached its handler and stopped on a missing accounting schema for the
  organization, so the report's own output is unverified on this instance.
- **The React UI still driving the five handlers over NEO REST** — the argument §2.1 rests on. No
  browser probe ran; the handlers were not touched, but that is reasoning, not measurement.
- **Score**: 0 / 3 stands. The row moves 🔧 → ✅ on §6; the 3 / 3 is a `/mcp-comparison` measurement.
