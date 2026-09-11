-- @id: R32-glitem-name-resync
-- @gap: N3
-- @risk: low
-- @type: sql
-- @description: Resync C_Glitem.Name for already-linked GL Items whose composed name went stale -- ETP-5101

-- Background
-- --------------------------------------------------------------------------------------------
-- R31 (gap N1) backfills a C_Glitem/C_Glitem_Acct pair for a leaf subaccount that has NONE at
-- all yet -- it never touches the NAME of a subaccount whose GL Item is already linked. That
-- leaves a real gap: a subaccount whose GL Item was linked BEFORE the current naming convention
-- existed -- e.g. linked back when the format was name-only (pre-ETP-5101), name-then-code
-- (composeGlItemName's original order, flipped code-first the same session R31 shipped in), or a
-- hand-authored row that predates ETP-5020 auto-provisioning entirely -- carries a C_Glitem.Name
-- that no longer matches what composeGlItemName would produce today, and nothing retroactively
-- fixes it. This is the SAME "born correct once, drifts, nothing heals it" shape as N1/N2, given
-- its own label per this file's convention (docs/etendo-ad/onboarding-gaps.md, that file's own
-- precedent for a fresh N-suffix per distinct symptom under one gap letter).
--
-- Confirmed live on this DB (2026-09-02, rolled-back transaction, current un-migrated state --
-- R31 itself has only ever been dry-run/rolled-back here, never committed): GOClient has exactly
-- ONE stale-named linked GL Item -- the hand-made "Capital social" row (still its pre-ETP-5101
-- bare name, expected "10000000-Capital social"). QA Testing has THREE: two DIFFERENT GL Items
-- ("GL Item 1"/"GL Item 2") both linked to the SAME subaccount ("11100-Petty Cash") across its 2
-- active schemas -- a genuine pre-existing multi-GL-Item-per-subaccount state, not a duplicate to
-- collapse away -- plus one ("Fees", subaccount "62900-Otros servicios"). See the idempotency
-- section below for how @apply resyncs all of these correctly without double-touching a row.
--
-- Preventive front: ALREADY CLOSED, same session, no new Java in this ticket
-- --------------------------------------------------------------------------------------------
-- ChartOfAccountsHandler#afterHandle's PATCH/PUT branch now calls a new private method,
-- syncGlItemNameAfterUpdate(context), whenever the request body touches "name" or "searchKey" --
-- it re-invokes GlItemProvisioningSupport#ensureGlItemForSubaccount, whose existing-link branch
-- (ensureGlItemForSchema, see class source) already unconditionally resyncs the linked GL Item's
-- name via syncGlItemName the moment ANY schema's link already exists. So a live rename now
-- self-heals going forward; this data-fix is corrective-only, closing the gap for tenants whose
-- GL Items are ALREADY linked with a stale name and have not been touched by a rename since that
-- fix shipped. ONBOARDING_PROVISIONED_THROUGH is deliberately NOT bumped for this fix (out of
-- scope for this ticket, com.etendoerp.go untouched) -- safe per the framework's own table ("only
-- the .sql, no CUT bump" is always safe, merely redundant for tenants the preventive front
-- already covers): a subaccount touched by a live PUT since the preventive fix shipped already
-- has a correct name, so this fix's own @check naturally converges to 0 for it regardless of the
-- CUT watermark, exactly like N1's own reasoning.
--
-- IMPORTANT -- do NOT special-case hand-made GL Items (a deliberate design decision, not an
-- oversight). R31's own header says its reuse path "never touches the GL Item's name" -- that
-- describes R31's OWN deliberately narrow choice (it only INSERTs missing links, never UPDATEs
-- an existing row), not a statement that a hand-made row is permanently protected from renaming.
-- The live Java's ensureGlItemForSchema existing-link branch unconditionally resyncs the name for
-- ANY already-linked GL Item, hand-made or not -- confirmed live: GOClient's own "Capital social"
-- (one of the 2 pre-ETP-5020 manual rows) is precisely the ONE row this fix's @check flags today.
-- The moment that subaccount is next renamed via a live PUT, ChartOfAccountsHandler already
-- overwrites its GL Item name with the composed format too -- this fix simply does the same thing
-- proactively/in bulk instead of waiting for that PUT. Excluding hand-made rows here would make
-- this fix LESS correct than the live path it mirrors, not more careful.
--
-- SQL-first decision
-- --------------------------------------------------------------------------------------------
-- Deliberately @type: sql. This is a single guarded UPDATE keyed by a natural-combination lookup
-- already established as plain-SQL-safe by R31 (see that file's own SQL-first section for the
-- full reasoning: resolveNaturalCombination is a plain SELECT with no side effects, C_Glitem
-- carries no trigger beyond the standard audit-column one). Nothing here needs Java: no new row
-- is created (R31's job), no cross-table cascade is required beyond the single UPDATE, and the
-- expected-name formula is a pure string transform already mirrored byte-for-byte in SQL by R31.
--
-- natural_combos -- textually identical to @check, per the R31/R22 symmetry lesson
-- --------------------------------------------------------------------------------------------
-- Reuses R31's exact natural_combos CTE shape (11-dimension all-NULL C_ValidCombination lookup,
-- DISTINCT ON (subaccount, schema) dedup, lowest combo id wins, :client_id-scoped). @apply's copy
-- of this CTE is byte-for-byte identical to @check's own -- the R22/ETP-4743 and N1 precedent both
-- establish that any dedup @apply relies on must be mirrored in @check too, or @check keeps
-- reporting "needs fix" forever for a case @apply can never touch differently than it already did
-- (a non-convergent fix). Here the dedup is defensive rather than load-bearing for a specific bug
-- (a duplicate combo simply never joins to any C_Glitem_Acct row and is silently irrelevant either
-- way), but keeping the two CTEs textually identical costs nothing and forecloses drift risk if a
-- future edit changes one copy and not the other.
--
-- Idempotency mechanics -- why resync_candidates needs its OWN DISTINCT ON (glitem_id)
-- --------------------------------------------------------------------------------------------
-- A subaccount reused across 2+ active schemas resolves, via R31's own reuse invariant
-- (findGlItemLinkedToAnyCombinationOf, mirrored) and the live Java's identical rule, to the SAME
-- C_Glitem row on every schema it is linked from going forward -- that row must be updated exactly
-- ONCE, not once per schema link, or the UPDATE (idempotent by construction via its own
-- IS DISTINCT FROM guard, so not a correctness bug) would still needlessly re-touch the same row
-- and contend on its own row lock. resync_candidates' DISTINCT ON (gi.c_glitem_id) collapses that
-- case to one row per GL Item before the UPDATE ever runs. A subaccount linked to GENUINELY
-- DIFFERENT GL Items across its schemas -- a legacy/pre-reuse-invariant state, confirmed live on
-- QA Testing's "Petty Cash" subaccount (2 distinct GL Items, "GL Item 1" and "GL Item 2", one per
-- schema) -- correctly produces two separate candidate rows here, one per distinct C_Glitem_ID:
-- both are real, independent rows that each need their own UPDATE, and both resolve to the SAME
-- expected name (the composed name depends only on the subaccount, never on which schema the link
-- came from) -- DISTINCT ON never collapses these two together because they key on different
-- glitem ids.
--
-- Column mapping mirrors GlItemProvisioningSupport#composeGlItemName 1:1 (see R31's own header
-- for the full derivation and the Postgres left()/GREATEST() vs Java substring()/Math.max() note)
-- -- "<searchKey>-<name, truncated to fit>" (searchKey = C_ElementValue.Value), code leading and
-- never truncated, name truncated via a hard cut. Only ad_client_id/updated/updatedby are written
-- besides name -- no other column on C_Glitem is touched by this fix.
--
-- @report -- old name -> new name, for operator visibility, R19/R31 pattern
-- --------------------------------------------------------------------------------------------
-- @report cannot simply recompute the expected value against post-apply state the way R31's own
-- @report does (R31 is reporting "was this INSERT's name truncated", a property of the row that
-- stays true on every idempotent re-run) -- "did THIS run actually change this row's name" needs
-- the PRE-apply name, which the UPDATE has already overwritten by the time @report's separate
-- SELECT runs. @apply therefore captures the UPDATE's own RETURNING output (both old_name and
-- new_name) into a session-scoped TEMP TABLE via a data-modifying CTE (the same "coupled 1:1 via a
-- data-modifying CTE" technique R18/R28/R31 already established for this framework, here paired
-- with a `SELECT ... INTO TEMP TABLE` instead of a second real-table INSERT since nothing here
-- should survive past this run). The runner (run.js) opens ONE client connection for the whole
-- fix (BEGIN -> @apply -> @report -> COMMIT, see that file's own comment), so the temp table
-- created inside @apply is visible to @report's separate query in the SAME session before COMMIT.
--
-- ETP-5101 REVIEW FINDING (B2): a COMMITted session-scoped temp table is NOT dropped when the
-- backend connection is later returned to the pool -- node-postgres's `client.release()` (see
-- db.js's createDbPool) returns the socket to the pool without issuing `DISCARD ALL` or ending the
-- backend session, and this framework's pool is reused across tenants/fixes (`max: 5`). Since R32
-- runs per-tenant (confirmed live: GOClient + QA Testing both need it), a second tenant reusing the
-- SAME pooled connection would hit "relation etgo_r32_glitem_name_resync already exists" and abort
-- the whole chain for that tenant (run.js's applyChain halts on a failed @apply). @apply therefore
-- leads with an explicit DROP, making every run self-cleaning regardless of connection reuse; a run
-- whose @apply updates 0 rows still (re)creates the (empty) temp table, so @report always runs
-- cleanly and simply returns 0 rows -> `detail` stays null, same as "no @report section" per
-- parse-fix.js's own documented default. (A ROLLBACKed run -- including the framework's own
-- validation runs -- undoes the CREATE along with everything else, since it is DDL and fully
-- transactional in Postgres; the DROP only matters for connection reuse AFTER a commit.)

-- @check
WITH natural_combos AS (
  SELECT DISTINCT ON (ev.c_elementvalue_id, s.c_acctschema_id)
    ev.c_elementvalue_id AS subaccount_id,
    ev.value             AS subaccount_code,
    ev.name              AS subaccount_name,
    vc.c_validcombination_id AS combo_id
  FROM c_elementvalue ev
  JOIN c_acctschema_element ae ON ae.c_element_id = ev.c_element_id AND ae.elementtype = 'AC'
  JOIN c_acctschema s ON s.c_acctschema_id = ae.c_acctschema_id AND s.isactive = 'Y' AND s.ad_client_id = :client_id
  JOIN c_validcombination vc
    ON vc.account_id = ev.c_elementvalue_id
   AND vc.c_acctschema_id = s.c_acctschema_id
   AND vc.m_product_id IS NULL
   AND vc.c_bpartner_id IS NULL
   AND vc.ad_orgtrx_id IS NULL
   AND vc.c_locfrom_id IS NULL
   AND vc.c_locto_id IS NULL
   AND vc.c_salesregion_id IS NULL
   AND vc.c_project_id IS NULL
   AND vc.c_campaign_id IS NULL
   AND vc.c_activity_id IS NULL
   AND vc.user1_id IS NULL
   AND vc.user2_id IS NULL
  WHERE ev.ad_client_id = :client_id
    AND ev.elementlevel = 'S'
    AND ev.isactive = 'Y'
  ORDER BY ev.c_elementvalue_id, s.c_acctschema_id, vc.c_validcombination_id
)
SELECT 1
FROM natural_combos nc
JOIN c_glitem_acct ga ON ga.glitem_debit_acct = nc.combo_id
JOIN c_glitem gi ON gi.c_glitem_id = ga.c_glitem_id AND gi.ad_client_id = :client_id
WHERE gi.name IS DISTINCT FROM (
  CASE
    WHEN nc.subaccount_code IS NULL OR nc.subaccount_code = '' THEN left(nc.subaccount_name, 60)
    ELSE nc.subaccount_code || '-' || left(nc.subaccount_name, GREATEST(60 - length(nc.subaccount_code) - 1, 0))
  END
)
LIMIT 1;

-- @apply
-- Self-cleaning leading statement -- see header's B2 note: a committed temp table survives
-- client.release() and must not be assumed gone when this fix runs against the next tenant on a
-- reused pooled connection.
DROP TABLE IF EXISTS etgo_r32_glitem_name_resync;
WITH natural_combos AS (
  -- Textually identical to @check's own CTE above -- see the header's symmetry note.
  SELECT DISTINCT ON (ev.c_elementvalue_id, s.c_acctschema_id)
    ev.c_elementvalue_id AS subaccount_id,
    ev.value             AS subaccount_code,
    ev.name              AS subaccount_name,
    vc.c_validcombination_id AS combo_id
  FROM c_elementvalue ev
  JOIN c_acctschema_element ae ON ae.c_element_id = ev.c_element_id AND ae.elementtype = 'AC'
  JOIN c_acctschema s ON s.c_acctschema_id = ae.c_acctschema_id AND s.isactive = 'Y' AND s.ad_client_id = :client_id
  JOIN c_validcombination vc
    ON vc.account_id = ev.c_elementvalue_id
   AND vc.c_acctschema_id = s.c_acctschema_id
   AND vc.m_product_id IS NULL
   AND vc.c_bpartner_id IS NULL
   AND vc.ad_orgtrx_id IS NULL
   AND vc.c_locfrom_id IS NULL
   AND vc.c_locto_id IS NULL
   AND vc.c_salesregion_id IS NULL
   AND vc.c_project_id IS NULL
   AND vc.c_campaign_id IS NULL
   AND vc.c_activity_id IS NULL
   AND vc.user1_id IS NULL
   AND vc.user2_id IS NULL
  WHERE ev.ad_client_id = :client_id
    AND ev.elementlevel = 'S'
    AND ev.isactive = 'Y'
  ORDER BY ev.c_elementvalue_id, s.c_acctschema_id, vc.c_validcombination_id
), resync_candidates AS (
  -- DISTINCT ON (glitem_id): collapse the "same GL Item reused across 2+ schemas" case to one
  -- candidate row (see header's idempotency-mechanics section). A subaccount linked to genuinely
  -- DIFFERENT GL Items per schema (confirmed live: QA Testing's "Petty Cash") correctly yields one
  -- candidate row PER distinct GL Item -- DISTINCT ON keys on c_glitem_id, never subaccount_id.
  SELECT DISTINCT ON (gi.c_glitem_id)
    gi.c_glitem_id      AS c_glitem_id,
    nc.subaccount_code  AS subaccount_code,
    nc.subaccount_name  AS subaccount_name,
    gi.name             AS old_name,
    CASE
      WHEN nc.subaccount_code IS NULL OR nc.subaccount_code = '' THEN left(nc.subaccount_name, 60)
      ELSE nc.subaccount_code || '-' || left(nc.subaccount_name, GREATEST(60 - length(nc.subaccount_code) - 1, 0))
    END AS new_name
  FROM natural_combos nc
  JOIN c_glitem_acct ga ON ga.glitem_debit_acct = nc.combo_id
  JOIN c_glitem gi ON gi.c_glitem_id = ga.c_glitem_id AND gi.ad_client_id = :client_id
  WHERE gi.name IS DISTINCT FROM (
    CASE
      WHEN nc.subaccount_code IS NULL OR nc.subaccount_code = '' THEN left(nc.subaccount_name, 60)
      ELSE nc.subaccount_code || '-' || left(nc.subaccount_name, GREATEST(60 - length(nc.subaccount_code) - 1, 0))
    END
  )
  ORDER BY gi.c_glitem_id, nc.subaccount_id
), updated AS (
  -- Second, defensive idempotency layer (mandatory rule #2): re-checks IS DISTINCT FROM at the
  -- point of UPDATE even though resync_candidates already filtered to mismatches only.
  UPDATE c_glitem gi
  SET name = rc.new_name, updated = now(), updatedby = '0'
  FROM resync_candidates rc
  WHERE gi.c_glitem_id = rc.c_glitem_id
    AND gi.ad_client_id = :client_id
    AND gi.name IS DISTINCT FROM rc.new_name
  RETURNING gi.c_glitem_id, rc.subaccount_code, rc.subaccount_name, rc.old_name, rc.new_name
)
SELECT subaccount_code, subaccount_name, old_name, new_name
INTO TEMP TABLE etgo_r32_glitem_name_resync
FROM updated;

-- @report
-- Reads back this run's own UPDATE ... RETURNING output, captured into the session-scoped temp
-- table by @apply above (see header's "@report -- old name -> new name" section for why this is
-- necessary here, unlike R19/R31's simpler post-apply recompute). Empty when @apply changed 0
-- rows (a clean re-run) -- detail stays null, same as a fix with no @report section at all.
SELECT subaccount_code, subaccount_name, old_name, new_name
FROM etgo_r32_glitem_name_resync
ORDER BY subaccount_code;
