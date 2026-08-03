-- @id: R18-stuck-average-cost-anchor
-- @gap: H1
-- @risk: high
-- @type: sql
-- @description: Seed a manual M_Costing (AVA) anchor for products whose earliest
--   M_Transaction (ordered by TrxProcessDate, NOT MovementDate) is an outbound
--   movement with zero cost history, so the org-wide Average-Cost background
--   queue stops halting on them and can proceed past them — ETP-4736
--
-- Background (symptom)
-- --------------------------------------------------------------------------------------------
-- Goods Receipt posting fails with `The cost of the product @product@ has not been
-- calculated` (core AcctServer). Root cause on the reporter's environment: product
-- "Lapiceras" (GOOrg) has ZERO M_Costing rows ever, and its earliest M_Transaction BY
-- TrxProcessDate is an OUTBOUND Customer Shipment. Etendo's Average-Cost background
-- process (CostingBackground) queues ALL pending, cost-eligible transactions ACROSS
-- EVERY PRODUCT in one FIFO ordered by TrxProcessDate (never MovementDate) and — because
-- each transaction commits individually but a failure propagates out of the whole
-- doExecute() loop — halts EVERY later transaction in that queue the first time it hits
-- one it cannot cost. This is why an unrelated, previously-healthy product ("Agua") also
-- stalled at the exact same date: it was simply queued after the real blocker.
--
-- Core mechanism verified by reading source (this session, local Etendo core checkout)
-- --------------------------------------------------------------------------------------------
-- 1. `org.openbravo.costing.CostingBackground.getTransactionsBatch()` — the pending-work
--    query — is:
--      ORDER BY trx.transactionProcessDate, trxtype.sequenceNumber,
--               trx.movementQuantity desc, trx.id
--    i.e. `M_Transaction.TrxProcessDate` (column `TRXPROCESSDATE`), NEVER `MovementDate`.
--    CONFIRMS the reporter's TrxProcessDate-vs-MovementDate finding is exactly right.
-- 2. `doExecute()` processes one MaterialTransaction at a time via `CostingServer.process()`,
--    committing after each success (`OBDal...getConnection(true).commit()`), but a thrown
--    `OBException` is only caught by the OUTER try/catch, which does `rollbackAndClose()`
--    and RETURNS — it does not skip the bad transaction and continue with the rest of the
--    queue. So one uncostable transaction anywhere in the global FIFO blocks every
--    transaction queued after it (any product), confirming the reporter's live "Agua also
--    stalled" observation.
-- 3. `org.openbravo.costing.AverageAlgorithm.getOutgoingTransactionCost()` is the exact
--    throw site for an outbound movement:
--      final Costing currentCosting = getProductCost();  // M_Costing lookup, see below
--      if (currentCosting == null) {
--        throw new OBException("@NoAvgCostDefined@ ... @Date@: " +
--            transaction.getTransactionProcessDate());
--      }
--    `getProductCost()` queries M_Costing for:
--      product = X AND startingDate <= TrxProcessDate AND endingDate > TrxProcessDate
--      AND costType = 'AVA' AND cost IS NOT NULL
--      AND organization = <cost org>  (AND warehouse = <trx warehouse>, only IF the
--        applicable M_Costing_Rule has WAREHOUSE_DIMENSION = 'Y'; else `warehouse IS NULL`)
--    Zero M_Costing rows for the product => currentCosting is always null => always throws.
--    This is the built-in, first-class Etendo mechanism for seeding an opening/manual
--    average cost (the M_Costing window's "Manual" checkbox is exactly this) — NOT
--    something invented for this fix.
-- 4. Empirically CONFIRMED (this session, this fix's REAL PLAN validated via
--    `EXPLAIN` against a local dev DB — see delivery note at the bottom) that inserting
--    ONLY an M_Costing row is sufficient: no M_Transaction column needs touching. The
--    blocking transaction stays isProcessed='N' until CostingBackground's own NEXT run
--    naturally reprocesses it — this time `getProductCost()` finds the seeded anchor,
--    `getOutgoingTransactionCost()` succeeds (a Shipment/Customer-Shipment/etc. does NOT
--    fall in `AverageAlgorithm.modifiesAverage()`'s list, so it only CONSUMES the anchor's
--    cost, never rewrites it), the transaction resolves, and the queue moves on to
--    whatever comes next (e.g. "Agua"). Patching M_Transaction directly (unitcost/
--    iscostcalculated/costing_status) was REJECTED: M_Transaction has no unit-cost column
--    at all (cost lives on the separate `TransactionCost`/`M_Transaction_Cost` entity, a
--    join table CostingServer itself populates with the accounting-relevant fields) —
--    faking "already costed" via raw SQL would require reverse-engineering and duplicating
--    CostingServer's full posting side effects. Seeding M_Costing lets the REAL engine do
--    the real computation; this fix only ever supplies the missing input, never the
--    business logic.
-- 5. Core's OWN "backdated transactions" mechanism — `FixBackdatedTransactionsProcess`
--    (`M_Costing_Rule` "Fix backdated transactions" action) — was checked and does NOT
--    apply here. Its query is:
--      trx.isCostCalculated = true AND trx.transactionProcessDate >= :startDate
--    i.e. it only rewrites transactions that ALREADY have a calculated cost (to correct
--    for a later-inserted, earlier-MovementDate transaction slipping in among costed
--    ones) — it structurally cannot rescue a queue where NOTHING has ever been costed
--    yet (isCostCalculated is false for every relevant row here). Also confirmed: it's a
--    manual, user-triggered action tied to `M_Costing_Rule.isBackdatedTransactionsFixed`,
--    not an automatic recalculation — a second, independent reason it never "just
--    happens" here. This directly answers the reporter's question #2: the mechanism
--    exists, but for a different failure mode (backdating among ALREADY-costed
--    transactions), not "zero cost history ever."
--
-- Cost-org resolution (legal entity, not the transaction's own org)
-- --------------------------------------------------------------------------------------------
-- `CostingServer` resolves `costOrg` via
-- `OrganizationStructureProvider.getLegalEntity(transaction.getOrganization())`, which walks
-- the org tree for the nearest ancestor with `AD_OrgType.IsLegalEntity='Y'`. For a *ready*
-- org this is exactly the denormalized `AD_Org.AD_LEGALENTITY_ORG_ID` column (per
-- `AD_GET_ORG_LE_BU`'s own header comment: "recommended to directly query
-- AD_Org.AD_LEGALENTITY_ORG_ID"). This fix uses that column, falling back to the
-- transaction's own org if it is NULL (defensive: a tenant hit by the D1 legal-entity gap
-- would otherwise resolve to no anchor at all rather than a best-effort one). Verified live
-- on this DB: every operative org checked is self-referencing (its own legal entity), which
-- matches the reporter's single-legal-entity-org tenant shape (GOOrg).
--
-- Warehouse dimension
-- --------------------------------------------------------------------------------------------
-- `getProductCost()` additionally filters `warehouse = <trx warehouse>` ONLY when the
-- applicable, validated `M_Costing_Rule.WAREHOUSE_DIMENSION = 'Y'` (else `warehouse IS
-- NULL`); the applicable rule for the cost org is resolved via `AD_ISORGINCLUDED(cost_org,
-- rule.AD_Org_ID, client)`, mirroring `CostingBackground`'s own org-inclusion check.
-- Verified live: every M_Costing_Rule on this DB has WAREHOUSE_DIMENSION='N', so the seeded
-- anchor's M_Warehouse_ID is NULL for every tenant checked; the CASE below still resolves
-- it dynamically per tenant instead of hardcoding NULL.
--
-- Fallback cost chain (per instructions; no better "Standard Cost" tier found)
-- --------------------------------------------------------------------------------------------
-- 1. Active PURCHASE Price List (M_PriceList.IsSOPriceList='N') price (PriceStd) from the
--    version valid at-or-before the blocking transaction's MovementDate.
-- 2. Else the active SALES Price List (IsSOPriceList='Y') price, same date rule.
-- 3. Else `1` (product-owner-approved, 2026-08-03: EVERY blocking product must now get a
--    seeded cost — no more "leave unfixed" bucket). This is a deliberate placeholder, not a
--    real cost: the product's M_Product.Description is tagged " COST MANUALLY SEEDED FROM
--    NOTHING" (see "Which tier was used" below) so finance can find and replace it with a
--    real value later. `1` (not `0`) was chosen deliberately, same day: a literal zero cost
--    reads as "free" in reports/UI and can mask a genuinely missing cost instead of flagging
--    one, and some downstream logic may special-case a zero cost oddly — `1` is a safer
--    non-zero placeholder that still can't be mistaken for a real, deliberately-priced value.
--    Checked whether a distinct "Standard Cost" concept exists that could rank between tiers
--    1 and 2 (per the task's suggestion of `m_costtype`/`m_productcost`) — no such
--    table/column exists in this schema; the only candidate is `M_ProductPrice.Cost` (a
--    landed/reference cost tied to a price-list version, not an independently maintained
--    "standard cost"), so the 2-tier price chain (falling to `1`) is kept as-is.
-- 4. When multiple active price lists of the same purchase/sales orientation exist for a
--    tenant, the default one wins (`IsDefault DESC`), then the most recent applicable
--    version, then the oldest list (`created ASC`) — a deterministic, documented tie-break.
-- 5. Currency for the seeded M_Costing row follows the same tier the cost came from
--    (purchase list's own C_Currency_ID, else the sales list's). For tier 3 (cost=1, no
--    price list resolved at all) there is no price-list currency to borrow, so it falls back
--    to `'100'` — this mirrors `M_Costing.C_Currency_ID`'s own column DEFAULT (confirmed via
--    `\d m_costing` on the local dev DB) and is System-owned (`c_currency.ad_client_id='0'`)
--    shared reference data present in every Etendo install, exactly like this fix's existing
--    hardcoded `ad_reference_id='189'` — NOT a client-owned/guessable business-object ID.
--    A tenant-specific "default currency" lookup (`AD_ClientInfo.C_AcctSchema1_ID` →
--    `C_AcctSchema.C_Currency_ID`) was considered and REJECTED: verified live that the
--    exact tenant this fix targets most ("QA Testing") has `C_AcctSchema1_ID IS NULL` (its
--    own separate gap — not in scope here) despite having 2 valid `C_AcctSchema` rows with
--    no `IsDefault`-style column to disambiguate, so that path is not reliably resolvable
--    for every tenant and would make tier-3 fail exactly where it's needed most.
--
-- Which tier was used — audit trail
-- --------------------------------------------------------------------------------------------
-- M_Costing has no free-text/description column, and the runner's ledger `detail` column is
-- ALWAYS NULL on an APPLIED row (only FAILED/MANUALLY_FIXED carry free text — confirmed by
-- reading `cli/src/data-fixes/run.js`'s `applyFix()`), so per-product tier detail cannot live
-- in the ledger. Every seeded row still carries `ISMANUAL='Y'` (distinguishing it from a real
-- engine-computed 'AVA' row) and a real `M_Transaction_ID` FK back to the exact blocking
-- transaction it unblocks — a stable, re-queryable join key.
--
-- 2026-08-03 UPDATE (behavior change): per-product tier detail now ALSO lives on
-- `M_Product.Description` — every product this fix seeds gets its description APPENDED
-- (never overwritten; NULL/empty description handled without a leading space) with exactly
-- one of ` COST MANUALLY SEEDED FROM PURCHASE` / ` COST MANUALLY SEEDED FROM SALES` /
-- ` COST MANUALLY SEEDED FROM NOTHING`, matching the tier that produced its `unit_cost`.
-- This is the human-readable, grid-visible counterpart to the FK-based audit trail above.
--
-- Coupling & idempotency of the description tag (verified, not assumed): the tag write and
-- the `M_Costing` INSERT are both driven off the exact same `final2` CTE and combined into a
-- SINGLE atomic SQL statement — the INSERT is itself a data-modifying CTE (`seeded AS
-- (INSERT ... RETURNING m_product_id)`) and the top-level UPDATE only touches products that
-- appear in `seeded`'s RETURNING set. Because both reads happen against the SAME pre-statement
-- snapshot (standard Postgres semantics for a WITH clause containing a data-modifying CTE),
-- there is no statement-order hazard: a naive two-separate-statements version (INSERT then a
-- separately-guarded UPDATE re-checking `NOT EXISTS m_costing`) would have failed to tag
-- anything, since by the time the UPDATE ran the INSERT's own rows would already be visible
-- in the same transaction, making that guard evaluate false for every just-seeded product.
-- Using `seeded`'s RETURNING set instead of re-deriving the guard sidesteps that trap
-- entirely. On a re-run, `blocking_products`' own `NOT EXISTS (m_costing)` filter already
-- excludes any previously-fixed product before it ever reaches `final2`, so `seeded` returns
-- 0 rows for it and the UPDATE cannot re-append the tag — re-verified live (see DELIVERY
-- NOTE below).
--
-- Known limitation (flagged, not solved here): `M_Product.Description` is `VARCHAR(255)`;
-- this fix does not truncate. A product whose existing description is already near the
-- 255-char limit could overflow and raise a Postgres error, which — since the tag UPDATE is
-- part of the same atomic statement as the INSERT — would abort BOTH for every product in
-- that batch, failing the whole tenant's run (`FAILED`, chain halts, retried next run). Not
-- observed on any tenant checked locally (all descriptions on the blocking-product set were
-- NULL); worth a follow-up if it ever bites in practice.
--
-- MANUAL-REVIEW REPORT (read-only — NOT executed by this fix; run by hand per tenant)
-- --------------------------------------------------------------------------------------------
-- 2026-08-03: there is no more "still stuck" bucket — @apply now ALWAYS seeds a cost (tier 3
-- falls to 1 instead of leaving the product untouched), so nothing is left unfixed. The two
-- reports below both read the M_Product.Description tag (no join-back-through-price-lists
-- guessing needed anymore):
--
-- -- Products this fix (R18) has anchored so far, and from which tier:
-- SELECT p.name AS product, c.ad_org_id AS cost_org_id, c.cost AS seeded_unit_cost,
--        c.c_currency_id, t.movementdate AS blocking_trx_movementdate,
--        CASE
--          WHEN p.description LIKE '%COST MANUALLY SEEDED FROM PURCHASE%' THEN 'purchase-price-list'
--          WHEN p.description LIKE '%COST MANUALLY SEEDED FROM SALES%'    THEN 'sales-price-list'
--          WHEN p.description LIKE '%COST MANUALLY SEEDED FROM NOTHING%'  THEN 'placeholder-one'
--          ELSE 'unknown'
--        END AS cost_source
-- FROM m_costing c
-- JOIN m_product p ON p.m_product_id = c.m_product_id
-- JOIN m_transaction t ON t.m_transaction_id = c.m_transaction_id
-- WHERE c.ad_client_id = '<client_id>' AND c.ismanual = 'Y'
-- ORDER BY t.trxprocessdate;
--
-- -- Products seeded from NOTHING (tier 3 — a FAKE placeholder cost of 1; the M_Costing row
-- -- exists so the queue is unblocked, but finance should replace the cost with a real one
-- -- when a purchase/sales price eventually becomes available for the product):
-- SELECT p.name AS product, p.description, c.cost AS placeholder_cost,
--        t.movementdate AS blocking_trx_movementdate
-- FROM m_costing c
-- JOIN m_product p ON p.m_product_id = c.m_product_id
-- JOIN m_transaction t ON t.m_transaction_id = c.m_transaction_id
-- WHERE c.ad_client_id = '<client_id>' AND c.ismanual = 'Y'
--   AND p.description LIKE '%COST MANUALLY SEEDED FROM NOTHING%'
-- ORDER BY t.trxprocessdate;
--
-- Preventive front — deliberately NOT shipped in this PR (flagged for follow-up)
-- --------------------------------------------------------------------------------------------
-- Unlike A1-A5/B1/C1-C2/D1/E1/G1 (all "onboarding forgot to set X, once, at tenant birth"),
-- this gap is caused by a TRANSACTIONAL/workflow pattern — shipping a product before it is
-- ever received — that can recur for ANY product added at ANY point in a tenant's life, not
-- just at onboarding. There is nothing an onboarding step could seed (a brand-new tenant has
-- no products/transactions yet) that would prevent a future user from creating an outbound
-- movement before an inbound one. The natural preventive control is a real-time guard in the
-- Shipment/Internal Consumption flows (e.g. a callout/validation warning "this product has
-- no purchase history yet"), which is a UI/process feature, not an onboarding-gap fix — out
-- of scope here and recommended as a separate ticket. `ONBOARDING_PROVISIONED_THROUGH` is
-- intentionally NOT bumped (no preventive deliverable exists; this corrective fix is safe to
-- ship alone per the framework's "what ships alone" table).
--
-- DELIVERY NOTE — verification performed (2026-08-03, initial version)
-- --------------------------------------------------------------------------------------------
-- Verified read-only against this developer's own LOCAL dev DB (localhost:5416/etendogoclean
-- — NOT the shared "experimental" server, NOT any real tenant DB): the @check/@apply logic
-- below was validated via `EXPLAIN` (plans only, never executes/writes for a non-ANALYZE
-- EXPLAIN, including for INSERT) against real M_Transaction/M_Product/M_PriceList data, and
-- separately smoke-tested end-to-end via `node cli/src/data-fixes/run.js --dry-run` (which
-- only ever runs @check, never opens a write transaction) — confirming the fix correctly
-- identifies real stuck products on this local sandbox (160 negative-first products with
-- zero M_Costing history found on client "QA Testing", 2984 total blocking-candidate rows
-- before the movementqty<0 + resolvable-price filters). No @apply INSERT was ever executed,
-- on this DB or any other — this fix has NOT been applied anywhere.
-- NOTE: this note describes the FIRST version of this fix, whose @check/@apply required a
-- resolvable purchase/sales price (tier 1/2 only). Superseded by the behavior-change note
-- below — @check/@apply no longer have that restriction.
--
-- DELIVERY NOTE — REAL APPLY + end-to-end posting verification (2026-08-03, human-authorized)
-- --------------------------------------------------------------------------------------------
-- Unlike the two notes above (read-only / rolled-back), this is a REAL, COMMITTED run against
-- the developer's own local dev DB (localhost:5416/etendogoclean, GOClient
-- 802509E12436405C86BA1FD5B1DF508C) — authorized after the developer reproduced the bug for
-- real via the actual Etendo UI (product "CostoTest", CC11737F6AF6400BA04E417A3A4F58BB: Goods
-- Shipment first, qty -10, then Goods Receipt, qty +233 — exact R18 target shape).
-- 1. Pre-apply DB state confirmed the diagnosis: 0 M_Costing rows for CostoTest; earliest
--    M_Transaction by TrxProcessDate was the Shipment (6B6B2405C50F497EBE8B88A792826F80,
--    13:46:36), Receipt (73D8AEB01A4242D2847B69DB5EFA04E7) came later (13:48:00) despite
--    identical MovementDate.
-- 2. `node cli/src/data-fixes/run.js --dry-run --client 802509E12436405C86BA1FD5B1DF508C` ->
--    R18 WOULD_APPLY (@check matched 1 row); watermark showed all prior fixes (R1..R16)
--    already PROCESSED for this tenant, so R18 was the only fix past the watermark.
-- 3. `node cli/src/data-fixes/run.js --client 802509E12436405C86BA1FD5B1DF508C` (real,
--    non-dry-run) -> `APPLIED (1 rows)`. Ledger row confirmed: status=APPLIED,
--    rows_affected=1, detail=NULL (per the KB's own "detail is always NULL on APPLIED" note).
-- 4. Post-apply DB state: ONE new `M_Costing` row (ismanual='Y', cost=23, c_currency_id='102',
--    m_transaction_id=<the Shipment's own id>, datefrom=trxprocessdate of that transaction) —
--    tier resolved was PURCHASE. `M_Product.Description` for CostoTest became exactly
--    `'COST MANUALLY SEEDED FROM PURCHASE'` (was NULL before).
-- 5. End-to-end proof via the real NEO `post` action (ETP-4298 Bulk-Posting capability,
--    `DocumentPostingService`, `POST /sws/neo/{spec}/{entity}/{id}/action/post`, JWT obtained
--    via `POST /sws/neo/sws/login` — note the live webapp context is `etendogoclean`, matching
--    `gradle.properties`' `bbdd.sid`, NOT the `etendo` context the `scripts/neo-token-*.sh`
--    helpers default to):
--    - Goods Shipment (spec `goods-shipment`, the transaction R18 actually anchored) ->
--      `POST .../goods-shipment/goodsShipment/693353CD822D4617BB357D25C87FCF66/action/post`
--      -> `{"success":true,"message":"Document posted"}` (200). Verified in `fact_acct`: 2 real
--      lines (COGS debit 230.00 / account 99900000, Inventory credit 230.00 / account
--      35000000 — 10 units x the seeded cost 23), `m_inout.posted='Y'`, and the ORIGINAL
--      blocking `m_transaction.isprocessed` flipped 'N' -> 'Y'. The "No average cost found"
--      error is GONE for the transaction R18 was written to unblock.
--    - Side effect observed (not something this fix does — the core posting engine's own
--      behavior): posting the Shipment triggered `CostingServer` synchronously for BOTH of
--      CostoTest's transactions, not just the Shipment's. The seeded manual row's `dateto` was
--      narrowed to the Receipt's own TrxProcessDate, and a brand-new engine-computed
--      (`ismanual='N'`) `M_Costing` row appeared for the Receipt transaction itself
--      (`cumstock=223`, `cumcost=5129.00` = 233-10 units at cost 23), with
--      `m_transaction.isprocessed` = 'Y' for that transaction too. So a manual Post of ANY one
--      document in the stuck queue is enough to re-cost every pending transaction for that
--      product — the separate `CostingBackground` scheduled process is not actually required
--      to prove the fix in an environment where the "Post" action is reachable.
--    - Goods Receipt (spec `goods-receipt`, entity `goodsReceipt`) ->
--      `POST .../goods-receipt/goodsReceipt/81CFDC9A77F447F58B7D9844C02D92A2/action/post` ->
--      `422 {"success":false,"message":"Account could not be found."}`. Diagnosed: this is
--      NOT the average-cost gap (the transaction itself already shows `isprocessed='Y'` per
--      the side effect above) — it is `C_BP_Group_Acct.NotInvoicedReceipts_Acct` being NULL
--      for the receipt's business partner's group (`DBBD00C9E0B9442188FCDDA3F601DAEA`,
--      "Tercero España" / "Cliente"), a DIFFERENT, PRE-EXISTING gap. CONFIRMED this is
--      already diagnosed and already has its own sibling corrective fix, sitting unmerged on
--      a different branch: `.worktrees/ETP-4706/cli/src/data-fixes/sql/
--      20260729T120000Z__R17-bp-group-acct-notinvoiced-receipts.sql` (gap A2b, ETP-4706) —
--      same client, same BP group, same NULL column, same root cause (a pre-existing
--      `C_BP_Group_Acct` row created before this account's `C_AcctSchema_Default` was
--      populated). R17 is out of scope for this fix/branch (ETP-4736/R18/H1) and was
--      deliberately NOT applied here — flagged for the coordinator to sequence its own merge.
--    Net result: R18 fully closes H1 for this product (both of CostoTest's transactions are
--    costed, and the transaction it targeted posts a real document with real Fact_Acct
--    entries); the Goods Receipt's remaining posting failure is an unrelated, already-tracked
--    gap (A2b/R17/ETP-4706), not a new problem introduced or left behind by R18.
-- 6. Scope confirmed: only this developer's own local dev DB
--    (localhost:5416/etendogoclean) was touched — no remote "experimental" server, no other
--    tenant.
--
-- DELIVERY NOTE — BEHAVIOR CHANGE verification (2026-08-03, same day, human-approved)
-- --------------------------------------------------------------------------------------------
-- Product decision: @apply must now seed EVERY blocking product (fallback chain extended to
-- `0` for tier 3) and tag `M_Product.Description` with which tier fixed it. Re-verified
-- read-only + via a ROLLED-BACK transaction against the SAME local dev DB (nothing committed,
-- nothing persisted on any DB):
-- 1. `EXPLAIN` (no ANALYZE) on the new @check/@apply — both plan cleanly (single Insert-on-
--    m_costing CTE `seeded` feeding the top-level Update on m_product via its RETURNING set),
--    no syntax/type errors, no execution.
-- 2. `node cli/src/data-fixes/run.js --dry-run` against all 12 tenants on this DB — @check
--    correctly flips to "needed" (`WOULD_APPLY`) for "QA Testing" only (unchanged from the
--    first version — it already had a resolvable price for all 160 products) and stays
--    `SKIPPED_NOT_NEEDED` for all 11 others (no blocking products of any tier exist there).
-- 3. Real-data tier check on "QA Testing" (`4028E6C72959682B01295A070852010D`, 151
--    pre-existing M_Costing rows for OTHER already-costed products): of the 160 blocking
--    products, all 160 naturally resolve via tier 1 (purchase price) — this DB has no
--    naturally-occurring tier-2 (sales-only) or tier-3 (no price at all) blocking product.
--    To exercise tiers 2 and 3 for real, opened a single `BEGIN ... ROLLBACK` transaction and:
--      - set a pre-existing description ("Legacy desc.") on product `015453DA...BA58F`
--        (naturally tier 1) to test append-preserves-existing-text;
--      - deactivated product `06160EC3...07782`'s purchase-list (`Shirts`) price row only,
--        forcing it to tier 2 (its remaining sales lists: `Customer A`=45, `Customer B`=47);
--      - deactivated product `063DB3CF...F240CC`'s purchase AND sales price rows entirely,
--        forcing it to tier 3;
--    then ran the real, unmodified @apply SQL (160 products) inside that transaction.
--    ACTUAL results observed (pre-rollback): `015453DA...BA58F` → description became
--    `'Legacy desc. COST MANUALLY SEEDED FROM PURCHASE'` (existing text preserved, single
--    separating space, cost 31.5, currency 102 = the Shirts list's own currency);
--    `06160EC3...07782` → `'COST MANUALLY SEEDED FROM SALES'` (no prior text, no leading
--    space; cost 45, currency 102 — the `Customer A` sales list won the
--    isdefault/validfrom/created tie-break); `063DB3CF...F240CC` →
--    `'COST MANUALLY SEEDED FROM NOTHING'` (cost 0, currency `'100'` — the documented
--    System-owned fallback, confirmed used only because no price resolved). Total
--    `m_costing` rows for the tenant after this first apply: 151 + 160 = 311.
-- 4. Re-ran the EXACT SAME @apply a second time inside the same still-open transaction:
--    `UPDATE 0` (psql's own reported rowcount for the statement — for this fix, that count IS
--    the number of products tagged, since the top-level statement is the coupled UPDATE) —
--    0 new M_Costing rows (still 311 total, not 471), 0 further description changes for any
--    of the 3 already-fixed products or any of the other 157 — confirmed idempotent. This is
--    exactly BECAUSE `blocking_products`' own
--    `NOT EXISTS (m_costing)` filter excludes an already-fixed product before it ever reaches
--    `final2`/`seeded` again, so the coupled UPDATE has nothing left to key off for it.
-- 5. `ROLLBACK`, then a fresh, separate read-only query confirmed: `m_costing` count for the
--    tenant back to 151 (the 160 test-run inserts are gone), and all 3 test products'
--    `m_product.description` back to `NULL` (the "Legacy desc." mutation is gone too).
--    Nothing was ever committed to this or any other DB.
--
-- DELIVERY NOTE — TIER-3 FALLBACK VALUE CHANGE, 0 -> 1 (2026-08-03, later same day)
-- --------------------------------------------------------------------------------------------
-- Product decision: the tier-3 placeholder cost changes from `0` to `1` (product owner:
-- "I think there are issues with cost 0" — a literal zero reads as "free"/masks a genuinely
-- missing cost in reports, and some downstream logic may special-case a zero cost oddly).
-- Tier logic/order (purchase -> sales -> fallback) and the description tagging are UNCHANGED;
-- "NOTHING" still means "neither price list resolved," just with placeholder cost `1` now.
-- Re-verified against the SAME local dev DB (localhost:5416/etendogoclean, "QA Testing"
-- 4028E6C72959682B01295A070852010D) via a fresh `BEGIN ... ROLLBACK` transaction (nothing
-- committed, nothing persisted on any DB):
-- 1. Confirmed product `063DB3CF250E4980A63D83EF29F240CC` (the same product used to exercise
--    tier 3 in the prior delivery note) was back to its pre-test state: 0 `M_Costing` rows,
--    `M_Product.Description` NULL, all 3 `M_ProductPrice` rows `isactive='Y'` — i.e. the
--    earlier ROLLBACK left no residue, confirming this is a clean re-run, not building on
--    leftover state.
-- 2. Deactivated all 3 of that product's `M_ProductPrice` rows (forcing tier 3 again), then
--    ran the real, unmodified (post-change) @apply SQL for the tenant (160 products).
-- 3. ACTUAL result observed (pre-rollback): the seeded `M_Costing` row for
--    `063DB3CF250E4980A63D83EF29F240CC` has `cost=1`, `c_currency_id='100'`,
--    `ismanual='Y'`, `costtype='AVA'` — confirming the fallback value is now `1`, not `0`,
--    while the currency fallback (System-owned `'100'`) is unchanged. `M_Product.Description`
--    became exactly `'COST MANUALLY SEEDED FROM NOTHING'` — the tag text itself is unchanged
--    by this fix (only the numeric cost changed).
-- 4. `ROLLBACK`, then a fresh, separate connection confirmed: 0 `M_Costing` rows for the
--    product, `M_Product.Description` back to NULL, all 3 `M_ProductPrice` rows back to
--    `isactive='Y'`. Nothing was ever committed to this or any other DB.
-- Scope confirmed: only this developer's own local dev DB was touched — no remote
-- "experimental" server, no other tenant.

-- @check
-- Returns >=1 row when at least one product in this tenant is stuck (zero M_Costing
-- history ever + its earliest-by-TrxProcessDate cost-eligible transaction is outbound).
-- 2026-08-03: the "resolvable price" restriction is DROPPED — @apply now unconditionally
-- seeds a cost for every such product (falling back to 0 when no price exists), so @check
-- must agree that the fix is "needed" whenever ANY blocking product exists, regardless of
-- whether a price can be resolved. Keeping a resolvable-price-only @check while @apply fixes
-- everything would have made @check under-report and left tier-3-only tenants permanently
-- SKIPPED_NOT_NEEDED even though @apply had real work to do for them.
WITH blocking_products AS (
  SELECT DISTINCT ON (t.m_product_id)
    t.m_product_id,
    t.m_transaction_id,
    t.movementqty,
    t.movementdate
  FROM m_transaction t
  JOIN m_product p
    ON p.m_product_id = t.m_product_id
   AND p.ad_client_id = t.ad_client_id
  WHERE t.ad_client_id = :client_id
    AND t.isactive = 'Y'
    AND t.isprocessed = 'N'
    AND p.producttype = 'I'
    AND p.isstocked = 'Y'
    AND EXISTS (
      SELECT 1 FROM ad_ref_list rl
      WHERE rl.ad_reference_id = '189'
        AND rl.value = t.movementtype
    )
    AND NOT EXISTS (
      SELECT 1 FROM m_costing c
      WHERE c.m_product_id = t.m_product_id
        AND c.ad_client_id = :client_id
    )
  ORDER BY t.m_product_id, t.trxprocessdate ASC, t.movementqty DESC, t.m_transaction_id ASC
)
SELECT 1
FROM blocking_products bp
WHERE bp.movementqty < 0
LIMIT 1;

-- @apply
-- Same blocking-product + fallback-price logic as @check, re-evaluated fresh at apply
-- time (two-layer idempotency), plus cost-org (legal entity) and warehouse-dimension
-- resolution, feeding a single guarded INSERT. NOT EXISTS on m_costing is the outer,
-- defensive guard (belt-and-suspenders on top of the CTE's own filter).
WITH blocking_products AS (
  SELECT DISTINCT ON (t.m_product_id)
    t.m_product_id,
    t.m_transaction_id,
    t.ad_org_id AS trx_org_id,
    t.m_locator_id,
    t.movementqty,
    t.movementdate,
    t.trxprocessdate,
    COALESCE(p.production, 'N') AS is_production
  FROM m_transaction t
  JOIN m_product p
    ON p.m_product_id = t.m_product_id
   AND p.ad_client_id = t.ad_client_id
  WHERE t.ad_client_id = :client_id
    AND t.isactive = 'Y'
    AND t.isprocessed = 'N'
    AND p.producttype = 'I'
    AND p.isstocked = 'Y'
    AND EXISTS (
      SELECT 1 FROM ad_ref_list rl
      WHERE rl.ad_reference_id = '189'
        AND rl.value = t.movementtype
    )
    AND NOT EXISTS (
      SELECT 1 FROM m_costing c
      WHERE c.m_product_id = t.m_product_id
        AND c.ad_client_id = :client_id
    )
  ORDER BY t.m_product_id, t.trxprocessdate ASC, t.movementqty DESC, t.m_transaction_id ASC
),
resolved AS (
  SELECT
    bp.*,
    o.ad_org_id AS org_self,
    o.ad_legalentity_org_id,
    w.m_warehouse_id AS trx_warehouse_id,
    (SELECT pp.pricestd
       FROM m_pricelist pl
       JOIN m_pricelist_version plv
         ON plv.m_pricelist_id = pl.m_pricelist_id
        AND plv.isactive = 'Y'
        AND plv.validfrom <= bp.movementdate
       JOIN m_productprice pp
         ON pp.m_pricelist_version_id = plv.m_pricelist_version_id
        AND pp.m_product_id = bp.m_product_id
        AND pp.isactive = 'Y'
      WHERE pl.ad_client_id = :client_id
        AND pl.issopricelist = 'N'
        AND pl.isactive = 'Y'
      ORDER BY pl.isdefault DESC, plv.validfrom DESC, pl.created ASC
      LIMIT 1) AS purchase_price,
    (SELECT pl.c_currency_id
       FROM m_pricelist pl
       JOIN m_pricelist_version plv
         ON plv.m_pricelist_id = pl.m_pricelist_id
        AND plv.isactive = 'Y'
        AND plv.validfrom <= bp.movementdate
       JOIN m_productprice pp
         ON pp.m_pricelist_version_id = plv.m_pricelist_version_id
        AND pp.m_product_id = bp.m_product_id
        AND pp.isactive = 'Y'
      WHERE pl.ad_client_id = :client_id
        AND pl.issopricelist = 'N'
        AND pl.isactive = 'Y'
      ORDER BY pl.isdefault DESC, plv.validfrom DESC, pl.created ASC
      LIMIT 1) AS purchase_currency,
    (SELECT pp.pricestd
       FROM m_pricelist pl
       JOIN m_pricelist_version plv
         ON plv.m_pricelist_id = pl.m_pricelist_id
        AND plv.isactive = 'Y'
        AND plv.validfrom <= bp.movementdate
       JOIN m_productprice pp
         ON pp.m_pricelist_version_id = plv.m_pricelist_version_id
        AND pp.m_product_id = bp.m_product_id
        AND pp.isactive = 'Y'
      WHERE pl.ad_client_id = :client_id
        AND pl.issopricelist = 'Y'
        AND pl.isactive = 'Y'
      ORDER BY pl.isdefault DESC, plv.validfrom DESC, pl.created ASC
      LIMIT 1) AS sales_price,
    (SELECT pl.c_currency_id
       FROM m_pricelist pl
       JOIN m_pricelist_version plv
         ON plv.m_pricelist_id = pl.m_pricelist_id
        AND plv.isactive = 'Y'
        AND plv.validfrom <= bp.movementdate
       JOIN m_productprice pp
         ON pp.m_pricelist_version_id = plv.m_pricelist_version_id
        AND pp.m_product_id = bp.m_product_id
        AND pp.isactive = 'Y'
      WHERE pl.ad_client_id = :client_id
        AND pl.issopricelist = 'Y'
        AND pl.isactive = 'Y'
      ORDER BY pl.isdefault DESC, plv.validfrom DESC, pl.created ASC
      LIMIT 1) AS sales_currency
  FROM blocking_products bp
  JOIN ad_org o ON o.ad_org_id = bp.trx_org_id
  LEFT JOIN m_locator loc ON loc.m_locator_id = bp.m_locator_id
  LEFT JOIN m_warehouse w ON w.m_warehouse_id = loc.m_warehouse_id
),
final AS (
  SELECT
    r.*,
    -- 2026-08-03: fallback chain extended to 1 -- every blocking product now gets SOME cost.
    -- A literal 0 was deliberately REJECTED as the placeholder (product-owner decision, same
    -- day): it reads as "free" in reports/UI and risks masking a genuinely missing cost rather
    -- than flagging one, and some downstream logic may special-case a zero cost oddly. `1` is
    -- a safer non-zero placeholder -- still obviously fake, still flagged via the same
    -- "COST MANUALLY SEEDED FROM NOTHING" description tag below, but it can't be misread as
    -- "no cost" or trip zero-cost special-casing elsewhere.
    COALESCE(r.purchase_price, r.sales_price, 1) AS unit_cost,
    CASE
      WHEN r.purchase_price IS NOT NULL THEN r.purchase_currency
      WHEN r.sales_price IS NOT NULL THEN r.sales_currency
      -- Tier 3 (no price list resolved at all): no price-list currency to borrow from.
      -- '100' mirrors M_Costing.C_Currency_ID's own column DEFAULT -- System-owned shared
      -- reference data (c_currency.ad_client_id='0'), present in every Etendo install; see
      -- the "Fallback cost chain" header section (item 5) for why a tenant-specific lookup
      -- was rejected.
      ELSE '100'
    END AS cost_currency_id,
    CASE
      WHEN r.purchase_price IS NOT NULL THEN 'purchase'
      WHEN r.sales_price IS NOT NULL THEN 'sales'
      ELSE 'nothing'
    END AS cost_source,
    CASE
      WHEN r.is_production = 'Y' THEN '0'
      WHEN r.ad_legalentity_org_id IS NOT NULL THEN r.ad_legalentity_org_id
      ELSE r.org_self
    END AS cost_org_id
  FROM resolved r
),
final2 AS (
  SELECT
    f.*,
    EXISTS (
      SELECT 1 FROM m_costing_rule cr
      WHERE cr.ad_client_id = :client_id
        AND cr.isactive = 'Y'
        AND cr.isvalidated = 'Y'
        AND cr.warehouse_dimension = 'Y'
        AND ad_isorgincluded(f.cost_org_id, cr.ad_org_id, :client_id) <> -1
    ) AS uses_warehouse_dimension
  FROM final f
  WHERE f.movementqty < 0
),
-- Data-modifying CTE: the INSERT's own RETURNING is the single source of truth for "which
-- products got a NEW M_Costing row THIS run" -- the coupled UPDATE below keys off THIS set,
-- never off a re-derived NOT EXISTS(m_costing) check (see header "Coupling & idempotency"
-- note for why that would double-guard incorrectly once the INSERT has already run within
-- the same transaction).
seeded AS (
  INSERT INTO m_costing (
    m_costing_id, ad_client_id, ad_org_id, m_product_id,
    datefrom, dateto, ismanual, qty, price, cumstock,
    costtype, ispermanent, cost, isproduction, isactive,
    m_warehouse_id, m_transaction_id, c_currency_id,
    created, createdby, updated, updatedby
  )
  SELECT
    get_uuid(), :client_id, f2.cost_org_id, f2.m_product_id,
    f2.trxprocessdate, TIMESTAMP '9999-12-31 00:00:00', 'Y', 0, f2.unit_cost, 0,
    'AVA', 'Y', f2.unit_cost, f2.is_production, 'Y',
    CASE WHEN f2.uses_warehouse_dimension THEN f2.trx_warehouse_id ELSE NULL END,
    f2.m_transaction_id, f2.cost_currency_id,
    now(), '0', now(), '0'
  FROM final2 f2
  WHERE NOT EXISTS (
    -- Outer, defensive guard (belt-and-suspenders on top of blocking_products' own filter).
    -- unit_cost IS NOT NULL is no longer needed here: COALESCE(...,1) means unit_cost is
    -- NEVER null anymore (2026-08-03 -- dropped the old "AND f2.unit_cost IS NOT NULL" guard
    -- that used to gate tier 3 out of the INSERT entirely).
    SELECT 1 FROM m_costing c2
    WHERE c2.m_product_id = f2.m_product_id
      AND c2.ad_client_id = :client_id
  )
  RETURNING m_product_id
)
-- Coupled 1:1 with the INSERT above via `seeded` -- appends the tier tag to the description
-- of every product that ACTUALLY got seeded this run, never more, never less, never twice.
UPDATE m_product mp
SET description =
  COALESCE(mp.description, '')
  || CASE WHEN COALESCE(mp.description, '') = '' THEN '' ELSE ' ' END
  || CASE f2.cost_source
       WHEN 'purchase' THEN 'COST MANUALLY SEEDED FROM PURCHASE'
       WHEN 'sales'    THEN 'COST MANUALLY SEEDED FROM SALES'
       ELSE                 'COST MANUALLY SEEDED FROM NOTHING'
     END
FROM final2 f2
WHERE mp.m_product_id = f2.m_product_id
  AND mp.ad_client_id = :client_id
  AND EXISTS (
    SELECT 1 FROM seeded s
    WHERE s.m_product_id = f2.m_product_id
  );
