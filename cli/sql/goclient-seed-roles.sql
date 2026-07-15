-- ETP-4508 — Seed the 4 canonical Etendo Go operational roles on GOClient.
--
-- GOClient (802509E12436405C86BA1FD5B1DF508C) is the reference/main client for
-- the Etendo Go "Roles & Users" feature (epic ETP-3504). This is a ONE-OFF
-- seed for that single reference client, NOT a multi-tenant provisioning-gap
-- fix, so it deliberately does NOT go through cli/src/data-fixes/ (that
-- framework's ledger/watermark model exists to answer "does existing tenant X
-- have gap G, backfill it" — it assumes a matching preventive onboarding
-- front, which this task explicitly defers to ETP-4515/4516). See
-- docs/etendo-ad/roles-users-reference.md for the full design/decision
-- record, and docs/etendo-ad/tenant-remediation-knowledge.md for the
-- data-fixes-scope note.
--
-- NOT THE AUTHORITATIVE ARTIFACT: GOClient is the module's own bundled
-- reference/template client — its data ships as XML dumps under
-- {etendo_root}/modules/com.etendoerp.go/referencedata/sampledata/GOClient/
-- (one file per table), imported by `db.apply.modules.sampledata` and staged
-- for new-tenant onboarding by `prepareOnboardingSampledata`. THAT dataset
-- (AD_ROLE.xml and AD_ROLE_ORGACCESS.xml) is the real, tracked deliverable.
-- This `.sql` script is a LOCAL DEV-SEEDING CONVENIENCE ONLY — it reproduces
-- the same DB rows on a fresh local dev DB (e.g. one restored before this
-- task ran) without needing a full sampledata re-import; it is not consumed
-- by CI, onboarding, or any other tenant.
--
-- NOTE: "Administrator" is NOT one of the roles created here. It resolves to
-- the tenant's pre-existing client-admin role (`AD_Role.is_client_admin='Y'`
-- for the tenant's `ad_client_id` — on GOClient that's "GOClient Admin",
-- `9B8D736190724807AB256DC95F20EC5E`), auto-created by core Etendo's
-- InitialClientSetup for every tenant. It intentionally stays `ismanual='N'`
-- and needs no seeding here or in ETP-4509 — see
-- docs/etendo-ad/roles-users-reference.md § "Administrator resolution" for
-- the full rationale and the correction record.
--
-- Idempotent: every INSERT is guarded by NOT EXISTS on (ad_client_id, name)
-- (also enforced by the ad_role_name_un UNIQUE constraint) — safe to re-run.
--
-- Usage:
--   PGPASSWORD=<pwd> psql -h <host> -p <port> -U <user> -d <db> \
--     -f cli/sql/goclient-seed-roles.sql
-- (Credentials resolve from {etendo_root}/gradle.properties — see cli/src/db.js
-- for the Node equivalent used by this repo's tooling.)
--
-- After running: no AD dictionary/metadata changed (AD_Role is business data,
-- not AD_Table/AD_Column), so ./gradlew export.database is NOT required for
-- this script. (It IS required for any later change that touches AD_Window /
-- AD_Field / ETGO_SF_* config, e.g. ETP-4509's AD_Window_Access seeding.)
--
-- Protection convention (V1, see roles-users-reference.md for rationale):
--   These 4 roles are NOT editable/creatable/deletable from the Etendo Go UI.
--   There is no Etendo Go "Roles" window/spec yet (that ships in a later
--   task), so today they are inherently protected — no CRUD surface exists.
--   When that window IS built, its NeoHandler MUST block update/delete when
--   AD_Role_ID is one of the 4 fixed IDs below (the canonical reserved-ID
--   list — do not derive protection from the Description text, it is only a
--   human-readable hint). The fixed IDs are recorded here AND in
--   roles-users-reference.md; both must stay in sync.
--
-- ismanual = 'Y' (MANUAL) on all 4 roles — MANDATORY, do not change.
--   `AD_ROLE_TRG` (core Etendo trigger) auto-derives blanket
--   AD_Window_Access/AD_Process_Access/AD_Form_Access for NON-manual
--   (`ismanual='N'`) roles on every INSERT/UPDATE, matching ALL active
--   windows/processes for the role's userlevel with full (isreadwrite='Y')
--   access. ETP-4509 curates each role's window access BY HAND (the 3-tier
--   full/read-only/none model), so these roles must stay manual so the
--   trigger never touches them — ETP-4509 needs to start from a genuinely
--   EMPTY access set, not narrow down an auto-granted blanket one. See
--   roles-users-reference.md for the verified trigger behavior and the
--   corrective cleanup this required after an earlier run of this script
--   mistakenly used ismanual='N'.

BEGIN;

-- Fixed reference: GOClient
--   ad_client_id = 802509E12436405C86BA1FD5B1DF508C

-- Fixed reference: the 4 canonical Etendo Go operational roles (generated via
-- `make uuid`, reserved — never reuse for anything else):
--   Finance       = 127AE77FE2994067B7FE6495FC21D51E
--   Sales         = 2A159DF4F4B944A6AA903202AD35B545
--   Purchasing    = A826430F723E4C1B9A53EBB0746A98C0
--   Inventory     = 55E05A4B43514A029D6FB6B8D94B49D4
--
-- "Administrator" is deliberately NOT in this list — see the header note
-- above and docs/etendo-ad/roles-users-reference.md.

-- 1. Finance — operational role, org level (userlevel='  O').
INSERT INTO ad_role (
  ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated,
  updatedby, name, description, userlevel, ismanual, processing,
  is_client_admin, isadvanced, isrestrictbackend, isportal, isportaladmin,
  iswebserviceenabled, istemplate, recalculatepermissions
)
SELECT
  '127AE77FE2994067B7FE6495FC21D51E', '802509E12436405C86BA1FD5B1DF508C', '0',
  'Y', now(), '100', now(), '100',
  'Finance',
  'Etendo Go system role — do not edit or delete',
  '  O', 'Y', 'N', 'N', 'Y', 'N', 'N', 'N', 'Y', 'N', 'N'
WHERE NOT EXISTS (
  SELECT 1 FROM ad_role
  WHERE ad_client_id = '802509E12436405C86BA1FD5B1DF508C' AND name = 'Finance'
);

-- 2. Sales — operational role, org level.
INSERT INTO ad_role (
  ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated,
  updatedby, name, description, userlevel, ismanual, processing,
  is_client_admin, isadvanced, isrestrictbackend, isportal, isportaladmin,
  iswebserviceenabled, istemplate, recalculatepermissions
)
SELECT
  '2A159DF4F4B944A6AA903202AD35B545', '802509E12436405C86BA1FD5B1DF508C', '0',
  'Y', now(), '100', now(), '100',
  'Sales',
  'Etendo Go system role — do not edit or delete',
  '  O', 'Y', 'N', 'N', 'Y', 'N', 'N', 'N', 'Y', 'N', 'N'
WHERE NOT EXISTS (
  SELECT 1 FROM ad_role
  WHERE ad_client_id = '802509E12436405C86BA1FD5B1DF508C' AND name = 'Sales'
);

-- 3. Purchasing — operational role, org level.
INSERT INTO ad_role (
  ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated,
  updatedby, name, description, userlevel, ismanual, processing,
  is_client_admin, isadvanced, isrestrictbackend, isportal, isportaladmin,
  iswebserviceenabled, istemplate, recalculatepermissions
)
SELECT
  'A826430F723E4C1B9A53EBB0746A98C0', '802509E12436405C86BA1FD5B1DF508C', '0',
  'Y', now(), '100', now(), '100',
  'Purchasing',
  'Etendo Go system role — do not edit or delete',
  '  O', 'Y', 'N', 'N', 'Y', 'N', 'N', 'N', 'Y', 'N', 'N'
WHERE NOT EXISTS (
  SELECT 1 FROM ad_role
  WHERE ad_client_id = '802509E12436405C86BA1FD5B1DF508C' AND name = 'Purchasing'
);

-- 4. Inventory — operational role, org level.
INSERT INTO ad_role (
  ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated,
  updatedby, name, description, userlevel, ismanual, processing,
  is_client_admin, isadvanced, isrestrictbackend, isportal, isportaladmin,
  iswebserviceenabled, istemplate, recalculatepermissions
)
SELECT
  '55E05A4B43514A029D6FB6B8D94B49D4', '802509E12436405C86BA1FD5B1DF508C', '0',
  'Y', now(), '100', now(), '100',
  'Inventory',
  'Etendo Go system role — do not edit or delete',
  '  O', 'Y', 'N', 'N', 'Y', 'N', 'N', 'N', 'Y', 'N', 'N'
WHERE NOT EXISTS (
  SELECT 1 FROM ad_role
  WHERE ad_client_id = '802509E12436405C86BA1FD5B1DF508C' AND name = 'Inventory'
);

-- Repair for installs seeded by an earlier revision of this script (before
-- `recalculatepermissions` was added to the INSERT column list): the column
-- was left NULL, while the pre-existing core roles (GOClient Admin, GOuser)
-- both show 'N'. Idempotent no-op once already 'N'.
UPDATE ad_role SET recalculatepermissions = 'N'
WHERE ad_role_id IN (
  '127AE77FE2994067B7FE6495FC21D51E', '2A159DF4F4B944A6AA903202AD35B545',
  'A826430F723E4C1B9A53EBB0746A98C0', '55E05A4B43514A029D6FB6B8D94B49D4'
) AND recalculatepermissions IS DISTINCT FROM 'N';

COMMIT;

-- AD_Role_OrgAccess — resolved 2026-07-15 (human decision: IS_ORG_ADMIN='N').
-- The 2 pre-existing GOClient roles both carry an AD_Role_OrgAccess row for
-- the GOOrg organization (61849243BE89460EB70866880A545D50): GOuser (same
-- userlevel='  O', is_client_admin='N' shape as these 4 roles) has exactly
-- ONE such row. Without an equivalent row, a user assigned one of these 4
-- roles has no selectable organization and the role is non-functional in
-- the UI (not just "missing metadata") — the row itself IS required.
--
-- IS_ORG_ADMIN, however, is a separate, deliberate choice: GOuser's row uses
-- 'Y', but that is NOT mirrored here. Decision: 'N' for all 4 — these are
-- tiered, restricted business roles under the 3-tier full/read-only/none
-- model (see the `ismanual` section above); organizational admin rights are
-- not part of that design, so least-privilege wins over exactly mirroring
-- the GOuser precedent. See docs/etendo-ad/roles-users-reference.md
-- § "AD_Role_OrgAccess" for the full investigation and decision record.
BEGIN;

INSERT INTO ad_role_orgaccess (
  ad_role_orgaccess_id, ad_role_id, ad_org_id, ad_client_id,
  isactive, created, createdby, updated, updatedby, is_org_admin
)
SELECT 'DB64E6EC6FC94426AF5654FBED09ADB0', '127AE77FE2994067B7FE6495FC21D51E',
  '61849243BE89460EB70866880A545D50', '802509E12436405C86BA1FD5B1DF508C',
  'Y', now(), '100', now(), '100', 'N'
WHERE NOT EXISTS (
  SELECT 1 FROM ad_role_orgaccess
  WHERE ad_role_id = '127AE77FE2994067B7FE6495FC21D51E'
    AND ad_org_id = '61849243BE89460EB70866880A545D50'
);

INSERT INTO ad_role_orgaccess (
  ad_role_orgaccess_id, ad_role_id, ad_org_id, ad_client_id,
  isactive, created, createdby, updated, updatedby, is_org_admin
)
SELECT '99CF02082C4D4B47A99870A2EA011BFE', '2A159DF4F4B944A6AA903202AD35B545',
  '61849243BE89460EB70866880A545D50', '802509E12436405C86BA1FD5B1DF508C',
  'Y', now(), '100', now(), '100', 'N'
WHERE NOT EXISTS (
  SELECT 1 FROM ad_role_orgaccess
  WHERE ad_role_id = '2A159DF4F4B944A6AA903202AD35B545'
    AND ad_org_id = '61849243BE89460EB70866880A545D50'
);

INSERT INTO ad_role_orgaccess (
  ad_role_orgaccess_id, ad_role_id, ad_org_id, ad_client_id,
  isactive, created, createdby, updated, updatedby, is_org_admin
)
SELECT 'A1A682928B0F4620BAE6CC53AF08835D', 'A826430F723E4C1B9A53EBB0746A98C0',
  '61849243BE89460EB70866880A545D50', '802509E12436405C86BA1FD5B1DF508C',
  'Y', now(), '100', now(), '100', 'N'
WHERE NOT EXISTS (
  SELECT 1 FROM ad_role_orgaccess
  WHERE ad_role_id = 'A826430F723E4C1B9A53EBB0746A98C0'
    AND ad_org_id = '61849243BE89460EB70866880A545D50'
);

INSERT INTO ad_role_orgaccess (
  ad_role_orgaccess_id, ad_role_id, ad_org_id, ad_client_id,
  isactive, created, createdby, updated, updatedby, is_org_admin
)
SELECT '20ACDCFDB8964FB79C900FAA0D697736', '55E05A4B43514A029D6FB6B8D94B49D4',
  '61849243BE89460EB70866880A545D50', '802509E12436405C86BA1FD5B1DF508C',
  'Y', now(), '100', now(), '100', 'N'
WHERE NOT EXISTS (
  SELECT 1 FROM ad_role_orgaccess
  WHERE ad_role_id = '55E05A4B43514A029D6FB6B8D94B49D4'
    AND ad_org_id = '61849243BE89460EB70866880A545D50'
);

COMMIT;

-- AD_Role_OrgAccess — org '0' safety net, resolved 2026-07-15 (human decision:
-- add a second row per role for org '0' — the all-orgs/"*" marker — mirroring
-- what GOClient Admin already has (its org_rows show both '0:N' and
-- 'GOOrg:Y'). IS_ORG_ADMIN='N' throughout, consistent with the GOOrg row
-- above and the least-privilege reasoning already recorded.
BEGIN;

INSERT INTO ad_role_orgaccess (
  ad_role_orgaccess_id, ad_role_id, ad_org_id, ad_client_id,
  isactive, created, createdby, updated, updatedby, is_org_admin
)
SELECT 'FEFF4C1E9DA4427899207A86E0B6BE1D', '127AE77FE2994067B7FE6495FC21D51E',
  '0', '802509E12436405C86BA1FD5B1DF508C',
  'Y', now(), '100', now(), '100', 'N'
WHERE NOT EXISTS (
  SELECT 1 FROM ad_role_orgaccess
  WHERE ad_role_id = '127AE77FE2994067B7FE6495FC21D51E' AND ad_org_id = '0'
);

INSERT INTO ad_role_orgaccess (
  ad_role_orgaccess_id, ad_role_id, ad_org_id, ad_client_id,
  isactive, created, createdby, updated, updatedby, is_org_admin
)
SELECT 'B5F5EC82A0B147108B4503C8C93D968E', '2A159DF4F4B944A6AA903202AD35B545',
  '0', '802509E12436405C86BA1FD5B1DF508C',
  'Y', now(), '100', now(), '100', 'N'
WHERE NOT EXISTS (
  SELECT 1 FROM ad_role_orgaccess
  WHERE ad_role_id = '2A159DF4F4B944A6AA903202AD35B545' AND ad_org_id = '0'
);

INSERT INTO ad_role_orgaccess (
  ad_role_orgaccess_id, ad_role_id, ad_org_id, ad_client_id,
  isactive, created, createdby, updated, updatedby, is_org_admin
)
SELECT '0993CD7178D64D0C973E6B3EEA852A30', 'A826430F723E4C1B9A53EBB0746A98C0',
  '0', '802509E12436405C86BA1FD5B1DF508C',
  'Y', now(), '100', now(), '100', 'N'
WHERE NOT EXISTS (
  SELECT 1 FROM ad_role_orgaccess
  WHERE ad_role_id = 'A826430F723E4C1B9A53EBB0746A98C0' AND ad_org_id = '0'
);

INSERT INTO ad_role_orgaccess (
  ad_role_orgaccess_id, ad_role_id, ad_org_id, ad_client_id,
  isactive, created, createdby, updated, updatedby, is_org_admin
)
SELECT '1EABFFD82EBE4BE7944DBC7794C39B17', '55E05A4B43514A029D6FB6B8D94B49D4',
  '0', '802509E12436405C86BA1FD5B1DF508C',
  'Y', now(), '100', now(), '100', 'N'
WHERE NOT EXISTS (
  SELECT 1 FROM ad_role_orgaccess
  WHERE ad_role_id = '55E05A4B43514A029D6FB6B8D94B49D4' AND ad_org_id = '0'
);

COMMIT;

-- Verification query:
--   SELECT ad_role_id, name, description, userlevel, is_client_admin, isactive
--   FROM ad_role
--   WHERE ad_client_id = '802509E12436405C86BA1FD5B1DF508C'
--   ORDER BY name;

-- Rollback (only if run in error — these IDs are reserved, do not reuse):
--   DELETE FROM ad_role_orgaccess WHERE ad_role_orgaccess_id IN (
--     'DB64E6EC6FC94426AF5654FBED09ADB0', '99CF02082C4D4B47A99870A2EA011BFE',
--     'A1A682928B0F4620BAE6CC53AF08835D', '20ACDCFDB8964FB79C900FAA0D697736',
--     'FEFF4C1E9DA4427899207A86E0B6BE1D', 'B5F5EC82A0B147108B4503C8C93D968E',
--     '0993CD7178D64D0C973E6B3EEA852A30', '1EABFFD82EBE4BE7944DBC7794C39B17'
--   );
--   DELETE FROM ad_role WHERE ad_role_id IN (
--     '127AE77FE2994067B7FE6495FC21D51E',
--     '2A159DF4F4B944A6AA903202AD35B545', 'A826430F723E4C1B9A53EBB0746A98C0',
--     '55E05A4B43514A029D6FB6B8D94B49D4'
--   );
