-- @id: R17-rectificativa-doctype-sequence
-- @gap: H1
-- @risk: medium
-- @type: sql
-- @description: ETP-4737 — provision the unified "Factura Rectificativa" AR/AP
--   document types + their REC- sequences, and retire the old Nota de
--   Credito/Devolucion types (AR Credit Memo, Return Material Sales Invoice,
--   AP CreditMemo) + their own sequences (Active=No only, never deleted).

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
