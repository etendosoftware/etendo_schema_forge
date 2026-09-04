-- @id: R31-document-sequence-startno
-- @gap: N1
-- @risk: low
-- @type: sql
-- @description: ETP-5079 — correct the STARTNO and CURRENTNEXT of the 11 document sequences the
--   curated GOClient dataset shipped wrong, on already-provisioned tenants, so both end equal
--   (delta 0). CURRENTNEXT is set in BOTH directions — see the "no production tenants" premise in
--   the header before reusing this fix anywhere else.

-- Context (ETP-5079, gap N1)
-- ---------------------------------------------------------------------------------------------
-- The curated GOClient dataset (com.etendoerp.go/referencedata/sampledata/GOClient/AD_SEQUENCE.xml)
-- shipped 11 document sequences whose "Start Number" was wildly out of step with their "Next
-- Assigned Number" -- e.g. Standard Order at STARTNO 50,000 with CURRENTNEXT 1,000,011. The
-- preventive front of this ticket corrects the XML so every NEW tenant is born with STARTNO equal
-- to CURRENTNEXT (delta 0). This corrective closes the same gap on tenants onboarded before that
-- dataset change.
--
-- SCOPE BOUNDARY -- DO NOT WIDEN THIS FIX
-- ---------------------------------------------------------------------------------------------
-- Exactly the 11 sequences named in the ticket, listed in the VALUES blocks below. The dataset
-- carries 15 FURTHER sequences that also have a non-zero STARTNO/CURRENTNEXT delta today (GL
-- Journal, Quotation, Proposal, Credit Order, POS Order, AR Credit Memo, MM Shipment Indirect,
-- Purchase Requisition, Settlement, Manual Settlement, Depreciation, Debt Payment Management,
-- Prepay Order, Return Material, Warehouse Order). They are OUT OF SCOPE, deliberately: the
-- PREVENTIVE side of ETP-5079 left them untouched too, and a corrective that reached further would
-- leave EXISTING tenants in a better state than NEW ones -- the corrective must mirror the
-- preventive exactly, never exceed it. Widening this list without also widening AD_SEQUENCE.xml in
-- the same change is a defect, not an improvement. (The dataset also carries 96 duplicated
-- DocumentNo_* rows; likewise out of scope and undecided.)
--
-- This fix covers the sequences only; ETP-5079's other dataset corrections are preventive (the
-- GOClient XMLs). See docs/etendo-ad/onboarding-gaps.md section N1.
--
-- WHY ONBOARDING_PROVISIONED_THROUGH IS NOT BUMPED FOR THIS FIX
-- ---------------------------------------------------------------------------------------------
-- Do NOT "fix" this by bumping the CUT constant in OnboardingBaselineService. It stays at
-- 2026-08-28T14:00:00Z on purpose. A brand-new tenant already gets correct sequences straight from
-- the corrected AD_SEQUENCE.xml, so this fix's own @check returns 0 rows for it and the runner
-- records a clean SKIPPED_NOT_NEEDED -- the same terminal state the watermark would have produced,
-- reached by actually looking. Bumping the CUT to this file's timestamp would instead push the
-- cutoff PAST two fixes that never bumped it themselves --
-- R30-financial-account-card-ledger-account (2026-08-30T12:00:00Z) and
-- R29-transfer-link-multicurrency (2026-08-31T12:00:00Z) -- silently suppressing both for every new
-- tenant. That is the "CUT bump without its .sql" hazard the constant's own contract forbids.
--
-- STARTNO vs CURRENTNEXT -- and why the forward-only rule was DROPPED
-- ---------------------------------------------------------------------------------------------
-- STARTNO is metadata: it is the base a sequence is RESET to, never a number a document already
-- carries. Correcting it can never renumber anything that exists, so it is corrected
-- unconditionally, in both directions.
--
-- CURRENTNEXT is different in kind -- it is the next number that will be ISSUED. LOWERING it makes
-- a sequence hand out numbers it has handed out before. On a tenant with real, issued documents
-- that produces duplicate document numbers: a fiscal defect, not merely a data one. The first
-- version of this fix therefore carried a strict forward-only guard
-- (`AND s.currentnext < t.startno`), raising CURRENTNEXT to meet STARTNO but never pulling it back.
--
-- THAT GUARD IS DELIBERATELY GONE (2026-09-02, human decision). Two reasons, in order:
--
--   1. The premise behind it does not hold yet. At the time of writing there are NO production
--      environments. Every existing tenant is a test tenant, plus one small pre-prod environment
--      with a handful of clients. None of them holds documents whose numbers matter, so "re-issuing
--      an already-used number" has no victim.
--   2. With the guard in place the fix could not do its job. Measured live across all 58 tenants
--      carrying these sequences: FIVE of the eleven -- DocumentNo_C_Invoice, DocumentNo_M_InOut,
--      DocumentNo_M_Movement, DocumentNo_A_Asset and Secuencia TICKETBAI -- already had the CORRECT
--      STARTNO, so the ONLY correction they ever needed was lowering CURRENTNEXT. The guard refused
--      it, making the fix a complete no-op for those five and leaving the ticket's acceptance
--      criterion (TC-6: currentnext == startno) unreachable on any existing tenant. 460 rows across
--      39 tenants needed exactly that lowering.
--
-- >>> IF THIS FIX IS EVER RE-TARGETED AT A TENANT WITH GENUINELY ISSUED DOCUMENTS, THE FORWARD-ONLY
-- >>> RULE MUST COME BACK. Restore `AND s.currentnext < t.startno::numeric` on statement 2 below (in
-- >>> place of the `IS DISTINCT FROM` guard) BEFORE running it there. The same UPDATE that is
-- >>> harmless on a test tenant will produce duplicate invoice/shipment/payment numbers on a
-- >>> production one. This is a property of the ENVIRONMENT, not of the SQL: the statement itself
-- >>> cannot tell the difference, so the decision has to be made by whoever runs it.
--
-- Per the same decision, no additional "was this value the one the dataset shipped?" guard is
-- added: the correction is applied to whatever the current value is. The only guards are the
-- idempotency ones below.
--
-- MATCHING IS BY NAME, AND SOME TENANTS CARRY DUPLICATES
-- ---------------------------------------------------------------------------------------------
-- Sequences are matched on AD_Sequence.NAME because sequence ids differ per tenant. A handful of
-- tenants carry MORE THAN ONE row under one of these names -- the known duplicated DocumentNo_*
-- rows the dataset also ships (confirmed live: e.g. every "E2E User 1 *" tenant has 2 rows each for
-- DocumentNo_A_Asset / DocumentNo_C_Invoice / DocumentNo_M_InOut / DocumentNo_M_Movement). Every
-- copy is corrected, which is the intended behavior: each is a real sequence a document could be
-- numbered from, and each row is still guarded independently (both columns by IS DISTINCT FROM).
-- This fix does NOT deduplicate them -- deciding which
-- duplicate is canonical is a separate, undecided question, out of scope here.
--
-- Idempotency
-- ---------------------------------------------------------------------------------------------
-- Two layers. @check returns rows only while some correction still applies, so a healthy tenant is
-- SKIPPED_NOT_NEEDED and @apply never runs. Both @apply statements are ALSO self-guarded (each by
-- `IS DISTINCT FROM` against its own target), so re-running after a successful apply matches zero
-- rows -- `IS DISTINCT FROM` is what keeps the now-bidirectional CURRENTNEXT update idempotent, and
-- it is NULL-safe, unlike `<>`. Every statement
-- is scoped by ad_client_id = :client_id.

