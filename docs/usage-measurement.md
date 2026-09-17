# Usage Measurement (ETP-5050)

Measures real consumption per tenant per day, in **shadow mode**: it charges nothing, enforces
nothing, and writes to no business table. It exists so that ETP-5046 (resource limits) and
ETP-5051 (overage) have real numbers to reason about before anyone is billed from them.

Implementation lives in `modules/com.etendoerp.go/src/com/etendoerp/go/usage/`. The design
document is `modules/com.etendoerp.go/docs/plans/2026-09-15-etp-5050-usage-measurement-design.md`;
this page is the summary of what the branch actually delivers, and of the one design problem
that is still open.

---

## 1. What it is

Two tables, both System-level (`ACCESSLEVEL=4`):

| Table | Holds |
|---|---|
| `ETGO_BILLING_RESOURCE` | the catalog: what is countable, and how to count it |
| `ETGO_USAGE_DAILY` | the aggregate: one row per (tenant, resource, day) |

`ETGO_USAGE_DAILY` is System-owned data *about* a tenant, so `AD_CLIENT_ID = '0'` and the
measured tenant is a plain FK in `MEASURED_CLIENT_ID`. That is what makes cross-tenant
aggregation natural instead of a fight with client filtering. The unique key
`(MEASURED_CLIENT_ID, ETGO_BILLING_RESOURCE_ID, USAGE_DAY)` is the whole of the idempotency
story: a re-run overwrites rather than duplicates.

Adding a countable resource is **inserting a catalog row**, not writing code — as long as it
can be expressed declaratively (§2).

## 2. The two counting modes

**Declarative (`COUNTING_MODE = 'D'`)** — the row names a DAL entity, a date property and an
optional HQL restriction. One query per resource-day covers every tenant:

```hql
select outer_.client.id, count(*)
  from <Entity> outer_
 where outer_.<dateProperty> >= :dayStart
   and outer_.<dateProperty> <  :dayEnd
   and outer_.id in (select e.id from <Entity> e where ( <fragment> ))
 group by outer_.client.id
```

The restriction goes into a **subquery**, not the outer `and`-chain. A paren breakout inside it
can only widen the subquery's candidate set; the day bounds still clamp the outer query, and
tenant attribution comes from the `group by`, which no fragment can reach. Composition happens
in exactly one place, `UsageQueryComposer`.

**Named strategy (`COUNTING_MODE = 'S'`)** — the row names a CDI qualifier and a deployed
`UsageResourceCounter` answers instead. This is for rules a row count cannot express (§4).
Implementations must be annotated **`@Named` and nothing else** — never `@ApplicationScoped` or
any normal scope, because lookup matches on the bean name and a proxied bean's subclass does not
carry the non-`@Inherited` qualifier. See `neo-headless-extensibility.md` §2.8.

## 3. The settling window

A day stays open for `ETGO_UsageSettlingWindowDays` days (an `AD_Preference`, default 5). While
open, every run recomputes the **complete** day from scratch — nothing is incremental and
nothing is diffed, which is what makes a re-run idempotent and a backfill possible. This is why
an invoice dated the 3rd but posted on the 6th is still counted on the 3rd.

Once a day leaves the window it is **final** and is never recomputed, so a reported figure is
never revised downward. Changes landing after that are not counted; that is accepted for now.

**The sealing pass.** The scan reaches one day further back than the window, and that oldest day
is stamped `IS_SETTLED = 'Y'` *without being recomputed*. This is load-bearing, not slack: a day
only becomes final once it is **outside** the window (`isFinal` is `day < today - W`), so without
the extra day nothing would ever revisit a day after it went final and `IS_SETTLED` would stay
`'N'` on every row forever. Sealing stamps; it does not recompute, so the number reported while
the day was open is the number that stands.

Finality is evaluated **per tenant**, because the preference can be overridden per tenant. The
scan uses the maximum across tenants; each row's flag uses that tenant's own window.

## 4. The stock resource problem (open)

This is the significant unresolved issue in the design, and it decides how `activeUsers` and
`productiveEnvironments` can be implemented at all.

### Flow versus stock

A **flow** is something that *happens on* a day. The value comes from counting rows that carry
that day's date.

> *Posted sales invoices.* Three invoices dated 14 March count as 3 on 14 March, and 0 on every
> other day. Ask again next year and the answer for 14 March is still 3, because the invoices
> still carry that date.

A **stock** is something that *exists on* a day — a point-in-time level, not an event.

> *Active users.* A tenant with 12 active users has a value of 12 on Monday, 12 on Tuesday, and
> 12 every day that nothing changes. It is not "12 users happened on Monday". If one user is
> deactivated on Wednesday, the value becomes 11 from Wednesday on.

The distinction is not academic: **a stock cannot be expressed declaratively at all**, because
there are no rows dated that day to count. That is precisely why the strategy SPI exists. A
strategy that counts a flow demonstrates nothing the declarative mode could not already do.

### The problem

**A stock has no history to recompute from.** The settling window's whole purpose is to re-ask a
question as late data arrives, and for a flow that works, because the source rows carry the date
you bucket on. For a stock it does nothing, because the source holds only the *current* level.

