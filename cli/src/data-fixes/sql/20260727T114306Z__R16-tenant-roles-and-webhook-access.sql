-- @id: R16-tenant-roles-and-webhook-access
-- @gap: H2
-- @risk: high
-- @type: sql
-- @description: Clone GOClient's Finance/Sales/Purchasing/Inventory roles (AD_Role + AD_Window_Access) onto the tenant when missing

-- UPDATE (2026-07-27, later same day): this file's original Step 3 (grant every active role a
-- SMFWHE_DEFINEDWEBHOOK_ROLE row for SFListMenu/SFWindowAccessMap/SFRolesOverview) is REMOVED.
-- Those 3 webhooks are now reached through com.etendoerp.go's NEO pseudo-spec bridge
-- (`/sws/neo/{listmenu,windowaccessmap,rolesoverview}`, see neo-headless.md §4.10-4.11) instead of
-- the Webhooks module's `/webhooks/*` + SMFWHE_DEFINEDWEBHOOK_ROLE grant, so no per-role grant is
-- needed at all anymore -- the whole H1 gap this file's Step 3 (and OnboardingRoleProvisioningService
-- /OnboardingWebhookAccessService's onboarding-time equivalents, also removed) existed to paper over
-- is now moot. Steps 1-2 (role clone + AD_Window_Access backfill, gap H2) are UNCHANGED and still
-- needed -- that gap is unrelated to webhook transport. Grant rows inserted by a prior run of this
-- file's old Step 3 are harmless leftovers (the Webhooks module dispatch path still exists and still
-- honors them), not cleaned up retroactively.

-- FOLLOW-UP (2026-08-21, ETP-4968): those "harmless leftover" grant rows had a second-order effect
-- for GOClient specifically -- 12 SMFWHE_DEFINEDWEBHOOK_ROLE rows for SFWindowAccessMap/
-- SFRolesOverview leaked from referencedata/sampledata/GOClient/SMFWHE_DEFINEDWEBHOOK_ROLE.xml into
-- com.etendoerp.go/src-db/database/sourcedata/SMFWHE_DEFINEDWEBHOOK_ROLE.xml (the module's universal
-- baseline, loaded on every fresh install) via an unrelated commit's `export.database` run against a
-- dev DB that had GOClient's sample tenant loaded. That broke CI's from-scratch `update.database`
-- with an AD_CLIENT FK violation. Both copies were cleaned directly under ETP-4968 -- a source-file
-- edit, not a data-fix, since this was contaminated reference data rather than live-tenant state.

