# MCP comparison — post-audit run report, 2026-08-13 (**job A**, wave verification)

> **This is the second run report dated 2026-08-13.** The other one
> ([`mcp-comparison-post-audit-2026-08-13.md`](mcp-comparison-post-audit-2026-08-13.md)) is the
> **job B** full re-benchmark against build `8f0d1cce`. This file is the **job A** verification run
> against build `0cb67084`, executed after the job B findings were committed. The two are separate
> runs with separate evidence; do not merge their numbers.

| | |
|---|---|
| **Job** | A — verify a shipped wave |
| **Target** | `etendo-go-local` (`http://localhost:3100/mcp`) — **single target** |
| **Build** | `0cb67084` (com.etendoerp.go), deploy freshness verified with `javap` on the deployed WAR *before* the first probe |
| **Mode** | **Write-probe mode**, authorized by the human for this run, `etendo-go-local` only |
| **Holded** | **Not written to.** Read-side comparison only — see §2.3 |
| **Status of record** | The registry ([`mcp-improvements-registry.md`](mcp-improvements-registry.md)) — this file states only what *changed* |

---

## 1. Verdict

The wave verified. Four items advanced on live evidence and **MARI moved 79 → 80**.

But the headline result of this run is not a status flip — it is a defect. IMP-28 clause 2 (*reject a
client-sent value on a curated read-only field*) is **implemented, unit-tested, green, and
unreachable from the verb it was written for**. `neo_create` accepted `grandTotalAmount: 9999` and
`documentStatus: "CO"` on a zero-line draft order and persisted both. Two independent causes were
root-caused in source and DB and registered as **IMP-30** and **IMP-31**.

That is worth stating plainly because of how it was almost missed: before probing, IMP-28 was read as
shipped on the strength of the discover half verifying live plus a green unit suite. Both of those
observations were true and neither said anything about the path that matters. **A green unit test on
a method with no caller is not evidence of delivery** — the two halves of IMP-28 travel different
code paths.

The complementary finding is the good one, and it is a *refutation* of the item's own fear: read-only
**entities** are properly protected. `neo_update` on `product/stock` returns **405** with a message
an agent can act on without a retry. The gap is read-only **fields on writable entities**, which have
no protection at all.

---

## 2. Method & Scope

### 2.1 Mode

**Write-probe mode.** The human authorized the full W1–W6 write-probe suite for this run, on
`etendo-go-local`. The read-only claim ("no records were mutated") **does not apply to this run** and
is replaced by the disposition table below.

Rules honoured: every created record carries `MCP-BENCHMARK 2026-08-13` in its description; no
pre-existing record was mutated; no completion or posting action was fired (`documentAction` /
`posted` were never sent); `neo_delete` was used **only** on records this run created.

### 2.2 Records created and their disposition

Five records were created. **All five were deleted**, each returning `{"deleted": true}`. Nothing was
left behind.

| # | Record | `documentNo` | Created by | Disposition |
|---|---|---|---|---|
| 1 | `A1A70B63D6FF420BA01DDECA83D2DD02` | 1000033 | W1 — FK-resolution / baseline create | deleted ✅ |
| 2 | `574B3EB39ECA44F894F6FFE5286224B4` | 1000034 | IMP-24 unambiguous control (`orderDate: "25-08-2026"`) | deleted ✅ |
| 3 | `713FFA549C9845CAA2CCC85BE24CAB32` | 1000035 | IMP-28 read-only write probe — **the defect** | deleted ✅ |
| 4 | `29ED6177EF9142008892245B5F87E6F9` | 1000036 | IMP-17 callout probe (`orderDate: "2019-01-15"`) | deleted ✅ |
| 5 | `A16576B399E843E48CE24C94A99CC143` | 1000037 | IMP-18 write-verb `unknownFields` probe | deleted ✅ |

Record 4 is worth flagging: the probe was **meant to fail**. Sending a 2019 date was expected to trip
a period-closed callout so the error envelope could be inspected. The tenant had an open 2019 period,
so the create *succeeded* instead. It was deleted immediately, and the callout half of IMP-17 is
therefore **not** exercised by this run — the item is carried by its two routing errors instead
(§5, A2 and A7). Recorded rather than quietly dropped, because "the probe didn't fail" is a different
outcome from "the probe passed".

