-- @id: R36-psd2-bank-statement-schedule-removal
-- @gap: ETP-5275
-- @risk: medium
-- @type: sql
-- @description: ETP-5275 — delete the per-tenant daily AD_Process_Request that onboarding used to create for the PSD2 Get Bank Statements process (ad_process_id F8704AB553464EFEABF8A5A82C74A308, search key PSD2_GetBankStatements); @apply is TWO statements because core's AD_PROCESS_REQUEST_TRG refuses to delete a request in status SCH/MIS, so it unschedules to UNS first and then deletes, which cascades the request's AD_Process_Run history away; rows are keyed by ad_process_id and by BOTH historical onboarding description markers (pre- and post-ETP-4690 rename), never by process name, so the separate Get Bank Statements (All Clients) process and any hand-made request are left untouched

-- Background
-- --------------------------------------------------------------------------------------------
-- Until ETP-5275, onboarding step `bankConnectionSync` (OnboardingBankConnectionSyncService in
-- com.etendoerp.go, wired live 2026-06-28) created ONE daily AD_Process_Request per tenant that
-- ran the PSD2 process `Get Bank Statements` at a random time in the 03:00-06:00 window, so a
-- Salt Edge-connected financial account would auto-import its statements. Every tenant got the
-- schedule, whether or not it ever connected a bank — so tenants that never use PSD2 carry a
-- daily job they never asked for, visible in Classic's "Proceso Programado" window.
--
-- The preventive half of the ticket removes that onboarding step (the service, its servlet step,
-- its helper and its NDJSON progress events are deleted in com.etendoerp.go), so a NEW tenant is
-- born with no scheduled process at all. This fix is the corrective half: it removes the schedule
-- from tenants that were already provisioned with it.
--
-- Which process, exactly
-- --------------------------------------------------------------------------------------------
-- AD_Process F8704AB553464EFEABF8A5A82C74A308 — search key PSD2_GetBankStatements, name
-- "Get Bank Statements", class com.etendoerp.psd2.bank.integration.process.GetBankStatementsProcess,
-- module com.etendoerp.psd2.bank.integration.
--
-- The id is matched LITERALLY and on purpose. There is a SEPARATE, still-wanted process named
-- "Get Bank Statements (All Clients)" which must keep running: a name-based predicate such as
-- `name ILIKE '%Get Bank Statements%'` would sweep it up too. Keying on ad_process_id is what
-- makes that impossible. This is the one place in this fix where a hardcoded AD id is correct
-- rather than a smell — the alternative (resolving by name) is exactly the bug being avoided.
-- The row is additionally narrowed by the marker `description` the deleted service stamped on
-- every request it built, so a request an operator created by hand for the same process is left
-- alone: removing a schedule a human deliberately set up is not this fix's business.
--
-- There are TWO markers, not one, and both must be matched. ETP-4097 (4bf73dee) shipped the
-- service writing "PSD2 automatic bank statement synchronization (Etendo GO onboarding)"; ETP-4690
-- (88fde992, "Rename PSD2 to bank connection") changed the constant to "Automatic bank statement
-- synchronization (Etendo GO onboarding)". Tenants onboarded before that rename still carry the
-- old string. On the shared dev DB the split is 118 rows on the new marker and 9 on the old one,
-- so matching only the current constant would silently leave those 9 tenants scheduled — the
-- exact failure this comment exists to prevent. A future third marker would need adding here too,
-- but there will not be one: the service that wrote them is deleted.
--
-- Rows with no marker at all are deliberately out of scope. The same DB carries one such row, in
-- status 'COM' — a one-shot manual run someone launched from Classic, not a schedule. Deleting it
-- would destroy a record this ticket never asked to touch.
--
-- Why @apply is two statements: core forbids the plain DELETE
-- --------------------------------------------------------------------------------------------
-- AD_PROCESS_REQUEST_TRG ends with
--
--     IF (DELETING) THEN
--       IF (:OLD.STATUS = 'SCH' OR :OLD.STATUS = 'MIS') THEN
--         RAISE_APPLICATION_ERROR(-20000,'@20630@');   -- "Unable to delete Process Request
--       END IF;                                        --  whilst still scheduled."
--     END IF;
--
-- Every row this fix targets is in status 'SCH', so a single DELETE aborts the whole tenant's
-- transaction. The UPDATE to 'UNS' is therefore NOT cosmetic and NOT a leftover from an earlier
-- draft — it is the precondition the trigger demands, and it must stay in the same transaction as
-- the DELETE so the trigger sees the new status in :OLD. 'UNS' is
-- org.openbravo.scheduling.Process.UNSCHEDULED, the same value Classic's own Unschedule action
-- writes. Do not "simplify" this fix down to the DELETE alone.
--
-- What the DELETE takes with it
-- --------------------------------------------------------------------------------------------
-- AD_Process_Run (the execution history) is a child of AD_Process_Request through
-- ad_process_run_ad_process_requ, and that FK is ON DELETE CASCADE — so the request's run rows go
-- with it, ~15.3k rows across all tenants on the shared dev DB. That loss is the accepted,
-- explicit product decision on ETP-5275: the history of a job that should never have existed is
-- not worth keeping. An earlier draft of this fix only unscheduled the rows to preserve it.
--
-- The other two referencing tables are NOT cascades (both NO ACTION) and would block the DELETE
-- if they held rows: jobs_job_result (jobs_job_result_request_id) and etcop_schedule
-- (etcop_sch_req_fk). Both are empty for this process on the dev DB. If a future tenant does have
-- such a row the fix will fail loudly on that tenant rather than silently skipping it, which is
-- the correct outcome — those tables belong to other modules and this fix must not delete their
-- rows behind their backs.
--
-- Operator note: an ALREADY-ARMED Quartz trigger lives in the running scheduler's memory, and this
-- fix only changes the database. If the job fires between the fix and the next Tomcat restart,
-- ProcessMonitor will try to INSERT an AD_Process_Run row pointing at the deleted request and hit
-- a foreign-key violation, logged by the scheduler. It is noise, not corruption — nothing else is
-- written and the trigger is not re-armed after the restart — but it is the one visible
-- difference from the unschedule-only approach, so prefer running this fix close to a restart.
--
-- Idempotency
-- --------------------------------------------------------------------------------------------
-- @check matches any surviving marked row, and @apply deletes exactly those, so a second run
-- matches 0 rows and reports SKIPPED_NOT_NEEDED. A tenant onboarded after the preventive change
-- has no such row at all and also skips.

