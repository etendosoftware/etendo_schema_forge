-- @id: R9-bp-category-seed
-- @gap: ETP-4402
-- @risk: low
-- @type: sql
-- @description: Rename the "Consumidor Final" default Business Partner Category (C_BP_Group) to "Cliente" in-place, add the "Acreedor" category for tenants missing it, and override Acreedor's 2 resolvable suggested posting accounts on C_BP_Group_Acct (via C_ValidCombination, resolved by account VALUE)
--
-- Background
-- ----------
-- ETP-4402 requires every tenant to have exactly 3 default BP Categories out of the
-- box: Cliente, Proveedor, Acreedor. "Proveedor" already ships via the GOClient
-- onboarding dataset (C_BP_GROUP is in INCLUDED_TABLES in OnboardingDatasetDefinition).
--
-- "Cliente" is NOT a new row: per an explicit product decision, we rename the existing
-- "Consumidor Final" row to "Cliente" IN PLACE (same C_BP_GROUP_ID) rather than adding a
-- separate category. No code anywhere hardcodes the literal string "Consumidor Final"
-- (confirmed via repo-wide grep across both this repo and com.etendoerp.go), so this is
-- safe. Because only VALUE/NAME/ISDEFAULT change -- not the primary key -- every
-- Business Partner already pointing at this row's C_BP_GROUP_ID keeps its FK unchanged
-- and is automatically relabeled "Cliente" with no separate BP-side update needed (8 BPs
-- on GOClient at the time of writing). A fallback INSERT handles tenants that never had
-- a "Consumidor Final" row to rename (e.g. a differently-templated tenant).
--
-- "Acreedor" is genuinely new (preventive twin: the C_BP_GROUP row added to
-- referencedata/sampledata/GOClient/C_BP_GROUP.xml -- applied out-of-repo since
-- com.etendoerp.go is outside this worktree's scope; see the sibling
-- `feat/bp-category-preventive` branch in that repo for the exact patch, which also
-- guards OnboardingDefaultCustomerService.resolveBusinessPartnerGroup to prefer
-- ISDEFAULT='Y' -- required once "Acreedor"/"Cliente" exist, since alphabetical order
-- would otherwise pick "Acreedor" over the intended default).
--
-- Acreedor also needs a C_BP_Group_Acct row with 3 suggested accounts:
--   * Cuenta acreedor          (v_liability_acct)         -> resolved via account VALUE '41000000'
--   * Recibos no facturados    (notinvoicedreceipts_acct) -> resolved via account VALUE '41090000'
--   * Anticipo de acreedores   -> NOT WIRED. PGC group 417 ("Anticipos de acreedores")
--     has NO account in the bundled chart of accounts today (confirmed: zero '417%' rows
--     across every tenant checked). This is a genuine chart-of-accounts gap, not a
--     code-length mismatch -- per the never-fabricate-a-combination-id rule, this fix
--     leaves it unset rather than inventing one. Needs a follow-up decision: either add
--     account 41700000 to the bundled chart (a real A1-adjacent change) or accept 2/3
--     accounts until then. v_prepayment_acct is left as whatever the standard AD trigger
--     below sets it to, for the same reason (it is the natural column for a creditor
--     advance and this fix does not attempt to override it).
--
-- IMPORTANT schema notes (correct two earlier misreadings from investigation)
-- ------------------------------------------------------------------------------
-- 1. C_BP_Group_Acct.*_acct columns (v_liability_acct, notinvoicedreceipts_acct,
--    writeoff_acct, ...) are FKs to C_VALIDCOMBINATION, NOT directly to C_ElementValue
--    (confirmed via pg_constraint: e.g. c_bp_group_acct_v_liability_ac ->
--    c_validcombination(c_validcombination_id)). Joining those columns straight against
--    c_elementvalue_id always resolves to NULL -- that is NOT dangling/corrupted data,
--    it is simply the wrong join target. The correct path is
--    c_bp_group_acct.v_liability_acct -> c_validcombination.c_validcombination_id ->
--    c_validcombination.account_id -> c_elementvalue.c_elementvalue_id.
-- 2. INSERT INTO c_bp_group fires the STANDARD core AD trigger c_bp_group_trg()
--    (C_BP_Group_Trg.sql, Compiere/Openbravo native), which auto-creates a complete
--    C_BP_Group_Acct row per applicable C_AcctSchema by copying C_AcctSchema_Default --
--    the exact same defaulting behavior R1 step 11 / OnboardingAccountingWiringService's
--    BP_GROUP_ACCT_SQL replicate manually for other groups. Because the trigger already
--    ran (in the same transaction, immediately after step 1/2's insert) by the time this
--    fix's own steps run, there is deliberately no manual INSERT into C_BP_Group_Acct
--    here -- only an UPDATE that overrides the 2 ticket-specific accounts on the row the
--    trigger already created. This also means C_AcctSchema_Default is NOT the dangling
--    table it first appeared to be; the earlier find was an artifact of the same wrong
--    join described in point 1.
--
-- Idempotency
-- -----------
-- C_BP_Group rename: the UPDATE's WHERE clause matches only rows still literally named
-- 'Consumidor Final', so a re-run after a successful rename is a no-op (the row is now
-- 'Cliente' and no longer matches). The fallback INSERT is guarded by NOT EXISTS on
-- (ad_client_id, 'Cliente'), matching the UNIQUE(value, ad_org_id, ad_client_id)
-- constraint, so it never double-inserts. C_BP_Group (Acreedor): same NOT EXISTS guard
-- keyed on (ad_client_id, value) -- so re-running never re-inserts (and never re-fires
-- the trigger) once the group exists. C_BP_Group_Acct: the UPDATE is guarded by an
-- IS DISTINCT FROM check, so re-running after success is a no-op. Every statement is
-- scoped to :client_id (both @check and @apply). PKs minted with get_uuid() /
-- @uuid_<KEY>@.

-- @check
-- Needs the fix when the tenant is missing "Cliente" or "Acreedor" as a C_BP_Group,
-- OR has "Acreedor" but its C_BP_Group_Acct row (for any of its accounting schemas) does
-- not yet carry the resolvable creditor / unbilled-receipts accounts.
SELECT 1
FROM ad_client c
WHERE c.ad_client_id = :client_id
  AND (
    NOT EXISTS (
      SELECT 1 FROM c_bp_group g
      WHERE g.ad_client_id = :client_id AND g.value = 'Cliente'
    )
    OR NOT EXISTS (
      SELECT 1 FROM c_bp_group g
      WHERE g.ad_client_id = :client_id AND g.value = 'Acreedor'
    )
    OR EXISTS (
      SELECT 1
      FROM c_bp_group g
      JOIN c_acctschema s ON s.ad_client_id = :client_id
      JOIN c_elementvalue liab_ev ON liab_ev.ad_client_id = :client_id AND liab_ev.value = '41000000'
      JOIN c_validcombination liab_vc ON liab_vc.account_id = liab_ev.c_elementvalue_id
                                      AND liab_vc.c_acctschema_id = s.c_acctschema_id
      JOIN c_elementvalue unb_ev ON unb_ev.ad_client_id = :client_id AND unb_ev.value = '41090000'
      JOIN c_validcombination unb_vc ON unb_vc.account_id = unb_ev.c_elementvalue_id
                                     AND unb_vc.c_acctschema_id = s.c_acctschema_id
      WHERE g.ad_client_id = :client_id AND g.value = 'Acreedor'
        AND EXISTS (
          SELECT 1 FROM c_bp_group_acct a
          WHERE a.c_bp_group_id = g.c_bp_group_id
            AND a.c_acctschema_id = s.c_acctschema_id
            AND (a.v_liability_acct IS DISTINCT FROM liab_vc.c_validcombination_id
                 OR a.notinvoicedreceipts_acct IS DISTINCT FROM unb_vc.c_validcombination_id)
        )
    )
  )
LIMIT 1;

-- @apply

-- Step 1a: rename "Consumidor Final" -> "Cliente" IN PLACE (same C_BP_GROUP_ID). Every
-- BP already pointing at this row keeps its FK unchanged and is relabeled automatically
-- -- no separate BP-side update needed. isdefault -> 'Y' makes explicit what was already
-- the implicit default before "Acreedor"/"Cliente" existed to compete with it
-- alphabetically (paired with the ISDEFAULT-first guard added to
-- OnboardingDefaultCustomerService.resolveBusinessPartnerGroup in the sibling
-- com.etendoerp.go patch).
UPDATE c_bp_group
SET value = 'Cliente', name = 'Cliente', isdefault = 'Y', updated = now(), updatedby = '0'
WHERE ad_client_id = :client_id
  AND value = 'Consumidor Final';

-- Step 1b: fallback insert for a tenant that never had a "Consumidor Final" row to
-- rename (e.g. provisioned from a different template) -- only fires if step 1a found
-- nothing to rename AND no "Cliente" row exists yet.
INSERT INTO c_bp_group (
  c_bp_group_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby,
  value, name, isdefault
)
SELECT '@uuid_8F58A78000BE4ADD86F7B8CB962396A4@', :client_id, '0', 'Y', now(), '0', now(), '0',
  'Cliente', 'Cliente', 'Y'
WHERE NOT EXISTS (
  SELECT 1 FROM c_bp_group g WHERE g.ad_client_id = :client_id AND g.value = 'Cliente'
);

-- Step 2: insert "Acreedor" if this tenant does not already have it (by value). Fires the
-- same trigger, creating a C_BP_Group_Acct row from C_AcctSchema_Default; step 3 below
-- then overrides its 2 ticket-specific accounts.
INSERT INTO c_bp_group (
  c_bp_group_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby,
  value, name, isdefault
)
SELECT '@uuid_8CF296C2DDE94B0FB22C80D9AE92806A@', :client_id, '0', 'Y', now(), '0', now(), '0',
  'Acreedor', 'Acreedor', 'N'
WHERE NOT EXISTS (
  SELECT 1 FROM c_bp_group g WHERE g.ad_client_id = :client_id AND g.value = 'Acreedor'
);

-- Step 3: override the Acreedor C_BP_Group_Acct row's 2 resolvable ticket accounts.
-- Handles BOTH: (a) the row the trigger just created in step 2 above (new tenant on this
-- fix's first run), and (b) any pre-existing Acreedor row from an earlier partial
-- provisioning (self-healing, idempotent). Only touches rows that differ from the target
-- (IS DISTINCT FROM guard), so a re-run is a no-op. writeoff_acct and v_prepayment_acct
-- are intentionally left as whatever the trigger set them to (copied from
-- C_AcctSchema_Default) -- neither is one of the ticket's 3 named accounts.
UPDATE c_bp_group_acct a
SET v_liability_acct = liab_vc.c_validcombination_id,
    notinvoicedreceipts_acct = unb_vc.c_validcombination_id
FROM c_bp_group g
JOIN c_acctschema s ON s.ad_client_id = :client_id
JOIN c_elementvalue liab_ev ON liab_ev.ad_client_id = :client_id AND liab_ev.value = '41000000'
JOIN c_validcombination liab_vc ON liab_vc.account_id = liab_ev.c_elementvalue_id
                                AND liab_vc.c_acctschema_id = s.c_acctschema_id
JOIN c_elementvalue unb_ev ON unb_ev.ad_client_id = :client_id AND unb_ev.value = '41090000'
JOIN c_validcombination unb_vc ON unb_vc.account_id = unb_ev.c_elementvalue_id
                               AND unb_vc.c_acctschema_id = s.c_acctschema_id
WHERE a.c_bp_group_id = g.c_bp_group_id
  AND a.c_acctschema_id = s.c_acctschema_id
  AND g.ad_client_id = :client_id AND g.value = 'Acreedor'
  AND (a.v_liability_acct IS DISTINCT FROM liab_vc.c_validcombination_id
       OR a.notinvoicedreceipts_acct IS DISTINCT FROM unb_vc.c_validcombination_id);