-- Background
-- --------------------------------------------------------------------------------------------
-- This closes two layered gaps together, both surfaced 2026-07-27 manually testing ETP-4513/
-- 4514/4520 together (see H1/H2 in docs/etendo-ad/onboarding-gaps.md):
--
-- H2 (new, this revision) -- a real Etendo Go tenant onboards with exactly ONE auto-created
-- admin role. GOClient's Finance/Sales/Purchasing/Inventory roles are reference/sample data
-- unique to GOClient -- no onboarding step or prior data-fix had ever created their equivalents
-- for any other tenant. Phase 7's ETP-4515 (preventive, onboarding) / ETP-4516 (corrective, this
-- fix) were both scoped for exactly this, per santo_roles_handoff_phase7.md. ETP-4516 is this
-- file; ETP-4515 has SINCE been implemented too, folded into this same branch rather than a
-- separate one -- see "Preventive twin" below. Without these 4 roles, an admin has nothing to
-- assign via the ETP-4512 role picker except their own admin role -- the whole "assign one of 5
-- predefined roles" model is broken for every tenant onboarded before ETP-4515's onboarding step
-- actually lands (merged and live), not merely committed to this branch.
--
-- H1 (already fixed by this file, previous revision) -- SMFWHE_DEFINEDWEBHOOK_ROLE is the webhook
-- dispatcher's own authorization gate: a role with no row for a given webhook gets a flat 404
-- before the webhook's own Java logic ever runs. Referencedata granting these webhooks is
-- GOClient-only and never reapplied to an existing install (see this file's own git history for
-- the full account of that gap).
--
-- These were originally one fix for two gaps, composed in a single transaction (H2's role clone
-- and H1's webhook grant, the latter via a former Step 3 -- see the UPDATE note at the top of this
-- file for why it was removed). Only H2 (role clone + AD_Window_Access backfill) remains here now.
--
-- Window ids are safe to copy verbatim: AD_Window is a system-level entity (ad_client_id = '0'
-- for every row, verified directly against this DB), so a window id means the same thing on
-- every tenant. Only AD_Window_Access (the role's grant for that window) is client-scoped.
--
-- Template source: GOClient (ad_client_id 802509E12436405C86BA1FD5B1DF508C), hardcoded -- it is
-- the fixed reference client throughout this epic (see santo_roles_handoff_phase7.md).
--
-- NOTE on EM_ETGO_Show_Acct_Fields: copied verbatim from the source role (Step 1). Correct
-- reference values (confirmed 2026-07-27): 'Y' for Finance and GOClient Admin, 'N' for
-- Sales/Purchasing/Inventory/GOuser. referencedata/sampledata/GOClient/AD_ROLE.xml already ships
-- these correctly -- an earlier check of this file mis-grepped the tag's actual (all-caps)
-- name, EM_ETGO_SHOW_ACCT_FIELDS, and wrongly concluded the XML never set it. The real gap was
-- this local dev DB's live ad_role rows being stale relative to that already-correct XML (Finance
-- and GOClient Admin both showed 'N' live) -- same "referencedata not reapplied to an existing
-- install" pattern as H1, just for this column instead of webhook grants. Corrected directly for
-- this DB; since Step 1 always reads GOClient's LIVE row (not the XML), any other environment
-- whose GOClient copy is similarly stale would clone the wrong value until its own live data is
-- corrected the same way.
--
-- Idempotency
-- --------------------------------------------------------------------------------------------
-- @check returns >=1 row when the tenant is missing one of the 4 roles, or missing an
-- AD_Window_Access row that role's GOClient counterpart has. @apply's two remaining steps are
-- each independently NOT-EXISTS-guarded, so a re-run (or a tenant with a partially-applied prior
-- run) only inserts what's still missing. Step 2 re-reads ad_role for :client_id AFTER Step 1, in
-- the same transaction, so newly created roles are immediately visible to it.
--
-- Preventive twin (new tenants born correct -- no CUT bump)
-- --------------------------------------------------------------------------------------------
-- com.etendoerp.go's OnboardingRoleProvisioningService, wired into EtendoGoJwtServlet's onboarding
-- chain, clones the same 4 GOClient roles (+ AD_Window_Access) for every newly onboarded tenant --
-- same GOClient-as-template logic as Steps 1-2 above, so a tenant onboarded from here on needs no
-- corrective run for gap H2 at all. It no longer also grants webhook access (that step was removed
-- along with this file's own former Step 3 -- see the UPDATE note at the top of this file).
--
-- ONBOARDING_PROVISIONED_THROUGH (OnboardingBaselineService, currently 2026-07-08T10:00:00Z) is
-- intentionally NOT bumped, same reasoning as R14 (20260716T120000Z__R14-payment-method-
-- multicurrency.sql): this fix's own @check already resolves to SKIPPED_NOT_NEEDED for any tenant
-- that already has the 4 roles + window access, whether it got them from
-- OnboardingRoleProvisioningService or any other path -- the CUT would only save the runner the
-- cost of evaluating that @check, not change correctness. Bump it only if the team later wants
-- the baseline to explicitly reflect this capability being onboarding-native.

-- @check
-- Returns >=1 row when a role name is missing, or an existing role of that name is missing an
-- AD_Window_Access row its GOClient counterpart has. 0 rows => SKIPPED_NOT_NEEDED, @apply never
-- runs. (The former third clause, checking for a missing webhook grant, was removed along with
-- Step 3 -- see the UPDATE note above.)
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
