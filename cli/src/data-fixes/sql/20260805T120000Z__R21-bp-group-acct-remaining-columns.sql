-- @id: R21-bp-group-acct-remaining-columns
-- @gap: A2b
-- @risk: low
-- @type: sql
-- @description: Generalize R17 to the other 11 C_BP_Group_Acct.*_acct columns left NULL by the insert-only NOT EXISTS guard on stale/incomplete rows (ETP-4720)

-- ETP-4720 generalizes ETP-4706/R17 (which backfilled only NotInvoicedReceipts_Acct)
-- to the other 11 C_BP_Group_Acct.*_acct columns that can go stale the exact same
-- way: NotInvoicedRevenue_Acct, NotInvoicedReceivables_Acct, UnEarnedRevenue_Acct,
-- PayDiscount_Exp_Acct, PayDiscount_Rev_Acct, WriteOff_Rev_Acct,
-- V_Liability_Services_Acct, DoubtfulDebt_Acct, BadDebtExpense_Acct,
-- BadDebtRevenue_Acct, AllowanceForDoubtful_Acct.
-- NotInvoicedReceipts_Acct itself is explicitly OUT of scope here -- R17 already
-- owns it; this fix never touches it.
--
-- SCOPE (per ETP-4706's own finding, reused here): do NOT filter by group
-- name/apparent role (Cliente/Proveedor/Acreedor). A single C_BPartner has only
-- ONE C_BP_Group, so a group that "looks like" a customer group can still be
-- exercised by a purchase-side posting for a BP that is both vendor and
-- customer. Scoped only by :client_id + "column still NULL, default now
-- available" -- self-heals any tenant/any group regardless of naming.
--
-- ROOT CAUSE (same failure class as R17, confirmed by reading both live
-- provisioning paths -- see tenant-remediation-knowledge.md "ETP-4720" section
-- for the full trace):
--   * The core Postgres trigger c_bp_group_trg() (C_BP_Group_Trg.sql,
--     Compiere/Openbravo-native, unmodified core code) fires on every
--     C_BP_Group INSERT and copies C_AcctSchema_Default onto a NEW
--     C_BP_Group_Acct row -- but its own INSERT column list (verified via
--     pg_get_functiondef) OMITS WriteOff_Rev_Acct, DoubtfulDebt_Acct,
--     BadDebtExpense_Acct, BadDebtRevenue_Acct and AllowanceForDoubtful_Acct
--     entirely. It DOES include the other 6 of these 11
--     (NotInvoicedRevenue_Acct, NotInvoicedReceivables_Acct,
--     UnEarnedRevenue_Acct, PayDiscount_Exp_Acct, PayDiscount_Rev_Acct,
--     V_Liability_Services_Acct).
--   * OnboardingAccountingWiringService.BP_GROUP_ACCT_SQL (the Java fallback,
--     guarded by NOT EXISTS at the ROW level, only runs when the trigger did
--     NOT already create the row) DOES include WriteOff_Rev_Acct but ALSO
--     omits the same 4 doubtful/bad-debt/allowance columns.
--   * Because C_BP_GROUP is always inserted before this Java statement runs,
--     the trigger fires first and creates the row; the Java statement's own
--     NOT EXISTS guard then finds the row already present and never runs. So
--     whichever path "wins" in practice, the resulting row is missing the
--     SAME 4 columns (DoubtfulDebt/BadDebtExpense/BadDebtRevenue/
--     AllowanceForDoubtful) for EVERY tenant, past and present.
--
-- LIVE-DB CONFIRMATION (2026-08-05, all 12 tenants on this DB): DoubtfulDebt_Acct
-- / BadDebtExpense_Acct / BadDebtRevenue_Acct / AllowanceForDoubtful_Acct are
-- NULL on EVERY C_BP_Group_Acct row of EVERY tenant whose C_AcctSchema_Default
-- already HAS them populated (via R11) -- including "Empresa E2E d5be89a8"
-- (client 2D54A79B1B2649218C5FED9307B84DC9), onboarded 2026-07-29, just 6 days
-- before this fix was authored, via the CURRENT onboarding code. This was a
-- LIVE, ONGOING preventive gap, not legacy drift only -- flagged to the
-- coordinator per the ticket's explicit instruction, who then folded closing
-- it into this same ticket (ETP-4720) rather than a separate one.
--
-- BOTH FRONTS ARE NOW CLOSED. The preventive fix ships alongside this
-- corrective one: OnboardingAccountingWiringService#patchBpGroupAcctMissingColumns
-- (com.etendoerp.go) -- a COALESCE-guarded UPDATE covering the SAME 5 columns
-- the trigger/Java fallback omit (WriteOff_Rev_Acct plus the 4 doubtful/bad-debt/
-- allowance columns above -- NOT all 11 this file's own @apply covers), wired
-- as the new LAST provisioning step in EtendoGoJwtServlet.ensureOnboardingDataset,
-- right before the data-fix baseline is stamped. ONBOARDING_PROVISIONED_THROUGH
-- (OnboardingBaselineService) is bumped to THIS fix's own timestamp,
-- 2026-08-05T12:00:00Z, so a tenant onboarded from this point on is born with
-- these 5 columns already populated and the runner skips this fix for them via
-- the watermark; this .sql remains the corrective repair, for these 5 columns,
-- for every tenant onboarded before that cutoff. (The other 6 of the 11
-- columns this file covers have no preventive counterpart at all -- see the
-- paragraphs below for why.)
--
-- 6 of the remaining columns (NotInvoicedRevenue_Acct, NotInvoicedReceivables_Acct,
-- UnEarnedRevenue_Acct, PayDiscount_Exp_Acct, PayDiscount_Rev_Acct,
-- V_Liability_Services_Acct) are currently NULL on C_AcctSchema_Default ITSELF,
-- fleet-wide on EVERY schema on this DB (an R11-adjacent gap, out of this
-- ticket's scope -- R11 only completed 6 of the Defaults-tab columns, not
-- these). This fix's @check naturally excludes them today (nothing to
-- source), and will self-heal automatically, tenant by tenant, the day
-- C_AcctSchema_Default gets these columns populated by a future fix, with
-- zero further change needed here.
--
-- WriteOff_Rev_Acct is the ONE EXCEPTION to the above, confirmed by directly
-- querying C_AcctSchema_Default (not assumed): NULL on 13 of the 14 schemas on
-- this DB, but ALREADY POPULATED on "F&B International Group"'s schema
-- (732913485BB040FFA4643FF06D1AA095) since 2026-07-08 -- predating this fix.
-- So this column's @check/@apply is NOT a pure no-op today the way the other
-- 6 columns' is: the first time this fix runs for F&B International Group, it
-- WILL backfill writeoff_rev_acct on that tenant's 2 C_BP_Group_Acct rows that
-- still have it NULL ("Cliente" and "Acreedor"); every other tenant still
-- sees a no-op for this column until its own schema default is populated.
--
-- PER-PARTNER OVERRIDE CHECK (explicitly required): queried
-- information_schema.columns for c_bp_vendor_acct/c_bp_customer_acct. Of these
-- 11 columns, only V_Liability_Services_Acct has a matching per-partner
-- override column, on C_BP_Vendor_Acct (c_bp_customer_acct has NEITHER of the
-- 11 -- it only carries C_Receivable_Acct/C_PrePayment_Acct). This fix only
-- ever writes C_BP_GROUP_ACCT (the group-level fallback), never
-- C_BP_Vendor_Acct/C_BP_Customer_Acct, so a pre-existing per-partner override
-- is unaffected either way -- OnboardingAccountingWiringService's own
-- BP_GROUP_ACCT_SQL fills the group-level row unconditionally at row-creation
-- time regardless of whether any per-partner override exists, so following
-- that same precedent here needs no extra guard beyond "column still NULL,
-- default now available" -- identical to every other column in this fix and
-- to R17.

-- @check
-- Returns >=1 row when at least one of the 11 target columns is NULL on a
-- C_BP_Group_Acct row while the accounting schema has a value to source it
-- from. 0 rows => SKIPPED_NOT_NEEDED, @apply never runs.
SELECT 1
FROM c_bp_group_acct a
JOIN c_bp_group g ON g.c_bp_group_id = a.c_bp_group_id
JOIN c_acctschema_default d ON d.c_acctschema_id = a.c_acctschema_id
WHERE g.ad_client_id = :client_id
  AND (
    (a.notinvoicedrevenue_acct     IS NULL AND d.notinvoicedrevenue_acct     IS NOT NULL) OR
    (a.notinvoicedreceivables_acct IS NULL AND d.notinvoicedreceivables_acct IS NOT NULL) OR
    (a.unearnedrevenue_acct        IS NULL AND d.unearnedrevenue_acct        IS NOT NULL) OR
    (a.paydiscount_exp_acct        IS NULL AND d.paydiscount_exp_acct        IS NOT NULL) OR
    (a.paydiscount_rev_acct        IS NULL AND d.paydiscount_rev_acct        IS NOT NULL) OR
    (a.writeoff_rev_acct           IS NULL AND d.writeoff_rev_acct           IS NOT NULL) OR
    (a.v_liability_services_acct   IS NULL AND d.v_liability_services_acct   IS NOT NULL) OR
    (a.doubtfuldebt_acct           IS NULL AND d.doubtfuldebt_acct           IS NOT NULL) OR
    (a.baddebtexpense_acct         IS NULL AND d.baddebtexpense_acct         IS NOT NULL) OR
    (a.baddebtrevenue_acct         IS NULL AND d.baddebtrevenue_acct         IS NOT NULL) OR
    (a.allowancefordoubtful_acct   IS NULL AND d.allowancefordoubtful_acct   IS NOT NULL)
  )
LIMIT 1;

-- @apply
-- COALESCE(a.col, d.col) is the per-column defensive guard (2nd idempotency
-- layer): it only ever fills a NULL, it never overwrites an existing value.
-- The row-level WHERE mirrors @check so a row with nothing left to fix is not
-- touched at all (no needless updated/updatedby bump).
UPDATE c_bp_group_acct a
SET notinvoicedrevenue_acct     = COALESCE(a.notinvoicedrevenue_acct,     d.notinvoicedrevenue_acct),
    notinvoicedreceivables_acct = COALESCE(a.notinvoicedreceivables_acct, d.notinvoicedreceivables_acct),
    unearnedrevenue_acct        = COALESCE(a.unearnedrevenue_acct,        d.unearnedrevenue_acct),
    paydiscount_exp_acct        = COALESCE(a.paydiscount_exp_acct,        d.paydiscount_exp_acct),
    paydiscount_rev_acct        = COALESCE(a.paydiscount_rev_acct,        d.paydiscount_rev_acct),
    writeoff_rev_acct           = COALESCE(a.writeoff_rev_acct,           d.writeoff_rev_acct),
    v_liability_services_acct   = COALESCE(a.v_liability_services_acct,   d.v_liability_services_acct),
    doubtfuldebt_acct           = COALESCE(a.doubtfuldebt_acct,           d.doubtfuldebt_acct),
    baddebtexpense_acct         = COALESCE(a.baddebtexpense_acct,         d.baddebtexpense_acct),
    baddebtrevenue_acct         = COALESCE(a.baddebtrevenue_acct,         d.baddebtrevenue_acct),
    allowancefordoubtful_acct   = COALESCE(a.allowancefordoubtful_acct,   d.allowancefordoubtful_acct),
    updated = now(),
    updatedby = '0'
FROM c_bp_group g, c_acctschema_default d
WHERE a.c_bp_group_id = g.c_bp_group_id
  AND a.c_acctschema_id = d.c_acctschema_id
  AND g.ad_client_id = :client_id
  AND (
    (a.notinvoicedrevenue_acct     IS NULL AND d.notinvoicedrevenue_acct     IS NOT NULL) OR
    (a.notinvoicedreceivables_acct IS NULL AND d.notinvoicedreceivables_acct IS NOT NULL) OR
    (a.unearnedrevenue_acct        IS NULL AND d.unearnedrevenue_acct        IS NOT NULL) OR
    (a.paydiscount_exp_acct        IS NULL AND d.paydiscount_exp_acct        IS NOT NULL) OR
    (a.paydiscount_rev_acct        IS NULL AND d.paydiscount_rev_acct        IS NOT NULL) OR
    (a.writeoff_rev_acct           IS NULL AND d.writeoff_rev_acct           IS NOT NULL) OR
    (a.v_liability_services_acct   IS NULL AND d.v_liability_services_acct   IS NOT NULL) OR
    (a.doubtfuldebt_acct           IS NULL AND d.doubtfuldebt_acct           IS NOT NULL) OR
    (a.baddebtexpense_acct         IS NULL AND d.baddebtexpense_acct         IS NOT NULL) OR
    (a.baddebtrevenue_acct         IS NULL AND d.baddebtrevenue_acct         IS NOT NULL) OR
    (a.allowancefordoubtful_acct   IS NULL AND d.allowancefordoubtful_acct   IS NOT NULL)
  );
