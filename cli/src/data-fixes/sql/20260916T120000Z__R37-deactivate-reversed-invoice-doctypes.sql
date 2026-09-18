-- @id: R37-deactivate-reversed-invoice-doctypes
-- @gap: ETP-5274
-- @risk: low
-- @type: sql
-- @description: ETP-5274 — deactivate the internal-use "Reversed Sales Invoice" /
--   "Reversed Purchase Invoice" document types (isreturn='Y', docbasetype ARI/API) and their
--   numbering sequences, so they stop appearing as a selectable option in the "Tipo de
--   documento" selector of Sales/Purchase Invoice. Never deleted (historical invoices may
--   reference them); a sequence shared with a doctype that stays active is left untouched
--   and surfaced via @report.

-- Background
-- --------------------------------------------------------------------------------------------
-- Both document types are system-internal: they are assigned automatically by the invoice
-- reversal process and must never be picked by a user when creating or editing an invoice.
-- Today they show up as a third option in the "Tipo de documento" selector of Factura de Venta
-- and Factura de Compra, which is the bug ETP-5274 reports.
--
-- Preventive twin (new tenants born correct)
-- --------------------------------------------------------------------------------------------
-- The rows were REMOVED from the bundled onboarding sampledata in com.etendoerp.go
-- (referencedata/sampledata/GOClient/: C_DOCTYPE.xml, C_DOCTYPE_TRL.xml,
-- C_POC_DOCTYPE_TEMPLATE.xml, C_POC_EMAILDEFINITION.xml, AD_SEQUENCE.xml,
-- AD_REF_DATA_LOADED.xml), so a tenant provisioned after that deploy never gets them at all.
-- NOTE THE DELIBERATE ASYMMETRY: the sampledata DELETES, this corrective fix only
-- DEACTIVATES. Rows are never deleted from an existing tenant — historical invoices may
-- already point at these doctypes/sequences, and C_Invoice.C_DocType_ID is a hard FK.
--
-- Discriminator (verified live, no hardcoded IDs, no matching by name)
-- --------------------------------------------------------------------------------------------
--   d.isreturn = 'Y' AND d.docbasetype IN ('ARI','API')
--
-- Verified against etendo_go_new_2 on 2026-09-16: that predicate returns EXACTLY 98 rows over
-- 48 clients, and the only two distinct names in the result set are "Reversed Purchase
-- Invoice" (API, issotrx='N', 49 rows) and "Reversed Sales Invoice" (ARI, issotrx='Y',
-- 49 rows). All 98 are isactive='Y', isdefault='N', isreversal='N', isdocnocontrolled='Y',
-- em_etsg_isrectificative='N', and none belongs to the System pseudo-tenant (0 rows at
-- ad_client_id='0'). Every one of the 98 points at its OWN ad_sequence row
-- (98 distinct docnosequence_id), all in the same client, none already inactive, none NULL.
--
-- Why NOT matched by name: the name is translated (C_DOCTYPE_TRL) and can be renamed per
-- tenant, so it is not a stable key. Why NOT by hardcoded ID: framework convention — see
-- 20260911T120000Z__R35-verifactu-doctype-fields-corrected.sql, whose header notes (lines
-- 30-31) that `isreturn='N'` is precisely what excludes "Reversed Sales Invoice" from the
-- Verifactu seeding; this fix is the mirror image of that exclusion.
--
-- Why the discriminator is NOT narrowed further (issotrx / isreversal / isdefault): each of
-- those columns is constant across all 98 matching rows, so adding it discriminates nothing
-- while creating a way to MISS a mis-seeded row on some tenant (e.g. an ARI row that somehow
-- carries issotrx='N' still needs deactivating). Confirmed there is no ARI/API doctype
-- anywhere in the DB with isreversal='Y', so that column in particular would be pure noise.
-- The other isreturn='Y' doctypes in the fleet are deliberately out of scope and excluded by
-- the docbasetype filter alone: "Return Material Sales Invoice" (ARI_RM, already inactive
-- since R17), "RTV Shipment" (MMR), "RFC Receipt" (MMS), "RTV Order" (POO), "RFC Order" (SOO).
--
-- Shared-sequence guard (MANDATORY — the whole point of this fix)
-- --------------------------------------------------------------------------------------------
-- A sequence must NOT be deactivated merely because one of the target doctypes references it.
-- Confirmed real case in this DB: client "F&B International Group"
-- (23C59575B9CF467C9620760EB255B389) has the sequence "ES Return Material Sales Invoice"
-- (5340EE6259034C45BA32A1933F4DD42E) referenced by TWO doctypes —
--   * "Reversed Sales Invoice"            (ARI,    isreturn='Y') -> deactivated by this fix
--   * "ES Return Material Sales Invoice"  (ARI_RM, isreturn='N') -> MUST STAY ACTIVE
-- Deactivating that sequence would break the numbering of a doctype that is still in use.
-- (For the record, 20260730T180000Z__R17-rectificativa-doctype-sequence.sql step 3 does NOT
-- carry this guard; that is not corrected here — R17 is applied and immutable.)
--
-- The guard is implemented by ORDERING inside the single @apply transaction: step 1
-- deactivates the doctypes first, so by the time step 2 runs, "is any doctype that remains
-- active still using this sequence?" is a plain live-state question — no hardcoded exception
-- list, and it self-adapts to whatever each tenant's doctype graph actually looks like.
--
-- N rows per client (duplicates are real)
-- --------------------------------------------------------------------------------------------
-- Every statement is set-based and makes no one-row-per-client assumption. The same F&B tenant
-- has FOUR target doctypes: two "Reversed Purchase Invoice" (each with its own distinct
-- sequence, both named "Reversed Purchase Invoice") and two "Reversed Sales Invoice" (one with
-- its own sequence, one sharing the ES Return Material one). Expected outcome for that tenant:
-- 4 doctypes deactivated, 3 sequences deactivated, 1 sequence kept active and reported.
--
-- Trigger safety (checked, not assumed)
-- --------------------------------------------------------------------------------------------
-- c_doctype carries etsg_check_rectif_doc_type and etsg_doctype_modif_rectif_trg, both of
-- which fire on UPDATE. Neither can raise here: all 98 target rows have
-- em_etsg_isrectificative='N' with isdocnocontrolled='Y' and a sequence whose own
-- em_etsg_isrectificative is also 'N' (consistent pair), and this fix does not touch any of
-- those columns — only isactive plus the audit stamp. No ad_sequence row in the fleet links
-- back to a target doctype via ad_sequence.c_doctype_id (0 rows), so step 2 cannot disturb the
-- V_Rectif_Seq_Status lookup either.
--
-- Idempotency: two-layer.
--   @check fires only while there is still something to do (an active target doctype, or an
--   orphaned still-active target sequence). Both @apply statements are additionally guarded on
--   isactive='Y', so a second run updates 0 rows and cannot flip anything back.

