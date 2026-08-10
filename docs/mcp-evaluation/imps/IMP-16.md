# IMP-16 — One date format across `neo_defaults` and the write verbs

| | |
|---|---|
| **Registry row** | [`mcp-improvements-registry.md`](../mcp-improvements-registry.md) §3 — **P1**, cohort C3, 0 / 5, ⚙️ signature change, ⏳ open |
| **Specification** | base report §5 (audit) |
| **Evidence** | B9, B10, B13 (2026-08-06) |
| **Repo** | `com.etendoerp.go` (+ one finding in `etendo_core`) |
| **Investigated** | 2026-08-06, on `etendo-go-local`, commit `5c0d4a4c` |

This file is an investigation: root cause and design options, **no code change and no status
change**. Nothing here has been compiled or deployed.

## 1. What the registry row says, and why it understates the item

> `invoiceDate` emitted `DD-MM-YYYY`, `accountingDate` ISO, same payload; `neo_create` misparses the
> former silently

Both halves are true, but each is narrower than reality:

| Registry claim | What the investigation found |
|---|---|
| two formats | **three** — `dd-MM-yyyy`, ISO `yyyy-MM-dd`, and a raw Postgres timestamp |
| `invoiceDate` is the odd one out | inverted: **`dd-MM-yyyy` is the baseline**; the ISO fields are the exception |
| "misparses" | it does not fail — it *succeeds* at producing **year 12** |

The third row is the important one. This is not a rejected write; it is an accepted write that
stores a wrong value.

## 2. The write path — silent corruption, fully root-caused

### 2.1 The chain

```
neo_create (MCP)                      POST /crud (REST)
  McpToolRouter:460                     NeoCrudHandler:521
    NeoDefaultsService.injectMandatoryDefaults(...)     ← resolves @#Date@ → "06-08-2026"
  McpToolRouter:481                     NeoCrudHandler:535
    coerceFieldTypes → coercePrimitiveFieldValue        NeoTypeCoercionHelper.coerceTypes
                                                        ← neither has a date branch
  jsonService.add → DefaultJsonDataService
    JsonToDataConverter:185  xmlDateFormat.parse(value)
```

`JsonToDataConverter:129` holds the parser:

```java
private final static SimpleDateFormat xmlDateFormat = JsonUtils.createDateFormat();
```

and `JsonUtils.createDateFormat()` (`org.openbravo.service.json`, lines 86-90) is:

```java
final SimpleDateFormat dateFormat = new SimpleDateFormat("yyyy-MM-dd");
dateFormat.setLenient(true);      // ← the defect
```

Feeding `"06-08-2026"` to a lenient `yyyy-MM-dd` parser yields **year 6, month 8, day-of-month
2026**. Lenient rollover normalises that to **`0012-02-16`**. No exception, so the
`catch (ParseException e) { throw new Error(e); }` at line 187 never fires and nothing is logged.

Executed against a JDK rather than reasoned about, with the exact parser configuration
(`SimpleDateFormat("yyyy-MM-dd")`, `setLenient(true)`):

| Input | Result |
|---|---|
| `24-06-2026` | **`0029-12-17`** |
| `06-08-2026` | **`0012-02-16`** |
| `2026-08-06` | `2026-08-06` — the canonical form, unaffected |
| `2026-08-06 18:55:31.567837+00` | `2026-08-06` — trailing text ignored, no error |
| `06/08/2026` | `ParseException` |
| `` (empty) | `ParseException` |

So the damage is specific: **only the `dd-MM-yyyy` shape corrupts silently.** A different separator
fails loudly (`ParseException` → `throw new Error` → HTTP 500), which is why this went unnoticed —
the one format NEO actually emits is the one format that produces a plausible-looking `Date` object
instead of an error.

### 2.2 Neither coercer covers dates

The codebase already contains the *shape* of the fix twice, for other types, with a comment that
describes exactly this class of bug — `NeoCrudHandler:532-534`:

> `Utility.getDefault()` always returns String; `JsonToDataConverter` has no String→BigDecimal/
> Integer/Boolean path and falls through to return value, causing OBDal type mismatches.

Both implementations stop short of dates:

| Coercer | Path | Handles | Missing |
|---|---|---|---|
| `NeoTypeCoercionHelper.coerceField` (`schemaforge/util/`, 144-176) | REST | `BigDecimal`, `Long`, `Integer`, `Boolean` | `Date` / `Timestamp` |
| `McpToolRouterSupport.coercePrimitiveFieldValue` (`mcp/`, 350-373) | MCP | `Long`, `BigDecimal`, `Boolean` | `Date` / `Timestamp` |

A date column's `prop.getPrimitiveObjectType()` is `java.util.Date`, matches no branch, and the raw
string passes through untouched.

**Two coercers is itself a finding** — the MCP and REST write paths can already drift on type
handling, and a date fix written into only one of them would drift immediately.

### 2.3 This happens even when the agent sends no date

`McpToolRouter:460` and `NeoCrudHandler:521` both call `injectMandatoryDefaults` *before* the save.
`DateInvoiced` and `DateAcct` are mandatory with default `@#Date@`, so the bad value is **produced
by the server** and inserted into the agent's payload. An agent that never mentions a date still
gets year 12.

