# IMP-11 — Close the `visibility` / `userRequired` contract

**Priority:** P1 · **Points:** 5 · **Cohort:** C2 · **Class:** ⚙️ signature change
**Repos:** `schema_forge_core` **only** — the registry row still says `+ com.etendoerp.go`; that is
wrong, see §4
**Status:** see [the registry](../mcp-improvements-registry.md) §3 — never here
**Evidence:** A10, A13, B6 · run reports
[2026-08-05](../mcp-comparison-post-audit-2026-08-05.md),
[2026-08-06](../mcp-comparison-post-audit-2026-08-06.md)
**Investigated:** 2026-08-06 (read-only DB + source inspection, no code changed)

---

## 1. The defect, as an agent experiences it

`neo_schema` tells the agent, in two separate places, to filter on two keys that are never present.

The response `hint`, verbatim:

> "Fields with **userRequired=true**: MUST be provided in neo_create. Fields with
> **visibility=system** are auto-derived by Etendo callouts — omit them. Fields with
> **visibility=discarded** are excluded — do not send them. Fields with readOnly=true are
> auto-generated (DocumentNo, IDs). […]"

And the `neo_schema` tool description advertises `visibility (editable/readOnly/system/discarded)`.

On `sales-invoice/header` (157 fields): **0 carry `visibility`, 0 carry `userRequired`.**

So the only signal left is `required` — the raw AD `IsMandatory` — which on that entity is `true`
for **52 fields**, including `id` and `documentNo` (both `readOnly`), **10 buttons**, 6 computed
totals, and ~20 fields belonging to unrelated localisation modules (`aeatsii*`, `etvfac*`, `tbai*`,
`etblkp*`). An agent that obeys `required` sends garbage; an agent that obeys the `hint` gets an
empty set and has to guess.

**This is why M2 is 40 % and not higher.** It is upstream of the whole write path: B11's failed
`neo_create` is a direct consequence.

## 2. Hypotheses, and which one survived

I stated on 2026-08-06 that this was *"a single change in the field builder"*. **That was wrong**, and
the correction changes which repo does the work. Recorded here rather than overwritten, because the
wrong guess is the informative part: the Java looks guilty and is not.

Three candidates:

| # | Hypothesis | Verdict |
|---|---|---|
| H1 | The Java serializer never emits the keys | ❌ **Refuted** — it emits both, correctly |
| H2 | `ETGO_SF_FIELD.visibility` is never populated | ✅ **Confirmed** — 6340 / 6340 rows NULL |
| H3 | The rows are not linked to `AD_Column`, so the map keys never match | ❌ Refuted — 6235 / 6340 linked |
| H4 | The webhook that writes the rows accepts no such param | ❌ Refuted — that webhook is `@deprecated` and off this path |
| H5 | The writer omits the column, and the value is collapsed before it gets there | ✅ **Confirmed** — two defects, both in `schema_forge_core` |

### H1 — the serializer is already correct

`com.etendoerp.go/src/com/etendoerp/go/mcp/McpSchemaFieldBuilder.java:564-568`:

```java
private static void addVisibility(JSONObject fieldObj, String visibility, boolean mandatory)
    throws JSONException {
  if (visibility != null) {
    fieldObj.put("visibility", visibility);
    fieldObj.put("userRequired", "editable".equals(visibility) && mandatory);
  }
  // …
}
```

Both keys are emitted, and `userRequired` is derived exactly as the contract promises
(`editable` **and** mandatory). The guard `visibility != null` is the entire behaviour: with no
stored visibility, **both** keys vanish silently — including `userRequired`, which is why the two
symptoms always appear together.

The value comes from `loadFieldMetadata()` (same file, `:145-166`), which builds
`visibilityByColumnId` from `ETGO_SF_FIELD` rows keyed by `AD_COLUMN_ID`, skipping null/blank values:

```java
String visibility = (String) sfField.get("visibility");
if (visibility != null && !visibility.trim().isEmpty()) {
  visibilityByColumnId.put(colId, visibility.trim());
}
```

### H2 — the column exists and is entirely NULL (confirmed)

Read-only queries against the local Etendo DB, 2026-08-06:

