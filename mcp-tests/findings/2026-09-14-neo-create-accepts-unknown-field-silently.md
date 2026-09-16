# `neo_create` accepts an unknown field silently and discards it

**Found:** 2026-09-14 · **Run:** `20260914T1536-local-c4ae` · **Target:** `etendo-go-local`
(`http://localhost:8080/etendo/sws/mcp`) · **Probe:** `create-empty-default-customer`
**Severity (proposed, not authoritative):** high — silent data loss on a write path

## What happened

The agent was asked to put a reference marker on a new sales order. It sent the marker in a field
called `reference`. The real fields are `orderReference` / `POReference`; `reference` does not exist
on the entity.

`neo_create` **returned success**. The order was created. The marker was never persisted.

```
neo_create(spec: "sales-order", entity: "header", fields: {
    ..., "reference": "20260914T1536-local-c4ae" })
→ 200, order created
```

Verified absent afterwards: `neo_list` filtered by that runId returns `totalRows: 0`.

## Why it matters more than one lost field

The write returned 200 with no warning, no `unknownFields` annotation, and nothing in the response
distinguishing "stored" from "ignored". An integration that writes to a mistyped or renamed field
loses that data permanently and cannot detect it — not from the response, and not from a later read,
because the field simply is not there.

Note the asymmetry with the read path: `neo_list` already reports `unknownFields` for a bad
projection (IMP-18). The write path has no equivalent.

## The UI test (D22)

**Could a person do this in the UI? The question does not apply in the agent's favour — it applies
against the server.** A person cannot type into a field that does not exist: the UI offers the real
fields and nothing else, so the mistake is unreachable there and silently destructive here. The gap
is MCP-vs-UI and it is the MCP that is wrong.

## Possibly the same root cause as IMP-30 / IMP-31

Both concern fields accepted without rejection (IMP-30: the rejection has zero call sites;
IMP-31: one handler exempts every field on its entity). **Not verified** — nobody has checked whether
this path goes through the same code. Worth discriminating before proposing a fix.

## What this broke in our own design

Decision **D3** of the harness design relies on the `{{runId}}` marker landing in the record so a
sweep is one query. Today the marker does not land. The mechanism is unusable until this is fixed or
the probes are rewritten to use a field that exists.

## Not verified

- Whether other write verbs (`neo_update`, `neo_batch`) behave the same way.
- Whether the shared root cause with IMP-30/31 is real.
