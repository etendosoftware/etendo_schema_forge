-- @id: R7-tax-accounts
-- @gap: A2
-- @risk: low
-- @type: sql
-- @description: Create the tax-due/tax-credit posting accounts (C_TAX_ACCT) the tenant is missing, one per system tax per accounting schema, so sales/purchase invoices can be posted
--
-- Hand-built, idempotent migration. AcctServer resolves the tax-due / tax-credit
-- posting accounts of an invoice from C_TAX_ACCT and does NOT fall back to
-- C_ACCTSCHEMA_DEFAULT; without a row per tax per schema, posting fails with
-- "org.openbravo.base.exception.OBException: Account could not be found".
--
-- Tax model: taxes (C_TAX) and their categories (C_TAXCATEGORY) are now provisioned
-- at SYSTEM level (ad_client_id = '0') and shared by every tenant. The posting
-- accounts (C_TAX_ACCT) are still client-level: one row per system tax, per accounting
-- schema the tenant owns. ad_org_id is '0' (the '*' org), inherited from the system tax;
-- t_due_acct / t_credit_acct are copied from the schema's C_ACCTSCHEMA_DEFAULT row (both
-- are NOT NULL on C_TAX_ACCT and always populated in the shipped default).
--
-- Why this is a separate fix from R1-chart-of-accounts: R1 only fires when the tenant has
-- NO accounting schema at all, and it builds one specific schema. This corrective instead
-- joins the tenant's REAL c_acctschema row(s), so it covers BOTH populations with one body:
--   * tenants that just got their chart from R1 (R7 runs after R1 in the chain and sees the
--     freshly created schema), and
--   * tenants that already had a schema but were onboarded before the tax-account wiring
--     existed (R1 skips them; R7 fires on its own @check).
-- A tenant with more than one schema (e.g. a second, parallel ledger) gets the accounts for
-- every schema. Preventive twin: the TAX_ACCT_SQL statement in
-- OnboardingAccountingWiringService.provisionEntityPostingAccounts.
--
-- Idempotency: the NOT EXISTS guard keys on (c_tax_id, c_acctschema_id), so a re-run after
-- success is a no-op and a partial population (some taxes already wired) is completed without
-- duplicates. PKs are minted per row with get_uuid(). The @apply runs in ONE transaction
-- (the runner wraps BEGIN/COMMIT); on failure it rolls back.

-- @check
-- Needs the fix when the tenant owns a schema (whose default carries tax accounts) for which
-- at least one system tax has no C_TAX_ACCT row yet.
SELECT 1
FROM c_acctschema s
JOIN c_acctschema_default d ON d.c_acctschema_id = s.c_acctschema_id
JOIN c_tax t ON t.ad_client_id = '0'
WHERE s.ad_client_id = :client_id
  AND d.t_due_acct IS NOT NULL
  AND d.t_credit_acct IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM c_tax_acct a
     WHERE a.c_tax_id = t.c_tax_id
       AND a.c_acctschema_id = s.c_acctschema_id
  )
LIMIT 1;

-- @apply
-- One C_TAX_ACCT per (system tax, tenant schema) pair that is still missing. ad_org_id '0'
-- comes from the system tax; the posting accounts come from each schema's default row.
INSERT INTO c_tax_acct (
  c_tax_acct_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby,
  c_tax_id, c_acctschema_id, t_due_acct, t_credit_acct
)
SELECT
  get_uuid(), :client_id, t.ad_org_id, 'Y', now(), '0', now(), '0',
  t.c_tax_id, s.c_acctschema_id, d.t_due_acct, d.t_credit_acct
FROM c_tax t
JOIN c_acctschema s ON s.ad_client_id = :client_id
JOIN c_acctschema_default d ON d.c_acctschema_id = s.c_acctschema_id
WHERE t.ad_client_id = '0'
  AND d.t_due_acct IS NOT NULL
  AND d.t_credit_acct IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM c_tax_acct a
     WHERE a.c_tax_id = t.c_tax_id
       AND a.c_acctschema_id = s.c_acctschema_id
  );
