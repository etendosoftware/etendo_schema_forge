# IMP-18 — Report unknown names in a `fields` projection (`neo_list` / `neo_get`)

| | |
|---|---|
| **Registry row** | [`mcp-improvements-registry.md`](../mcp-improvements-registry.md) §3 — **P2**, cohort C3, 0 / 3, ⚙️ additive |
| **Specification** | [post-audit 2026-08-06](../mcp-comparison-post-audit-2026-08-06.md) §IMP-18 |
| **Evidence** | B8 (2026-08-06), **C15** (2026-08-10) — `fields:["salePrice","purchasePrice","stock"]` returns rows with those keys simply absent |
| **Repo** | `com.etendoerp.go` |
| **Depends on** | Nothing. The pattern to mirror (`unknownFields`) shipped with IMP-12 |
| **Implemented** | 2026-08-10 |

## 1. The defect

A projection is a whitelist, so a name that matches nothing and a name whose value is empty produce
the **same** response: the key is absent. The agent gets no signal to distinguish "you spelled it
wrong" from "this record has no value there", and the failure mode is not a lost byte — it is a
wrong conclusion about the data.

This was never a missing feature so much as a consistency defect. IMP-12 shipped `unknownFields` on
`neo_schema`'s own `fields` argument (see [IMP-12 §9.4](IMP-12.md), and §13.2 where the live probe
confirmed it echoes a typo). Same argument name, same tool family, two behaviours. The fix was
sitting one tool over.

It was also the cheapest item on the board relative to its effect: the **sole** remaining reason
frozen task 3 failed, so closing it alone moves M2 from 80 % to 100 %.

## 2. Where it lives — one choke point

`neo_list` and `neo_get` both delegate to a single method, and both already hold everything the fix
needs:

| | |
|---|---|
| Choke point | [`McpQuerySupport.applyProjection`](../../../../modules/com.etendoerp.go/src/com/etendoerp/go/mcp/McpQuerySupport.java) |
| Callers | `McpToolRouter.handleList` and `handleGet` — each with a live `NeoFieldFilter` it applied to the rows immediately before |
| Pure projection | [`McpFieldProjection`](../../../../modules/com.etendoerp.go/src/com/etendoerp/go/mcp/McpFieldProjection.java) — DAL-free, hence unit-testable |

## 3. The three decisions where the obvious implementation lies

**3.1 Validate against what the entity *can* emit, not against the rows returned.** Inspecting the
returned rows is the cheap implementation and it is wrong in the one case that matters: on an empty
result set no row can answer the question. That is precisely when a typo is most expensive — the
agent reads "no matches" and concludes the data is missing rather than that it asked wrong. So the
check is against a set derived from configuration, and it fires whether `data` has 200 rows or none.

**3.2 The emittable set is the spec's exposure, post-rename — not the DAL model.** Validating
against `ModelProvider`'s property list would pass names the caller can never actually receive: a
property the spec does not include, or one served under a `javaQualifier` alias, is as unreachable as
one that does not exist. `NeoFieldFilter` already owns that mapping, so it grew one accessor:

```java
public Set<String> emittableResponseKeys()   // included props → API keys; null when inactive
```

`null` for an inactive filter is deliberate and is not the same as "empty". An inactive filter means
the response was **not** filtered, so the spec cannot answer the question at all and the DAL entity's
property list is the correct fallback. If neither source resolves, nothing is reported — silence
beats accusing a valid field.

**3.3 Only an explicit `fields:[…]` whitelist is judged.** A `view:"summary"` set is derived
server-side from properties that already resolved. An unknown name there would be our bug, not the
caller's, and reporting it would blame the wrong party.

## 4. The second hole, found while fixing the first

`apply()` compared each row key's *base* property against the *raw* requested name. So
`fields:["businessPartner$_identifier"]` matched nothing and returned a row of nothing but `id` —
silently, the very defect this item is about, in the path that was supposed to be the good one. And
once §3 landed, that name would additionally have been reported as unknown: a defect on our side
dressed up as a caller typo.

Fixed by normalising requested names through `McpDefaultsView.baseProperty` **once**, before both the
projection and the validation, so the two can never disagree. Asking for the companion now returns
the FK *and* its label.

## 5. What landed

| File | Change |
|---|---|
| `McpFieldProjection.java` | `baseNames()` (normalisation, §4) and `reportUnknownFields()` (sorted, attached to `response`) |
| `McpQuerySupport.java` | `applyProjection` takes the `NeoFieldFilter`; `emittableBaseNames()` resolves the spec-then-DAL fallback |
| `McpToolRouter.java` | both call sites pass their existing `fieldFilter` |
| `ToolRegistry.java` | `fields` descriptions on `neo_list` / `neo_get` now name `unknownFields`, mirroring `neo_schema`'s wording |
| `docs/neo-headless.md` | new §4.12.5 |
| `McpFieldProjectionTest.java`, `NeoFieldFilterTest.java` | 10 new tests, incl. the empty-result-set case and the §4 companion regression |

Response shape:

