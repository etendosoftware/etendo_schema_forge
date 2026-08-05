-- @id: R19-locator-inventory-status
-- @gap: I1
-- @risk: medium
-- @type: sql
-- @description: Flip storage bins stuck on inventory status "Undefined-OverIssue" (allows
--   negative stock) to "Available" (blocks it); skip (and report) any bin that currently
--   carries negative on-hand stock for at least one product/attribute/UOM, since flipping
--   those would violate the same "negative stock cannot move to a non-OverIssue status"
--   business rule the UI itself enforces.

-- Background
-- --------------------------------------------------------------------------------------------
-- M_InventoryStatus is a fixed system reference (ad_client_id='0'): id '0' = "Undefined-OverIssue"
-- (OVERISSUE='Y', lets a locator go negative), id '2' = "Available" (OVERISSUE='N', blocks it).
-- Every tenant's onboarding-created default storage bins (Shipping and Goods Receipt locators,
-- created client-side when the first warehouse is provisioned) were created with
-- M_INVENTORYSTATUS_ID='2' hardcoded in tools/app-shell/src/windows/custom/warehouse/index.jsx
-- (see the ETP-4761 fix there) EXCEPT before that fix shipped, where the field was omitted and the
-- column default ('0') applied. The bundled onboarding sampledata
-- (referencedata/sampledata/GOClient/M_LOCATOR.xml, in com.etendoerp.go) shipped BOTH of GOClient's
-- own bins at '0' -- imported verbatim into every new tenant via importOnboardingDataset -- so
-- every tenant born before this fix has at least the default warehouse bin able to go negative.
--
-- Negative-stock guard (mandatory -- confirmed live, not a DB constraint)
-- --------------------------------------------------------------------------------------------
-- Changing a locator OUT of an OverIssue-allowed status while it holds negative on-hand stock
-- (m_storage_detail.qtyonhand < 0 for ANY product/attribute/UOM on that locator) fails at the
-- application/callout layer ("There is negative Stock for Product: ... The Storage Bin can not be
-- changed to an Inventory Status that does not allow Over Issue"). This fix must NEVER attempt to
-- correct the negative stock itself (that is a physical-inventory decision, out of scope for a
-- data-fix) and must NEVER flip such a locator's status -- doing so would violate the same rule
-- the UI enforces. Per-locator granularity: m_locator.m_inventorystatus_id is a single column per
-- locator (not per storage-detail row), so a locator with ANY negative-stock row is left
-- completely untouched; only locators with ZERO negative-stock rows are flipped.
--
-- Reporting the skipped locators (@report, see parse-fix.js / sql/README.md)
-- --------------------------------------------------------------------------------------------
-- @check fires on ANY active status-0 locator for the tenant, whether flippable or not, so the
-- gap is never silently missed for a tenant whose bins are ALL blocked by negative stock (in that
-- case @apply flips 0 rows but @report still surfaces the full manual-correction list). @report
-- runs after @apply, in the same transaction, and lists every locator/product/attribute/UOM
-- combination that is STILL at status '0' because it was guarded out -- the runner writes this into
-- the ledger's `detail` column on the APPLIED row. KNOWN LIMITATION (accepted, per the framework's
-- one-run-per-tenant watermark model): if the negative stock is later corrected by hand, this fix
-- will NOT automatically revisit that tenant (its watermark has already advanced past R19) -- an
-- operator must force it with `--fix R19-locator-inventory-status --client <id>`.
--
-- Preventive twin (new tenants born correct)
-- --------------------------------------------------------------------------------------------
-- referencedata/sampledata/GOClient/M_LOCATOR.xml (com.etendoerp.go) -- both bundled locators now
-- ship M_INVENTORYSTATUS_ID='2'. ONBOARDING_PROVISIONED_THROUGH bumped to
-- 2026-08-03T16:00:00Z in OnboardingBaselineService.java.

-- @check
-- Returns >=1 row when the fix IS needed. 0 rows => SKIPPED_NOT_NEEDED, @apply never runs.
SELECT 1
FROM m_locator l
WHERE l.ad_client_id = :client_id
  AND l.isactive = 'Y'
  AND l.m_inventorystatus_id = '0'
LIMIT 1;

-- @apply
-- Flip only locators with ZERO negative-stock rows. A locator with any qtyonhand < 0 row is left
-- at status '0' -- never touched -- and picked up by @report below.
UPDATE m_locator l
SET m_inventorystatus_id = '2',
    updated = now(),
    updatedby = '0'
WHERE l.ad_client_id = :client_id
  AND l.isactive = 'Y'
  AND l.m_inventorystatus_id = '0'
  AND NOT EXISTS (
    SELECT 1 FROM m_storage_detail sd
    WHERE sd.m_locator_id = l.m_locator_id AND sd.qtyonhand < 0
  );

-- @report
-- Runs after @apply in the same transaction. Lists every product/attribute/UOM combination that
-- kept a locator at status '0' (skipped above because of negative on-hand stock) so an operator
-- can run a physical-inventory correction before forcing a re-check.
SELECT l.value AS locator,
       l.m_locator_id AS locator_id,
       p.value AS product_code,
       p.name AS product_name,
       COALESCE(asi.description, 'no attribute') AS attribute,
       COALESCE(u.name, sd.c_uom_id) AS uom,
       sd.qtyonhand
FROM m_storage_detail sd
JOIN m_locator l ON l.m_locator_id = sd.m_locator_id
JOIN m_product p ON p.m_product_id = sd.m_product_id
LEFT JOIN c_uom u ON u.c_uom_id = sd.c_uom_id
LEFT JOIN m_attributesetinstance asi ON asi.m_attributesetinstance_id = sd.m_attributesetinstance_id
WHERE l.ad_client_id = :client_id
  AND l.isactive = 'Y'
  AND l.m_inventorystatus_id = '0'
  AND sd.qtyonhand < 0
ORDER BY l.value, p.value;
