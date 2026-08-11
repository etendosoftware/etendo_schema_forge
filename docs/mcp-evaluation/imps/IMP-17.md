# IMP-17 — Wrap callout + routing errors in the IMP-5 envelope

**Registry row:** `mcp-improvements-registry.md` → IMP-17 (P2, C3, 0 / 3, `com.etendoerp.go`).
**Registered:** 2026-08-06 run (§5), from evidence **B13, B20**.
**Absorbs:** [IMP-23](IMP-23.md) §9.4's secondary finding, on the human's instruction
("dale con IMP-17, absorbiendo el hallazgo §9.4").
**Status:** 🔧 fix implemented 2026-08-11 (`3db3b4c5`, `08182a77`), live verification pending.

Status lives only in the registry; this file describes the work.

---

## 1. A citation to correct first

The registry cell cites evidence **"B13, B6"**. B6 is IMP-12's 61,963-character token-limit failure
and has nothing to do with error envelopes. The 2026-08-06 run report registers this item (line 90)
from **"B13, B20"**, and B20 — *"`Entity not found: header` — raw string, no envelope, **no list of
valid entities**"* — is the case the cell itself quotes. The cell's own text was right and its
citation was a typo. Corrected in the registry as part of this change.

## 2. Why §9.4 lands here rather than on a new number

IMP-23 §9.4 recorded that omitting a required FK on a `neo_batch` create answered **500
`server_error`** carrying a raw Postgres not-null violation whose `detail` dumped the entire failing
row — ~90 columns of internals — while a 281-char value in the same tool answered a clean 400 naming
the field, the length and the maximum. §9.4's own recommendation was *"this most likely belongs to
IMP-17 (raw errors surfacing unmapped) rather than to a new number"*, and IMP-23 §5.1 had already
established the reasoning for that preference: a new number forces a quota re-base, which would cost
roughly 3 MARI points for identical code.

It also turns out to be the same fix. §9.4's defect and B13's are one sentence apart in the same
method family: a failure that core reports as a plain message reaching the agent verbatim, with a
status chosen by whichever `catch` happened to see it.

---

## 3. The three funnels

The registry cell names two symptoms. Tracing them found that every raw error on the MCP surface
escapes through exactly **three** places, which is why this is one change and not a sweep.

| # | Funnel | What escaped |
|---|---|---|
| 1 | `McpToolRouter.checkJsonServiceError` | B13's callout prose; the raw DAL transport on a field-validation failure |
| 2 | `McpToolRouter.route`'s single `catch (Exception e)` | B20's entity-not-found; C14's unknown filter; everything else |
| 3 | `NeoCrudHandler.checkJsonServiceResponse` | §9.4's 500 + failing-row dump |

### 3.1 Funnel 1 — the method returned a `String`

```java
private String checkJsonServiceError(JSONObject responseJson) throws JSONException {
```

That signature is the defect. A callout refusing a create had its message returned as the **whole**
response body — *"La fecha de operación no puede ser posterior a la fecha de la factura."* — with no
`status`, no error code and no `field`, while the write verbs surrounding it had carried a structured
envelope since IMP-5. An agent could not tell that failure apart from a server fault except by
reading Spanish prose.

The validation branch was worse:

```java
return "Validation error: " + innerResponse.toString();
```

`innerResponse` is core's transport object. `status:-4` and all of its internals went into the
agent's context, and the only actionable part — the per-field map — was buried in it.

The method now returns the envelope. `seeAlso` is passed in at each of the five call sites, which
also supplies the one fact the classifier needs (§4.1).

### 3.2 Funnel 2 — a catch-all that flattened everything

```java
} catch (Exception e) {
  return wrapAsErrorContent("Error executing " + toolName + ": " + e.getMessage());
}
```

This is **evidence C14** and the last non-envelope path IMP-5 listed. Every resolution failure —
unknown spec, unknown entity, a verb the entity does not enable, a missing argument — arrived as one
prose line. `McpToolRouterSupport.findIncludedEntity` threw `new OBException("Entity not found: " +
entityName)` **while holding the list of entities that would have worked** (B20).

Resolution failures now raise `McpRoutingException`, which carries its own envelope and is rendered
by a dedicated `catch` ahead of the catch-all. It extends `OBException` deliberately: every throw
site and every existing `catch (Exception)` keeps working, and only `route` looks for the subtype.