### 2.4 This fully explains B13

B13's error is `La fecha de operación no puede ser posterior a la fecha de la factura.` — a field the
agent never touched. With `dateinvoiced` landing in year 0012 and `EM_Etsg_Date_Operation` staying
2026-08-06 (it is ISO, see §3.2), the operation date really *is* later than the invoice date, so the
Spanish callout validation fires honestly. **The confusing error message is a downstream symptom of
the misparse, not a separate defect.** IMP-19 (untranslated raw callout strings) still stands on its
own, but B13 stops being evidence for it.

## 3. The read path — why the formats differ

### 3.1 `@#Date@` is always `dd-MM-yyyy`, unconditionally

`NeoDefaultsService.resolveFieldDefault` (line 504) delegates to
`Utility.getDefault(conn, vars, dbColumnName, defaultExpr, windowId, "")`. `getDefault`
(core `Utility.java:648-692`) reaches `parseContext` → `getContext`, and there `#Date` is
**special-cased away from the session** (`Utility.java:410-412`):

```java
if (context.equalsIgnoreCase("#Date")) {
  return DateTimeData.today(conn);
}
```

`DateTimeData.today` is generated from `.xsql` and formats with a **hardcoded literal**
(`build/javasqlc/src/org/openbravo/erpCommon/utility/DateTimeData.java:51`):

```java
dateReturn = UtilSql.getDateValue(result, "fecha", "dd-MM-yyyy");
```

So every `@#Date@` default in NEO is `dd-MM-yyyy`, on every window, regardless of session,
locale or `dateFormat.java`. The 4-arg and 5-arg `getContext` overloads both converge here — the
5-arg one routes `#Date` to the 4-arg one explicitly (`Utility.java:480-482`).

**Corollary: `NeoDefaultsService.buildVariablesSecureApp` lines 719-720 are dead code.**

```java
vars.setSessionValue("#Date", new SimpleDateFormat(DATE_FORMAT).format(new Date()));  // ISO
```

Nothing reads it: `getContext` short-circuits before `vars.getSessionValue("#Date")`. The line looks
like it makes NEO's dates ISO and does nothing at all. Removing or fixing it is part of this item —
leaving it is worse than either, because the next reader will trust it.

### 3.2 The ISO fields are the ETP-4244 callout normalizer, not the resolver

ETP-4244 built an ISO⇄Etendo bridge at the *callout* boundary:

- request side — `CalloutRequestBuilder.reformatDateParams` / `isoToEtendoDate` (137-141, 206),
  because legacy callouts re-parse params through Postgres `to_date()`;
- response side — `NeoCalloutService.normalizeUpdateDatesToIso` / `etendoToIsoDate` (754, 780-838),
  gated to `AD_Reference` id `"15"` (Date) and to the `updates` object only.

So **a date field comes back ISO if and only if a callout wrote it during the cascade.** The format
is decided by which resolution path happened to run — a property of the *cascade graph*, not of the
field or the window.

### 3.3 The evidence, re-read with that rule

`neo_defaults` on three windows, same instance, same request (2026-08-06):

| Window / field | Value | Written by a callout? |
|---|---|---|
| `sales-order/header.orderDate` | `06-08-2026` | no |
| `sales-order/header.accountingDate` | `06-08-2026` | no |
| `sales-order/header.scheduledDeliveryDate` | `06-08-2026` | no |
| `sales-invoice/header.invoiceDate` | `06-08-2026` | no |
| `sales-invoice/header.accountingDate` | `2026-08-06` | yes — `SifInvoiceOperationDateCallout` → `super` = `SE_Invoice_AccountingDate` |
| `sales-invoice/header.etsgDateOperation` | `2026-08-06` | yes — same callout |
| `purchase-invoice/header.invoiceDate` | `06-08-2026` | no |
| `purchase-invoice/header.accountingDate` | `2026-08-06` | yes |
| `purchase-invoice/header.etsgDateOperation` | `2026-08-06` | yes |
| `purchase-invoice/header.aeatsiiFechaRegCont` | `2026-08-06 18:55:31.567837+00` | no — `@SQL=` default |

`sales-order` is the decisive row: **no date field on it is callout-written, and all three are
`dd-MM-yyyy`.** The invoice windows are the exception, not the rule.

### 3.4 The third format

`aeatsiiFechaRegCont` resolves through an `@SQL=SELECT CASE WHEN …` default, whose result reaches
the response as the JDBC driver rendered it: `2026-08-06 18:55:31.567837+00` — space separator,
microseconds, `+00` offset.

**Correction to an earlier claim in this file.** The first version of §3.4 asserted that this string
matches none of the `JsonUtils` formats and therefore raises a genuine `ParseException` → `Error` on
write. **That is wrong**, and the probe in §2.1 is what killed it: a lenient `SimpleDateFormat`
parses the leading `yyyy-MM-dd` and **silently ignores the trailing text**, so the value round-trips
to `2026-08-06` without error. It is a cosmetic defect of the response (three formats where there
should be one), not a second corruption vector. On `purchase-invoice` the field is `readOnly`
(`discarded` on `sales-invoice`), so no agent sends it back anyway.

