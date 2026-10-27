-- @id: R53-spanish-tax-accounts
-- @gap: A2
-- @risk: medium
-- @type: sql
-- @description: Point both tax accounts (C_TAX_ACCT t_due_acct/t_credit_acct) of the Spanish withholding, intra-community and reverse-charge child taxes at their dedicated account (4751/473/472/477) instead of the 477/472 defaults onboarding copied (ETP-5902)
--
-- Background
-- ----------
-- Onboarding (TAX_ACCT_SQL in OnboardingAccountingWiringService) and R7-tax-accounts create one
-- C_TAX_ACCT row per system tax per accounting schema, copying C_ACCTSCHEMA_DEFAULT's
-- t_due_acct / t_credit_acct (477 / 472) into every row. Fiscal rules want four groups of child
-- taxes on ONE dedicated account in both columns. Evaluated in order, first match wins:
--   1. purchase withholding                                       -> 47510000  (51 taxes)
--   2. sales withholding                                          -> 47300000  ( 8 taxes)
--   3. purchase intra-community and/or reverse charge, rate > 0   -> 47200000  (15 taxes)
--   4. purchase intra-community and/or reverse charge, rate < 0   -> 47700000  (15 taxes)
-- Only active, non-summary system taxes (ad_client_id = '0', i.e. the
-- com.etendoerp.go.localization.es.data catalog) with a parent. 89 taxes; two match both rule 1
-- and rule 4 and get 4751. Client-level taxes are out of scope.
--
-- Lockstep twins (change all three together): SPANISH_TAX_RULES_SQL in
-- com.etendoerp.go/.../onboarding/OnboardingAccountingWiringService.java (preventive twin, new
-- tenants) and the Classic trigger ESTAX_TAX_ACCT_TRG (ETP-5901, BEFORE INSERT only, so it never
-- fixes the rows that already exist -- this fix does).
--
-- Column-wise guard (never overwrite a hand-chosen account)
-- ----------------------------------------------------------
-- A column is set to the rule account only when it still holds the schema's DEFAULT combination
-- (C_ACCTSCHEMA_DEFAULT.t_due_acct / t_credit_acct) and its account VALUE is not already the rule
-- account. So a column already on target (rule 4's due = 477, rule 3's credit = 472) is not
-- rewritten, a half-fixed row gets only its remaining column, and a column someone pointed at
-- another account is left alone and listed in @report. "On target" compares the account VALUE,
-- not the combination id: the ETP-5901 trigger may use another combination of the same account.
--
-- Combination: the tenant schema's own C_ValidCombination of the rule account, deterministic --
-- the plain one (ad_org_id '0', no dimensions) first, then the oldest. A schema whose chart lacks
-- the account (non-standard charts) is skipped for that rule and listed in @report.
--
-- Every C_ACCTSCHEMA of the tenant is processed, each against its own default row (as R7).
-- Historical postings are NOT reposted (ETP-5902 decision D3): documents posted before this fix
-- keep their old accounts until the tenant unposts/reposts them.
--
-- ONBOARDING_PROVISIONED_THROUGH is NOT moved: a tenant onboarded after the deploy is born with the
-- rule accounts, so this @check returns no row for it and it is recorded SKIPPED_NOT_NEEDED.
--
-- Idempotency: @check and @apply use the same column-wise predicate; after a successful run no
-- column qualifies, so a re-run is SKIPPED_NOT_NEEDED and @apply alone would update 0 rows.