-- @check
-- Returns >=1 row while any of the 11 sequences has a STARTNO or a CURRENTNEXT off target, in
-- EITHER direction. The CURRENTNEXT arm matters: five of the eleven already carry the right STARTNO
-- and are only off on CURRENTNEXT, so a check that looked at STARTNO alone (or only at a CURRENTNEXT
-- BELOW target) would never make the fix reachable for them. 0 rows => this tenant's sequences are
-- already correct (a new tenant born from the corrected dataset lands here, which is why this fix
-- needs no watermark bump), or it has none of these sequences at all.
SELECT 1
FROM ad_sequence s
JOIN (VALUES
        ('AR Invoice', 10000000), ('AP Payment', 1000000), ('AR Receipt', 1000000),
        ('MM Shipment', 1000000), ('Standard Order', 1000000), ('Purchase Order', 1000000),
        ('DocumentNo_C_Invoice', 10000000), ('Secuencia TICKETBAI', 1000000),
        ('DocumentNo_M_InOut', 10000000), ('DocumentNo_M_Movement', 10000000),
        ('DocumentNo_A_Asset', 10000000)
     ) AS t(name, startno) ON t.name = s.name
WHERE s.ad_client_id = :client_id
  AND (s.startno IS DISTINCT FROM t.startno::numeric
       OR s.currentnext IS DISTINCT FROM t.startno::numeric)
