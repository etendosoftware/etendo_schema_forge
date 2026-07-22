-- @id: R14-asset-group-generic-consolidation
-- @gap: A6
-- @risk: medium
-- @type: sql
-- @description: Ensure a fully-formed A_Asset_Group named "Genérico" exists (canonical
--   amortization defaults + wired to the PGC 28200000/68200000 depreciation accounts),
--   sanitize any pre-existing malformed "Genérico", and reassign every existing A_Asset
--   row to it, regardless of its current group (e.g. "Otros") — ETP-4539
--
-- Background
-- --------------------------------------------------------------------------------------------
-- The Assets window ("assets") groups every asset under an A_Asset_Group reference table.
-- Product decision: consolidate all existing assets under one generic group named
-- "Genérico", wired for depreciation accounting to:
--   - A_ACCUMDEPRECIATION_ACCT ("Amortización acumulada") = 28200000, "Amortización
--     acumulada de las inversiones inmobiliarias"
--   - A_DEPRECIATION_ACCT ("Amortización")                = 68200000, "Amortización de
--     las inversiones inmobiliarias"
-- ISDEPRECIATED stays 'N' (unchecked), matching every already-correct tenant observed live.
--
-- Canonical column values — source of truth is the onboarding sampledata XML
-- --------------------------------------------------------------------------------------------
-- The exact "Genérico" row shape is defined by the module's onboarding dataset, NOT invented
-- here: `com.etendoerp.go/referencedata/sampledata/GOClient/A_ASSET_GROUP.xml` (verified
-- 2026-07-20). It sets, besides name/isowned/isdepreciated:
--   AMORTIZATIONTYPE='LI'  (Linear), AMORTIZATIONCALCTYPE='PE' (Percentage),
--   ASSETSCHEDULE='MO' (Monthly), IS30DAYMONTH='Y', ISOWNED='Y', ISDEPRECIATED='N'.
-- These same values are confirmed live on every correctly-wired "Genérico" across the fleet
-- (24 tenants). BUG FIXED IN THIS REVISION: the earlier INSERT set only name/description/
-- isowned/isdepreciated and OMITTED amortizationtype/amortizationcalctype/assetschedule —
-- three columns that have NO DB default and are ONCREATEDEFAULT (defaulted by the app layer,
-- not the DB), so a plain-SQL INSERT left them NULL, producing a malformed group. The INSERT
-- (Step 1) now replicates the full canonical row, and a new sanitizing UPDATE (Step 2) repairs
-- any "Genérico" already created NULL by that earlier revision (observed live: tenant
-- "Ivan Test", accented "Genérico" created 2026-07-20 15:59). IS30DAYMONTH is NOT NULL with a
-- DB default of 'Y', so it is never left NULL and needs no sanitizing — Step 1 still sets it
-- explicitly for clarity.
--
-- DB facts confirmed before writing this fix (session of 2026-07-20)
-- --------------------------------------------------------------------------------------------
-- 1. Real tables/columns (never assumed): A_Asset_Group (name, isdepreciated, ad_org_id — a
--    real operative org, NOT '0', on every existing row) and A_Asset (a_asset_group_id FK).
--    The accounting sub-tab is A_Asset_Group_Acct (one row per (a_asset_group_id,
--    c_acctschema_id), columns A_DEPRECIATION_ACCT / A_ACCUMDEPRECIATION_ACCT / A_DISPOSAL_LOSS
--    / A_DISPOSAL_GAIN), all 4 FKs pointing to C_VALIDCOMBINATION — never directly to
--    C_ElementValue (same indirection documented for C_BP_Group_Acct / C_AcctSchema_Default).
-- 2. A_Asset_Group has a STANDARD core trigger, a_asset_group_trg(), that on INSERT loops
--    every C_AcctSchema_Default row applicable to the new group's org (via AD_Org_AcctSchema
--    + AD_IsOrgIncluded) and auto-INSERTs a matching A_Asset_Group_Acct row copying that
--    schema's A_DEPRECIATION_ACCT / A_ACCUMDEPRECIATION_ACCT / A_DISPOSAL_LOSS /
--    A_DISPOSAL_GAIN defaults — the exact same "trigger does the defaulting" pattern already
--    documented for c_bp_group_trg() and c_elementvalue_trg(). A sibling trigger,
--    a_asset_group_trg2() (BEFORE DELETE), removes the A_Asset_Group_Acct rows on group
--    deletion — irrelevant here (this fix never deletes a group).
-- 3. Verified live: on every tenant that already has a correctly-wired "Genérico" group
--    (24 of 30 non-System clients), C_AcctSchema_Default.a_depreciation_acct /
--    a_accumdepreciation_acct ALREADY resolve to 68200000 / 28200000 — so the trigger's
--    default copy already lands on the right accounts for this chart family. Step 1's
--    explicit override UPDATE is still included defensively (belt-and-suspenders, mirroring
--    the R9/R12 "trigger creates the row from schema defaults, then an UPDATE pins the
--    ticket-specific accounts" convention) in case a future tenant's C_AcctSchema_Default
--    ever diverges from 282/682 for this group.
--
-- Scope — self-limiting via @check, no client allowlist needed
-- --------------------------------------------------------------------------------------------
-- Only tenants provisioned from the GOClient-style Spanish PGC chart can have a resolvable
-- dimensionless C_VALIDCOMBINATION for BOTH 28200000 and 68200000 on at least one of their own
-- C_AcctSchema rows. Confirmed live: F&B International Group has 7 assets not pointing at
-- "Genérico" but NO 28200000/68200000 leaf on any of its 4 acctschemas (it runs an unrelated
-- US-style chart) — Step 1's @check naturally excludes it (same EXISTS-guard pattern as
-- R12/R13), so F&B is NOT remediated by this fix. Empresa Test / QA Testing / Test Company
-- also lack both accounts AND have zero non-Genérico assets today, so they are excluded too
-- and nothing is lost. DEFERRED BUSINESS DECISION (explicitly deferred by the product owner,
-- not silently dropped): F&B's 7 assets remain on "Others"/"Otros"/"Vehicles"/"Vehiculos".
-- Consolidating a chart that lacks 282/682 requires a business decision on which accounts
-- stand in for 282/682 on that chart family — that decision is PENDING, so this fix
-- deliberately leaves the current behavior untouched (F&B excluded) and adds NO logic to
-- consolidate charts without 282/682. Out of scope for this generic PGC-chart fix until the
-- business decides.
--
-- Also confirmed live: two tenants have BOTH accounts resolvable but no "Genérico" group yet
-- (Ivan Test, Ivan Test 2) — real candidates for Step 1's INSERT. NOTE: "Ivan Test" already
-- has an unaccented "Generico" group (legacy, different literal name) — per the exact name
-- "Genérico" requested by the product owner, this fix creates the ACCENTED row alongside it
-- rather than reusing/renaming the legacy one; flagged here so a future reader isn't surprised
-- by two near-identical groups on that tenant.
--
-- Preventive front — NOT included in this ticket (flag for follow-up)
-- --------------------------------------------------------------------------------------------
-- Searched every onboarding sampledata XML (`referencedata/sampledata/GOClient/` and
-- `com.etendoerp.go`'s own resources) for A_ASSET_GROUP.xml: GOClient's onboarding dataset does
-- NOT ship one at all (only F&B International Group's legacy sampledata does, unrelated to
-- onboarding). So the 24 tenants that already have a correct "Genérico" group got it from an
-- earlier out-of-band/manual pass, not from the live onboarding path — a BRAND NEW tenant
-- onboarded today is born WITHOUT "Genérico". This is a genuine, currently-open preventive gap
-- (no ONBOARDING_PROVISIONED_THROUGH bump is included here because no preventive fix ships in
-- this PR) — recommended follow-up: add A_ASSET_GROUP.xml (+ A_ASSET_GROUP_ACCT.xml) to the
-- GOClient onboarding dataset, or a small Onboarding*Service, so new tenants are born with it.
--
-- Idempotency
-- --------------------------------------------------------------------------------------------
-- Five independently-guarded statements, chained in one transaction (order matters: 1 creates
-- the group in the SAME apply that 2 sanitizes its amortization columns, 3 corrects its
-- accounting, 4 reassigns assets to it, and 5 deletes the now-empty legacy groups):
--   1. INSERT "Genérico" (full canonical row) — guarded by NOT EXISTS (already there) AND
--      EXISTS both accounts.
--   2. UPDATE the group's amortization columns (amortizationtype/amortizationcalctype/
--      assetschedule) — guarded on any of them being NULL, so a correct group is a no-op and
--      a group left NULL by the earlier buggy revision is repaired.
--   3. UPDATE A_Asset_Group_Acct accounts for "Genérico" — guarded by the row not already
--      pointing at the 282/682 combinations, scoped per the tenant's own schema(s).
--   4. UPDATE A_Asset.a_asset_group_id — guarded by a resolvable "Genérico" id for the tenant
--      AND the asset not already pointing at it.
--   5. DELETE the legacy "Vehiculos"/"Otros" groups — guarded so a group is removed ONLY when
--      nothing references it (no A_Asset and no M_Product_Category), see below.
-- Re-running after success: statement 1 finds the group already present (no-op), statement 2
-- finds the amortization columns already set (no-op), statement 3 finds the accounts already
-- correct (no-op), statement 4 finds every asset already reassigned (no-op), statement 5 finds
-- the legacy groups already deleted (no-op) — @check returns 0 rows.
--
-- Step 5 — delete the now-unused legacy groups ("Vehiculos", "Otros")
-- --------------------------------------------------------------------------------------------
-- Product decision: once every asset is consolidated under "Genérico" (Step 4), the two legacy
-- groups the assets used to live in — literally named "Vehiculos" and "Otros" (confirmed from
-- the pre-consolidation A_ASSET_GROUP.xml) — are dead weight and must be removed.
--   * Matched by NAME, never by id. The XML's A_ASSET_GROUP_IDs (465220689C8743CB8EED836CC98FFC55
--     "Vehiculos", C77E2F5FD65F48278A6DCE67760F08FD "Otros") are GOClient-SPECIFIC — every tenant
--     has its own ids for the same names, so the fix keys off `name IN ('Vehiculos','Otros')`
--     scoped by :client_id. The XML only confirms WHICH two names to target.
--   * MUST run AFTER Step 4. A_Asset has an FK to A_Asset_Group; deleting a group that still owns
--     assets would raise an FK violation and abort the whole transaction (halting the tenant's
--     chain). Consolidating first (Step 4) empties these groups so the delete is safe.
--   * Double NOT EXISTS guard (the safety net, and what keeps F&B untouched). A_Asset_Group is
--     referenced by THREE FKs: A_Asset, A_Asset_Group_Acct (auto-deleted by the BEFORE-DELETE
--     trigger a_asset_group_trg2, so it never blocks) and M_Product_Category. The DELETE fires
--     ONLY when NO A_Asset and NO M_Product_Category point at the group. Consequence: F&B
--     International Group — excluded from Steps 1–4 because it lacks 282/682, so its assets stay
--     on their "Otros"/"Vehiculos" groups — has non-empty legacy groups, the guard finds them
--     referenced, and leaves them alone. No FK violation, no halted chain.
--   * Idempotent: after a successful run the groups are gone, so a re-run deletes 0 rows and the
--     @check's Step-5 branch (a deletable "Vehiculos"/"Otros" with zero references) is false.
--
-- Known limitation (not resolved here): tenant "Ivan Test" carries BOTH an unaccented legacy
-- "Generico" group (correct values, created out-of-band) AND this fix's accented "Genérico".
-- The exact-name match means this fix operates only on the accented row; deduplicating the two
-- near-identical groups is left for a separate, explicit decision.

