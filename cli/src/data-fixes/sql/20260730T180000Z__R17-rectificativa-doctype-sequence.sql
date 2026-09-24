-- @id: R17-rectificativa-doctype-sequence
-- @gap: H1
-- @risk: medium
-- @type: sql
-- @description: ETP-4737 — provision the unified "Factura Rectificativa" AR/AP
--   document types + their REC- sequences, and retire the old Nota de
--   Credito/Devolucion types (AR Credit Memo, Return Material Sales Invoice,
--   AP CreditMemo) + their own sequences (Active=No only, never deleted).
--   ETP-4799 — before resolving gl_category_id for the two new c_doctype rows,
--   auto-create the "AR Invoice" / "AP Invoice" GL Category when the tenant has
--   NEITHER the ES-localized nor the fallback name (13/82 Experimental tenants
--   had ZERO rows in gl_category at all, so the COALESCE below returned NULL and
--   the c_doctype NOT NULL constraint exploded; see step 0a/0b).

-- @check
-- Needed when either new rectificative doc type (AR or AP) is missing, OR any
-- of the 3 old types is still active for this tenant.
SELECT 1
FROM ad_client c
WHERE c.ad_client_id = :client_id
  AND (
    NOT EXISTS (
      SELECT 1 FROM c_doctype dt
      WHERE dt.ad_client_id = :client_id
        AND dt.em_etsg_isrectificative = 'Y'
        AND dt.docbasetype = 'ARI'
        AND dt.issotrx = 'Y'
    )
    OR NOT EXISTS (
      SELECT 1 FROM c_doctype dt
      WHERE dt.ad_client_id = :client_id
        AND dt.em_etsg_isrectificative = 'Y'
        AND dt.docbasetype = 'API'
        AND dt.issotrx = 'N'
    )
    OR EXISTS (
      SELECT 1 FROM c_doctype dt
      WHERE dt.ad_client_id = :client_id
        AND dt.name IN ('AR Credit Memo', 'Return Material Sales Invoice', 'AP CreditMemo', 'AP Credit Memo')
        AND dt.isactive = 'Y'
    )
  );

-- @apply

-- 0a. ETP-4799 — ensure the "AR Invoice" GL Category exists for this tenant
-- BEFORE the AR doc type insert (1b) resolves gl_category_id via
-- COALESCE('ES AR Invoice', 'AR Invoice'). Root cause confirmed against the DB:
-- 13 Experimental tenants have NO rows AT ALL in gl_category — not a
-- differently-named category, total absence of the table content for that
-- tenant — so both COALESCE branches returned NULL and the NOT NULL constraint
-- on c_doctype.gl_category_id exploded. Shape mirrors the plain
-- (non-ES-localized) row every other tenant in the fleet carries (confirmed on
-- GOClient and 20+ other tenants: categorytype='D' i.e. "Document" category,
-- ad_org_id='0', isdefault='N', docbasetype NULL). Guard mirrors the COALESCE
-- lookup itself (isactive='Y', either name) — once either name resolves for
-- real (ES-localized or plain, from onboarding or a prior manual fix), this
-- step is a no-op. Not expected to collide with the gl_category_name UNIQUE
-- constraint (ad_client_id, ad_org_id, name): the confirmed gap is zero rows
-- total, so there is no dormant/inactive "AR Invoice" row at org '0' to clash
-- with on any of the known affected tenants. Edge case, NOT a regression: if
-- some other tenant somehow DOES have an INACTIVE 'AR Invoice'/'AP Invoice'
-- row already at ad_org_id='0', this guarded INSERT would hit that same
-- UNIQUE constraint instead of skipping it (the guard only checks
-- isactive='Y', mirroring the COALESCE lookup below) — but that tenant was
-- already failing before this fix existed, on the c_doctype NOT NULL
-- constraint the COALESCE itself can't satisfy against an inactive-only row.
-- Same net outcome either way: rollback, retryable FAILED ledger row, just a
-- different constraint name in the error.
INSERT INTO gl_category (
  gl_category_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby,
  name, description, categorytype, isdefault, docbasetype
)
SELECT '@uuid_R17ARGLCAT@', :client_id, '0', 'Y', now(), '0', now(), '0',
  'AR Invoice', NULL, 'D', 'N', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM gl_category
  WHERE ad_client_id = :client_id
    AND name IN ('ES AR Invoice', 'AR Invoice')
    AND isactive = 'Y'
);