-- @check
SELECT 1
FROM ad_process_request r
WHERE r.ad_client_id = :client_id
  AND r.ad_process_id = 'F8704AB553464EFEABF8A5A82C74A308'
  AND r.description IN (
        'Automatic bank statement synchronization (Etendo GO onboarding)',
        'PSD2 automatic bank statement synchronization (Etendo GO onboarding)'
      )
LIMIT 1;

-- @apply
-- Step 1 of 2 — satisfy AD_PROCESS_REQUEST_TRG's delete guard (see the header). Must run in the
-- same transaction as the DELETE below.
UPDATE ad_process_request r
SET status = 'UNS',
    isactive = 'N',
    updated = now(),
    updatedby = '0'
WHERE r.ad_client_id = :client_id
  AND r.ad_process_id = 'F8704AB553464EFEABF8A5A82C74A308'
  AND r.description IN (
        'Automatic bank statement synchronization (Etendo GO onboarding)',
        'PSD2 automatic bank statement synchronization (Etendo GO onboarding)'
      );

-- Step 2 of 2 — remove the request; AD_Process_Run cascades away with it.
DELETE FROM ad_process_request r
WHERE r.ad_client_id = :client_id
  AND r.ad_process_id = 'F8704AB553464EFEABF8A5A82C74A308'
  AND r.description IN (
        'Automatic bank statement synchronization (Etendo GO onboarding)',
        'PSD2 automatic bank statement synchronization (Etendo GO onboarding)'
      );
