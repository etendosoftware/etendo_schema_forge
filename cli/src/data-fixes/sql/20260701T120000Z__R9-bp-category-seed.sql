-- @id: R9-bp-category-seed
-- @gap: ETP-4402
-- @risk: low
-- @type: sql
-- @description: Rename the "Consumidor Final" default Business Partner Category (C_BP_Group) to "Cliente" in-place, add the "Acreedor" category for tenants missing it, create the "Anticipos a acreedores" account (417/4170/41700000, mirroring 407/4070/40700000), and override Acreedor's 3 suggested posting accounts on C_BP_Group_Acct (via C_ValidCombination, resolved by account VALUE)
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
--   * Anticipo de acreedores   (v_prepayment_acct)        -> resolved via account VALUE '41700000'
--
-- The 3rd account previously did not exist in the bundled chart of accounts (confirmed:
-- zero '417%' rows across every tenant checked). Per an explicit product decision this
-- fix now CREATES it: group "417"/"Anticipos a acreedores" -> "4170" -> leaf "41700000",
-- mirroring the existing "407"/"Anticipos a proveedores" -> "4070" -> "40700000" chain
-- one-for-one (same issummary/elementlevel shape; accounttype/accountsign COPIED from
-- the matching 407/4070/40700000 sibling row rather than hardcoded, so this stays correct
-- even if a tenant's chart classification ever drifts from the confirmed A/D values).
--
-- Column choice for the 3rd account -- v_prepayment_acct, NOT v_liability_services_acct:
-- v_liability_services_acct ("Vendor Service Liability" / "Pasivo de servicio del
-- proveedor") is a second LIABILITY slot for service-type vendor invoices -- unrelated to
-- an advance/anticipo. v_prepayment_acct ("Vendor Prepayment" / "Pagos por adelantado del
-- proveedor") is literally "advance payment to a vendor", the correct semantic fit for
-- "Anticipo de acreedores". Confirmed empirically: on GOClient today, C_ACCTSCHEMA_DEFAULT
-- defaults v_prepayment_acct to a generic "Proveedores (euros) a largo plazo" (40001000)
-- for every C_BP_Group -- NOT an advances/anticipo account -- so overriding it for
-- "Acreedor" to point at 41700000 is a deliberate, meaningful correction, not a no-op.
--
-- Load-bearing element only -- NOT both C_Element trees:
-- GOClient carries the 407/4070/40700000 chain under BOTH of its two C_Element rows
-- ("Arbol de cuentas GO" BB9B64C5B6534A40A36F7C0F45C2CC0B and "GOOrg Account Tree"
-- 91D04C02EF8F4975B9E4F5E07543B6EA), but only "Arbol de cuentas GO" is wired to any
-- C_AcctSchema (via C_AcctSchema_Element.elementtype='AC') and only it carries ANY
-- issummary='N' postable leaf on the live DB (91D04...'s 1132 rows are 100% summary --
-- confirmed 0 leaves -- it is a legacy/orphan element, not load-bearing for posting).
-- This fix therefore creates the new chain ONLY under the element(s) actually resolved
-- via C_AcctSchema_Element (elementtype='AC') for the tenant's own accounting schema(s)
-- -- generic per tenant, never a hardcoded GOClient element id -- rather than blindly
-- duplicating into a second element that would never produce a valid, postable
-- C_ValidCombination anyway.
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
-- 3. C_ELEMENTVALUE has NO parent_id column -- the chart hierarchy lives ENTIRELY in
--    AD_TREENODE (ad_tree_id, node_id, parent_id), never on the C_ELEMENTVALUE row itself.
--    INSERT INTO c_elementvalue fires the STANDARD core trigger c_elementvalue_trg()
--    (Compiere/Openbravo native), which on every INSERT (a) creates the
--    C_ElementValue_Trl row(s) for every active language, and (b) when the new row is
--    elementlevel='S' (a postable leaf, never 'C'/'D' summary levels), auto-creates ONE
--    C_VALIDCOMBINATION row per C_AcctSchema wired to that C_ELEMENT_ID via
--    C_AcctSchema_Element -- the exact same "trigger does it, don't insert it by hand"
--    pattern as point 2 above (c_bp_group_trg), just for C_ELEMENTVALUE. It ALSO
--    auto-inserts ONE AD_TREENODE row, but always attached to the tree's ROOT node
--    (the row with parent_id IS NULL) -- not to the semantically correct parent -- so
--    step 2b below corrects the parent afterward with a guarded UPDATE, mirroring
--    exactly where the sibling 407/4070/40700000 nodes already sit.
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
-- IS DISTINCT FROM check, so re-running after success is a no-op. New 417/4170/41700000
-- chain: each INSERT is guarded by NOT EXISTS on (c_element_id, value) -- the same
-- UNIQUE constraint the table itself enforces -- so re-running never re-inserts (and
-- never re-fires the element trigger) once the row exists for that element. The treenode
-- reparent UPDATEs are guarded by IS DISTINCT FROM, so a re-run after success is a no-op;
-- if the new element was never created for a tenant (e.g. no matching 407 sibling to
-- inherit a parent from) the reparent joins find nothing and silently no-op too. Every
-- statement is scoped to :client_id (both @check and @apply). PKs minted with get_uuid()
-- / @uuid_<KEY>@.

-- @check
-- Needs the fix when the tenant is missing "Cliente" or "Acreedor" as a C_BP_Group, OR is
-- missing the "417" ("Anticipos a acreedores") account under its own AC-dimension element,
-- OR has "Acreedor" but its C_BP_Group_Acct row (for any of its accounting schemas) does
-- not yet carry the resolvable creditor / unbilled-receipts / advance-payment accounts.
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
      FROM c_acctschema s
      JOIN c_acctschema_element ae ON ae.c_acctschema_id = s.c_acctschema_id AND ae.elementtype = 'AC'
      JOIN c_elementvalue src407 ON src407.c_element_id = ae.c_element_id AND src407.value = '407'
      WHERE s.ad_client_id = :client_id
        AND NOT EXISTS (
          SELECT 1 FROM c_elementvalue x
          WHERE x.c_element_id = ae.c_element_id AND x.value = '41700000'
        )
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
      LEFT JOIN c_elementvalue pre_ev ON pre_ev.ad_client_id = :client_id AND pre_ev.value = '41700000'
      LEFT JOIN c_validcombination pre_vc ON pre_vc.account_id = pre_ev.c_elementvalue_id
                                          AND pre_vc.c_acctschema_id = s.c_acctschema_id
      WHERE g.ad_client_id = :client_id AND g.value = 'Acreedor'
        AND EXISTS (
          SELECT 1 FROM c_bp_group_acct a
          WHERE a.c_bp_group_id = g.c_bp_group_id
            AND a.c_acctschema_id = s.c_acctschema_id
            AND (a.v_liability_acct IS DISTINCT FROM liab_vc.c_validcombination_id
                 OR a.notinvoicedreceipts_acct IS DISTINCT FROM unb_vc.c_validcombination_id
                 OR (pre_vc.c_validcombination_id IS NOT NULL
                     AND a.v_prepayment_acct IS DISTINCT FROM pre_vc.c_validcombination_id))
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

-- Step 2b: create the "417" / "4170" / "41700000" chain ("Anticipos a acreedores"),
-- mirroring "407" / "4070" / "40700000" ("Anticipos a proveedores") one-for-one, under
-- ONLY the C_Element actually wired to this tenant's accounting schema(s) via
-- C_AcctSchema_Element (elementtype='AC') -- never a hardcoded GOClient element id, and
-- never the second (non-load-bearing) element a tenant may also carry (see the
-- Background note above). accounttype/accountsign are COPIED from the matching sibling
-- row (src407/src4070/src40700000), not hardcoded, so this tracks the tenant's own
-- classification even if it ever differs from the confirmed A/D values. Each element is
-- resolved with ORDER BY ... LIMIT 1 (same "exactly one schema/element per tenant"
-- assumption OnboardingAccountingWiringService.resolveImportedLedger already makes) so a
-- pathological multi-schema tenant cannot fan out into two rows sharing one
-- @uuid_<KEY>@-minted id. INSERT INTO c_elementvalue fires the standard core trigger
-- (see schema note 3 above): elementlevel='S' on the 41700000 leaf auto-creates its
-- C_VALIDCOMBINATION row(s) -- no manual INSERT into C_VALIDCOMBINATION needed, mirroring
-- how c_bp_group_trg() already covers C_BP_Group_Acct in step 2. Each INSERT is
-- independently guarded by NOT EXISTS on (c_element_id, value), so a re-run is a no-op.
INSERT INTO c_elementvalue (
  c_elementvalue_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby,
  value, name, description, accounttype, accountsign, isdoccontrolled, c_element_id,
  issummary, postactual, postbudget, postencumbrance, poststatistical, isbankaccount,
  isforeigncurrency, showelement, showvaluecond, elementlevel, isalwaysshown
)
SELECT '@uuid_54E130C1B4ED4627B6C07AD9E6926D30@', :client_id, src407.ad_org_id, 'Y', now(), '0', now(), '0',
  '417', 'Anticipos a acreedores', 'Anticipos a acreedores',
  src407.accounttype, src407.accountsign, 'N', ae.c_element_id,
  'Y', 'Y', 'Y', 'Y', 'Y', 'N', 'N', 'Y', 'A', 'C', 'N'
FROM c_acctschema s
JOIN c_acctschema_element ae ON ae.c_acctschema_id = s.c_acctschema_id AND ae.elementtype = 'AC'
JOIN c_elementvalue src407 ON src407.c_element_id = ae.c_element_id AND src407.value = '407'
WHERE s.ad_client_id = :client_id
  AND NOT EXISTS (SELECT 1 FROM c_elementvalue x WHERE x.c_element_id = ae.c_element_id AND x.value = '417')
ORDER BY ae.c_element_id
LIMIT 1;

INSERT INTO c_elementvalue (
  c_elementvalue_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby,
  value, name, description, accounttype, accountsign, isdoccontrolled, c_element_id,
  issummary, postactual, postbudget, postencumbrance, poststatistical, isbankaccount,
  isforeigncurrency, showelement, showvaluecond, elementlevel, isalwaysshown
)
SELECT '@uuid_D7DF35659457482E8E622D47ADE78C7A@', :client_id, src4070.ad_org_id, 'Y', now(), '0', now(), '0',
  '4170', 'Anticipos a acreedores', 'Anticipos a acreedores',
  src4070.accounttype, src4070.accountsign, 'N', ae.c_element_id,
  'Y', 'Y', 'Y', 'Y', 'Y', 'N', 'N', 'Y', 'A', 'D', 'N'
FROM c_acctschema s
JOIN c_acctschema_element ae ON ae.c_acctschema_id = s.c_acctschema_id AND ae.elementtype = 'AC'
JOIN c_elementvalue src4070 ON src4070.c_element_id = ae.c_element_id AND src4070.value = '4070'
WHERE s.ad_client_id = :client_id
  AND NOT EXISTS (SELECT 1 FROM c_elementvalue x WHERE x.c_element_id = ae.c_element_id AND x.value = '4170')
ORDER BY ae.c_element_id
LIMIT 1;

INSERT INTO c_elementvalue (
  c_elementvalue_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby,
  value, name, description, accounttype, accountsign, isdoccontrolled, c_element_id,
  issummary, postactual, postbudget, postencumbrance, poststatistical, isbankaccount,
  isforeigncurrency, showelement, showvaluecond, elementlevel, isalwaysshown
)
SELECT '@uuid_658051E6D118451496E6AD3A8B20F948@', :client_id, src40700000.ad_org_id, 'Y', now(), '0', now(), '0',
  '41700000', 'Anticipos a acreedores', 'Anticipos a acreedores',
  src40700000.accounttype, src40700000.accountsign, 'N', ae.c_element_id,
  'N', 'Y', 'Y', 'Y', 'Y', 'N', 'N', 'Y', 'A', 'S', 'N'
FROM c_acctschema s
JOIN c_acctschema_element ae ON ae.c_acctschema_id = s.c_acctschema_id AND ae.elementtype = 'AC'
JOIN c_elementvalue src40700000 ON src40700000.c_element_id = ae.c_element_id AND src40700000.value = '40700000'
WHERE s.ad_client_id = :client_id
  AND NOT EXISTS (SELECT 1 FROM c_elementvalue x WHERE x.c_element_id = ae.c_element_id AND x.value = '41700000')
ORDER BY ae.c_element_id
LIMIT 1;

-- Step 2c: re-parent the 3 AD_TREENODE rows the trigger just attached to the tree ROOT
-- (see schema note 3), mirroring exactly where the sibling 407/4070/40700000 nodes sit:
-- 417 -> 407's own parent; 4170 -> 417; 41700000 -> 4170. Each UPDATE is guarded by
-- IS DISTINCT FROM, so a re-run after success is a no-op; if 417/4170/41700000 were never
-- created for this tenant (step 2b found no matching 407/4070/40700000 sibling) the joins
-- find no rows and these silently no-op too.
UPDATE ad_treenode tn
SET parent_id = parent407.parent_id, updated = now(), updatedby = '0'
FROM c_elementvalue ev417, c_elementvalue ev407, ad_treenode parent407
WHERE tn.node_id = ev417.c_elementvalue_id
  AND ev417.ad_client_id = :client_id AND ev417.value = '417'
  AND ev407.ad_client_id = :client_id AND ev407.value = '407' AND ev407.c_element_id = ev417.c_element_id
  AND parent407.node_id = ev407.c_elementvalue_id AND parent407.ad_tree_id = tn.ad_tree_id
  AND tn.parent_id IS DISTINCT FROM parent407.parent_id;

UPDATE ad_treenode tn
SET parent_id = ev417.c_elementvalue_id, updated = now(), updatedby = '0'
FROM c_elementvalue ev4170, c_elementvalue ev417
WHERE tn.node_id = ev4170.c_elementvalue_id
  AND ev4170.ad_client_id = :client_id AND ev4170.value = '4170'
  AND ev417.ad_client_id = :client_id AND ev417.value = '417' AND ev417.c_element_id = ev4170.c_element_id
  AND tn.parent_id IS DISTINCT FROM ev417.c_elementvalue_id;

UPDATE ad_treenode tn
SET parent_id = ev4170.c_elementvalue_id, updated = now(), updatedby = '0'
FROM c_elementvalue ev41700000, c_elementvalue ev4170
WHERE tn.node_id = ev41700000.c_elementvalue_id
  AND ev41700000.ad_client_id = :client_id AND ev41700000.value = '41700000'
  AND ev4170.ad_client_id = :client_id AND ev4170.value = '4170' AND ev4170.c_element_id = ev41700000.c_element_id
  AND tn.parent_id IS DISTINCT FROM ev4170.c_elementvalue_id;

-- Step 3: override the Acreedor C_BP_Group_Acct row's 3 resolvable ticket accounts.
-- Handles BOTH: (a) the row the trigger just created in step 2 above (new tenant on this
-- fix's first run), and (b) any pre-existing Acreedor row from an earlier partial
-- provisioning (self-healing, idempotent). Only touches rows that differ from the target
-- (IS DISTINCT FROM guard), so a re-run is a no-op. The 41700000 join is INNER (not LEFT):
-- if step 2b could not create the account for this tenant (no 407 sibling to mirror), this
-- whole UPDATE no-ops rather than partially overriding only 2 of the 3 accounts -- matches
-- the pre-existing defensive "no-op when either account code is missing" behavior for the
-- first two accounts. writeoff_acct is intentionally left as whatever the trigger set it
-- to (copied from C_AcctSchema_Default) -- it is not one of the ticket's 3 named accounts.
UPDATE c_bp_group_acct a
SET v_liability_acct = liab_vc.c_validcombination_id,
    notinvoicedreceipts_acct = unb_vc.c_validcombination_id,
    v_prepayment_acct = pre_vc.c_validcombination_id
FROM c_bp_group g
JOIN c_acctschema s ON s.ad_client_id = :client_id
JOIN c_elementvalue liab_ev ON liab_ev.ad_client_id = :client_id AND liab_ev.value = '41000000'
JOIN c_validcombination liab_vc ON liab_vc.account_id = liab_ev.c_elementvalue_id
                                AND liab_vc.c_acctschema_id = s.c_acctschema_id
JOIN c_elementvalue unb_ev ON unb_ev.ad_client_id = :client_id AND unb_ev.value = '41090000'
JOIN c_validcombination unb_vc ON unb_vc.account_id = unb_ev.c_elementvalue_id
                               AND unb_vc.c_acctschema_id = s.c_acctschema_id
JOIN c_elementvalue pre_ev ON pre_ev.ad_client_id = :client_id AND pre_ev.value = '41700000'
JOIN c_validcombination pre_vc ON pre_vc.account_id = pre_ev.c_elementvalue_id
                               AND pre_vc.c_acctschema_id = s.c_acctschema_id
WHERE a.c_bp_group_id = g.c_bp_group_id
  AND a.c_acctschema_id = s.c_acctschema_id
  AND g.ad_client_id = :client_id AND g.value = 'Acreedor'
  AND (a.v_liability_acct IS DISTINCT FROM liab_vc.c_validcombination_id
       OR a.notinvoicedreceipts_acct IS DISTINCT FROM unb_vc.c_validcombination_id
       OR a.v_prepayment_acct IS DISTINCT FROM pre_vc.c_validcombination_id);
