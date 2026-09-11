-- @id: R32-revert-test-mode-productive-tenants
-- @gap: N1
-- @risk: low
-- @type: sql
-- @description: Companion to R31 -- for a tenant that resolves as PLAN_PRODUCTIVE but still
--   carries its own stale client-scoped ETSG_ForceTestMode='Y' row (e.g. converted before
--   OnboardingForceTestModeService#revertTestModeForProductiveTenant existed, or via any path
--   that bypassed it), reverts any already-existing VerifactuConfig/AeatsiiConfig/TbaiConfig row
--   back to production and DELETES the stale preference row entirely, so resolution falls back
--   to the System default (never leaves a lingering client-scoped row at any value).
--
-- Lockstep preventive twin: OnboardingForceTestModeService#revertTestModeForProductiveTenant,
-- called from EtendoGoJwtServlet right after a successful tenantPlanService.markProductive(...)
-- (com.etendoerp.go). That Java path deliberately does a TWO-STEP write (flip VALUE to 'N' via a
-- normal DAL save first -- so ForceTestModeEventHandler's cascade, and its SII/TicketBAI
-- siblings, correctly reverts already-existing config rows -- THEN deletes the row) because none
-- of the three handlers' cascade logic checks IsActive at all, only the row's current VALUE; a
-- plain isActive-only deactivation would leave VALUE='Y' and keep pushing test mode. This SQL
-- fix needs no such two-step dance: raw SQL never fires any Hibernate/DAL observer regardless
-- (see R31's own header), so it directly performs both effects itself in one transaction.
--
-- Idempotent: each config-table UPDATE is guarded on its own "still reads as test mode" flag, and
-- the DELETE only matches when a row still exists. A tenant with no stale row and no stale config
-- flags is a no-op. A tenant that is NOT PLAN_PRODUCTIVE is entirely excluded from every effect.

-- @check
SELECT 1
WHERE
  -- the tenant resolves as PLAN_PRODUCTIVE --
  EXISTS (
    SELECT 1 FROM ad_preference tp
    WHERE tp.attribute = 'ETGO_TenantPlan'
      AND tp.visibleat_client_id = :client_id
      AND tp.isactive = 'Y'
      AND upper(trim(tp.value)) = 'PRODUCTIVE'
  )
  AND (
    -- ...and at least one of the effects below still has work to do
    EXISTS (
      SELECT 1 FROM ad_preference fp
      WHERE fp.property = 'ETSG_ForceTestMode'
        AND fp.ad_client_id = :client_id
    )
    OR EXISTS (
      SELECT 1 FROM etvfac_verifactu_config v
      WHERE v.ad_client_id = :client_id AND v.isactive = 'Y' AND v.is_dev_env = 'Y'
    )
    OR EXISTS (
      SELECT 1 FROM aeatsii_config a
      WHERE a.ad_client_id = :client_id AND a.isactive = 'Y' AND a.produccion = 'N'
    )
    OR EXISTS (
      SELECT 1 FROM tbai_config t
      WHERE t.ad_client_id = :client_id AND t.isactive = 'Y' AND t.production_env = 'N'
    )
  );

-- @apply

-- Effect 1: VeriFactu back to production (IS_DEV_ENV='N').
UPDATE etvfac_verifactu_config v
SET is_dev_env = 'N', updated = now(), updatedby = '0'
WHERE v.ad_client_id = :client_id
  AND v.isactive = 'Y'
  AND v.is_dev_env = 'Y'
  AND EXISTS (
    SELECT 1 FROM ad_preference tp
    WHERE tp.attribute = 'ETGO_TenantPlan'
      AND tp.visibleat_client_id = :client_id
      AND tp.isactive = 'Y'
      AND upper(trim(tp.value)) = 'PRODUCTIVE'
  );

-- Effect 2: SII back to production (PRODUCCION='Y').
UPDATE aeatsii_config a
SET produccion = 'Y', updated = now(), updatedby = '0'
WHERE a.ad_client_id = :client_id
  AND a.isactive = 'Y'
  AND a.produccion = 'N'
  AND EXISTS (
    SELECT 1 FROM ad_preference tp
    WHERE tp.attribute = 'ETGO_TenantPlan'
      AND tp.visibleat_client_id = :client_id
      AND tp.isactive = 'Y'
      AND upper(trim(tp.value)) = 'PRODUCTIVE'
  );

-- Effect 3: TicketBAI back to production (PRODUCTION_ENV='Y').
UPDATE tbai_config t
SET production_env = 'Y', updated = now(), updatedby = '0'
WHERE t.ad_client_id = :client_id
  AND t.isactive = 'Y'
  AND t.production_env = 'N'
  AND EXISTS (
    SELECT 1 FROM ad_preference tp
    WHERE tp.attribute = 'ETGO_TenantPlan'
      AND tp.visibleat_client_id = :client_id
      AND tp.isactive = 'Y'
      AND upper(trim(tp.value)) = 'PRODUCTIVE'
  );

-- Effect 4: delete the stale client-scoped preference row entirely (active or not -- no lingering
-- row of any value/state should remain for a productive tenant).
DELETE FROM ad_preference fp
WHERE fp.property = 'ETSG_ForceTestMode'
  AND fp.ad_client_id = :client_id
  AND EXISTS (
    SELECT 1 FROM ad_preference tp
    WHERE tp.attribute = 'ETGO_TenantPlan'
      AND tp.visibleat_client_id = :client_id
      AND tp.isactive = 'Y'
      AND upper(trim(tp.value)) = 'PRODUCTIVE'
  );