### 3.5 `combos` are not normalized at all

`normalizeUpdateDatesToIso` covers `updates`. `NeoDefaultsCascadeHelper.mergeCalloutCombos`
(395-415) writes `selectedValue` verbatim into both `formState` and `defaults`, and
`mergeCalloutUpdates` (351-353) does the same for values that arrive outside the normalized path.
There is no date handling anywhere in that file. A date delivered through a combo is therefore
`dd-MM-yyyy` even on a window where the equivalent `updates` field is ISO.

### 3.6 The corruption is not hypothetical — it is already in the database

The registry framed IMP-16 as an agent-ergonomics defect. It is not. A read-only sweep of
**all 311 date/timestamp columns** of every populated table on `etendo-go-local`, looking for values
before 1900, found **14 rows across 5 columns**:

| Table.column | Rows | Range |
|---|---|---|
| `c_order.datepromised` | **10** | `0011-02-16` … `0029-12-17` |
| `c_order.dateacct` | 1 | `0029-12-17` |
| `ad_user.lastpasswordupdate` | 1 | `0022-01-16` |
| `tbai_config.tbaisystemdate` | 1 | `0036-01-16` |
| `aeatsii_config.monitordate` | 1 | `0006-07-10` |

### Attribution

Inverting the lenient parse over every `dd-MM-yyyy` string in 2023–2028 gives a unique preimage for
4 of the 5 values, and each preimage is a real recent date:

| Stored value | Only `dd-MM-yyyy` input that produces it |
|---|---|
| `0027-12-17` | `22-06-2026` |
| `0028-12-16` | `23-06-2026` |
| `0029-12-17` | `24-06-2026` |
| `0011-02-16` | `05-08-2026` |
| `0022-01-16` | `16-07-2026` |
| `0036-01-16` | `30-07-2026` |
| `0006-07-10` | none in 2023–2028 — a different cause, not this bug |

### The 1:1 match that settles it

Every corrupt `c_order` row's value decodes to **that row's own creation date**:

| documentno | created | `datepromised` | decodes to | `dateordered` |
|---|---|---|---|---|
| 1000011 | 2026-06-22 19:25 | `0027-12-17` | `22-06-2026` | `2026-06-22` ✅ |
| 1000011 | 2026-06-23 23:25 | `0028-12-16` | `23-06-2026` | `2026-06-23` ✅ |
| 1000012 | 2026-06-23 23:30 | `0028-12-16` | `23-06-2026` | `2026-06-23` ✅ |
| 1000013 | 2026-06-23 23:31 | `0028-12-16` | `23-06-2026` | `2026-06-23` ✅ |
| 1000014 | 2026-06-23 23:33 | `0028-12-16` | `23-06-2026` | `2026-06-23` ✅ |
| 1000011 | 2026-06-23 23:36 | `0028-12-16` | `23-06-2026` | `2026-06-23` ✅ |
| 1000012 | 2026-06-23 23:40 | `0028-12-16` | `23-06-2026` | `2026-06-23` ✅ |
| 1000013 | 2026-06-24 13:20 | `0029-12-17` | `24-06-2026` | `2026-06-24` ✅ |
| 1000014 | 2026-06-24 19:15 | `0029-12-17` | `24-06-2026` | `0029-12-17` ❌ |
| 1000017 | 2026-08-05 18:26 | `0011-02-16` | `05-08-2026` | `2026-08-05` ✅ |

Not one exception. `@#Date@` resolved to the creation date in `dd-MM-yyyy`, the lenient parser turned
it into a first-century date, and it was persisted.

### Two things this table proves that reading the code could not

1. **Every order created through NEO in 2026 has a corrupt `datepromised`.** Creation volume by day:
   1 order on 2026-08-05 (1 corrupt), 2 on 2026-06-24 (2 corrupt), 6 on 2026-06-23 (4 corrupt),
   1 on 2026-06-22 (1 corrupt). The 2020–2021 sample-data orders and the 2026-04-16 batch are clean —
   they were not created through NEO. This is not an edge case; it is the default outcome.
2. **§3.2's rule is confirmed by persisted data.** `dateordered` and `dateacct` are correct on 9 of
   10 rows while `datepromised` is corrupt on all 10 — because the order callouts rewrite the first
   two during the create cascade (so ETP-4244's normalizer returns them as ISO, which parses
   correctly) and nothing touches `datepromised`. The single row where `dateacct` is *also* corrupt
   (1000014, 19:15) is the case where that callout did not fire. **Whether a date survives depends
   on whether a callout happened to touch it** — exactly the read-side rule, now visible in the
   stored data.

### Consequence for the fix

This moves IMP-16 out of MCP ergonomics and into backend data integrity. `datepromised` drives
delivery scheduling and MRP; a `dateacct` in year 29 would post to a nonexistent accounting period.
Two things follow:

