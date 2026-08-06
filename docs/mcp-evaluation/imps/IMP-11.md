# IMP-11 — Close the `visibility` / `userRequired` contract

**Priority:** P1 · **Points:** 5 · **Cohort:** C2 · **Class:** ⚙️ signature change
**Repos:** `schema_forge_core` + `com.etendoerp.go`
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

### The writer-side gap

`ETGO_SF_FIELD` is written by the `SFUpsertField` webhook
(`com.etendoerp.go/src/com/etendoerp/go/schemaforge/webhooks/SFUpsertField.java`), whose own
contract is declared in its javadoc:

```
Required params: EntityID, ColumnID, ModuleID
Optional params: IsIncluded, IsReadOnly, DefaultValue, AgentPrompt, JavaQualifier,
                 FieldID (for update), SeqNo
```

**`Visibility` is not in that list, and the class never reads such a parameter.** The only optional
params it handles are the ones above. So even a pusher that wanted to send visibility has no
parameter to send it in.

This is the root cause, and it explains the shape of the bug precisely: the reader was built for a
contract the writer never implemented.

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

Three pieces, in dependency order. **Not implemented — this section is the proposal.**

1. **`com.etendoerp.go` — accept the parameter.** Add `Visibility` to `SFUpsertField`'s optional
   params (mirroring how `AgentPrompt` is handled at `:133-135`), with validation against the four
   legal values so a typo fails loudly instead of storing garbage that the reader would then serve
   as truth.
2. **`schema_forge_core` — send it.** `push-to-neo.js` must pass each field's resolved visibility.
   This is the piece that is **not clonable locally right now** (see §6).
3. **Backfill.** New pushes fix themselves; the 6340 existing rows do not. Either re-push every spec
   or write a data-fix. A re-push is preferable — it exercises the new path instead of working around
   it.

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

## 6. Blocker

`schema_forge_core` is **not cloned locally**, and step 2 lives there. Nothing in steps 1 or 3 is
blocked, but shipping half of this is worse than shipping none: a `Visibility` param that no pusher
sends leaves the DB NULL and the response unchanged, while looking done in the diff.

Needed before starting: the core repo cloned, and a `feature/ETP-4793` branch created in it (Clerk's
job, per the branch workflow).