-- 0b. ETP-4799 — same for "AP Invoice" (the AP doc type insert (2b) resolves
-- gl_category_id via COALESCE('ES AP Invoice', 'AP Invoice')). See 0a for the
-- full rationale.
INSERT INTO gl_category (
  gl_category_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby,
  name, description, categorytype, isdefault, docbasetype
)
SELECT '@uuid_R17APGLCAT@', :client_id, '0', 'Y', now(), '0', now(), '0',
  'AP Invoice', NULL, 'D', 'N', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM gl_category
  WHERE ad_client_id = :client_id
    AND name IN ('ES AP Invoice', 'AP Invoice')
    AND isactive = 'Y'
);

-- 1a. New AR (Sales) sequence — REC-, Next Assigned Number 1,000,000, Es Rectificativo=Y.
-- Must be inserted BEFORE the doc type (ETSG_CHECK_RECTIF_DOC_TYPE trigger requires
-- an already-existing rectificative sequence when the doc type row is inserted).
INSERT INTO ad_sequence (
  ad_sequence_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby,
  name, description, isautosequence, incrementno, startno, currentnext, currentnextsys,
  istableid, prefix, suffix, startnewyear, mask, em_etsg_isrectificative
)
SELECT '@uuid_R17ARSEQ@', :client_id, '0', 'Y', now(), '0', now(), '0',
  'Factura Rectificativa (Ventas)',
  'ETP-4737: sequence for the unified sales rectificative invoice (Factura Rectificativa, AR).',
  'Y', 1, 1000000, 1000000, 100,
  'N', 'REC-', NULL, 'N', '#######', 'Y'
WHERE NOT EXISTS (
  SELECT 1 FROM c_doctype dt
  WHERE dt.ad_client_id = :client_id AND dt.em_etsg_isrectificative = 'Y'
    AND dt.docbasetype = 'ARI' AND dt.issotrx = 'Y'
);

-- 1b. New AR (Sales) doc type — Document Category = AR Invoice (ARI), not a
-- credit-memo/return variant (Return=No, Credit Memo=No).
INSERT INTO c_doctype (
  c_doctype_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby,
  name, printname, description, docbasetype, issotrx, isdocnocontrolled, docnosequence_id,
  gl_category_id, isdefault, documentcopies, ad_table_id, orgfiltered, isexpense, isreversal, isreturn,
  c_doctypeshipment_id, c_doctypeinvoice_id, c_doctypesimpinvoice_id, c_doctypeaggrinvoice_id,
  em_etsg_isrectificative
)
SELECT '@uuid_R17ARDT@', :client_id, '0', 'Y', now(), '0', now(), '0',
  'Factura Rectificativa', 'Factura Rectificativa',
  'ETP-4737: unified rectificative invoice replacing AR Credit Memo + Return Material Sales Invoice (AR side).',
  'ARI', 'Y', 'Y', '@uuid_R17ARSEQ@',
  COALESCE(
    (SELECT gl_category_id FROM gl_category WHERE ad_client_id = :client_id AND name = 'ES AR Invoice' AND isactive = 'Y' LIMIT 1),
    (SELECT gl_category_id FROM gl_category WHERE ad_client_id = :client_id AND name = 'AR Invoice' AND isactive = 'Y' LIMIT 1)
  ),
  'N', 0, '318', 'N', 'N', 'N', 'N',
  '0', '0', '0', '0',
  'Y'