Anything genuinely unexpected still reaches the catch-all, but as a sanitized 500 `server_error`
whose hint says a retry with corrected values will not help — because for that class of failure, it
will not.

### 3.3 Funnel 3 — §9.4's 500

`NeoCrudHandler.checkJsonServiceResponse` classified any `RPCREQUEST_STATUS_FAILURE` as 500 unless
the message reported a duplicate key. A not-null violation is neither: it is the caller's omission,
and the response now says so.

---

## 4. The decisions worth recording

### 4.1 The status follows the failure, not the verb — with one exception

Core's `status:-1` means "the DAL refused this". On a **write** that is a rejection of values the
caller submitted, so it is a 422 the agent can act on. On a **read** there is nothing submitted to
correct, so it is a 500.

The exception matters because the naive rule ("read errors are 4xx too, be generous") produces a
loop with no exit: an agent told 422 on a failing query will re-send it with different values
forever. The one genuinely actionable read failure — an unknown named filter — is answered upstream
(§4.5), so there is nothing left in the read path that a corrected retry would fix.

`seeAlso` already distinguished the two verb families at every call site, so no new parameter was
needed to carry the distinction.

### 4.2 Two things deliberately not done

**No translation.** The callout message comes from `AD_Message` in the session user's language.
Producing English would mean pinning the MCP session's locale — a separate change with its own blast
radius (it would move process messages too) and not what this item registered. The message is passed
through verbatim.

