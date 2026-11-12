-- @id: R58-quotation-sequence-startno
-- @gap: N10
-- @risk: low
-- @type: sql
-- @description: ETP-5837 — set STARTNO 1000000 on the "Quotation" sequence where it still holds the dataset's 10000; CURRENTNEXT, prefix and documents untouched.
--   Only the first line of @description reaches the ledger.

-- Context (ETP-5837 QA round 1, CP-17, gap N10)
-- ---------------------------------------------------------------------------------------------
-- The curated GOClient dataset (com.etendoerp.go/referencedata/sampledata/GOClient/AD_SEQUENCE.xml)
-- shipped the "Quotation" sequence with STARTNO 10000, while the other six document series shown
-- on the "Secuencias de documentos" window (Purchase Order, Standard Order, AR Invoice, AP Invoice
-- and both Factura Rectificativa series) start at 1000000. ETP-5837 made the quotation series
-- visible on that window, so the odd "Número inicial" 10000 is now in front of the user. R31
-- (ETP-5079) realigned eleven sequences and listed "Quotation" as explicitly OUT of its scope.
--
-- The preventive front is dataset-only: the "Quotation" row of AD_SEQUENCE.xml now carries
-- STARTNO 1000000, so a new tenant is born correct and this fix's @check returns 0 rows for it
-- (SKIPPED_NOT_NEEDED). That is why ONBOARDING_PROVISIONED_THROUGH is NOT bumped for this fix —
-- same reasoning as R31-document-sequence-startno.
--
-- WHAT IT CHANGES — AND WHAT IT MUST NOT
-- ---------------------------------------------------------------------------------------------
-- STARTNO only. STARTNO is metadata: the base a sequence is reset to, never a number a document
-- carries, so changing it renumbers nothing. Decided by the user (2026-11-12):
--   - CURRENTNEXT is NOT touched. Unlike R31, this fix never moves the next number to issue: the
--     quotation series is already in use on existing tenants (CURRENTNEXT 1000044 on La Paulina, app.etendo.ai, QA round 1) and the
--     next quotation must keep the number it would have got anyway.
--   - PREFIX is NOT touched. R57 already set PR where the tenant had none; a tenant's own prefix
--     stays as it is.
--   - No document is renumbered.
--
-- WHICH SEQUENCE
-- ---------------------------------------------------------------------------------------------
-- Matched by AD_Sequence.NAME = 'Quotation', the same key the dataset row and the window
-- (DocumentSequenceHandler.VISIBLE_SEQUENCE_NAMES) use. A tenant can hold more than one row with
-- that name (F&B International Group has two, each behind its own quotation doctype); every copy
-- is corrected, each guarded on its own value.
--
-- ONLY where STARTNO is still exactly 10000, the value the dataset shipped. Any other STARTNO was
-- set by someone on purpose and is left alone — @report lists it so an operator can decide.
-- That guard is also the idempotency guard: after the apply, no row matches.
--
-- Every statement is scoped by ad_client_id = :client_id.

-- @check
-- >=1 row while a "Quotation" sequence of this tenant still has the dataset's STARTNO 10000.
SELECT 1
FROM ad_sequence s
WHERE s.ad_client_id = :client_id
  AND s.name = 'Quotation'
  AND s.startno = 10000
LIMIT 1;

-- @apply
UPDATE ad_sequence s
SET startno = 1000000,
    updated = now(),
    updatedby = '0'
WHERE s.ad_client_id = :client_id
  AND s.name = 'Quotation'
  AND s.startno = 10000;

-- @report
-- Read-only, runs after a successful @apply in the same transaction. Lists a "Quotation" sequence
-- of this tenant whose STARTNO is neither the product value nor the dataset's old one: a value
-- someone chose, which this fix deliberately did not overwrite. Empty on a normal tenant.
SELECT s.name AS sequence_name,
       'quotation sequence kept its own STARTNO ' || s.startno || ' (not 10000, left alone)' AS detail
FROM ad_sequence s
WHERE s.ad_client_id = :client_id
  AND s.name = 'Quotation'
  AND s.startno IS DISTINCT FROM 1000000
ORDER BY s.ad_sequence_id;
