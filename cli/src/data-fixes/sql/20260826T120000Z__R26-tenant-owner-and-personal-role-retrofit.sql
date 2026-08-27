-- @id: R26-tenant-owner-and-personal-role-retrofit
-- @gap: L1
-- @risk: high
-- @type: sql
-- @description: Backfill tenant ownership (EM_ETGO_Is_Owner) and existing-user personal roles (ETP-4852 template composition) for tenants provisioned before ETP-4830/ETP-4852 shipped -- ETP-4877

-- Context (ETP-4877, consolidates docs/etendo-ad/onboarding-gaps.md "L1 -- Tenant Ownership")
-- --------------------------------------------------------------------------------------------
-- Two preventive fronts already shipped for NEW tenants: ETP-4830 flags the self-service
-- registrant as EM_ETGO_Is_Owner='Y' (OwnerSupport#markAsOwnerIfNoneExists, called from
-- EtendoGoJwtServlet#createClient), and ETP-4852 gives every newly-created AD_User an empty
-- personal composition role at creation time (UserRoleAssignmentHandler
-- #ensurePersonalRoleForNewlyCreatedUser -> UserRoleCompositionService#createFreshPersonalRole),
-- correctly wired with org access (AD_Role_OrgAccess) and user defaults
-- (Default_Ad_Client_ID/Default_Ad_Org_ID/Default_M_Warehouse_ID/EM_SMFSWS_Default_WS_Role_ID)
-- via PersonalRoleAccessProvisioningService#createOrgAccess/applyUserDefaults. Neither front
-- retroactively touches a tenant/user that already existed when they shipped. This fix is the
-- one-time corrective backfill for those, per the L1 entry's routing decision (owner detection
-- and personal-role backfill as mutually exclusive steps of the SAME script, owner resolved
-- FIRST and excluded from the personal-role pass -- an owner keeps their pre-existing,
-- auto-granted is_client_admin='Y' "Company Admin" role, never a personal composition role).
--
-- Owner-detection heuristic (human-confirmed, ETP-4877 Jira description): the earliest-created
-- AD_User holding an active is_client_admin='Y' role for the client, ordered by AD_User.Created
-- ascending. Mirrors OwnerSupport#markAsOwnerIfNoneExists's own atomic
-- "UPDATE ... WHERE ad_user_id = :userId AND NOT EXISTS (client already has an owner)" shape,
-- just with the target user resolved by this heuristic instead of passed in directly -- so the
-- same "never overwrites, never moves ownership, safe on every re-run" guarantee holds.
--
-- Personal-role scope: "existing user" is read as every ACTIVE AD_User of the tenant with
-- C_BPartner_ID IS NULL. That column is the load-bearing distinction confirmed live on this DB:
-- every BP-contact-linked AD_User row (the F1-gap "Default Customer Contact" seeded per org, and
-- a large population of orphaned BP-contact test users on several tenants) has C_BPartner_ID SET
-- and holds zero AD_User_Roles rows; every genuine staff/login user (the ones with a `username`,
-- the ones an admin actually manages via "Usuarios") has C_BPartner_ID NULL. Minting a personal
-- role for a BP-contact row would be meaningless (it is never a login principal) -- this fix
-- never touches those rows.
--
-- SQL-first decision: this is deliberately @type: sql, not @type: webhook, even though it
-- reuses UserRoleCompositionService's identity/creation model column-for-column. Two reasons:
-- (1) AD_Role_Inheritance's window-access propagation is a Hibernate EventHandler side effect
-- (RoleInheritanceEventHandler/WindowAccessInjector), not a DB trigger -- but R16
-- (20260727T114306Z, gap H2) already proved a plain SQL INSERT...SELECT clone of a source role's
-- AD_Window_Access rows onto a target role reaches the identical end state a live composition
-- call would, without needing Hibernate at all. This fix's Step 2b mirrors that exact pattern,
-- reading the CURRENT AD_Window_Access rows of the resolved template so future grants (e.g.
-- ETP-4878's fuller matrix) are picked up automatically, not hardcoded. (2) A live sweep of
-- every tenant on this DB (2026-08-26) found NOT ONE currently-active user actually holding a
-- literal Finance/Sales/Purchasing/Inventory-named role (system or per-client R16 clone) -- see
-- "Live audit findings" below -- so today, in practice, every backfilled user resolves to the
-- documented "no meaningful prior access -> empty personal role" outcome; Step 2/2b exist for
-- correctness on a DIFFERENT environment or a future re-run, not because this DB needs them
-- today. Given that, and given the write shape (materialize a role + inheritance + a handful of
-- window-access rows) is squarely the same shape R1/R9/R16/R21/R23 already do in plain SQL, SQL
-- is sufficient and the webhook escape hatch is not justified here.
--
-- Live audit findings (etendogoclean, 2026-08-26, 41 real tenants)
-- --------------------------------------------------------------------------------------------
-- * Every tenant except "QA Testing" has EXACTLY ONE active is_client_admin holder (the owner
--   candidate). QA Testing has ZERO -- its is_client_admin "Admin" role is only referenced via
--   Default_Ad_Role_ID by demo users with default_ad_role_id NULL/unrelated; the owner-detection
--   subquery returns no row for it and Step 0 is a safe no-op there (0 rows updated). Flagged,
--   not fixed -- a tenant with no client-admin holder at all is a separate, deeper anomaly this
--   ticket's heuristic cannot resolve, and forcing an owner onto an arbitrary user would be a
--   product decision, not a mechanical backfill.
-- * ALL 84 R16-era per-client "Finance"/"Sales"/"Purchasing"/"Inventory" role clones (21 tenants
--   x 4 roles) have ZERO active AD_User_Roles rows and ZERO Default_Ad_Role_ID pointers, fleet
--   wide, including on the reference tenant (GOClient) and the multi-legal-entity demo tenant
--   (F&B International Group, which uses its OWN differently-named roles -- "F&B Espana, S.A -
--   Finance" etc -- not these). See the sibling R27 fix (gap H2) for the corrective deactivation.
-- * BUG-1 (ETP-4906 QA finding, role-inheritance AD_Window_Access ownership corruption) does NOT
--   affect this fix: Step 2b's own window-access clone reads ONLY the resolved system template's
--   OWN AD_Window_Access rows (ad_client_id='0' always, per SystemRoleTemplates/R23 -- system
--   templates cannot themselves suffer the corruption, which requires a tenant-owned role
--   inheriting a system-level template's grant into ITS OWN ad_client_id, the exact overlap
--   WindowAccessOverlapCorruptionGuard now prevents going forward). This fix never reads
--   GOClient's corrupted "RoleFinanzas" role at all -- it is a hand-authored demo role, not a
--   template, and is out of scope. Documented per the ticket's explicit requirement to state why
--   this migration's logic does not depend on the corrupted field, per option (b).
-- * NEW SCOPE (added mid-delivery, 2026-08-26): AD_Role.EM_ETGO_Show_Acct_Fields (ETP-4520,
--   gates the "showAccountingFields" capability SFWindowAccessMap exposes) is a value that must
--   be DERIVED from whether a role currently inherits from the system Finance template, not an
--   independent fact -- SFWindowAccessMap#resolveShowAccountingFields reads it as a flat stored
--   column with no join to AD_Role_Inheritance at read time, so whoever changes a role's
--   inheritance is responsible for keeping the column in sync. Live sweep found this WAS
--   drifting: the system Finance template itself read 'N' (contradicts the column's own purpose
--   -- corrected in Step 8a), and 24 active, non-template, non-client-admin roles fleet-wide
--   (including GOClient's "RoleFinanzas"/"Classic Role"/"Personal - SantoYes" and an E2E tenant's
--   "Personal - ETP-4999 Sticky Verify") already inherit from Finance today via
--   AD_Role_Inheritance yet still read 'N' -- a real, live bug, not hypothetical. Step 8b fixes
--   every such role at the tenant (not only ones this fix's own Steps 1-7 touch) and is the
--   retroactive half; the "going forward" half is a Java change alongside this fix --
--   UserRoleCompositionService#reconcileInheritances now calls a new
--   syncShowAccountingFieldsFlag(personalRole, templates) at the end of every reconciliation
--   (add or remove), so AssignTemplateRolesControl's live save path self-heals this flag on every
--   future inheritance change instead of only at role-creation time. See that class's own
--   javadoc for the full rationale; this SQL's Step 8b and the Java method use the IDENTICAL
--   predicate (active AD_Role_Inheritance row -> the system Finance template id) and must be
--   kept in lockstep.
--
-- Steps 4/5/6 scope narrowing (found via live testing, not assumed up front)
-- --------------------------------------------------------------------------------------------
-- Org-access backfill (Step 4), defaults backfill (Step 5) and the AD_User_Roles single-active-
-- row enforcement (Step 6) only ever touch a user's default role when it is EITHER the
-- deterministic personal-role id this fix itself mints, OR already named "Personal – %" (the
-- established ETP-4852 naming convention) -- never any other non-template, non-client-admin
-- role a user's Default_Ad_Role_ID happens to point at. A first draft scoped these three steps
-- to "any non-template, non-admin default role" and broke on GOClient's real data: two DIFFERENT
-- test users ("11111" and "test") both have Default_Ad_Role_ID pointing at the SAME shared
-- "Classic Role" (zero AD_User_Roles rows for either -- an unrelated, pre-existing QA artifact),
-- which the isReusablePersonalRole-style check legitimately treats as "reusable" for EITHER user
-- individually (zero assignments = safe to reuse) -- but Step 6's blanket "ensure a matching
-- AD_User_Roles row exists" would then insert ONE row per user pointing at that SAME shared role,
-- immediately breaking its own exclusivity for both (2 active rows, not 0 or 1) and granting two
-- users real access to a role neither previously had a real AD_User_Roles-backed assignment for
-- -- well outside what item 5 asked for ("remove the row(s) it superseded", not manufacture a new
-- shared one). The naming-convention/deterministic-id guard sidesteps this entirely: a genuinely
-- ambiguous/shared legacy default role is left untouched by Steps 4-6, exactly as it was before
-- this fix ran. Step 8b (the EM_ETGO_Show_Acct_Fields sync) is DELIBERATELY NOT narrowed the same
-- way -- that rule is meant to apply to any active, non-template, non-admin role at the tenant
-- (including hand-authored ones like GOClient's "RoleFinanzas"), per its own scope note above.
--
-- Idempotency
-- --------------------------------------------------------------------------------------------
-- Every step is independently NOT EXISTS / IS DISTINCT FROM guarded. The personal role's id is a
-- DETERMINISTIC hash of the owning user's id (UPPER(MD5(user_id || ':ETP4877-personal-role'))),
-- not get_uuid() -- so a retried run after a partial failure (or any later step in this same
-- @apply) recomputes the IDENTICAL id instead of minting a second role, and every step can
-- independently re-derive "this user's personal role id" without reading back an earlier step's
-- generated value. @check mirrors every step's own WHERE existence check.

-- @check
-- Returns >=1 row when the fix is needed for :client_id. 0 rows => SKIPPED_NOT_NEEDED.
SELECT 1
FROM ad_client c
WHERE c.ad_client_id = :client_id
  AND EXISTS (
    SELECT 1 FROM ad_user u2
    JOIN ad_user_roles ur2 ON ur2.ad_user_id = u2.ad_user_id AND ur2.isactive = 'Y'
    JOIN ad_role r2 ON r2.ad_role_id = ur2.ad_role_id AND r2.is_client_admin = 'Y' AND r2.ad_client_id = :client_id
    WHERE u2.ad_client_id = :client_id AND u2.isactive = 'Y'
  )
  AND NOT EXISTS (SELECT 1 FROM ad_user u3 WHERE u3.ad_client_id = :client_id AND u3.em_etgo_is_owner = 'Y')
UNION ALL
SELECT 1
FROM ad_user u
WHERE u.ad_client_id = :client_id
  AND u.isactive = 'Y'
  AND u.c_bpartner_id IS NULL
  AND u.em_etgo_is_owner <> 'Y'
  AND NOT EXISTS (
    SELECT 1 FROM ad_role dr
    WHERE dr.ad_role_id = u.default_ad_role_id
      AND dr.isactive = 'Y' AND dr.istemplate <> 'Y' AND dr.is_client_admin <> 'Y'
      AND dr.ad_client_id = u.ad_client_id
      AND NOT EXISTS (SELECT 1 FROM ad_role_inheritance ri WHERE ri.inherit_from = dr.ad_role_id)
      AND (
        NOT EXISTS (SELECT 1 FROM ad_user_roles ur WHERE ur.ad_role_id = dr.ad_role_id AND ur.isactive = 'Y')
        OR (
          (SELECT count(*) FROM ad_user_roles ur2 WHERE ur2.ad_role_id = dr.ad_role_id AND ur2.isactive = 'Y') = 1
          AND EXISTS (SELECT 1 FROM ad_user_roles ur3 WHERE ur3.ad_role_id = dr.ad_role_id AND ur3.isactive = 'Y' AND ur3.ad_user_id = u.ad_user_id)
        )
      )
  )
  AND NOT EXISTS (
    SELECT 1 FROM ad_role rr WHERE rr.ad_client_id = u.ad_client_id
      AND rr.name = LEFT('Personal – ' || COALESCE(NULLIF(TRIM(u.name), ''), u.username, u.ad_user_id), 60)
  )
UNION ALL
SELECT 1
FROM ad_user u
JOIN ad_role pr ON pr.ad_role_id = UPPER(MD5(u.ad_user_id || ':ETP4877-personal-role')) AND pr.isactive = 'Y'
JOIN ad_user_roles ur ON ur.ad_user_id = u.ad_user_id AND ur.isactive = 'Y' AND ur.ad_role_id <> pr.ad_role_id
JOIN ad_role cur ON cur.ad_role_id = ur.ad_role_id AND cur.name IN ('Finance', 'Sales', 'Purchasing', 'Inventory')
JOIN ad_role tmpl ON tmpl.ad_client_id = '0' AND tmpl.name = cur.name AND tmpl.istemplate = 'Y' AND tmpl.isactive = 'Y'
WHERE u.ad_client_id = :client_id
  AND NOT EXISTS (SELECT 1 FROM ad_role_inheritance ri3 WHERE ri3.ad_role_id = pr.ad_role_id)
UNION ALL
SELECT 1
FROM ad_role_inheritance ri
JOIN ad_role pr ON pr.ad_role_id = ri.ad_role_id AND pr.ad_client_id = :client_id
JOIN ad_window_access swa ON swa.ad_role_id = ri.inherit_from AND swa.isactive = 'Y'
WHERE ri.isactive = 'Y'
  AND NOT EXISTS (
    SELECT 1 FROM ad_window_access x WHERE x.ad_role_id = ri.ad_role_id AND x.ad_window_id = swa.ad_window_id AND x.isactive = 'Y'
  )
UNION ALL
SELECT 1
FROM ad_user u
JOIN ad_role pr ON pr.ad_role_id = u.default_ad_role_id
WHERE u.ad_client_id = :client_id AND u.isactive = 'Y' AND u.em_etgo_is_owner <> 'Y'
  AND pr.isactive = 'Y' AND pr.istemplate <> 'Y' AND pr.is_client_admin <> 'Y' AND (pr.ad_role_id = UPPER(MD5(u.ad_user_id || ':ETP4877-personal-role')) OR pr.name LIKE 'Personal – %')
  AND (
    NOT EXISTS (SELECT 1 FROM ad_role_orgaccess x WHERE x.ad_role_id = pr.ad_role_id AND x.ad_org_id = u.ad_org_id)
    OR NOT EXISTS (SELECT 1 FROM ad_role_orgaccess x WHERE x.ad_role_id = pr.ad_role_id AND x.ad_org_id = '0')
  )
UNION ALL
SELECT 1
FROM ad_user u
JOIN ad_role pr ON pr.ad_role_id = u.default_ad_role_id
WHERE u.ad_client_id = :client_id AND u.isactive = 'Y' AND u.em_etgo_is_owner <> 'Y'
  AND pr.isactive = 'Y' AND pr.istemplate <> 'Y' AND pr.is_client_admin <> 'Y' AND (pr.ad_role_id = UPPER(MD5(u.ad_user_id || ':ETP4877-personal-role')) OR pr.name LIKE 'Personal – %')
  AND (
    u.default_ad_client_id IS DISTINCT FROM u.ad_client_id
    OR (u.ad_org_id IS NOT NULL AND u.default_ad_org_id IS DISTINCT FROM u.ad_org_id)
    OR u.em_smfsws_default_ws_role_id IS DISTINCT FROM pr.ad_role_id
  )
UNION ALL
SELECT 1
FROM ad_user u
WHERE u.ad_client_id = :client_id AND u.isactive = 'Y' AND u.em_etgo_is_owner <> 'Y'
  AND u.default_ad_role_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM ad_role pr WHERE pr.ad_role_id = u.default_ad_role_id AND pr.istemplate <> 'Y' AND pr.is_client_admin <> 'Y' AND (pr.ad_role_id = UPPER(MD5(u.ad_user_id || ':ETP4877-personal-role')) OR pr.name LIKE 'Personal – %'))
  AND (
    EXISTS (
      SELECT 1 FROM ad_user_roles ur WHERE ur.ad_user_id = u.ad_user_id AND ur.isactive = 'Y' AND ur.ad_role_id <> u.default_ad_role_id
    )
    OR NOT EXISTS (
      SELECT 1 FROM ad_user_roles ur2 WHERE ur2.ad_user_id = u.ad_user_id AND ur2.ad_role_id = u.default_ad_role_id AND ur2.isactive = 'Y'
    )
  )
UNION ALL
SELECT 1 WHERE EXISTS (
  SELECT 1 FROM ad_role f WHERE f.ad_role_id = 'B88A34B5D1874F8685FA6F3C3A609412' AND f.em_etgo_show_acct_fields <> 'Y'
)
UNION ALL
SELECT 1
FROM ad_role r
WHERE r.ad_client_id = :client_id AND r.isactive = 'Y' AND r.istemplate <> 'Y' AND r.is_client_admin <> 'Y'
  AND r.em_etgo_show_acct_fields <> (CASE WHEN EXISTS (
      SELECT 1 FROM ad_role_inheritance ri2
      WHERE ri2.ad_role_id = r.ad_role_id AND ri2.isactive = 'Y' AND ri2.inherit_from = 'B88A34B5D1874F8685FA6F3C3A609412'
    ) THEN 'Y' ELSE 'N' END)
LIMIT 1;

-- @apply

-- Step 0 -- owner detection (gap L1). Single atomic UPDATE, same shape as
-- OwnerSupport#markAsOwnerIfNoneExists: the "already has an owner" check and the target-user
-- resolution both live in the same statement, so two concurrent runs (or a re-run) can never
-- double-assign. 0 rows updated is the expected, safe outcome once an owner exists, or when the
-- client has no is_client_admin holder at all (e.g. "QA Testing" -- flagged above, not fixed).
UPDATE ad_user
SET em_etgo_is_owner = 'Y', updated = now(), updatedby = '0'
WHERE ad_client_id = :client_id
  AND ad_user_id = (
    SELECT u2.ad_user_id
    FROM ad_user u2
    JOIN ad_user_roles ur2 ON ur2.ad_user_id = u2.ad_user_id AND ur2.isactive = 'Y'
    JOIN ad_role r2 ON r2.ad_role_id = ur2.ad_role_id AND r2.is_client_admin = 'Y' AND r2.ad_client_id = :client_id
    WHERE u2.ad_client_id = :client_id AND u2.isactive = 'Y'
    ORDER BY u2.created ASC, u2.ad_user_id ASC
    LIMIT 1
  )
  AND NOT EXISTS (SELECT 1 FROM ad_user u3 WHERE u3.ad_client_id = :client_id AND u3.em_etgo_is_owner = 'Y');

-- Step 1 -- mint a personal role (deterministic id) for every active, non-BP-contact, non-owner
-- user of :client_id who does not already have a reusable one (mirrors
-- UserRoleCompositionService#isReusablePersonalRole exactly: active, non-template,
-- non-client-admin, same client, not itself an AD_Role_Inheritance InheritFrom target, and
-- exclusively assigned to -- or never assigned via -- AD_User_Roles for this one user). A
-- name-collision candidate is skipped (never crashes the apply) rather than inserted.
INSERT INTO ad_role (
  ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby,
  name, description, userlevel, ismanual, istemplate, is_client_admin, isadvanced,
  isrestrictbackend, isportal, isportaladmin, iswebserviceenabled, em_etgo_show_acct_fields
)
SELECT
  UPPER(MD5(u.ad_user_id || ':ETP4877-personal-role')), u.ad_client_id, '0', 'Y', now(), '0', now(), '0',
  LEFT('Personal – ' || COALESCE(NULLIF(TRIM(u.name), ''), u.username, u.ad_user_id), 60),
  'Personal composition role (ETP-4852/ETP-4877 retrofit) — access derives from its template inheritances; do not edit directly.',
  '  O', 'Y', 'N', 'N', 'N', 'N', 'N', 'N', 'N', 'N'
FROM ad_user u
WHERE u.ad_client_id = :client_id
  AND u.isactive = 'Y'
  AND u.c_bpartner_id IS NULL
  AND u.em_etgo_is_owner <> 'Y'
  AND NOT EXISTS (
    SELECT 1 FROM ad_role dr
    WHERE dr.ad_role_id = u.default_ad_role_id
      AND dr.isactive = 'Y' AND dr.istemplate <> 'Y' AND dr.is_client_admin <> 'Y'
      AND dr.ad_client_id = u.ad_client_id
      AND NOT EXISTS (SELECT 1 FROM ad_role_inheritance ri WHERE ri.inherit_from = dr.ad_role_id)
      AND (
        NOT EXISTS (SELECT 1 FROM ad_user_roles ur WHERE ur.ad_role_id = dr.ad_role_id AND ur.isactive = 'Y')
        OR (
          (SELECT count(*) FROM ad_user_roles ur2 WHERE ur2.ad_role_id = dr.ad_role_id AND ur2.isactive = 'Y') = 1
          AND EXISTS (SELECT 1 FROM ad_user_roles ur3 WHERE ur3.ad_role_id = dr.ad_role_id AND ur3.isactive = 'Y' AND ur3.ad_user_id = u.ad_user_id)
        )
      )
  )
  AND NOT EXISTS (
    SELECT 1 FROM ad_role rr WHERE rr.ad_client_id = u.ad_client_id
      AND rr.name = LEFT('Personal – ' || COALESCE(NULLIF(TRIM(u.name), ''), u.username, u.ad_user_id), 60)
  )
  AND NOT EXISTS (SELECT 1 FROM ad_role ex WHERE ex.ad_role_id = UPPER(MD5(u.ad_user_id || ':ETP4877-personal-role')));

-- Step 2 -- populate the freshly-minted role's inheritance from the user's CURRENT actual access
-- (item 3): for each of the user's active AD_User_Roles rows (other than the new personal role
-- itself) whose role NAME matches a known system-template family, link the personal role's
-- inheritance to the SYSTEM-level template counterpart (ad_client_id='0') -- never to a
-- per-client duplicate (retired by the sibling R27 fix). Guarded to roles with ZERO existing
-- inheritance rows, so this only ever touches a role this fix itself just created or an old
-- empty personal role nothing has composed yet -- never an already-composed role
-- UserRoleCompositionService is managing live. No match -> empty personal role (matches the "no
-- other role" principle for brand-new users; the confirmed live outcome for 100% of candidates
-- on this DB today, see the header note).
INSERT INTO ad_role_inheritance (
  ad_role_inheritance_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby,
  seqno, inherit_from, ad_role_id
)
SELECT DISTINCT get_uuid(), pr.ad_client_id, pr.ad_org_id, 'Y', now(), '0', now(), '0',
  10, tmpl.ad_role_id, pr.ad_role_id
FROM ad_user u
JOIN ad_role pr ON pr.ad_role_id = UPPER(MD5(u.ad_user_id || ':ETP4877-personal-role')) AND pr.isactive = 'Y'
JOIN ad_user_roles ur ON ur.ad_user_id = u.ad_user_id AND ur.isactive = 'Y' AND ur.ad_role_id <> pr.ad_role_id
JOIN ad_role cur ON cur.ad_role_id = ur.ad_role_id AND cur.name IN ('Finance', 'Sales', 'Purchasing', 'Inventory')
JOIN ad_role tmpl ON tmpl.ad_client_id = '0' AND tmpl.name = cur.name AND tmpl.istemplate = 'Y' AND tmpl.isactive = 'Y'
WHERE u.ad_client_id = :client_id
  AND u.isactive = 'Y' AND u.c_bpartner_id IS NULL AND u.em_etgo_is_owner <> 'Y'
  AND NOT EXISTS (SELECT 1 FROM ad_role_inheritance ri3 WHERE ri3.ad_role_id = pr.ad_role_id)
  AND NOT EXISTS (
    SELECT 1 FROM ad_role_inheritance ri4 WHERE ri4.ad_role_id = pr.ad_role_id AND ri4.inherit_from = tmpl.ad_role_id
  );

-- Step 2b -- materialize the window access AD_Role_Inheritance's Hibernate-side propagation
-- would otherwise produce (AD_Role_Inheritance alone grants nothing; see the header note).
-- Mirrors R16 Step 2's own clone-from-source-role pattern, generalized to ANY inheritance row at
-- :client_id missing its corresponding grant -- so a future template widening (ETP-4878) is
-- picked up on the next run, not only at the moment this fix first creates the inheritance.
INSERT INTO ad_window_access (
  ad_window_access_id, ad_window_id, ad_role_id, ad_client_id, ad_org_id, isactive,
  created, createdby, updated, updatedby, isreadwrite, inherited_from
)
SELECT get_uuid(), swa.ad_window_id, ri.ad_role_id, pr.ad_client_id, pr.ad_org_id, 'Y',
  now(), '0', now(), '0', swa.isreadwrite, ri.inherit_from
FROM ad_role_inheritance ri
JOIN ad_role pr ON pr.ad_role_id = ri.ad_role_id AND pr.ad_client_id = :client_id
JOIN ad_window_access swa ON swa.ad_role_id = ri.inherit_from AND swa.isactive = 'Y'
WHERE ri.isactive = 'Y'
  AND NOT EXISTS (
    SELECT 1 FROM ad_window_access x WHERE x.ad_role_id = ri.ad_role_id AND x.ad_window_id = swa.ad_window_id AND x.isactive = 'Y'
  );

-- Step 3 -- point AD_User.Default_Ad_Role_ID at the (possibly just-created) personal role, for
-- every candidate whose deterministic personal role now exists. Self-limiting: a user who
-- already had a DIFFERENT reusable personal role never gets a Step-1 row at their deterministic
-- id, so this EXISTS guard alone correctly excludes them without re-deriving the full
-- reusability check.
UPDATE ad_user u
SET default_ad_role_id = UPPER(MD5(u.ad_user_id || ':ETP4877-personal-role')), updated = now(), updatedby = '0'
WHERE u.ad_client_id = :client_id
  AND u.isactive = 'Y'
  AND u.c_bpartner_id IS NULL
  AND u.em_etgo_is_owner <> 'Y'
  AND EXISTS (
    SELECT 1 FROM ad_role pr WHERE pr.ad_role_id = UPPER(MD5(u.ad_user_id || ':ETP4877-personal-role')) AND pr.isactive = 'Y'
  )
  AND u.default_ad_role_id IS DISTINCT FROM UPPER(MD5(u.ad_user_id || ':ETP4877-personal-role'));

-- Step 4 -- org-access backfill (item 4, first half) for EVERY personal-role holder, new or
-- pre-existing -- mirrors PersonalRoleAccessProvisioningService#createOrgAccess exactly (the
-- role's own org, plus the wildcard '*'). Confirmed live: several pre-ETP-4852-fix personal
-- roles on this DB (e.g. GOClient's "Personal – SantoYes"/"Personal – CompositionUser"/
-- "Personal – NewUsertest") have ZERO AD_Role_OrgAccess rows today.
INSERT INTO ad_role_orgaccess (ad_role_orgaccess_id, ad_role_id, ad_org_id, ad_client_id, isactive, created, createdby, updated, updatedby, is_org_admin)
SELECT get_uuid(), need.ad_role_id, need.org_id, need.ad_client_id, 'Y', now(), '0', now(), '0', 'N'
FROM (
  SELECT DISTINCT pr.ad_role_id, o.org_id, pr.ad_client_id
  FROM ad_user u
  JOIN ad_role pr ON pr.ad_role_id = u.default_ad_role_id
  CROSS JOIN LATERAL (VALUES (u.ad_org_id), ('0')) AS o(org_id)
  WHERE u.ad_client_id = :client_id AND u.isactive = 'Y' AND u.em_etgo_is_owner <> 'Y'
    AND pr.isactive = 'Y' AND pr.istemplate <> 'Y' AND pr.is_client_admin <> 'Y' AND (pr.ad_role_id = UPPER(MD5(u.ad_user_id || ':ETP4877-personal-role')) OR pr.name LIKE 'Personal – %')
) need
WHERE NOT EXISTS (SELECT 1 FROM ad_role_orgaccess x WHERE x.ad_role_id = need.ad_role_id AND x.ad_org_id = need.org_id);

-- Step 5 -- user-defaults backfill (item 4, second half) for EVERY personal-role holder, new or
-- pre-existing -- mirrors PersonalRoleAccessProvisioningService#applyUserDefaults exactly.
-- Confirmed live: GOClient's "Santiago" (Personal – SantoYes) has Default_Ad_Client_ID pointing
-- at a DIFFERENT tenant's client entirely and no EM_SMFSWS_Default_WS_Role_ID at all -- the
-- exact historical bug that method's own javadoc documents, now corrected retroactively.
UPDATE ad_user u
SET default_ad_client_id = u.ad_client_id,
    default_ad_org_id = COALESCE(u.ad_org_id, u.default_ad_org_id),
    default_m_warehouse_id = COALESCE(
      (SELECT w.m_warehouse_id FROM m_warehouse w WHERE w.ad_org_id = u.ad_org_id AND w.isactive = 'Y' ORDER BY w.m_warehouse_id LIMIT 1),
      u.default_m_warehouse_id
    ),
    em_smfsws_default_ws_role_id = pr.ad_role_id,
    updated = now(), updatedby = '0'
FROM ad_role pr
WHERE pr.ad_role_id = u.default_ad_role_id
  AND u.ad_client_id = :client_id AND u.isactive = 'Y' AND u.em_etgo_is_owner <> 'Y'
  AND pr.isactive = 'Y' AND pr.istemplate <> 'Y' AND pr.is_client_admin <> 'Y' AND (pr.ad_role_id = UPPER(MD5(u.ad_user_id || ':ETP4877-personal-role')) OR pr.name LIKE 'Personal – %')
  AND (
    u.default_ad_client_id IS DISTINCT FROM u.ad_client_id
    OR (u.ad_org_id IS NOT NULL AND u.default_ad_org_id IS DISTINCT FROM u.ad_org_id)
    OR u.em_smfsws_default_ws_role_id IS DISTINCT FROM pr.ad_role_id
  );

-- Step 6 -- AD_User_Roles single-active-row enforcement (item 5), scoped to every personal-role
-- holder, new or pre-existing (never the owner/client-admin row). Mirrors
-- UserRoleSyncSupport#syncSingleActiveUserRole: 6a removes stale extra active rows, 6b reactivates
-- a matching inactive row if one exists (UNIQUE(ad_user_id, ad_role_id) means a prior
-- deactivation must be reactivated, not re-inserted), 6c inserts the row if truly absent.
DELETE FROM ad_user_roles ur
USING ad_user u
WHERE ur.ad_user_id = u.ad_user_id
  AND u.ad_client_id = :client_id AND u.isactive = 'Y' AND u.em_etgo_is_owner <> 'Y'
  AND u.default_ad_role_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM ad_role pr WHERE pr.ad_role_id = u.default_ad_role_id AND pr.istemplate <> 'Y' AND pr.is_client_admin <> 'Y' AND (pr.ad_role_id = UPPER(MD5(u.ad_user_id || ':ETP4877-personal-role')) OR pr.name LIKE 'Personal – %'))
  AND ur.isactive = 'Y'
  AND ur.ad_role_id <> u.default_ad_role_id;

UPDATE ad_user_roles ur
SET isactive = 'Y', updated = now(), updatedby = '0'
FROM ad_user u
WHERE ur.ad_user_id = u.ad_user_id
  AND ur.ad_role_id = u.default_ad_role_id
  AND u.ad_client_id = :client_id AND u.isactive = 'Y' AND u.em_etgo_is_owner <> 'Y'
  AND EXISTS (SELECT 1 FROM ad_role pr WHERE pr.ad_role_id = u.default_ad_role_id AND pr.istemplate <> 'Y' AND pr.is_client_admin <> 'Y' AND (pr.ad_role_id = UPPER(MD5(u.ad_user_id || ':ETP4877-personal-role')) OR pr.name LIKE 'Personal – %'))
  AND ur.isactive <> 'Y';

INSERT INTO ad_user_roles (ad_user_roles_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, ad_user_id, ad_role_id, is_role_admin)
SELECT get_uuid(), u.ad_client_id, pr.ad_org_id, 'Y', now(), '0', now(), '0', u.ad_user_id, pr.ad_role_id, 'N'
FROM ad_user u
JOIN ad_role pr ON pr.ad_role_id = u.default_ad_role_id AND pr.istemplate <> 'Y' AND pr.is_client_admin <> 'Y' AND (pr.ad_role_id = UPPER(MD5(u.ad_user_id || ':ETP4877-personal-role')) OR pr.name LIKE 'Personal – %')
WHERE u.ad_client_id = :client_id AND u.isactive = 'Y' AND u.em_etgo_is_owner <> 'Y'
  AND NOT EXISTS (SELECT 1 FROM ad_user_roles ur WHERE ur.ad_role_id = pr.ad_role_id AND ur.ad_user_id = u.ad_user_id);

-- Step 7 -- multiple-personal-role cleanup: a user can only ever have ONE reusable personal role
-- (Step 1's own guard never mints a second one), so no separate role-level cleanup is needed
-- beyond Step 6's per-user AD_User_Roles reconciliation above.

-- Step 8a -- system-level health check (new scope, 2026-08-26): the Finance template itself must
-- expose accounting fields. Singleton, unscoped by :client_id (same shape as R23) -- converges
-- once, harmless on every later tenant's run of this same fix.
UPDATE ad_role
SET em_etgo_show_acct_fields = 'Y', updated = now(), updatedby = '0'
WHERE ad_role_id = 'B88A34B5D1874F8685FA6F3C3A609412' AND em_etgo_show_acct_fields <> 'Y';

-- Step 8b -- derived-flag sync (new scope, 2026-08-26): every active, non-template,
-- non-client-admin role at :client_id gets EM_ETGO_Show_Acct_Fields set to 'Y' iff it currently
-- inherits from the system Finance template, 'N' otherwise -- both directions, and every such
-- role at the tenant, not only ones Steps 1-7 touched. Must be kept in lockstep with
-- UserRoleCompositionService#syncShowAccountingFieldsFlag (same predicate, Java side, for the
-- live "going forward" path).
UPDATE ad_role r
SET em_etgo_show_acct_fields = CASE WHEN EXISTS (
      SELECT 1 FROM ad_role_inheritance ri
      WHERE ri.ad_role_id = r.ad_role_id AND ri.isactive = 'Y' AND ri.inherit_from = 'B88A34B5D1874F8685FA6F3C3A609412'
    ) THEN 'Y' ELSE 'N' END,
    updated = now(), updatedby = '0'
WHERE r.ad_client_id = :client_id AND r.isactive = 'Y' AND r.istemplate <> 'Y' AND r.is_client_admin <> 'Y'
  AND r.em_etgo_show_acct_fields <> (CASE WHEN EXISTS (
      SELECT 1 FROM ad_role_inheritance ri2
      WHERE ri2.ad_role_id = r.ad_role_id AND ri2.isactive = 'Y' AND ri2.inherit_from = 'B88A34B5D1874F8685FA6F3C3A609412'
    ) THEN 'Y' ELSE 'N' END);

-- @report
-- Read-only, runs after a successful @apply. Surfaces anything this fix deliberately could not
-- resolve mechanically: a tenant with no is_client_admin holder at all (owner detection has
-- nothing to act on), and any candidate user skipped by Step 1's name-collision safety valve.
SELECT 'no_owner_candidate' AS issue, c.ad_client_id AS client_id, NULL AS user_id, NULL AS detail
FROM ad_client c
WHERE c.ad_client_id = :client_id
  AND NOT EXISTS (SELECT 1 FROM ad_user u3 WHERE u3.ad_client_id = :client_id AND u3.em_etgo_is_owner = 'Y')
  AND NOT EXISTS (
    SELECT 1 FROM ad_user u2
    JOIN ad_user_roles ur2 ON ur2.ad_user_id = u2.ad_user_id AND ur2.isactive = 'Y'
    JOIN ad_role r2 ON r2.ad_role_id = ur2.ad_role_id AND r2.is_client_admin = 'Y' AND r2.ad_client_id = :client_id
    WHERE u2.ad_client_id = :client_id AND u2.isactive = 'Y'
  )
UNION ALL
SELECT 'personal_role_name_collision' AS issue, u.ad_client_id AS client_id, u.ad_user_id AS user_id,
  LEFT('Personal – ' || COALESCE(NULLIF(TRIM(u.name), ''), u.username, u.ad_user_id), 60) AS detail
FROM ad_user u
WHERE u.ad_client_id = :client_id
  AND u.isactive = 'Y' AND u.c_bpartner_id IS NULL AND u.em_etgo_is_owner <> 'Y'
  AND NOT EXISTS (SELECT 1 FROM ad_role ex WHERE ex.ad_role_id = UPPER(MD5(u.ad_user_id || ':ETP4877-personal-role')))
  AND EXISTS (
    SELECT 1 FROM ad_role rr WHERE rr.ad_client_id = u.ad_client_id
      AND rr.name = LEFT('Personal – ' || COALESCE(NULLIF(TRIM(u.name), ''), u.username, u.ad_user_id), 60)
  )
  AND NOT EXISTS (
    SELECT 1 FROM ad_role dr
    WHERE dr.ad_role_id = u.default_ad_role_id
      AND dr.isactive = 'Y' AND dr.istemplate <> 'Y' AND dr.is_client_admin <> 'Y'
      AND dr.ad_client_id = u.ad_client_id
      AND NOT EXISTS (SELECT 1 FROM ad_role_inheritance ri WHERE ri.inherit_from = dr.ad_role_id)
  );
