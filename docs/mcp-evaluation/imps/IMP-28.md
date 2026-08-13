# IMP-28 — `visibility:"readOnly"` must imply `readOnly:true`, and the write must fail loudly

**Registered:** 2026-08-13 (cohort C6) · **Priority:** P1 · **Class:** ♻️ same call
**Repo(s):** `com.etendoerp.go` (+ `schema_forge_core` if the visibility source is the spec)
**Registry row:** `mcp-improvements-registry.md` §3 · **Evidence:** run report
[`mcp-comparison-post-audit-2026-08-13.md`](../mcp-comparison-post-audit-2026-08-13.md) §6.1

> **State of this file: opened, not investigated.** It carries the observations the 08-13 run
> recorded and enumerates the hypotheses that have to be discriminated. **No source has been read and
> no DB has been queried for this item yet** — so nothing below asserts a root cause. Per the
> `/mcp-comparison` job-C rules, the next person to work this item starts at §3 and fills in the
> verdicts with `file:line` citations and real query output.

---

## 1. Why this is a P1 and not a cosmetic contract nit

This is the reason **frozen task 3 has never once succeeded**, across every run since the suite was
frozen. The task is *"create a product with a sale price, a purchase price and stock"* — a first-hour
ERP operation that Holded completes in one 193-byte call. Etendo GO spends three calls, returns 200
on all of them, and stores none of the three values.

The defect is not "a field is read-only". It is that **the contract gives two contradictory answers
to the same question in one object**, and the `hint` documents only the key that gives the wrong one.
An agent that reads the contract correctly is steered into a write that reports success and does
nothing. That is worse than a rejection, because there is no signal to recover from.

## 2. What was observed (verbatim, `etendo-go-local`, build `8f0d1cce`)

Four steps, each one a recorded call in the run report:

**(a) `neo_schema view:"create"` on `product/header` omits every price and stock field**, and its
`hint` instructs the agent not to look further — *do not call `neo_schema` again to look for it*.
So the projection is not merely incomplete; it actively closes the discovery path.

**(b) `neo_create` accepts `price` / `purchasePrice` / `stock` and drops them in silence.** The silent
part is IMP-18 (unknown names are reported on reads, not on writes) and stays scored there.

**(c) The `neo_create` response reveals the real names** — `eTGOSalePrice`, `eTGOPurchasePrice`,
`eTGOStock` — i.e. the fields exist on the entity and are simply absent from `view:"create"`.

**(d) `neo_update` with those exact names returns 200 with all three still `null`.**

The descriptor that should have warned instead contradicts itself:

```json
{"name":"eTGOSalePrice","column":"EM_ETGO_Sale_Price","label":"EM_ETGO_Sale_Price","type":"number",
 "required":false,"readOnly":false,"visibility":"readOnly","userRequired":false,
 "businessCritical":false}
```

`readOnly:false` and `visibility:"readOnly"` in one object. The `neo_schema` hint documents
`readOnly`; an agent that trusts it concludes the field is writable and is wrong.

Note the `label` too — a raw AD column name. That is IMP-1's per-window fallback, re-confirmed here,
not part of this item.

## 3. The open question that must be answered first

**Are `eTGOSalePrice` / `eTGOPurchasePrice` / `eTGOStock` genuinely writable and blocked, or are they
intended read-only projections of `product/price` and `product/stock`?**

Nothing gathered so far discriminates these. **Both readings are a P1, and the fix differs:**

| Reading | What the defect is | What the fix touches |
|---|---|---|
| **W — genuinely writable** | A broken write path: the value is accepted, acknowledged and discarded | Whatever drops the field between the MCP write verb and the DAL, plus `view:"create"` which hides it |
| **R — derived projection** | A contract that invites an impossible write and reports success. `visibility` is right, `readOnly` is a lie, and `view:"create"`'s hint blocks the agent from finding the spec that *is* writable | The serializer (make `readOnly` agree with `visibility`), the write verbs (reject instead of drop), the hint, and a `writableVia` pointer naming the spec that owns the value |

