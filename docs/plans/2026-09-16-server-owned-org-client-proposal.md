# Proposal: `client` and `organization` are server-owned on write

Date: 2026-09-16
Status: **implemented and verified live 2026-09-16** (see §7)
Origin: security review by Santi Alaniz (raw report kept out of tree, untracked draft)
Scope: its own Jira. **Not** ETP-5335 — that task is about agent usability, and burying a
tenant-isolation fix inside it would hide it.

## 1. The defect

`neo_create` with `organization` / `client` pointing at **another** org returns `200 OK`.
The record is then invisible to the session that created it (`404` on re-read). A second
attempt on `contacts`/`businessPartner` failed with a sequence error **specific to the other
org**, which is what proves the write was routed there rather than merely hidden.

Reported, not reproduced here: the local MCP endpoint was unreachable during this analysis.
What follows is confirmed by reading the code, not by re-running the probe.

## 2. Why MCP lets it through, and REST does not

Both facts below were measured.

**There is no curated row for either column:**

```sql
SELECT ... FROM etgo_sf_field f JOIN ad_column c ...
WHERE upper(c.columnname) IN ('AD_ORG_ID','AD_CLIENT_ID');
-- 0 rows
```

**REST is a whitelist.** `NeoFieldFilter.filterCreateRequest` ends in
`filterBody(requestBody, includedFields)`, and `includedFields` is built only from
`ETGO_SF_FIELD` rows with `isIncluded = true`. No row means the key is stripped before the
body reaches the DAL.

**MCP is two deny-gates, not a whitelist.** `McpWriteRequestSupport.mapFieldsToDalProperties:176-203`:

```java
Property prop = dalEntity.getProperty(key, false);   // "organization" IS a real DAL property
if (prop != null) {
  if (gate.excluded.contains(mappedKey))           { throw fieldNotAllowed(...); }
  if (gate.readOnlyRejectable.contains(mappedKey)) { throw readOnlyField(...); }
}
mapped.put(mappedKey, value);                        // reached, and forwarded to jsonService.add
```

`organization` resolves to a real DAL property, so it is not "unknown" and IMP-18's reporting
path never sees it. Both gate sets are built exclusively from `ETGO_SF_FIELD` rows, and there
are none — so neither set contains it, nothing throws, and the caller's value travels to
`jsonService.add`.

**REST is safe by accident, not by design.** Its safety rests entirely on the absence of a
curated row. The day anyone curates `AD_Org_ID` as an included field, REST is exposed in
exactly the same way. This is why the fix must be explicit on both paths even though only one
bleeds today.

## 3. Decision

`client` and `organization` are **server-owned on write, readable on read.**

Etendo GO positions an account in one specific organization of the client, so the
multi-org case — where choosing a child organization is a legitimate business act — does not
apply here. The session values are the only correct ones, and no caller-supplied value is
honoured.

They stay in `neo_get` / `neo_list` / `neo_schema` responses. They are information the caller
legitimately needs; only the write side changes.

## 4. Design

**A server-owned property set**, covering `client` and `organization` under every spelling a
caller can reach them by: the DAL property name, the column name (`AD_Client_ID`,
`AD_Org_ID`), and any `java_qualifier` alias.

**One rule, no branches.** On create and on update, a caller-supplied value is **discarded**
and the session value injected. Never compared, never negotiated.

**Report only when it differed.** Echoing the session's own value is silent. Sending a
different one is reported, so the caller learns why the value vanished instead of finding out
from a `404`. This is the "report, don't refuse" pattern already established by IMP-18 and the
`supersededDefaults` reporter.

Refusing outright would also be safe, but it punishes a caller for echoing what a previous
response handed it — the failure shape IMP-45 exists to avoid.

**Update is in scope.** The report covers create only. An update that changes `organization`
moves an existing record between tenants; it is the same hole and it is untested.

**One shared helper, invoked from both write paths.** The MCP create path does not go through
`NeoCrudHandler` — it calls `jsonService.add` directly after
`NeoMandatoryDefaultsService.injectMandatoryDefaults`. A fix in `McpWriteRequestSupport` alone
leaves REST governed by nothing but the missing row; a fix in `NeoFieldFilter` alone leaves MCP
open. Implementing it twice by hand is how IMP-39 survived in two files after being closed.

## 5. Explicitly out of scope

- **`literalDefault` vs its javadoc** (`McpQuerySupport.java:289-292`) — a separate defect, from
  the same review day. It affects curated read-only columns whose AD default is an expression
  (`now()`), and it does **not** affect `organization`/`client`, which never reach that branch
  for want of a curated row.
- **`generate_tax_report` returning real fiscal data to a role with no window grants** — the
  other high-severity item of the same review. Different surface, different fix.

## 6. Before implementing

Reproduce the original probe against a running instance. Everything above is a code reading;
the endpoint was down during this analysis, and a fix whose premise was never re-observed is a
fix aimed at a guess.

## 7. Live verification (2026-09-16, local instance)

Probed against the deployed build. The foreign organization was a freshly generated id that
exists nowhere, so a failure of the fix would have raised an FK error rather than leaving an
orphan record in a tenant the session cannot see and therefore cannot clean up.

| Probe | Result |
|---|---|
| `neo_create` on `cost-center/costCenter` with `organization` = non-existent id | `200`, record created **in the session org**, `serverOwnedFields` reported `sent` vs `session` |
| `neo_get` on the new record | readable — it had not been routed to another tenant |
| `neo_update` with `organization` **and** `AD_Client_ID` set to the foreign id | both discarded and reported; the column spelling `AD_Client_ID` resolved to the `client` property, not to `organization` |
| `neo_update` echoing the session's own organization | silent, as designed — nothing was taken from the caller |
| `neo_delete`, then `neo_get` | `deleted: true`, then `404`. No probe record left behind. |

`neo_schema` with `view:"create"` does not list `organization` or `client` among the writable
fields, so a caller following the schema never sends them in the first place.
