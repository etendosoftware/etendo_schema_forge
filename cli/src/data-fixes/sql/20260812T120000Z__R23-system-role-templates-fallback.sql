-- @id: R23-system-role-templates-fallback
-- @gap: ETP-4852
-- @risk: low
-- @type: sql
-- @description: Fallback for EnsureSystemRoleTemplatesScript (ModuleScript, ETP-4852) -- idempotently seed the 4 system-level (ad_client_id='0') fixed-role templates (Finance/Sales/Purchasing/Inventory) plus their 2-window smoke-test AD_Window_Access grants, in case the ModuleScript ever fails to run on some environment

-- Context (ETP-4852)
-- --------------------------------------------------------------------------------------------
-- ETP-4852 moved the 4 fixed roles (Finance/Sales/Purchasing/Inventory) from a per-client clone
-- (the retired OnboardingRoleProvisioningService) to a single system-level ('0') template set,
-- composed per-user via core's own AD_Role_Inheritance mechanism. The template rows themselves
-- are provisioned by a ModuleScript --
-- com.etendoerp.go/src-util/modulescript/src/com/etendoerp/go/modulescript/
-- EnsureSystemRoleTemplatesScript.java -- which runs automatically on every update.database.
--
-- This file is a FALLBACK, not an alternative design: it does EXACTLY what the ModuleScript
-- does, against the exact same 4 literal AD_Role_ID values and the exact same 8 (role, window)
-- smoke-test AD_Window_Access pairs, using the identical check-then-insert idempotency pattern
-- (ensureRole / ensureWindowAccess in the Java). Its only purpose is to close the gap on an
-- environment where update.database somehow did not run this ModuleScript (skipped script table,
-- a partial/failed database update, a restore from a snapshot taken before ETP-4852 shipped,
-- etc.) -- it is a safety net, so if the ModuleScript already ran correctly this fix is a genuine
-- no-op (@check returns 0 rows on every subsequent invocation).
--
-- Deliberately excludes "Admin" -- same as the ModuleScript, the per-tenant is_client_admin='Y'
-- role stays exactly as core provisions it; this fix never touches it.
--
-- Smoke-test AD_Window_Access only -- NOT the real permission matrix. Each template gets exactly
-- the same two full-access window grants the ModuleScript grants, enough to prove
-- AD_Role_Inheritance propagation end-to-end. Populating the real 48-window Admin/Ventas/Compras/
-- Financiero/Almacen matrix is ETP-4878's job, not this fix's -- explicitly out of scope here,
-- per the task brief for this fallback.
--
-- All literal ids below were copied byte-for-byte from EnsureSystemRoleTemplatesScript.java
-- (role ids, window ids, UserLevel = "  O" with its exact two leading spaces, and the
-- Description text) -- never re-derived or guessed. If that Java file's literals are ever
-- revised, this file must be revised identically in the same change.
--
-- IMPORTANT -- this is a SYSTEM-LEVEL singleton seed, NOT a per-tenant fix, and it deliberately
-- does NOT filter by :client_id anywhere. The framework's usual "every statement MUST filter
-- ad_client_id = :client_id" rule exists to guarantee tenant isolation -- that a fix run for one
-- tenant never touches another tenant's rows. This fix touches ZERO tenant-owned rows: every row
-- it can write has ad_client_id='0' (System), identical for every tenant, exactly mirroring what
-- the ModuleScript itself does (which also has no concept of "which tenant" -- it just runs once
-- against the whole instance). The runner still applies this fix once per tenant in its normal
-- per-tenant chain sweep (it has no "run once, globally" mode), but that is harmless and cheap:
-- whichever tenant is processed first performs the real INSERTs, and every following tenant's
-- @check immediately returns 0 rows (SKIPPED_NOT_NEEDED) since the system rows already exist --
-- so each tenant still gets its own ledger row (per the framework's one-row-per-tenant model),
-- while the underlying side effect is correctly shared/idempotent exactly once.
--
-- No CUT bump (ONBOARDING_PROVISIONED_THROUGH in OnboardingBaselineService) -- same reasoning as
-- R16: this fix's own @check already resolves to SKIPPED_NOT_NEEDED once the templates exist, no
-- matter whether they got there via the ModuleScript or this fallback, so a CUT bump would only
-- save the cost of evaluating that cheap @check, not change correctness. Also, unlike a per-tenant
-- onboarding gap, the templates are not tied to any tenant's birth date at all -- a CUT bump would
-- be a category error here (the ModuleScript, not a per-tenant onboarding step, is this gap's real
-- preventive front, and it runs on every update.database regardless of when any given tenant was
-- onboarded).
--
-- Idempotency: two-layer, mirroring the Java exactly. @check matches on the same literal
-- AD_Role_ID / (AD_Role_ID, AD_Window_ID) values @apply's own NOT EXISTS guards use, so a re-run
-- after success (by the ModuleScript, a prior run of this fix, or a mix of both) is a no-op.

-- @check
-- Returns >=1 row when any of the 4 template roles is missing, or any of the 8 (role, window)
-- smoke-test grants is missing an active AD_Window_Access row. 0 rows => SKIPPED_NOT_NEEDED,
-- @apply never runs.
SELECT 1
FROM (VALUES
  ('B88A34B5D1874F8685FA6F3C3A609412'),
  ('15ECC46CFBD74CF3A76D1F4DC8BA9F80'),
  ('5E279F5102F9410F9B8CCBA424741F46'),
  ('73581A7B4F414A2C9059C83CE7BE97BF')
) AS want_role(role_id)
WHERE NOT EXISTS (
  SELECT 1 FROM ad_role r WHERE r.ad_role_id = want_role.role_id
)
UNION ALL
SELECT 1
FROM (VALUES
  ('B88A34B5D1874F8685FA6F3C3A609412', '94EAA455D2644E04AB25D93BE5157B6D'),
  ('B88A34B5D1874F8685FA6F3C3A609412', 'E547CE89D4C04429B6340FFA44E70716'),
  ('15ECC46CFBD74CF3A76D1F4DC8BA9F80', '143'),
  ('15ECC46CFBD74CF3A76D1F4DC8BA9F80', '123'),
  ('5E279F5102F9410F9B8CCBA424741F46', '181'),
  ('5E279F5102F9410F9B8CCBA424741F46', '140'),
  ('73581A7B4F414A2C9059C83CE7BE97BF', '184'),
  ('73581A7B4F414A2C9059C83CE7BE97BF', '139')
) AS want_access(role_id, window_id)
WHERE NOT EXISTS (
  SELECT 1 FROM ad_window_access x
  WHERE x.ad_role_id = want_access.role_id
    AND x.ad_window_id = want_access.window_id
    AND x.isactive = 'Y'
)
LIMIT 1;

-- @apply
-- Step 1 -- insert whichever of the 4 template roles is still missing. Column values mirror
-- EnsureSystemRoleTemplatesScript#ensureRole exactly: AD_Client_ID/AD_Org_ID='0', CreatedBy/
-- UpdatedBy='0' (System Administrator user), UserLevel="  O" (two leading spaces, copied
-- verbatim), IsManual='Y', Is_Client_Admin/IsAdvanced/IsRestrictBackend/IsPortal/IsPortalAdmin/
-- IsWebServiceEnabled/EM_ETGO_Show_Acct_Fields='N', IsTemplate='Y'.
INSERT INTO ad_role (
  ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby,
  name, description, userlevel, ismanual, is_client_admin, isadvanced, isrestrictbackend,
  isportal, isportaladmin, iswebserviceenabled, istemplate, em_etgo_show_acct_fields
)
SELECT
  t.role_id, '0', '0', 'Y', now(), '0', now(), '0',
  t.name,
  'System-level template role (ETP-4852) — compose per-user personal roles by inheriting from this template, never edit directly.',
  '  O', 'Y', 'N', 'N', 'N', 'N', 'N', 'N', 'Y', 'N'
FROM (VALUES
  ('B88A34B5D1874F8685FA6F3C3A609412', 'Finance'),
  ('15ECC46CFBD74CF3A76D1F4DC8BA9F80', 'Sales'),
  ('5E279F5102F9410F9B8CCBA424741F46', 'Purchasing'),
  ('73581A7B4F414A2C9059C83CE7BE97BF', 'Inventory')
) AS t(role_id, name)
WHERE NOT EXISTS (
  SELECT 1 FROM ad_role r WHERE r.ad_role_id = t.role_id
);

-- Step 2 -- insert whichever of the 8 (role, window) smoke-test grants is still missing. Column
-- values mirror EnsureSystemRoleTemplatesScript#ensureWindowAccess exactly. Runs after Step 1 in
-- the same transaction, so a role inserted just above is already visible to the FK here.
INSERT INTO ad_window_access (
  ad_window_access_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby,
  ad_role_id, ad_window_id, isreadwrite
)
SELECT
  get_uuid(), '0', '0', 'Y', now(), '0', now(), '0',
  t.role_id, t.window_id, 'Y'
FROM (VALUES
  ('B88A34B5D1874F8685FA6F3C3A609412', '94EAA455D2644E04AB25D93BE5157B6D'),
  ('B88A34B5D1874F8685FA6F3C3A609412', 'E547CE89D4C04429B6340FFA44E70716'),
  ('15ECC46CFBD74CF3A76D1F4DC8BA9F80', '143'),
  ('15ECC46CFBD74CF3A76D1F4DC8BA9F80', '123'),
  ('5E279F5102F9410F9B8CCBA424741F46', '181'),
  ('5E279F5102F9410F9B8CCBA424741F46', '140'),
  ('73581A7B4F414A2C9059C83CE7BE97BF', '184'),
  ('73581A7B4F414A2C9059C83CE7BE97BF', '139')
) AS t(role_id, window_id)
WHERE NOT EXISTS (
  SELECT 1 FROM ad_window_access x
  WHERE x.ad_role_id = t.role_id
    AND x.ad_window_id = t.window_id
    AND x.isactive = 'Y'
);