> **Answered 2026-08-13 by the human, from domain knowledge: reading R holds.** The three columns are
> **auto-maintained by DB triggers** and cannot be written. So `visibility:"readOnly"` is correct,
> `readOnly:false` is the lie, and the write path dropping the value is doing the right thing badly —
> silently, with a 200. H3 ("dropped for an unrelated reason") is therefore no longer the interesting
> branch; the live question is why the serializer says `readOnly:false` for a column nothing may write.
>
> **The sharper sub-question this raises, and the one that decides the repo:** does
> `AD_Column.IsUpdatable` read `'Y'` for these columns — i.e. the AD metadata itself is wrong and the
> trigger is an out-of-band contract the AD never learned about — or `'N'`, with the serializer
> ignoring it? The first is a data fix in the AD; the second is a code fix. Under investigation.
>
> *An earlier draft of this file attributed the `writableVia` pointer to IMP-29. That was a drafting
> error: IMP-29 registered as a different item (entity identifiers leaking the tenant's AD language).
> The pointer is currently **unregistered** and in scope for this item.*

If **R** holds, IMP-29 is the constructive half of this item and the two should ship together: telling
the agent the field is read-only here is only half an answer if it cannot learn where the price
actually lives.

## 4. Hypotheses to knock down — none tested yet

| # | Hypothesis | How to test | Verdict |
|---|---|---|---|
| H1 | `readOnly` and `visibility` are populated from two different sources (one from `AD_Column`/`AD_Field`, the other from the Schema Forge spec's `ETGO_SF_FIELD`), so they can disagree by construction | Read the field serializer in `com.etendoerp.go`; `SELECT` the spec row for `EM_ETGO_Sale_Price` and compare both values against the emitted JSON | *not tested* |
| H2 | Same source, but `readOnly` is computed from `AD_Column.IsUpdatable`/`readOnlyLogic` while `visibility` comes from the curated decision — i.e. AD says writable and the curation says display-only | Same reads; check whether the spec is curated at all (the 08-13 evidence says `product` is **uncurated**, which makes this the likelier of the two) | *not tested* |
| H3 | The write verb consults neither key and drops the field for an unrelated reason (not in the writable column set, EM_ column handling, computed column) | Trace one `neo_create` with the field present through the write path | *not tested* |
| H4 | The `view:"create"` filter uses `visibility` (correctly excluding it) while the full dump's `readOnly` is the stale key — meaning the projection is right and the descriptor is wrong | Compare the `view:"create"` inclusion predicate against both keys — note IMP-12 §14.3 already found the two views disagree on `userRequired`, so this is the same class of divergence | *not tested* |

H2 + H4 together would be a coherent story and would resolve the §3 question as **R**. That is a
guess, and it is recorded here as a guess so that the next reader can kill it rather than inherit it.

## 5. What a fix must do — the three clauses as registered

1. A field with `visibility:"readOnly"` must serialize `readOnly:true`. One object must not carry two
   contradictory answers to the same question.
2. `neo_create` / `neo_update` must **reject** a write to a read-only field with an IMP-5 envelope,
   not return 200 and drop it.
3. The `neo_schema` hint must document `visibility:"readOnly"`, since it currently documents only the
   key that gives the wrong answer.

**The trap worth naming explicitly**, because it is the tempting cheap fix: making the descriptor
self-consistent (clause 1 alone) closes the *contradiction* and leaves the *task* still failing. The
agent then reads `readOnly:true`, correctly declines to write, and still cannot set a product's price
— with nothing in the response saying where it can. A response that merely looks compliant is not
what this item is for.

Equally: do **not** fold clause 2 into IMP-18. IMP-18 is "report unknown names"; this is "reject a
known name the caller may not write". The messages differ and so does the verdict for the agent.

## 6. `Done when:`

- [ ] The §3 question is answered with evidence (source + DB), and the answer is written here.
- [ ] `readOnly` and `visibility` never disagree on any field of any spec — pinned by a test that
      asserts the invariant, not by a spot check on `product/header`.
- [ ] A write to a read-only field returns an IMP-5 envelope naming the field, instead of 200.
- [ ] The `neo_schema` hint documents `visibility`, and no longer tells the agent to stop looking when
      the field it needs is reachable elsewhere.
- [ ] Re-measured by a `/mcp-comparison` run (job A or B) with **frozen-suite task 3 either completing
      or failing with an error that says why**. The registry status moves only then, and only there.

---

## 7. Investigation, 2026-08-13 — §3 answered, hypotheses resolved

Read-only pass: source read in `com.etendoerp.go`, `SELECT`-only queries against the local tenant.
No code changed.

### 7.1 The triggers — found, and they are not where §3's answer assumed

The human's answer (reading **R**) is confirmed, but the mechanism is not a trigger on `m_product`.
There is **no trigger on `m_product`** maintaining these columns — its only triggers are the generic
AD audit ones. The real mechanism is Etendo's **stored computed column** framework: a trigger on each
*source* table marks the product dirty in `AD_STOREDCOLUMN_DIRTY`, keyed by the target
`AD_Column_ID`.

| Column | `AD_Column_ID` | Trigger on | Fires on | `REFRESH_MODE` |
|---|---|---|---|---|
| `EM_ETGO_Sale_Price` | `E307979CE47A48BAAA63F411BDBD0A29` | `m_productprice` | `AFTER INSERT/UPDATE OF pricestd, m_pricelist_version_id` | `S` |
| `EM_ETGO_Purchase_Price` | `4E5E594900C84D10B02E12D254388499` | `m_productprice` | same | `S` |
| `EM_ETGO_Stock` | `8FC9A2CD267543C994F4F8F8BF8A02CC` | `m_storage_detail` | `AFTER INSERT/UPDATE OF qtyonhand` | `Q` |

`AD_Column.computation_function` confirms the source of each: `etgo_product_sale_price` reads
`m_productprice` → `m_pricelist_version` → `m_pricelist` filtered `issopricelist='Y'`,
`etgo_product_purchase_price` is the purchase-list mirror, `etgo_product_stock` sums
`m_storage_detail.qtyonhand`.

**So the value's real home is: price → `product/price` (`M_ProductPrice`), stock → `product/stock`
(`M_Storage_Detail`).** Confirmed from the computation functions, not inferred.

### 7.2 The contradiction is a pure code defect — the AD metadata is correct

The §3 sub-question ("does `AD_Column.IsUpdatable` read `'Y'` or `'N'`?") is answered: **`'N'` for all
three columns.** The AD is right. The lie is entirely in the serializer.

`McpSchemaFieldBuilder.buildSchemaField()` (`McpSchemaFieldBuilder.java:456`) emits `readOnly` from
`isReadOnlyColumn(adTab, col)` (`:719-725`) — a hardcoded structural check covering **only** PK
column / `DocumentNo` / `isUseAutomaticSequence()`. It never reads `AD_Column.isUpdateable`, never
reads `readOnlyLogic`, and never reads the curated `SFField.isReadOnly()` sitting in the same DB row
that already backs `visibility`.

The decisive evidence that the correct source is already available: a sibling class,
`McpResourceProvider.buildFieldsArray()` (`McpResourceProvider.java:424`), computes `readOnly`
correctly as `Boolean.TRUE.equals(field.isReadOnly())` over the same data. The DAL model is wired;
`neo_schema` simply does not consult it.

**This is a `com.etendoerp.go` code fix, not an AD data fix.**

### 7.3 Hypothesis verdicts (§4)

| # | Verdict | Evidence |
|---|---|---|
| H1 | **Confirmed**, with more precision than stated | `readOnly` and `visibility` do come from two different sources, but `readOnly`'s source is a hardcoded structural predicate (`:719-725`), not a second DB column |
| H2 | **Refuted as worded** | `readOnly` is not computed from `isUpdateable`/`readOnlyLogic` at all — it ignores both |
| H3 | **No longer interesting** | The human answered reading R; the drop is correct behaviour, done silently |
| H4 | **Confirmed** | `view:"create"`'s exclusion already keys off `visibility` correctly and is unaffected by this bug |

### 7.4 Revised fix scope — `com.etendoerp.go` only

No `schema_forge_core` change: the correct `isReadOnly` already flows through `push-to-neo.js` into
`SFField`.

1. `McpSchemaFieldBuilder.buildSchemaField`/`loadFieldMetadata` — extend `FieldMetadata` with a
   `readOnlyByColumnId` map sourced from `SFField.isReadOnly()` (mirroring the existing
   `businessCriticalByColumnId` pattern), and OR it into the `readOnly` key. **Do not remove the
   structural check** — it still correctly catches PK/`DocumentNo`/sequence columns that may have no
   `SFField` row at all.
2. `NeoFieldFilter.filterCreateRequest` — reject with an IMP-5 envelope when a field is
   `included` + `isReadOnly=Y` + has no `defaultExpression`/`defaultSource`, instead of silently
   passing it through. Keep the passthrough for genuinely default-carrying read-only fields (e.g.
   `transactionDocument`, `bookQuantity` — `InventoryLineHandler.java:176`).
3. `McpSchemaCreateView.CREATE_HINT` — name `visibility` as authoritative and soften *"do not call
   `neo_schema` again"*.

**Must not touch:** `isAgentSuppliable` / `view:"create"`'s filter (already correct),
`filterWriteRequest`'s `writable` set (already strips these on PATCH), `ProductPriceHandler` (works),
and `product/stock`'s write configuration — see §7.5, which is a different item.

### 7.5 Two things this investigation surfaced that are **not** IMP-28

**(a) `product/price` is a real, working write path.** Entity `product/price` → tab "Price" → table
`M_ProductPrice`, configured `isPost/isPut/isPatch/isIncluded = Y` under spec
`666574323DCC40D980C937AE6B34935D`, backed by `ProductPriceHandler`
(`java_qualifier: productPriceHandler`) which injects missing `product`/`priceLimit`/
`priceListVersion` defaults before the generic write. This is where an agent should be pointed for
setting a sale or purchase price; `issopricelist` on the price list distinguishes the two.

**(b) `product/stock` is configured writable and is not safely writable.** Entity `product/stock` →
table `M_Storage_Detail`, also `isPost/isPut/isPatch = Y`, backed by
`ProductStockWarehouseHandler` — but that handler **only intercepts GET-list** (its javadoc,
`ProductStockWarehouseHandler.java:41`; `handle()` returns `null` for anything else, `:72-87`). A
POST/PUT/PATCH therefore falls through to the generic `NeoCrudHandler` and attempts a raw DAL write
directly on `M_Storage_Detail`.

That is not how Etendo maintains stock. `M_Storage_Detail` is a materialized position populated
through `M_Transaction`-generating documents — goods receipt (`M_InOut`), physical inventory
(`M_Inventory`), internal movement (`M_Movement`). A raw insert bypasses the transaction ledger and
the costing columns alongside it (`em_etgo_valuation`, `em_etgo_cost`). The `isPost/isPut/isPatch=Y`
config **looks safe and is not backed by a handler that makes it safe**.

> **Downgraded 2026-08-13, same day, by a live read — the paragraph above overstates (b) and is kept
> visible per the no-rewriting rule.** `neo_schema` on `product/stock` with `view:"create"` returns
> **`required: []`, `optional: []` — zero writable fields**. Every field on the entity carries
> `visibility` of `readOnly` or `system`, and `NeoFieldFilter` keys off `visibility` correctly (H4),
> so it strips the entire payload. A POST therefore cannot carry a single caller-supplied value: it
> would attempt an empty `M_Storage_Detail` insert and fail against the table's NOT NULL and FK
> constraints before reaching any data. **The ledger cannot be bypassed this way and no fabricated
> stock figure can land**, so the "landmine"/P1 framing is wrong.
>
> The source trace behind it is still correct — `ProductStockWarehouseHandler` really does intercept
> GET-list only — but the investigation stopped at the handler and never checked whether any field
> survives the filter upstream of it. It does not. Recorded because a correct trace supporting a wrong
> conclusion is the informative part.
>
> **What actually remains is small:** the entity advertises `methods: ["GET","POST","PUT","DELETE"]`
> while having no writable field, so an agent that tries a write gets a raw DAL/DB failure instead of
> a clean "this entity is read-only". That is the same failure class as this item's own clause 2
> (reject with an IMP-5 envelope rather than fail obscurely) and should be handled there — **not a new
> item.** Note the entity also reproduces this item's core bug: `quantityOnHand` returns
> `"visibility":"readOnly"` with `"readOnly": false`, confirming the serializer defect is not specific
> to `product/header`.

Item (a) belongs in a **new item**, not folded here: a `writableVia` pointer is a *mechanism* many
derived read-only fields would use, distinct from this item's one-line serializer fix. Proposed to the
human; **not registered by this pass.** Item (b) is downgraded into this item's clause 2 per the note
above and needs no number.

### 7.6 The trap, restated sharper than §5

Clause 1 alone makes `readOnly:true` agree with `visibility:"readOnly"` and stops there. Task 3 still
fails — now with a self-consistent contract and **zero** indication that the price lives in
`product/price`, a real working write path one call away, or that `product/stock` writes are a
landmine the config advertises as fine.

### 7.7 Could not verify

- The exact mechanism draining `REFRESH_MODE='S'` rows from `AD_STOREDCOLUMN_DIRTY` synchronously,
  versus `StoredColumnQueueProcessor` for `'Q'`. Not load-bearing for this item.
- Whether `em_etgo_valuation` / `em_etgo_cost` on `M_Storage_Detail` are themselves stored-computed
  (`AD_Column.computation_function` not checked). Affects only the severity sizing of §7.5(b).

---

## 8. Config half shipped, 2026-08-13 — 13 derived entities stop advertising writes

**Status unchanged. No re-measurement was run, so no mark moves and MARI stays at 79.** This section
records a change that landed in `schema_forge`, human-authorized, while this item's Java clauses 2–3
were still open.

### 8.1 What the §7.5(b) downgrade generalized into

The downgrade note above established that `product/stock` advertises `methods:
["GET","POST","PUT","DELETE"]` while `view:"create"` returns `required: []`, `optional: []`. A
`SELECT` over `ETGO_SF_ENTITY`/`ETGO_SF_FIELD` on `etendo-go-local` showed **`product/stock` is not
special: 18 included entities have `isPost='Y'` with zero writable fields.**

They do not all mean the same thing, and that distinction is the whole content of this section:

| Group | Count | What "zero writable fields" means | Action |
|---|---|---|---|
| SQL views | 3 | An INSERT is physically impossible | declared read-only |
| Engine-populated tables | 10 | Written by document processing / posting / tax engine / sync | declared read-only |
| Probably mis-curated | 4 | The entity *is* writable and the curation is wrong | **left alone deliberately** |
| Undecided | 1 | `financial-account/reconciliations` — real table, but created by a process | left for a human |

Declared read-only via `entities.<key>.readOnly: true` in `decisions.json`, which resolves through
`lib/entity-methods.js` to exactly `["GET","GETBYID"]`; that file enforces a GET/GETBYID-always-granted
invariant, so read access cannot be dropped by this mechanism. Verified in all 7 regenerated
`contract.json`: 13 × `get: true`, `post/put/patch/delete: false`. `sf-validate-pipeline` clean on
all 7 specs.

The 13: `purchase-order/{lineTax,reservedStock,paymentDetails}`, `financial-account/clearedItems`,
`end-year-close/accounting`, `warehouse/productTransactions`, `product/{stock,costing,transactions}`,
`purchase-invoice/{tax,accounting,batuz}`, `sii-config/logHash`.

Two mechanical notes for whoever touches these next: `reservedStock` lives under the `decisions.json`
key **`prereservedQty`** (AD tab "Prereserved Qty", remapped via `"name"`), and `batuz` / `logHash`
had **no entity entry at all** — they were served on the window-level default and needed new entries.

### 8.2 Why the mis-curated four were **not** touched — this is the load-bearing part

`user/userRoles`, `contacts/employeeAccounting`, `return-from-customer/relatedProducts` and
`/relatedServices` match the same query and were excluded on purpose.

`user/userRoles` is the proof that the two groups are indistinguishable in code: `AD_Role_ID` and
`Is_Role_Admin` are `AD_Column.isupdateable='Y'`, and assigning a role to a user is plainly a real
operation. Its zero-writable-field count is a **curation defect**, not a property of the entity.

This is also what **killed the originally-registered clause 4** (derive `methods` from whether any
writable field survives the filter). A derived rule cannot tell "genuinely derived" from
"mis-curated": it would have silently withdrawn POST from `user/userRoles` and made the curation bug
*invisible* — while another team was actively working that area. The rule would have looked like a
safety improvement and functioned as a bug-concealer. **Clause 4 is cancelled, by evidence, not by
descoping.**

### 8.3 A stale doc had recorded this fix as impossible

`docs/generated-custom-windows/financial-account.md` stated that entity-level read-only *cannot* be
enforced — that `ETGO_SF_ENTITY` has no such flag, that `push-to-neo` forces
`ISPOST/ISPUT/ISPATCH/ISDELETE='Y'` with no `decisions.json` knob, and that closing it would need a
new option in the `schema_forge_core` CLI. **All false since ETP-4254**, which shipped exactly the
knob used above. Corrected in the same change, along with notes in `warehouse.md` and
`purchase-order.md`.

Worth recording as a failure mode in its own right: the blocker here was not a missing mechanism but
a document asserting the mechanism did not exist. That is cheaper to produce and much more expensive
to detect than a code bug.

### 8.4 What this does and does not close

- **Does not close this item.** The serializer defect (clause 1) is field-level: `quantityOnHand`
  still returns `"visibility":"readOnly"` with `"readOnly": false`. Config cannot fix that.
- **Does reduce clause 2's blast radius.** The 13 entities will no longer advertise a write verb at
  all, so the empty-payload path is reachable on fewer entities — but clause 2 is still needed as the
  net for anything not covered by config, and its scope must **not** be widened on the strength of
  this change.
- **Clause 2 as implemented exempts handler-backed entities wholesale — including `product/stock`.**
  `NeoFieldFilter.forEntity` computes `entityHasHandler` from a non-blank `SFEntity.getJavaQualifier()`
  and passes it down so that *no* field of such an entity is ever added to `rejectableOnCreateFields`.
  The reasoning is sound — a `NeoHandler` pre-hook may legitimately inject a read-only value, as
  `InventoryLineHandler` does for `bookQuantity` — but the granularity is **per entity, not per
  field**, and `product/stock` is handler-backed (`ProductStockWarehouseHandler`). So the entity that
  motivated this investigation still answers a silent 200 to a read-only write; the payload is still
  stripped, so nothing false is stored, but the caller still gets no signal. Narrowing the exemption
  to the fields a handler actually supplies would need the handler to declare them, which no
  `NeoHandler` currently does. **Recorded as a known gap, not fixed.**
- ~~**Not live yet.**~~ **Live as of 2026-08-13, later the same day** — the human built, pushed and
  exported. Superseded rather than deleted, per this file's own rule. See §8.5.

### 8.5 Live verification, 2026-08-13 — clause 1 confirmed against the running server

Two spot checks after the human's build + `push-to-neo` + `export.database`. **This is a spot check,
not a re-measurement: it is one call on one entity, so no status moves and MARI stays at 79.** A job
A/B run is still what closes this item.

`SELECT` over `ETGO_SF_ENTITY` — all 13 entities now read
`ispost=N ispatch=N isput=N isdelete=N`. Then `neo_schema spec:"product" entity:"stock"
fields:["quantityOnHand"]` on `etendo-go-local`:

```json
{ "table": "M_Storage_Detail",
  "methods": ["GET"],
  "fields": [{ "name": "quantityOnHand", "readOnly": true, "visibility": "readOnly" }] }
```

Both halves of the day's work show up in that one response:

1. `"methods": ["GET"]` — was `["GET","POST","PUT","DELETE"]` in §2's observation. The config change
   (§8.1) is live.
2. **`"readOnly": true` next to `"visibility": "readOnly"` — this item's core defect is fixed.** §2
   recorded the same field returning `"readOnly": false` with `"visibility": "readOnly"`. Clause 1
   works on the running server, and on the entity §7.5's downgrade note used as its example, which is
   a different entity from the `product/header` one the original observation used — so the fix is
   confirmed general, not `product/header`-specific.

**One thing this call surfaced that is not yet fixed:** the full-dump `hint` still reads *"Fields with
readOnly=true are auto-generated (DocumentNo, IDs)"*. That was accurate while `readOnly` meant only
the structural PK/`DocumentNo`/sequence check; after clause 1 it also means *curated read-only*, so
the hint now under-describes its own flag and an agent reading it would conclude `quantityOnHand` is
an auto-generated identifier. Clause 3 rewrote `McpSchemaCreateView.CREATE_HINT`, the `view:"create"`
hint — this is the **full-dump** hint, a different string, and it was not in the clause's scope.
Small, and worth folding into this item rather than numbering separately.

Not verified: whether a POST to a still-writable handler-backed entity now returns the clause-2 422
(no write probe was authorized in this session), and the §8.4 handler-exemption gap is unaffected by
any of the above.
