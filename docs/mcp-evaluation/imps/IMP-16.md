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
microseconds, `+00` offset. That string matches **none** of the `JsonUtils` formats
(`yyyy-MM-dd`, `yyyy-MM-dd'T'HH:mm:ssZZZZZ`, `HH:mm:ssZZZZZ`, `HH:mm:ss`,
`yyyy-MM-dd'T'HH:mm:ss`), so echoing it back on a write is a genuine `ParseException` → `Error`.
On `purchase-invoice` the field is `readOnly` (`discarded` on `sales-invoice`), which is the only
reason no probe has hit it yet.

### 3.5 `combos` are not normalized at all

`normalizeUpdateDatesToIso` covers `updates`. `NeoDefaultsCascadeHelper.mergeCalloutCombos`
(395-415) writes `selectedValue` verbatim into both `formState` and `defaults`, and
`mergeCalloutUpdates` (351-353) does the same for values that arrive outside the normalized path.
There is no date handling anywhere in that file. A date delivered through a combo is therefore
`dd-MM-yyyy` even on a window where the equivalent `updates` field is ISO.

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

## 6. What is not claimed here

No status is changed. No code was written. The root cause of the silent corruption (§2) is
**confirmed by reading the parser**, not by observing a stored year-12 record — the arithmetic is
unambiguous, but the write probe that would show `dateinvoiced = 0012-02-16` in the database has not
been run. That probe belongs to the next `/mcp-comparison` run (W1–W4, authorized, `etendo-go-local`)
and would be the direct evidence for the registry cell.
