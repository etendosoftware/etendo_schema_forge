-- @id: R35-acreedor-bp-group-acct-accounts
-- @gap: ETP-5247
-- @risk: low
-- @type: sql
-- @description: Backfill/correct the "Acreedor" C_BP_Group's 5 posting accounts on C_BP_Group_Acct (C_Receivable_Acct, C_Prepayment_Acct, WriteOff_Acct, V_Liability_Acct, V_Prepayment_Acct), resolved by account VALUE per the tenant's own chart, self-creating a missing C_ValidCombination when the account exists but has no combination yet (ETP-5247)

-- Background
-- ----------
-- ETP-5247 ("Dataset inicial -- cuentas contables incorrectas en Categoria de Contacto
-- Acreedor"): the "Acreedor" BP Category (C_BP_Group) either had NO C_BP_Group_Acct row
-- at all, or had one created by the standard c_bp_group_trg() trigger's
-- C_AcctSchema_Default copy-through (generic schema defaults, not creditor-specific
-- accounts). The 5 accounts this fix targets:
--   * Recibos de clientes                (c_receivable_acct) -> 43000000 (Clientes (euros) a corto plazo)
--   * Prepago del cliente                (c_prepayment_acct)  -> 43800000 (Anticipos de clientes)
--   * Cancelaciones                      (writeoff_acct)      -> 65000000 (Perdidas de creditos comerciales incobrables)
--   * Pasivo del proveedor               (v_liability_acct)   -> 41000000 (Acreedores por prestaciones de servicios)
--   * Pagos por adelantado del proveedor (v_prepayment_acct)  -> 41700000 (Anticipos a acreedores)
--
-- PREVENTIVE FRONT ALREADY SHIPPED (out of this repo -- com.etendoerp.go). The bundled
-- sampledata (referencedata/sampledata/GOClient/C_BP_GROUP_ACCT.xml +
-- C_VALIDCOMBINATION.xml) now carries the Acreedor row with these 5 accounts and the
-- previously missing 41700000 combination -- new tenants onboarded from that fix onward
-- are born correct. THIS fix is the corrective twin for tenants provisioned before it.
-- Confirmed via live query (2026-09-09): GOClient itself already resolves to the correct
-- 5 codes (43000000/43800000/65000000/41000000/41700000) end-to-end via C_ValidCombination
-- -- fixed by hand alongside the sampledata change -- so this fix's @check correctly
-- no-ops for it; any other tenant still carrying the stale/missing row is the real target.
-- REMINDER FOR THE COORDINATOR: verify `OnboardingBaselineService.ONBOARDING_PROVISIONED_
-- THROUGH` (com.etendoerp.go, a sibling repo not reachable from this worktree) was bumped
-- alongside that sampledata PR -- if it was not, do so before/with this fix's PR so new
-- tenants are correctly recognized as born past this gap.
--
-- SCOPE -- "Acreedor" ONLY, explicit product decision
-- -----------------------------------------------------
-- Confirmed with the requester: "Proveedor" and "Cliente" C_BP_Group rows can show the
-- exact same generic-default pattern but are OUT OF SCOPE here -- never touched by this
-- fix (a future ticket may generalize it, the way R21 generalized R17). This fix also
-- does NOT create the "Acreedor" C_BP_Group itself for a tenant missing it entirely --
-- that is R9-bp-category-seed's job; @check/@apply only ever act on a tenant that already
-- has an ACTIVE "Acreedor" row.
--
-- Account resolution -- by VALUE, never a hardcoded id (ETP-4402 / R9 precedent)
-- ---------------------------------------------------------------------------------
-- Every account is resolved dynamically per tenant: C_AcctSchema (scoped to :client_id)
-- -> C_AcctSchema_Element (elementtype='AC') -> C_ElementValue (value = target code) ->
-- C_ValidCombination (account_id + c_acctschema_id -- the all-dimensions-NULL "plain"
-- posting combination; see tenant-remediation-knowledge.md's confirmed FK chain). No
-- account/combination id from GOClient or any other tenant is ever reused across clients.
--
-- Missing C_ValidCombination (account exists, combination doesn't) -- self-created
-- ------------------------------------------------------------------------------------
-- Step A below defensively creates any missing combination for the 5 target codes,
-- mirroring c_elementvalue_trg()'s own INSERT shape verbatim (confirmed via
-- pg_get_functiondef): ALIAS/COMBINATION = the account's raw VALUE (the trigger never
-- trims trailing zeros -- the trimmed 5-digit aliases seen elsewhere on this DB come from
-- an unrelated historical reindex, not the trigger itself), ISFULLYQUALIFIED='Y', every
-- optional dimension column NULL. Guarded by NOT EXISTS on (account_id, c_acctschema_id)
-- -- the same key the trigger relies on -- so re-running never duplicates.
--
-- Missing C_BP_Group_Acct row entirely -- created only when its NOT NULL columns resolve
-- -------------------------------------------------------------------------------------------
-- v_liability_acct and writeoff_acct are NOT NULL on C_BP_Group_Acct (confirmed via
-- information_schema.columns) -- both happen to be 2 of this ticket's own 5 target codes
-- (41000000 / 65000000). Step B's INSERT therefore INNER JOINs on those two (a schema
-- missing either code in its own chart cannot get a new row created at all -- reported,
-- never forced with a placeholder value) and LEFT JOINs the other 3
-- (c_receivable_acct/c_prepayment_acct/v_prepayment_acct), which are nullable and simply
-- left NULL when unresolvable.
--
-- Missing account code entirely (chart doesn't have it) -- reported, never invented
-- --------------------------------------------------------------------------------------
-- Per explicit instruction: a code absent from a tenant's own chart is NEVER fabricated
-- and NEVER silently skipped. The @report section (read-only, same transaction, runs
-- right after @apply) lists every (schema, missing code) pair still unresolved after this
-- run -- becomes the ledger's `detail` column, so the gap is visible in Data-Fix History
-- without digging into the DB by hand.
--
-- Idempotency
-- -----------
-- @check mirrors @apply's join shape column-for-column (ETP-4743 QA precedent: check and
-- apply must stay symmetric, verified by re-querying, never assumed). Step A: NOT EXISTS
-- on (account_id, c_acctschema_id). Step B: NOT EXISTS on (c_bp_group_id, c_acctschema_id)
-- -- also the table's own UNIQUE constraint (c_bp_group_acct_schem_group_un). Step C:
-- COALESCE(resolved, current) per column, so it only ever moves a column toward the
-- correct value and never nulls out an existing one when a code can't be resolved; the
-- whole UPDATE is additionally guarded by an IS DISTINCT FROM row filter so an
-- already-correct row is left untouched (no needless updated/updatedby bump). Every
-- statement (both @check and @apply) filters by :client_id.