### 2.3 Holded was not probed — and what that costs

The authorization named `etendo-go-local`. It did not name the Holded demo tenant, and a previous
run's authorization does not carry forward. So **no write was issued to Holded**, and:

- **M2-Holded is carried from job B, not re-measured.** It is footnoted as such in registry §2.1.
- The **Write-Holded** probe surface is marked ⚠️ for this run in registry §2.5, with the reason.
- No write finding in this report is stated as a *comparison* against Holded. The skill's
  "both sides or neither, per finding" rule is satisfied by not making the comparison, rather than
  by pairing a live Etendo write against quoted Holded documentation.

M1 and M2 for Etendo GO are likewise **carried**, not re-measured: job A probed write *behaviour*
(what the server accepts and rejects), not first-call *cost* on the frozen suite. One incidental
cost observation is recorded as a shadow figure in registry §2.1 footnote ⁸ and **excluded** from the
metric: the `sales-order` create cost **6 calls cold**, with the first `neo_create` failing 422
`not_found` on `invoiceAddress`.

---

## 3. Delta against the registry

* **Advanced IMP-17** — routing errors verified live inside the IMP-5 envelope, carrying `available`,
  `field`, `hint` and `tool`. Callout half not exercised (§2.2). 0 → 3/3, ✅.
* **Advanced IMP-18** — read half confirmed, **write half confirmed still open**. 0 → 1.5/3, ⚠️.
* **Advanced IMP-24** — ambiguity rejection verified on `neo_create` **and** `neo_update`, closing the
  checkbox that was blocked on the update verb. `neo_batch` clause unprobed. 0 → 2.5/5, ⚠️.
* **Advanced IMP-28** — entity half verified, field half failed. ⏳ open → ⚠️ partial, 0 → 2.5/5.
* **Added IMP-30** — `neo_create` bypasses the read-only rejection path entirely (P1, ♻️).
* **Added IMP-31** — the `Java_Qualifier` read-only exemption is all-or-nothing per entity (P1, ⚙️).
* **Added IMP-32** — `_identifier` renders dates day-first while the API demands ISO on input (P2, ♻️).
* **Added IMP-33** — write-verb routing errors send the agent to the *reading* docs topic (P3, ♻️).

The last two were registered **after** this run closed, once the human froze the quota (§7.4). They
are listed here so §3 stays the complete delta for the day; neither moved MARI.

### 3.0 What was updated outside the registry

- **Base report §8** gained strength #10 — the read-only-entity method gate, quoting A8 verbatim —
  and the `businessCritical` example now carries a warning that it is a *signal, not a barrier*,
  because A9 wrote the very field that example uses.
- **Base report §10** gained a "registered after ETP-4601" P1 block naming IMP-30 and IMP-31, with a
  note that the original three lists cover the §7 wave only and that the registry is the current list.
- **Base report §12** was **not** extended. It stopped being maintained around IMP-25 — IMP-26 … IMP-29
  have no §12 entry either, their specifications living in `imps/` and the registry instead. Adding
  entries only for IMP-30/31 would make §12 look current when it is not. Recorded here as an
  observation rather than fixed unilaterally; §12's fate is a human call.

### 3.1 A correction made during this run

Mid-run I told the user *"IMP-18 ya no reproduce"* on the strength of a `neo_list` probe. That was
wrong: the registered gap is in the **write** verbs, and `neo_list` is the half that already works.
The write verbs were then probed and the gap **does** reproduce (§5, A5–A6). The claim is recorded
here rather than silently replaced, per the skill's rule on superseded diagnoses.

### 3.2 The three `Pts`/`Status` mismatches are settled

Job B deliberately left IMP-17, IMP-18 and IMP-24 scored 0 despite carrying ✅/⚠️ marks, and reported
them as owed by the human — because correcting a `Pts` cell to match a mark that has not been
re-measured is precisely the self-award the registry exists to prevent. **Job A re-measured them, so
the points are now earned rather than assumed.** The total is **+9.5**, not the +7 job B projected;
the extra 2.5 is IMP-28, which job B did not anticipate measuring. **The 7-point figure quoted in the
job B report is superseded by 9.5.** Nothing on that list is owed by the human any more.