LIMIT 1;

-- @apply

-- 1. STARTNO -- corrected unconditionally. Pure metadata (the reset base), so this can never
--    renumber an existing document. Self-guarded by IS DISTINCT FROM: a sequence already at the
--    target is not touched, which also keeps `updated`/`updatedby` honest on a re-run.
UPDATE ad_sequence s
SET startno = t.startno::numeric,
    updated = now(),
    updatedby = '0'
FROM (VALUES
        ('AR Invoice', 10000000), ('AP Payment', 1000000), ('AR Receipt', 1000000),
        ('MM Shipment', 1000000), ('Standard Order', 1000000), ('Purchase Order', 1000000),
        ('DocumentNo_C_Invoice', 10000000), ('Secuencia TICKETBAI', 1000000),
        ('DocumentNo_M_InOut', 10000000), ('DocumentNo_M_Movement', 10000000),
        ('DocumentNo_A_Asset', 10000000)
     ) AS t(name, startno)
WHERE s.ad_client_id = :client_id
  AND s.name = t.name
  AND s.startno IS DISTINCT FROM t.startno::numeric;

-- 2. CURRENTNEXT -- set to the target in BOTH directions, so the sequence ends at delta 0 (the
--    ticket's TC-6). `IS DISTINCT FROM` is the idempotency guard, not a safety guard: it makes a
--    re-run match zero rows and is NULL-safe. The safety guard this statement USED to carry
--    (`AND s.currentnext < t.startno::numeric`, forward-only) was removed on 2026-09-02 because
--    there are no production tenants yet AND it made the fix a no-op for five of the eleven
--    sequences -- full reasoning in the header. RESTORE IT before running this against any tenant
--    holding genuinely issued documents: there, lowering CURRENTNEXT duplicates document numbers.
UPDATE ad_sequence s
SET currentnext = t.startno::numeric,
    updated = now(),
    updatedby = '0'
FROM (VALUES
        ('AR Invoice', 10000000), ('AP Payment', 1000000), ('AR Receipt', 1000000),
        ('MM Shipment', 1000000), ('Standard Order', 1000000), ('Purchase Order', 1000000),
        ('DocumentNo_C_Invoice', 10000000), ('Secuencia TICKETBAI', 1000000),
        ('DocumentNo_M_InOut', 10000000), ('DocumentNo_M_Movement', 10000000),
        ('DocumentNo_A_Asset', 10000000)
     ) AS t(name, startno)
WHERE s.ad_client_id = :client_id
  AND s.name = t.name
  AND s.currentnext IS DISTINCT FROM t.startno::numeric;

-- @report
-- Read-only, runs after a successful @apply in the same transaction. Post-condition check: lists
-- any in-scope sequence STILL off target once the fix has run. Now that CURRENTNEXT is set in both
-- directions there is no legitimate "left off target" case left, so THIS RESULT SHOULD ALWAYS BE
-- EMPTY -- a non-empty `detail` on the APPLIED ledger row means something raced the update or a row
-- was skipped, and is worth investigating. (It replaces the previous report, which listed sequences
-- whose CURRENTNEXT had been deliberately left above STARTNO by the forward-only rule; that rule is
-- gone, so that report would now describe behaviour this fix no longer has.)
SELECT s.name AS sequence_name,
       'STILL OFF TARGET after apply: currentnext=' || s.currentnext
         || ' startno=' || s.startno || ' expected=' || t.startno AS detail
FROM ad_sequence s
JOIN (VALUES
        ('AR Invoice', 10000000), ('AP Payment', 1000000), ('AR Receipt', 1000000),
        ('MM Shipment', 1000000), ('Standard Order', 1000000), ('Purchase Order', 1000000),
        ('DocumentNo_C_Invoice', 10000000), ('Secuencia TICKETBAI', 1000000),
        ('DocumentNo_M_InOut', 10000000), ('DocumentNo_M_Movement', 10000000),
        ('DocumentNo_A_Asset', 10000000)
     ) AS t(name, startno) ON t.name = s.name
WHERE s.ad_client_id = :client_id
  AND (s.startno IS DISTINCT FROM t.startno::numeric
       OR s.currentnext IS DISTINCT FROM t.startno::numeric)
ORDER BY s.name;
