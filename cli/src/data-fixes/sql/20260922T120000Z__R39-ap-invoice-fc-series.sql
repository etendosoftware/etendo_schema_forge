-- @id: R39-ap-invoice-fc-series
-- @gap: N7
-- @risk: medium
-- @type: sql
-- @description: ETP-5364 — give already-onboarded tenants the sixth document series, "Factura de compra" (FC): create the AP Invoice sequence at 1000000 and point the AP Invoice doctype at it.
--   Only the first line of @description reaches the ledger. This fix CREATES a numbering series
--   where the tenant previously had none — read the "no productive tenants" premise below before
--   reusing it anywhere else.

-- Context (ETP-5364, gap N7)
-- ---------------------------------------------------------------------------------------------
-- ETP-5285 defined five document series for Etendo GO and named a sixth, "Factura de compra"
-- (FC), which it could not ship. `R38-document-sequence-series-prefixes` closed the five on
-- already-provisioned tenants:
--
--   Pedido de compra                 PC   1000000   AD_Sequence "Purchase Order"
--   Pedido de venta                  PV   1000000   AD_Sequence "Standard Order"
--   Factura de venta                 FV   1000000   AD_Sequence "AR Invoice"
--   Factura de venta rectificativa   FVR  1000000   AD_Sequence "Factura Rectificativa (Ventas)"
--   Factura de compra rectificativa  FCR  1000000   AD_Sequence "Factura Rectificativa (Compras)"
--
-- The sixth was out of scope there for a reason worth restating: stock Openbravo numbers a
-- purchase invoice from the SUPPLIER's document, so the `AP Invoice` doctype ships with
-- IsDocNoControlled='N' and no sequence at all (107 of 107 `API` default doctypes fleet-wide), and
-- the number the ERP proposes comes from the shared `DocumentNo_C_Invoice` fallback counter.
--
-- ETP-5364 is the product decision that reverses that: in Etendo GO a purchase invoice is
-- numbered by the tenant's own series, like every other invoice. Its preventive front corrects
-- com.etendoerp.go/referencedata/sampledata/GOClient/AD_SEQUENCE.xml (a new `AP Invoice` sequence,
-- prefix FC, 1000000) and GOClient/C_DOCTYPE.xml (the `AP Invoice` doctype flipped to
-- ISDOCNOCONTROLLED='Y' pointing at it), so every NEW tenant is born with six series. This
-- corrective closes the same gap on tenants onboarded before that dataset change.
--
-- BOTH HALVES ARE REQUIRED
-- ---------------------------------------------------------------------------------------------
-- A sequence nothing points at shows a configurable prefix that governs no numbering; a doctype
-- flipped to 'Y' with no sequence to read keeps using the fallback. Either one alone is a silent
-- no-op — which is why steps 1 and 3 below are not independently useful and must not be split.
--
-- THE FISCAL PREMISE -- READ BEFORE REUSING
-- ---------------------------------------------------------------------------------------------
-- On a tenant that has already issued purchase invoices, those documents carry numbers minted by
-- the `DocumentNo_C_Invoice` fallback (typically 10000000+, no prefix). After this fix the next
-- purchase invoice is `FC1000000`: the series both SPLITS and moves BACKWARDS. On a real fiscal
-- series that is not acceptable.
--
-- It is accepted here on the human decision of 2026-09-22 (the same premise R38's header carries,
-- plus one more argument that is specific to this fix):
--
--   1. There are no productive tenants yet. Every tenant in the fleet holds trial/demo data.
--   2. Going productive does NOT convert the current tenant — it CREATES A NEW ONE, provisioned
--      from the already-corrected dataset (see the app's `/upgrade` flow: "Conserva el entorno
--      demo y añade otro entorno productivo"). So a series split in a demo tenant never becomes
--      a legal series; the productive environment is born with six correct series from birth.
--
-- THE DAY (1) STOPS BEING TRUE, DO NOT RUN THIS FIX ON THE AFFECTED TENANT. There is no guard to
-- restore that would make it safe — unlike R38, which merely rewrites an existing series, this one
-- starts a numbering series over a population of documents numbered by something else. The correct
-- treatment for a tenant with issued purchase invoices is a manual decision about the starting
-- number, not this file.
--
-- SCOPE BOUNDARY -- DO NOT WIDEN THIS FIX
-- ---------------------------------------------------------------------------------------------
-- Exactly one sequence and exactly one doctype. The corrective must mirror the preventive and
-- never exceed it: widening this without widening AD_SEQUENCE.xml / C_DOCTYPE.xml in the same
-- change is a divergence between a new tenant and a fixed one.
--
-- MATCHING IS BY NAME
-- ---------------------------------------------------------------------------------------------
-- `ad_sequence.name = 'AP Invoice'` and `c_doctype.name = 'AP Invoice' AND docbasetype = 'API'`.
-- Ids differ per tenant, and the sequence name is also exactly what
-- `DocumentSequenceHandler.VISIBLE_SEQUENCE_NAMES` matches on, so this fix and the window can
-- never disagree about which row is in scope. The name filter also excludes the rectificativa
-- doctype, which is `API` too but is named 'Factura Rectificativa' and has its own FCR sequence.
--
-- The new sequence's PK is minted per tenant with `@uuid_R39APSEQ@`, NOT the dataset's
-- B1BF521B12684968B31531D88B9F20AB — that id belongs to GOClient and reusing it would plant the
-- same primary key in every tenant.
--
-- WHY ONBOARDING_PROVISIONED_THROUGH IS NOT BUMPED
-- ---------------------------------------------------------------------------------------------
-- A brand-new tenant already gets the sequence and the flipped doctype straight from the corrected
-- dataset, so this fix's own @check returns 0 rows for it and the runner records a clean
-- SKIPPED_NOT_NEEDED — the same terminal state a watermark skip produces, reached by actually
-- looking. Same shape as R38: dataset-only preventive, no new onboarding service, no CUT bump.

-- Idempotency
-- ---------------------------------------------------------------------------------------------
-- Two layers. @check returns rows only while something is still off target, so a healthy tenant is
-- SKIPPED_NOT_NEEDED and @apply never runs. All three @apply statements are ALSO self-guarded
-- (`NOT EXISTS` on the insert, `IS DISTINCT FROM` on both updates — NULL-safe, and
-- `docnosequence_id` is genuinely NULL on an untouched tenant), so a re-run matches zero rows.
-- Every statement is scoped by ad_client_id = :client_id.

-- @check
-- Returns >=1 row while the tenant lacks the `AP Invoice` sequence, has one that is off target, or
-- has an `AP Invoice` doctype that is not numbered by it. 0 rows => already correct (a new tenant
-- born from the corrected dataset lands here), or the tenant has no `AP Invoice` doctype at all.
SELECT 1
FROM c_doctype dt
WHERE dt.ad_client_id = :client_id
  AND dt.name = 'AP Invoice'
  AND dt.docbasetype = 'API'
  AND (
    NOT EXISTS (
      SELECT 1 FROM ad_sequence s
      WHERE s.ad_client_id = :client_id
        AND s.name = 'AP Invoice'
        AND s.isactive = 'Y'
    )
    OR EXISTS (
      SELECT 1 FROM ad_sequence s
      WHERE s.ad_client_id = :client_id
        AND s.name = 'AP Invoice'
        AND s.isactive = 'Y'
        AND (s.prefix IS DISTINCT FROM 'FC'
             OR s.startno IS DISTINCT FROM 1000000
             OR s.currentnext IS DISTINCT FROM 1000000)
    )
    OR dt.isdocnocontrolled IS DISTINCT FROM 'Y'
    OR dt.docnosequence_id IS DISTINCT FROM (
      SELECT s.ad_sequence_id FROM ad_sequence s
      WHERE s.ad_client_id = :client_id
        AND s.name = 'AP Invoice'
        AND s.isactive = 'Y'
      ORDER BY s.created, s.ad_sequence_id
      LIMIT 1
    )
  )
LIMIT 1;

-- @apply

-- 1. The sequence. Shape mirrors the dataset row byte for byte (prefix FC, STARTNO/CURRENTNEXT
--    1000000, mask '#######', CURRENTNEXTSYS 100, ISAUTOSEQUENCE 'Y', INCREMENTNO 1,
--    EM_ETSG_ISRECTIFICATIVE 'N') EXCEPT the PK, minted per tenant, and DESCRIPTION, left NULL:
--    the Document Sequence window shows Description as an editable column, so an internal
--    ticket-tagged note there is text the end user reads (see the sibling fix
--    R39-document-sequence-clear-descriptions, which strips exactly that from the three sequences
--    that already carry one).
--    Guarded so a tenant that somehow already owns an 'AP Invoice' sequence keeps its own row and
--    only gets it aligned by step 2.
--    The insert must come BEFORE step 3, which reads the row back to point the doctype at it.
INSERT INTO ad_sequence (
  ad_sequence_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby,
  name, description, isautosequence, incrementno, startno, currentnext, currentnextsys,
  istableid, prefix, suffix, startnewyear, mask, em_etsg_isrectificative
)
SELECT '@uuid_R39APSEQ@', :client_id, '0', 'Y', now(), '0', now(), '0',
  'AP Invoice', NULL, 'Y', 1, 1000000, 1000000, 100,
  'N', 'FC', NULL, 'N', '#######', 'N'
WHERE EXISTS (
  SELECT 1 FROM c_doctype dt
  WHERE dt.ad_client_id = :client_id
    AND dt.name = 'AP Invoice'
    AND dt.docbasetype = 'API'
)
AND NOT EXISTS (
  SELECT 1 FROM ad_sequence s
  WHERE s.ad_client_id = :client_id
    AND s.name = 'AP Invoice'
    AND s.isactive = 'Y'
);

-- 2. Align an `AP Invoice` sequence that already existed. A no-op immediately after step 1 (the
--    row it just wrote is already on target); it exists so a tenant carrying a hand-made or
--    partially-migrated row converges on the same values instead of being left half-corrected.
--    Same fiscal premise as the header: this can move CURRENTNEXT backwards.
UPDATE ad_sequence s
SET prefix = 'FC',
    startno = 1000000,
    currentnext = 1000000,
    updated = now(),
    updatedby = '0'
WHERE s.ad_client_id = :client_id
  AND s.name = 'AP Invoice'
  AND s.isactive = 'Y'
  AND (s.prefix IS DISTINCT FROM 'FC'
       OR s.startno IS DISTINCT FROM 1000000
       OR s.currentnext IS DISTINCT FROM 1000000);

-- 3. The doctype. Without this the sequence numbers nothing: `IsDocNoControlled='N'` means the
--    document takes its proposed number from the shared DocumentNo_C_Invoice fallback and never
--    looks at DOCNOSEQUENCE_ID. Reads the sequence back by name rather than reusing the uuid
--    placeholder, so a tenant whose row pre-existed step 1 is pointed at ITS row, not at one that
--    was never inserted. ORDER BY makes the pick deterministic if a tenant carries duplicates.
UPDATE c_doctype dt
SET isdocnocontrolled = 'Y',
    docnosequence_id = (
      SELECT s.ad_sequence_id FROM ad_sequence s
      WHERE s.ad_client_id = :client_id
        AND s.name = 'AP Invoice'
        AND s.isactive = 'Y'
      ORDER BY s.created, s.ad_sequence_id
      LIMIT 1
    ),
    updated = now(),
    updatedby = '0'
WHERE dt.ad_client_id = :client_id
  AND dt.name = 'AP Invoice'
  AND dt.docbasetype = 'API'
  AND EXISTS (
    SELECT 1 FROM ad_sequence s
    WHERE s.ad_client_id = :client_id
      AND s.name = 'AP Invoice'
      AND s.isactive = 'Y'
  )
  AND (dt.isdocnocontrolled IS DISTINCT FROM 'Y'
       OR dt.docnosequence_id IS DISTINCT FROM (
         SELECT s.ad_sequence_id FROM ad_sequence s
         WHERE s.ad_client_id = :client_id
           AND s.name = 'AP Invoice'
           AND s.isactive = 'Y'
         ORDER BY s.created, s.ad_sequence_id
         LIMIT 1
       ));

-- @report
-- Read-only, runs after a successful @apply in the same transaction. Post-condition check: lists
-- the `AP Invoice` doctype if it is STILL not numbered by an on-target FC sequence. There is no
-- legitimate "left off target" case, so THIS RESULT SHOULD ALWAYS BE EMPTY -- a non-empty `detail`
-- on the APPLIED ledger row means something raced the update or a row was skipped.
SELECT dt.name AS doctype_name,
       'STILL OFF TARGET after apply: isdocnocontrolled=' || dt.isdocnocontrolled
         || ' docnosequence_id=' || COALESCE(dt.docnosequence_id, '<null>')
         || ' sequence prefix=' || COALESCE(
              (SELECT COALESCE(s.prefix, '<null>') || ' currentnext=' || s.currentnext
               FROM ad_sequence s
               WHERE s.ad_client_id = :client_id AND s.name = 'AP Invoice' AND s.isactive = 'Y'
               ORDER BY s.created, s.ad_sequence_id LIMIT 1),
              '<no AP Invoice sequence>') AS detail
FROM c_doctype dt
WHERE dt.ad_client_id = :client_id
  AND dt.name = 'AP Invoice'
  AND dt.docbasetype = 'API'
  AND (dt.isdocnocontrolled IS DISTINCT FROM 'Y'
       OR NOT EXISTS (
         SELECT 1 FROM ad_sequence s
         WHERE s.ad_client_id = :client_id
           AND s.name = 'AP Invoice'
           AND s.isactive = 'Y'
           AND s.ad_sequence_id = dt.docnosequence_id
           AND s.prefix = 'FC'
           AND s.startno = 1000000
       ))
ORDER BY dt.name;
