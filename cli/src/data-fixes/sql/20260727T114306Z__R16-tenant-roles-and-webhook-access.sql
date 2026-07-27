-- @id: R16-tenant-roles-and-webhook-access
-- @gap: H2
-- @risk: high
-- @type: sql
-- @description: Clone GOClient's Finance/Sales/Purchasing/Inventory roles (AD_Role + AD_Window_Access) onto the tenant when missing, then grant every active role dispatch access to SFListMenu/SFWindowAccessMap/SFRolesOverview

-- Background
-- --------------------------------------------------------------------------------------------
-- This closes two layered gaps together, both surfaced 2026-07-27 manually testing ETP-4513/
-- 4514/4520 together (see H1/H2 in docs/etendo-ad/onboarding-gaps.md):
--
-- H2 (new, this revision) -- a real Etendo Go tenant onboards with exactly ONE auto-created
-- admin role. GOClient's Finance/Sales/Purchasing/Inventory roles are reference/sample data
-- unique to GOClient -- no onboarding step or prior data-fix has ever created their equivalents
-- for any other tenant. Phase 7's ETP-4515 (preventive, onboarding) / ETP-4516 (corrective, this
-- fix) were both scoped for exactly this, per santo_roles_handoff_phase7.md, but neither had
-- started. Without these 4 roles, an admin has nothing to assign via the ETP-4512 role picker
-- except their own admin role -- the whole "assign one of 5 predefined roles" model is broken
-- for every non-GOClient tenant today.
--
-- H1 (already fixed by this file, previous revision) -- SMFWHE_DEFINEDWEBHOOK_ROLE is the webhook
-- dispatcher's own authorization gate: a role with no row for a given webhook gets a flat 404
-- before the webhook's own Java logic ever runs. Referencedata granting these webhooks is
-- GOClient-only and never reapplied to an existing install (see this file's own git history for
-- the full account of that gap).
--
-- These are one fix, not two, because H2's role clone and H1's webhook grant compose in a single
-- transaction: once a role is created in Step 1, Step 3's already-tenant-wide (not role-specific)
-- webhook grant automatically covers it too -- no separate wiring needed per newly created role.
--
-- Window ids are safe to copy verbatim: AD_Window is a system-level entity (ad_client_id = '0'
-- for every row, verified directly against this DB), so a window id means the same thing on
-- every tenant. Only AD_Window_Access (the role's grant for that window) is client-scoped.
--
-- Template source: GOClient (ad_client_id 802509E12436405C86BA1FD5B1DF508C), hardcoded -- it is
-- the fixed reference client throughout this epic (see santo_roles_handoff_phase7.md).
--
-- NOTE on EM_ETGO_Show_Acct_Fields: copied verbatim from the source role (Step 1), per this fix's
-- own "mirror GOClient exactly" principle. As of this writing GOClient's own Finance/Sales/
-- Purchasing/Inventory rows are ALL 'N' (verified directly against ad_role and against
-- referencedata/sampledata/GOClient/AD_ROLE.xml, which does not set the column at all -- it
-- rides the table's own 'N' default). This contradicts santo_roles_handoff_phase7.md's claim
-- that "every GOClient role already carries the correct Y/N value" -- flagging as a discrepancy
-- to resolve at the reference-data level (a product decision on which roles should see accounting
-- fields), not something this data-fix should silently override.
--
-- Idempotency
-- --------------------------------------------------------------------------------------------
-- @check returns >=1 row when the tenant is missing one of the 4 roles, missing an
-- AD_Window_Access row that role's GOClient counterpart has, or missing a webhook grant.
-- @apply's three steps are each independently NOT-EXISTS-guarded, so a re-run (or a tenant with a
-- partially-applied prior run) only inserts what's still missing. Step 2 and Step 3 both re-read
-- ad_role for :client_id AFTER Step 1, in the same transaction, so newly created roles are
-- immediately visible to them.
--
-- Preventive twin (new tenants born correct -- no CUT bump)
-- --------------------------------------------------------------------------------------------
-- Not yet built. ETP-4515 (onboarding: auto-provision the 5 roles + window access for new
-- tenants) remains unstarted -- see santo_roles_handoff_phase7.md, updated 2026-07-27 to record
-- this fix's scope. Until ETP-4515 ships, ONBOARDING_PROVISIONED_THROUGH is NOT bumped and every
-- newly onboarded tenant will need this same corrective fix re-run.

-- @check
-- Returns >=1 row when ANY of: a role name is missing, an existing role of that name is missing
-- an AD_Window_Access row its GOClient counterpart has, or an active role is missing a webhook
-- grant. 0 rows => SKIPPED_NOT_NEEDED, @apply never runs.
SELECT 1
FROM (VALUES ('Finance'), ('Sales'), ('Purchasing'), ('Inventory')) AS want(name)
WHERE NOT EXISTS (
  SELECT 1 FROM ad_role r WHERE r.ad_client_id = :client_id AND r.name = want.name
)
UNION ALL
SELECT 1
FROM ad_role src
JOIN ad_window_access swa ON swa.ad_role_id = src.ad_role_id AND swa.isactive = 'Y'
JOIN ad_role tgt ON tgt.ad_client_id = :client_id AND tgt.name = src.name
WHERE src.ad_client_id = '802509E12436405C86BA1FD5B1DF508C'
  AND src.name IN ('Finance', 'Sales', 'Purchasing', 'Inventory')
  AND NOT EXISTS (
    SELECT 1 FROM ad_window_access x
    WHERE x.ad_role_id = tgt.ad_role_id
      AND x.ad_window_id = swa.ad_window_id
      AND x.isactive = 'Y'
  )
UNION ALL
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
-- Step 1 -- clone missing roles from GOClient (attributes verified against the live schema: no
-- FK to another client's data survives the copy, ad_org_id/c_currency_id/amtapproval/
-- ad_tree_menu_id are uniform '0'/NULL/0/NULL across all 4 GOClient source roles).
INSERT INTO ad_role (
  ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby,
  name, description, userlevel, c_currency_id, amtapproval, ad_tree_menu_id, ismanual,
  processing, is_client_admin, isadvanced, isrestrictbackend, isportal, isportaladmin,
  iswebserviceenabled, istemplate, recalculatepermissions, em_etgo_show_acct_fields
)
SELECT
  get_uuid(), :client_id, src.ad_org_id, 'Y', now(), '0', now(), '0',
  src.name, src.description, src.userlevel, src.c_currency_id, src.amtapproval,
  src.ad_tree_menu_id, src.ismanual, src.processing, src.is_client_admin, src.isadvanced,
  src.isrestrictbackend, src.isportal, src.isportaladmin, src.iswebserviceenabled,
  src.istemplate, src.recalculatepermissions, src.em_etgo_show_acct_fields
FROM ad_role src
WHERE src.ad_client_id = '802509E12436405C86BA1FD5B1DF508C'
  AND src.name IN ('Finance', 'Sales', 'Purchasing', 'Inventory')
  AND NOT EXISTS (
    SELECT 1 FROM ad_role tgt WHERE tgt.ad_client_id = :client_id AND tgt.name = src.name
  );

-- Step 2 -- backfill AD_Window_Access rows to match each role's GOClient counterpart. Window ids
-- are copied as-is (AD_Window is system-level, ad_client_id = '0' for every row). Re-reads ad_role
-- for :client_id so roles created by Step 1 above are included.
INSERT INTO ad_window_access (
  ad_window_access_id, ad_window_id, ad_role_id, ad_client_id, ad_org_id, isactive,
  created, createdby, updated, updatedby, isreadwrite
)
SELECT
  get_uuid(), swa.ad_window_id, tgt.ad_role_id, :client_id, tgt.ad_org_id, 'Y',
  now(), '0', now(), '0', swa.isreadwrite
FROM ad_role src
JOIN ad_window_access swa ON swa.ad_role_id = src.ad_role_id AND swa.isactive = 'Y'
JOIN ad_role tgt ON tgt.ad_client_id = :client_id AND tgt.name = src.name
WHERE src.ad_client_id = '802509E12436405C86BA1FD5B1DF508C'
  AND src.name IN ('Finance', 'Sales', 'Purchasing', 'Inventory')
  AND NOT EXISTS (
    SELECT 1 FROM ad_window_access x
    WHERE x.ad_role_id = tgt.ad_role_id
      AND x.ad_window_id = swa.ad_window_id
      AND x.isactive = 'Y'
  );

-- Step 3 -- one SMFWHE_DEFINEDWEBHOOK_ROLE row per (active tenant role, webhook) pair still
-- missing, for EVERY active role of the tenant (not just the 4 above) -- covers the tenant's own
-- admin-equivalent role plus anything else it already had. PKs minted per row with get_uuid()
-- since the row count varies per tenant. ad_org_id '0' matches every existing row for this table.
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