- The fix is a **backend** fix that the MCP happens to also benefit from, not the reverse.
- **Existing rows need a corrective data-fix**, which is out of this item's scope: the inverse map is
  unique per value inside a plausible year range (§ above), so a `cli/src/data-fixes/` migration
  scoped by `ad_client_id` can restore them deterministically. That belongs to Remedy and should be
  registered separately — a code fix alone leaves 14 wrong rows in place.

### 3.7 The React form already expects ISO — so canonicalizing is not a breaking change

`neo_defaults` is not an MCP-only surface: the React form bootstraps from
`GET /sws/neo/{spec}/{entity}/defaults`. Changing its date format therefore has to be checked against
the frontend contract, and that contract is **already ISO in both directions**:

| Direction | Code | Behaviour |
|---|---|---|
| backend → form | `app-shell-core/src/lib/dateOnly.js:1` — `/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/` | 4-digit year first: matches ISO and the Postgres-timestamp shape. Anything else falls through to `new Date(str)`, which reads `06-08-2026` as **June 8** (`MM-DD-YYYY`) and yields `Invalid Date` for a day > 12 |
| form → backend | `components/ui/date-field.jsx:21` `toIsoDate()`, used at `:268` and `:315` | the date field **emits ISO** |

So today's `dd-MM-yyyy` is a latent frontend defect too — day and month silently swapped for the
first 12 days of a month, an em-dash for the rest — and the fact that the React form creates
documents correctly proves `JsonToDataConverter` handles ISO natively, because ISO is what the form
sends.

The callout boundary is likewise safe, and demonstrably a no-op:

| | Today | After canonicalization |
|---|---|---|
| resolved default | `06-08-2026` | `2026-08-06` |
| `CalloutRequestBuilder.isoToEtendoDate` | returns `null` (not ISO) → value left as-is | converts to the UI pattern |
| **value the legacy callout receives** | `06-08-2026` | `06-08-2026` |

`reformatDateParams` (137-141, gated to `AD_Reference` `"15"`) exists for exactly this and is
currently a no-op for these fields because ISO never reaches it. Feeding it ISO activates it rather
than duplicating it — which is also why the normalization must be **gated to reference `15`**, the
same gate the two ETP-4244 normalizers use: it keeps the set of values that change format identical
to the set the existing bridge already handles.

## 4. Hypotheses that were wrong

Recorded per the `imps/` convention — a wrong first guess belongs in the file, not deleted.

| Hypothesis | Killed by |
|---|---|
| `NeoConversionHelper` is the JSON→DAL value converter | Read in full: it is a multi-currency SQL helper for widget KPI aggregates (`CONVERTED_GRANDTOTAL`, `resolveOrgCurrencyId`). Nothing to do with dates. The name is the whole reason it was suspected |
| A per-window `ETGO_SF_FIELD.defaultvalue` injects the `dd-MM-yyyy` literal | `sf_default` is `null` for every date field on both invoice specs; `AD_Column.DefaultValue` is `@#Date@` (`@DateInvoiced@` for the operation date) |
| An `AD_Preference` overrides the default | No preference rows exist for these columns — `getPreference` returns `""` |
| A callout writes `inpdateinvoiced` back | No callout in either tree writes it. `SE_Invoice_AccountingDate` writes `inpdateacct`, `SifInvoiceOperationDateCallout` adds `inpemEtsgDateOperation`, `SE_Invoice_TaxDate` writes `inptaxdate` |
| `formState` aliases `defaults`, so the request builder mutates the response | `NeoDefaultsCascadeHelper:115` is `new JSONObject(defaults.toString())` — a copy |
| `McpSelectorContextHelper.CLASSIC_DATE_FORMATTER` (`dd-MM-yyyy`) is the source | That formatter is on the `neo_selectors` **input** side only |
| **Two conflicting `#Date` session values**: `NeoDefaultsService` sets ISO, `NeoCalloutService.buildSessionAttributes` copies the UI-format one from `buildCalloutVars`, and whichever vars instance reaches `Utility.getDefault` decides | The leading hypothesis for most of the investigation, and **wrong in its mechanism**: `@#Date@` never reads *any* session value (§3.1). Both `#Date` values are irrelevant to default resolution. The conclusion it pointed at — "the format depends on which path ran" — survives; the reason does not |

## 5. Design options

Two independent decisions. The read side chooses a canonical output format; the write side decides
how much input to tolerate. They are separable and should be argued separately.

### 5.1 Write side — the one option that is not optional

**Make the write path reject what it cannot parse, and accept both formats before it gets there.**

A lenient `SimpleDateFormat` that turns `"06-08-2026"` into year 12 is a defect no matter who
produced the string. Even after the read side is unified, an agent, a legacy client or a future
`@SQL=` default can send `dd-MM-yyyy`, and silently storing year 12 is the worst available outcome:
worse than an error, worse than ignoring the field.

Where to put it:

