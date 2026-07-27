-- @id: R16-webhook-role-access
-- @gap: H1
-- @risk: high
-- @type: sql
-- @description: Grant every one of the tenant's active AD_Role rows dispatch access to the SFListMenu / SFWindowAccessMap / SFRolesOverview webhooks, so non-System-Administrator roles aren't 404'd out of every window

-- Background
-- --------------------------------------------------------------------------------------------
-- SMFWHE_DEFINEDWEBHOOK_ROLE is the webhook dispatcher's own authorization gate: a role that has
-- no row for a given webhook gets a flat 404 from WebhookServiceHandler before the webhook's own
-- Java logic ever runs (NeoAccessHelper.isAdminOrClientAdmin / per-window AD_Window_Access checks
-- never get a chance to execute). Discovered 2026-07-27 while manually testing ETP-4513/4514/4520
-- together: GOClient Admin (a real client-admin role, ad_role.is_client_admin='Y') saw a fully
-- unfiltered sidebar (SFListMenu 404s -> useRoleMenu() fails -> AppLayout's deliberate fail-OPEN
-- on fetch failure shows everything) yet EVERY window denied (SFWindowAccessMap 404s ->
-- fetchWindowAccess fails -> AuthContext's fail-CLOSED {} default -> WindowAccessGuard blocks
-- everything). Confirmed via `docker logs`/Tomcat access log: both endpoints returned 404, not
-- an error from the Java handler.
--
-- ETP-4520's own GOClient sample-data seed (referencedata/sampledata/GOClient/
-- SMFWHE_DEFINEDWEBHOOK_ROLE.xml) already grants all 6 of GOClient's roles access to SFListMenu
-- and SFWindowAccessMap, and this fix's own preventive twin (see below) extends it to
-- SFRolesOverview too -- but referencedata is sample/reference data, only ever applied at
-- initial/fresh tenant creation, never reapplied by update.database/smartbuild on an existing
-- install. Every tenant provisioned before this row set existed keeps whatever
-- SMFWHE_DEFINEDWEBHOOK_ROLE rows its module-level default seed shipped -- observed here as
-- ad_role_id = '0' (System Administrator) ONLY. The moment ETP-4520's WindowAccessGuard goes
-- live on any such tenant, every non-system-admin role loses access to every window at once --
-- exactly the "will break all roles access" risk this fix exists to close before that merge
-- lands, not deferred to a later phase.
--
-- Scope: every ACTIVE role of the tenant, not a hardcoded role-name/id list. Different tenants
-- have their own AD_Role rows (different ids than GOClient's), and ALL of them need SFListMenu +
-- SFWindowAccessMap to load a menu/window-access map at all; SFRolesOverview is safe to grant
-- broadly too since its OWN Java logic (not this table) already restricts the actual payload to
-- admin/client-admin callers, returning {"roles": []} for everyone else.
--
-- The 3 webhook ids below are fixed, system-level (ad_client_id = '0') rows from
-- com.etendoerp.go's own module seed (src-db/database/sourcedata/SMFWHE_DEFINEDWEBHOOK.xml) --
-- identical across every Etendo GO installation, safe to hardcode.
--
-- Idempotency
-- --------------------------------------------------------------------------------------------
-- @check returns >=1 row while any active role of the tenant is missing a row for any of the 3
-- webhooks. @apply is guarded the same way (NOT EXISTS per role x webhook pair), so a re-run
-- (or a tenant that already has a partial grant) matches only what's still missing.
--
-- Preventive twin (new tenants born correct -- no CUT bump)
-- --------------------------------------------------------------------------------------------
-- Static: referencedata/sampledata/GOClient/SMFWHE_DEFINEDWEBHOOK_ROLE.xml now also grants
-- SFRolesOverview to GOClient's 6 roles (it previously only covered SFListMenu/SFWindowAccessMap
-- -- a gap in ETP-4513's own seed data, closed alongside this fix). A fresh GOClient install is
-- therefore already fully covered for all 3 webhooks; this .sql only repairs tenants (GOClient's
-- own local dev copy included) provisioned before that seed existed.
-- ONBOARDING_PROVISIONED_THROUGH is intentionally NOT bumped: this .sql only repairs existing
-- tenants; new tenants are born correct via the sampledata above.

-- @check
-- Returns >=1 row when at least one active role of the tenant is missing a grant for at least
-- one of the 3 webhooks. 0 rows => SKIPPED_NOT_NEEDED, @apply never runs.
SELECT 1
FROM ad_role r
CROSS JOIN smfwhe_definedwebhook w
WHERE r.ad_client_id = :client_id
  AND r.isactive = 'Y'
  AND w.ad_client_id = '0'
  AND w.name IN ('SFListMenu', 'SFWindowAccessMap', 'SFRolesOverview')
  AND w.isactive = 'Y'
  AND NOT EXISTS (
    SELECT 1 FROM smfwhe_definedwebhook_role wr
    WHERE wr.ad_role_id = r.ad_role_id
      AND wr.smfwhe_definedwebhook_id = w.smfwhe_definedwebhook_id
      AND wr.isactive = 'Y'
  )
LIMIT 1;

-- @apply
-- One SMFWHE_DEFINEDWEBHOOK_ROLE row per (active tenant role, webhook) pair still missing.
-- ad_org_id '0' matches every existing row for this table (webhook grants are client-wide, not
-- org-scoped). PKs minted per row with get_uuid() since the row count varies per tenant.
INSERT INTO smfwhe_definedwebhook_role (
  smfwhe_definedwebhook_role_id, ad_client_id, ad_org_id, isactive,
  created, createdby, updated, updatedby,
  ad_role_id, smfwhe_definedwebhook_id, ad_module_id
)
SELECT
  get_uuid(), :client_id, '0', 'Y',
  now(), '0', now(), '0',
  r.ad_role_id, w.smfwhe_definedwebhook_id, w.ad_module_id
FROM ad_role r
CROSS JOIN smfwhe_definedwebhook w
WHERE r.ad_client_id = :client_id
  AND r.isactive = 'Y'
  AND w.ad_client_id = '0'
  AND w.name IN ('SFListMenu', 'SFWindowAccessMap', 'SFRolesOverview')
  AND w.isactive = 'Y'
  AND NOT EXISTS (
    SELECT 1 FROM smfwhe_definedwebhook_role wr
    WHERE wr.ad_role_id = r.ad_role_id
      AND wr.smfwhe_definedwebhook_id = w.smfwhe_definedwebhook_id
      AND wr.isactive = 'Y'
  );
