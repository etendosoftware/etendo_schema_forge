-- @id: R31-glitem-subaccount-backfill
-- @gap: N1
-- @risk: low
-- @type: sql
-- @description: Backfill C_Glitem/C_Glitem_Acct for leaf subaccounts created before ETP-5020 shipped -- ETP-5101

-- Background
-- --------------------------------------------------------------------------------------------
-- ETP-5020 made subaccount creation auto-provision an invisible C_Glitem/C_Glitem_Acct pair
-- behind every new leaf C_ElementValue (elementlevel='S'), via
-- GlItemProvisioningSupport#ensureGlItemForSubaccount, called from two live entry points:
--   1. ChartOfAccountsHandler#afterHandle -- a live POST (new subaccount) or PATCH/PUT through the
--      NEO "chart-of-accounts" window.
--   2. OnboardingAccountingWiringService#provisionGlItemsForImportedChart, wired into #wire right
--      after rebrandImportedChartNames and before provisionEntityPostingAccounts -- runs once per
--      leaf ElementValue of a NEW tenant's freshly-imported default chart of accounts.
-- Both are forward-only: they fire on a live write or on a fresh onboarding's bulk chart import.
-- A subaccount created BEFORE ETP-5020 shipped (2026-08-30), and never PUT/re-saved since, has no
-- GLItem/GLItemAccounts row and nothing retroactively creates one -- exactly the "born broken,
-- nothing heals it" shape this framework exists for. Confirmed live on this DB (2026-09-01): every
-- one of ~30 real+demo tenants is missing all (or nearly all) of its ~658 postable-leaf GL Items;
-- GOClient itself (only 2 manually-authored GLItems pre-date ETP-5020) is missing 658.
--
-- Preventive front: ALREADY CLOSED, no new Java in this ticket
-- --------------------------------------------------------------------------------------------
-- Both call sites above already exist and are live (ETP-5020, merged to develop 2026-08-30) --
-- GlItemProvisioningSupport.java / ChartOfAccountsHandler.java / OnboardingAccountingWiringService
-- .provisionGlItemsForImportedChart are explicitly OUT OF SCOPE for this ticket (ETP-5101 already
-- verified them this session). This fix is corrective-only per the framework's own boundary rule
-- (docs/etendo-ad/onboarding-and-datafixes-map.md S0): "a gap that is purely about existing-tenant
-- state with no onboarding-process cause... may be corrective-only -- but state that explicitly".
-- A tenant onboarded (or subaccount created) after 2026-08-30 already gets its GL Items minted
-- live -- this fix's own @check naturally returns 0 rows for such a subaccount regardless of the
-- ONBOARDING_PROVISIONED_THROUGH watermark, so re-running this fix against a fully-compliant
-- tenant safely converges to SKIPPED_NOT_NEEDED.
--
-- ONBOARDING_PROVISIONED_THROUGH is bumped to this fix's own timestamp anyway (mirrors the A2c /
-- ETP-4743 precedent: preventive already shipped in an earlier, separate PR without ever bumping
-- the CUT for it -- deferred exactly until this fix's matching .sql landed in the repo, per the
-- framework's "never bump CUT without matching .sql already in the repo" rule). This is a pure
-- optimization (skip even running @check for tenants onboarded after the bump) with no correctness
-- dependency on it, since @check/@apply are self-converging either way.
--
-- SQL-first decision
-- --------------------------------------------------------------------------------------------
-- Deliberately @type: sql, not @type: webhook. GlItemProvisioningSupport#ensureGlItemForSubaccount
-- was read end-to-end before making this call:
--   1. resolveNaturalCombination is a plain SELECT against C_ValidCombination (11 dimension
--      columns all IS NULL except Account_ID/C_AcctSchema_ID) -- mirrors the exact shape
--      C_ELEMENTVALUE_TRG itself inserts (src-db/database/model/triggers/C_ELEMENTVALUE_TRG.xml).
--      The natural combination is NEVER created by this fix (or by the Java) -- it is looked up
--      only; if the trigger never created one for a given schema (a summary/heading account, or a
--      schema wired after the leaf's insert), Case 3 applies and nothing is provisioned for it --
--      the same "no accounting use" no-op the Java documents.
--   2. The idempotency key is the natural AccountingCombination itself
--      (findGlItemAccountsByCombination), never the GL Item's name -- this DB has hand-made rows
--      like "Capital social"/"Sueldos y salarios" (GOClient/C_GLITEM.xml) that already carry real
--      GLItemAccounts links to their subaccount's natural combination; confirmed live these are
--      correctly EXCLUDED from the "missing" set by this same key, so this fix reuses/relinks them
--      rather than minting a duplicate GL Item.
--   3. C_Glitem / C_Glitem_Acct are plain INSERTs with no Hibernate EventHandler side effects of
--      their own (unlike, e.g., AD_Role_Inheritance's window-access propagation, which R26 cites as
--      its own reason to stay SQL rather than escalate). No trigger fires on C_Glitem/C_Glitem_Acct
--      insert either (verified: neither table has a *_trg function in this DB's pg_trigger catalog
--      touching business logic beyond the standard audit-column trigger).
-- Given that, and given the write shape (materialize a parent row + N child rows per active
-- schema, reusing an existing parent by a natural-key lookup) is the exact shape R1/R9/R21/R22/R26
-- already do in plain SQL, SQL is sufficient; the webhook escape hatch is not justified here.
--
-- Multi-schema coverage
-- --------------------------------------------------------------------------------------------
-- One GLItemAccounts row per ACTIVE C_AcctSchema the tenant owns (mirrors
-- GlItemProvisioningSupport#resolveActiveSchemas -- "every active schema", not just the tenant's
-- first/default one). Confirmed live: QA Testing and F&B International Group both carry 2 active
-- schemas; live-validated on QA Testing (61 distinct subaccounts, @apply inserted 61 rows), where
-- 3 subaccounts ended up with their GL Item linked to BOTH schemas -- exercises the "reuse the
-- SAME GL Item across schemas" path for a subaccount whose first-schema row is inserted before
-- its second-schema row in the same @apply pass.
--
-- Column mapping mirrors GlItemProvisioningSupport 1:1
-- --------------------------------------------------------------------------------------------
-- C_Glitem: Client/Org copied from the SUBACCOUNT (never the schema) -- matches
-- createGlItem(subaccount): glItem.setClient(subaccount.getClient()),
-- glItem.setOrganization(subaccount.getOrganization()). Name = composeGlItemName's ETP-5101 format
-- "<name, truncated to fit> <searchKey>" (searchKey stored in C_ElementValue.Value -- confirmed via
-- ElementValue.java's PROPERTY_SEARCHKEY javadoc), falling back to the (possibly truncated) bare
-- name when the code is blank (should not happen for a real leaf, kept total to match the Java).
-- See the N2 section above for the truncation formula. EnableInCash/
-- EnableInFinInvoices left at their column defaults ('N'/'N', confirmed via information_schema),
-- exactly what createGlItem's untouched OBProvider default object would carry -- satisfies every
-- CHECK constraint on the table with C_TaxCategory_ID/C_Tax_ID/C_Withholding_ID all NULL.
-- C_Glitem_Acct: Client/Org copied from the SAME subaccount (not the schema); GlitemDebitAcct =
-- GlitemCreditAcct = the natural combination, matching createGlItemAccounts's debit=credit=combo.
--
-- Idempotency mechanics (why this needs a coupled, single-statement @apply)
-- --------------------------------------------------------------------------------------------
-- A subaccount missing GL Items on 2+ schemas in the SAME @apply pass must get exactly ONE new
-- C_Glitem row, reused by every one of its new C_Glitem_Acct rows -- two separate INSERT
-- statements could not see each other's not-yet-committed C_Glitem row correlated back to "which
-- subaccount it was for" (C_Glitem carries no subaccount FK of its own). This fix uses ONE
-- statement with data-modifying CTEs (the same "coupled 1:1... via a data-modifying CTE" technique
-- R18/R28 already established for this framework): `created_items` INSERTs the new C_Glitem rows
-- and its RETURNING set is joined back into `resolved_glitem` so every C_Glitem_Acct row -- old
-- reused GL Item or brand-new one -- resolves to the correct, single glitem id. Both `@check` and
-- `@apply`'s own defensive re-check evaluate against the PRE-statement snapshot (standard Postgres
-- WITH-clause semantics), so a fix that becomes not-needed mid-flight (concurrent run) safely
-- inserts nothing further rather than duplicating.
--
-- N2 -- C_Glitem.Name is varchar(60), C_ElementValue.Name is varchar(255) -- FIXED, both fronts
-- --------------------------------------------------------------------------------------------
-- composeGlItemName's "<name> <searchKey>" format originally had no length guard. Confirmed live
-- on this DB: for GOClient alone, 294 of the 658 subaccounts that need a brand-new GL Item (45%)
-- produce a composed name over 60 chars (Spanish PGC account names are long -- e.g. "Reversion del
-- deterioro de participaciones en instrumentos de patrimonio neto a largo plazo otras partes
-- vinculadas 79620000", 124 chars). This was not unique to this backfill: the same 60-char limit
-- also silently blocked the LIVE preventive path (GlItemProvisioningSupport#ensureGlItemForSchema
-- swallows the length-validation failure per schema, best-effort). Fixed on the Java side in the
-- SAME session (composeGlItemName + a new truncateToFit helper, GL_ITEM_NAME_MAX_LENGTH=60): the
-- NAME portion is hard-truncated (String#substring, no ellipsis), the 8-digit CODE always survives
-- intact (it is what disambiguates two subaccounts sharing a name -- the entire point of appending
-- it) -- budget = 60 - (1 + code.length()) for the name when a code is present, 60 flat otherwise.
-- This fix mirrors that EXACT formula in SQL (Postgres `left(str, n)` is `String#substring(0, n)`
-- here), so it converges on the identical bytes the live path now produces, not merely "no longer
-- diverges going forward" -- a subaccount touched by BOTH fronts (e.g. backfilled by R31, later
-- renamed via a live PUT) must get the SAME GL Item name either way. The length guard that used to
-- gate `subaccounts_needing_new_item` is gone entirely: every composed name fits by construction
-- once truncation is applied, so nothing is skipped anymore. `@report` now lists which subaccounts
-- actually got a truncated (not verbatim) name, for operator visibility -- mirrors R19's pattern.

-- @check
-- DISTINCT ON (subaccount, schema), lowest combo id wins -- MUST mirror @apply's own
-- natural_combos dedup exactly (see that CTE's comment for why: a tenant can carry more than one
-- all-dimensions-NULL C_ValidCombination row for the same (account, schema) pair, confirmed live
-- on QA Testing). @apply only ever links ONE combo per (account, schema) -- the same
-- deterministic choice GlItemProvisioningSupport#resolveNaturalCombination makes via
-- `.addOrderBy(PROPERTY_ID, true).setMaxResults(1)`. A plain (non-deduplicated) @check would keep
-- flagging the OTHER, deliberately-never-linked duplicate combo as "still needs fixing" forever,
-- even after @apply correctly finishes everything it is able to close -- the exact
-- @check-promises-more-than-@apply-can-deliver asymmetry Sentinel caught in R22/ETP-4743 (see
-- tenant-remediation-knowledge.md). Reproduced live here before this fix: QA Testing's 2
-- duplicate-combination subaccounts made @check report NEEDS FIX even after a full, successful
-- @apply run inserted every row it legitimately could.
WITH natural_combos AS (
  SELECT DISTINCT ON (ev.c_elementvalue_id, s.c_acctschema_id)
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
WHERE NOT EXISTS (
  SELECT 1 FROM c_glitem_acct ga WHERE ga.glitem_debit_acct = nc.combo_id
)
LIMIT 1;

-- @apply
WITH natural_combos AS (
  -- DISTINCT ON (subaccount, schema), lowest combo id wins -- mirrors
  -- GlItemProvisioningSupport#resolveNaturalCombination's own
  -- `.addOrderBy(PROPERTY_ID, true).setMaxResults(1)`. A tenant CAN carry more than one
  -- all-dimensions-NULL C_ValidCombination row for the same (account, schema) pair (confirmed live
  -- on QA Testing, a demo tenant with duplicate combinations) -- without this, the fan-out would
  -- try to INSERT two C_Glitem_Acct rows for the same (glitem, schema), violating
  -- c_glitem_acct_glitem_acctsc_un.
  SELECT DISTINCT ON (ev.c_elementvalue_id, s.c_acctschema_id)
    ev.c_elementvalue_id AS subaccount_id,
    ev.ad_client_id      AS ad_client_id,
    ev.ad_org_id         AS subaccount_org_id,
    ev.name              AS subaccount_name,
    ev.value             AS subaccount_code,
    s.c_acctschema_id    AS c_acctschema_id,
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
), missing_pairs AS (
  -- one row per (subaccount, schema) that still needs a C_Glitem_Acct row.
  SELECT nc.*
  FROM natural_combos nc
  WHERE NOT EXISTS (
    SELECT 1 FROM c_glitem_acct ga WHERE ga.glitem_debit_acct = nc.combo_id
  )
), existing_glitem_by_subaccount AS (
  -- reuse key: findGlItemLinkedToAnyCombinationOf's SQL twin -- a subaccount already carrying a
  -- GL Item on ANY of its own combinations (any schema, incl. a hand-made GLItem like "Capital
  -- social") must reuse that SAME GLItem rather than mint a second one. Deterministic pick via
  -- DISTINCT ON in case more than one combination happens to already be linked.
  SELECT DISTINCT ON (nc.subaccount_id)
    nc.subaccount_id,
    ga.c_glitem_id
  FROM natural_combos nc
  JOIN c_glitem_acct ga ON ga.glitem_debit_acct = nc.combo_id
  ORDER BY nc.subaccount_id, ga.c_glitem_id
), subaccounts_needing_new_item AS (
  -- DISTINCT subaccounts (deduplicated BEFORE any per-row id is minted below) that need at least
  -- one missing pair AND have NO existing GL Item at all yet. No length guard here (N2, see
  -- header, FIXED) -- created_items below truncates the composed name to fit C_Glitem.Name's
  -- varchar(60), so every subaccount that needs a new item gets one; nothing is skipped for length
  -- anymore.
  SELECT DISTINCT
    mp.subaccount_id,
    mp.ad_client_id,
    mp.subaccount_org_id,
    mp.subaccount_name,
    mp.subaccount_code
  FROM missing_pairs mp
  WHERE NOT EXISTS (
    SELECT 1 FROM existing_glitem_by_subaccount e WHERE e.subaccount_id = mp.subaccount_id
  )
), items_to_create AS (
  -- get_uuid() is mixed with SELECT DISTINCT nowhere in this fix: it is a volatile, per-row
  -- function, so calling it BEFORE dedup would mint a DIFFERENT id per source row and defeat the
  -- "one subaccount, one new GL Item" invariant for a subaccount missing on 2+ schemas (each
  -- schema's row in missing_pairs would get its own id, producing two GL Items for one subaccount
  -- and a duplicate-key violation on c_glitem_acct's UNIQUE(c_glitem_id, c_acctschema_id) once
  -- joined back). One id per ALREADY-DISTINCT subaccount, computed here, is exactly one row.
  SELECT
    n.subaccount_id,
    n.ad_client_id,
    n.subaccount_org_id,
    n.subaccount_name,
    n.subaccount_code,
    get_uuid() AS new_glitem_id
  FROM subaccounts_needing_new_item n
), created_items AS (
  -- composeGlItemName's own format, byte-for-byte: "<name, truncated to fit> <searchKey>"
  -- (searchKey = C_ElementValue.Value), falling back to the (possibly truncated) bare name when
  -- the code is blank. Mirrors truncateToFit(name, GL_ITEM_NAME_MAX_LENGTH - suffix.length())
  -- exactly: `left(str, n)` is Postgres's `String#substring(0, n)` (a hard cut, no ellipsis);
  -- GREATEST(..., 0) mirrors Java's Math.max(0, maxLength) so a pathological code >= 59 chars
  -- (never happens today -- ChartOfAccountsHandler#isValidAccountCode enforces exactly 8 digits --
  -- kept for exact parity with the Java rather than assuming that invariant here) still produces a
  -- non-negative substring length instead of Postgres's own negative-n "all but last |n| chars"
  -- extension, which would silently disagree with Java's clamp-to-zero behavior.
  INSERT INTO c_glitem (
    c_glitem_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby,
    name, description, enableincash, enableinfininvoices, c_taxcategory_id, c_tax_id, c_withholding_id
  )
  SELECT
    itc.new_glitem_id, itc.ad_client_id, itc.subaccount_org_id, 'Y', now(), '0', now(), '0',
    CASE
      WHEN itc.subaccount_code IS NULL OR itc.subaccount_code = '' THEN left(itc.subaccount_name, 60)
      ELSE left(itc.subaccount_name, GREATEST(60 - length(itc.subaccount_code) - 1, 0)) || ' ' || itc.subaccount_code
    END,
    NULL, 'N', 'N', NULL, NULL, NULL
  FROM items_to_create itc
  RETURNING c_glitem_id
), resolved_glitem AS (
  -- COALESCE: prefer an existing GL Item (any schema) over the one just minted for this pass.
  -- Joining `created_items` back in (rather than trusting `items_to_create.new_glitem_id` alone)
  -- forces Postgres to execute the data-modifying CTE above -- an unreferenced data-modifying CTE
  -- would never run.
  SELECT
    mp.subaccount_id,
    mp.subaccount_org_id,
    mp.c_acctschema_id,
    mp.combo_id,
    COALESCE(e.c_glitem_id, ci.c_glitem_id) AS c_glitem_id
  FROM missing_pairs mp
  LEFT JOIN existing_glitem_by_subaccount e ON e.subaccount_id = mp.subaccount_id
  LEFT JOIN items_to_create itc ON itc.subaccount_id = mp.subaccount_id
  LEFT JOIN created_items ci ON ci.c_glitem_id = itc.new_glitem_id
)
INSERT INTO c_glitem_acct (
  c_glitem_acct_id, c_glitem_id, c_acctschema_id, ad_client_id, ad_org_id, isactive,
  created, createdby, updated, updatedby, glitem_debit_acct, glitem_credit_acct
)
SELECT
  get_uuid(), r.c_glitem_id, r.c_acctschema_id, :client_id, r.subaccount_org_id, 'Y',
  now(), '0', now(), '0', r.combo_id, r.combo_id
FROM resolved_glitem r
WHERE r.c_glitem_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM c_glitem_acct ga2
    WHERE ga2.c_glitem_id = r.c_glitem_id AND ga2.c_acctschema_id = r.c_acctschema_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM c_glitem_acct ga3 WHERE ga3.glitem_debit_acct = r.combo_id
  );

-- @report
-- Runs after @apply, in the same transaction (so it sees this run's own inserts). Lists every
-- subaccount whose GL Item name was actually shortened to fit C_Glitem.Name's varchar(60) --
-- operator visibility into which names got truncated, mirroring R19's pattern. `expected_truncated
-- _name` recomputes composeGlItemName/truncateToFit's EXACT formula from the subaccount's current
-- raw name/code; the report matches it against the GL Item name actually linked to the
-- subaccount's natural combination and only surfaces a row when they're equal -- precise for BOTH
-- a row freshly truncated by THIS run and one truncated by an earlier run of this same fix (an
-- idempotent re-run keeps reporting it, same as R19's own accepted behavior). This correctly
-- EXCLUDES a subaccount whose composed name is over 60 but whose linked GL Item is a pre-existing,
-- reused, differently-named row (e.g. a hand-made GLItem like "Capital social") -- reuse never
-- touches the GL Item's name, so it is not a truncation outcome and must not be reported as one.
SELECT DISTINCT
  c.account_code,
  c.account_name,
  c.expected_truncated_name,
  c.original_composed_length
FROM (
  SELECT
    ev.c_elementvalue_id AS subaccount_id,
    ev.value AS account_code,
    ev.name AS account_name,
    CASE
      WHEN ev.value IS NULL OR ev.value = '' THEN left(ev.name, 60)
      ELSE left(ev.name, GREATEST(60 - length(ev.value) - 1, 0)) || ' ' || ev.value
    END AS expected_truncated_name,
    length(ev.name || ' ' || ev.value) AS original_composed_length,
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
    AND length(ev.name || ' ' || ev.value) > 60
) c
JOIN c_glitem_acct ga ON ga.glitem_debit_acct = c.combo_id
JOIN c_glitem gi ON gi.c_glitem_id = ga.c_glitem_id AND gi.name = c.expected_truncated_name
ORDER BY c.original_composed_length DESC;
