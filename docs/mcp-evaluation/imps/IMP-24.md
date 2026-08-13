# IMP-24 — Reject an unusable date on the MCP write verbs, with a structured 422

| | |
|---|---|
| **Registry row** | [`mcp-improvements-registry.md`](../mcp-improvements-registry.md) §3 — **P1**, cohort C4, 0 / 5, ⚙️ additive |
| **Specification** | [post-audit 2026-08-10](../mcp-comparison-post-audit-2026-08-10.md) §4 |
| **Evidence** | **C11** (silent corruption — closed under IMP-16), **C12** (Holded's HTTP 400 as the target shape), and the post-deploy probe of `orderDate:"06/08/2026"` returning a leaked raw DAL `status:-4` |
| **Repo** | `com.etendoerp.go` |
| **Depends on** | [IMP-16](IMP-16.md) — this is that item's deliberately deferred phase 2. Reuses [IMP-5](IMP-5.md)'s error envelope |
| **Implemented** | 2026-08-10 |

## 1. What was left, after the item shrank twice

The item was registered as *the only open defect that destroys data*. It is not that any more, and
both reductions happened before a line of this change was written:

| | Scope at that point |
|---|---|
| As registered | `neo_update orderDate:"09-08-2026"` returns `status: 0` and stores `0015-02-16`, on that field **and** on a sibling the call never named |
| After IMP-16 §9 | That vector was a **missing `coerceFieldTypes` call** in `handleUpdate`. Closed there. What remained was only the *loud rejection* half |
| After the IMP-16 §9.1 deploy | Measured rather than assumed: an unusable date is already refused — nothing lands in the first century — so this became **reshape an existing rejection**, not *add one* |

What the agent actually got back, post-deploy, for `{"orderDate": "06/08/2026"}`:

```json
Validation error: {"status":-4,"errors":{"orderDate":
  "java.text.ParseException: Unparseable date: \"06/08/2026\"", …}}
```

A raw DAL envelope carrying a **Java exception class name**, on the one write surface IMP-5's envelope
work was supposed to cover. The data is safe; the agent is not helped. It cannot tell a format
problem from an impossible date, and on a multi-date payload it cannot tell which value is meant.

**This means the P1 label is now too high** — no call loses data here, it costs a retry the agent
cannot self-correct from. Downgrading is a `/mcp-comparison` re-score decision and is not recorded
here.

## 2. The gate that had to exist before the rejection could ship

IMP-16 §6.1 deferred this on purpose: a deploy must not turn an unknown number of lenient-but-working
calls into hard errors at the same moment as the normalization. The concrete trap is that
`NeoDateFormat.toCanonical` returns `null` for **two unrelated reasons**, and phase 1 could treat them
alike because both ended in the same harmless pass-through:

| `toCanonical` → `null` because | Correct phase-2 answer |
|---|---|
| the value is unusable — `06/08/2026`, `2026-02-30`, `2026-13-40`, `2026-08`, `2026-08-06T banana` | **422.** The lenient parser either reinterprets it or throws |
| the value is an ISO datetime with a **non-zero** zone offset — `2026-08-06T14:30:00+02:00` | **pass through.** It is refused *because it is already right*: the canonical form has nowhere to put an offset, and `JsonUtils.convertFromXSDToJavaFormat` rewrites `+02:00` → `+0200` and parses it. IMP-16 documents this deliberately (§6.2) |

A blanket "`null` → 422" would therefore have **broken a currently-working call** — the fix becoming
the defect, which is the same failure mode IMP-16 avoided by refusing to convert that offset in the
first place. So the change begins with a classifier, `NeoDateFormat.isOffsetDateTime`, whose only job
is to keep those two `null`s apart.

It leans towards pass-through wherever the answer is uncertain (it accepts a space separator, though
only the `T` form is documented as reaching the DAL intact). The two errors are not symmetric: a value
wrongly passed through keeps the behaviour that has been running all along, while a value wrongly
rejected is a brand-new 422 on a call that used to work.

## 3. The second gate — only the caller's own value may be rejected

`handleCreate` re-runs `injectMandatoryDefaults` immediately before saving, and that machinery's
baseline format is `dd-MM-yyyy` (IMP-16: `@#Date@` → core `DateTimeData.today`, hardcoded). So the
server can itself put a non-canonical date in the body — which is the entire reason IMP-16's coercer
exists.

Rejecting one of those would hand the agent a 422 about a field **it never sent**: an error it cannot
act on, produced by our own bug. Those keep the phase-1 `WARN` pass-through, which is the signal that
the default needs fixing at source.

The witness is per-verb, and neither needed inventing:

| Verb | Witness | Why |
|---|---|---|
| `neo_create` | `userProvided` — the snapshot taken before `injectMandatoryDefaults` | already there for the IMP-15 uOM decision, for the same reason: it is the only reliable record of what the agent chose |
| `neo_update` | none needed (`null`) | this path never injects defaults, so **every** key in the body is the caller's. IMP-16's own comment at that call site already said so |

## 4. What landed

| File | Change |
|---|---|
| `NeoDateFormat.java` | `isOffsetDateTime()` (§2 classifier) and `canonicalPattern(boolean)` for the error text |
| `McpToolRouterSupport.java` | `coercePrimitiveFieldValue` / `coerceDateFieldValue` now **return** a rejection descriptor or `null`; new `buildInvalidDateInfo()` |
| `McpToolRouter.java` | `coerceFieldTypes` returns a `JSONArray` of rejections and takes the caller-key witness; new `buildInvalidDatesError()`; both write call sites return 422 when it is non-empty |
| `docs/neo-headless.md` | new §4.3.1.1, plus the phase-1 "passed through verbatim" bullet in §4.3.1 corrected |
| `NeoDateFormatTest.java`, `McpToolRouterSupportTest.java` | 13 new tests; 2 existing ones rewritten to guard the new behaviour rather than deleted |

Response shape — mirroring the adjacent `missingFields` 422 rather than inventing a second one:

```json
{
  "status": 422,
  "error": "validation_error",
  "detail": "One or more date values are not in a format this API can read",
  "invalidDates": [
    { "name": "orderDate", "received": "06/08/2026",
      "expectedFormat": "yyyy-MM-dd", "example": "2026-08-10" }
  ],
  "hint": "Send dates as ISO: …",
  "seeAlso": "docs(topic:\"creating records\")"
}
```

`received` is echoed back deliberately. The field name alone cannot distinguish a wrong *format* from
a wrong *date* — `2026-02-30` is ISO-shaped and still impossible — and an agent that sent several
dates cannot otherwise tell which one it is being told about. That is C12's shape (value + expected
format + example), which the audit named as the target verbatim.

