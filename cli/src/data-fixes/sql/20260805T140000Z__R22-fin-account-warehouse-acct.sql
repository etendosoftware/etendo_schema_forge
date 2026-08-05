-- @id: R22-fin-account-warehouse-acct
-- @gap: A2c
-- @risk: low
-- @type: sql
-- @description: Backfill FIN_Financial_Account_Acct and M_Warehouse_Acct for already-onboarded tenants whose financial accounts/warehouses were bulk-imported with triggers disabled and never got their per-schema posting-account rows (ETP-4743, follow-up to ETP-4565)

-- ETP-4743 (follow-up to ETP-4565): during ETP-4565's auto-creation investigation it was
-- found that FIN_FINANCIAL_ACCOUNT and M_WAREHOUSE are bulk-imported by the onboarding
-- dataset importer with DB triggers disabled (see OnboardingDatasetDefinition.INCLUDED_TABLES),
-- so Classic's own fin_financial_account_trg / m_warehouse_trg AFTER-INSERT triggers --
-- which otherwise auto-provision FIN_Financial_Account_Acct / M_Warehouse_Acct for every
-- LIVE creation of these entities -- never fire for the bundled template rows ("Caja",
-- "Cuenta de Banco", "Almacen GO", "Almacén Secundario", etc). Unlike the sibling entities
-- (BP group/customer/vendor, product category, product, tax -- all provisioned by
-- OnboardingAccountingWiringService#provisionEntityPostingAccounts via runEntityAcctInsert),
-- nobody backfilled these two tables for tenants that were ALREADY onboarded before
-- ETP-4565 shipped its preventive fix (FIN_FINANCIAL_ACCOUNT_ACCT_SQL / WAREHOUSE_ACCT_SQL,
-- both already merged into the live onboarding chain -- this ticket is corrective-only).
--
-- Column mapping mirrors OnboardingAccountingWiringService's two statements one-for-one:
--   FIN_FINANCIAL_ACCOUNT_ACCT_SQL -- the asset account resolves to CB_Asset_Acct for
--     cash-type accounts (type='C') and B_Asset_Acct for every other type, and that same
--     resolved value is reused for fin_deposit_acct/fin_withdrawal_acct/fin_out_clear_acct/
--     fin_in_clear_acct, exactly as Classic's fin_financial_account_trg does
--     (fin_debit_acct/fin_credit_acct are left NULL, also matching the trigger).
--   WAREHOUSE_ACCT_SQL -- w_inventory_acct/w_differences_acct/w_revaluation_acct/
--     w_invactualadjust_acct copied straight from the schema's C_ACCTSCHEMA_DEFAULT row,
--     matching m_warehouse_trg.
--
-- Unlike the Java preventive fix (which runs once, right after the dataset import, against
-- the single ledger just created for a brand-new tenant), this corrective fix must cover
-- EVERY accounting schema an already-onboarded tenant owns (some tenants run more than one
-- ledger) -- so both statements join c_acctschema s ON s.ad_client_id = :client_id rather
-- than assuming a single schema, mirroring the same generalization R7-tax-accounts already
-- applies to TAX_ACCT_SQL for the identical reason.
--
-- Live-DB evidence (2026-08-05): every real tenant on this DB except GOClient itself has at
-- least one (financial account x schema) or (warehouse x schema) pair missing its *_Acct
-- row -- e.g. acreedortest 2/2 financial accounts x 2/2 warehouses missing. GOClient itself
-- already has 0 missing pairs (its rows were wired separately at some point), so its @check
-- naturally returns 0 rows -- no special-casing needed, the guard just self-excludes an
-- already-correct tenant.
--
-- PREREQUISITE GAP DISCOVERED DURING QA (2026-08-05, Sentinel): F&B International Group
-- (ad_client_id 23C59575B9CF467C9620760EB255B389) owns 26 c_acctschema rows, but 24 of them
-- have NO c_acctschema_default row at all (all isactive='Y'). Before this fix's @check was
-- corrected below to join c_acctschema_default (matching @apply's own INNER JOIN), it counted
-- ALL 343 (financial-account x schema) pairs across all 26 schemas as "needing the fix", but
-- @apply's INNER JOIN could only ever insert the 7 pairs whose schema actually has a
-- c_acctschema_default row -- the other 336 pairs are blocked by a DIFFERENT, upstream gap
-- (schemas provisioned without their C_ACCTSCHEMA_DEFAULT row) that this fix does not attempt
-- to close. @check now only counts genuinely-fixable pairs, so a real run converges to
-- SKIPPED_NOT_NEEDED once those are applied, instead of perpetually re-matching the 336
-- pairs it can never fix. The 336 blocked pairs remain a real, undocumented prerequisite gap
-- for F&B International Group -- flagged in docs/etendo-ad/onboarding-gaps.md as a follow-up,
-- out of scope for ETP-4743 (which is about the *_Acct backfill, not schema-default
-- completeness; A3/A3b already cover schema-default population for the GOClient-family charts,
-- but never swept every tenant's every schema).
--
-- Idempotency: NOT EXISTS keyed on the same UNIQUE constraints the tables themselves
-- enforce (fin_finacc_acct_acctschema_un on (fin_financial_account_id, c_acctschema_id);
-- m_warehouse_acct_warehouse__un on (m_warehouse_id, c_acctschema_id)), so a re-run after
-- success or a partial population (some pairs already wired) is a no-op / completes without
-- duplicates. PKs minted per row with get_uuid(). w_differences_acct is NOT NULL on
-- m_warehouse_acct -- defensively guarded with IS NOT NULL even though every schema on this
-- DB already has it populated, so the fix degrades to a safe no-op rather than an error if a
-- future tenant's schema default is ever incomplete.

-- @check
-- Needs the fix when the tenant has at least one financial account or warehouse missing its
-- per-schema *_Acct row on ANY of its accounting schemas. 0 rows => SKIPPED_NOT_NEEDED,
-- @apply never runs.
--
-- The financial-account branch below joins c_acctschema_default the same way @apply's INSERT
-- does (INNER JOIN, no IS NOT NULL guard needed -- unlike warehouse, no target column on
-- fin_financial_account_acct is NOT NULL). This join is NOT optional bookkeeping: a schema
-- with no c_acctschema_default row at all cannot be fixed by @apply (its INNER JOIN drops that
-- schema's pairs silently), so @check must not count them as "needing the fix" either -- doing
-- so would report a phantom gap that @apply can never close, making the fix falsely appear
-- non-convergent (re-run always shows @check > 0 rows) instead of applying and reporting
-- SKIPPED_NOT_NEEDED once every genuinely-fixable pair is done. See the header note below for
-- the live prerequisite-gap counts this surfaced on this DB.
SELECT 1
FROM fin_financial_account f
JOIN c_acctschema s ON s.ad_client_id = f.ad_client_id
JOIN c_acctschema_default d ON d.c_acctschema_id = s.c_acctschema_id
WHERE f.ad_client_id = :client_id
  AND NOT EXISTS (
    SELECT 1 FROM fin_financial_account_acct a
    WHERE a.fin_financial_account_id = f.fin_financial_account_id
      AND a.c_acctschema_id = s.c_acctschema_id
  )
UNION ALL
SELECT 1
FROM m_warehouse w
JOIN c_acctschema s ON s.ad_client_id = w.ad_client_id
JOIN c_acctschema_default d ON d.c_acctschema_id = s.c_acctschema_id
WHERE w.ad_client_id = :client_id
  AND d.w_differences_acct IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM m_warehouse_acct a
    WHERE a.m_warehouse_id = w.m_warehouse_id
      AND a.c_acctschema_id = s.c_acctschema_id
  )
LIMIT 1;

-- @apply
-- One FIN_Financial_Account_Acct per (financial account, tenant schema) pair still missing.
-- Column mapping and asset-account CASE logic mirror FIN_FINANCIAL_ACCOUNT_ACCT_SQL exactly.
INSERT INTO fin_financial_account_acct (
  fin_financial_account_acct_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, fin_financial_account_id, c_acctschema_id,
  fin_deposit_acct, fin_withdrawal_acct, fin_out_clear_acct, fin_in_clear_acct,
  fin_bankfee_acct, fin_bankrevaluationgain_acct, fin_bankrevaluationloss_acct,
  fin_out_intransit_acct, fin_in_intransit_acct
)
SELECT
  get_uuid(), :client_id, f.ad_org_id, 'Y', now(), '0', now(), '0',
  f.fin_financial_account_id, s.c_acctschema_id,
  CASE WHEN f.type = 'C' THEN d.cb_asset_acct ELSE d.b_asset_acct END,
  CASE WHEN f.type = 'C' THEN d.cb_asset_acct ELSE d.b_asset_acct END,
  CASE WHEN f.type = 'C' THEN d.cb_asset_acct ELSE d.b_asset_acct END,
  CASE WHEN f.type = 'C' THEN d.cb_asset_acct ELSE d.b_asset_acct END,
  d.b_expense_acct, d.b_revaluationgain_acct, d.b_revaluationloss_acct,
  d.b_intransit_acct, d.b_intransit_acct
FROM fin_financial_account f
JOIN c_acctschema s ON s.ad_client_id = f.ad_client_id
JOIN c_acctschema_default d ON d.c_acctschema_id = s.c_acctschema_id
WHERE f.ad_client_id = :client_id
  AND NOT EXISTS (
    SELECT 1 FROM fin_financial_account_acct a
    WHERE a.fin_financial_account_id = f.fin_financial_account_id
      AND a.c_acctschema_id = s.c_acctschema_id
  );

-- One M_Warehouse_Acct per (warehouse, tenant schema) pair still missing. Column mapping
-- mirrors WAREHOUSE_ACCT_SQL exactly.
INSERT INTO m_warehouse_acct (
  m_warehouse_acct_id, ad_client_id, ad_org_id, isactive, created, createdby, updated,
  updatedby, m_warehouse_id, c_acctschema_id,
  w_inventory_acct, w_differences_acct, w_revaluation_acct, w_invactualadjust_acct
)
SELECT
  get_uuid(), :client_id, w.ad_org_id, 'Y', now(), '0', now(), '0',
  w.m_warehouse_id, s.c_acctschema_id,
  d.w_inventory_acct, d.w_differences_acct, d.w_revaluation_acct, d.w_invactualadjust_acct
FROM m_warehouse w
JOIN c_acctschema s ON s.ad_client_id = w.ad_client_id
JOIN c_acctschema_default d ON d.c_acctschema_id = s.c_acctschema_id
WHERE w.ad_client_id = :client_id
  AND d.w_differences_acct IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM m_warehouse_acct a
    WHERE a.m_warehouse_id = w.m_warehouse_id
      AND a.c_acctschema_id = s.c_acctschema_id
  );
