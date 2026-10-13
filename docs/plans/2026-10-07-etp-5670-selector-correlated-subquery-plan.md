# ETP-5670 — Correlated de-dup subquery in view-backed selectors

**Status:** DRAFT — iterating
**Jira:** ETP-5670 (Error, Crítico) · Epic ETP-3504 · Related: ETP-5312 (QA cases 3–4 are this
bug; its case 5 — picker shows a failed request as "Sin resultados" — stays in ETP-5312)
**Repo touched:** `com.etendoerp.go` only
**Date:** 2026-10-07

## 1. Problem

The sales order line product selector (`GET /sws/neo/sales-order/lines/selectors/M_Product_ID`)
emits a count + data query whose de-duplication subquery is **correlated with the outer row**.
PostgreSQL re-runs it once per candidate row (`SubPlan 1`), so cost is quadratic in the price
list size. On 2026-10-07 it held the shared production RDS at 100% CPU for ~30 min.

## 2. Root cause (verified by reading code + local DB metadata)

Two individually reasonable decisions combine:

1. **The search fragment is left unqualified.**
   `SelectorOrgFilter.resolveSearchableExpression()` (`SelectorOrgFilter.java:174`):
   ```java
   return fragment.contains(".") ? fragment : alias + "." + fragment;
   ```
   The "contains a dot ⇒ already alias-qualified" rule was meant for custom selectors, whose
   `clause_left_part` stores HQL with its own alias (`bp.name`). But a standard selector field's
   `property` is a **DAL path relative to the entity** (`product.name`, `product.searchKey`), which
   also contains a dot. It is emitted as bare `product.name`, with no `e.` prefix.
   In a single-root query Hibernate resolves it against `e` implicitly — it works by luck.

2. **The de-dup subquery only rewrites `e.`.**
   `SelectorQueryExecutor.buildRepresentativeRowWhere()` copies the outer where clause into
   `e.id in (select min(e_dv.id) from <Entity> e_dv where … group by e_dv.<valueProperty>)` and
   renames the alias with `rewriteAlias()`, a regex that only matches `e.`. The bare `product.name`
   survives untouched; inside the subquery there are now two roots and Hibernate binds it to the
   **outer** one (`product6_`). → correlated subquery.

Side effect besides performance: the subquery never filters its own rows by the search term.

Where the fragment comes from (`SelectorDescriptorResolver`):
- `resolveSearchableFragment(property, clauseLeftPart)` — `property` wins when present (always a
  relative DAL path); `clause_left_part` is used only when `property` is blank (custom HQL, carries
  its own alias).
- `ensureSearchableFallback` / `addReferencedIdentifierPaths` — synthesises relative paths such as
  `organization.name` from identifier FKs. Also relative, also unqualified.

## 3. Blast radius

De-dup (and therefore the subquery) runs only when `shouldDistinctByValue(meta)` is true:
Value Field ≠ `id` AND not a stock-breakdown selector (`_QTY` / `_LOC` aux). Local DB scan of
active OBUISEL selectors with a non-PK Value Field:

| Selector (id) | Table | Search fragments | De-dup? | Impact |
|---|---|---|---|---|
| Product `D47A3616…` | `M_Product_Price_Warehouse_v` | `product.id`, `product.name`, `product.searchKey` | yes | **Affected — prod incident** |
| Product `37CC93AC…` | `M_Product_Price_Warehouse_v` | `product._identifier`, `product.name`, `product.searchKey` | yes | **Affected** (where clause also calls `AD_ORG_ISINNATURALTREE` per row) |
| Product `2E64F551…` | `M_Product_Price_Warehouse_v` | same as above | yes | **Affected** (same) |
| Product Complete ×2 | `M_Product_Stock_V` | `product.name`, `product.searchKey` | no — has `_QTY`/`_LOC` | Not affected (no subquery) |
| ETRX_OrgsByRole | `AD_Role_OrgAccess` | fallback → probably `organization.name` | yes | Same logic bug, negligible cost (tiny table) — to confirm |
| ETRX_RolesByUser | `AD_User_Roles` | fallback → probably `role.name` | yes | Same logic bug, negligible cost — to confirm |

