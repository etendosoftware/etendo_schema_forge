-- @id: R50-gl-journal-foreign-doctype
-- @gap: ETP-5719
-- @risk: medium
-- @type: sql
-- @description: Repoint GL journals (and their fact_acct rows) that use another tenant's GL Journal document type to the tenant's own, and advance the own GLJ sequences past the numbers already used.

-- ETP-5719 — Until ETP-5682, the `simple-g-l-journal` default for C_DocType_ID was an unscoped
-- SQL default, so a new journal could pick ANOTHER tenant's GLJ document type. Its number then
-- came from the foreign sequence, and the tenant's own GLJ sequence never moved: the next journal
-- created with the own doctype can reuse an existing number and hit `gl_journal_docno`
-- (ad_org_id, c_period_id, documentno).
--
-- PREVENTIVE HALF (ETP-5682, already shipped, NOT touched here): the window default is now
-- client-scoped. This fix only corrects journals created before that.
--
-- POSTED JOURNALS: core posting (AcctServer) copies C_DocType_ID AND GL_Category_ID from the
-- document type into every fact_acct row, so a posted affected journal also carries the foreign
-- tenant's GL category in its facts (gl_journal.gl_category_id itself is the tenant's own). Both
-- fact columns are repointed to the values a repost would produce. Amounts are untouched, so no
-- unpost/repost. No trigger reacts to these columns (gl_journal_chk_restrict_trg does not check
-- c_doctype_id; fact_acct has no triggers), so triggers stay enabled.
--
-- TARGET DOCTYPE: mirrors the ETP-5682 defaultExpr ORDER BY (IsDefault DESC, then the closest
-- org by AD_ISORGINCLUDED), plus c_doctype_id as a deterministic last tie-break. A journal whose
-- tenant has no own active GLJ doctype is left untouched (never invent one) and listed by @report.
--
-- ORDER MATTERS: fact_acct before gl_journal — the gl_journal update erases the "foreign doctype"
-- marker the fact_acct update joins on.
--
-- SEQUENCE: one tenant-wide MAX over numeric documentnos (over-advancing only leaves gaps;
-- under-advancing is the bug). All own active GLJ sequences advance (a tenant may have one GLJ
-- doctype per org). Forward-only; foreign tenants' sequences are never rewound.
--
-- IDEMPOTENT: after a run the @check finds 0 rows; every @apply statement re-applies its own guard.

-- @check
SELECT 1
FROM gl_journal j
JOIN c_doctype dt ON dt.c_doctype_id = j.c_doctype_id
WHERE j.ad_client_id = :client_id
  AND dt.ad_client_id <> :client_id
LIMIT 1;

-- @apply
UPDATE ad_sequence s
SET currentnext = m.nxt,
    updated = now(),
    updatedby = '0'
FROM (SELECT MAX(documentno::numeric) + 1 AS nxt
      FROM gl_journal
      WHERE ad_client_id = :client_id
        AND documentno ~ '^[0-9]+$') m
WHERE s.ad_client_id = :client_id
  AND s.ad_sequence_id IN (SELECT docnosequence_id
                           FROM c_doctype
                           WHERE ad_client_id = :client_id
                             AND docbasetype = 'GLJ'
                             AND isactive = 'Y'
                             AND docnosequence_id IS NOT NULL)
  AND m.nxt IS NOT NULL
  AND s.currentnext < m.nxt;

UPDATE fact_acct f
SET c_doctype_id = t.c_doctype_id,
    gl_category_id = t.gl_category_id,
    updated = now(),
    updatedby = '0'
FROM gl_journal j
JOIN c_doctype fdt ON fdt.c_doctype_id = j.c_doctype_id
  AND fdt.ad_client_id <> :client_id
CROSS JOIN LATERAL (
  SELECT dt.c_doctype_id, dt.gl_category_id
  FROM c_doctype dt
  WHERE dt.ad_client_id = j.ad_client_id
    AND dt.docbasetype = 'GLJ'
    AND dt.isactive = 'Y'
    AND ad_isorgincluded(j.ad_org_id, dt.ad_org_id, j.ad_client_id) <> -1
  ORDER BY dt.isdefault DESC, ad_isorgincluded(j.ad_org_id, dt.ad_org_id, j.ad_client_id) ASC,
           dt.c_doctype_id
  LIMIT 1
) t
WHERE j.ad_client_id = :client_id
  AND f.ad_client_id = :client_id
  AND f.ad_table_id = '224'
  AND f.record_id = j.gl_journal_id;

-- Self-join (j2): a LATERAL in FROM cannot reference the UPDATE target itself.
UPDATE gl_journal j
SET c_doctype_id = t.c_doctype_id,
    updated = now(),
    updatedby = '0'
FROM gl_journal j2
JOIN c_doctype fdt ON fdt.c_doctype_id = j2.c_doctype_id
  AND fdt.ad_client_id <> :client_id
CROSS JOIN LATERAL (
  SELECT dt.c_doctype_id
  FROM c_doctype dt
  WHERE dt.ad_client_id = j2.ad_client_id
    AND dt.docbasetype = 'GLJ'
    AND dt.isactive = 'Y'
    AND ad_isorgincluded(j2.ad_org_id, dt.ad_org_id, j2.ad_client_id) <> -1
  ORDER BY dt.isdefault DESC, ad_isorgincluded(j2.ad_org_id, dt.ad_org_id, j2.ad_client_id) ASC,
           dt.c_doctype_id
  LIMIT 1
) t
WHERE j.gl_journal_id = j2.gl_journal_id
  AND j2.ad_client_id = :client_id;

-- @report
SELECT 'journal still foreign (no own GLJ doctype)' AS issue, j.documentno, j.gl_journal_id AS record_id
FROM gl_journal j
JOIN c_doctype dt ON dt.c_doctype_id = j.c_doctype_id
WHERE j.ad_client_id = :client_id
  AND dt.ad_client_id <> :client_id
UNION ALL
SELECT DISTINCT 'fact_acct still foreign', NULL, f.record_id
FROM fact_acct f
LEFT JOIN c_doctype dt ON dt.c_doctype_id = f.c_doctype_id
LEFT JOIN gl_category g ON g.gl_category_id = f.gl_category_id
WHERE f.ad_client_id = :client_id
  AND f.ad_table_id = '224'
  AND (dt.ad_client_id <> :client_id OR g.ad_client_id <> :client_id);
