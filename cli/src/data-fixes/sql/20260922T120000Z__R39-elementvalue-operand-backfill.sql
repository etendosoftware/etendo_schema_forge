-- @id: R39-elementvalue-operand-backfill
-- @gap: ETP-5442
-- @risk: low
-- @type: sql
-- @description: Backfill the 39 GOClient C_ElementValue_Operand rows (formula accounts) missing on tenants provisioned before the onboarding fix added C_ELEMENTVALUE_OPERAND to the imported dataset

-- Context (ETP-5442)
-- --------------------------------------------------------------------------------------------
-- C_ELEMENTVALUE_OPERAND defines "formula accounts": an account whose reported amount is
-- computed from a list of signed operand accounts (e.g. "P.G.D = P.G.C + P.G.19") instead of
-- being summed from children in the account tree. GOClient's onboarding dataset never included
-- this table (missing from OnboardingDatasetDefinition.INCLUDED_TABLES in com.etendoerp.go), so
-- every tenant provisioned before that gap was closed has ZERO operand rows. Effect: the
-- "Pérdidas y Ganancias" and "Balance de Situación" reports silently DROP every formula-total
-- row (the report engine computes 0 for them, and "Show Only Account With Value" filters zero
-- rows away) — no error, the totals are just missing. Confirmed live: of 236 non-System clients,
-- 232 have zero rows in C_ELEMENTVALUE_OPERAND. The preventive fix already shipped in
-- com.etendoerp.go; this corrective covers the tenants provisioned before it.
--
-- Why the source ids can't just be copied
-- --------------------------------------------------------------------------------------------
-- Both C_ELEMENTVALUE_ID (the owner/formula account) and ACCOUNT_ID (the operand) are FKs into
-- C_ELEMENTVALUE, which is client-scoped. Writing GOClient's own ids into another tenant would
-- create cross-client FKs, which Etendo's AD scoping forbids. Both sides of every row are
-- therefore resolved by `value` inside the TARGET tenant, exactly as R26-acct-rpt-definitions
-- resolves 'PYG'/'A'/'P' — same problem class, same fix shape.
--
-- Why `value` ALONE is not enough (mandatory tree disambiguation)
-- --------------------------------------------------------------------------------------------
-- A tenant can own more than one account tree (C_Element) — verified live: 3 of the 236 clients
-- do. (c_element_id, value) IS unique across the whole DB (verified: no ambiguous pair exists),
-- but `value` alone is NOT unique across a tenant that owns two trees, and a lookup by value
-- alone risks matching the wrong tree or silently creating an operand against an account the
-- schema doesn't even post to. The disambiguator is the schema itself, exactly as in R26:
-- C_AcctSchema (active, client-scoped) -> C_AcctSchema_Element (elementtype = 'AC', active) ->
-- C_ElementValue.value. Every lookup below goes schema -> its 'AC' element -> value, never value
-- alone. Verified live: all 236 clients have an active 'AC' element on at least one schema.
--
-- Owner and operand must resolve within the SAME tree
-- --------------------------------------------------------------------------------------------
-- Both C_ELEMENTVALUE_ID and ACCOUNT_ID are resolved against the SAME c_element_id (the one
-- tied to the schema's active 'AC' element). If a tenant's tree is missing one of the values
-- involved in a given operand row (verified live: 1 of 236 clients does not have every needed
-- value), that single row is simply skipped by the join — it never gets created against a
-- foreign tree or a NULL account. This fix does not attempt partial credit across trees.
--
-- Scope: one operand set PER DISTINCT AC TREE, not per schema and not per tenant
-- --------------------------------------------------------------------------------------------
-- C_ELEMENTVALUE_OPERAND has no c_acctschema_id column: an operand belongs to the ACCOUNT TREE,
-- not to the schema that posts against it. The schema is used here only to identify WHICH tree
-- is the real one (see the disambiguation note above), so the insert is driven by the DISTINCT
-- set of AC c_element_ids, never by the schema rows themselves. This differs deliberately from
-- R26-acct-rpt-definitions, whose target table DOES carry c_acctschema_id and is therefore
-- legitimately per-schema.
--
-- The DISTINCT is load-bearing, not cosmetic. Nothing in the AD model stops two active schemas
-- from sharing one AC tree. Were that to happen, a schema-driven join would emit the same
-- (owner, seqno) row twice in a SINGLE INSERT, and the NOT EXISTS guard below cannot see rows
-- being inserted by its own statement — both copies would pass the guard and land, silently
-- double-counting that operand in every report that reads it. Verified live that no tenant is
-- in that shape TODAY (2 tenants have two active AC schema-elements, but they point at different
-- trees), so this is a latent trap being closed, not an observed failure.
--
-- The parenthesised accounts are NOT a copy-paste duplicate — do not collapse them
-- --------------------------------------------------------------------------------------------
-- (5510), (5523), (5524) and (5525) each carry THREE operand rows against their OWN base
-- account (signs +1, -1, -1), netting to -1x the base account's balance. This is intentional
-- GOClient formula-account design (a "sign flip with adjustment" pattern used by these specific
-- accounts), not a mistake to simplify. Collapsing them into a single -1 operand would silently
-- change the balance-sheet/P&L figures for every tenant this fix touches. Replicated verbatim
-- from the source dataset, one INSERT row per (owner, seqno) tuple below.
--
-- Idempotency — entirely on this script, because the DB will not help
-- --------------------------------------------------------------------------------------------
-- C_ELEMENTVALUE_OPERAND has ONLY a primary key (verified via \d: no unique constraint, no
-- trigger). Nothing at the database level would reject a duplicate row, so the NOT EXISTS guard
-- below is the sole protection, keyed on the natural business key of the row: (owner
-- c_elementvalue_id, seqno) — seqno is unique per owner in the source data, so that pair alone
-- identifies an operand line. @check mirrors this exact guard so a partially-applied tenant
-- (e.g. some trees already fixed by a manual operator action, others not) is still detected as
-- needing the fix.
--
-- What this guard deliberately does NOT do: repair. If a row already exists for (owner, seqno)
-- but carries the wrong sign or points at the wrong account, NOT EXISTS is satisfied and the row
-- is left exactly as it is — this fix never overwrites it. That is the intended trade-off:
-- widening the key to include sign/account would instead INSERT a SECOND row on the same seqno,
-- and the report engine SUMS every operand of an account, so the wrong value would be added to a
-- right one rather than replaced. A corrupted operand line is therefore an explicitly
-- out-of-scope, manual-intervention case, not something this fix silently heals.
--
-- Why get_uuid() and not the runner's @uuid_KEY@ placeholder
-- --------------------------------------------------------------------------------------------
-- @uuid_KEY@ resolves to one id per key per apply — correct when a fix inserts a fixed number of
-- rows per tenant. Here the row count depends on how many schemas/trees a tenant has (1 to N),
-- so a fixed key would collide on the same primary key across schemas. This insert is set-based
-- with get_uuid() instead, the same pattern R26-acct-rpt-definitions and ~10 other fixes already
-- use for the identical reason.
--
-- Org and audit columns
-- --------------------------------------------------------------------------------------------
-- All 39 source rows carry AD_ORG_ID = '0' (client-level, not tied to any specific org) — written
-- as the literal '0', never :org_id, per the runner's placeholder rules (System/client-level org
-- is always the literal). createdby/updatedby are '0' (System), created/updated = now().
--
-- Preventive twin
-- --------------------------------------------------------------------------------------------
-- OnboardingDatasetDefinition.INCLUDED_TABLES in com.etendoerp.go now includes
-- C_ELEMENTVALUE_OPERAND, so tenants onboarded from the GOClient dataset going forward get these
-- rows straight from the sampledata import — this corrective only covers tenants provisioned
-- before that fix shipped.