| Option | Cost | Note |
|---|---|---|
| **W-a** — add a `Date`/`Timestamp` branch to both NEO coercers | small, `♻️` | The natural home: they exist for exactly this reason. Must be added to **both** or they drift (§2.2). Accepts ISO, `dd-MM-yyyy` and the Postgres timestamp shape; emits ISO for `JsonToDataConverter` |
| **W-b** — fix `JsonUtils.createDateFormat()` to `setLenient(false)` | one line, `⚙️`, `etendo_core` | Correct in principle and out of this item's blast radius: every JSON write in the ERP goes through it. A core change turning silent corruption into an `Error` is a separate conversation with core, not an ETP-4793 commit. **Recommend raising it, not shipping it here** |
| **W-c** — a shared `NeoDateCoercion` used by both coercers | small, `♻️` | W-a done once instead of twice. Same precedent as IMP-7's shared `isUnresolvedValue`: one definition, so the MCP and REST paths cannot disagree |

**Recommended: W-c, and file W-b upstream.** W-c fixes the corruption inside `com.etendoerp.go`
without waiting for core, and W-b removes the trap for everyone else.

### 5.2 Read side — where to canonicalize the output

| Option | Cost | Note |
|---|---|---|
| **R-a** — normalize dates to ISO at the `neo_defaults` response boundary, keyed on `Property.isDate()` / reference `"15"` | small, `⚙️` on the response | One place, covers `updates`, `combos`, `@#Date@` and `@SQL=` alike, and needs no change to the resolution chain. Also the only option that catches the Postgres-timestamp shape |
| **R-b** — normalize inside `mergeCalloutUpdates` / `mergeCalloutCombos` | small | Closes §3.5's combos gap where it happens, but leaves the non-callout `dd-MM-yyyy` majority (§3.3) untouched. Not sufficient alone |
| **R-c** — make `@#Date@` resolve to ISO by not routing through `DateTimeData.today` | medium, `⚙️` | Fixes the *cause*. But `getContext`'s `#Date` special case is core behaviour that the whole classic UI depends on; overriding it inside NEO means diverging from `Utility.getDefault`, which is precisely what `NeoDefaultsService`'s header comment says it exists not to do |
| **R-d** — declare `dd-MM-yyyy` canonical and normalize the ISO fields *down* | small | Internally consistent and rejected: ISO 8601 is what an MCP client expects, what the `docs` corpus already uses throughout (B9), and what `JsonToDataConverter` parses natively |

**Recommended: R-a, plus deleting the dead ISO `#Date` line (§3.1).** R-b becomes unnecessary once
R-a is in place; R-c is the theoretically right fix and the wrong risk for this item.

### 5.3 The shape this points at

Postel's law, stated explicitly in the contract: **ISO 8601 out, always; ISO or the Etendo UI format
in, with anything unparseable rejected as a structured validation error naming the field.** R-a +
W-c gets there. The `neo_defaults` and `neo_schema` descriptions should say so — an agent currently
has no way to know which format a given field will hand it.

## 6. What landed

Implemented on `feature/ETP-4793` in `com.etendoerp.go`. **Not compiled and not probed** — the human
builds and deploys; §7 is the verification that must run afterwards.

| File | Change |
|---|---|
| `schemaforge/util/NeoDateFormat.java` | **new.** The single definition of the canonical wire format and the only list of accepted input shapes. `toCanonical(String, boolean datetime)` → ISO, or `null` for anything it does not recognise; `isCanonical` for the cheap already-ISO path; `getUiDatePattern()` reads `dateFormat.java` |
| `schemaforge/NeoDefaultsService.java` | `canonicalizeDateDefaults(defaults, dalEntity)` post-pass over the response; the dead `#Date` session seed and its `DATE_FORMAT` constant deleted, with a comment pointing at `Utility.getContext:410` so the next reader does not re-add it |
| `schemaforge/util/NeoTypeCoercionHelper.java` | date branch in `coerceField` (REST write path) |
| `mcp/McpToolRouterSupport.java` | date branch in `coercePrimitiveFieldValue` (MCP write path) |
| `schemaforge/CalloutRequestBuilder.java` | `getCalloutDatePattern()` now delegates to `NeoDateFormat.getUiDatePattern()`; the duplicated property lookup and its cache removed |
| `mcp/ToolRegistry.java` | `neo_create` / `neo_update` state the required input format; `neo_defaults` states that its date values come back ISO and can be passed straight back |
| `docs/neo-headless.md` §4.3.1 | the date contract, the three producers of non-ISO values, and the three application points |
| `src-test/…/util/NeoDateFormatTest.java` | **new.** Includes `"06-08-2026"` and `"24-06-2026"` as named regressions — the two values found in real rows (§3.6) — plus the zone-offset boundary and one case per date-ish domain type |
| `src-test/…/util/NeoTypeCoercionHelperTest.java`, `src-test/…/mcp/McpToolRouterSupportTest.java` | the same seven date cases on both coercers, deliberately duplicated so the two implementations cannot drift silently. Three of them assert a **non**-change: a Time property, an AbsoluteDateTime property, and a non-zero offset must all come out byte-identical |

### 6.1 Three decisions worth recording

