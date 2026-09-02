-- @id: R26-admin-identity-real-org
-- @gap: M1
-- @risk: medium
-- @type: sql
-- @description: Backfill the self-registered admin's AD_User session-default fields with the
--   tenant's real business org, not the root/wildcard '0' InitialClientSetup left them at
--   (ETP-4999)

-- Background
-- --------------------------------------------------------------------------------------------
-- A self-service-registered tenant's admin AD_User never gets fully wired to its own REAL
-- business organization. InitialClientSetup (core, called from EtendoGoJwtServlet's
-- resolveOrCreateClient -> createClient) provisions the client/admin-user/admin-role scoped ONLY
-- to the client's root/wildcard organization (AD_Org_ID = '0', the only org that exists at that
-- point). The real business organization is created SEPARATELY, afterward, by
-- EtendoGoJwtServlet#createOrganization -- and nothing in between ever re-points the admin's
-- session defaults at that new real org:
--
--   AD_User.Default_Ad_Client_ID / Default_Ad_Org_ID / Default_M_Warehouse_ID /
--   EM_SMFSWS_Default_WS_Role_ID all NULL. Breaks SWS login/environment-switch warehouse
--   resolution: SecureWebServicesUtils.generateToken()'s getWarehouse() fallback chain throws
--   SMFSWS_OrgHasNoRole once the target org is explicitly the real business org and neither an
--   explicit warehouse nor Default_M_Warehouse_ID is available -- getOrganizationWarehouses()
--   only walks DOWN the org tree from the selected org, never up to a parent/root org, and the
--   warehouse created during onboarding is itself scoped to root org '0'.
--
-- NOTE: an earlier version of this fix also re-pointed AD_User_Roles.AD_Org_ID from '0' to the
-- real org, to fix an unrelated self-invite 400 (INVITED_USER_NO_ROLE). That was WRONG and has
-- been REMOVED: core only ever allows AD_User_Roles to hold instances at the root/wildcard
-- organization -- any other value throws "Entity ADUserRoles may only have instances with
-- organization *" at the application layer (the raw UPDATE below never hit that check, since
-- Postgres has no such constraint, but it left affected rows in a state the application itself
-- considers invalid). That bug (INVITED_USER_NO_ROLE) is fixed at its real source instead --
-- CompanyInvitationDalHelper#hasActiveRoleForOrganization now checks the role's
-- AD_Role_OrgAccess grants, not AD_User_Roles.organization (which can never be anything but '0'
-- for ANY tenant) -- no data-fix needed for that half, it was a pure code bug.
--
-- Preventive twin: OnboardingAdminIdentityService, wired as the new step right before the
-- baseline stamp in EtendoGoJwtServlet#ensureOnboardingDataset (com.etendoerp.go). Keep the two
-- in lockstep: this fix's COALESCE-guarded columns mirror
-- OnboardingAdminIdentityService#applySessionDefaults' "fill only if null" semantics exactly.
--
-- Scope (identifying "the admin", not every AD_User row)
-- --------------------------------------------------------------------------------------------
-- A tenant's admin is identified as: the user whose single active AD_User_Roles row (exactly one
-- total, matching this codebase's "one active row per user" invariant, see
-- UserRoleSyncSupport) is FOR their own AD_User.Default_Ad_Role_ID. This is precise (live-checked
-- against 79 affected users fleet-wide, zero false positives against system/sample AD_User rows)
-- without needing AD_User.EM_ETGO_Is_Owner (ETP-4830), which is 'N' for every tenant that
-- self-registered before that column existed and would under-scope this fix for legacy tenants.
--
-- Idempotency
-- --------------------------------------------------------------------------------------------
-- Only fills columns that are still NULL (COALESCE), so a partial prior fix (e.g. only
-- Default_M_Warehouse_ID was missing) converges without touching the rest. Re-runs to 0 rows
-- once applied.

-- @check
SELECT 1
FROM ad_user u
JOIN ad_user_roles ur
  ON ur.ad_user_id = u.ad_user_id AND ur.ad_role_id = u.default_ad_role_id
WHERE u.ad_client_id = :client_id
  AND u.default_ad_role_id IS NOT NULL
  AND (SELECT count(*) FROM ad_user_roles ur2 WHERE ur2.ad_user_id = u.ad_user_id) = 1
  AND EXISTS (SELECT 1 FROM ad_org o WHERE o.ad_client_id = u.ad_client_id AND o.ad_org_id <> '0')
  AND (
    u.default_ad_client_id IS NULL
    OR u.default_ad_org_id IS NULL
    OR u.default_m_warehouse_id IS NULL
    OR u.em_smfsws_default_ws_role_id IS NULL
  )
LIMIT 1;

-- @apply
UPDATE ad_user u
SET default_ad_client_id = COALESCE(u.default_ad_client_id, :client_id),
    default_ad_org_id = COALESCE(u.default_ad_org_id, :org_id),
    default_m_warehouse_id = COALESCE(
      u.default_m_warehouse_id,
      (SELECT w.m_warehouse_id FROM m_warehouse w
       WHERE w.ad_client_id = :client_id AND w.ad_org_id = :org_id AND w.isactive = 'Y'
       ORDER BY w.created LIMIT 1),
      (SELECT w.m_warehouse_id FROM m_warehouse w
       WHERE w.ad_client_id = :client_id AND w.isactive = 'Y'
       ORDER BY w.created LIMIT 1)
    ),
    em_smfsws_default_ws_role_id = COALESCE(u.em_smfsws_default_ws_role_id, u.default_ad_role_id),
    updated = now(),
    updatedby = '0'
WHERE u.ad_client_id = :client_id
  AND u.default_ad_role_id IS NOT NULL
  AND (SELECT count(*) FROM ad_user_roles ur2 WHERE ur2.ad_user_id = u.ad_user_id) = 1
  AND (
    u.default_ad_client_id IS NULL
    OR u.default_ad_org_id IS NULL
    OR u.default_m_warehouse_id IS NULL
    OR u.em_smfsws_default_ws_role_id IS NULL
  )
  AND EXISTS (SELECT 1 FROM ad_org o WHERE o.ad_client_id = u.ad_client_id AND o.ad_org_id <> '0');