-- @check
-- Needs the fix when the tenant has an active accounting schema whose 'AC' tree contains the
-- owner account of at least one operand line not yet present (by owner + seqno).
SELECT 1
FROM c_acctschema s
JOIN c_acctschema_element se
  ON se.c_acctschema_id = s.c_acctschema_id
 AND se.elementtype = 'AC'
 AND se.isactive = 'Y'
JOIN c_elementvalue owner_ev
  ON owner_ev.c_element_id = se.c_element_id
 AND owner_ev.ad_client_id = :client_id
 AND owner_ev.isactive = 'Y'
WHERE s.ad_client_id = :client_id
  AND s.isactive = 'Y'
  AND owner_ev.value IN (
    '(5510)', '(5523)', '(5524)', '(5525)',
    'A.TOTAL', 'P.TOTAL', 'P.G.A', 'P.G.B', 'P.G.C', 'P.G.D'
  )
  AND EXISTS (
    SELECT 1
    FROM (VALUES
      ('(5510)',  10), ('(5510)',  20), ('(5510)',  30),
      ('(5523)',  10), ('(5523)',  20), ('(5523)',  30),
      ('(5524)',  10), ('(5524)',  20), ('(5524)',  30),
      ('(5525)',  10), ('(5525)',  20), ('(5525)',  30),
      ('A.TOTAL', 10), ('A.TOTAL', 20),
      ('P.TOTAL', 10), ('P.TOTAL', 20), ('P.TOTAL', 30),
      ('P.G.A',   10), ('P.G.A',   20), ('P.G.A',   30), ('P.G.A',   40),
      ('P.G.A',   50), ('P.G.A',   60), ('P.G.A',   70), ('P.G.A',   80),
      ('P.G.A',   90), ('P.G.A',  100), ('P.G.A',  110), ('P.G.A',  120),
      ('P.G.B',   10), ('P.G.B',   20), ('P.G.B',   30),
      ('P.G.B',   40), ('P.G.B',   50), ('P.G.B',   60),
      ('P.G.C',   10), ('P.G.C',   20),
      ('P.G.D',   10), ('P.G.D',   20)
    ) AS wanted(owner_value, seqno)
    WHERE wanted.owner_value = owner_ev.value
      AND NOT EXISTS (
        SELECT 1
        FROM c_elementvalue_operand op
        WHERE op.ad_client_id = :client_id
          AND op.c_elementvalue_id = owner_ev.c_elementvalue_id
          AND op.seqno = wanted.seqno
      )
  )