**The read-path normalization is a single post-pass, not per-field.** The plan called for a hook in
`applyDefaultWithComboFallback` beside `coerceBooleanDefault`. It landed as one pass after all three
resolution passes *and* the callout cascade instead, because `defaults` is the cascade's **input**:
normalizing before it would change what legacy callouts receive. Normalizing after leaves that
boundary byte-for-byte as it is today, and still catches the cascade's own output, the sequence pass
and the hidden-mandatory pass — which a per-field hook would have missed.

**The gate is the DAL *domain* type, not `AD_Reference` `"15"` and not the Java type.** The plan said
reference 15. The implementation keys off what the DAL parser itself branches on, so the
normalization cannot disagree with the consumer it exists to satisfy — and it covers DateTime columns
that reference 15 excludes.

The first cut of this got it wrong, and the correction is the interesting part. It gated on
`java.util.Date.class.isAssignableFrom(prop.getPrimitiveObjectType())` plus `prop.isDatetime()` — two
cases. `Property.java:1107-1124` has **five** date-ish domain types, and `JsonToDataConverter`
branches on all five:

| Domain type | Predicate | Eligible? |
|---|---|---|
| `DateDomainType` | `isDate()` | ✅ → `yyyy-MM-dd` |
| `DatetimeDomainType` | `isDatetime()` | ✅ → `yyyy-MM-dd'T'HH:mm:ss` |
| `TimestampDomainType` | `isTimestamp()` | ❌ untouched |
| `AbsoluteTimeDomainType` | `isAbsoluteTime()` | ❌ untouched |
| `AbsoluteDateTimeDomainType` | `isAbsoluteDateTime()` | ❌ untouched |

The two `Time` kinds are **time-of-day** values backed by `java.util.Date`: the converter keeps only
the part after the `T`, appends `+0000` and supplies the calendar day itself. A gate on the Java type
therefore captured them, and would have rewritten `2026-08-06T14:30:00` to `2026-08-06` — deleting
the only half that column reads. `AbsoluteDateTime` would have lost its time for the same reason.
The eligibility decision now lives in one place, `NeoDateFormat.canonicalShapeFor(Property)`, which
returns `FALSE` / `TRUE` / `null` for the three outcomes.

A read-only census of `etgo_sf_field` on `etendo-go-local` sizes what the first cut risked: **247
curated fields across 88 entities on reference 15 (Date), 15 fields across 10 entities on reference
16 (DateTime), and zero curated fields on reference 24 (Time)**. So no curated NEO field could have
hit it — but the coercers run on any request body, and 230 MCP-exposed POST-able entities exist, so
the gate was narrowed regardless. An exclusion nobody can currently reach is still the right shape
for a change of this blast radius.

The narrowing that protects existing behaviour on the *value* side is separate: **an input shape the
canonicalizer does not recognise is left verbatim**, so the set of values whose bytes change is
exactly the set that is provably wrong today. `2026-08-06T14:30:00+02:00` falls in that set on
purpose — it already reaches the DAL correctly (`JsonUtils.convertFromXSDToJavaFormat` rewrites
`+02:00` to `+0200`), and the canonical form has nowhere to put an offset, so normalizing it would
shift the instant by two hours. A **zero** offset (`Z`, `+00`, `+00:00`) *is* dropped, because an
offset-less canonical value is read as UTC by that same method — identity, not approximation.

**The 422 is not in this change.** Phase 1 normalizes and logs `WARN` on an unparseable value.
Promoting that to an IMP-5-style structured 422 is phase 2, once the logs show the `WARN` never
fires on real traffic — shipping both at once would mean turning an unknown number of currently
working (if lenient) calls into hard errors on the same deploy.

### 6.2 Verified before the build, empirically

`NeoDateFormat`'s logic was extracted to a standalone single-file program and run on a JDK
(openjdk-11), with the `OBPropertiesProvider` lookup stubbed to the `dd-MM-yyyy` fallback and the
parsing code otherwise untouched. All **28** cases pass, including the two that matter most:

| Input | `datetime` | Output |
|---|---|---|
| `06-08-2026` | false | `2026-08-06` (was persisting as year 0012) |
| `24-06-2026` | false | `2026-06-24` (was persisting as `0029-12-17`) |
| `2026-08-06` | false | `2026-08-06` — unchanged; ISO is tried before the UI pattern |
| `2026-08-06 18:55:31.567837+00` | true | `2026-08-06T18:55:31` |
| `2026-08-06 18:55:31.567837+00` | false | `2026-08-06` |
| `2026-08-06T14:30:00Z`, `…+00:00` | true | `2026-08-06T14:30:00` — zero offset dropped |
| `2026-08-06T14:30:00+02:00` | true | `null` → **refused**, so the correct instant survives |
| `2026-08-06T14:30:00+02:00` | false | `2026-08-06` — for a date-only column an offset cannot move the day |
| `2026-08-06T banana` | true | `null` — an unaccountable time half is refused, not silently midnight |
| `06/08/2026`, `2026-02-30`, `30-02-2026`, `2026-13-40`, `2026-08`, `2026-08-06+02:00` | — | `null` → caller keeps the original |

