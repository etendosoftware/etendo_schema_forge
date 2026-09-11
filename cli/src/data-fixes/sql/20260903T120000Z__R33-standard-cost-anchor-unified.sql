-- @id: R33-standard-cost-anchor-unified
-- @gap: J2
-- @risk: high
-- @type: sql
-- @description: Seed initial Standard M_Costing rows for ANY stock-moving document type needing a cost, sourced from M_Transaction directly -- ETP-5142, supersedes R28 (ETP-4706)
--
-- Background
-- --------------------------------------------------------------------------------------------
-- R28 (`@gap: J2`, ETP-4706) closed the "no Standard cost defined" gap ONLY for unposted Goods
-- Receipt / Goods Shipment lines (`m_inoutline`/`m_inout`). Tracing `CostingServer.process()`
-- (`src/org/openbravo/costing/CostingServer.java`) shows it calls
-- `costingAlgorithm.getTransactionCost()` unconditionally for EVERY `M_Transaction` row,
-- regardless of source document. Inside `StandardAlgorithm.getTransactionCost()`
-- (`src/org/openbravo/costing/StandardAlgorithm.java:36-47`), the `switch` on `TrxType`
-- special-cases ONLY `InventoryOpening` (and only when the Physical Inventory count line already
-- carries a non-null, non-zero `Cost` -- in which case it self-heals via its own `insertCost()`,
-- no exception, see the exclusion note below). EVERY OTHER `TrxType` --
-- `Shipment`/`ShipmentReturn`/`ShipmentNegative`/`Receipt`/`ReceiptReturn`/`ReceiptNegative`
-- (R28's original scope), `InventoryIncrease`/`InventoryDecrease`/`InventoryClosing` (regular
-- Physical Inventory), `IntMovementFrom`/`IntMovementTo` (Internal Movement),
-- `InternalCons`/`InternalConsNegative` (Internal Consumption), and
-- `ManufacturingConsumed`/`ManufacturingProduced`/`BOMPart`/`BOMProduct` (Production) -- falls to
-- `default:` -> `getOutgoingTransactionCost()` -> `CostingUtils.getStandardCost()`, which throws
-- `@NoStandardCostDefined@` when no Standard/legacy-Standard anchor covers the needed date. So the
-- SAME architectural gap as R28 applies to FIVE document families, not just Shipment/Receipt.
--
-- This fix is a SUPERSET of R28's scope (same target table `m_costing`, same guard shape, plus
-- four more document families) sourced directly from `M_Transaction` -- the one table every
-- stock-moving document eventually writes to -- instead of five separate per-doctype queries.
-- Per the data-fixes README's retirement rule ("superseded by a later fix covering the same
-- ground more completely"), R28 is RETIRED via `../retired.json` rather than edited (R28's own
-- `.sql` stays byte-for-byte untouched, immutable, checksum-verified in the retirement entry).
--
-- Live-DB evidence at authoring time (2026-09-03, local dev DB, all 5 Standard-cost tenants):
--   - Shipment/Receipt: 28 stuck (`iscostcalculated='N'`) M_Transaction rows -- same gap R28 covers.
--   - Physical Inventory: 8 stuck rows across 5 product/legal-entity pairs, 2 real tenants, all
--     `inventory_type='N'` (regular count, NOT the self-healing `'O'` Opening flow), line `Cost`
--     NULL. Confirmed the underlying document-header shape: `M_Inventory` has NO `DocStatus`/
--     `DocumentNo`/`C_DocType_ID` -- it tracks state purely via `Posted`/`Processed`/`Processing`,
--     and its accounting date is `MovementDate` (no separate `DateAcct` column exists on that
--     table, unlike `M_InOut`).
--   - Internal Consumption, Internal Movement, Manufacturing/Production: ZERO stuck
--     (`iscostcalculated='N'`) M_Transaction rows on ANY Standard-cost tenant today -- these three
--     branches are architecturally exposed to the identical failure but have NO live data to
--     validate against on this DB. Their SQL below was reasoned through against
--     `StandardAlgorithm`/`CostingServer` source and the live schema (columns verified via
--     `information_schema`), NOT empirically proven against real stuck rows the way the
--     Shipment/Receipt and Physical Inventory branches were. Treat those three branches as
--     reviewed-by-inspection, not empirically validated, until real data exercises them.
--
-- Exclusion: the self-healing InventoryOpening case
-- --------------------------------------------------------------------------------------------
-- `StandardAlgorithm.getTransactionCost()`: `case InventoryOpening: BigDecimal unitCost = ...;
-- if (unitCost != null && unitCost.signum() != 0) { return getOpeningInventoryCost(); }` --
-- `getOpeningInventoryCost()` ALWAYS inserts its own `M_Costing` STA row from the count line's own
-- `Cost` (via `insertCost()`), whether or not one already exists, so it never throws and never
-- needs this fix's anchor. Only when `M_Inventory.Inventory_Type='O'` AND the line's `Cost` IS
-- NULL/zero does execution fall through to the shared `default:` path and need a real anchor like
-- any other transaction. The `candidate_trx` CTE below excludes ONLY the true self-heal condition
-- (`inventory_type='O' AND cost IS NOT NULL AND cost <> 0`) -- a null/zero-cost Opening-type line
-- is NOT excluded, since core would still throw for it.
-- `InventoryClosing` (`Inventory_Type='C'`) is NOT excluded -- it is not special-cased in the
-- `switch`, so it always needs a real anchor same as any other type.
--
-- Date resolution -- why NOT just `MovementDate` (a correctness fix, not carried over from R28)
-- --------------------------------------------------------------------------------------------
-- `StandardAlgorithm.getOutgoingTransactionCost()`:
--   Date date;
--   if (costingRule.isBackdatedTransactionsFixed() || trxType == InventoryOpening
--       || trxType == InventoryClosing) { date = transaction.getMovementDate(); }
--   else { date = transaction.getTransactionProcessDate(); }
-- All 5 Standard-cost tenants on this DB have `M_Costing_Rule.BackdatedTrxsFixed='N'`, so for every
-- TrxType except InventoryOpening/InventoryClosing, core actually looks up the cost at
-- `M_Transaction.TrxProcessDate` (populated at transaction-creation time, always >= MovementDate by
-- a few seconds/empirically confirmed on live data), NOT `MovementDate`. R28 anchored `datefrom` at
-- `M_InOut.DateAcct` (== `MovementDate` on every sampled row) -- SAFE there only because
-- `datefrom <= date` still holds (MovementDate <= TrxProcessDate always), never because it matched
-- the real lookup date exactly. This fix reproduces the real formula so the anchor's `datefrom` is
-- correct rather than merely conservative: `CASE WHEN backdatedtrxsfixed='Y' THEN movementdate
-- WHEN inventory_type IN ('O','C') THEN movementdate ELSE COALESCE(trxprocessdate, movementdate)
-- END`, evaluated per the tenant's OWN costing rule and per the transaction's OWN inventory_type
-- (NULL/not-inventory rows fall through to the ELSE branch correctly, since `NULL IN (...)` is
-- neither true nor false in a CASE and is treated as false).
--
-- Scope note vs. R28 -- one edge case intentionally NOT carried forward
-- --------------------------------------------------------------------------------------------
-- R28's original query started from `m_inoutline` LEFT JOIN `m_transaction`, so it ALSO caught
-- lines where NO `M_Transaction` row exists at all (`t.m_transaction_id IS NULL` -- the exact
-- branch `DocInOut.java`'s own pre-check handles via `line.transaction == null`, a document
-- processed without ever creating a stock transaction). Sourcing from `M_Transaction` directly
-- means that edge case can no longer be represented -- a transaction is required to exist by
-- construction. Verified empirically (2026-09-03): zero `m_inoutline` rows on any Standard-cost
-- tenant hit that branch today, so this is a documented, currently-inert scope narrowing, not a
-- live regression. If it recurs, it is arguably a DIFFERENT gap (a transaction was never created
-- at all, not merely uncosted) warranting its own investigation rather than folding it back into
-- this anchor-seeding fix.
--
-- Scope note: `C_ProjectIssue` (Project Issue) transactions carry their own `M_Transaction` FK
-- (`c_projectissue_id`) but are deliberately OUT of scope here -- not part of the 5 document
-- families this ticket investigated, and `TrxType.getTrxType()` was not traced for that branch.
--
-- Review fixes (Alex, review cycle 1, 2026-09-03)
-- --------------------------------------------------------------------------------------------
-- 1. `isactive='Y'` restored on every joined header/line table (`iol`/`io`, `invl`/`inv`,
--    `movl`/`mov`, `icl`/`ic`, `prl`/`prp`/`prod`), matching R28's own defensive pattern (it
--    filtered `iol.isactive='Y' AND io.isactive='Y'`; this fix originally relied on
--    `t.isactive='Y'` alone). Checked empirically for a live counter-example on this DB (a voided/
--    reversed document leaving its header or line `isactive='N'` while the originating
--    `M_Transaction` row stays `isactive='Y'`) across all 5 families -- zero occurrences found,
--    and in fact zero `M_Transaction` rows of ANY kind are `isactive='N'` anywhere in this
--    database, so the scenario could not be proven to occur. Restored the filters anyway
--    (defense-in-depth, not proven impossible) rather than assert safety a single dataset cannot
--    establish.
-- 2. The `@check`/`@apply` gate now tests the ACTUAL computed `needed_date` (a new
--    `candidate_trx` CTE wrapping `candidate_trx_dated` with `WHERE needed_date <= now()`), not
--    the raw `t.movementdate`. `needed_date` is `trxprocessdate` for most `TrxType`s, and
--    `trxprocessdate >= movementdate` always -- so a transaction could have `movementdate <=
--    now()` (passing the old gate) while its real `needed_date` (`trxprocessdate`) is still in
--    the future, seeding an anchor with a future `datefrom` for a transaction that isn't actually
--    ready yet. Splitting into two CTEs (rather than repeating the `CASE` inline in the `WHERE`)
--    keeps the formula in exactly one place per section, consistent with the R22/N1 lesson
--    logged in `tenant-remediation-knowledge.md` about `@check`/`@apply` asymmetry.
--
-- Fallback cost chain, flags (identical to R28)
-- --------------------------------------------------------------------------------------------
-- 1. Active purchase price list price (`M_ProductPrice.PriceStd`) valid at-or-before the needed
--    date. 2. Else active sales price list price, same date rule. 3. Else literal `1` (the same
-- non-zero placeholder decision from R18/R28, requiring finance follow-up review where used).
-- `IsManual='Y'`, `IsPermanent='Y'`, `CostType='STA'`, warehouse-independent (`M_Warehouse_ID`
-- NULL) so core's no-dimension fallback in `CostingUtils.getStandardCostDefinition` can find it.
-- Bounded by the next existing Standard/legacy-Standard row's start date when one exists.

