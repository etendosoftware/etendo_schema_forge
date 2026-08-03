-- @id: R20-default-standard-costing-rule
-- @gap: J1
-- @risk: medium
-- @type: sql
-- @description: Seed one active, validated Standard M_Costing_Rule for tenants born with ZERO costing rules at all, so Average is never the silent default and M_Transaction.iscostcalculated stops staying 'N' forever -- ETP-4760
--
-- Background (symptom)
-- --------------------------------------------------------------------------------------------
-- ETP-4760: "La regla de costeo debe ser Standard por defecto (no Average)". Live-DB sweep
-- (etendogoclean, 2026-08-03) showed the real root cause is NOT that tenants inherit Average --
-- they inherit NOTHING. M_COSTING_RULE was never in OnboardingDatasetDefinition.INCLUDED_TABLES,
-- so onboarding clones zero rules for every new tenant. Confirmed: acreedortest, acreetest2,
-- empresa, 4 "Empresa E2E *" tenants, RolesPresa and TaxesOrg all have 0 M_Costing_Rule rows.
-- Every M_Transaction row on the 4 of those with any transactions is iscostcalculated='N'
-- (100%), while GOClient/F&B International Group/QA Testing -- the only tenants with a rule --
-- show 'Y' wherever a rule was active. GOClient's original rule (Average, isvalidated='Y', no
-- M_Costing_Rule_Init) was confirmed hand-created by a human, not by onboarding -- it is not
-- representative of what onboarding actually gives a new tenant.
--
-- Scope decision -- SQL-only handles the "zero rule" case; the "existing Average rule" case is
-- explicitly OUT OF SCOPE here (see reasoning below and tenant-remediation-knowledge.md)
-- --------------------------------------------------------------------------------------------
-- The "Validate Costing Rule" process (obuiapp_process_id 45ED6D0400FD42BEA9771C549A9AE8AB,
-- org.openbravo.costing.CostingRuleProcessActionHandler) does NOT just flip a flag: observed
-- live on GOClient (client 802509E12436405C86BA1FD5B1DF508C) running it closed the old Average
-- rule (dateto = validation instant), inserted+validated a new Standard rule (datefrom = the
-- same instant), closed all 8 open M_Costing anchors (dateto set on every one -- zero remain
-- open, matching the documented LAZY migration: the next transaction per product re-opens its
-- own anchor under the new rule), and -- the part that makes this genuinely process-only --
-- auto-created 4 M_Inventory (Physical Inventory) documents, one closing + one opening per
-- warehouse, each with its own M_Costing_Rule_Init link row. Replicating real, postable
-- Physical Inventory documents (sequences, doc types, lines, workflow, posting) by hand SQL
-- would be a much bigger, much riskier lift than this data-fixes framework is meant for, and
-- the "webhook" fix type is not implemented in run.js yet (see docs/etendo-ad/tenant-
-- remediation-knowledge.md and cli/src/data-fixes/README.md). A brand-new tenant with zero products and
-- zero transactions has no prior rule to close and no inventory to reconcile -- exactly the
-- "zero rule" case below -- so cloning an already-validated Standard rule directly is safe and
-- sufficient for it. Tenants that already have a validated rule of ANY algorithm (GOClient
-- itself, now Standard; F&B International Group and QA Testing, still Average) are deliberately
-- EXCLUDED from @check/@apply below and flagged for a manual "Validate Costing Rule" run via the
-- UI by an accounting admin -- see the follow-up note in onboarding-gaps.md §J1.
--
-- Row shape mirrors GOClient's own original (manually-created, still working) Average rule and
-- the tenant's post-validation Standard rows: whole-client (no M_Product_Id/M_Product_Category_
-- Id -- NULL), org_dimension='N', warehouse_dimension='N', no M_Costing_Rule_Init (none needed --
-- there is nothing to close for a rule this seeds cold). isvalidated='Y' from the INSERT itself
-- (allowed -- the m_costing_rule_trg trigger only restricts UPDATE/DELETE of an already-
-- validated row, never a plain INSERT). datefrom is backdated to the tenant's own AD_Client.
-- Created timestamp so the rule covers the tenant's ENTIRE history (as if onboarding had
-- provisioned it from day one), not just "from today forward".
--
-- Acceptance criterion (per the ticket): do NOT expect every product to be Standard-costed
-- immediately -- migration is lazy, per-product, on next transaction. The correct criterion is
-- "the client's active/validated costing rule going forward is Standard".
--
-- Target org / SINGLE-ORG RESTRICTION (QA finding, 2026-08-03, addressed same day): the tenant's
-- operative org is resolved the same way R6-org-info-location does (a self-contained subquery,
-- not the runner's :org_id bind). The rule is inserted with org_dimension='N' (whole-client), but
-- it still carries exactly ONE ad_org_id -- and Etendo core's actual lookup is an EXACT match on
-- that column with NO client-wide fallback (CostingUtils.getCostDimensionRule /
-- CostingServer.getOrganization()). An earlier revision of this fix assumed the org choice was
-- irrelevant for a whole-client rule and picked "the oldest non-'*' org" for ANY zero-rule tenant;
-- QA traced the core lookup and showed that for a hypothetical future zero-rule tenant with
-- MULTIPLE Legal Entities, transactions under any legal entity other than the one picked would hit
-- a hard NoCostingRuleFoundForOrganizationAndDate error instead of today's silent gap -- worse than
-- the defect this fix closes. No currently-matched tenant is multi-org (verified below), so this
-- was a latent assumption, not an active bug, but the fix now scopes itself to single-org tenants
-- ONLY (both @check and @apply require `COUNT(non-'*' orgs) = 1`). A future multi-org zero-rule
-- tenant falls through to the SAME "needs manual handling" bucket as the already-excluded
-- existing-rule tenants (GOClient/F&B/QA Testing) -- multi-org costing-rule seeding is explicitly
-- OUT OF SCOPE for this fix, not silently mishandled.

-- @check
-- Needs the fix when the tenant has EXACTLY ONE operative (non-'*') org AND zero active+validated
-- M_Costing_Rule rows client-wide (any algorithm). A tenant with an existing validated rule (even
-- Average) is intentionally NOT matched here -- see the scope decision above. A tenant with ZERO
-- or MULTIPLE non-'*' orgs is also NOT matched -- see the single-org restriction above.
SELECT 1
FROM ad_org o
WHERE o.ad_client_id = :client_id
  AND o.name <> '*'
  AND (SELECT COUNT(*) FROM ad_org o2 WHERE o2.ad_client_id = :client_id AND o2.name <> '*') = 1
  AND NOT EXISTS (
    SELECT 1 FROM m_costing_rule cr
    WHERE cr.ad_client_id = :client_id
      AND cr.isactive = 'Y'
      AND cr.isvalidated = 'Y'
  )
LIMIT 1;

-- @apply
-- Second idempotency layer: the same NOT EXISTS + single-org guard as @check, re-evaluated at
-- apply time (LIMIT 1 in the target-org subquery is now provably a no-op given the COUNT=1 guard,
-- kept as defense-in-depth in case the guard is ever weakened).
INSERT INTO m_costing_rule (
  m_costing_rule_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby,
  m_costing_algorithm_id, org_dimension, warehouse_dimension, isvalidated, process_rule, datefrom
)
SELECT
  get_uuid(), :client_id, tgt.ad_org_id, 'Y', now(), '0', now(), '0',
  '6A39D8B46CD94FE682D48758D3B7726B', -- Standard Algorithm (m_costing_algorithm_id)
  'N', 'N', 'Y', 'N', c.created
FROM (
  SELECT o.ad_org_id
  FROM ad_org o
  WHERE o.ad_client_id = :client_id AND o.name <> '*'
  ORDER BY o.created, o.ad_org_id
  LIMIT 1
) tgt
CROSS JOIN ad_client c
WHERE c.ad_client_id = :client_id
  AND (SELECT COUNT(*) FROM ad_org o2 WHERE o2.ad_client_id = :client_id AND o2.name <> '*') = 1
  AND NOT EXISTS (
    SELECT 1 FROM m_costing_rule cr
    WHERE cr.ad_client_id = :client_id
      AND cr.isactive = 'Y'
      AND cr.isvalidated = 'Y'
  );