-- @check
WITH rules AS (
  SELECT * FROM (
    SELECT t.c_tax_id, CASE
      WHEN t.sopotype = 'P' AND t.iswithholdingtax = 'Y' THEN '47510000'
      WHEN t.sopotype = 'S' AND t.iswithholdingtax = 'Y' THEN '47300000'
      WHEN t.sopotype = 'P' AND (t.em_obspti_isintracommunity = 'Y'
        OR t.em_obspti_isreversecharge = 'Y') AND t.rate > 0 THEN '47200000'
      WHEN t.sopotype = 'P' AND (t.em_obspti_isintracommunity = 'Y'
        OR t.em_obspti_isreversecharge = 'Y') AND t.rate < 0 THEN '47700000'
    END AS acct_value
    FROM c_tax t
    WHERE t.ad_client_id = '0' AND t.isactive = 'Y' AND t.issummary = 'N'
      AND t.parent_tax_id IS NOT NULL
  ) r WHERE r.acct_value IS NOT NULL
),
target AS (
  SELECT rt.c_tax_id, rt.acct_value, s.c_acctschema_id,
    d.t_due_acct AS default_due, d.t_credit_acct AS default_credit,
    (SELECT vc.c_validcombination_id FROM c_validcombination vc
      JOIN c_elementvalue ev ON ev.c_elementvalue_id = vc.account_id
      WHERE vc.ad_client_id = :client_id AND vc.c_acctschema_id = s.c_acctschema_id
        AND vc.isactive = 'Y' AND ev.value = rt.acct_value
      ORDER BY (vc.ad_org_id = '0' AND vc.c_bpartner_id IS NULL AND vc.m_product_id IS NULL
        AND vc.c_project_id IS NULL AND vc.c_campaign_id IS NULL AND vc.c_activity_id IS NULL
        AND vc.c_salesregion_id IS NULL AND vc.ad_orgtrx_id IS NULL
        AND vc.c_locfrom_id IS NULL AND vc.c_locto_id IS NULL
        AND vc.user1_id IS NULL AND vc.user2_id IS NULL) DESC, vc.created
      LIMIT 1) AS combination_id
  FROM rules rt
  CROSS JOIN c_acctschema s
  JOIN c_acctschema_default d ON d.c_acctschema_id = s.c_acctschema_id
  WHERE s.ad_client_id = :client_id
)
SELECT 1
FROM c_tax_acct a
JOIN target r ON r.c_tax_id = a.c_tax_id AND r.c_acctschema_id = a.c_acctschema_id
LEFT JOIN c_validcombination due_vc ON due_vc.c_validcombination_id = a.t_due_acct
LEFT JOIN c_elementvalue due_ev ON due_ev.c_elementvalue_id = due_vc.account_id
LEFT JOIN c_validcombination credit_vc ON credit_vc.c_validcombination_id = a.t_credit_acct
LEFT JOIN c_elementvalue credit_ev ON credit_ev.c_elementvalue_id = credit_vc.account_id
WHERE a.ad_client_id = :client_id
  AND r.combination_id IS NOT NULL
  AND ((a.t_due_acct = r.default_due AND due_ev.value IS DISTINCT FROM r.acct_value)
    OR (a.t_credit_acct = r.default_credit AND credit_ev.value IS DISTINCT FROM r.acct_value))
LIMIT 1;

-- @apply
WITH rules AS (
  SELECT * FROM (
    SELECT t.c_tax_id, CASE
      WHEN t.sopotype = 'P' AND t.iswithholdingtax = 'Y' THEN '47510000'
      WHEN t.sopotype = 'S' AND t.iswithholdingtax = 'Y' THEN '47300000'
      WHEN t.sopotype = 'P' AND (t.em_obspti_isintracommunity = 'Y'
        OR t.em_obspti_isreversecharge = 'Y') AND t.rate > 0 THEN '47200000'
      WHEN t.sopotype = 'P' AND (t.em_obspti_isintracommunity = 'Y'
        OR t.em_obspti_isreversecharge = 'Y') AND t.rate < 0 THEN '47700000'
    END AS acct_value
    FROM c_tax t
    WHERE t.ad_client_id = '0' AND t.isactive = 'Y' AND t.issummary = 'N'
      AND t.parent_tax_id IS NOT NULL
  ) r WHERE r.acct_value IS NOT NULL
),
target AS (
  SELECT rt.c_tax_id, rt.acct_value, s.c_acctschema_id,
    d.t_due_acct AS default_due, d.t_credit_acct AS default_credit,
    (SELECT vc.c_validcombination_id FROM c_validcombination vc
      JOIN c_elementvalue ev ON ev.c_elementvalue_id = vc.account_id
      WHERE vc.ad_client_id = :client_id AND vc.c_acctschema_id = s.c_acctschema_id
        AND vc.isactive = 'Y' AND ev.value = rt.acct_value
      ORDER BY (vc.ad_org_id = '0' AND vc.c_bpartner_id IS NULL AND vc.m_product_id IS NULL
        AND vc.c_project_id IS NULL AND vc.c_campaign_id IS NULL AND vc.c_activity_id IS NULL
        AND vc.c_salesregion_id IS NULL AND vc.ad_orgtrx_id IS NULL
        AND vc.c_locfrom_id IS NULL AND vc.c_locto_id IS NULL
        AND vc.user1_id IS NULL AND vc.user2_id IS NULL) DESC, vc.created
      LIMIT 1) AS combination_id
  FROM rules rt
  CROSS JOIN c_acctschema s
  JOIN c_acctschema_default d ON d.c_acctschema_id = s.c_acctschema_id
  WHERE s.ad_client_id = :client_id
),
cols AS (
  SELECT a.c_tax_acct_id, r.combination_id,
    (a.t_due_acct = r.default_due AND due_ev.value IS DISTINCT FROM r.acct_value) AS fix_due,
    (a.t_credit_acct = r.default_credit AND credit_ev.value IS DISTINCT FROM r.acct_value) AS fix_credit
  FROM c_tax_acct a
  JOIN target r ON r.c_tax_id = a.c_tax_id AND r.c_acctschema_id = a.c_acctschema_id
  LEFT JOIN c_validcombination due_vc ON due_vc.c_validcombination_id = a.t_due_acct
  LEFT JOIN c_elementvalue due_ev ON due_ev.c_elementvalue_id = due_vc.account_id
  LEFT JOIN c_validcombination credit_vc ON credit_vc.c_validcombination_id = a.t_credit_acct
  LEFT JOIN c_elementvalue credit_ev ON credit_ev.c_elementvalue_id = credit_vc.account_id
  WHERE a.ad_client_id = :client_id
    AND r.combination_id IS NOT NULL
)
UPDATE c_tax_acct a
SET t_due_acct = CASE WHEN c.fix_due THEN c.combination_id ELSE a.t_due_acct END,
    t_credit_acct = CASE WHEN c.fix_credit THEN c.combination_id ELSE a.t_credit_acct END,
    updated = now(),
    updatedby = '0'
