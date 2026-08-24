-- @id: R23-verifactu-doctype-fields
-- @gap: F1
-- @risk: low
-- @type: sql
-- @description: Set Verifactu invoice type fields on Go sales DocTypes (AR Invoice and Factura Rectificativa) — no DocType window in Go, users cannot configure these manually

-- ETP-4783: the Go client's sampledata provisions two sales invoice DocTypes
-- (docbasetype='ARI', issotrx='Y') that lack the three Verifactu fields:
--
--   em_etvfac_inv_type      — invoice type code (F1, R1, …)
--   em_etvfac_verifac_desc  — human-readable Verifactu description
--   em_etvfac_reverseinvtype — reversal method (only relevant for rectificative)
--
-- GenerateRFAfterProcessingHook reads these fields from the DocType (via the
-- invoice's C_DOCTYPE_ID FK) when Verifactu is configured for an org. Without
-- them invoice completion fails. In Go there is no DocType window; users cannot
-- set these manually.
--
-- Discriminator (no hardcoded IDs — values vary across environments):
--   Non-rectificative standard sales invoice:
--     docbasetype='ARI', issotrx='Y', isreversal='N', isreturn='N',
--     em_etsg_isrectificative='N'  →  inv_type=F1, desc='Ventas'
--   Rectificative sales invoice:
--     docbasetype='ARI', issotrx='Y', isreversal='N', isreturn='N',
--     em_etsg_isrectificative='Y'  →  inv_type=R1, desc='Rectificaciones de Ventas',
--                                     reverseinvtype='I'
-- isreturn='N' excludes "Reversed Sales Invoice" (ARI+SOTrx but isreturn='Y'),
-- which is a system-generated reversal entry, not a Verifactu-reportable invoice.
--
-- Idempotency: WHERE ... AND em_etvfac_inv_type IS NULL guards each UPDATE so
-- re-runs are safe. The @check mirrors the same filter, so once both rows are
-- populated the fix converges to SKIPPED_NOT_NEEDED.
--
-- Live-DB state (2026-08-13): GOClient's two DocTypes were populated manually
-- before this fix landed (em_etvfac_inv_type = 'F1'/'R1' already set), so
-- @check returns 0 rows for GOClient → SKIPPED_NOT_NEEDED. Other tenants whose
-- DocTypes match the discriminator (e.g. F&B International Group's AR Invoice)
-- will receive F1/Ventas, which is also the correct Verifactu default for a
-- standard sales invoice — if Verifactu were activated for those orgs, the same
-- gap would surface identically.

-- @check
-- Returns rows when ANY matching DocType is still missing em_etvfac_inv_type
-- for this client (catches both the standard and rectificative variants).
SELECT 1
FROM c_doctype d
WHERE d.ad_client_id = :client_id
  AND d.docbasetype = 'ARI'
  AND d.issotrx = 'Y'
  AND d.isreversal = 'N'
  AND d.isreturn = 'N'
  AND d.em_etvfac_inv_type IS NULL;

-- @apply

-- 1. Standard (non-rectificative) sales invoice → F1 / Ventas.
UPDATE c_doctype
SET em_etvfac_inv_type     = 'F1',
    em_etvfac_verifac_desc = 'Ventas',
    updated                = now(),
    updatedby              = '0'
WHERE ad_client_id              = :client_id
  AND docbasetype               = 'ARI'
  AND issotrx                   = 'Y'
  AND isreversal                = 'N'
  AND isreturn                  = 'N'
  AND em_etsg_isrectificative   = 'N'
  AND em_etvfac_inv_type IS NULL;

-- 2. Rectificative sales invoice → R1 / Rectificaciones de Ventas / I.
UPDATE c_doctype
SET em_etvfac_inv_type       = 'R1',
    em_etvfac_verifac_desc   = 'Rectificaciones de Ventas',
    em_etvfac_reverseinvtype = 'I',
    updated                  = now(),
    updatedby                = '0'
WHERE ad_client_id              = :client_id
  AND docbasetype               = 'ARI'
  AND issotrx                   = 'Y'
  AND isreversal                = 'N'
  AND isreturn                  = 'N'
  AND em_etsg_isrectificative   = 'Y'
  AND em_etvfac_inv_type IS NULL;
