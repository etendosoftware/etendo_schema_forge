-- @id: R39-document-sequence-clear-descriptions
-- @gap: N9
-- @risk: low
-- @type: sql
-- @description: ETP-5364 — clear the internal, ticket-tagged DESCRIPTION the curated dataset writes onto the two rectificative sequences and the purchase-invoice one; the Document Sequence window shows that column to the end user.
--   Only the first line of @description reaches the ledger.

-- Context (ETP-5364, gap N9)
-- ---------------------------------------------------------------------------------------------
-- `artifacts/document-sequence/decisions.json` declares `description` as an EDITABLE column of the
-- "Secuencia de documentos" window (grid order 2, principal section). Whatever sits in
-- `AD_Sequence.Description` is therefore product copy the tenant reads next to its own series.
--
-- Three of the six series carry an internal engineering note there instead:
--
--   Factura Rectificativa (Ventas)    'ETP-4737: sequence for the unified sales rectificative invoice (Factura Rectificativa, AR).'
--   Factura Rectificativa (Compras)   'ETP-4737: sequence for the unified purchase rectificative invoice (Factura Rectificativa, AP).'
--   AP Invoice                        'ETP-5364: sequence for the purchase invoice series (Factura de compra, FC).'
--
-- The text reaches a tenant by two different routes, which is why matching is by NAME and not by
-- id or by provenance:
--   - the curated dataset — `GOClient/AD_SEQUENCE.xml` carries the DESCRIPTION element on all
--     three rows (ETP-5364 removes it there, which is this gap's preventive front);
--   - `R17-rectificativa-doctype-sequence`, which INSERTED the two rectificativas with exactly
--     that text on tenants onboarded before ETP-4737's dataset landed.
-- R17 is immutable and already APPLIED, so its text can only be removed by a later fix. This one.
--
-- The three other series (`Purchase Order`, `Standard Order`, `AR Invoice`) never had a
-- description and are deliberately absent.
--
-- WHY THIS MATCHES 'ETP-%' AND NOT THE EXACT STRINGS
-- ---------------------------------------------------------------------------------------------
-- The column is editable, so a tenant may legitimately have typed its own description — and that
-- text must survive. The guard is `description LIKE 'ETP-%'`: narrow enough that only the
-- engineering notes above match, wide enough to catch a row whose text drifted between R17 and the
-- dataset. A tenant-authored description does not start with a ticket key.
--
-- WHY ONBOARDING_PROVISIONED_THROUGH IS NOT BUMPED
-- ---------------------------------------------------------------------------------------------
-- A brand-new tenant is born from the corrected `AD_SEQUENCE.xml` with no description at all, so
-- this fix's @check returns 0 rows for it and the runner records a clean SKIPPED_NOT_NEEDED. Same
-- shape as R38/R39-ap-invoice-fc-series.

-- Idempotency
-- ---------------------------------------------------------------------------------------------
-- Two layers. @check returns rows only while some in-scope description is still set; the @apply
-- statement is ALSO guarded by the same `LIKE` predicate, so a re-run matches zero rows. Scoped by
-- ad_client_id = :client_id.
--
-- Pure metadata: this touches no prefix, no counter and no document. It cannot renumber anything.

-- @check
-- Returns >=1 row while any of the three series still carries a ticket-tagged description.
SELECT 1
FROM ad_sequence s
WHERE s.ad_client_id = :client_id
  AND s.name IN (
    'Factura Rectificativa (Ventas)',
    'Factura Rectificativa (Compras)',
    'AP Invoice'
  )
  AND s.description LIKE 'ETP-%'
LIMIT 1;

-- @apply

-- Clear it. NULL, not '': the window renders an empty cell either way, but NULL is what the
-- corrected dataset produces, so a fixed tenant and a newborn one end up byte-identical.
UPDATE ad_sequence s
SET description = NULL,
    updated = now(),
    updatedby = '0'
WHERE s.ad_client_id = :client_id
  AND s.name IN (
    'Factura Rectificativa (Ventas)',
    'Factura Rectificativa (Compras)',
    'AP Invoice'
  )
  AND s.description LIKE 'ETP-%';

-- @report
-- Read-only, runs after a successful @apply in the same transaction. SHOULD ALWAYS BE EMPTY — a
-- non-empty `detail` on the APPLIED ledger row means a row was written between the update and this
-- read.
SELECT s.name AS sequence_name,
       'STILL SET after apply: ' || s.description AS detail
FROM ad_sequence s
WHERE s.ad_client_id = :client_id
  AND s.name IN (
    'Factura Rectificativa (Ventas)',
    'Factura Rectificativa (Compras)',
    'AP Invoice'
  )
  AND s.description LIKE 'ETP-%'
ORDER BY s.name;
