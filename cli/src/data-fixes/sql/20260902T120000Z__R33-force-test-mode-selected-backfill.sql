-- @id: R33-force-test-mode-selected-backfill
-- @gap: N1
-- @risk: low
-- @type: sql
-- @description: Backfill AD_Preference.Selected='Y' on a tenant's own ETSG_ForceTestMode row
--   (ETP-5117 follow-up) — R31's original INSERT never set this column, so every row it created
--   landed at the 'N' schema default, inconsistent with how a row an operator creates by hand in
--   Classic looks (confirmed on the shared dev DB: several hand-made ETSG_ForceTestMode rows carry
--   Selected='Y'). None of the 3 consuming handlers (VeriFactu/SII/TicketBAI
--   ForceTestModeEventHandler) filters on Selected, so this is a data-correctness/
--   consistency-with-Classic fix, not a functional/cascade one.
--
-- Lockstep preventive twin: OnboardingForceTestModeService#forceTestModeForFreeTenant now calls
-- Preference#setSelected(true) on the row it builds (com.etendoerp.go) — every tenant onboarded
-- from this deploy forward is born with Selected='Y' already, so this corrective fix only ever
-- has work to do for a tenant onboarded before the fix landed (R31-era rows).
--
-- NOT a re-edit of R31: R31 already carries a real ledger row from live validation against the
-- shared dev DB (GOClient, 2026-09-01) and is treated as shipped/immutable per the framework's own
-- rule (see cli/src/data-fixes/sql/README.md "Applied fixes are immutable"). This is a NEW dated
-- fix instead.
--
-- Idempotent: @check and @apply share the same "own active row still reads Selected='N'" guard,
-- scoped to :client_id. A tenant with no own row, or whose own row already reads Selected='Y'
-- (a hand-made Classic row, or one created by the now-fixed onboarding service, or a tenant this
-- fix already backfilled), is a no-op on every re-run.

-- @check
SELECT 1
FROM ad_preference fp
WHERE fp.property = 'ETSG_ForceTestMode'
  AND fp.ad_client_id = :client_id
  AND fp.isactive = 'Y'
  AND fp.selected = 'N';

-- @apply
UPDATE ad_preference fp
SET selected = 'Y', updated = now(), updatedby = '0'
WHERE fp.property = 'ETSG_ForceTestMode'
  AND fp.ad_client_id = :client_id
  AND fp.isactive = 'Y'
  AND fp.selected = 'N';
