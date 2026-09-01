-- @id: R28-standard-cost-anchor
-- @gap: J2
-- @risk: high
-- @type: sql
-- @description: Seed initial Standard M_Costing rows for Standard-cost tenants whose products need a cost but do not yet have one -- ETP-4706
--
-- Background
-- --------------------------------------------------------------------------------------------
-- R18 seeded Average-cost anchors (`M_Costing.CostType='AVA'`) for the old stuck-average-queue
-- failure. That no longer matches the intended Etendo Go costing model: new tenants are now
-- provisioned with Standard costing rules (R20 / ETP-4760), and core posting checks Standard costs
-- through `CostingUtils.getStandardCostDefinition`, which only accepts `CostType='STA'` first and
-- legacy `CostType='ST'` second. An AVA row is invisible to that lookup.
--
-- User-facing symptom
-- --------------------------------------------------------------------------------------------
-- Goods Receipt posting can fail with core message `InvalidCostWhichProduct`:
--   "There is no cost defined for the product: @Product@ on @Date@"
-- This is a Standard-cost missing-input condition. Etendo Go users should not be asked to understand
-- costing rules; the frontend maps this to the same friendly "cost not calculated yet, try again in a
-- moment" message. This data-fix supplies the missing initial Standard-cost input for existing data.
--
-- Scope
-- --------------------------------------------------------------------------------------------
-- This fix targets tenants that already have an active, validated Standard costing rule. It inserts a
-- single open-ended manual, warehouse-independent Standard cost row per product/legal entity found
-- on unposted Goods Receipt / Goods Shipment lines when that product has no Standard or legacy
-- Standard cost covering the first needed accounting date. The warehouse-independent row is enough
-- for `CostingUtils.getStandardCostDefinition`: when a warehouse-specific lookup misses, core
-- rechecks without dimensions and accepts `M_Costing.M_Warehouse_ID IS NULL`.
--
-- It deliberately does NOT convert Average rules to Standard. That conversion must continue to use
-- the real Etendo "Validate Costing Rule" process because it creates the required inventory closing
-- and opening documents. R18 is retired instead of edited because it was an Average-only corrective
-- fix.
--
-- Fallback cost chain
-- --------------------------------------------------------------------------------------------
-- 1. Active purchase price list price (`M_ProductPrice.PriceStd`) valid at-or-before the first needed
--    transaction date.
-- 2. Else active sales price list price, same date rule.
-- 3. Else literal `1`, the same non-zero placeholder decision used after R18's product-owner review.
--
-- The inserted row is marked `IsManual='Y'` and `IsPermanent='Y'`, with `CostType='STA'`. The row is
-- dated at the earliest unposted document accounting date that needs Standard cost; if a later
-- Standard/legacy Standard row exists, this row ends at that later row's start date to avoid covering
-- beyond the next known cost definition.

-- @check
WITH standard_rules AS (
  SELECT cr.ad_org_id
  FROM m_costing_rule cr
  WHERE cr.ad_client_id = :client_id
    AND cr.isactive = 'Y'
    AND cr.isvalidated = 'Y'
    AND cr.m_costing_algorithm_id = '6A39D8B46CD94FE682D48758D3B7726B'
), needed_products AS (
  SELECT DISTINCT ON (iol.m_product_id, cost_org.ad_org_id)
    iol.m_product_id,
    cost_org.ad_org_id AS cost_org_id,
    COALESCE(loc.m_warehouse_id, io.m_warehouse_id) AS needed_warehouse_id,
    io.dateacct AS needed_date
  FROM m_inoutline iol
  JOIN m_inout io
    ON io.m_inout_id = iol.m_inout_id
   AND io.ad_client_id = iol.ad_client_id
  JOIN m_product p
    ON p.m_product_id = iol.m_product_id
   AND p.ad_client_id = iol.ad_client_id
  LEFT JOIN m_transaction t
    ON t.m_inoutline_id = iol.m_inoutline_id
   AND t.ad_client_id = iol.ad_client_id
   AND t.isactive = 'Y'
  JOIN ad_org trx_org
    ON trx_org.ad_org_id = iol.ad_org_id
   AND trx_org.ad_client_id = iol.ad_client_id
  LEFT JOIN m_locator loc
    ON loc.m_locator_id = iol.m_locator_id
  JOIN ad_org cost_org
    ON cost_org.ad_org_id = COALESCE(trx_org.ad_legalentity_org_id, trx_org.ad_org_id)
  JOIN standard_rules sr
    ON sr.ad_org_id = cost_org.ad_org_id
  WHERE iol.ad_client_id = :client_id
    AND iol.isactive = 'Y'
    AND io.isactive = 'Y'
    AND io.posted <> 'Y'
    AND io.processed = 'Y'
    AND io.dateacct <= now()
    AND io.issotrx IN ('Y', 'N')
    AND p.producttype = 'I'
    AND p.isstocked = 'Y'
    AND COALESCE(p.bookusingpoprice, 'N') = 'N'
    AND (t.m_transaction_id IS NULL OR (t.isprocessed = 'N' AND COALESCE(t.costing_status, 'NC') <> 'S'))
  ORDER BY iol.m_product_id, cost_org.ad_org_id, io.dateacct ASC, iol.m_inoutline_id ASC
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
  SELECT cr.ad_org_id
  FROM m_costing_rule cr
  WHERE cr.ad_client_id = :client_id
    AND cr.isactive = 'Y'
    AND cr.isvalidated = 'Y'
    AND cr.m_costing_algorithm_id = '6A39D8B46CD94FE682D48758D3B7726B'
), needed_products AS (
  SELECT DISTINCT ON (iol.m_product_id, cost_org.ad_org_id)
    iol.m_product_id,
    cost_org.ad_org_id AS cost_org_id,
    COALESCE(loc.m_warehouse_id, io.m_warehouse_id) AS needed_warehouse_id,
    io.dateacct AS needed_date,
    t.m_transaction_id
  FROM m_inoutline iol
  JOIN m_inout io
    ON io.m_inout_id = iol.m_inout_id
   AND io.ad_client_id = iol.ad_client_id
  JOIN m_product p
    ON p.m_product_id = iol.m_product_id
   AND p.ad_client_id = iol.ad_client_id
  LEFT JOIN m_transaction t
    ON t.m_inoutline_id = iol.m_inoutline_id
   AND t.ad_client_id = iol.ad_client_id
   AND t.isactive = 'Y'
  JOIN ad_org trx_org
    ON trx_org.ad_org_id = iol.ad_org_id
   AND trx_org.ad_client_id = iol.ad_client_id
  LEFT JOIN m_locator loc
    ON loc.m_locator_id = iol.m_locator_id
  JOIN ad_org cost_org
    ON cost_org.ad_org_id = COALESCE(trx_org.ad_legalentity_org_id, trx_org.ad_org_id)
  JOIN standard_rules sr
    ON sr.ad_org_id = cost_org.ad_org_id
  WHERE iol.ad_client_id = :client_id
    AND iol.isactive = 'Y'
    AND io.isactive = 'Y'
    AND io.posted <> 'Y'
    AND io.processed = 'Y'
    AND io.dateacct <= now()
    AND io.issotrx IN ('Y', 'N')
    AND p.producttype = 'I'
    AND p.isstocked = 'Y'
    AND COALESCE(p.bookusingpoprice, 'N') = 'N'
    AND (t.m_transaction_id IS NULL OR (t.isprocessed = 'N' AND COALESCE(t.costing_status, 'NC') <> 'S'))
  ORDER BY iol.m_product_id, cost_org.ad_org_id, io.dateacct ASC, iol.m_inoutline_id ASC
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
