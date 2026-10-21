-- @id: R50-inout-foreign-return-doctype
-- @gap: ETP-5801
-- @risk: medium
-- @type: sql
-- @description: Repoint return-to-vendor shipments (and their fact_acct rows) that use another tenant's RTV document type to the tenant's own, and advance the own RTV sequence past the numbers already used.

-- ETP-5801 — Until ETP-5711, CreatePurchaseReturnHandler resolved the RTV shipment document type
-- with an unscoped HQL query, so the M_InOut it created could carry ANOTHER tenant's doctype
-- (usually tutin's "RTV Shipment"). Its number then came from the foreign sequence, and the
-- tenant's own RTV sequence never moved: the next return created with the own doctype can reuse
-- an existing DocumentNo.
--
-- PREVENTIVE HALF (ETP-5711, already shipped, NOT touched here): the handler is client-scoped.
-- This fix only corrects shipments created before that.
--
-- SCOPE: shipments of :client_id whose doctype belongs to another client AND is itself a
-- return-to-vendor doctype (DocBaseType 'MMR', IsReturn 'Y'). A foreign doctype of any other kind
-- is a different problem and is not touched.
--
-- POSTED SHIPMENTS: core posting (AcctServer) copies C_DocType_ID AND GL_Category_ID from the
-- document type into every fact_acct row (AD_Table_ID '319' = M_InOut), so a posted affected
-- shipment also carries the foreign tenant's GL category. Both fact columns are repointed to the
-- values a repost would produce. Amounts are untouched, so no unpost/repost.
--
-- TRIGGERS (verified on the local DB, 2026-10-21): fact_acct has no triggers. m_inout has
-- m_inout_chk_restrictions_trg, which RAISES @20501@ when C_DocType_ID changes on a row with
-- Processed = 'Y' (every completed shipment) unless AD_isTriggerEnabled() = 'N'. The m_inout
-- UPDATE therefore runs between ad_disable_triggers() / ad_enable_triggers() (the AD-native,
-- transaction-local switch also used by R1 and R50-rectificative), scoped to that single
-- statement; the sequence and fact_acct updates run with triggers enabled. Side effect of the
-- bypass: m_inout_trg_prov does not recompute MovementType (it would derive it from the target
-- doctype's IsSOTrx = 'N' -> 'V+'), so MovementType is left as stored.
--
-- TARGET DOCTYPE: same tenant, DocBaseType 'MMR', IsReturn 'Y', IsSOTrx 'N', active, org-visible
-- from the shipment's org. Order mirrors ReturnShipmentUtils.findReturnDocTypeForOrg:
-- IsDefault DESC, then the closest org by AD_ISORGINCLUDED, plus c_doctype_id as a deterministic
-- last tie-break. A shipment whose tenant has no such doctype is left untouched (never invent
-- one) and listed by @report.
--
-- ORDER MATTERS: the sequence and fact_acct updates run BEFORE the m_inout update — that update
-- erases the "foreign doctype" marker the other two statements join on.
--
-- SEQUENCE: only the own tenant's ad_sequence referenced by the target doctype's
-- DocNoSequence_ID advances, forward-only (currentnext < new value). The new value is
-- MAX(numeric DocumentNo) + 1 over (a) the shipments being repointed and (b) the tenant's
-- shipments already using the target doctype, per sequence. It is deliberately NOT a tenant-wide
-- MAX over m_inout: receipts/shipments may share a sequence and that would inflate it. Only
-- all-digit DocumentNos of 1 to 9 digits count (a prefixed/suffixed number is not parsed).
-- LENGTH GUARD: ad_sequence.currentnext is numeric(10,0) (max 9999999999). A longer all-digit
-- DocumentNo would make the UPDATE raise 'numeric field overflow', roll the whole fix back and
-- leave the tenant unfixable. With at most 9 digits the highest value is 999999999 and MAX + 1
-- = 1000000000 (10 digits) still fits. A DocumentNo that does not fit is ignored for the
-- sequence advance exactly like a prefixed one; its shipment is still repointed. Already-issued
-- DocumentNos are NOT renumbered.
--
-- The own sequence can jump far: the DocumentNos of the affected shipments come from the foreign
-- sequence's number space. That is intentional (it only leaves gaps; nothing is renumbered).
--
-- REPORT FACTS: only facts of RTV shipments (current doctype MMR / IsReturn 'Y') are scanned, so
-- an unrelated shipment with a pre-existing foreign doctype or GL category is not listed forever.
--
-- IDEMPOTENT: after a run the @check finds 0 rows for every repointed shipment; every @apply
-- statement re-applies its own guard. Shipments with no own target doctype keep matching the
-- @check on purpose, so the runner keeps listing them through @report.

-- @check
SELECT 1
FROM m_inout m
JOIN c_doctype fdt ON fdt.c_doctype_id = m.c_doctype_id
WHERE m.ad_client_id = :client_id
  AND fdt.ad_client_id <> :client_id
  AND fdt.docbasetype = 'MMR'
  AND fdt.isreturn = 'Y'
LIMIT 1;

-- @apply
UPDATE ad_sequence s
SET currentnext = n.nxt,
    updated = now(),
    updatedby = '0'
FROM (
  SELECT u.seq_id,
         MAX(CASE WHEN u.documentno ~ '^[0-9]{1,9}$' THEN u.documentno::numeric END) + 1 AS nxt
  FROM (
    -- (a) the shipments being repointed
    SELECT t.docnosequence_id AS seq_id, m.documentno
    FROM m_inout m
    JOIN c_doctype fdt ON fdt.c_doctype_id = m.c_doctype_id
      AND fdt.ad_client_id <> :client_id
      AND fdt.docbasetype = 'MMR'
      AND fdt.isreturn = 'Y'
    CROSS JOIN LATERAL (
      SELECT dt.c_doctype_id, dt.docnosequence_id
      FROM c_doctype dt
      WHERE dt.ad_client_id = m.ad_client_id
        AND dt.docbasetype = 'MMR'
        AND dt.isreturn = 'Y'
        AND dt.issotrx = 'N'
        AND dt.isactive = 'Y'
        AND ad_isorgincluded(m.ad_org_id, dt.ad_org_id, m.ad_client_id) <> -1
      ORDER BY dt.isdefault DESC, ad_isorgincluded(m.ad_org_id, dt.ad_org_id, m.ad_client_id) ASC,
               dt.c_doctype_id
      LIMIT 1
    ) t
    WHERE m.ad_client_id = :client_id
      AND t.docnosequence_id IS NOT NULL
    UNION ALL
    -- (b) the tenant's shipments already using a target doctype of (a)
    SELECT dt2.docnosequence_id AS seq_id, m2.documentno
    FROM m_inout m2
    JOIN c_doctype dt2 ON dt2.c_doctype_id = m2.c_doctype_id
    WHERE m2.ad_client_id = :client_id
      AND dt2.ad_client_id = :client_id
      AND dt2.docnosequence_id IS NOT NULL
      AND dt2.c_doctype_id IN (
        SELECT t2.c_doctype_id
        FROM m_inout m3
        JOIN c_doctype fdt3 ON fdt3.c_doctype_id = m3.c_doctype_id
          AND fdt3.ad_client_id <> :client_id
          AND fdt3.docbasetype = 'MMR'
          AND fdt3.isreturn = 'Y'
        CROSS JOIN LATERAL (
          SELECT dt3.c_doctype_id
          FROM c_doctype dt3
          WHERE dt3.ad_client_id = m3.ad_client_id
            AND dt3.docbasetype = 'MMR'
            AND dt3.isreturn = 'Y'
            AND dt3.issotrx = 'N'
            AND dt3.isactive = 'Y'
            AND ad_isorgincluded(m3.ad_org_id, dt3.ad_org_id, m3.ad_client_id) <> -1
          ORDER BY dt3.isdefault DESC,
                   ad_isorgincluded(m3.ad_org_id, dt3.ad_org_id, m3.ad_client_id) ASC,
                   dt3.c_doctype_id
          LIMIT 1
        ) t2
        WHERE m3.ad_client_id = :client_id
      )
  ) u
  WHERE u.documentno ~ '^[0-9]{1,9}$'
  GROUP BY u.seq_id
) n
WHERE s.ad_sequence_id = n.seq_id
  AND s.ad_client_id = :client_id
  AND s.currentnext < n.nxt;

UPDATE fact_acct f
SET c_doctype_id = t.c_doctype_id,
    gl_category_id = t.gl_category_id,
    updated = now(),
    updatedby = '0'
FROM m_inout m
JOIN c_doctype fdt ON fdt.c_doctype_id = m.c_doctype_id
  AND fdt.ad_client_id <> :client_id
  AND fdt.docbasetype = 'MMR'
  AND fdt.isreturn = 'Y'
CROSS JOIN LATERAL (
  SELECT dt.c_doctype_id, dt.gl_category_id
  FROM c_doctype dt
  WHERE dt.ad_client_id = m.ad_client_id
    AND dt.docbasetype = 'MMR'
    AND dt.isreturn = 'Y'
    AND dt.issotrx = 'N'
    AND dt.isactive = 'Y'
    AND ad_isorgincluded(m.ad_org_id, dt.ad_org_id, m.ad_client_id) <> -1
  ORDER BY dt.isdefault DESC, ad_isorgincluded(m.ad_org_id, dt.ad_org_id, m.ad_client_id) ASC,
           dt.c_doctype_id
  LIMIT 1
) t
WHERE m.ad_client_id = :client_id
  AND f.ad_client_id = :client_id
  AND f.ad_table_id = '319'
  AND f.record_id = m.m_inout_id;

-- m_inout_chk_restrictions_trg forbids changing C_DocType_ID on a processed shipment unless AD
-- triggers are off; the switch is transaction-local and scoped to this one statement.
SELECT ad_disable_triggers();

-- Self-join (m2): a LATERAL in FROM cannot reference the UPDATE target itself.
UPDATE m_inout m
SET c_doctype_id = t.c_doctype_id,
    updated = now(),
    updatedby = '0'
FROM m_inout m2
JOIN c_doctype fdt ON fdt.c_doctype_id = m2.c_doctype_id
  AND fdt.ad_client_id <> :client_id
  AND fdt.docbasetype = 'MMR'
  AND fdt.isreturn = 'Y'
CROSS JOIN LATERAL (
  SELECT dt.c_doctype_id
  FROM c_doctype dt
  WHERE dt.ad_client_id = m2.ad_client_id
    AND dt.docbasetype = 'MMR'
    AND dt.isreturn = 'Y'
    AND dt.issotrx = 'N'
    AND dt.isactive = 'Y'
    AND ad_isorgincluded(m2.ad_org_id, dt.ad_org_id, m2.ad_client_id) <> -1
  ORDER BY dt.isdefault DESC, ad_isorgincluded(m2.ad_org_id, dt.ad_org_id, m2.ad_client_id) ASC,
           dt.c_doctype_id
  LIMIT 1
) t
WHERE m.m_inout_id = m2.m_inout_id
  AND m2.ad_client_id = :client_id
  AND m.ad_client_id = :client_id;

-- Re-enable AD triggers (pairs with ad_disable_triggers() above).
SELECT ad_enable_triggers();

-- @report
SELECT 'shipment still foreign (no own RTV doctype)' AS issue, m.documentno, m.m_inout_id AS record_id
FROM m_inout m
JOIN c_doctype dt ON dt.c_doctype_id = m.c_doctype_id
WHERE m.ad_client_id = :client_id
  AND dt.ad_client_id <> :client_id
  AND dt.docbasetype = 'MMR'
  AND dt.isreturn = 'Y'
UNION ALL
SELECT DISTINCT 'fact_acct still foreign', NULL, f.record_id
FROM fact_acct f
JOIN m_inout m ON m.m_inout_id = f.record_id
  AND m.ad_client_id = :client_id
JOIN c_doctype mdt ON mdt.c_doctype_id = m.c_doctype_id
  AND mdt.docbasetype = 'MMR'
  AND mdt.isreturn = 'Y'
LEFT JOIN c_doctype dt ON dt.c_doctype_id = f.c_doctype_id
LEFT JOIN gl_category g ON g.gl_category_id = f.gl_category_id
WHERE f.ad_client_id = :client_id
  AND f.ad_table_id = '319'
  AND (dt.ad_client_id <> :client_id OR g.ad_client_id <> :client_id);
