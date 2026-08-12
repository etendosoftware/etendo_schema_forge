# IMP-5 — Explicit not-found + structured validation errors

**Registry row:** `mcp-improvements-registry.md` → IMP-5 (P1, C1, 2.5 / 5, `com.etendoerp.go`).
**Registered:** base §12 run, from evidence **A5, A8, W4**.
**Status:** clauses **(i)** and **(iv)** implemented and **both verified live** 2026-08-12 (§6). Registry row
stays ⚠️ for clause (iii)'s surviving **success**-body asymmetry. Score unchanged pending a
`/mcp-comparison` re-measure.

Status lives only in the registry; this file describes the work.

This file is opened late in the item's life: the named gap and clauses (ii) and (iii)'s error half
were closed by IMP-15 and IMP-17 and are documented there. §1 exists so the clause numbering has a
home; §3 onward is the 2026-08-12 work.

---

## 1. The five clauses and where each was settled

| # | Clause | Settled by |
|---|---|---|
| — | Raw DAL `status:-4` leaking from `neo_batch` | IMP-15, verified live 2026-08-10 (C10) |
| i | An FK-resolution batch failure returns a flattened body with **no `committed` key** (C9) | **here, §5** |
| ii | Unknown named filter arrives as a raw `Error executing neo_list: …` string (C14) | IMP-17, verified live |
| iii | Read-verb responses wrapped `{"response":{…}}`, write-verb bare | error half: IMP-17 §8.6 · **success half open** |
| iv | A report **handler's own** errors are not enveloped | **here, §4** |

Clause (iii) is the reason the row is still ⚠️. IMP-17 §8.6 measured it rather than guessing: every
read *error* comes back flat, every read *success* is still `{"response":{startRow,…,status:0}}`. So
the nesting this clause describes lives in the success body and was never the error funnel IMP-17
fixed. Nothing in the 2026-08-12 work touches it.

## 2. The canonical envelope, for reference

Rendered by `McpRoutingException#toEnvelope()`:

```json
{"status": 422, "error": "validation_error", "detail": "…",
 "field": "…", "available": ["…"], "hint": "…", "seeAlso": "…"}
```

Flat. `error` is a **stable code string** and never an object — `not_found`, `validation_error`,
`method_not_allowed`, `conflict`, `server_error`, `ambiguous_fk`. Everything below is measured
against that shape.

## 3. Why two unrelated-looking clauses landed in one change

They are not unrelated. Both are the same mistake in two places: a failure body assembled by
whichever code path happened to catch the failure, instead of by the shape the tool description
promises. (iv) is a handler's body forwarded verbatim; (i) is a resolver's body with a field bolted
on. In both cases an agent that branches on the documented key reads something else.

## 4. Clause (iv) — the fourth error funnel

### 4.1 What was wrong

`generate_aging_receivable({})` returned:

```json
{"error": {"message": "No accounting schema with currency is configured for organization 6184…",
           "status": 422}}
```

The nested pre-IMP-5 shape. No branchable `error` code, no `seeAlso`. An agent can neither classify
the failure nor be told where to look.

### 4.2 Why IMP-17's three-funnel closure did not cover it

IMP-17 §3 enumerated three error funnels and closed all three. `McpHookExecutor#neoResponseToMcpResult`
is a **fourth**, and it was invisible from where IMP-17 was standing:
`handleReport` calls `validateReportRequest` — which already uses the canonical envelope — *before*
invoking the handler. So the argument-validation half was enveloped, and everything the handler
raised after it escaped. IMP-17's closure was complete for what it enumerated; the enumeration was
short by one.

### 4.3 One normalization, five surfaces

Every MCP path that returns a `NeoResponse` funnels through `neoResponseToMcpResult`: report
generation (`handleReport`), `neo_process`, widget and amortization, and all four entity pre/post
hook pairs (create, update, delete, action). Normalizing inside the funnel is the same leverage
IMP-17 got from three funnels in one change — nine call sites, one edit.

### 4.4 What is deliberately *not* changed: `NeoResponse.error`

The nested shape is built by `NeoResponse.error(int, String)`, and the obvious fix is to change it
there. That would be wrong: `error.message` is what the React UI reads. The REST and MCP surfaces
have different consumers and are allowed to have different shapes; the translation belongs in the
MCP layer. Identical reasoning to IMP-17 §4.4 for `MISSING_REQUIRED_FIELDS`.

### 4.5 Additive and idempotent, on purpose

`toMcpHandlerError` obeys three rules:

1. A body that already carries `error` as a code `String` is **returned untouched**. This is what
   makes repeated normalization safe, and it is why the richer envelopes IMP-17 and IMP-24 build
   upstream (`missingFields`, `invalidDates`, `fieldErrors`) survive intact.
2. A nested `error` object is flattened with its non-`message`/non-`status` keys **lifted, not
   discarded** — a handler that reported a `field` or a candidate list meant the agent to see it.
3. An unrecognized body is **annotated, never stripped**.

Verified by tracing rather than assumed: `handleCreate` builds `missingFields`/`invalidDates` inline
and returns through `wrapAsErrorContent`, so IMP-17's and IMP-24's bodies never enter this funnel at
all. Rule 1 protects them anyway, for the paths that might later.

### 4.6 The deliberate `seeAlso` omission

No `seeAlso` is added here, on IMP-17 §4.3's precedent. The only two topics are `"reading records"`
and `"creating records"`; pointing an agent at either for *"no accounting schema with currency is
configured"* sends it to a recipe that cannot help. A wrong pointer is worse than none.

This is pinned by a test (`addsNoSeeAlso`) because a deliberate omission and a forgotten key look
identical in a response — without the test, the next reader "fixes" it.