## 5. What deliberately did not change

**REST stays lenient.** `NeoTypeCoercionHelper` keeps the `WARN` pass-through. The React form is not
an agent, it has a date picker, and changing the REST contract to fix an MCP ergonomics defect would
be a breaking change bought for nothing — the same line IMP-15 drew with `toMcpBatchFailure`. This is
now the one documented place where the two write stacks answer the same input differently, and
§4.3.1.1 says so rather than leaving it to be discovered.

**Numeric and boolean coercion stays lenient too.** A malformed amount already surfaces as a DAL
error whose text names the column, so the agent is not left guessing. Dates were the exception worth
fixing precisely because the lenient parser **succeeds** on them.

## 6. Done when

- [x] An unusable caller-supplied date returns a 422 naming the field, the value, the expected format and an example
- [x] `2026-08-06T14:30:00+02:00` still goes through untouched (§2) — the case a blanket fix would have broken. **Unit tests only**; §7's probe 5 tried and missed (no editable datetime is exposed), so this one is not measured live
- [x] A server-injected default in a bad shape is never rejected (§3)
- [x] An ineligible domain type (time-of-day, absolute) is never judged
- [x] The REST write path is byte-identical to before (§5)
- [x] Unit tests green — 147/147 across `McpToolRouterSupportTest` + `NeoDateFormatTest`, plus 27/27 on the call-site guard and the REST coercer, run standalone against the deployed jars
- [x] **Verified live** on `etendo-go-local` after a user-run compile + deploy — see §7
- [x] `./gradlew test` on the full module — run by the user 2026-08-10, green. This is the check that counts — after IMP-16 §9.2, a standalone run does not
- [ ] The `neo_update` call site probed live (§7, probe 6 — blocked, not run)
- [ ] Corpus row in `etendo-go-docs` mentioning the 422 (separate repo → separate PR, and delivery needs a Context7 reindex — see [IMP-14](IMP-14.md))
  - **Drafted 2026-08-13**, uncommitted in the `etendo-go-docs` working tree — see §8. Left unticked
    deliberately: text in a working tree is not a corpus an agent can read.

## 7. Live verification (2026-08-10, after a user-run compile + deploy)

Every probe is a `neo_create` with a **deliberately incomplete** payload. The date 422 is emitted
before the `missingFields` check, so in *any* branch — fix working, fix broken, or the DAL rejecting —
nothing persists. No record was created, and none was touched.

| # | Probe | Result |
|---|---|---|
| 1 | `orderDate:"06/08/2026"` | **422** `invalidDates:[{orderDate, received:"06/08/2026", yyyy-MM-dd, 2026-08-10}]`. The `status:-4` + `java.text.ParseException` is gone |
| 2 | `orderDate:"2026-02-30"` | **422**, `received:"2026-02-30"` — the ISO-shaped impossible date, not resolved to the 28th |
| 3 | `orderDate:"2026-13-40"` + `scheduledDeliveryDate:"banana"` | **422** listing **both**, in order |
| 4 | `orderDate:"2026-08-11"` + `scheduledDeliveryDate:"11-08-2026"` | **No date rejection** — falls through to `missingFields`. `11-08-2026` is *repaired*, not refused |
| 5 | `datePrinted:"2026-08-11T14:30:00+02:00"` | Not rejected. But see below — this probe did **not** exercise the classifier |
| 6 | `neo_update` with a bad date and a non-existent id | **Not run** — blocked by the permission classifier |