LIMIT 1;

-- @apply
-- Set-based insert: one row per (schema's AC tree, operand line) where the owner account exists
-- in that tree, the operand account also exists in the SAME tree, and the row doesn't already
-- exist for that owner+seqno. A tenant with two active AC trees gets the full set created once
-- per tree; a line whose owner or operand account is missing from a given tree is skipped for
-- that tree only.
INSERT INTO c_elementvalue_operand (
  c_elementvalue_operand_id, sign, c_elementvalue_id, account_id, seqno,
  ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby
)
SELECT
  get_uuid(), spec.sign, owner_ev.c_elementvalue_id, operand_ev.c_elementvalue_id, spec.seqno,
  :client_id, '0', 'Y', now(), '0', now(), '0'
FROM (
  -- DISTINCT: one pass per AC tree even when several active schemas share it (see scope note).
  SELECT DISTINCT se.c_element_id
  FROM c_acctschema s
  JOIN c_acctschema_element se
    ON se.c_acctschema_id = s.c_acctschema_id
   AND se.elementtype = 'AC'
   AND se.isactive = 'Y'
  WHERE s.ad_client_id = :client_id
    AND s.isactive = 'Y'
) tree
JOIN (VALUES
  ('(5510)',  10,  1, '5510'), ('(5510)',  20, -1, '5510'), ('(5510)',  30, -1, '5510'),
  ('(5523)',  10,  1, '5523'), ('(5523)',  20, -1, '5523'), ('(5523)',  30, -1, '5523'),
  ('(5524)',  10,  1, '5524'), ('(5524)',  20, -1, '5524'), ('(5524)',  30, -1, '5524'),
  ('(5525)',  10,  1, '5525'), ('(5525)',  20, -1, '5525'), ('(5525)',  30, -1, '5525'),
  ('A.TOTAL', 10,  1, 'A.A'),  ('A.TOTAL', 20,  1, 'A.B'),
  ('P.TOTAL', 10,  1, 'P.A'),  ('P.TOTAL', 20,  1, 'P.B'),  ('P.TOTAL', 30,  1, 'P.C'),
  ('P.G.A',   10,  1, 'P.G.1'),  ('P.G.A',   20,  1, 'P.G.2'),  ('P.G.A',   30,  1, 'P.G.3'),
  ('P.G.A',   40,  1, 'P.G.4'),  ('P.G.A',   50,  1, 'P.G.5'),  ('P.G.A',   60,  1, 'P.G.6'),
  ('P.G.A',   70,  1, 'P.G.7'),  ('P.G.A',   80,  1, 'P.G.8'),  ('P.G.A',   90,  1, 'P.G.9'),
  ('P.G.A',  100,  1, 'P.G.10'), ('P.G.A',  110,  1, 'P.G.11'), ('P.G.A',  120,  1, 'P.G.12'),
  ('P.G.B',   10,  1, 'P.G.13'), ('P.G.B',   20,  1, 'P.G.14'), ('P.G.B',   30,  1, 'P.G.15'),
  ('P.G.B',   40,  1, 'P.G.16'), ('P.G.B',   50,  1, 'P.G.17'), ('P.G.B',   60,  1, 'P.G.18'),
  ('P.G.C',   10,  1, 'P.G.A'),  ('P.G.C',   20,  1, 'P.G.B'),
  ('P.G.D',   10,  1, 'P.G.C'),  ('P.G.D',   20,  1, 'P.G.19')
) AS spec(owner_value, seqno, sign, operand_value)
  ON TRUE
JOIN c_elementvalue owner_ev
  ON owner_ev.c_element_id = tree.c_element_id
 AND owner_ev.ad_client_id = :client_id
 AND owner_ev.isactive = 'Y'
 AND owner_ev.value = spec.owner_value
JOIN c_elementvalue operand_ev
  ON operand_ev.c_element_id = tree.c_element_id
 AND operand_ev.ad_client_id = :client_id
 AND operand_ev.isactive = 'Y'
 AND operand_ev.value = spec.operand_value
WHERE NOT EXISTS (
    SELECT 1
    FROM c_elementvalue_operand op
    WHERE op.ad_client_id = :client_id
      AND op.c_elementvalue_id = owner_ev.c_elementvalue_id
      AND op.seqno = spec.seqno
  );

-- @report
-- Read-only, same transaction as @apply. Lists every operand line this fix could NOT create
-- because the tree is missing the owner account, the operand account, or both.
--
-- Why this section exists: @check only requires that at least one OWNER account is present, so a
-- tenant whose tree lacks some of the referenced accounts is legitimately reported as needing the
-- fix, the @apply then silently skips those lines (the join simply finds nothing), and the run is
-- recorded as APPLIED. Without this report, that tenant would look fully fixed while its report
-- totals stayed broken — verified live that 1 of 236 clients does not carry every value this fix
-- references. Anything listed here needs the account created in the chart of accounts first, and
-- then a manual operand insert; it is NOT something a re-run of this fix will pick up.
SELECT tree.c_element_id      AS account_tree,
       spec.owner_value       AS formula_account,
       spec.seqno             AS seqno,
       spec.operand_value     AS operand_account,
       CASE
         WHEN owner_ev.c_elementvalue_id IS NULL AND operand_ev.c_elementvalue_id IS NULL
           THEN 'both accounts missing from this tree'
         WHEN owner_ev.c_elementvalue_id IS NULL
           THEN 'formula account missing from this tree'
         ELSE 'operand account missing from this tree'
       END                    AS reason
FROM (
  SELECT DISTINCT se.c_element_id
  FROM c_acctschema s
  JOIN c_acctschema_element se
    ON se.c_acctschema_id = s.c_acctschema_id
   AND se.elementtype = 'AC'
   AND se.isactive = 'Y'
  WHERE s.ad_client_id = :client_id
    AND s.isactive = 'Y'
) tree
JOIN (VALUES
  ('(5510)',  10,  1, '5510'), ('(5510)',  20, -1, '5510'), ('(5510)',  30, -1, '5510'),
  ('(5523)',  10,  1, '5523'), ('(5523)',  20, -1, '5523'), ('(5523)',  30, -1, '5523'),
  ('(5524)',  10,  1, '5524'), ('(5524)',  20, -1, '5524'), ('(5524)',  30, -1, '5524'),
  ('(5525)',  10,  1, '5525'), ('(5525)',  20, -1, '5525'), ('(5525)',  30, -1, '5525'),
  ('A.TOTAL', 10,  1, 'A.A'),  ('A.TOTAL', 20,  1, 'A.B'),
  ('P.TOTAL', 10,  1, 'P.A'),  ('P.TOTAL', 20,  1, 'P.B'),  ('P.TOTAL', 30,  1, 'P.C'),
  ('P.G.A',   10,  1, 'P.G.1'),  ('P.G.A',   20,  1, 'P.G.2'),  ('P.G.A',   30,  1, 'P.G.3'),
  ('P.G.A',   40,  1, 'P.G.4'),  ('P.G.A',   50,  1, 'P.G.5'),  ('P.G.A',   60,  1, 'P.G.6'),
  ('P.G.A',   70,  1, 'P.G.7'),  ('P.G.A',   80,  1, 'P.G.8'),  ('P.G.A',   90,  1, 'P.G.9'),
  ('P.G.A',  100,  1, 'P.G.10'), ('P.G.A',  110,  1, 'P.G.11'), ('P.G.A',  120,  1, 'P.G.12'),
  ('P.G.B',   10,  1, 'P.G.13'), ('P.G.B',   20,  1, 'P.G.14'), ('P.G.B',   30,  1, 'P.G.15'),
  ('P.G.B',   40,  1, 'P.G.16'), ('P.G.B',   50,  1, 'P.G.17'), ('P.G.B',   60,  1, 'P.G.18'),
  ('P.G.C',   10,  1, 'P.G.A'),  ('P.G.C',   20,  1, 'P.G.B'),
  ('P.G.D',   10,  1, 'P.G.C'),  ('P.G.D',   20,  1, 'P.G.19')
) AS spec(owner_value, seqno, sign, operand_value)
  ON TRUE
LEFT JOIN c_elementvalue owner_ev
  ON owner_ev.c_element_id = tree.c_element_id
 AND owner_ev.ad_client_id = :client_id
 AND owner_ev.isactive = 'Y'
 AND owner_ev.value = spec.owner_value
LEFT JOIN c_elementvalue operand_ev
  ON operand_ev.c_element_id = tree.c_element_id
 AND operand_ev.ad_client_id = :client_id
 AND operand_ev.isactive = 'Y'
 AND operand_ev.value = spec.operand_value
WHERE owner_ev.c_elementvalue_id IS NULL
   OR operand_ev.c_elementvalue_id IS NULL
ORDER BY tree.c_element_id, spec.owner_value, spec.seqno;