`2026-02-30 → null` is deliberate: the formatter uses `ResolverStyle.STRICT`, so an impossible day is
an error rather than being slid to February 28th. Smart resolution would have reproduced, in the fix,
the same silent-reinterpretation behaviour the fix exists to remove.

This is compile-adjacent, not a compile: it proves the algorithm, not that the class links against
the Etendo classpath.

## 7. Verification owed after the build

| # | Check | Accepts |
|---|---|---|
| 1 | `neo_defaults` on ~8 windows, before/after `diff` | **only** date-typed fields changing `dd-MM-yyyy` → ISO. Any other diff — a missing key, a changed FK, a changed `$_identifier` — aborts and reverts |
| 2 | Create a document through the React form end to end | saves, and the date fields display the right day (today they are day/month-swapped for days 1–12 and blank for 13+) |
| 3 | `neo_create` on `sales-order/header` sending no date | stored `datepromised` is the real date, not a first-century one |
| 4 | Server log during 1–3 | `canonicalizeDateDefaults` INFO lines name only date fields; **zero** `Unrecognized date format` WARNs |

Only after 1–4 does a `/mcp-comparison` run get to touch the registry row.

## 8. What is not claimed here

No status is changed. The code in §6 is written but **not compiled, not deployed and not probed**.

What **is** established, and how:

| Claim | Evidence |
|---|---|
| the lenient parser turns `dd-MM-yyyy` into a first-century date | executed against a JDK (§2.1) |
| NEO emits `dd-MM-yyyy` for every `@#Date@` default | code path read end to end (§3.1) |
| the corruption reached the database | 14 rows found by a read-only sweep of all 311 date columns, 4 of 5 values attributed by inverting the parse, every `c_order` row matching its own creation date 1:1 (§3.6) |
| canonicalizing to ISO does not break the React form | the frontend already parses ISO-only and emits ISO (§3.7) |
| canonicalizing does not change what legacy callouts receive | `isoToEtendoDate` is idempotent by construction and currently a no-op for these fields (§3.7) |

**No write probe was needed** — the earlier version of this section said one was. The stored evidence
in §3.6 is stronger than a probe would have been: it shows the bug affecting real records created
over two months, not a record this investigation created.

What is **not** established: nothing has been compiled against the Etendo classpath, and the two
safety arguments in §3.7 are read from source rather than observed. §7 is the list of checks that
must run after the build before any of this is credited.

## 9. The write half, closed — 2026-08-10

The 2026-08-10 run credited the read/emit half and reported the write half as *"worse than the item
specified"*: `neo_update orderDate:"09-08-2026"` returned `status: 0` and stored `0015-02-16` (C11).
It registered that as a new P1, IMP-24, on the reading that the emit-side mechanism had shipped and
the write side needed a different fix.

**That reading was wrong, and the correction is the whole content of this section: the write-side
mechanism had shipped too. It was unreachable.**

| Persist path | Coercion pass | Before 2026-08-10 |
|---|---|---|
| `POST /crud` (React form; every `neo_batch` op, via `BatchService` → `NeoCrudHandler#handleDefault`) | `coerceTypes` at `NeoCrudHandler:521` | ✅ |
| `PUT`/`PATCH /crud` | `NeoTypeCoercionHelper.wrapForSmartclient` → `coerceTypes` | ✅ (via the wrapper, not the handler) |
| `neo_create` | `coerceFieldTypes` at `McpToolRouter:499` | ✅ |
| **`neo_update`** | — | ❌ **none** |

`handleUpdate` mapped fields, resolved FK names, wrapped and called `jsonService.update`. Its own
comment said so in as many words — *"handleUpdate has no other coercion pass"* — written about the FK
resolver, and true of the date branch as well. So `"09-08-2026"` reached the lenient DAL parser
untouched, and §2.1's arithmetic did the rest.

Two things made this invisible for a full wave:

1. **The two `wrapForSmartclient` implementations had drifted.** `NeoTypeCoercionHelper`'s calls
   `coerceTypes` internally, so on REST the wrap doubles as a safety net; `McpToolRouterSupport`'s is
   a copy that never gained it, and its Javadoc still claimed the two were *"identical"*. The REST
   update path is protected by that accident; the MCP one was not protected by anything.
2. **Unit tests could not see it.** `NeoTypeCoercionHelperTest` and `McpToolRouterSupportTest` both
   assert `06-08-2026 → 2026-08-06`, and both passed the entire time `neo_update` was writing year
   0015. The defect was a **missing call site**, a class of bug no test of the callee can reach.

### What changed

| File | Change |
|---|---|
| `mcp/McpToolRouter.java` | `handleUpdate` now calls `coerceFieldTypes(filteredBody, dalEntity)`, before the `NeoHandler` pre-hook — the same position `handleCreate` uses, so a hook that mirrors a date field (e.g. `mirrorAccountingDate`) copies an already-canonical value |
| `mcp/McpToolRouterSupport.java` | the `wrapForSmartclient` Javadoc states that this wrapper does **not** coerce, that its REST twin does, and that the fix for a future gap is the missing call site — not adding a second pass here, which would give `neo_create` two and hide the next one |
| `src-test/…/mcp/McpWriteVerbCoercionCallSiteTest.java` | **new.** Source-reading guard: any `McpToolRouter` method reaching `jsonService.add`/`update` must also call `coerceFieldTypes`. Fails on the pre-fix source (`violations: [handleUpdate]`), clean on the fixed one — both verified by running the extractor on a JDK against the real file, before and after. Asserts ≥ 2 persisting methods so a refactor cannot make it pass vacuously |
| `docs/neo-headless.md` §4.3.1 | the per-path invocation table above, the pre-hook ordering rule, and the hook-must-emit-ISO corollary |