WHERE NOT EXISTS (
  SELECT 1 FROM c_doctype dt
  WHERE dt.ad_client_id = :client_id AND dt.em_etsg_isrectificative = 'Y'
    AND dt.docbasetype = 'ARI' AND dt.issotrx = 'Y'
);

-- 2a. New AP (Purchases) sequence.
INSERT INTO ad_sequence (
  ad_sequence_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby,
  name, description, isautosequence, incrementno, startno, currentnext, currentnextsys,
  istableid, prefix, suffix, startnewyear, mask, em_etsg_isrectificative
)
SELECT '@uuid_R17APSEQ@', :client_id, '0', 'Y', now(), '0', now(), '0',
  'Factura Rectificativa (Compras)',
  'ETP-4737: sequence for the unified purchase rectificative invoice (Factura Rectificativa, AP).',
  'Y', 1, 1000000, 1000000, 100,
  'N', 'REC-', NULL, 'N', '#######', 'Y'
WHERE NOT EXISTS (
  SELECT 1 FROM c_doctype dt
  WHERE dt.ad_client_id = :client_id AND dt.em_etsg_isrectificative = 'Y'
    AND dt.docbasetype = 'API' AND dt.issotrx = 'N'
);

-- 2b. New AP (Purchases) doc type — Document Category = AP Invoice (API).
INSERT INTO c_doctype (
  c_doctype_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby,
  name, printname, description, docbasetype, issotrx, isdocnocontrolled, docnosequence_id,
  gl_category_id, isdefault, documentcopies, ad_table_id, orgfiltered, isexpense, isreversal, isreturn,
  c_doctypeshipment_id, c_doctypeinvoice_id, c_doctypesimpinvoice_id, c_doctypeaggrinvoice_id,
  em_etsg_isrectificative
)
SELECT '@uuid_R17APDT@', :client_id, '0', 'Y', now(), '0', now(), '0',
  'Factura Rectificativa (compras)', 'Factura Rectificativa (compras)',
  'ETP-4737: unified rectificative invoice replacing AP CreditMemo (AP side).',
  'API', 'N', 'Y', '@uuid_R17APSEQ@',
  COALESCE(
    (SELECT gl_category_id FROM gl_category WHERE ad_client_id = :client_id AND name = 'ES AP Invoice' AND isactive = 'Y' LIMIT 1),
    (SELECT gl_category_id FROM gl_category WHERE ad_client_id = :client_id AND name = 'AP Invoice' AND isactive = 'Y' LIMIT 1)
  ),
  'N', 0, '318', 'N', 'N', 'N', 'N',
  '0', '0', '0', '0',
  'Y'
WHERE NOT EXISTS (
  SELECT 1 FROM c_doctype dt
  WHERE dt.ad_client_id = :client_id AND dt.em_etsg_isrectificative = 'Y'
    AND dt.docbasetype = 'API' AND dt.issotrx = 'N'
);

-- 3. Retire the old types — Active=No only, never deleted (historical
-- invoices already referencing them must keep resolving fine).
UPDATE c_doctype SET isactive = 'N', updated = now(), updatedby = '0'
WHERE ad_client_id = :client_id
  AND name IN ('AR Credit Memo', 'Return Material Sales Invoice', 'AP CreditMemo', 'AP Credit Memo')
  AND isactive = 'Y';

UPDATE ad_sequence SET isactive = 'N', updated = now(), updatedby = '0'
WHERE ad_client_id = :client_id
  AND isactive = 'Y'
  AND ad_sequence_id IN (
    SELECT docnosequence_id FROM c_doctype
    WHERE ad_client_id = :client_id
      AND name IN ('AR Credit Memo', 'Return Material Sales Invoice', 'AP CreditMemo', 'AP Credit Memo')
      AND docnosequence_id IS NOT NULL
  );
