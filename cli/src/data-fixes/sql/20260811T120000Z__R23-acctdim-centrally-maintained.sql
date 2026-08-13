-- @id: R23-acctdim-centrally-maintained
-- @gap: K1
-- @risk: low
-- @type: sql
-- @description: Flip AD_Client.Acctdim_Centrally_Maintained to 'N' (flat per-dimension visibility) for every client born 'Y' by InitialSetupUtility, backfilling C_AcctSchema_Element.IsActive from the client's current effective per-dimension config first so no client gains/loses accounting-dimension field visibility at the moment of the flip.

-- ETP-4854 — new gap-label series K (accounting-dimension display-configuration mechanism).
--
-- MECHANISM (confirmed by reading classic Etendo core, not assumed):
--   `AD_Client.Acctdim_Centrally_Maintained` selects which of TWO mechanisms
--   `DimensionDisplayUtility.computeAccountingDimensionDisplayLogic()` embeds into every
--   `@ACCT_DIMENSION_DISPLAY@` field's display-logic JS
--   (src/org/openbravo/erpCommon/utility/DimensionDisplayUtility.java):
--     'N' -> flat, level-agnostic: `context.$Element_<type> === 'Y'`. That session var is set
--            ONLY for elementtypes with an ACTIVE `C_AcctSchema_Element` row on the org's own
--            ledger (LoginUtils.java ~L296-L340, query = Attribute_data.xsql#selectAcctSchema:
--            `... JOIN C_AcctSchema_Element ae ... WHERE ae.ISACTIVE = 'Y'`). This is the SQL
--            schema default (every `C_AcctSchema_Element.isactive` defaults to 'Y') and the
--            ONLY mechanism `GeneralLedgerConfigurationHandler.applyDimensionChanges`
--            (com.etendoerp.go) writes to — confirmed by reading the handler: it loads/saves
--            `AcctSchemaElement.IsActive` exclusively, nothing on `AD_Client`.
--     'Y' -> fine-grained per-document-type/level matrix:
--            `context.$Element_<type>_<DOCBASETYPE>_<H|L|BD>`, sourced from
--            `AD_Client.<Dim>_Acctdim_IsEnable/Header/Lines/Breakdown` (the "old" flat default)
--            or, if present, a per-doctype `ADClientAcctDimension` row — computed by
--            `DimensionDisplayUtility.getAccountingDimensionConfiguration()`. Etendo GO never
--            built a UI for `ADClientAcctDimension` (the "Dimensiones contables" screen is a
--            flat ON/OFF list, only meaningful under 'N') and its own headless engine
--            (`NeoDisplayLogicHelper.resolveAccountingDimensionFlags`, com.etendoerp.go) mirrors
--            this exact branch, including a documented ETP-4529 caveat that the 'N' branch is
--            the one it can evaluate reliably per-request (no HTTP session to piggyback on).
--   `InitialSetupUtility.java` (~L159, invoked by `InitialClientSetup`, which the live onboarding
--   chain calls from `EtendoGoJwtServlet.resolveOrCreateClient`) hardcodes
--   `newClient.setAcctdimCentrallyMaintained(true)` for EVERY new client — so every tenant born
--   through the real onboarding flow ends up 'Y', permanently locked out of the ONLY mechanism
--   Etendo GO has a working screen for.
--
-- SAFETY (confirmed, not assumed): grepped every Java/XML consumer of this flag repo-wide.
-- Classic core: only `DimensionDisplayUtility`/`LoginUtils`/`InitialSetupUtility`. Etendo GO:
-- only `NeoDisplayLogicHelper` (a faithful mirror of the classic logic — no divergent behavior
-- to protect). No security/accounting-posting/compliance code path reads this flag; it governs
-- ONLY whether an accounting-dimension INPUT FIELD is shown or hidden on a form.
--
-- LIVE-DB EVIDENCE (2026-08-11, this DB): 14/17 clients (all real tenants except GOClient, QA
-- Testing, System) are 'Y'. Critically, `C_AcctSchema_Element.isactive` is ALREADY 'Y' for
-- CostCenter/User1/User2/Project on almost every one of those 14 'Y' clients, even though EVERY
-- one of them has `<Dim>_Acctdim_IsEnable = 'N'` for CostCenter/User1/User2 (and 'N' for Project
-- on 12 of 14 -- only "CentralMaintainedEmpresa" and "F&B International Group" have
-- Project_Acctdim_IsEnable='Y'). A naive flip to 'N' WITHOUT backfilling would therefore
-- SUDDENLY SHOW CostCenter/User1/User2/Project fields that are currently hidden for nearly
-- every tenant -- a real visibility regression, not a theoretical one. Org/BPartner/Product are
-- the opposite case: IsEnable='Y' + Header and/or Lines='Y' on every 'Y' client, matching their
-- already-'Y' `isactive`, so those three are a no-op.
--
-- BACKFILL RULE: since flat 'N' mode has no level distinction (one flag governs Header, Lines
-- AND Breakdown simultaneously for a dimension), the closest lossless mapping from the 3-level
-- 'Y'-mode matrix is: effective = IsEnable='Y' AND (Header='Y' OR Lines='Y' OR Breakdown='Y').
-- This "OR of levels" choice deliberately errs toward NOT hiding a field the client currently
-- sees on ANY level/doctype (showing it on an extra level too is a minor UX no-op; silently
-- hiding a field the client relies on today would be a functional regression) -- confirmed
-- against this DB: Breakdown is 'N' everywhere today for every dimension/client, so in practice
-- this collapses to IsEnable='Y' AND (Header='Y' OR Lines='Y') for the current fleet.
--
-- Both statements below run in ONE transaction (framework guarantee): the backfill and the flag
-- flip commit together or not at all, so a client is never left with the 'N' engine active and
-- stale (pre-flip) `isactive` values.