```json
{
  "response": {
    "data": [ { "id": "…", "documentNo": "INV-1" } ],
    "unknownFields": ["totalGross"]
  }
}
```

`unknownFields`, not a new `warnings` array — the whole point of the item is that one argument name
had two behaviours, and a differently-named report would have left it that way.

## 6. Done when

- [x] An unknown name in `fields:[…]` comes back in the response's top-level `unknownFields` on both tools
- [x] It comes back on an empty result set too (§3.1)
- [x] A name the spec does not expose is reported even though the DAL has it (§3.2)
- [x] `view:"summary"` is never judged (§3.3)
- [x] `fields:["<fk>$_identifier"]` returns the FK and its label (§4)
- [x] Clean call adds no key — the default response is byte-identical to before
- [x] Unit tests green (50/50 across both test classes, run standalone against the deployed jars)
- [x] **Verified live** on `etendo-go-local` after a user-run compile + deploy — see §7
- [x] `./gradlew test` on the full module — run by the user 2026-08-10, green
- [ ] Corpus row for `neo_list`/`neo_get` in `etendo-go-docs` mentions `unknownFields` (separate
      repo → separate PR, and delivery needs a Context7 reindex — see [IMP-14](IMP-14.md))
  - **Drafted 2026-08-13**, uncommitted in the `etendo-go-docs` working tree — see §8. Left
    unticked deliberately: text in a working tree is not a corpus an agent can read.

## 7. Live verification (2026-08-10, after a user-run compile + deploy)

Six read-only probes; no writes, so no record was touched.

| # | Probe | Result |
|---|---|---|
| 1 | **C15** — `neo_list product/product fields:["salePrice","purchasePrice","stock"]` | `unknownFields:["purchasePrice","salePrice","stock"]`, `data:[{id}]` |
| 2 | Empty result set — `fields:["salePrice","name"]` + a filter matching nothing | `data:[]` **and** `unknownFields:["salePrice"]`; `name` correctly not reported |
| 3 | Alias — `sales-invoice/header fields:["dateAcct","accountingDate"]` | `unknownFields:["dateAcct"]`, `accountingDate:"2026-04-16"` returned |
| 4 | Companion — `fields:["businessPartner$_identifier"]` | FK **and** label returned (`businessPartner` + `businessPartner$_identifier`) |
| 5 | `neo_get` — `fields:["documentNo","grandTotalAmount","totalGross"]` | `unknownFields:["totalGross"]` — same contract as `neo_list` |
| 6 | Clean `fields:["name"]` and `view:"summary"` | no key added; default response untouched |

**Probe 3 is the one that discriminates the design, and it is why §3.2 is not a stylistic
preference.** `dateAcct` is a *real DAL property* — a validation against `ModelProvider`'s property
list would have accepted it in silence, leaving the agent with exactly the unanswered question this
item exists to close, because the spec serves that column as `accountingDate`. It comes back
reported, which demonstrates by observation that the emittable set is the spec's post-rename
exposure rather than the model. **Probe 2 is the other one**: it is the case where a
row-inspecting implementation goes quiet, and the only one where the typo makes an agent conclude
"there is no data" instead of "I asked wrong".

Note, not a defect: the MCP client's cached tool list still showed the pre-fix `fields` descriptions
during this run — the client fetches the listing once at session start. The server serves the
updated `ToolRegistry` text; it becomes visible in the next session.

## 8. The corpus row — drafted, not delivered (2026-08-13)

Two pages in `etendo-go-docs` carry the addition, both **extended rather than created**:

| Page | Addition |
|---|---|
| `agentic/mcp/index.md` | the `neo_list`/`neo_get` row of the response-shaping table, and a new Error-handling row |
| `agentic/agent-manual.md` | a new Error-handling row, phrased as a normative agent action |

Both pages needed it independently, which is a property of the corpus rather than duplication:
`AGENTS.md` requires each `agentic/` page to stand alone ("do not rely on content from other
agentic pages"), so a cross-reference would have left whichever page Context7 retrieved incomplete.
Only `agentic/` is indexed — `docs/` is the human MkDocs site and was correctly left alone.

The draft first said the key was `response.unknownFields`. A live call says otherwise:

```
neo_list sales-order/header fields:["documentNo","salePrice","notAField"] limit:1
  → { startRow: 0, endRow: 0, totalRows: 2,
      data: [ { id: …, documentNo: "1000011" } ],
      unknownFields: [ "notAField", "salePrice" ] }
```

In what an MCP client actually receives, `unknownFields` is **top-level**, sorted, and sits beside
`data`. §5's shape above is not wrong — it draws the servlet's own `response` envelope — but the
corpus is read by agents holding the unwrapped result, and telling them to look under `response.`
sends them hunting for an object that is not there. Corrected in both pages, and in §6's line, which
is where the draft got the phrasing.

Worth naming the failure mode: the draft was cross-checked against `neo-headless.md` and agreed with
it, because both describe the same layer. Document-to-document agreement was never going to catch a
layer mismatch. Only the call did.

Delivery still needs a commit, a PR in that repo, and the Context7 reindex ([IMP-14](IMP-14.md)) —
none of which this run performed.