```
-- the column is there, and nullable
etgo_sf_field.visibility  →  character varying, is_nullable = YES

-- and it is empty, everywhere
select coalesce(visibility,'<NULL>'), count(*) from etgo_sf_field group by 1;
  <NULL>  |  6340        ← every row, no exceptions

-- so it is not a linkage problem
select count(*) total, count(ad_column_id) with_ad_column,
       count(*) filter (where isactive='Y') active from etgo_sf_field;
  total 6340 | with_ad_column 6235 | active 6340
```

The 105 rows without `ad_column_id` are a separate, smaller question (computed/virtual fields) and
are **not** the cause here — even the 6235 linked rows carry no visibility.

### The writer-side gap — located exactly

**Correction (same day, before any code was written).** My first write-up of this section blamed the
`SFUpsertField` webhook
(`com.etendoerp.go/src/com/etendoerp/go/schemaforge/webhooks/SFUpsertField.java`) for not accepting a
`Visibility` param. That is true of the class but **irrelevant to this bug**: `buildWebhookUrl` in the
pusher is marked `@deprecated Use direct DB writes via neo-writer.js instead`
(`schema_forge_core/cli/src/push-to-neo.js:72`). The webhook is not on this path anymore. Kept
visible because it is the kind of near-miss that survives a careless review — the guilty-looking
class was one hop off the real one.

The real writer is `schema_forge_core/cli/src/neo-writer.js`, and there are **two** independent
defects, both in the core repo. Neither is in Java.

**Defect 1 — the value is destroyed before it is ever sent.** `push-to-neo.js:55-68`:

```js
export function mapVisibility(visibility) {
  switch (visibility) {
    case 'editable':  return { isIncluded: 'Y', isReadOnly: 'N' };
    case 'readOnly':  return { isIncluded: 'Y', isReadOnly: 'Y' };
    case 'system':    return { isIncluded: 'Y', isReadOnly: 'Y' };   // ← identical to readOnly
    case 'discarded': return { isIncluded: 'N', isReadOnly: 'N' };
    default:          return { isIncluded: 'N', isReadOnly: 'N' };   // ← identical to discarded
  }
}
```

Four domain values are collapsed into two booleans, **lossily**: `readOnly` and `system` produce the
exact same pair, as do `discarded` and an unrecognised value. `buildFieldUpdateParams`
(`push-to-neo.js:433-444`) forwards only that pair — the original `f.visibility` string is read on
line 434 and then discarded.

The collapsed distinction is precisely the one the `hint` asks the agent to act on: *"`visibility=system`
are auto-derived by Etendo callouts — **omit them**"* versus *"`readOnly=true` are auto-generated"*.
Even if the column were populated from `isReadOnly`, `system` and `readOnly` would be indistinguishable.

**Defect 2 — the column is not in the statement.** `neo-writer.js:319-330` inserts 18 columns:

```
etgo_sf_field_id, etgo_sf_entity_id, ad_column_id, ad_module_id,
isincluded, isreadonly, isbusinesscritical, defaultvalue, java_qualifier, seqno,
ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, agent_prompt
```

**`visibility` is absent.** The partial `UPDATE` path (`:264-296`) never sets it either — its
`setClauses` cover `isincluded`, `isreadonly`, and optionally `ad_column_id`, `defaultvalue`,
`agent_prompt`, `java_qualifier`, `seqno`, `isbusinesscritical`. `upsertField`'s own javadoc
(`:229-245`) documents no `visibility` param.

So: 6340 rows, 6340 NULLs, every push. That is the whole mechanism.

## 3. Why the data is not the hard part

The value is not missing from the system — it is missing only from the *runtime tables*.

`visibility` (`editable` / `readOnly` / `system` / `discarded`) is a **core domain concept** of this
repo: it is authored per field in `decisions.json`, documented in
[`field-visibility-types.md`](../../field-visibility-types.md) and
[`decisions-reference.md`](../../decisions-reference.md), and resolved into `contract.json`. Every
one of the 6340 rows has a known visibility on the Schema Forge side. It is dropped in the last hop,
at the push.

That makes this a plumbing fix, not a data-authoring project — unlike IMP-13 (`businessCritical` +
`namedFilters`), where the values genuinely do not exist yet and someone has to decide them. Worth
keeping the two apart when sequencing: IMP-11 is cheap, IMP-13 is not.