-- @check
WITH standard_rules AS (
  SELECT cr.ad_org_id, cr.backdatedtrxsfixed
  FROM m_costing_rule cr
  WHERE cr.ad_client_id = :client_id
    AND cr.isactive = 'Y'
    AND cr.isvalidated = 'Y'
    AND cr.m_costing_algorithm_id = '6A39D8B46CD94FE682D48758D3B7726B'
), candidate_trx_dated AS (
  SELECT
    t.m_transaction_id,
    t.m_product_id,
    cost_org.ad_org_id AS cost_org_id,
    COALESCE(loc.m_warehouse_id, io.m_warehouse_id, inv.m_warehouse_id) AS needed_warehouse_id,
    CASE
      WHEN sr.backdatedtrxsfixed = 'Y' THEN t.movementdate
      WHEN inv.inventory_type IN ('O', 'C') THEN t.movementdate
      ELSE COALESCE(t.trxprocessdate, t.movementdate)
    END AS needed_date
  FROM m_transaction t
  LEFT JOIN m_inoutline iol
    ON iol.m_inoutline_id = t.m_inoutline_id AND iol.ad_client_id = t.ad_client_id AND iol.isactive = 'Y'
  LEFT JOIN m_inout io
    ON io.m_inout_id = iol.m_inout_id AND io.ad_client_id = t.ad_client_id AND io.isactive = 'Y'
  LEFT JOIN m_inventoryline invl
    ON invl.m_inventoryline_id = t.m_inventoryline_id AND invl.ad_client_id = t.ad_client_id AND invl.isactive = 'Y'
  LEFT JOIN m_inventory inv
    ON inv.m_inventory_id = invl.m_inventory_id AND inv.ad_client_id = t.ad_client_id AND inv.isactive = 'Y'
  LEFT JOIN m_movementline movl
    ON movl.m_movementline_id = t.m_movementline_id AND movl.ad_client_id = t.ad_client_id AND movl.isactive = 'Y'
  LEFT JOIN m_movement mov
    ON mov.m_movement_id = movl.m_movement_id AND mov.ad_client_id = t.ad_client_id AND mov.isactive = 'Y'
  LEFT JOIN m_internal_consumptionline icl
    ON icl.m_internal_consumptionline_id = t.m_internal_consumptionline_id AND icl.ad_client_id = t.ad_client_id AND icl.isactive = 'Y'
  LEFT JOIN m_internal_consumption ic
    ON ic.m_internal_consumption_id = icl.m_internal_consumption_id AND ic.ad_client_id = t.ad_client_id AND ic.isactive = 'Y'
  LEFT JOIN m_productionline prl
    ON prl.m_productionline_id = t.m_productionline_id AND prl.ad_client_id = t.ad_client_id AND prl.isactive = 'Y'
  LEFT JOIN m_productionplan prp
    ON prp.m_productionplan_id = prl.m_productionplan_id AND prp.ad_client_id = t.ad_client_id AND prp.isactive = 'Y'
  LEFT JOIN m_production prod
    ON prod.m_production_id = prp.m_production_id AND prod.ad_client_id = t.ad_client_id AND prod.isactive = 'Y'
  JOIN m_product p
    ON p.m_product_id = t.m_product_id AND p.ad_client_id = t.ad_client_id
  LEFT JOIN m_locator loc
    ON loc.m_locator_id = t.m_locator_id
  JOIN ad_org trx_org
    ON trx_org.ad_org_id = t.ad_org_id AND trx_org.ad_client_id = t.ad_client_id
  JOIN ad_org cost_org
    ON cost_org.ad_org_id = COALESCE(trx_org.ad_legalentity_org_id, trx_org.ad_org_id)
  JOIN standard_rules sr
    ON sr.ad_org_id = cost_org.ad_org_id
  WHERE t.ad_client_id = :client_id
    AND t.isactive = 'Y'
    AND (
      t.m_inoutline_id IS NOT NULL OR t.m_inventoryline_id IS NOT NULL
      OR t.m_movementline_id IS NOT NULL OR t.m_internal_consumptionline_id IS NOT NULL
      OR t.m_productionline_id IS NOT NULL
    )
    AND COALESCE(io.posted, inv.posted, mov.posted, ic.posted, prod.posted) <> 'Y'
    AND COALESCE(io.processed, inv.processed, mov.processed, ic.processed, prod.processed) = 'Y'
    AND p.producttype = 'I'
    AND p.isstocked = 'Y'
    AND COALESCE(p.bookusingpoprice, 'N') = 'N'
    AND t.isprocessed = 'N'
    AND COALESCE(t.costing_status, 'NC') <> 'S'
    AND NOT (inv.inventory_type = 'O' AND invl.cost IS NOT NULL AND invl.cost <> 0)
), candidate_trx AS (
  -- Gate on the ACTUAL computed needed_date (trxprocessdate for most TrxTypes), not the raw
  -- movementdate — a transaction with movementdate <= now() but trxprocessdate > now() must NOT
  -- pass, or the anchor would be seeded with a future datefrom. See the "Date resolution" section
  -- above: needed_date is always >= movementdate, so gating on movementdate alone is not
  -- conservative here, it is simply wrong (too permissive).
  SELECT * FROM candidate_trx_dated WHERE needed_date <= now()
), needed_products AS (
  SELECT DISTINCT ON (ct.m_product_id, ct.cost_org_id)
    ct.m_product_id,
    ct.cost_org_id,
    ct.needed_warehouse_id,
    ct.needed_date
  FROM candidate_trx ct
  ORDER BY ct.m_product_id, ct.cost_org_id, ct.needed_date ASC, ct.m_transaction_id ASC
)
SELECT 1
FROM needed_products np
WHERE NOT EXISTS (
  SELECT 1
  FROM m_costing c
  WHERE c.ad_client_id = :client_id
    AND c.m_product_id = np.m_product_id
    AND c.ad_org_id = np.cost_org_id
    AND c.isactive = 'Y'
    AND c.costtype IN ('STA', 'ST')
    AND c.cost IS NOT NULL
    AND (c.m_warehouse_id = np.needed_warehouse_id OR c.m_warehouse_id IS NULL)
    AND c.datefrom <= np.needed_date
    AND c.dateto > np.needed_date
)
LIMIT 1;

