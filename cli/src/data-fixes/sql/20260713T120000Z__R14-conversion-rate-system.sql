-- @id: R14-conversion-rate-system
-- @gap: ETP-4474
-- @risk: medium
-- @type: sql
-- @description: Re-home this tenant's Currency Layer download rules to SYSTEM ('0'), close its open per-client conversion rates so the shared system rates take over going forward, and deactivate its own selected API config in favour of the single system config
--
-- Context (ETP-4474): conversion rates move from per-client to SYSTEM level, mirroring the tax
-- model. Rates synced from Currency Layer are now published under ad_client_id = '0' (org '0') and
-- read by every tenant (client-scoping fix in FinancialUtils.getConversionRate + the NEO handlers,
-- which resolve IN ('0', <client>) with the tenant rate winning over the system one for the same
-- org/currency/date). A single system config + a single set of download rules feed one global job.
-- Go tenants no longer create rows in C_Conversion_Rate; their only per-document override is the
-- Exchange Rate tab (ConversionRateDoc), which is a separate, immutable-on-confirm mechanism.
--
-- This corrective adapts an environment onboarded under the old per-client model (ETP-4030).
-- Preventive twin: there is no onboarding step that provisions per-client conversion-rate
-- config/rules, so nothing to remove there; the system config + rules are created once, centrally.
--
-- What it does, per tenant (:client_id):
--   1. SMFCR_RULE       -> move the tenant's download rules to ('0','0'), skipping currency pairs
--                          already defined at '0' (first tenant wins; later duplicates are left in
--                          place). The single global job (run as System Administrator) reads '0'.
--   2. C_Conversion_Rate-> CLOSE only the tenant's OPEN-ENDED spot rates (validto set to the
--                          far-future sentinel, e.g. 2999-12-31 from the downloader or 9999-12-31
--                          from sample data) by setting validto = yesterday (current_date - 1).
--                          Rates with a real finite validto are left untouched. This hands the
--                          timeline over: the tenant's own rate keeps covering PAST dates (back-dated
--                          documents still resolve to it via tenant-wins), while TODAY onward falls
--                          through to the shared '0' rate that the daily background job publishes.
--                          Rates are NOT re-homed to '0' (that would collide when several tenants hold
--                          different values for the same pair/date); the '0' timeline is populated
--                          forward by the sync, not by moving history. Mirrors the module's own
--                          terminateCurrentRate() idiom (validto = yesterday).
--   3. SMFCAPI config   -> deactivate the tenant's own SELECTED config so the single system ('0')
--                          config is authoritative. Guarded to fire only when a selected '0' config
--                          already exists, so the environment is never left without a converter.
--
-- Trigger note: step 2 changes validto, which C_CONVERSION_RATE_TRG guards with @20506@ ("Cannot
-- modify used rate") IF a POSTED fact_acct dated today/future exists in that currency pair (the
-- window being excluded). In the target environments there are no such future-dated postings, so the
-- plain UPDATE succeeds without disabling triggers. If a future tenant does trip @20506@, that rate
-- must be handled manually (it has posted accounting that depends on its window).
--
-- Idempotency: every statement is a guarded UPDATE. After a successful run the tenant's rules are at
-- '0', its open rates end yesterday (validto >= current_date no longer matches), and its config is
-- 'N' -- so a re-run is a no-op. The @apply runs in ONE transaction (the runner wraps BEGIN/COMMIT);
-- on failure it rolls back. Raw SQL bypasses DAL access-level checks, so re-homing rules to '0' works
-- at the DB layer.

-- @check
-- Needs the fix when the tenant still owns download rules to move, an open spot rate to close, or a
-- selected API config that should yield to the system ('0') config.
SELECT 1 FROM smfcr_rule r
 WHERE r.ad_client_id = :client_id
   AND NOT EXISTS (
     SELECT 1 FROM smfcr_rule r0
      WHERE r0.ad_client_id = '0'
        AND r0.c_currency_id_from = r.c_currency_id_from
        AND r0.c_currency_id_to   = r.c_currency_id_to)
UNION ALL
SELECT 1 FROM c_conversion_rate cr
 WHERE cr.ad_client_id = :client_id
   AND cr.validto   > current_date + interval '100 years'
   AND cr.validfrom < current_date
UNION ALL
SELECT 1 FROM smfcapi_currency_apiconfig a
 WHERE a.ad_client_id = :client_id
   AND a.service_selected = 'Y'
   AND EXISTS (
     SELECT 1 FROM smfcapi_currency_apiconfig a0
      WHERE a0.ad_client_id = '0' AND a0.service_selected = 'Y')
LIMIT 1;

-- @apply
-- 1) Re-home this tenant's download rules to system ('0','0'), skipping pairs already at '0'.
UPDATE smfcr_rule r
   SET ad_client_id = '0', ad_org_id = '0', updated = now(), updatedby = '0'
 WHERE r.ad_client_id = :client_id
   AND NOT EXISTS (
     SELECT 1 FROM smfcr_rule r0
      WHERE r0.ad_client_id = '0'
        AND r0.c_currency_id_from = r.c_currency_id_from
        AND r0.c_currency_id_to   = r.c_currency_id_to);

-- 2) Close this tenant's OPEN-ENDED spot rates as of yesterday so the shared '0' rate takes over
--    from today. Only rows with a far-future sentinel validto (2999/9999) that started before today
--    are touched. Finite-dated and already-closed historical rows are left intact for back-dated
--    documents; the daily background job populates the '0' timeline going forward.
UPDATE c_conversion_rate cr
   SET validto = current_date - 1, updated = now(), updatedby = '0'
 WHERE cr.ad_client_id = :client_id
   AND cr.validto   > current_date + interval '100 years'
   AND cr.validfrom < current_date;

-- 3) Deactivate this tenant's own selected Currency Layer config so the single system ('0') config
--    is authoritative. Fires only when a selected '0' config already exists.
UPDATE smfcapi_currency_apiconfig a
   SET service_selected = 'N', updated = now(), updatedby = '0'
 WHERE a.ad_client_id = :client_id
   AND a.service_selected = 'Y'
   AND EXISTS (
     SELECT 1 FROM smfcapi_currency_apiconfig a0
      WHERE a0.ad_client_id = '0' AND a0.service_selected = 'Y');
