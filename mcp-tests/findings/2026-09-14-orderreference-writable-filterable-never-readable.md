# `orderReference` can be written and filtered, but never read back

**Date:** 2026-09-14
**Run:** `20260914T1723-local-49fa`, probe `find-own-order` (plus a manual follow-up, below)
**Target:** local — `http://localhost:8080/etendo/sws/mcp`
**Spec/entity:** `sales-order` / `header`

## What happened

`find-own-order` reported it could not use the reference field it expected. Chasing that produced a
sharper result than the probe itself saw.

`orderReference` (AD column `POReference`) is declared by `neo_schema` as
`"visibility": "discarded"`. That turns out to affect ONLY the read projection. Verbatim sequence,
run by hand against the order the same run had created:

```
neo_update {id: F6BFDCD2..., updated: <ts>, fields: {orderReference: "HARNESS-PROBE-XYZ"}}
  -> 200, record returned

neo_get    {id: F6BFDCD2...}
  -> orderReference: None        <-- the value is not projected

neo_list   {filters: {orderReference: "HARNESS-PROBE-XYZ"}}
  -> totalRows: 1                <-- but the value IS in the database and IS filterable
```

So the field is **writable**, **filterable**, and **invisible on read**.

## Why it matters

An agent can set a value, get a success response, and then have no way to confirm it — every read
says the field is empty while the database says otherwise. That is the same shape as the false-OKAY
defect recorded in `2026-09-14-neo-create-accepts-unknown-field-silently.md`: the write side reports
success and the read side cannot contradict it.

It is also why this field was rejected as the harness's marker field. `description` is used instead.

## The UI test (D22)

**Does not apply as a defect claim about a user task.** A person cannot set `orderReference` in the
Etendo GO UI at all, because `visibility: "discarded"` removes it from the window. So no user task
is blocked, and a probe that asked for this field would be a broken probe, not a finding.

The claim here is narrower and is about the MCP's own consistency: the three tools disagree with
each other about whether the field exists. `neo_update` accepts it, `neo_list` filters on it,
`neo_get` denies it. Whichever answer is correct, they should agree.

## Not verified

- Whether `neo_create` (as opposed to `neo_update`) also accepts `orderReference`.
- Whether this is specific to `sales-order/header` or applies to every `visibility: "discarded"`
  field on every entity. Only this one field was tested.
- Whether the read projection is intended behaviour for discarded fields. If it is, then the defect
  is on the write/filter side accepting a field the read side considers absent — but which of the
  two is wrong was not established here.

## Side effect on the tenant

The follow-up set `orderReference = "HARNESS-PROBE-XYZ"` on order `1000355`
(`F6BFDCD2D3084DE4A90803B9893D4CA9`), the order created by probe
`create-empty-default-customer` in run `20260914T1723-local-49fa`. Left in place as evidence.