-- @apply
WITH standard_rules AS (
  SELECT cr.ad_org_id, cr.backdatedtrxsfixed
  FROM m_costing_rule cr
  WHERE cr.ad_client_id = :client_id
    AND cr.isactive = 'Y'
    AND cr.isvalidated = 'Y'
    AND cr.m_costing_algorithm_id = '6A39D8B46CD94FE682D48758D3B7726B'
), candidate_trx_dated AS (
  SELECT
    t.m_transaction_id,
    t.m_product_id,
    cost_org.ad_org_id AS cost_org_id,
    COALESCE(loc.m_warehouse_id, io.m_warehouse_id, inv.m_warehouse_id) AS needed_warehouse_id,
    CASE
      WHEN sr.backdatedtrxsfixed = 'Y' THEN t.movementdate
      WHEN inv.inventory_type IN ('O', 'C') THEN t.movementdate
      ELSE COALESCE(t.trxprocessdate, t.movementdate)
    END AS needed_date
  FROM m_transaction t
  LEFT JOIN m_inoutline iol
    ON iol.m_inoutline_id = t.m_inoutline_id AND iol.ad_client_id = t.ad_client_id AND iol.isactive = 'Y'
  LEFT JOIN m_inout io
    ON io.m_inout_id = iol.m_inout_id AND io.ad_client_id = t.ad_client_id AND io.isactive = 'Y'
  LEFT JOIN m_inventoryline invl
    ON invl.m_inventoryline_id = t.m_inventoryline_id AND invl.ad_client_id = t.ad_client_id AND invl.isactive = 'Y'
  LEFT JOIN m_inventory inv
    ON inv.m_inventory_id = invl.m_inventory_id AND inv.ad_client_id = t.ad_client_id AND inv.isactive = 'Y'
  LEFT JOIN m_movementline movl
    ON movl.m_movementline_id = t.m_movementline_id AND movl.ad_client_id = t.ad_client_id AND movl.isactive = 'Y'
  LEFT JOIN m_movement mov
    ON mov.m_movement_id = movl.m_movement_id AND mov.ad_client_id = t.ad_client_id AND mov.isactive = 'Y'
  LEFT JOIN m_internal_consumptionline icl
    ON icl.m_internal_consumptionline_id = t.m_internal_consumptionline_id AND icl.ad_client_id = t.ad_client_id AND icl.isactive = 'Y'
  LEFT JOIN m_internal_consumption ic
    ON ic.m_internal_consumption_id = icl.m_internal_consumption_id AND ic.ad_client_id = t.ad_client_id AND ic.isactive = 'Y'
  LEFT JOIN m_productionline prl
    ON prl.m_productionline_id = t.m_productionline_id AND prl.ad_client_id = t.ad_client_id AND prl.isactive = 'Y'
  LEFT JOIN m_productionplan prp
    ON prp.m_productionplan_id = prl.m_productionplan_id AND prp.ad_client_id = t.ad_client_id AND prp.isactive = 'Y'
  LEFT JOIN m_production prod
    ON prod.m_production_id = prp.m_production_id AND prod.ad_client_id = t.ad_client_id AND prod.isactive = 'Y'
  JOIN m_product p
    ON p.m_product_id = t.m_product_id AND p.ad_client_id = t.ad_client_id
  LEFT JOIN m_locator loc
    ON loc.m_locator_id = t.m_locator_id
  JOIN ad_org trx_org
    ON trx_org.ad_org_id = t.ad_org_id AND trx_org.ad_client_id = t.ad_client_id
  JOIN ad_org cost_org
    ON cost_org.ad_org_id = COALESCE(trx_org.ad_legalentity_org_id, trx_org.ad_org_id)
  JOIN standard_rules sr
    ON sr.ad_org_id = cost_org.ad_org_id
  WHERE t.ad_client_id = :client_id
    AND t.isactive = 'Y'
    AND (
      t.m_inoutline_id IS NOT NULL OR t.m_inventoryline_id IS NOT NULL
      OR t.m_movementline_id IS NOT NULL OR t.m_internal_consumptionline_id IS NOT NULL
      OR t.m_productionline_id IS NOT NULL
    )
    AND COALESCE(io.posted, inv.posted, mov.posted, ic.posted, prod.posted) <> 'Y'
    AND COALESCE(io.processed, inv.processed, mov.processed, ic.processed, prod.processed) = 'Y'
    AND p.producttype = 'I'
    AND p.isstocked = 'Y'
    AND COALESCE(p.bookusingpoprice, 'N') = 'N'
    AND t.isprocessed = 'N'
    AND COALESCE(t.costing_status, 'NC') <> 'S'
    AND NOT (inv.inventory_type = 'O' AND invl.cost IS NOT NULL AND invl.cost <> 0)
), candidate_trx AS (
  -- Same date-gate correction as @check — must stay textually identical shape (mirrors R22's
  -- own lesson: @check/@apply asymmetry on the gate causes a fix to never converge).
  SELECT * FROM candidate_trx_dated WHERE needed_date <= now()
), needed_products AS (
  SELECT DISTINCT ON (ct.m_product_id, ct.cost_org_id)
    ct.m_product_id,
    ct.cost_org_id,
    ct.needed_warehouse_id,
    ct.needed_date,
    ct.m_transaction_id
  FROM candidate_trx ct
  ORDER BY ct.m_product_id, ct.cost_org_id, ct.needed_date ASC, ct.m_transaction_id ASC
), resolved AS (
  SELECT
    np.*,
    COALESCE(pp.pricestd, sp.pricestd, 1) AS unit_cost,
    COALESCE(pp.c_currency_id, sp.c_currency_id, acct.c_currency_id, '100') AS cost_currency_id,
    next_std.datefrom AS next_standard_date
  FROM needed_products np
  LEFT JOIN LATERAL (
    SELECT pp.pricestd, pl.c_currency_id
    FROM m_pricelist pl
    JOIN m_pricelist_version plv
      ON plv.m_pricelist_id = pl.m_pricelist_id
     AND plv.isactive = 'Y'
     AND plv.validfrom <= np.needed_date
    JOIN m_productprice pp
      ON pp.m_pricelist_version_id = plv.m_pricelist_version_id
     AND pp.m_product_id = np.m_product_id
     AND pp.isactive = 'Y'
    WHERE pl.ad_client_id = :client_id
      AND pl.issopricelist = 'N'
      AND pl.isactive = 'Y'
    ORDER BY pl.isdefault DESC, plv.validfrom DESC, pl.created ASC
    LIMIT 1
  ) pp ON true
  LEFT JOIN LATERAL (
    SELECT pp.pricestd, pl.c_currency_id
    FROM m_pricelist pl
    JOIN m_pricelist_version plv
      ON plv.m_pricelist_id = pl.m_pricelist_id
     AND plv.isactive = 'Y'
     AND plv.validfrom <= np.needed_date
    JOIN m_productprice pp
      ON pp.m_pricelist_version_id = plv.m_pricelist_version_id
     AND pp.m_product_id = np.m_product_id
     AND pp.isactive = 'Y'
    WHERE pl.ad_client_id = :client_id
      AND pl.issopricelist = 'Y'
      AND pl.isactive = 'Y'
    ORDER BY pl.isdefault DESC, plv.validfrom DESC, pl.created ASC
    LIMIT 1
  ) sp ON true
  LEFT JOIN LATERAL (
    SELECT a.c_currency_id
    FROM c_acctschema a
    WHERE a.ad_client_id = :client_id
      AND a.isactive = 'Y'
    ORDER BY a.created ASC, a.c_acctschema_id ASC
    LIMIT 1
  ) acct ON true
  LEFT JOIN LATERAL (
    SELECT c.datefrom
    FROM m_costing c
    WHERE c.ad_client_id = :client_id
      AND c.m_product_id = np.m_product_id
      AND c.ad_org_id = np.cost_org_id
      AND c.isactive = 'Y'
      AND c.costtype IN ('STA', 'ST')
      AND c.cost IS NOT NULL
      AND c.m_warehouse_id IS NULL
      AND c.datefrom > np.needed_date
    ORDER BY c.datefrom ASC, c.m_costing_id ASC
    LIMIT 1
  ) next_std ON true
)
INSERT INTO m_costing (
  m_costing_id, ad_client_id, ad_org_id, m_product_id,
  datefrom, dateto, ismanual, qty, price, cumstock,
  costtype, ispermanent, cost, isproduction, isactive,
  m_warehouse_id, m_transaction_id, c_currency_id,
  created, createdby, updated, updatedby
)
SELECT
  get_uuid(), :client_id, r.cost_org_id, r.m_product_id,
  r.needed_date, COALESCE(r.next_standard_date, TIMESTAMP '9999-12-31 00:00:00'), 'Y', 0,
  r.unit_cost, 0, 'STA', 'Y', r.unit_cost, 'N', 'Y',
  NULL, r.m_transaction_id, r.cost_currency_id,
  now(), '0', now(), '0'
FROM resolved r
WHERE NOT EXISTS (
  SELECT 1
  FROM m_costing c
  WHERE c.ad_client_id = :client_id
    AND c.m_product_id = r.m_product_id
    AND c.ad_org_id = r.cost_org_id
    AND c.isactive = 'Y'
    AND c.costtype IN ('STA', 'ST')
    AND c.cost IS NOT NULL
    AND (c.m_warehouse_id = r.needed_warehouse_id OR c.m_warehouse_id IS NULL)
    AND c.datefrom <= r.needed_date
    AND c.dateto > r.needed_date
);