-- @check
-- Returns >=1 row when the fix IS needed. 0 rows => SKIPPED_NOT_NEEDED, @apply never runs.
-- Two independent reasons: (a) a target doctype is still active; (b) the doctypes were already
-- deactivated (by hand, or by a partially-applied earlier state) but a target sequence is
-- still active and no longer used by ANY active doctype.
SELECT 1
FROM c_doctype d
WHERE d.ad_client_id = :client_id
  AND d.isreturn = 'Y'
  AND d.docbasetype IN ('ARI', 'API')
  AND (
    d.isactive = 'Y'
    OR EXISTS (
      SELECT 1
      FROM ad_sequence s
      WHERE s.ad_client_id = :client_id
        AND s.ad_sequence_id = d.docnosequence_id
        AND s.isactive = 'Y'
        AND NOT EXISTS (
          SELECT 1
          FROM c_doctype d2
          WHERE d2.ad_client_id = :client_id
            AND d2.docnosequence_id = s.ad_sequence_id
            AND d2.isactive = 'Y'
        )
    )
  )
LIMIT 1;

-- @apply

-- 1. Deactivate the internal reversal document types. Active=No only, NEVER deleted:
--    historical invoices already referencing them must keep resolving. Guarded on
--    isactive='Y' so a re-run is a no-op.
--    MUST run BEFORE step 2 — step 2's shared-sequence guard reads the post-step-1 state.
UPDATE c_doctype
SET isactive  = 'N',
    updated   = now(),
    updatedby = '0'
WHERE ad_client_id = :client_id
  AND isreturn     = 'Y'
  AND docbasetype IN ('ARI', 'API')
  AND isactive     = 'Y';

-- 2. Deactivate the numbering sequences those doctypes used -- but ONLY when no doctype that
--    is STILL ACTIVE references the same sequence (see the F&B "ES Return Material Sales
--    Invoice" case in the header). The target set is derived from the discriminator regardless
--    of the doctype's current isactive, so the step still works on a re-run and on a tenant
--    whose doctypes were deactivated by hand.
UPDATE ad_sequence s
SET isactive  = 'N',
    updated   = now(),
    updatedby = '0'
WHERE s.ad_client_id = :client_id
  AND s.isactive     = 'Y'
  AND EXISTS (
    SELECT 1
    FROM c_doctype d
    WHERE d.ad_client_id     = :client_id
      AND d.docnosequence_id = s.ad_sequence_id
      AND d.isreturn         = 'Y'
      AND d.docbasetype IN ('ARI', 'API')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM c_doctype d2
    WHERE d2.ad_client_id     = :client_id
      AND d2.docnosequence_id = s.ad_sequence_id
      AND d2.isactive         = 'Y'
  );

-- @report
-- Runs after @apply, read-only, in the SAME transaction; the runner writes the result into the
-- ledger's `detail` column on the APPLIED row. Lists every sequence that step 2 deliberately
-- LEFT ACTIVE because a doctype that is still active keeps using it, naming that doctype -- so
-- an operator can see exactly what was intentionally not touched, and why.
SELECT s.name                AS sequence_name,
       s.ad_sequence_id      AS sequence_id,
       d2.name               AS still_active_doctype,
       d2.docbasetype        AS still_active_docbasetype,
       d2.c_doctype_id       AS still_active_doctype_id
FROM ad_sequence s
JOIN c_doctype d2
  ON d2.ad_client_id     = :client_id
 AND d2.docnosequence_id = s.ad_sequence_id
 AND d2.isactive         = 'Y'
WHERE s.ad_client_id = :client_id
  AND s.isactive     = 'Y'
  AND EXISTS (
    SELECT 1
    FROM c_doctype d
    WHERE d.ad_client_id     = :client_id
      AND d.docnosequence_id = s.ad_sequence_id
      AND d.isreturn         = 'Y'
      AND d.docbasetype IN ('ARI', 'API')
  )
ORDER BY s.name, d2.name;