---

## 4. Probe-surface coverage

Six surfaces (registry §2.5). A surface this run did not touch stays covered by prior evidence — the
precedent set 2026-08-10.

| Surface | 08-13 (A) | Note |
|---|---|---|
| Read verbs | ✅ | `neo_list`, `neo_get`, `neo_schema`, `neo_discover` all exercised |
| Write — Etendo | ⚠️ | `neo_create` / `neo_update` / `neo_delete` probed live; **`neo_batch` not re-probed** |
| Write — Holded | ⚠️ | Not probed — outside this run's authorization (§2.3) |
| `neo_update` | ✅ | Probed on a writable entity *and* on a read-only one (405) |
| `neo_action` | ⚠️ | Not exercised — no action may be fired that completes or posts a document |
| `neo_widget` / generators | ⚠️ | Not re-probed; carried from job B |

Coverage component of MARI = **6 / 6 → 100**: every surface is covered, four of them by this run's
own evidence and two by carried evidence, each annotated above.

---

## 5. Validation evidence

All calls against `etendo-go-local`, build `0cb67084`, 2026-08-13. Row numbers are local to this
report (prefix `A`) so they cannot collide with the base report's §11 numbering.

| # | Call | Result | Backs |
|---|---|---|---|
| A1 | `neo_create sales-order/header` with display names (`invoiceAddress: "Juan Perez"`) | **422** `not_found`, `field: "invoiceAddress"`, detail names the tool to use next (`neo_selectors`) | IMP-5 envelope live; the first of the 6 calls the cold create cost |
| A2 | `neo_create` called with `data:` instead of `fields:` | **422** `validation_error`, `field: "fields"`, `hint`, `seeAlso`, `tool: "neo_create"` | **IMP-17** — a routing error, fully wrapped |
| A3 | `neo_create sales-order/header`, `orderDate: "03-04-2026"` | **422** `validation_error`, `reason: "ambiguous"`, `candidates: ["2026-04-03","2026-03-04"]`, `expectedFormat`, `example`, `hint` — **no record created** | **IMP-24** |
| A4 | `neo_update sales-order/header`, `orderDate: "03-04-2026"` | **422**, identical envelope | **IMP-24** — closes the update-verb checkbox |
| A5 | `neo_create sales-order/header` with `esteCampoNoExiste: "x"` and `totalPaidAmount: 500` | **200**, record created, **no `unknownFields` key** | **IMP-18** — write half still open |
| A6 | `neo_update` on that record with the same two unknown names | **200**, **no `unknownFields` key** | **IMP-18** — same gap on the update verb |
| A7 | `neo_list sales-invoice/header`, `fields: [..., "esteCampoNoExiste"]` | **200** with `"unknownFields": ["esteCampoNoExiste","totalPaidAmount"]` | **IMP-18** — read half works |
| A8 | `neo_update product/stock` | **405** `method_not_allowed` — *"This entity is read-only by configuration … Do not retry this CRUD operation."* | **IMP-28** entity half — and a **refutation** of §8.4 |
| A9 | `neo_create sales-order/header` with `grandTotalAmount: 9999` and `documentStatus: "CO"` | **200** — both persisted verbatim on a zero-line, `processed: false` draft | **IMP-30**, **IMP-31** |
| A10 | `SELECT c.name, f.isincluded, f.isreadonly, f.visibility, f.defaultvalue …` on `etgo_sf_field` | Both fields `isincluded=Y, isreadonly=Y, visibility=readOnly`, `defaultvalue` NULL | Refutes the "config gap" hypothesis for A9 |
| A11 | Call-site search for `filterCreateRequest` across `com.etendoerp.go` | `NeoCrudHelper.java:201`, `NeoCrudHandler.java:626` — **zero in `src/com/etendoerp/go/mcp/`** | **IMP-30** root cause |
| A12 | `SELECT e.name, e.java_qualifier FROM etgo_sf_entity …` for `sales-order` | `header → salesOrderHeaderHandler`, `lines → orderLineHandler`, other 10 NULL | **IMP-31** root cause |
| A13 | 5 × `neo_delete` on the records of §2.2 | `{"deleted": true}` × 5 | Cleanup |