Other code paths checked:
- `executeCustomHqlQuery` — no de-dup subquery; custom fragments carry their own alias. Not affected.
- `NeoSelectorService.remapFilterAlias` — renames `e.` in a filter, but does not build a subquery.
  Not affected by this bug (same lexical limitation, noted only).
- Translations (`enrichTranslations`) are post-processing, not part of the query. Not affected.

**Conclusion:** one bug, in shared code; fixing it fixes all three Product-by-price selectors (and
the two ETRX ones). There is no second query with an independent copy of the error.

## 4. Proposed fix

### Step 1 — Qualify relative DAL paths (root fix)
Make the search expression always alias-qualified when it comes from a DAL `property` (or the
fallback), and keep the "use as-is" behaviour only for `clause_left_part` fragments of custom
selectors.

Options (to decide — see §7 Q1):
- **A. Carry the origin.** `searchableProperties` holds a small value object
  (`fragment`, `isAliasQualified`) instead of a `String`; `resolveSearchableExpression` prefixes
  `alias.` unless `isAliasQualified`. Explicit, no guessing. Touches `SelectorMeta`, the resolver and
  the two call sites.
- **B. Decide by query mode.** In the rich (non-custom) path, always prefix `alias.` unless the
  fragment already starts with `alias + "."`; in the custom-HQL path keep today's rule. Smaller diff,
  but still a heuristic (a non-custom selector with blank `property` and an aliased
  `clause_left_part` would be double-prefixed — none exists today: the only non-custom
  `clause_left_part` in the local DB is `On Hand Locator` → `l.searchKey`, and its `property`
  `searchKey` wins).

**Decision (2026-10-07): A, scoped to the rich (non-custom) path only.**
- Rich path: fragments from `property` or the fallback are relative DAL paths → always prefixed
  with `e.`; a fragment from `clause_left_part` (only reachable when `property` is blank) is kept
  as-is.
- Custom-HQL path (`executeCustomHqlQuery` / `buildCustomHqlFromClause`): **no behaviour change.**
  Today's "contains a dot ⇒ use as-is" rule stays there.

### Step 2 — Tests (red first)
In `src-test/.../SelectorQueryExecutorTest.java` (extend, reuse-first — `make find-tests` first):
- Repro: with a search term and a non-PK Value Field, the generated subquery contains **no**
  reference that resolves to the outer alias (every property ref inside the subquery is `e_dv.`).
- `resolveSearchableExpression` / resolver: relative DAL path → `e.product.name`; custom
  `clause_left_part` `bp.name` → unchanged.
- Regression: PK-valued selectors and stock-breakdown selectors produce a byte-identical where
  clause to today.

### Step 3 — Runtime validation

**Before/after SQL diff over every active rich selector (the safety proof).**
A throw-away harness (OBBaseTest or a debug endpoint, not committed unless it proves useful as a
regression test) that, for each active OBUISEL selector with `custom_query = 'N'` in the local DB,
builds the count + data HQL with a fixed search term (`q=a`) twice — old resolver vs new resolver —
translates both to SQL with Hibernate, and classifies:

| Selector group | Expected SQL | Expected result set |
|---|---|---|
| No de-dup (Value Field = `id`, or stock-breakdown) | byte-identical | identical |
| De-dup (Product ×3, ETRX ×2) | different: no outer alias inside the subquery | identical rows, identical count |

Any selector outside its expected row blocks the change. Output attached to the PR.

- Local: build a price list with ~1,000 products × 2+ warehouses, hit the endpoint with `q=p`, `q=`,
  capture the SQL and `EXPLAIN ANALYZE`: no correlated `SubPlan`, response in < 1 s (target TBD).
- Check the count and the returned items are unchanged vs. today for the same search (one item per
  product, correct totals).
- Non-regression on the other affected selectors (§6): for Business Partner, M_InOutLine, AD_Tab and
  Product Complete, capture the SQL before/after with a search term and confirm it is identical.

## 5. Out of scope (separate tickets)

- **Statement timeout on selector queries** — deferred by decision (2026-10-07), not now. Would
  bound any future slow selector (it must reach the JDBC statement so PostgreSQL really cancels it,
  and map to a translated error instead of a 500).