**Probe 4 is the one that shows the design is a split, not a rejection.** A `dd-MM-yyyy` value is
still repaired by IMP-16's coercer; only the irreparable is rejected. A change that rejected
everything `toCanonical` turns down would have failed here, and this is the shape of call that fails
most often in practice.

**Probe 5 did not test what it was meant to, and the log says why.** `datePrinted` turned out to be
date-only, so `toCanonical` *succeeded* (`'2026-08-11T14:30:00+02:00' -> '2026-08-11'`) and
`isOffsetDateTime` was never reached. There is no editable datetime property exposed on this spec —
`preparationDate` and `creationDate` came back in `unknownFields` (IMP-18, used here as the probe for
its own question). **So the §2 classifier is covered by unit tests only, not measured live.** It is
the single most important thing left to verify, since it is the one guard against this change
breaking a working call.

**What the log did establish, and it is the §3 gate's premise measured rather than argued:** every
create logged `Normalized date 'accountingDate': '10-08-2026' -> '2026-08-10'` and the same for
`scheduledDeliveryDate` — **server-injected defaults, in `dd-MM-yyyy`, on every single call.** That is
the population a blanket rejection would have blamed the agent for. Also across the window: **0**
`ParseException`, and **0** `Unrecognized date format` WARN — no value reached the pass-through branch,
because the bad ones were rejected before it.

## 8. One thing to be honest about

IMP-16 §6.1 gated this phase on *"once the logs show the WARN never fires on real traffic"*. **That
gate is not satisfied.** `etendo-go-local` restarted at `2026-08-10T17:17:14Z` (the IMP-18 deploy),
the available log window is 404 lines, and it contains **0** `Unrecognized date format` and **0**
`Normalized date` — i.e. no date write traffic at all since the restart.

The evidence was therefore **empty, not clean**. It shipped on a different argument than the gate
assumed: the two-gate design in §2–§3 means the 422 can only fire on a value that (a) the caller sent
and (b) is not the offset family — so the population the gate was meant to protect,
lenient-but-working calls, is excluded by construction rather than by observation. That is a stronger
argument than an empty log, but it is an argument, not a measurement.

**§7 then produced the first real data, and it points the right way without closing the gate.** Across
the post-deploy window there are now `Normalized date` INFO lines on every create and **0**
`Unrecognized date format` WARN — so no value reached the pass-through branch at all, which is what
the gate asked to see. Two caveats keep it open: the traffic is my own probe traffic rather than
production, and it is exactly the traffic a fix's author would generate, so it cannot speak for shapes
I did not think to send. The gate should still be re-read against real traffic.

## 9. The corpus row — drafted, not delivered (2026-08-13)

Two pages in `etendo-go-docs` carry the addition, both **extended rather than created**:

| Page | Addition |
|---|---|
| `agentic/mcp/index.md` | a new Error-handling row: symptom, cause (bad format *or* ISO-shaped-but-impossible), resolution |
| `agentic/agent-manual.md` | a new Error-handling row phrased as a normative agent action, plus a clause on the existing date bullet |

Both pages needed it independently, which is a property of the corpus rather than duplication:
`AGENTS.md` requires each `agentic/` page to stand alone, so a cross-reference would have left
whichever page Context7 retrieved incomplete. Only `agentic/` is indexed — `docs/` is the human
MkDocs site and was correctly left alone.

The row's wording is drawn from a live call rather than from `neo-headless.md`, using the same probe
that opened §1 — `orderDate:"06/08/2026"` on a `neo_create`:

```json
{ "status": 422, "error": "validation_error",
  "detail": "One or more date values are not in a format this API can read",
  "invalidDates": [ { "name": "orderDate", "received": "06/08/2026",
                      "expectedFormat": "yyyy-MM-dd", "example": "2026-08-10" } ],
  "hint": "Send dates as ISO: yyyy-MM-dd for dates, yyyy-MM-dd'T'HH:mm:ss for datetimes. Check the
           value is a real calendar date too — 2026-02-30 is ISO-shaped and still invalid." }
```

This is the shape §1 set out to replace, now confirmed on the deployed build: the raw DAL
`status:-4` with a `java.text.ParseException` in it is gone, and the four keys the row documents
(`name`, `received`, `expectedFormat`, `example`) are all present. **No record was created** — the
date check fires before the `missingFields` check, so the call cannot reach a write.

The two rows tell an agent something the envelope alone does not: on a multi-date payload, read
*every* entry in `invalidDates`, and resend only the fields it names. An agent that retries by
reformatting everything it sent is the failure this row exists to prevent.

Delivery still needs a commit, a PR in that repo, and the Context7 reindex ([IMP-14](IMP-14.md)) —
none of which this run performed.