FROM cols c
WHERE a.c_tax_acct_id = c.c_tax_acct_id
  AND a.ad_client_id = :client_id
  AND (c.fix_due OR c.fix_credit);

-- @report
-- The runner shows every @report row as "needs manual attention", so only the (schema, rule
-- account) groups NOT fully on target are listed: columns left alone because someone customized
-- them, and rows skipped because the schema's chart has no combination for the account. Empty on
-- a standard tenant (51/8/15/15 rule-tax rows all on target).
WITH rules AS (
  SELECT * FROM (
    SELECT t.c_tax_id, CASE
      WHEN t.sopotype = 'P' AND t.iswithholdingtax = 'Y' THEN '47510000'
      WHEN t.sopotype = 'S' AND t.iswithholdingtax = 'Y' THEN '47300000'
      WHEN t.sopotype = 'P' AND (t.em_obspti_isintracommunity = 'Y'
        OR t.em_obspti_isreversecharge = 'Y') AND t.rate > 0 THEN '47200000'
      WHEN t.sopotype = 'P' AND (t.em_obspti_isintracommunity = 'Y'
        OR t.em_obspti_isreversecharge = 'Y') AND t.rate < 0 THEN '47700000'
    END AS acct_value
    FROM c_tax t
    WHERE t.ad_client_id = '0' AND t.isactive = 'Y' AND t.issummary = 'N'
      AND t.parent_tax_id IS NOT NULL
  ) r WHERE r.acct_value IS NOT NULL
)
SELECT s.name AS schema_name, r.acct_value AS rule_account,
  count(*) FILTER (WHERE due_ev.value = r.acct_value AND credit_ev.value = r.acct_value) AS on_target,
  count(*) FILTER (WHERE (due_ev.value IS DISTINCT FROM r.acct_value AND a.t_due_acct <> d.t_due_acct)
    OR (credit_ev.value IS DISTINCT FROM r.acct_value AND a.t_credit_acct <> d.t_credit_acct))
    AS customized_left_alone,
  count(*) FILTER (WHERE NOT EXISTS (
    SELECT 1 FROM c_validcombination vc
    JOIN c_elementvalue ev ON ev.c_elementvalue_id = vc.account_id
    WHERE vc.ad_client_id = :client_id AND vc.c_acctschema_id = s.c_acctschema_id
      AND vc.isactive = 'Y' AND ev.value = r.acct_value)) AS skipped_chart_lacks_account
FROM c_tax_acct a
JOIN rules r ON r.c_tax_id = a.c_tax_id
JOIN c_acctschema s ON s.c_acctschema_id = a.c_acctschema_id
JOIN c_acctschema_default d ON d.c_acctschema_id = s.c_acctschema_id
LEFT JOIN c_validcombination due_vc ON due_vc.c_validcombination_id = a.t_due_acct
LEFT JOIN c_elementvalue due_ev ON due_ev.c_elementvalue_id = due_vc.account_id
LEFT JOIN c_validcombination credit_vc ON credit_vc.c_validcombination_id = a.t_credit_acct
LEFT JOIN c_elementvalue credit_ev ON credit_ev.c_elementvalue_id = credit_vc.account_id
WHERE a.ad_client_id = :client_id
GROUP BY s.name, r.acct_value
HAVING count(*) FILTER (WHERE due_ev.value = r.acct_value AND credit_ev.value = r.acct_value) < count(*)
ORDER BY s.name, r.acct_value;