A8's message deserves quoting in full, because it is the single best error string either MCP produced
this run: it names the entity, names the spec, lists the enabled methods, explains *why*, points at
the two verbs that would work, notes that a separately configured `neo_action` might still exist, and
ends with an explicit **"Do not retry"**. That last clause is what stops an agent burning calls.

---

## 6. Defects

### 6.1 IMP-28 splits cleanly into a half that works and a half that does not

The item bundled two guarantees. This run separates them:

- **Read-only entities — works, and §8.4's prediction is refuted.** The item feared a silent 200 that
  looks like a successful write. What actually happens is A8's 405. This is a *strength*, and §8 of
  the base report should say so.
- **Read-only fields on writable entities — no protection whatsoever.** A9. This is where clause 2
  lives, and it never runs.

Clause 4 of the item remains open and unprobed.

### 6.2 IMP-30 — `neo_create` bypasses the read-only rejection path entirely

Full investigation: [`imps/IMP-30.md`](imps/IMP-30.md).

`McpToolRouter.handleCreate` builds a `NeoFieldFilter` (line 488) and uses it **only on the response**
(line 601). The request body goes through `mapFieldsToDalProperties`, which is pure name resolution
and carries no read-only logic — deliberately, per the comment at lines 492-494 ("accept all valid
table columns from AI agents"). That intent is about *unconfigured* columns and is worth preserving;
it is not the same as accepting a column the spec curates as **read-only**, and the code conflates
the two.

What makes this more than a routine miss is A11 + A10 together: the curation is correct, the
rejection is correct, the unit tests are green — and the two never meet on the MCP path.

The tempting cheap fix, named so it can be refused: making `neo_schema view:"create"` merely *omit*
these fields. That improves the hint and changes nothing about what the server accepts.

### 6.3 IMP-31 — the `Java_Qualifier` exemption is all-or-nothing per entity

Full investigation: [`imps/IMP-31.md`](imps/IMP-31.md).

Even with 6.2 fixed, A9 would still pass on this entity. `NeoFieldFilter` switches clause 2 off for an
**entire entity** as soon as it carries a `Java_Qualifier` (lines 156-157 → the `else if` at 222).
`sales-order/header` carries `salesOrderHeaderHandler` (A12), which dispatches clone/shipment/invoice
actions and never touches `documentStatus` or `grandTotalAmount`.

The naive fix — delete `!entityHasHandler` — breaks three handlers that legitimately rely on the
blanket (`InventoryLineHandler`'s `bookQuantity`, with a comment at line 176 saying so outright;
`AbstractInvoiceHeaderHandler:243`; `InvoiceLineHandler:89`). The per-field signal
`ETGO_SF_FIELD.java_qualifier` already exists in the schema and is the proposed replacement, with the
backfill sequenced **before** the code change.

**These two must land together**, or IMP-30's test must explicitly cover an entity with a qualifier.
Shipping IMP-30 alone produces a fix that looks complete in the diff while A9 still passes.

---

## 7. New improvement proposals (Step 3b)

Three candidates surfaced. **None was registered at the time the run closed**, and that was a
deliberate call rather than an oversight — see §7.4, which also records how it was resolved: 7.1 and
7.2 became **IMP-33** and **IMP-32** the same day, once the human froze the quota (registry §2.2.1).
7.3 is a documentation change and was never a registry candidate.

### 7.1 The `seeAlso` on a write-verb routing error points at the read docs

A2 returned, on a **`neo_create`** failure:

```json
"seeAlso": "docs(topic:\"reading records\")",
"tool": "neo_create"
```

The envelope correctly names the failing tool as a write verb and then sends the agent to the reading
topic. It is a one-line mapping bug in an otherwise excellent error. Cheap; low blast radius (♻️);
would be a **P3**.

### 7.2 `_identifier` renders dates day-first while the API demands ISO on input

A9's response carried `"_identifier": "1000035 - 13-08-2026 - 9999"`. The same run's A3 **rejects**
`03-04-2026` as ambiguous and instructs `yyyy-MM-dd`. So the server hands an agent a day-first date in
the human-readable field and refuses one on input. An agent that round-trips an identifier back into a
write — a plausible thing for an agent to do — gets a 422 for echoing what the server just said.

This is adjacent to IMP-16 (one date format across verbs) but distinct: IMP-16 is about the *write*
contract, this is about the *display* string contradicting it. Would be a **P2**, `com.etendoerp.go`.

### 7.3 A strength to promote into base report §8, not a defect

A8's 405 message (quoted in §5) is better than anything Holded returned this run, and IMP-28 §8.4
predicted the opposite. **Base report §8 should gain a numbered strength for the read-only-entity
method gate**, citing A8 verbatim. This costs no quota — it is a documentation change, and §8 is
exactly where "anything the wave took from Holded's column" belongs.

### 7.4 Why 7.1 and 7.2 were not registered — and how that was resolved the same day

**As written during the run:** the room check, run **before** promising anything, gave known scope
after IMP-30/31 of **123 against a quota of 126 — 3 points of reserve.** A P2 (3) plus a P3 (1) is 4.
**It did not fit.** Registering only 7.1 would have fit and left 2, but choosing *which* of two real
findings to record on the basis of what the denominator can absorb is the score deciding the
numbering — the exact failure the registry warns against. So both were written up unregistered, in
the state IMP-26 sat in until its re-base was authorised, and listed in §10.4 as owed by the human.

**Resolved the same day, and not by the re-base this section anticipated.** Presented with the
choice, the human ended the regime instead: **the quota is frozen at 126 for the rest of the period,
Delivery is uncapped, the scope-closed ceiling is retired, and MARI is redefined as a cumulative
score rather than a percentage of completeness** (registry §2.2.1, changelog entry of the same date).

The arithmetic that made this the right call is worth stating, because this section's own reasoning
was weaker than it looked: **a ⏳ row contributes 0 to `earned`, so registering one never moved MARI
at all.** The entire cost lived in the re-base — the ×1.20 multiplier widening the denominator — which
is a cost incurred by *recording* work rather than by failing to do it. Freeze the denominator and the
cost disappears completely. So:

- **7.1 is now IMP-33** (P3, `com.etendoerp.go`) and **7.2 is now IMP-32** (P2, `com.etendoerp.go`).
- Known scope 123 → **127**, one point past the frozen quota. Delivery is **unchanged at 62** and MARI
  is **unchanged at 80** — registering both cost exactly nothing.
- **No future run will face this section's dilemma.** There is no room to check and no denominator to
  widen; a run finds a defect, numbers it, and moves on. The half of the old lesson that survives is
  the half that was never arithmetic: *do not let the score decide the numbering.* It now cannot.

---

## 8. Preference verdict

**For an agent doing write work against an ERP, Etendo GO is now the better MCP — and this run is the
first one where that is true for a reason other than breadth.**

The read-side case was already settled in earlier runs (generic verbs, introspection, a real
error envelope). What changed here is the *failure* behaviour. A3/A4's ambiguous-date rejection and
A8's 405 are both instances of the same discipline: **the server refuses to guess, and tells the agent
what to do instead.** Holded's tool surface has no equivalent — it ships ~200 hand-written tools whose
errors are per-endpoint and whose contract an agent cannot introspect.

Two honest qualifications, both against Etendo GO:

1. **The verdict is scoped to reads and to the write paths this run probed.** Holded was not written
   to (§2.3), so this is not a head-to-head write comparison.
2. **A9 is a real regression in trust, not a footnote.** Holded has nothing like a curated read-only
   field, so it cannot fail this way — its API simply has no such concept. "Etendo GO has a stronger
   model that isn't enforced on one path" beats "no model at all" for an agent that reads the schema,
   and loses badly for one that trusts the server to reject nonsense. Until IMP-30 and IMP-31 land,
   the second agent is the one writing accounting data.

One asymmetry from the read side worth carrying into the base report: **Holded exposes no read verb
for contacts.** It ships `create_contact`, `update_contact`, `delete_contact`, `bulk_archive_contacts`
and `bulk_delete_contacts` — and no way to *list* or *get* one. An agent can destroy a contact it
cannot read first. Etendo GO's read/write parity is structural, not a feature list.

---

## 9. Scorecard

| Metric | 08-13 (B) | 08-13 (A) | Note |
|---|---|---|---|
| **M1** — calls-to-outcome ratio | 1.0× | **1.0× carried** | Not re-measured; job A probed behaviour, not cost |
| **M2** — first-call success | 67 % | **67 % carried** | Not re-measured; Holded not probed at all |
| **M3** — weighted delivery | 68.0 / 126 → 54 | **77.5 / 126 → 62** | +9.5 earned, denominator frozen |
| **M4** — probe coverage | 6 / 6 | **6 / 6** | Four surfaces on this run's evidence, two carried (§4) |

The shadow cost figure, excluded from M1 by design: the `sales-order` create took **6 calls cold**,
the first `neo_create` failing 422 `not_found` on `invoiceAddress`. It is not on the frozen suite and
must not be mixed into the series.

---

## 10. Closing snapshot

> Read-only restatement of the registry. If anything here disagrees with
> [`mcp-improvements-registry.md`](mcp-improvements-registry.md), the registry is right and this
> section is a drift bug.

### 10.1 MARI

**MARI = 80** (previous: 79).

| Component | Weight | Value | Contribution |
|---|---|---|---|
| M2 — first-call success | 0.30 | 67 (carried) | 20.1 |
| M1 — calls-to-outcome (100 / 1.0×) | 0.30 | 100 (carried) | 30.0 |
| Delivery — 77.5 / 126 | 0.25 | 61.5 | 15.4 |
| Coverage — 6 / 6 | 0.15 | 100 | 15.0 |
| | | | **80.5 → 80** |

**KR verdict: met and holding.** The KR was cleared on 2026-08-10 (49 → 73) and has not fallen since.
The +1 this run is small on purpose: **9.5 points were earned and 10 points of new scope were
registered**, which is what a healthy verification run looks like — it finds roughly as much as it
closes.

**Reading the move by component**, as registry §2.2.1 now requires: the entire +1 came from
**Delivery** (54 → 62). **M1 and M2 were carried, not re-measured**, so this run makes **no claim that
the product got better for an agent** — it claims that more of the known backlog is now verified as
closed. That distinction is the whole point of the convention; a run that moves only Delivery is
bookkeeping, however welcome.

> **Superseded the same day:** this section originally closed with *"Scope-closed ceiling is now 90
> (was 88); that rise is the reserve draining, not new headroom."* The ceiling was **retired** hours
> later (registry §2.2.1) — a number that needed that same disclaimer on every single move was costing
> more to explain than it was worth. Its replacement is **open debt**: `known scope − earned` =
> 127 − 77.5 = **49.5 points**, which falls only by shipping and rises only by discovery. MARI itself
> is unchanged at 80; only the frame around it moved.

### 10.2 ACE (companion index, not part of MARI)

**Carried from job B, not re-measured this run.** ACE-p remains **blocked** — `tools/list` returns 401
on the comparison target. ACE-v sits at roughly **14× median**. Job A does not move either component;
they are measured in job B runs.

### 10.3 The whole board — 33 registered items

**Resolved (16)**

| Item | | What it is |
|---|---|---|
| IMP-2 | ✅ 5/5 | Ask for just the fields you need instead of getting the whole record |
| IMP-3 | ✅ 5/5 | Query by business meaning — named filters and range operators on list |
| IMP-5 | ✅ 5/5 | Errors say what went wrong, in which field, and what to do next |
| IMP-6 | ✅ 3/3 | Discovery can show only the actions, without the field dump |
| IMP-8 | ✅ 3/3 | Selector accepts the argument name agents actually send, and corrects itself |
| IMP-9 | ✅ 3/3 | Discovery names which entity is the document's main one |
| IMP-10 | ✅ 5/5 | The docs tool is first-class and its tool names match reality |
| IMP-11 | ✅ 5/5 | Every field descriptor states whether it is visible and whether it is required |
| IMP-12 | ✅ 5/5 | Schema can return just the writable subset instead of a 62 KB dump |
| IMP-15 | ✅ 5/5 | All write verbs accept foreign keys the same way |
| IMP-17 | ✅ 3/3 | Callout and routing errors use the same structured envelope as the rest |
| IMP-19 | ✅ 3/3 | The report generators declare a typed contract |
| IMP-21 | ✅ 3/3 | The actions catalog is curated instead of dumping everything AD has |
| IMP-22 | ✅ 3/3 | Context-dependent foreign keys resolve by display name on the first call |
| IMP-23 | ✅ 5/5 | Batch is genuinely atomic, or stops claiming to be |
| IMP-25 | ✅ 3/3 | Booleans come back as booleans, consistently |

**Pending — P1 (7)**

| Item | | What it is |
|---|---|---|
| IMP-30 | ⏳ 0/5 | Create accepts values on fields curated read-only, because the rejection has no caller on the MCP path |
| IMP-31 | ⏳ 0/5 | One handler on an entity exempts *every* field on it from that rejection |
| IMP-26 | ⏳ 0/5 | MCP and NEO describe the same field from two different DB columns, so they can disagree |
| IMP-1 | ⚠️ 2.5/5 | Field names are raw and carry no per-field prose an agent can read |
| IMP-16 | ⚠️ 2.5/5 | Date format is not the same across defaults and the write verbs; a real corruption is on disk |
| IMP-24 | ⚠️ 2.5/5 | Non-ISO dates are rejected rather than silently misparsed — done except on batch |
| IMP-28 | ⚠️ 2.5/5 | Visibility and read-only contradict each other; the create view hides fields that then get rejected |

**Pending — P2 (9)**

| Item | | What it is |
|---|---|---|
| IMP-13 | ⏳ 0/3 | Nothing marks which fields are business-critical, and named filters have no authoring path |
| IMP-20 | ⏳ 0/3 | Write verbs return the whole record with no way to ask for less |
| IMP-27 | ⏳ 0/3 | There is no per-field switch to say how MCP should treat a field |
| IMP-29 | ⏳ 0/3 | Entity identifiers come from AD tab names, so they change with the tenant's language |
| IMP-4 | ⚠️ 1.5/3 | Foreign keys can be given as human names on write — partly |
| IMP-7 | ⚠️ 1.5/3 | Defaults response is leaner and grouped — partly |
| IMP-14 | ⚠️ 1.5/3 | The published docs match the real tool names — partly |
| IMP-18 | ⚠️ 1.5/3 | Unknown field names are reported back; works on read, silently ignored on write |
| IMP-32 | ⏳ 0/3 | The human-readable identifier prints dates day-first, in the format the write verbs refuse |

**Pending — P3 (1)**

| Item | | What it is |
|---|---|---|
| IMP-33 | ⏳ 0/1 | A failed write points the agent at the docs topic for *reading* |

16 + 7 + 9 + 1 = **33** — every registered item, none omitted.

> **IMP-32 and IMP-33 were added after this report first closed**, once the quota was frozen (§7.4).
> They are the first P3 the board has carried, which is why the grouping gained a fourth table rather
> than folding a P3 in beside the P2s.

### 10.4 Owed by the human, not by a run

1. ~~**The quota decision.**~~ **Made, same day, after this report was written — see §7.4.** The human
   froze the quota at 126 permanently, uncapped Delivery, retired the scope-closed ceiling, and
   redefined MARI as a cumulative score rather than a percentage (registry §2.2.1). §7's two findings
   were registered as **IMP-32** (P2) and **IMP-33** (P3) at zero MARI cost, taking known scope to
   **127** — one point past the frozen quota, which is now a recorded fact rather than a trigger.
   Nothing here is owed any more.
2. **Ship IMP-30 and IMP-31 together.** §6.3 explains why either alone is a fix that looks complete
   and is not.
3. **`schema_forge` is committed and unpushed** on `feature/ETP-4793`; `com.etendoerp.go` `0cb67084`
   is already pushed. This skill does not push.
4. **`neo_batch` and `neo_action` remain unprobed** for the read-only-field question. `neo_action` will
   stay that way under the current rules: the actions worth probing complete or post documents.
5. **ACE-p is still blocked** on the 401 at `tools/list`. It has been blocked across several runs and
   will not unblock itself.