Asked "how many active users did this tenant have on 2010-01-01?", `AD_USER` can only answer
"here is how many are active *now*". There is no deactivation history to reconstruct from. So:

- a stock strategy asked about a past day answers with **today's** snapshot;
- recomputing it five days running just writes today's snapshot five more times;
- a backfill over a wide range writes the *same* number against every day in it.

This was observed directly: a trial backfill of a stock resource over 2010–2027 wrote 74,520
rows carrying essentially one figure repeated across seventeen years. The mechanism worked
exactly as designed; the numbers were meaningless for every day except the current one.

The settling window cannot fix this, and neither can the aggregation engine — the information
simply is not in the database.

### What this forces

A stock resource has to solve it at the source, and the options are:

1. **Keep a dated history** of the thing being measured (an audit or snapshot table), so a past
   day has a real answer. Most faithful, most expensive.
2. **Only ever record the current day**, never backfill, and accept that history begins when
   measurement is switched on. Cheap and honest; means the first months have no data.
3. **Define the resource as a flow instead**, if the business question allows it — e.g. "users
   created that day" rather than "users active that day". Different quantity, so this is a
   product decision, not a technical shortcut.

Note that `productiveEnvironments` is specified in the ticket as `Client` by `creationDate`,
which is option 3 by accident: it counts clients *created* that day, a flow, while the billable
quantity is a stock. With no rollup in this task the difference does not yet bite, but storing a
flow under a stock's name would make every later reading of it wrong.

**Decision still owed:** the data source for `activeUsers`, and which of the three options above
applies to it. `AD_SESSION` is explicitly ruled out.

## 5. Save-time validation

An observer on `ETGO_BILLING_RESOURCE` validates a catalog row when it is saved, so a
misconfigured resource is a configuration-time error with a clear message instead of a job that
fails at 02:00 or, worse, silently counts nothing. It rejects an unknown entity, an unknown or
non-date date property, a fragment that cannot compose or parse, and a strategy qualifier no
deployed counter carries.

It then **probes**: it runs the composed query once over a single day and records the elapsed
milliseconds in `LAST_VALIDATION_MS`, so a fragment that would table-scan every tenant nightly is
visible before it is ever scheduled. The probe is bounded by a 10s query timeout, which is what
makes running it without a row limit safe — timing only the first group would measure neither the
nightly cost nor the same query plan.

Two constraints on messages here, both learned the hard way:

- The observer must throw **`OBException`**, not a plain `RuntimeException`. Anything else is
  swallowed and the user sees a save that silently does nothing.
- A message must contain **no `@` character**. Openbravo treats `@` as its message-parameter
  delimiter, so a message carrying one can reach the user blank.

## 6. Running it

The process is `ETGO_UsageAggregation` (`Billing Resource Usage Aggregation`), `ISBACKGROUND=Y`,
with two optional parameters.

- **No parameters** → the settling window: `[today - (W+1), today]`. This is what a schedule runs.
- **`DateFrom` / `DateTo`** → a backfill of that range, which *may* rewrite final days. This is
  what makes shadow mode useful: a full past month can be reviewed before anyone is billed.

Dates are accepted in the instance's display format (`dateFormat.java`) or `yyyy-MM-dd`, parsed
strictly and requiring the whole string — a lenient or partial parse would silently backfill a
range other than the one asked for.

From **Process Request** the parameters cannot be supplied (the `Params` field is not displayed),
so that route always runs the settling window. A scheduled request can carry them as JSON:
`{"DateFrom":"2011-01-01","DateTo":"2011-12-31"}`.

Re-running any range is safe and produces identical rows.

## 7. Verified behaviour

- **Counts are right.** A full backfill produced 308 counted invoices against exactly 308 posted
  sales invoices in the database — every invoice counted once, attributed to one tenant.
- **Containment holds.** A fragment of `1=1) or (1=1` stays inside its tenant and its day.
- **253 unit and DAL tests**, including an extensibility proof: a new catalog row added in a
  fixture is counted on the next run with no production code change.

## 8. Deliberately not done

- **Rollup of any kind** — no SUM or MAX over a period, no would-have-billed figure, no price.
- **Late changes** after the settling window are not counted.
- **API/MCP request volume** — needs instrumentation, not a query.
- **A nightly schedule** — the process exists and runs on demand; nothing schedules it yet.
- **Seeded catalog rows** — the catalog ships empty.

## 9. AD defects worth remembering

Three came from hand-written Application Dictionary records where a field left at its default
only showed up much later in generated output. None was visible in the XML or caught by
`check-etgo-xml.sh`:

| Field | Wrong value | Symptom |
|---|---|---|
| `AD_MODEL_OBJECT.ISDEFAULT` | `N` | WAD generated no launcher; the menu entry answered "You do not have sufficient privileges" |
| `AD_PROCESS_PARA.FIELDLENGTH` | `0` | rendered as `maxlength="0"`, so the date fields accepted no typed input |
| `AD_COLUMN` (`COMPUTED_AT`) | reference `15` (Date) | a timestamp stored as a date |

When adding AD records by hand, compare each field against the instance-wide norm
(`select isdefault, count(*) from ad_model_object where action='P' group by 1`) rather than
trusting that a blank or zero is harmless.