### 4.7 A finding recorded but not acted on

The Aging handler answers **422** for a missing *instance-level* accounting-schema configuration —
nothing an agent calling the tool can correct. That is the case IMP-17 §4.1 resolved the other way
(read-side `status:-1` → 500). Not reclassified here: the handler authors its own status, and
guessing on its behalf is over-reach. Recorded so it is a decision rather than an oversight.

## 5. Clause (i) — one condition, two shapes

### 5.1 What was wrong

A failure *inside* `executeBatch` returns
`{committed:false, atomic, persisted, hint, failedAt, error:{…}}`. A failure in the MCP FK-by-name
**pre-pass** returned the resolver's flat error with `failedAt` bolted on and **no `committed`
key**. The `neo_batch` description instructs the agent to branch on `committed`; an agent doing that
read `false` from a missing key — the right answer by luck, from `optBoolean`'s default, not from
the data.

One condition — "the batch did not run" — had two shapes, chosen by which funnel caught it.

### 5.2 The description never lied

`ToolRegistry`'s `neo_batch` description already promises the full
`{committed:false, atomic:true, failedAt, persisted:[], hint, error:{…}}` shape. The implementation
had an undocumented exception. So no description change was needed: the fix makes an existing promise
true. That is the cheaper direction whenever it is available.

### 5.3 `atomic:true` / `persisted:[]` are true by construction

The pre-pass runs **before the transaction opens**. IMP-23 §1 found that this timing is exactly why
FK failures always *looked* atomic while persist-time failures were not. What was an accident of
timing is now an explicit claim, with a hint that says *"the batch was rejected before the
transaction opened"* rather than reusing BatchService's *"rolled back as a unit"* — the agent's next
action is the same either way, but only one of the two sentences is true here.

### 5.4 Same funnel, same wrapper

`handleBatch` now returns the pre-flight failure through `wrapAsTextContent`, matching a normal batch
failure, so `isError` no longer differs by funnel for the same condition. A batch outcome is a
*result*, not a transport error — that was already BatchService's convention and the pre-pass was the
outlier.

### 5.5 Shared constants over string literals

`BatchService.FIELD_COMMITTED/ATOMIC/PERSISTED/HINT` are widened to `public` and used by the MCP
builder, on the same precedent as `REF_PREFIX` (IMP-15). Two spellings of `committed` drifting apart
*is* the failure clause (i) describes; a shared constant makes the drift impossible rather than
unlikely. Pinned by `usesBatchServiceKeys`, which asserts against the constants and not literals, so
the test fails if a future edit re-introduces a second spelling.

## 6. Live verification (2026-08-12, post-deploy)

**Clause (iv) — confirmed.** `generate_aging_receivable({})` now returns:

```json
{"detail": "No accounting schema with currency is configured for organization 61849243BE89460EB70866880A545D50",
 "error": "validation_error",
 "status": 422}
```

Flat, `error` is a code, `status` present, no `seeAlso` — the §4.6 omission holding in the live
response, not just in the unit test. Same defect vector as IMP-19 §6.3, which is where it was found.

**Clause (i) — confirmed.** The C9 vector re-run (human-authorized write probe; a single op whose
`businessPartner` name matches nothing, so no valid op existed that *could* have persisted):

```json
{"committed": false, "atomic": true, "persisted": [],
 "hint": "Nothing was persisted: the batch was rejected before the transaction opened, so no
          records were created and none need cleaning up. Fix the operation reported in
          'failedAt' and retry the whole batch.",
 "failedAt": {"index": 0, "id": "h0"},
 "error": {"status": 422, "error": "not_found",
           "detail": "No match for 'businessPartner'='__NO_EXISTE_ETP4793__': it is neither the id
                      of an existing record nor a value any selector matched. Use neo_selectors to
                      find a valid one.",
           "field": "businessPartner"}}
```

Every key the `neo_batch` description promises is present, including `failedAt.id` — the whole point
of §5.2. The resolver's own `detail` and `field` survive inside the nested `error`, so nothing the
old flattened shape carried was lost in exchange for the outcome keys.

### 6.1 Why `error` is an object here and a code string in (iv)

The two fixes converge on *different* shapes, which reads as a contradiction and is not. A batch
response's branchable key is `committed`; its `error` is documented as a **sub-object**
(`{status,error,detail,seeAlso}`) and `BatchService.failureBody` has always built it that way. A
handler response has no `committed`, so its branchable key is `error` **itself**, which is why (iv)
flattens. Each clause converges on the shape its own surface promises rather than on a single
global shape — a uniform `error` across both would have broken one of the two contracts.

### 6.2 What this probe does *not* measure, and why that is acceptable

It does not prove that a **valid** op preceding the failure goes unpersisted — that would need a
two-op batch with a real business partner. Deliberately not run, and not for cost: the pre-pass has
*always* run before the transaction opened (IMP-23 §1 established exactly that), so the behaviour
this clause fixed was never the persistence, only the **reporting** of it. A two-op probe would
measure a property the change did not touch, while risking a real order if the reasoning were
wrong. The claim `atomic:true`/`persisted:[]` is verified by reading the call order, and §5.3 states
it as construction rather than measurement on purpose.

## 7. Not verified / still open

- The two-op batch case, per §6.2 — recorded as a deliberate omission, not a gap.
- Clause (iii)'s **success**-body nesting asymmetry — the whole reason the row is still ⚠️. Not
  attempted here; it is a response-envelope change on the read verbs, not an error-shape change, and
  it deserves its own decision about whether the React UI's `{"response":{…}}` contract moves with
  it.
- The score. Status and score move on different evidence: the row can be ✅ per-clause with the score
  still 2.5 / 5 until a `/mcp-comparison` run re-measures it.
