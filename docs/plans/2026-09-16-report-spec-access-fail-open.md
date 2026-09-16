# Proposal: report specs must not be fail-open

Date: 2026-09-16
Status: **proposal — not implemented**
Task: ETP-5335
Origin: found while fixing `generate_tax_report`, which returned invoices, amounts, VAT
rates and every contact's tax id to a role holding no window grants at all (external
security review, finding #2).

## 1. The defect

A report spec (`ETGO_SF_SPEC.spec_type = 'R'`) that declares no access anchor is reachable by
any authenticated role. `NeoAccessHelper.hasReportSpecAccess` resolves the spec's constituent
windows and, when there are none:

```java
if (constituentWindowIds.isEmpty()) {
  return true;                       // permissive fallback
}
```

That is fail-open: the absence of authorization data grants access instead of withholding it.
ETP-4596 chose it deliberately, to avoid regressing specs that had no data to check against,
and said so in its javadoc. The cost is that the shared gate protects nothing for those specs,
and any report added later inherits the same default without anyone noticing.

Measured on the local instance:

| `spec_type` | anchor | count | specs |
|---|---|---|---|
| `R` | constituent windows | 6 | `bank-*`, `cash-close`, `financial-*` |
| `R` | **none — passes through** | 3 | `aging-receivable`, `inventory-stock-report`, `tax-report` |
| `P` | — | 0 | none exist |

So the hole is enumerable today: three specs, and no process specs at all.

## 2. Why those three were not simply given an anchor

The obvious repair — populate `ETGO_SF_SPEC.ad_process_id` or `ETGO_SF_ENTITY.ad_tab_id` and
let the existing gate do its job — does not work, and the reason is structural rather than
accidental. Each report is gated in the UI by a **different kind of grant**:

| Spec | Menu entry | Gated on | Grant table |
|---|---|---|---|
| `tax-report` | Multidimensional Tax Report (action `R`) | classic `AD_Process` `8C1331B9…` | `ad_process_access` |
| `aging-receivable` | Receivables / Payables Aging Schedule | **OBUIAPP** process `0D37…` / `EB4C…` | `obuiapp_process_access` |
| `inventory-stock-report` | Inventory Stock Report | window `6346B886…` (no tabs) | `ad_window_access` |

Three grant kinds, and `ETGO_SF_SPEC.ad_process_id` is a foreign key to the classic
`AD_Process` only — an OBUIAPP process does not fit in it. `inventory-stock-report`'s window is
real and has three active access rows, but carries **no tabs**, so `AD_TAB_ID` cannot express it
either. And `aging-receivable` needs *two* anchors, chosen per request from the `recOrPay`
parameter, which no static column can express at all.

**Each of the three handlers already mirrors its menu entry exactly** — the same process ids,
the same window, including the receivable/payable split. They are not workarounds for missing
data; they are the correct translation of a rule that has three shapes.

## 3. Decision

**The gate denies a report spec by default. A spec qualifies for access in one of two ways:**

1. it declares a static anchor the gate can evaluate (a linked process, or constituent
   windows) — the path the six financial specs already take; or
2. its handler declares that it enforces access itself, which is the honest answer for a rule
   the gate cannot express.

Nothing about the three handlers changes. What changes is that the permissive fallback stops
being a silent default covering every future spec, and becomes a short, explicit, enumerable
list.

## 4. The guardrail

A test enumerates every callable report spec and asserts each one satisfies (1) or (2). This is
the part that makes the fix hold: without it, the next report is added, its 403 is noticed, and
somebody "fixes" it by hand-writing a fourth ad-hoc check — which is exactly how this shape
survived. With it, a report that declares neither fails the build.

## 5. Sequence

1. Add the handler-enforced declaration and wire the gate to it, keeping today's behaviour for
   the three known specs.
2. Flip `hasAccessToConstituentWindows`' empty case from `true` to `false`.
3. Add the guardrail test.
4. Re-verify the six financial specs still resolve through their constituent windows.

Step 2 cannot come first: on its own it takes all three reports down.

## 6. Out of scope, and a correction worth recording

**Button actions are NOT affected, and are already correct.** An earlier reading of this code
concluded that `neo_action` performed no process-access check. That was wrong: it inspected
`handleAction` and an unrelated `executeAction` in the legacy invoice handlers. The real
execution path, `NeoButtonActionHelper.executeButtonActionCore`, checks
`hasObuiappProcessAccess` or `hasProcessAccess` before executing, resolves the shared `Posted`
fallback the same way at execution as at listing, and answers `400 No process linked to button`
for the ~8 button columns that have no process at all. Measured: 85 classic, 154 OBUIAPP, 31
column rows with no declared process of which the `Posted` convention covers most.

A related idea was also dropped: mapping `neo_action` to `POST` so the read/write window
tiering would apply. `AD_Window_Access` and `AD_Process_Access` are independent grants, and
read-only window access combined with an explicit process grant is a legitimate configuration —
somebody who may not edit an order but may run Complete. Gating the action on window write
access would deny exactly that case. The process grant is the right question, and it is already
asked.

## 7. Before implementing

Confirming a denial needs a role with no grants; that could not be exercised from the session
this was written in, which authenticates with full access. What can be checked after a deploy
is the absence of a regression — that a properly granted role still receives each of the three
reports, and that the six financial specs are unaffected.

## 8. Live verification of the `tax-report` fix (2026-09-16)

The `TaxReportHandler` check was verified end to end by connecting the MCP twice: once with a
fully granted role, once with the `Sales` role.

| Report | `Sales` grant | Result under `Sales` |
|---|---|---|
| `aging-receivable` | `obuiapp_process_access` on `0D37…` — **yes** | `200`, real data |
| `tax-report` | `ad_process_access` on `8C1331B9…` — **no** | **`403`** |
| `inventory-stock-report` | `ad_window_access` on `6346B886…` — **no** | **`403`** |

Behaviour matches the grants exactly, so the mechanism discriminates rather than blanket-denying.
The same `generate_tax_report` call that returned VAT bases, tax amounts and every contact's tax
id under the granted role is refused under `Sales`. No regression: the granted role still gets
the full report, and `inventory-stock-report` still blocks as it did before.

The aging report returning `200` is **correct** — `Sales` holds that grant. The original review's
note that aging blocked was presumably taken under a different role, or against the payables
variant, which is a different OBUIAPP process (`EB4C…`).

### Evidence for the fail-open, from the same run

`neo_discover` under `Sales` lists all three reports with `callable: true`, including the two
that answer `403`. The catalogue is built through the same permissive `R`-spec path, so it
advertises reports the role cannot run — and, for a spec whose very existence is sensitive,
names it. This is the defect this document proposes to close, observed from the discovery side
rather than the execution side.
