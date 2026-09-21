-- @id: R38-mixed-period-open
-- @gap: C3
-- @risk: medium
-- @type: sql
-- @description: Open every C_PeriodControl row (per document type) for a C_Period
--   whose aggregate status currently shows "Mixed" -- i.e. document types disagree
--   on open/closed -- mirroring AD Process 167's own Open action. Skips (and
--   reports) rows blocked by the same guards the live "Abrir/Cerrar Periodo"
--   button already respects: Permanently Closed rows are never touched, and a
--   period is never opened if a later year in the same calendar is Permanently
--   Closed for that (or an included child) organization.

-- Background
-- --------------------------------------------------------------------------------------------
-- periodControl.status ("Mixed"/M) shown on the Calendar window's Periods tab is a computed
-- aggregate over C_PeriodControl.PeriodStatus grouped by C_Period_ID -- it is not stored per row,
-- so there is nothing to "un-mix" directly. Fixing the underlying C_PeriodControl rows resolves
-- the badge on the next read, with no separate update needed for the aggregate status itself.
--
-- This fix reuses the exact mechanism AD Process 167 (C_PERIOD_PROCESS,
-- src-db/database/model/functions/C_PERIOD_PROCESS.xml) already performs when a user clicks
-- Abrir/Cerrar Periodo -> Open on a single period:
--   UPDATE C_PeriodControl SET PeriodStatus='O', openclose='C' WHERE ... AND PeriodStatus<>'P'
-- -- i.e. it NEVER silently reopens a Permanently Closed row. C_PERIOD_PROCESS also raises
-- '@FuturePeriodPermanentlyClosed@' and aborts the WHOLE open action if any period in a LATER
-- year of the same calendar is Permanently Closed for the organization (or one of its included
-- child orgs, via AD_ISORGINCLUDED) -- a real business rule, not incidental. Since this fix
-- sweeps every Mixed period for a tenant in one transaction (not one period at a time, like the
-- live button), that guard is replicated per row rather than aborting the whole run: a period
-- that would trip it is simply left untouched and surfaced in @report instead.
--
-- Two classes of row are intentionally left untouched and reported, not force-fixed:
--   1. A period whose Mixed state includes a Permanently Closed row -- opening the other rows
--      still leaves it Mixed (O + P), and reopening the P row itself is a business decision this
--      fix must never make unilaterally.
--   2. A period blocked by the future-Permanently-Closed guard above -- same rule the live button
--      enforces; forcing it here would silently bypass real validation.
--
-- Not replicated by design: C_PERIOD_PROCESS also deletes M_Valued_Stock_Agg cache rows (dated on
-- or after the period's start) for the organization when opening. That is a stock-valuation CACHE
-- invalidation, not a correctness requirement for the open/closed status itself, and it self-heals
-- via the existing costing background recompute (see 20260910T120000Z__R36-costing-background-
-- schedule.sql) -- out of scope for a status-consistency corrective, matching R19's own precedent
-- of never reaching past a data-fix's stated purpose.
--
-- Confirmed the actual document-posting gate reads C_PeriodControl.PeriodStatus by DocBaseType
-- directly (AcctServerData.periodOpen in AcctServer_data.xsql: "... and c_periodcontrol.docbasetype
-- = ? and c_periodcontrol.periodstatus = 'O' ..."), NOT the C_Period.OpenClose aggregate column --
-- so this fix is the authoritative correction for "can documents post here". C_Period.OpenClose is
-- still resynced below (same aggregation C_PERIOD_PROCESS itself performs) purely for display/
-- report consistency, in case any other code path reads it.
--
-- No preventive onboarding twin: ETP-4948 removed the per-document-type open/close UI that could
-- produce new Mixed states going forward (Abrir/Cerrar Periodo is now the only exposed action, and
-- it is always applied to every document type at once). This is a one-time backward sweep for
-- state left over from before that removal, not an ongoing birth-defect gap.

-- @check
-- Returns >=1 row when at least one C_PeriodControl row could be opened (PeriodStatus 'N' or 'C')
-- inside a period whose rows currently disagree (more than one distinct PeriodStatus value).
-- 0 rows => SKIPPED_NOT_NEEDED, @apply never runs.
SELECT 1
FROM c_periodcontrol pc
JOIN c_period p ON p.c_period_id = pc.c_period_id
WHERE pc.ad_client_id = :client_id
  AND pc.isactive = 'Y'
  AND p.isactive = 'Y'
  AND pc.periodstatus IN ('N', 'C')
  AND (
    SELECT COUNT(DISTINCT pc2.periodstatus)
    FROM c_periodcontrol pc2
    WHERE pc2.c_period_id = pc.c_period_id
      AND pc2.ad_client_id = :client_id
      AND pc2.isactive = 'Y'
  ) > 1
LIMIT 1;

-- @apply
-- 1. Open every fixable row (PeriodStatus 'N'/'C') of a currently-Mixed period, never touching
--    'P' rows and never touching a row guarded by the future-Permanently-Closed-period rule.
UPDATE c_periodcontrol pc
SET periodstatus = 'O',
    openclose = 'C',
    updated = now(),
    updatedby = '0'
FROM c_period p, c_year y
WHERE pc.c_period_id = p.c_period_id
  AND p.c_year_id = y.c_year_id
  AND pc.ad_client_id = :client_id
  AND pc.isactive = 'Y'
  AND p.isactive = 'Y'
  AND pc.periodstatus IN ('N', 'C')
  AND (
    SELECT COUNT(DISTINCT pc2.periodstatus)
    FROM c_periodcontrol pc2
    WHERE pc2.c_period_id = pc.c_period_id
      AND pc2.ad_client_id = :client_id
      AND pc2.isactive = 'Y'
  ) > 1
  -- Never open a period if a LATER year of the same calendar is Permanently Closed for this
  -- org (or an org it includes) -- mirrors C_PERIOD_PROCESS's own '@FuturePeriodPermanentlyClosed@'
  -- guard, evaluated per row instead of aborting the whole sweep.
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

-- 2. Resync C_Period.OpenClose (the aggregate display column C_PERIOD_PROCESS itself maintains --
--    'C' when every row is uniformly 'O', 'O' otherwise) for every period this client owns, only
--    where the computed value actually changed. Not the posting gate (see Background) -- purely
--    for display/report consistency with the per-document-type rows just fixed above.
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
  AND p.openclose IS DISTINCT FROM agg.new_openclose;

-- @report
-- Runs after @apply in the same transaction. Lists every C_PeriodControl row that is STILL 'N' or
-- 'C' inside a period that is still Mixed after the fix -- i.e. every row the guards above left
-- untouched -- with the reason, so an operator knows exactly what needs a manual decision.
SELECT p.name AS period,
       p.c_period_id AS period_id,
       pc.ad_org_id,
       pc.docbasetype,
       pc.periodstatus AS current_status,
       CASE
         WHEN EXISTS (
           SELECT 1 FROM c_periodcontrol p2
           WHERE p2.c_period_id = pc.c_period_id
             AND p2.ad_client_id = :client_id
             AND p2.isactive = 'Y'
             AND p2.periodstatus = 'P'
         ) THEN 'blocked_by_permanently_closed_row_in_same_period'
         ELSE 'blocked_by_future_permanently_closed_period'
       END AS reason
FROM c_periodcontrol pc
JOIN c_period p ON p.c_period_id = pc.c_period_id
WHERE pc.ad_client_id = :client_id
  AND pc.isactive = 'Y'
  AND p.isactive = 'Y'
  AND pc.periodstatus IN ('N', 'C')
  AND (
    SELECT COUNT(DISTINCT pc2.periodstatus)
    FROM c_periodcontrol pc2
    WHERE pc2.c_period_id = pc.c_period_id
      AND pc2.ad_client_id = :client_id
      AND pc2.isactive = 'Y'
  ) > 1
ORDER BY p.name, pc.docbasetype;
