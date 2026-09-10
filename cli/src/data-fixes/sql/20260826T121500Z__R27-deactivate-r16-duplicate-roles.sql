-- @id: R27-deactivate-r16-duplicate-roles
-- @gap: H2
-- @risk: medium
-- @type: sql
-- @description: Deactivate confirmed-unused R16-era per-client Finance/Sales/Purchasing/Inventory role clones, superseded by the ETP-4852 system-level template roles -- ETP-4877 item 6

-- Context (ETP-4877 item 6, retires R16's own model)
-- --------------------------------------------------------------------------------------------
-- R16 (20260727T114306Z__R16-tenant-roles-and-webhook-access.sql, gap H2, still applied to real
-- tenants and immutable) cloned 4 per-client roles literally named "Finance"/"Sales"/
-- "Purchasing"/"Inventory" onto every tenant missing them, plus their AD_Window_Access. ETP-4852
-- replaced that whole model with 4 SYSTEM-level template roles (ad_client_id='0',
-- SystemRoleTemplates) composed per-user via AD_Role_Inheritance -- R26 (this fix's sibling,
-- shipped in the same PR) is the corrective retrofit onto that new model for existing users. This
-- fix is the cleanup half: deactivate a tenant's R16-era per-client clone ONLY when a LIVE check
-- on THIS tenant confirms zero real usage -- never blanket, per the ticket's explicit "never
-- blanket" requirement. A clone still in real use anywhere is left untouched and surfaced via
-- @report for manual review instead.
--
-- "Zero real usage" = no active AD_User_Roles row referencing it, no AD_User.Default_Ad_Role_ID
-- pointing at it (regardless of that user's own active flag -- a still-referenced default must
-- not be silently orphaned), and no AD_Role_Inheritance row using it as InheritFrom (belt and
-- braces alongside core's own AD_ROLE_CHECK_TRG, which already refuses to deactivate a role an
-- inheritance still depends on -- see UserRoleCompositionService's own class javadoc -- but
-- checking it here means a blocked row degrades to a safe no-op + @report line instead of
-- failing the whole @apply transaction).
--
-- Ordering: this fix's own timestamp is AFTER R26's, matching the ticket's "resolve the owner
-- and personal-role backfill first, deactivate legacy duplicates second" framing -- so on a
-- tenant where a legacy clone WAS still referenced by a user's Default_Ad_Role_ID, R26 has
-- already re-homed that user onto their system-template-backed personal role before this fix
-- ever runs. Functionally the two fixes are independent (this fix's own live check is
-- self-contained either way), but the ordering is the safer, intended sequence.
--
-- Live audit (etendogoclean, 2026-08-26, 41 real tenants): ALL 84 R16-era clones (21 tenants x 4
-- roles) already have zero active AD_User_Roles rows and zero Default_Ad_Role_ID pointers today
-- -- including the reference tenant GOClient. The multi-legal-entity demo tenant (F&B
-- International Group) uses its OWN differently-named roles ("F&B España, S.A - Finance" etc, a
-- separate per-legal-entity naming scheme, not R16's) for its real demo users, so this fix's
-- per-tenant live check naturally leaves F&B untouched without any special-casing, exactly as the
-- ticket anticipated. No role was found in active use anywhere on this DB -- the @report branch
-- is expected to be empty here, but is kept as a permanent safety net for any other environment
-- (or future re-run after manual role reassignment) where that is not the case.
--
-- Idempotency: @check/@apply share the identical "isactive='Y' AND zero-usage" predicate; once a
-- role is deactivated, @check no longer matches it. A role that gains real usage AFTER being
-- deactivated is not reactivated by this fix (out of scope -- reactivating a retired role is a
-- manual/product decision, not a mechanical corrective).

-- @check
-- Returns >=1 row when :client_id has an active Finance/Sales/Purchasing/Inventory clone with
-- confirmed zero real usage. 0 rows => SKIPPED_NOT_NEEDED, @apply never runs.
SELECT 1
FROM ad_role r
WHERE r.ad_client_id = :client_id
  AND r.isactive = 'Y'
  AND r.name IN ('Finance', 'Sales', 'Purchasing', 'Inventory')
  AND NOT EXISTS (SELECT 1 FROM ad_user_roles ur WHERE ur.ad_role_id = r.ad_role_id AND ur.isactive = 'Y')
  AND NOT EXISTS (SELECT 1 FROM ad_user u WHERE u.default_ad_role_id = r.ad_role_id)
  AND NOT EXISTS (SELECT 1 FROM ad_role_inheritance ri WHERE ri.inherit_from = r.ad_role_id)
LIMIT 1;

-- @apply
UPDATE ad_role r
SET isactive = 'N', updated = now(), updatedby = '0'
WHERE r.ad_client_id = :client_id
  AND r.isactive = 'Y'
  AND r.name IN ('Finance', 'Sales', 'Purchasing', 'Inventory')
  AND NOT EXISTS (SELECT 1 FROM ad_user_roles ur WHERE ur.ad_role_id = r.ad_role_id AND ur.isactive = 'Y')
  AND NOT EXISTS (SELECT 1 FROM ad_user u WHERE u.default_ad_role_id = r.ad_role_id)
  AND NOT EXISTS (SELECT 1 FROM ad_role_inheritance ri WHERE ri.inherit_from = r.ad_role_id);

-- @report
-- Read-only, runs after a successful @apply. Surfaces any Finance/Sales/Purchasing/Inventory
-- per-client clone at :client_id that is STILL in active use (or a still-active
-- AD_Role_Inheritance InheritFrom target) -- deliberately never touched by @apply above -- for a
-- human to review before deciding what to do with it.
SELECT r.ad_role_id, r.name,
  (SELECT count(*) FROM ad_user_roles ur WHERE ur.ad_role_id = r.ad_role_id AND ur.isactive = 'Y') AS active_user_roles,
  (SELECT count(*) FROM ad_user u WHERE u.default_ad_role_id = r.ad_role_id) AS default_role_pointers,
  (SELECT count(*) FROM ad_role_inheritance ri WHERE ri.inherit_from = r.ad_role_id) AS inheritance_dependents
FROM ad_role r
WHERE r.ad_client_id = :client_id
  AND r.isactive = 'Y'
  AND r.name IN ('Finance', 'Sales', 'Purchasing', 'Inventory')
  AND (
    EXISTS (SELECT 1 FROM ad_user_roles ur WHERE ur.ad_role_id = r.ad_role_id AND ur.isactive = 'Y')
    OR EXISTS (SELECT 1 FROM ad_user u WHERE u.default_ad_role_id = r.ad_role_id)
    OR EXISTS (SELECT 1 FROM ad_role_inheritance ri WHERE ri.inherit_from = r.ad_role_id)
  );
