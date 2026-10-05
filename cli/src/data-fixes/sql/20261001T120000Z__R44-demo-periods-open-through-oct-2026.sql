-- @id: R44-demo-periods-open-through-oct-2026
-- @gap: C4
-- @risk: low
-- @type: sql
-- @description: Open every never-opened C_PeriodControl row of a DEMO tenant for periods
--   starting before 2026-11-01 (through October 2026 inclusive), so a demo created in late
--   September, or claimed from the tenant pool after being built in September, can post in
--   October during its trial (ETP-5575). Productive tenants and tenants without
--   ETGO_EnvironmentType are never touched. Rows a user closed ('C') or closed permanently ('P')
--   are never reopened, only reported.

-- Background
-- --------------------------------------------------------------------------------------------
-- The onboarding chain (OnboardingPeriodControlService#wire) opens periods through the month the
-- tenant is BUILT. A demo trial lasts ETGO_DEMO_TRIAL_DAYS (default 15), so a late-month signup
-- could not post the next month, and a pooled tenant (ETP-5389, up to 168h old) kept the window of
-- its build month. Demos that already exist keep that short window; this fix widens it through
-- October 2026, which covers every trial started on or before the deploy (2026-10-01/02).
--
-- 'N' reliably means "never opened": C_PERIOD_PROCESS (AD Process 167, the only open/close action)
-- only ever writes 'O', 'C' or 'P'. So flipping only 'N' respects every user decision.
--
-- Every tenant carries TWO control rows per (period, doc base type, org) today: the dataset copy
-- (C_PERIODCONTROL.xml) and the copy AD_ORG_READY inserts without an existence check. The posting
-- gate (AcctServer_data.xsql periodOpen, C_CHK_OPEN_PERIOD) needs ANY 'O' row, but the costing
-- closed-check (CostingUtils_data.xsql) reads ANY non-'O' row as closed. So this fix updates EVERY
-- 'N' row in the window, duplicates included: each period ends with only 'O' rows and is open for
-- both readers. It does not depend on a dedup fix (ETP-5577) having run.
--
-- The future-Permanently-Closed guard mirrors C_PERIOD_PROCESS's '@FuturePeriodPermanentlyClosed@'
-- rule, evaluated per row (same as R39) instead of aborting the whole tenant.
--
-- DEMO = ETGO_EnvironmentType='DEMO' in either stored shape -- runtime (AD_Client_ID=<tenant>) or
-- legacy (AD_Client_ID='0' + VisibleAt_Client_ID=<tenant>) -- AND no active
-- ETGO_TenantPlan='productive' row (mirrors TenantEnvironmentLifecycleService#resolve).
--
-- Lockstep preventive twin (ETP-5575): OnboardingPeriodControlService#openDemoTrialWindow, run by
-- EtendoGoJwtServlet after the onboarding commit (best effort) for every demo signup, pooled and
-- classic. ONBOARDING_PROVISIONED_THROUGH is deliberately NOT bumped: a newborn demo whose step
-- succeeded already has its window open, so @check returns 0; a newborn demo whose step failed is
-- rescued here while October 2026 is still relevant.

-- @check
-- Returns >=1 row when the tenant is an effective DEMO and owns at least one never-opened control
-- row in a period starting before 2026-11-01 that is not blocked by a future permanently closed
-- year. 0 rows => SKIPPED_NOT_NEEDED, @apply never runs.
SELECT 1
FROM c_periodcontrol pc
JOIN c_period p ON p.c_period_id = pc.c_period_id
JOIN c_year y ON y.c_year_id = p.c_year_id
WHERE pc.ad_client_id = :client_id
  AND p.ad_client_id = :client_id
  AND pc.isactive = 'Y'
  AND p.isactive = 'Y'
  AND p.periodtype <> 'A'
  AND p.startdate < DATE '2026-11-01'
  AND pc.periodstatus = 'N'
  AND EXISTS (
    SELECT 1 FROM ad_preference ep
    WHERE ep.attribute = 'ETGO_EnvironmentType'
      AND ep.isactive = 'Y'
      AND upper(trim(ep.value)) = 'DEMO'
      AND (ep.ad_client_id = :client_id
           OR (ep.ad_client_id = '0' AND ep.visibleat_client_id = :client_id))
  )
  AND NOT EXISTS (
    SELECT 1 FROM ad_preference tp
    WHERE tp.attribute = 'ETGO_TenantPlan'
      AND tp.visibleat_client_id = :client_id
      AND tp.isactive = 'Y'
      AND upper(trim(tp.value)) = 'PRODUCTIVE'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM c_periodcontrol fpc
    JOIN c_period fp ON fp.c_period_id = fpc.c_period_id
    JOIN c_year fy ON fy.c_year_id = fp.c_year_id
    WHERE fpc.ad_client_id = :client_id
      AND fpc.isactive = 'Y'
      AND fpc.periodstatus = 'P'
      AND fy.c_calendar_id = y.c_calendar_id
      AND fy.year > y.year
      AND AD_ISORGINCLUDED(fpc.ad_org_id, pc.ad_org_id, fpc.ad_client_id) <> -1
  )
LIMIT 1;

-- @apply
-- 1. Open every never-opened row in the window, every duplicate copy included.
UPDATE c_periodcontrol pc
SET periodstatus = 'O',
    openclose = 'C',
    periodaction = 'N',
    updated = now(),
    updatedby = '0'
FROM c_period p, c_year y
WHERE pc.c_period_id = p.c_period_id
  AND p.c_year_id = y.c_year_id
  AND pc.ad_client_id = :client_id
  AND p.ad_client_id = :client_id
  AND pc.isactive = 'Y'
  AND p.isactive = 'Y'
  AND p.periodtype <> 'A'
  AND p.startdate < DATE '2026-11-01'
  AND pc.periodstatus = 'N'
  AND EXISTS (
    SELECT 1 FROM ad_preference ep
    WHERE ep.attribute = 'ETGO_EnvironmentType'
      AND ep.isactive = 'Y'
      AND upper(trim(ep.value)) = 'DEMO'
      AND (ep.ad_client_id = :client_id
           OR (ep.ad_client_id = '0' AND ep.visibleat_client_id = :client_id))
  )
  AND NOT EXISTS (
    SELECT 1 FROM ad_preference tp
    WHERE tp.attribute = 'ETGO_TenantPlan'
      AND tp.visibleat_client_id = :client_id
      AND tp.isactive = 'Y'
      AND upper(trim(tp.value)) = 'PRODUCTIVE'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM c_periodcontrol fpc
    JOIN c_period fp ON fp.c_period_id = fpc.c_period_id
    JOIN c_year fy ON fy.c_year_id = fp.c_year_id
    WHERE fpc.ad_client_id = :client_id
      AND fpc.isactive = 'Y'
      AND fpc.periodstatus = 'P'
      AND fy.c_calendar_id = y.c_calendar_id
      AND fy.year > y.year
      AND AD_ISORGINCLUDED(fpc.ad_org_id, pc.ad_org_id, fpc.ad_client_id) <> -1
  );

-- 2. Resync C_Period.OpenClose in the window ('C' only when every row is 'O', the aggregate
--    C_PERIOD_PROCESS maintains, R39 precedent), only where the computed value changed. Display
--    consistency only: the posting gate reads the control rows.
UPDATE c_period p
SET openclose = agg.new_openclose,
    updated = now(),
    updatedby = '0'
FROM (
  SELECT pc.c_period_id,
         CASE WHEN COUNT(DISTINCT pc.periodstatus) = 1 AND MIN(pc.periodstatus) = 'O'
              THEN 'C' ELSE 'O' END AS new_openclose
  FROM c_periodcontrol pc
  WHERE pc.ad_client_id = :client_id
    AND pc.isactive = 'Y'
  GROUP BY pc.c_period_id
) agg
WHERE p.c_period_id = agg.c_period_id
  AND p.ad_client_id = :client_id
  AND p.isactive = 'Y'
  AND p.startdate < DATE '2026-11-01'
  AND p.openclose IS DISTINCT FROM agg.new_openclose;

-- @report
-- Runs after @apply in the same transaction. Lists every control row in the window that is still
-- not open -- closed by a user, permanently closed, or blocked by a future permanently closed year
-- -- plus a marker when the tenant has no October 2026 period at all.
SELECT p.name AS period,
       pc.ad_org_id,
       pc.docbasetype,
       pc.periodstatus AS current_status,
       CASE pc.periodstatus
         WHEN 'C' THEN 'closed_by_user_left_untouched'
         WHEN 'P' THEN 'permanently_closed_left_untouched'
         ELSE 'blocked_by_future_permanently_closed_period'
       END AS reason
FROM c_periodcontrol pc
JOIN c_period p ON p.c_period_id = pc.c_period_id
WHERE pc.ad_client_id = :client_id
  AND pc.isactive = 'Y'
  AND p.isactive = 'Y'
  AND p.periodtype <> 'A'
  AND p.startdate < DATE '2026-11-01'
  AND pc.periodstatus <> 'O'
UNION ALL
SELECT 'Oct-26 missing', NULL, NULL, NULL, 'no_october_2026_period_in_calendar'
WHERE NOT EXISTS (
  SELECT 1 FROM c_period p
  WHERE p.ad_client_id = :client_id
    AND p.isactive = 'Y'
    AND p.startdate = DATE '2026-10-01'
)
ORDER BY 1, 3;