- **Cheaper de-dup** (`count(distinct e.product.id)`, `DISTINCT ON` / window function, or skipping
  de-dup when price list + warehouse already guarantee one row per product). Optimisation, not the
  bug.
- **Frontend debounce + abort of in-flight selector requests** — not needed for this ticket.
  Debounce already exists in all three selector styles (`tools/app-shell/src/components/contract-ui/`):

  | Component | Used for | Debounce | Aborts previous request |
  |---|---|---|---|
  | `InlineSearchCombo.jsx` | Inline line entry in the grid | 1000 ms on typing (ETP-5005) | no |
  | `CreatableSearchSelect.jsx` | Header search fields | 300 ms | no |
  | `productSelectorDrawerShared.jsx` | Product picker drawer ("Añadir línea") — **the incident path**, per ETP-5312 QA | 300 ms | yes (`AbortController`) |

  The incident came from the product picker drawer, which already debounces and aborts (ETP-5312
  QA: "Añadir línea → picker de Producto", message "Sin resultados para «p»"). It still piled up
  queries, because an `abort()` only drops the
  HTTP response in the browser: the servlet and its PostgreSQL statement keep running. So a
  frontend abort would not have protected the DB; only a server-side bound would. Adding
  `AbortController` to `InlineSearchCombo` / `CreatableSearchSelect` is a nice-to-have for
  consistency, not part of this fix.

## 6. Risks

- **Other selectors whose search text changes.** Qualifying applies to every rich selector, not
  only de-dup ones. Local DB scan of active non-custom selectors with a dotted searchable
  `property` (all 18 are plain DAL paths; none starts with `e.`, none is an expression):

  | Selector | Table | Dotted search property |
  |---|---|---|
  | Simple AD_Tab Selector | `AD_Tab` | `window.name` |
  | Business Partner / C_BPartner Customers no combo / Vendors no combo | `C_BPartner` | `businessPartnerCategory.name` |
  | M_InOutLine no combo / M_InOutLine Receipts | `M_InOutLine` | `shipmentReceipt.documentNo` |
  | Product ×3 | `M_Product_Price_Warehouse_v` | `product.id/name/searchKey` |
  | Product Complete ×2 | `M_Product_Stock_V` | `product.name/searchKey` |

  Plus any selector whose fallback synthesises `fk.name` paths (`addReferencedIdentifierPaths`).
  In all of them the query is single-root, where Hibernate already resolves bare `product.name` as
  `e.product.name`: **the generated SQL should be identical**. Only the de-dup selectors change
  their plan (that is the fix). To be proven, not assumed — see Step 3.
- **Custom-HQL selectors stay unchanged.** In the local DB no active custom selector has a
  searchable field with a non-blank `property`; they all use `clause_left_part` with their own
  alias. Active custom selectors (local DB): Business Partner not filtered by default by
  customer/vendor (`bp`), Business Partner with contact and location ×2 (`bp`), On hand warehouse
  (`w`), Org_no_org_access (`org`), ProductSimple (`e`), Report Template (`t`, no search fields —
  fallback only). The prefix change is scoped to the rich path, so none of them is touched.
- **Existing tests encode the bug.** `SelectorQueryBuilderTest:62` asserts
  `resolveSearchableExpression("e", "contact.businessPartner.name")` stays bare. It must be
  rewritten to the new contract (not deleted). `SelectorQueryExecutorTest:872` only covers a bare
  `e.name` search — the dotted case was never tested, which is why this slipped.
- With no timeout, any other slow selector can still hold the shared DB for minutes. Accepted for
  now (see §5).

## 7. Open questions

1. ~~Option A or B for Step 1?~~ → A.
2. ~~Timeout value / scope?~~ → no timeout for now (out of scope).
3. ~~Hotfix to `main` or `develop`?~~ → normal `develop` flow (full test suite runs).
5. ~~Scope of the alias prefix?~~ → rich path only; custom-HQL path unchanged.
4. Confirm ETRX_OrgsByRole / ETRX_RolesByUser are reachable from NEO and actually get a dotted
   fallback fragment (impact is cosmetic, but the regression test should cover them).