## 4. What a fix has to touch

Three pieces, in dependency order, **all three in `schema_forge_core`**. **Not implemented — this
section is the proposal.**

`com.etendoerp.go` needs **no change at all**: the reader is already correct and the webhook is off
this path. That is a second correction to my first write-up, which listed the repo as
`schema_forge_core` + `com.etendoerp.go` (as does the registry row — worth fixing there too).

1. **`neo-writer.js` — persist the column.** Add `visibility` to `upsertField`: the `INSERT` column
   list (`:319-330`) and the partial `UPDATE` (`:264-296`, as an `if ('visibility' in params)`
   clause, matching how `agentPrompt` is handled). Validate against the four legal values so a typo
   fails loudly instead of storing garbage the reader would then serve as truth.
2. **`push-to-neo.js` — stop discarding it.** `buildFieldUpdateParams` (`:433-444`) already has
   `f.visibility` in hand; pass it through **alongside** the `mapVisibility` pair, not instead of it.
   `isIncluded`/`isReadOnly` stay exactly as they are — they drive NEO's runtime behaviour and are not
   ours to redefine here. Mirror it into `reportDryRunPlan` (`:462-474`) so `--dry-run` does not lie
   about what a real push would write.
3. **Backfill.** New pushes fix themselves; the 6340 existing rows do not. Either re-push every spec
   or write a data-fix. A re-push is preferable — it exercises the new path instead of working around
   it.

Tests belong with step 1 and 2 (Tester's job per the delegation rule): `mapVisibility` is already an
exported pure function, and `buildFieldUpdateParams` is exported too, so both are unit-testable
without a DB. The regression worth pinning is that `system` and `readOnly` produce **different**
stored visibility while still producing the **same** `isIncluded`/`isReadOnly` pair.

**Deliberately out of scope:** changing the Java `addVisibility` guard. Emitting
`visibility: "unknown"` or defaulting `userRequired` when nothing is stored would make the response
*look* compliant while carrying no information — worse than the current honest omission, because an
agent cannot tell the difference. The guard is right; feed it.

**Open question worth settling before coding:** whether `readOnly` visibility should also suppress
the field from the create-oriented view, which overlaps IMP-12's `view:"create"` projection. If
IMP-12 lands first the two fixes compose; if IMP-11 lands first, IMP-12 gets a cheaper filter to
write. Either order works — but doing them in the same wave avoids specifying the interaction twice.

## 5. Done when

- [ ] `neo_schema` on `sales-invoice/header` returns `visibility` on all 157 fields and
      `userRequired` on the editable-and-mandatory subset.
- [ ] The `userRequired: true` set is small and *sendable* — no buttons, no `id`/`documentNo`, no
      computed totals, no foreign-module compliance fields.
- [ ] An agent following the `hint` verbatim can build a valid `neo_create` payload for
      `sales-invoice/header` **on the first call** (this is the M2 measurement, re-run via
      `/mcp-comparison`).
- [ ] The `hint` and the tool description are no longer aspirational — they describe behaviour that
      exists.
- [ ] Verified on `etendo-go-local` after a user-run deploy, then re-verified on staging before the
      registry status moves to ✅.

## 6. Blockers — none

My first write-up recorded this as blocked on `schema_forge_core` not being cloned. **It is cloned**,
at `/Users/futit/Workspace/etendo_develop/schema_forge_core`, already on branch `feature/ETP-4793`
(`87a8afecd`). Commands opt into the local core with `LOCAL_CORE=1` (e.g. `make regen ONLY=… LOCAL_CORE=1`),
or `./cli/sf-local` for the CLI bins — see [`repo-topology.md`](../../repo-topology.md).

The earlier claim was wrong, not merely stale: I had not looked. Recorded because the cost of a
fabricated blocker is a wave that never starts.

The half-shipping hazard from that note still stands on its own terms, just relocated: steps 1 and 2
are both in the same repo now, but persisting the column without passing the value (or the reverse)
leaves the DB NULL and the response unchanged while looking done in the diff. They land together or
not at all.

**Real prerequisites:** the user builds and deploys (never `gradlew` / `update.database` /
`export.database` / Tomcat from here), and step 3's re-push must be followed by
`./gradlew export.database` so the config survives a rebuild.
