-- @id: R38-org-legalentity-pointer
-- @gap: D1
-- @risk: low
-- @type: sql
-- @description: Backfill AD_ORG.AD_LEGALENTITY_ORG_ID on legal-entity organizations that
--   AD_Org_Ready left empty, which makes C_GETTAX unable to resolve any non-zero-rate tax

-- Background (ETP-5352)
-- --------------------------------------------------------------------------------------------
-- Symptom: confirming a Sales Shipment that does NOT come from a Sales Order and asking for the
-- invoice fails with `OBException: @TaxNotFound@`. Shipments that DO come from an order are
-- unaffected, and the same failure reproduces in the classic backoffice via "Create Lines From
-- Shipment", so this is not Etendo GO application code.
--
-- Chain of causation
-- --------------------------------------------------------------------------------------------
-- 1. Core's UpdateTax hook copies the tax from the order line when there is one; for a standalone
--    shipment it must LOOK IT UP instead, via Tax.get(...) -> C_GETTAX(...).
-- 2. C_GETTAX receives p_forcedcashvat as NULL (the 9-arg overload) and resolves the cash-VAT
--    criterion itself:
--        select coalesce(oi.isCashVAT,'N') into v_IsCashVAT
--        from ad_orginfo oi where oi.ad_org_id = ad_get_org_le_bu(p_org_id,'LE');
-- 3. ad_get_org_le_bu() does NOT walk the organization tree — it reads the denormalized column
--    AD_ORG.AD_LEGALENTITY_ORG_ID directly. Empty column => NULL.
-- 4. `WHERE ad_org_id = NULL` matches no row, so v_IsCashVAT stays NULL. The COALESCE guards
--    against a null COLUMN, not against an absent ROW.
-- 5. The filter present in all three branches of C_GETTAX then excludes every ordinary rate:
--        AND (t.isCashVAT = v_IsCashVAT
--             OR (t.isCashVAT = 'N' and (t.isWithholdingTax = 'Y' or t.rate = 0)))
--    `t.isCashVAT = NULL` is never true, and the second half only rescues withholdings and
--    zero-rate taxes. "Entregas IVA 21%" is excluded, C_GETTAX returns NULL, UpdateTax raises
--    @TaxNotFound@ with no SQL error and no stack trace.
--
-- Note the second half of that filter: a tenant whose products all sit in a zero-rate tax
-- category will NOT show the symptom even while carrying the defect. Absence of complaints is
-- therefore not evidence that a tenant is healthy — only the column is.
--
-- Why the column ends up empty
-- --------------------------------------------------------------------------------------------
-- AD_Org_Ready derives it through ad_get_org_le_bu_treenode(org,'LE') and writes the result,
-- NULL included, in a single UPDATE. That function returns the organization itself as soon as the
-- org's type carries ISLEGALENTITY='Y'; otherwise it walks AD_TREENODE, and a walk that finds no
-- parent yields NULL. AD_Org_Ready wraps the call in `EXCEPTION WHEN DATA_EXCEPTION THEN := NULL`,
-- so a failure there is completely silent. The sibling columns written by that same UPDATE
-- (period control, calendar owner, inherited calendar) survive because their functions short-
-- circuit on the organization's own data and never reach the tree — which is why the observed
-- symptom is "three of five columns populated" rather than an UPDATE that never ran.
--
-- A NULL AD_BUSINESSUNIT_ORG_ID is NOT part of the defect: every healthy "Legal with accounting"
-- organization has it empty, because such a type is a legal entity and not a business unit. This
-- fix deliberately leaves that column alone.
--
-- Scope of the repair
-- --------------------------------------------------------------------------------------------
-- Restricted to organizations whose type is a legal entity, where the correct value is provably
-- the organization itself — the same answer ad_get_org_le_bu_treenode() gives via its short
-- circuit, with no dependency on AD_TREENODE being intact. Etendo GO tenants are flat (one
-- legal-with-accounting org under '*'), so this covers the affected population exactly.
-- Non-legal-entity child organizations are NOT touched here: their correct pointer depends on a
-- tree walk, and an organization that needs one is outside the shape onboarding produces.
--
-- isready='Y' guard
-- --------------------------------------------------------------------------------------------
-- Only organizations that finished provisioning are repaired. An org still at isready='N' never
-- completed its alta and is missing far more than this pointer (no accounting schema, no business
-- partners, no products); filling one column there would mask a half-created tenant rather than
-- fix it. @report lists any such organization so an operator can see it was skipped and why.
--
-- Relationship to gap D1
-- --------------------------------------------------------------------------------------------
-- This IS gap D1 ("SII fields empty; AD_GET_ORG_LE_BU returns NULL"), catalogued during ETP-4177
-- with a placeholder corrective id `R-legalentity` that was never shipped. This fix closes it, and
-- supersedes that placeholder. The D1 symptom recorded back then was the fiscal one — SII /
-- VeriFactu filter on Organization.PROPERTY_LEGALENTITYORGANIZATION, so an empty pointer makes
-- those filters match nothing and fail silently. ETP-5352 is the same root cause surfacing through
-- a second, louder symptom: tax resolution.
--
-- Preventive twin
-- --------------------------------------------------------------------------------------------
-- com.etendoerp.go OnboardingMarkOrgReadyService now (a) stops returning early when the org is
-- already ready, so derived state is reconciled on every alta, (b) recomputes both hierarchy
-- pointers on the DAL session connection after AD_ORG_TREE is in place, and (c) fails the alta
-- loudly when the organization is not a legal entity or the pointer is still empty afterwards.
--
-- Idempotency
-- --------------------------------------------------------------------------------------------
-- @check returns >=1 row only while some ready legal-entity org still has the column empty.
-- @apply carries the same guard, so a re-run matches 0 rows. Scoped to ad_client_id = :client_id.

-- @check
SELECT 1
FROM ad_org o
JOIN ad_orgtype ot ON ot.ad_orgtype_id = o.ad_orgtype_id
WHERE o.ad_client_id = :client_id
  AND o.ad_org_id <> '0'
  AND ot.islegalentity = 'Y'
  AND o.isready = 'Y'
  AND o.ad_legalentity_org_id IS NULL;

-- @apply
UPDATE ad_org o
SET ad_legalentity_org_id = o.ad_org_id,
    updated = now(),
    updatedby = '0'
FROM ad_orgtype ot
WHERE ot.ad_orgtype_id = o.ad_orgtype_id
  AND o.ad_client_id = :client_id
  AND o.ad_org_id <> '0'
  AND ot.islegalentity = 'Y'
  AND o.isready = 'Y'
  AND o.ad_legalentity_org_id IS NULL;

-- @report
-- Legal-entity organizations left untouched because they never finished provisioning. These
-- need the alta completed (or the tenant discarded), not a single-column patch.
SELECT o.name AS organization,
       o.ad_org_id AS org_id,
       'isready=N — alta never completed; legal entity pointer intentionally not backfilled'
         AS reason
FROM ad_org o
JOIN ad_orgtype ot ON ot.ad_orgtype_id = o.ad_orgtype_id
WHERE o.ad_client_id = :client_id
  AND o.ad_org_id <> '0'
  AND ot.islegalentity = 'Y'
  AND o.isready = 'N'
  AND o.ad_legalentity_org_id IS NULL;