-- @check
-- Needs the fix when the tenant has an active "Acreedor" C_BP_Group and, for at least one
-- of its accounting schemas, either the C_BP_Group_Acct row is missing (and creatable --
-- ie. the 2 NOT NULL accounts resolve) or an existing row has at least one of the 5 target
-- columns unresolved/incorrect. 0 rows => SKIPPED_NOT_NEEDED, @apply never runs.
SELECT 1
FROM c_bp_group g
JOIN c_acctschema s ON s.ad_client_id = :client_id
JOIN c_acctschema_element ae ON ae.c_acctschema_id = s.c_acctschema_id AND ae.elementtype = 'AC'
LEFT JOIN c_elementvalue ev_recv    ON ev_recv.c_element_id = ae.c_element_id    AND ev_recv.value = '43000000'
LEFT JOIN c_validcombination vc_recv    ON vc_recv.account_id = ev_recv.c_elementvalue_id       AND vc_recv.c_acctschema_id = s.c_acctschema_id
LEFT JOIN c_elementvalue ev_prepay  ON ev_prepay.c_element_id = ae.c_element_id  AND ev_prepay.value = '43800000'
LEFT JOIN c_validcombination vc_prepay  ON vc_prepay.account_id = ev_prepay.c_elementvalue_id     AND vc_prepay.c_acctschema_id = s.c_acctschema_id
LEFT JOIN c_elementvalue ev_wo      ON ev_wo.c_element_id = ae.c_element_id      AND ev_wo.value = '65000000'
LEFT JOIN c_validcombination vc_wo      ON vc_wo.account_id = ev_wo.c_elementvalue_id         AND vc_wo.c_acctschema_id = s.c_acctschema_id
LEFT JOIN c_elementvalue ev_liab    ON ev_liab.c_element_id = ae.c_element_id    AND ev_liab.value = '41000000'
LEFT JOIN c_validcombination vc_liab    ON vc_liab.account_id = ev_liab.c_elementvalue_id       AND vc_liab.c_acctschema_id = s.c_acctschema_id
LEFT JOIN c_elementvalue ev_vprepay ON ev_vprepay.c_element_id = ae.c_element_id AND ev_vprepay.value = '41700000'
LEFT JOIN c_validcombination vc_vprepay ON vc_vprepay.account_id = ev_vprepay.c_elementvalue_id AND vc_vprepay.c_acctschema_id = s.c_acctschema_id
LEFT JOIN c_bp_group_acct a ON a.c_bp_group_id = g.c_bp_group_id AND a.c_acctschema_id = s.c_acctschema_id
WHERE g.ad_client_id = :client_id
  AND g.value = 'Acreedor'
  AND g.isactive = 'Y'
  AND (
    -- row missing entirely, but creatable (both NOT NULL accounts resolve)
    (a.c_bp_group_acct_id IS NULL AND ev_liab.c_elementvalue_id IS NOT NULL AND ev_wo.c_elementvalue_id IS NOT NULL)
    OR
    -- row exists but at least one resolvable column is missing/incorrect (combo missing
    -- counts as "needs fixing" even before Step A creates it -- @apply's own Step A does)
    (a.c_bp_group_acct_id IS NOT NULL AND (
      (ev_recv.c_elementvalue_id    IS NOT NULL AND (vc_recv.c_validcombination_id    IS NULL OR a.c_receivable_acct IS DISTINCT FROM vc_recv.c_validcombination_id))
      OR (ev_prepay.c_elementvalue_id  IS NOT NULL AND (vc_prepay.c_validcombination_id  IS NULL OR a.c_prepayment_acct  IS DISTINCT FROM vc_prepay.c_validcombination_id))
      OR (ev_wo.c_elementvalue_id      IS NOT NULL AND (vc_wo.c_validcombination_id      IS NULL OR a.writeoff_acct      IS DISTINCT FROM vc_wo.c_validcombination_id))
      OR (ev_liab.c_elementvalue_id    IS NOT NULL AND (vc_liab.c_validcombination_id    IS NULL OR a.v_liability_acct   IS DISTINCT FROM vc_liab.c_validcombination_id))
      OR (ev_vprepay.c_elementvalue_id IS NOT NULL AND (vc_vprepay.c_validcombination_id IS NULL OR a.v_prepayment_acct  IS DISTINCT FROM vc_vprepay.c_validcombination_id))
    ))
  )
LIMIT 1;

-- @apply

-- Step A: backfill any missing C_ValidCombination for the 5 target codes, on this
-- client's own accounting schema(s), mirroring c_elementvalue_trg()'s own INSERT shape
-- (ALIAS/COMBINATION = raw value, ISFULLYQUALIFIED='Y', all dimensions NULL). Only runs
-- for a client that has an active "Acreedor" group (kept minimal/tenant-scoped even
-- though @check already gates the whole @apply on that). Guarded by NOT EXISTS on
-- (account_id, c_acctschema_id) -- re-running never duplicates.
INSERT INTO c_validcombination (
  c_validcombination_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby,
  alias, combination, description, isfullyqualified, c_acctschema_id, account_id
)
SELECT get_uuid(), :client_id, ev.ad_org_id, 'Y', now(), '0', now(), '0',
  ev.value, ev.value, '', 'Y', s.c_acctschema_id, ev.c_elementvalue_id
FROM c_acctschema s
JOIN c_acctschema_element ae ON ae.c_acctschema_id = s.c_acctschema_id AND ae.elementtype = 'AC'
JOIN c_elementvalue ev ON ev.c_element_id = ae.c_element_id
  AND ev.value IN ('43000000', '43800000', '65000000', '41000000', '41700000')
WHERE s.ad_client_id = :client_id
  AND EXISTS (SELECT 1 FROM c_bp_group g WHERE g.ad_client_id = :client_id AND g.value = 'Acreedor' AND g.isactive = 'Y')
  AND NOT EXISTS (
    SELECT 1 FROM c_validcombination vc
    WHERE vc.account_id = ev.c_elementvalue_id AND vc.c_acctschema_id = s.c_acctschema_id
  );

-- Step B: insert a missing C_BP_Group_Acct row for an (Acreedor, schema) pair that has
-- none yet. INNER JOIN on v_liability_acct/writeoff_acct (NOT NULL columns -- both now
-- resolvable post Step A, whenever the codes exist in the chart); LEFT JOIN on the other
-- 3 (nullable), left NULL when their code doesn't exist in this tenant's chart. Guarded
-- by NOT EXISTS on (c_bp_group_id, c_acctschema_id) -- also the table's own UNIQUE
-- constraint -- so re-running never duplicates.
INSERT INTO c_bp_group_acct (
  c_bp_group_acct_id, c_bp_group_id, c_acctschema_id, ad_client_id, ad_org_id,
  isactive, created, createdby, updated, updatedby,
  v_liability_acct, writeoff_acct, c_receivable_acct, c_prepayment_acct, v_prepayment_acct
)
SELECT get_uuid(), g.c_bp_group_id, s.c_acctschema_id, :client_id, g.ad_org_id,
  'Y', now(), '0', now(), '0',
  vc_liab.c_validcombination_id, vc_wo.c_validcombination_id,
  vc_recv.c_validcombination_id, vc_prepay.c_validcombination_id, vc_vprepay.c_validcombination_id
FROM c_bp_group g
JOIN c_acctschema s ON s.ad_client_id = :client_id
JOIN c_acctschema_element ae ON ae.c_acctschema_id = s.c_acctschema_id AND ae.elementtype = 'AC'
JOIN c_elementvalue ev_liab ON ev_liab.c_element_id = ae.c_element_id AND ev_liab.value = '41000000'
JOIN c_validcombination vc_liab ON vc_liab.account_id = ev_liab.c_elementvalue_id AND vc_liab.c_acctschema_id = s.c_acctschema_id
JOIN c_elementvalue ev_wo ON ev_wo.c_element_id = ae.c_element_id AND ev_wo.value = '65000000'
JOIN c_validcombination vc_wo ON vc_wo.account_id = ev_wo.c_elementvalue_id AND vc_wo.c_acctschema_id = s.c_acctschema_id
LEFT JOIN c_elementvalue ev_recv ON ev_recv.c_element_id = ae.c_element_id AND ev_recv.value = '43000000'
LEFT JOIN c_validcombination vc_recv ON vc_recv.account_id = ev_recv.c_elementvalue_id AND vc_recv.c_acctschema_id = s.c_acctschema_id
LEFT JOIN c_elementvalue ev_prepay ON ev_prepay.c_element_id = ae.c_element_id AND ev_prepay.value = '43800000'
LEFT JOIN c_validcombination vc_prepay ON vc_prepay.account_id = ev_prepay.c_elementvalue_id AND vc_prepay.c_acctschema_id = s.c_acctschema_id
LEFT JOIN c_elementvalue ev_vprepay ON ev_vprepay.c_element_id = ae.c_element_id AND ev_vprepay.value = '41700000'
LEFT JOIN c_validcombination vc_vprepay ON vc_vprepay.account_id = ev_vprepay.c_elementvalue_id AND vc_vprepay.c_acctschema_id = s.c_acctschema_id
WHERE g.ad_client_id = :client_id AND g.value = 'Acreedor' AND g.isactive = 'Y'
  AND NOT EXISTS (
    SELECT 1 FROM c_bp_group_acct a
    WHERE a.c_bp_group_id = g.c_bp_group_id AND a.c_acctschema_id = s.c_acctschema_id
  );

-- Step C: correct an EXISTING row's 5 target columns. COALESCE(resolved, current) never
-- nulls out an already-populated column when a code can't be resolved for this tenant;
-- the row filter mirrors @check so an already-correct row is left untouched.
UPDATE c_bp_group_acct a
SET c_receivable_acct = COALESCE(vc_recv.c_validcombination_id, a.c_receivable_acct),
    c_prepayment_acct = COALESCE(vc_prepay.c_validcombination_id, a.c_prepayment_acct),
    writeoff_acct      = COALESCE(vc_wo.c_validcombination_id, a.writeoff_acct),
    v_liability_acct   = COALESCE(vc_liab.c_validcombination_id, a.v_liability_acct),
    v_prepayment_acct  = COALESCE(vc_vprepay.c_validcombination_id, a.v_prepayment_acct),
    updated = now(),
    updatedby = '0'
FROM c_bp_group g
JOIN c_acctschema s ON s.ad_client_id = :client_id
JOIN c_acctschema_element ae ON ae.c_acctschema_id = s.c_acctschema_id AND ae.elementtype = 'AC'
LEFT JOIN c_elementvalue ev_recv    ON ev_recv.c_element_id = ae.c_element_id    AND ev_recv.value = '43000000'
LEFT JOIN c_validcombination vc_recv    ON vc_recv.account_id = ev_recv.c_elementvalue_id       AND vc_recv.c_acctschema_id = s.c_acctschema_id
LEFT JOIN c_elementvalue ev_prepay  ON ev_prepay.c_element_id = ae.c_element_id  AND ev_prepay.value = '43800000'
LEFT JOIN c_validcombination vc_prepay  ON vc_prepay.account_id = ev_prepay.c_elementvalue_id     AND vc_prepay.c_acctschema_id = s.c_acctschema_id
LEFT JOIN c_elementvalue ev_wo      ON ev_wo.c_element_id = ae.c_element_id      AND ev_wo.value = '65000000'
LEFT JOIN c_validcombination vc_wo      ON vc_wo.account_id = ev_wo.c_elementvalue_id         AND vc_wo.c_acctschema_id = s.c_acctschema_id
LEFT JOIN c_elementvalue ev_liab    ON ev_liab.c_element_id = ae.c_element_id    AND ev_liab.value = '41000000'
LEFT JOIN c_validcombination vc_liab    ON vc_liab.account_id = ev_liab.c_elementvalue_id       AND vc_liab.c_acctschema_id = s.c_acctschema_id
LEFT JOIN c_elementvalue ev_vprepay ON ev_vprepay.c_element_id = ae.c_element_id AND ev_vprepay.value = '41700000'
LEFT JOIN c_validcombination vc_vprepay ON vc_vprepay.account_id = ev_vprepay.c_elementvalue_id AND vc_vprepay.c_acctschema_id = s.c_acctschema_id
WHERE a.c_bp_group_id = g.c_bp_group_id
  AND a.c_acctschema_id = s.c_acctschema_id
  AND g.ad_client_id = :client_id AND g.value = 'Acreedor' AND g.isactive = 'Y'
  AND (
    (ev_recv.c_elementvalue_id    IS NOT NULL AND a.c_receivable_acct IS DISTINCT FROM vc_recv.c_validcombination_id)
    OR (ev_prepay.c_elementvalue_id  IS NOT NULL AND a.c_prepayment_acct  IS DISTINCT FROM vc_prepay.c_validcombination_id)
    OR (ev_wo.c_elementvalue_id      IS NOT NULL AND a.writeoff_acct      IS DISTINCT FROM vc_wo.c_validcombination_id)
    OR (ev_liab.c_elementvalue_id    IS NOT NULL AND a.v_liability_acct   IS DISTINCT FROM vc_liab.c_validcombination_id)
    OR (ev_vprepay.c_elementvalue_id IS NOT NULL AND a.v_prepayment_acct  IS DISTINCT FROM vc_vprepay.c_validcombination_id)
  );

-- @report
-- Read-only, same transaction, runs right after @apply. Lists every (schema, target
-- account code) pair that is STILL unresolved after this run because the code genuinely
-- does not exist anywhere in this tenant's own chart -- never fabricated, always
-- surfaced. Becomes the ledger's `detail` column.
SELECT
  s.c_acctschema_id,
  missing.account_code AS missing_account_code,
  missing.account_purpose AS account_purpose
FROM c_bp_group g
JOIN c_acctschema s ON s.ad_client_id = :client_id
JOIN c_acctschema_element ae ON ae.c_acctschema_id = s.c_acctschema_id AND ae.elementtype = 'AC'
CROSS JOIN (VALUES
  ('43000000', 'C_Receivable_Acct (Recibos de clientes)'),
  ('43800000', 'C_Prepayment_Acct (Prepago del cliente)'),
  ('65000000', 'WriteOff_Acct (Cancelaciones)'),
  ('41000000', 'V_Liability_Acct (Pasivo del proveedor)'),
  ('41700000', 'V_Prepayment_Acct (Pagos por adelantado del proveedor)')
) AS missing(account_code, account_purpose)
WHERE g.ad_client_id = :client_id
  AND g.value = 'Acreedor'
  AND g.isactive = 'Y'
  AND NOT EXISTS (
    SELECT 1 FROM c_elementvalue ev
    WHERE ev.c_element_id = ae.c_element_id AND ev.value = missing.account_code
  )
ORDER BY 1, 2;
