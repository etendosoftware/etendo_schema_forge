# Proposal: report specs must not be fail-open

Date: 2026-09-16
Status: **partially implemented.** The handler declaration (step 1) is done and verified live.
The flip itself (step 2) is **not** done, and §5 below has been corrected — the flip as it was
first written takes all three reports down and breaks two unrelated specs in the SPA.
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

### What actually reaches the empty case

`hasAccessToConstituentWindows` is **shared**. Two callers reach it, not one:

- `hasReportSpecAccess` — for `R` specs;
- `hasWindowAccessForSpec` — for windowless `W` specs.

And both are reached from **both** front doors: the MCP (`McpToolRouterSupport`,
`ToolRegistry`) and the REST layer the SPA uses (`NeoRequestRouter:130` and `:189`), plus
`NeoDiscoveryHelper`, which builds the catalogue for both. **This is not MCP-only code.** Any
change here is visible in the SPA.

Measured on the local instance — every active spec with no window and no process:

| Spec | type | constituent tabs | reaches the empty case |
|---|---|---|---|
| `tax-report` | `R` | 0 | **yes** |
| `aging-receivable` | `R` | 0 | **yes** |
| `inventory-stock-report` | `R` | 0 | **yes** |
| `dashboard` | `W` | 0 | **yes** |
| `not-posted-documents` | `W` | 0 | **yes** |
| `bank-statements`, `bank-reconciliation`, `cash-close`, `financial-accounts-page`, `financial-account-transactions`, `financial-account-bank-connection` | `R` | 1 | no — gated on their window |
| any `P` spec | `P` | — | none exist |

So the hole is five specs, not three. The first version of this document counted only the `R`
side and missed `dashboard` and `not-posted-documents` entirely — which is precisely what made
step 2 below look like a one-line change.

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

This is not hypothetical. **During the 2026-09-16 review, `InventoryStockReportHandler`'s inline
window check was replaced by the call to the new method before its override existed.** It
inherited the `true` default and the report was readable by any role — stock quantities and
valuations for both warehouses — for a full deploy. It was caught only because `neo_discover`
was inspected for an unrelated reason.

That is the exact failure the guardrail catches, and the reason it must land before the empty
case changes rather than after.

## 5. Sequence — CORRECTED 2026-09-16

The original step 2 read: *"flip `hasAccessToConstituentWindows`' empty case from `true` to
`false`."* **That is wrong in both directions, and must not be executed as written.**

### Why the literal flip fails

**(a) It closes all three reports for every role, including fully granted ones.** The order
inside `hasReportSpecAccess` puts the handler declaration *behind* the check being flipped:

```java
if (!hasAccessToConstituentWindows(spec, httpMethod)) {
  return false;                        // with the flip, every report leaves here
}
return handlerDeclaredAccess(spec);    // never reached
```

The declaration built in step 1 — the whole point of the exercise — sits behind the door the
flip closes. The result is not a stricter default; it is three dead reports.

**(b) It closes `dashboard` and `not-posted-documents` in the SPA, for everyone.** Those are
`W` specs. They go through `hasWindowAccessForSpec`, which does **not** consult
`handlerDeclaredAccess` at all, so they have no way to declare anything. They would simply
stop resolving, for every role, in the main UI.

### Corrected sequence

1. **Done (commits `b5a54f72`, `dc11f2cf`).** `NeoHandler.isAccessibleForCurrentRole()` added;
   the three report handlers declare their rule; `hasReportSpecAccess` consults it; role
   refusals answer `403` instead of `500`. Catalogue and execution now agree.
2. **Add the guardrail test first, not last** (see §4). It is what makes the remaining steps
   safe, and it is cheap and behaviour-neutral, so it carries no deploy risk.
3. **Change the empty case in the report path only, and make it defer rather than decide.**
   The empty case must not be a fixed boolean. When there are no constituent windows to
   evaluate, the answer belongs to the handler declaration, not to a blanket default:

   ```java
   // in hasReportSpecAccess, replacing the short-circuit
   if (!constituentWindowsAllow(spec, httpMethod)) {
     return false;          // real windows exist and the role fails them
   }
   return handlerDeclaredAccess(spec);   // no windows to check -> the handler answers
   ```

   Leave `hasWindowAccessForSpec` untouched at this step, so `dashboard` and
   `not-posted-documents` keep working.
4. **Re-verify with two roles after deploy** — the granted role still receives all three
   reports and both `W` specs; the `Sales` role still gets `403` on `tax-report` and
   `inventory-stock-report` and data on `aging-receivable`. This is the ETP-4596 regression
   check, and it is the one that matters.
5. **Only then**, separately: give `dashboard` and `not-posted-documents` a way to declare, and
   close the `W` path too. Out of scope here; it needs its own measurement of who consumes them.

### The limitation this leaves, stated plainly

`handlerDeclaredAccess` returns `true` when a spec has no handler, and
`isAccessibleForCurrentRole()` defaults to `true` — a default that is required, because ~40
non-report handlers must not have to declare anything. So after step 3 a **new report handler
that declares nothing is still open at runtime.**

The guardrail is therefore not a nicety on top of the fix; it *is* the fix for that case. It is
the only thing standing between an omission and an open report, which is why step 2 moves ahead
of step 3.

Distinguishing "the handler explicitly allowed" from "the handler never answered" at runtime
would need a second signal — a separate `enforcesOwnAccess()`, or a reflective check that the
method is overridden. Both were considered and neither is proposed here: the first is two
methods to keep in sync, the second puts reflection on an authorization path. The build-time
guardrail achieves the same outcome earlier and more visibly.

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