**What this does not fix, deliberately:** an unparseable shape is still passed through with a `WARN`
rather than refused (§6.1's phase 2). Rejecting loudly with an IMP-5-style 422 — Holded's HTTP 400 is
the target shape — remains IMP-24's remit, and is now IMP-24's *whole* remit: the corruption vector
the 2026-08-10 run measured is closed by a call site, not by a parser change.

### Verification owed after the build

§7's four checks stand. Add:

| # | Check | Accepts |
|---|---|---|
| 5 | `neo_update` on a `sales-order` header with `orderDate: "09-08-2026"` | stored `2026-08-09` — **and** `accountingDate` unchanged unless a hook mirrored it, in which case also `2026-08-09`. This is C11 re-run; it is the one probe that decides IMP-24's status |
| 6 | `neo_update` with `orderDate: "06/08/2026"` | the value is refused or errors loudly; nothing is stored in the first century. Confirms the `WARN`-and-pass-through boundary is where §6.1 says it is |
| 7 | Server log during 5–6 | `[MCP] Normalized date 'orderDate': '09-08-2026' -> '2026-08-09'` on 5; a single `Unrecognized date format` `WARN` on 6 |

### 9.1 Verified — 2026-08-10, after the user's compile + redeploy

Probed on `etendo-go-local` against a record this investigation created and then deleted (a
`sales-order` header tagged `MCP-BENCHMARK 2026-08-10 date-fix`, `1000028` /
`E4018D6F88964E9993F43CC4C635B76E`). No pre-existing record was written to. Deleted afterwards via
`neo_delete`; the marker sweep across `c_order` and `c_orderline` returns 0 rows, and the id is gone.

| # | Result | Measured |
|---|---|---|
| 3 | ✅ | `neo_create` with **no** dates sent → `orderDate` and `accountingDate` both `2026-08-10`; in the database `dateordered`, `dateacct` and `datepromised` are all real 2026 dates, none first-century |
| 5 | ✅ | `neo_update {"orderDate": "09-08-2026"}` → response `2026-08-09`, **and** `accountingDate` mirrored as `2026-08-09`. Database agrees: `dateordered = dateacct = 2026-08-09`. This is C11 re-run: it previously returned `status: 0` with `0015-02-16` on both fields. **The corruption vector is closed** |
| 6 | ✅ (on the safety question) | `neo_update {"orderDate": "06/08/2026"}` → refused, nothing stored. The value never reaches the first century |
| 7 | ✅ | Exactly the two expected lines, and nothing else: one `INFO … Normalized date 'orderDate': '09-08-2026' -> '2026-08-09'` on 5, one `WARN … Unrecognized date format for 'orderDate': '06/08/2026' passed through unchanged` on 6 |

Check 5 also settles the ordering argument in §9's *What changed* table by observation rather than by
reading: `accountingDate` is written by the `NeoHandler` pre-hook, and it carries the canonical value.
Coercing *before* the hook is what makes that true — the reverse order would have mirrored
`"09-08-2026"` and reintroduced the bug on the sibling field alone.

**Two findings the probes produced that are not IMP-16's:**

1. **The refusal in check 6 is a raw DAL envelope, not an IMP-5 one.** What came back was
   `Validation error: {"status":-4,"errors":{"orderDate":"java.text.ParseException: Unparseable date:
   \"06/08/2026\"","accountingDate":"..."}}` — a leaked `status: -4` with a Java exception class name in
   the message. It is loud, so it is safe; it is not *usable*, so it is not done. This is now concrete
   input for IMP-24's remaining half (target shape: Holded's HTTP 400 naming value + expected format +
   an example) and an IMP-5 observation in its own right — the MCP update path leaks the raw envelope
   IMP-5 was supposed to have covered.
2. **`scheduledDeliveryDate` is written but not projected.** The create log shows
   `Normalized date 'scheduledDeliveryDate': '10-08-2026' -> '2026-08-10'`, and `datepromised` in the
   database is `2026-08-10` — so the field exists in the `sales-order` spec and the write path handles
   it correctly. But it is absent from both `neo_list` and `neo_get` responses. That is a read-side
   projection question, not a date question; it is *not* the silent-unknown-field drop of IMP-18 and
   should not be filed under it without checking the spec's field list first.

Checks 1, 2 and 4 of §7 (the `neo_defaults` diff over ~8 windows, the React-form round trip, and their
log) remain unrun. They cover the **read/emit** half, which the 2026-08-10 run had already credited
behaviourally; the write half is what this section closes.