-- @check
-- Returns >=1 row when the client is still centrally-maintained ('Y'). 0 rows => already 'N'
-- (GOClient/QA Testing/System today, or any client this fix already ran for) => SKIPPED_NOT_NEEDED.
SELECT 1 FROM ad_client WHERE ad_client_id = :client_id AND acctdim_centrally_maintained = 'Y';

-- @apply
-- Step 1 — backfill C_AcctSchema_Element.IsActive (per elementtype, across every accounting
-- schema the client owns) from the client's CURRENT effective 'Y'-mode visibility, so the flip
-- in step 2 changes the MECHANISM but not the observed behavior. Guarded by IS DISTINCT FROM
-- (2nd idempotency layer): only rows that would actually change are touched.
WITH dim_effective AS (
  SELECT 'OO'::varchar(2) AS elementtype,
         (org_acctdim_isenable = 'Y'
           AND (org_acctdim_header = 'Y' OR org_acctdim_lines = 'Y' OR org_acctdim_breakdown = 'Y')) AS effective
  FROM ad_client WHERE ad_client_id = :client_id
  UNION ALL
  SELECT 'PJ',
         (project_acctdim_isenable = 'Y'
           AND (project_acctdim_header = 'Y' OR project_acctdim_lines = 'Y' OR project_acctdim_breakdown = 'Y'))
  FROM ad_client WHERE ad_client_id = :client_id
  UNION ALL
  SELECT 'BP',
         (bpartner_acctdim_isenable = 'Y'
           AND (bpartner_acctdim_header = 'Y' OR bpartner_acctdim_lines = 'Y' OR bpartner_acctdim_breakdown = 'Y'))
  FROM ad_client WHERE ad_client_id = :client_id
  UNION ALL
  SELECT 'PR',
         (product_acctdim_isenable = 'Y'
           AND (product_acctdim_header = 'Y' OR product_acctdim_lines = 'Y' OR product_acctdim_breakdown = 'Y'))
  FROM ad_client WHERE ad_client_id = :client_id
  UNION ALL
  SELECT 'CC',
         (costcenter_acctdim_isenable = 'Y'
           AND (costcenter_acctdim_header = 'Y' OR costcenter_acctdim_lines = 'Y' OR costcenter_acctdim_breakdown = 'Y'))
  FROM ad_client WHERE ad_client_id = :client_id
  UNION ALL
  SELECT 'U1',
         (user1_acctdim_isenable = 'Y'
           AND (user1_acctdim_header = 'Y' OR user1_acctdim_lines = 'Y' OR user1_acctdim_breakdown = 'Y'))
  FROM ad_client WHERE ad_client_id = :client_id
  UNION ALL
  SELECT 'U2',
         (user2_acctdim_isenable = 'Y'
           AND (user2_acctdim_header = 'Y' OR user2_acctdim_lines = 'Y' OR user2_acctdim_breakdown = 'Y'))
  FROM ad_client WHERE ad_client_id = :client_id
)
UPDATE c_acctschema_element e
SET isactive = CASE WHEN de.effective THEN 'Y' ELSE 'N' END,
    updated = now(),
    updatedby = '0'
FROM dim_effective de
WHERE e.ad_client_id = :client_id
  AND e.elementtype = de.elementtype
  AND e.isactive IS DISTINCT FROM (CASE WHEN de.effective THEN 'Y' ELSE 'N' END);

-- Step 2 — flip the client's mode flag itself. Guarded so a re-run (e.g. via --fix) after the
-- flag is already 'N' is a no-op on this statement (the @check gate already prevents this in
-- normal chained runs; the row-level guard is the defensive 2nd layer).
UPDATE ad_client
SET acctdim_centrally_maintained = 'N',
    updated = now(),
    updatedby = '0'
WHERE ad_client_id = :client_id
  AND acctdim_centrally_maintained = 'Y';