-- @check
SELECT 1
WHERE
  -- Step 1 would fire: Genérico missing AND both accounts resolvable on some schema
  EXISTS (
    SELECT 1
    FROM ad_client c
    WHERE c.ad_client_id = :client_id
      AND NOT EXISTS (SELECT 1 FROM a_asset_group g WHERE g.ad_client_id = c.ad_client_id AND g.name = 'Genérico')
      AND EXISTS (
        SELECT 1 FROM c_acctschema s
        WHERE s.ad_client_id = c.ad_client_id
          AND EXISTS (
            SELECT 1 FROM c_validcombination vc JOIN c_elementvalue ev ON ev.c_elementvalue_id = vc.account_id
            WHERE vc.c_acctschema_id = s.c_acctschema_id AND ev.value = '28200000'
              AND vc.m_product_id IS NULL AND vc.c_bpartner_id IS NULL AND vc.c_project_id IS NULL
              AND vc.c_campaign_id IS NULL AND vc.c_activity_id IS NULL AND vc.ad_orgtrx_id IS NULL
              AND vc.c_locfrom_id IS NULL AND vc.c_locto_id IS NULL AND vc.c_salesregion_id IS NULL
              AND vc.user1_id IS NULL AND vc.user2_id IS NULL
          )
          AND EXISTS (
            SELECT 1 FROM c_validcombination vc JOIN c_elementvalue ev ON ev.c_elementvalue_id = vc.account_id
            WHERE vc.c_acctschema_id = s.c_acctschema_id AND ev.value = '68200000'
              AND vc.m_product_id IS NULL AND vc.c_bpartner_id IS NULL AND vc.c_project_id IS NULL
              AND vc.c_campaign_id IS NULL AND vc.c_activity_id IS NULL AND vc.ad_orgtrx_id IS NULL
              AND vc.c_locfrom_id IS NULL AND vc.c_locto_id IS NULL AND vc.c_salesregion_id IS NULL
              AND vc.user1_id IS NULL AND vc.user2_id IS NULL
          )
      )
  )
  OR
  -- Step 2 would fire: an existing "Genérico" is malformed — one or more of its
  -- ONCREATEDEFAULT amortization columns (amortizationtype / amortizationcalctype /
  -- assetschedule) is NULL. Catches a group created NULL by an earlier buggy revision
  -- of this fix (those columns have no DB default).
  EXISTS (
    SELECT 1
    FROM a_asset_group g
    WHERE g.ad_client_id = :client_id
      AND g.name = 'Genérico'
      AND (g.amortizationtype IS NULL
           OR g.amortizationcalctype IS NULL
           OR g.assetschedule IS NULL)
  )
  OR
  -- Step 3 would fire: an existing Genérico's accounting row(s) don't yet point at 282/682
  EXISTS (
    SELECT 1
    FROM a_asset_group g
    JOIN a_asset_group_acct ga ON ga.a_asset_group_id = g.a_asset_group_id
    WHERE g.ad_client_id = :client_id
      AND g.name = 'Genérico'
      AND (
        NOT EXISTS (
          SELECT 1 FROM c_validcombination vc JOIN c_elementvalue ev ON ev.c_elementvalue_id = vc.account_id
          WHERE vc.c_validcombination_id = ga.a_accumdepreciation_acct AND ev.value = '28200000'
        )
        OR NOT EXISTS (
          SELECT 1 FROM c_validcombination vc JOIN c_elementvalue ev ON ev.c_elementvalue_id = vc.account_id
          WHERE vc.c_validcombination_id = ga.a_depreciation_acct AND ev.value = '68200000'
        )
      )
      AND EXISTS (
        SELECT 1 FROM c_validcombination vc JOIN c_elementvalue ev ON ev.c_elementvalue_id = vc.account_id
        WHERE vc.c_acctschema_id = ga.c_acctschema_id AND ev.value = '28200000'
          AND vc.m_product_id IS NULL AND vc.c_bpartner_id IS NULL AND vc.c_project_id IS NULL
          AND vc.c_campaign_id IS NULL AND vc.c_activity_id IS NULL AND vc.ad_orgtrx_id IS NULL
          AND vc.c_locfrom_id IS NULL AND vc.c_locto_id IS NULL AND vc.c_salesregion_id IS NULL
          AND vc.user1_id IS NULL AND vc.user2_id IS NULL
      )
      AND EXISTS (
        SELECT 1 FROM c_validcombination vc JOIN c_elementvalue ev ON ev.c_elementvalue_id = vc.account_id
        WHERE vc.c_acctschema_id = ga.c_acctschema_id AND ev.value = '68200000'
          AND vc.m_product_id IS NULL AND vc.c_bpartner_id IS NULL AND vc.c_project_id IS NULL
          AND vc.c_campaign_id IS NULL AND vc.c_activity_id IS NULL AND vc.ad_orgtrx_id IS NULL
          AND vc.c_locfrom_id IS NULL AND vc.c_locto_id IS NULL AND vc.c_salesregion_id IS NULL
          AND vc.user1_id IS NULL AND vc.user2_id IS NULL
      )
  )
  OR
  -- Step 4 would fire: a resolvable Genérico exists for this client AND some asset isn't on it
  EXISTS (
    SELECT 1
    FROM a_asset a
    WHERE a.ad_client_id = :client_id
      AND EXISTS (SELECT 1 FROM a_asset_group g WHERE g.ad_client_id = a.ad_client_id AND g.name = 'Genérico')
      AND (
        a.a_asset_group_id IS NULL
        OR a.a_asset_group_id <> (
          SELECT g.a_asset_group_id FROM a_asset_group g
          WHERE g.ad_client_id = a.ad_client_id AND g.name = 'Genérico'
          ORDER BY g.created ASC LIMIT 1
        )
      )
  )
  OR
  -- Step 5 would fire: a legacy "Vehiculos"/"Otros" group exists for this client AND is
  -- deletable (nothing references it — no A_Asset and no M_Product_Category). A group still
  -- owning assets (e.g. F&B's) fails this branch and is left alone.
  EXISTS (
    SELECT 1
    FROM a_asset_group g
    WHERE g.ad_client_id = :client_id
      AND g.name IN ('Vehiculos', 'Otros')
      AND NOT EXISTS (SELECT 1 FROM a_asset a WHERE a.a_asset_group_id = g.a_asset_group_id)
      AND NOT EXISTS (SELECT 1 FROM m_product_category pc WHERE pc.a_asset_group_id = g.a_asset_group_id)
  )
LIMIT 1;

-- @apply

-- Step 1: create "Genérico" for this client if missing AND both target accounts are
-- resolvable on at least one of the client's own accounting schemas. Fires
-- a_asset_group_trg(), which auto-creates the A_Asset_Group_Acct row(s) from
-- C_AcctSchema_Default for every schema applicable to :org_id.
-- Column values (amortizationtype/amortizationcalctype/assetschedule/is30daymonth) replicate
-- the canonical GOClient onboarding row from A_ASSET_GROUP.xml (LI / PE / MO / Y). The first
-- three have NO DB default (ONCREATEDEFAULT), so they MUST be set explicitly here or the group
-- is born malformed; is30daymonth is NOT NULL default 'Y' but is set explicitly for clarity.
INSERT INTO a_asset_group (
  a_asset_group_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby,
  name, description, isowned, isdepreciated,
  amortizationtype, amortizationcalctype, assetschedule, is30daymonth
)
SELECT '@uuid_generico@', :client_id, :org_id, 'Y', now(), '0', now(), '0',
  'Genérico', NULL, 'Y', 'N',
  'LI', 'PE', 'MO', 'Y'
WHERE NOT EXISTS (
  SELECT 1 FROM a_asset_group g WHERE g.ad_client_id = :client_id AND g.name = 'Genérico'
)
AND EXISTS (
  SELECT 1 FROM c_acctschema s
  WHERE s.ad_client_id = :client_id
    AND EXISTS (
      SELECT 1 FROM c_validcombination vc JOIN c_elementvalue ev ON ev.c_elementvalue_id = vc.account_id
      WHERE vc.c_acctschema_id = s.c_acctschema_id AND ev.value = '28200000'
        AND vc.m_product_id IS NULL AND vc.c_bpartner_id IS NULL AND vc.c_project_id IS NULL
        AND vc.c_campaign_id IS NULL AND vc.c_activity_id IS NULL AND vc.ad_orgtrx_id IS NULL
        AND vc.c_locfrom_id IS NULL AND vc.c_locto_id IS NULL AND vc.c_salesregion_id IS NULL
        AND vc.user1_id IS NULL AND vc.user2_id IS NULL
    )
    AND EXISTS (
      SELECT 1 FROM c_validcombination vc JOIN c_elementvalue ev ON ev.c_elementvalue_id = vc.account_id
      WHERE vc.c_acctschema_id = s.c_acctschema_id AND ev.value = '68200000'
        AND vc.m_product_id IS NULL AND vc.c_bpartner_id IS NULL AND vc.c_project_id IS NULL
        AND vc.c_campaign_id IS NULL AND vc.c_activity_id IS NULL AND vc.ad_orgtrx_id IS NULL
        AND vc.c_locfrom_id IS NULL AND vc.c_locto_id IS NULL AND vc.c_salesregion_id IS NULL
        AND vc.user1_id IS NULL AND vc.user2_id IS NULL
    )
);

-- Step 2: sanitize any pre-existing "Genérico" whose ONCREATEDEFAULT amortization columns
-- were left NULL by an earlier buggy revision of this fix (those columns have no DB default).
-- Pin them to the canonical GOClient values (A_ASSET_GROUP.xml: LI / PE / MO). Guarded on the
-- NULLs, so a correct group and a re-run are both no-ops. Scoped strictly by ad_client_id.
UPDATE a_asset_group g
SET amortizationtype = 'LI',
    amortizationcalctype = 'PE',
    assetschedule = 'MO',
    updated = now(), updatedby = '0'
WHERE g.ad_client_id = :client_id
  AND g.name = 'Genérico'
  AND (g.amortizationtype IS NULL
       OR g.amortizationcalctype IS NULL
       OR g.assetschedule IS NULL);

-- Step 3: pin the "Genérico" accounting row(s) to 28200000/68200000 explicitly, per
-- schema, regardless of what the trigger's C_AcctSchema_Default copy landed on. Guarded
-- so a re-run (or a tenant whose Genérico was already correct) is a no-op.
UPDATE a_asset_group_acct ga
SET
  a_accumdepreciation_acct = (
    SELECT vc.c_validcombination_id FROM c_validcombination vc
    JOIN c_elementvalue ev ON ev.c_elementvalue_id = vc.account_id
    WHERE vc.c_acctschema_id = ga.c_acctschema_id AND ev.value = '28200000'
      AND vc.m_product_id IS NULL AND vc.c_bpartner_id IS NULL AND vc.c_project_id IS NULL
      AND vc.c_campaign_id IS NULL AND vc.c_activity_id IS NULL AND vc.ad_orgtrx_id IS NULL
      AND vc.c_locfrom_id IS NULL AND vc.c_locto_id IS NULL AND vc.c_salesregion_id IS NULL
      AND vc.user1_id IS NULL AND vc.user2_id IS NULL
    ORDER BY vc.created ASC LIMIT 1
  ),
  a_depreciation_acct = (
    SELECT vc.c_validcombination_id FROM c_validcombination vc
    JOIN c_elementvalue ev ON ev.c_elementvalue_id = vc.account_id
    WHERE vc.c_acctschema_id = ga.c_acctschema_id AND ev.value = '68200000'
      AND vc.m_product_id IS NULL AND vc.c_bpartner_id IS NULL AND vc.c_project_id IS NULL
      AND vc.c_campaign_id IS NULL AND vc.c_activity_id IS NULL AND vc.ad_orgtrx_id IS NULL
      AND vc.c_locfrom_id IS NULL AND vc.c_locto_id IS NULL AND vc.c_salesregion_id IS NULL
      AND vc.user1_id IS NULL AND vc.user2_id IS NULL
    ORDER BY vc.created ASC LIMIT 1
  ),
  updated = now(), updatedby = '0'
FROM a_asset_group g
WHERE ga.a_asset_group_id = g.a_asset_group_id
  AND g.ad_client_id = :client_id
  AND g.name = 'Genérico'
  AND (
    NOT EXISTS (
      SELECT 1 FROM c_validcombination vc JOIN c_elementvalue ev ON ev.c_elementvalue_id = vc.account_id
      WHERE vc.c_validcombination_id = ga.a_accumdepreciation_acct AND ev.value = '28200000'
    )
    OR NOT EXISTS (
      SELECT 1 FROM c_validcombination vc JOIN c_elementvalue ev ON ev.c_elementvalue_id = vc.account_id
      WHERE vc.c_validcombination_id = ga.a_depreciation_acct AND ev.value = '68200000'
    )
  )
  AND EXISTS (
    SELECT 1 FROM c_validcombination vc JOIN c_elementvalue ev ON ev.c_elementvalue_id = vc.account_id
    WHERE vc.c_acctschema_id = ga.c_acctschema_id AND ev.value = '28200000'
      AND vc.m_product_id IS NULL AND vc.c_bpartner_id IS NULL AND vc.c_project_id IS NULL
      AND vc.c_campaign_id IS NULL AND vc.c_activity_id IS NULL AND vc.ad_orgtrx_id IS NULL
      AND vc.c_locfrom_id IS NULL AND vc.c_locto_id IS NULL AND vc.c_salesregion_id IS NULL
      AND vc.user1_id IS NULL AND vc.user2_id IS NULL
  )
  AND EXISTS (
    SELECT 1 FROM c_validcombination vc JOIN c_elementvalue ev ON ev.c_elementvalue_id = vc.account_id
    WHERE vc.c_acctschema_id = ga.c_acctschema_id AND ev.value = '68200000'
      AND vc.m_product_id IS NULL AND vc.c_bpartner_id IS NULL AND vc.c_project_id IS NULL
      AND vc.c_campaign_id IS NULL AND vc.c_activity_id IS NULL AND vc.ad_orgtrx_id IS NULL
      AND vc.c_locfrom_id IS NULL AND vc.c_locto_id IS NULL AND vc.c_salesregion_id IS NULL
      AND vc.user1_id IS NULL AND vc.user2_id IS NULL
  );

-- Step 4: reassign every asset of this client to "Genérico" (regardless of its current
-- group — Otros, Vehiculos, etc.), only when a Genérico group is resolvable for the
-- client. Guarded so an asset already on it is left untouched (no spurious UPDATE/`updated`
-- bump).
UPDATE a_asset a
SET a_asset_group_id = (
      SELECT g.a_asset_group_id FROM a_asset_group g
      WHERE g.ad_client_id = a.ad_client_id AND g.name = 'Genérico'
      ORDER BY g.created ASC LIMIT 1
    ),
    updated = now(), updatedby = '0'
WHERE a.ad_client_id = :client_id
  AND EXISTS (SELECT 1 FROM a_asset_group g WHERE g.ad_client_id = a.ad_client_id AND g.name = 'Genérico')
  AND (
    a.a_asset_group_id IS NULL
    OR a.a_asset_group_id <> (
      SELECT g.a_asset_group_id FROM a_asset_group g
      WHERE g.ad_client_id = a.ad_client_id AND g.name = 'Genérico'
      ORDER BY g.created ASC LIMIT 1
    )
  );

-- Step 5: delete the now-unused legacy groups "Vehiculos"/"Otros" for this client. Matched by
-- NAME (never by the GOClient-specific ids in the old XML) and scoped by ad_client_id. Runs
-- LAST, after Step 4 has moved every asset to "Genérico", so these groups are empty. The double
-- NOT EXISTS guard deletes a group ONLY when nothing references it (no A_Asset — the FK that
-- would abort the tx — and no M_Product_Category); A_Asset_Group_Acct rows are removed
-- automatically by the BEFORE-DELETE trigger a_asset_group_trg2. F&B International Group (assets
-- never consolidated, so its "Otros"/"Vehiculos" are non-empty) fails the guard and is left
-- untouched. Idempotent: once deleted, a re-run matches nothing.
DELETE FROM a_asset_group g
WHERE g.ad_client_id = :client_id
  AND g.name IN ('Vehiculos', 'Otros')
  AND NOT EXISTS (SELECT 1 FROM a_asset a WHERE a.a_asset_group_id = g.a_asset_group_id)
  AND NOT EXISTS (SELECT 1 FROM m_product_category pc WHERE pc.a_asset_group_id = g.a_asset_group_id);
