-- @id: R31-force-test-mode-demo-tenants
-- @gap: N1
-- @risk: low
-- @type: sql
-- @description: Force ETSG_ForceTestMode='Y' (SII/TicketBAI/VeriFactu test/sandbox mode) for
--   already-onboarded Demo/free tenants (ETP-5117) — inserts a client-scoped preference row
--   (never touching the System-level default, AD_Client_ID='0') and, because that preference's
--   consuming event handlers only cascade to already-existing config rows on an UPDATE of the
--   Preference row via Hibernate/DAL — never on plain SQL, which never fires any observer —
--   directly backfills any pre-existing EtvfacVerifactuConfig/AeatsiiConfig/TbaiConfig row still
--   reading as "production" for the same tenant.
--
-- Lockstep preventive twin: OnboardingForceTestModeService#forceTestModeForFreeTenant, wired as a
-- new step in EtendoGoJwtServlet#ensureOnboardingDataset (com.etendoerp.go). See that service's
-- own javadoc for the full explanation of why a plain Preferences.setPreferenceValue(...) call
-- cannot be reused here (it would write AD_Client_ID='0', invisible to the fiscal handlers'
-- Client-scoped lookup), and docs/etendo-ad/onboarding-and-datafixes-map.md's gap N1 row.
--
-- Idempotent in two independent parts:
--   1. The AD_Preference INSERT is guarded on "no active ETSG_ForceTestMode row already owned by
--      this client" (checked via AD_Preference.AD_Client_ID, matching exactly what
--      ForceTestModeEventHandler#findPreference / its SII/TicketBAI siblings read).
--   2. Each config-table UPDATE is guarded on its own "still reads as production" flag, so a
--      re-run only ever touches rows a previous run (or a later manual edit) has not already
--      fixed, and never re-applies to a row already in test mode.
-- A tenant already marked PLAN_PRODUCTIVE (com.etendoerp.go.payment.TenantPlanService) is
-- entirely excluded from every effect below — this fix never forces test mode on a paying tenant.

-- @check
SELECT 1
WHERE
  -- the tenant resolves as Demo/free (no active ETGO_TenantPlan='productive' row) --
  NOT EXISTS (
    SELECT 1 FROM ad_preference tp
    WHERE tp.attribute = 'ETGO_TenantPlan'
      AND tp.visibleat_client_id = :client_id
      AND tp.isactive = 'Y'
      AND upper(trim(tp.value)) = 'PRODUCTIVE'
  )
  AND (
    -- ...and at least one of the two effects below still has work to do
    NOT EXISTS (
      SELECT 1 FROM ad_preference fp
      WHERE fp.property = 'ETSG_ForceTestMode'
        AND fp.ad_client_id = :client_id
        AND fp.isactive = 'Y'
    )
    OR EXISTS (
      SELECT 1 FROM etvfac_verifactu_config v
      WHERE v.ad_client_id = :client_id AND v.isactive = 'Y' AND v.is_dev_env = 'N'
    )
    OR EXISTS (
      SELECT 1 FROM aeatsii_config a
      WHERE a.ad_client_id = :client_id AND a.isactive = 'Y' AND a.produccion = 'Y'
    )
    OR EXISTS (
      SELECT 1 FROM tbai_config t
      WHERE t.ad_client_id = :client_id AND t.isactive = 'Y' AND t.production_env = 'Y'
    )
  );

-- @apply

-- Effect 1: insert the client's own ETSG_ForceTestMode='Y' row (never the System row).
INSERT INTO ad_preference (
  ad_preference_id, ad_client_id, ad_org_id, isactive,
  created, createdby, updated, updatedby,
  value, property, ispropertylist
)
SELECT get_uuid(), :client_id, :org_id, 'Y',
  now(), '0', now(), '0',
  'Y', 'ETSG_ForceTestMode', 'Y'
WHERE
  NOT EXISTS (
    SELECT 1 FROM ad_preference tp
    WHERE tp.attribute = 'ETGO_TenantPlan'
      AND tp.visibleat_client_id = :client_id
      AND tp.isactive = 'Y'
      AND upper(trim(tp.value)) = 'PRODUCTIVE'
  )
  AND NOT EXISTS (
    SELECT 1 FROM ad_preference fp
    WHERE fp.property = 'ETSG_ForceTestMode'
      AND fp.ad_client_id = :client_id
      AND fp.isactive = 'Y'
  );

-- Effect 2: VeriFactu — IS_DEV_ENV='Y' means test mode (inverted semantics vs. SII/TicketBAI).
UPDATE etvfac_verifactu_config v
SET is_dev_env = 'Y', updated = now(), updatedby = '0'
WHERE v.ad_client_id = :client_id
  AND v.isactive = 'Y'
  AND v.is_dev_env = 'N'
  AND NOT EXISTS (
    SELECT 1 FROM ad_preference tp
    WHERE tp.attribute = 'ETGO_TenantPlan'
      AND tp.visibleat_client_id = :client_id
      AND tp.isactive = 'Y'
      AND upper(trim(tp.value)) = 'PRODUCTIVE'
  );

-- Effect 3: SII — PRODUCCION='N' means test mode.
UPDATE aeatsii_config a
SET produccion = 'N', updated = now(), updatedby = '0'
WHERE a.ad_client_id = :client_id
  AND a.isactive = 'Y'
  AND a.produccion = 'Y'
  AND NOT EXISTS (
    SELECT 1 FROM ad_preference tp
    WHERE tp.attribute = 'ETGO_TenantPlan'
      AND tp.visibleat_client_id = :client_id
      AND tp.isactive = 'Y'
      AND upper(trim(tp.value)) = 'PRODUCTIVE'
  );

-- Effect 4: TicketBAI — PRODUCTION_ENV='N' means test mode.
UPDATE tbai_config t
SET production_env = 'N', updated = now(), updatedby = '0'
WHERE t.ad_client_id = :client_id
  AND t.isactive = 'Y'
  AND t.production_env = 'Y'
  AND NOT EXISTS (
    SELECT 1 FROM ad_preference tp
    WHERE tp.attribute = 'ETGO_TenantPlan'
      AND tp.visibleat_client_id = :client_id
      AND tp.isactive = 'Y'
      AND upper(trim(tp.value)) = 'PRODUCTIVE'
  );