**No invented `field`.** A callout rejects a *combination* of values far more often than a single one
(B13's is precisely that: an operation date relative to an invoice date). A guessed `field` would
point the agent at the wrong input, which is worse than no pointer at all.

### 4.3 `available` on an entity name, not on a spec name

An unknown **entity** carries the valid names, reusing the self-correcting shape IMP-3 established
for named filters (`Available: completed, pending, partial`, evidence B19). The extra query runs on
the failure path only, and it is the query the agent would otherwise have to make itself.

An unknown **spec** deliberately does not. The catalog can hold dozens, and dumping them into every
mistyped call is a context cost (ACE) the agent did not ask for; `neo_discover` is the tool that
enumerates them, so the hint points there instead.

A related trap avoided: `SFSpec`'s primary key is a UUID, distinct from its `name`. An error built
from the `specId` the router happens to be holding would echo something the agent never sent, so
`resolveSpecNameForError` resolves the name — again, on the failure path only.

### 4.4 One condition, three shapes, reduced to two layers

Missing required fields were reported three ways depending on how you asked:

| Path | Shape |
|---|---|
| `neo_create` | IMP-5's `missingFields` 422 |
| REST CRUD | ETP-3894's `MISSING_REQUIRED_FIELDS` 400 with `fields` |
| `neo_batch` | whatever came back |

The REST shape **stays**. The React UI highlights fields from it, so changing it would be a UI
regression in service of an agent-facing tidy-up. The translation to the agent's `missingFields` 422
happens in `McpToolRouterSupport.toMcpBatchFailure` — which is exactly what that method's own javadoc
says it exists for, *"so the REST contract … stay[s] untouched"*.

### 4.5 C14 turned out to be a regression risk, not a freebie

The unknown-named-filter error threw `IllegalArgumentException` from `McpQuerySupport`. Nothing
caught it, so before this change it became prose — bad, but the list of valid states was at least
visible in the sentence.

After funnel 2 was closed, that same throw would have been classified **`server_error`**, which is
worse than the prose it replaced: it tells an agent to stop retrying a call that one corrected word
would fix. So closing C14 was not optional once the catch-all was tightened. It now raises
`McpRoutingException.unknownNamedFilter` — 422, `field:"status"`, the valid names moved out of the
prose and into `available`, the same key an unknown entity name uses.

This is the general hazard of adding a typed catch-all: it silently reclassifies every exception that
was previously invisible. `IllegalArgumentException` from `validateArgs` was the same case and got the
same treatment (422, naming the argument in `field`).

### 4.6 Locale independence, and what it cannot reach

Detection keys on SQLState **23502**, which is language-independent. Postgres' `null value in column
"x"` wording and its `Failing row contains` lead-in are localised by `lc_messages`, so:

- the **status** is always corrected (SQLState, or the string `23502` in the message);
- the **field name** is best-effort — it comes from the English regex, so a server running a
  translated `lc_messages` gets the right status and a stripped message but loses the field name.

That limit is recorded rather than papered over.

The row-dump stripper keys on the **shape of the leak** — a parenthesised run of ≥200 characters —
not on the sentence that introduces it, for the same reason. No human-readable message has a
200-character parenthetical, so ordinary text passes through untouched.

### 4.7 Why both a message check and a throwable check

`DefaultJsonDataService` catches the constraint violation internally and returns it as an ordinary
JSON-RPC failure body, so by the time `NeoCrudHandler` classifies the status there is no `Throwable`
left to inspect. Hence `isNotNullViolationMessage(String)` alongside `isNotNullViolation(Throwable)`
— mirroring the `isDuplicateKeyMessage` / `isDuplicateKeyViolation` pair that already existed for
exactly this reason. Both paths are wired: the swallowed one in `checkJsonServiceResponse`, the thrown
one in `handleDefault`'s catch.

`notNullViolationColumn` needs the same two overloads, but for a different reason:
`NeoErrorSanitizer.sanitize` maps any DB exception to a generic message, so by the time the caller has
a safe string the column name is gone. The raw cause chain is the only place it survives.

---

## 5. What was built

New file, `com.etendoerp.go/src/com/etendoerp/go/mcp/`:

- **`McpRoutingException`** — a package-private `OBException` subtype that knows its own envelope.
  Factories: `specNotFound`, `entityNotFound`, `notCrudCapable`, `methodNotAllowed`,
  `missingArgument`, `unknownNamedFilter`. `toEnvelope()` emits `status` / `error` / `detail` plus
  `field`, `available`, `hint`, `seeAlso` when each is present.

Modified:

| File | Change |
|---|---|
| `McpToolRouter` | `checkJsonServiceError` returns an envelope; `buildDalFailureEnvelope` (409 / 422 / 500) and `buildDalValidationEnvelope` (`fieldErrors`); typed `catch` for routing failures; `buildUnexpectedErrorBody` for the rest |
| `McpToolRouterSupport` | six throw sites retyped; `includedEntityNames` + `resolveSpecNameForError`; `toMcpBatchFailure` lifts `missingFields` |
| `McpQuerySupport` | the unknown named filter (§4.5) |
| `McpConstants` | `ERROR_CONFLICT`, `STATUS_CONFLICT/SERVER_ERROR/METHOD_NOT_ALLOWED`, `KEY_MISSING_FIELDS`, `KEY_AVAILABLE`, `PARAM_SPEC` |
| `NeoErrorSanitizer` | `isNotNullViolation`, `isNotNullViolationMessage`, `notNullViolationColumn` ×2, `stripRowDump`; `sanitize` now strips row dumps on its fallback path |
| `NeoCrudHandler` | not-null → `MISSING_REQUIRED_FIELDS` 400 on both the swallowed and thrown paths; `resolvePropertyNameForColumn`; row dump stripped on the surviving 500/409 |

Status codes emitted, by cause:

| Cause | Before | After |
|---|---|---|
| Callout rejects a write | bare prose | 422 `validation_error` |
| Per-field validation failure | `"Validation error: " + transport` | 422 + `fieldErrors` |
| Duplicate business key | prose (MCP) / 409 (REST) | 409 `conflict` + recovery hint |
| DAL failure on a read | bare prose | 500 `server_error` |
| Unknown spec / entity | `"Error executing …"` | 404 `not_found` (+ `available` for an entity) |
| Report spec, CRUD tool | `"Error executing …"` | 422 `validation_error` |
| Verb not enabled | `"Error executing …"` | 405 `method_not_allowed` |
| Missing argument / unknown filter | `"Error executing …"` | 422 `validation_error` |
| Omitted required FK | **500 + failing row** | 400 `MISSING_REQUIRED_FIELDS` naming the property |
| Anything unexpected | `"Error executing …"` | 500 `server_error`, sanitized |

---

## 6. What this closes beyond its own row

- **C14** — IMP-5's clause (ii), the raw `Error executing neo_list: …` on an unknown named filter.
  Closed here, and it had to be (§4.5).
- **IMP-5 clause (iii)**, *"read-verb errors are wrapped `{"response":{…}}` while write-verb errors
  are bare"* — all five DAL call sites now render the identical flat envelope, so the asymmetry is
  gone from this path. Stated as **probably** closed rather than closed: the observation was made
  live, and only a live re-probe identifies which code path produced the nesting.
- **IMP-5 clause (i)** — C9's flattened batch FK failure with no `committed` key — is **not** touched.
  It is a different funnel (`McpFkResolver` → `handleBatch`), and nothing here changes it.

IMP-5's own row is not re-scored by this file; that is a `/mcp-comparison` measurement.

---

## 7. Tests

**7289 / 7291 pass.** The 2 failures are pre-existing and unrelated:
`OnboardingDatasetNormalizerTest` needs `src-test/resources/.../sampledata/index.txt`, which the
ad-hoc `javac` classpath used here does not include. `McpToolRouterTest` is skipped by that harness on
a false positive (it mentions `OBBaseTest` only in a javadoc line), so it was compiled and run
separately: **120 / 120**.

Eight tests broke, all on the `checkJsonServiceResponse` signature (it now takes the `Tab` it needs to
map a column to a property). All eight were **rewritten, not deleted**: the helper takes a nullable
`Tab`, and passing `null` reproduces each pre-existing case exactly, since none of them reaches the
mapping.

Two tests asserted the old prose through their own stubs — they passed only because the stub threw the
string the assertion looked for. Both now assert the envelope:

- `unknownSpecReturnsError` → 404, `field:"spec"`, hint naming `neo_discover`, and **no `available`
  key**, which pins §4.3's deliberate omission rather than leaving it to a comment;
- `unknownEntityReturnsError` → 404, `field:"entity"`, `tool:"neo_list"`, and the two valid names in
  `available`.

`resolveIncludedEntityOrExplain`'s report-spec test kept its message assertions and gained the
classification (422 `validation_error`, `field:"spec"`), and `requireMethodEnabled`'s gained a 405 case
asserting **`assertFalse(envelope.has("hint"))`** — there is no corrective action to hint at, and a
hint there would invite the retry the 405 exists to prevent.

New coverage:

- **Envelopes** (`McpToolRouterTest`) — the callout 422 with no invented `field`; the read 500; the
  409 with its recovery hint; a row dump stripped; `fieldErrors` lifted with the transport dropped
  (`assertFalse(envelope.toString().contains("-4"))`); the no-field validation branch;
  non-failures returning `null`; and `buildUnexpectedErrorBody` asserting it does **not** start with
  `"Error executing"`.
- **Sanitizer** (`NeoErrorSanitizerTest`) — SQLState 23502 through a cause chain, a different SQLState
  rejected, message-based detection via both the code and the wording, column extraction lower-cased
  from both overloads, and `stripRowDump` leaving a short parenthetical alone (a real message from the
  duplicate-key path: `"(Client, Organization, Search Key) must be unique."`).
- **Not-null reclassification** (`NeoCrudHandlerTest`) — column mapped → `MISSING_REQUIRED_FIELDS`
  400 naming `partnerAddress`; column unmappable → status still corrected and the dump gone; a
  surviving 500 also stripped.
- **Batch** (`McpToolRouterSupportTest`) — `MISSING_REQUIRED_FIELDS` lifted into `missingFields` 422
  with the REST nesting dropped.
- **Arguments** (`McpToolRouterSupportTest`) — `validateArgs` naming the argument in `field`, a JSON
  null counting as absent, and a null argument object reported with **no** `field`, since no single
  argument is at fault.
- **Unknown filter** (`McpNamedFiltersTest`) — 422, `field:"status"`, `available` carrying what the
  parser found.

---

## 8. Not verified

- **Live**: nothing probed against `etendo-go-local`. Owed on the next deploy — B13's callout path
  returning 422, B20 returning `available`, C14 returning 422 rather than 500, §9.4's omitted FK
  returning the 400 with `partnerAddress` and no row dump, and the REST/React path unchanged.
- **The non-English `lc_messages` case** (§4.6) is reasoned from the regex, not measured.
- **Score**: 0 / 3 stands. The mark is 🔧 — written, committed, unit-tested, product unmeasured —
  which is worth **zero**, the same as ⏳.
- **IMP-23 §9.3's limit does not apply here**: nothing in this change touches a tool description, so a
  connected client sees the new behaviour on its next call rather than on its next reconnect.
