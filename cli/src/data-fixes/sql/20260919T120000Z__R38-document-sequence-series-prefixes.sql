-- @id: R38-document-sequence-series-prefixes
-- @gap: N6
-- @risk: medium
-- @type: sql
-- @description: ETP-5285 — set the product-defined PREFIX (PC/PV/FV/FVR/FCR) and align STARTNO and CURRENTNEXT at 1000000 on the five document series Etendo GO configures, for already-provisioned tenants.
--   Only the first line of @description reaches the ledger. PREFIX and CURRENTNEXT are both set in
--   BOTH directions — read the "no production tenants" premise below before reusing this fix
--   anywhere else.

-- Context (ETP-5285, gap N6)
-- ---------------------------------------------------------------------------------------------
-- ETP-5285 defines the document series a tenant configures on the "Secuencia de documentos"
-- window, with a fixed prefix and a fixed starting number:
--
--   Pedido de compra                 PC   1000000   AD_Sequence "Purchase Order"
--   Pedido de venta                  PV   1000000   AD_Sequence "Standard Order"
--   Factura de venta                 FV   1000000   AD_Sequence "AR Invoice"
--   Factura de venta rectificativa   FVR  1000000   AD_Sequence "Factura Rectificativa (Ventas)"
--   Factura de compra rectificativa  FCR  1000000   AD_Sequence "Factura Rectificativa (Compras)"
--
-- The preventive front of the ticket corrects
-- com.etendoerp.go/referencedata/sampledata/GOClient/AD_SEQUENCE.xml so every NEW tenant is born
-- with those five prefixes (and with AR Invoice moved from 10000000 down to 1000000). This
-- corrective closes the same gap on tenants onboarded before that dataset change.
--
-- THE SIXTH SERIES IS DELIBERATELY ABSENT
-- ---------------------------------------------------------------------------------------------
-- The ticket lists a sixth, "Factura de compra" (FC). There is no AD_Sequence to give it a prefix:
-- AP Invoice carries IsDocNoControlled='N' and no sequence in 76 of 76 doctypes across all 75
-- clients, because a purchase invoice is numbered by the supplier (stock Openbravo semantics). Its
-- proposed number comes from the shared DocumentNo_C_Invoice fallback counter, which is ALSO
-- duplicated per tenant (see R31's header). Giving FC a real series means creating a sequence AND
-- flipping C_DocType.IsDocNoControlled to 'Y' for AP Invoice — a change to how purchase invoices
-- are numbered, i.e. a product decision, tracked separately. Do NOT widen this fix to cover it.
--
-- SCOPE BOUNDARY -- DO NOT WIDEN THIS FIX
-- ---------------------------------------------------------------------------------------------
-- Exactly the five sequences in the VALUES blocks below. The tenant carries ~240 others; they keep
-- whatever prefix and numbering they have. The corrective must mirror the preventive exactly and
-- never exceed it: widening this list without also widening AD_SEQUENCE.xml in the same change is a
-- defect, not an improvement. In particular, this fix does NOT touch AP Payment, AR Receipt, MM
-- Shipment or Secuencia TICKETBAI — ETP-5285 only removed those four from the WINDOW's allowlist
-- (DocumentSequenceHandler.VISIBLE_SEQUENCE_NAMES); their rows and their numbering are unchanged.
--
-- RELATIONSHIP WITH R31-document-sequence-startno -- THEY DO NOT FIGHT
-- ---------------------------------------------------------------------------------------------
-- R31 (20260902T120000Z) also targets AR Invoice, Standard Order and Purchase Order, and pins AR
-- Invoice at 10000000 — the value the dataset shipped at the time. This fix supersedes that single
-- value with 1000000. There is no ping-pong, for two independent reasons:
--   1. The runner sorts fixes lexically by file name, so R31 always runs BEFORE this one within the
--      same pass. A tenant that needs both ends at this fix's values.
--   2. A fix that already reached APPLIED / MANUALLY_FIXED / SKIPPED_NOT_NEEDED is never re-run
--      (`PROCESSED` in run.js), so R31 cannot re-raise AR Invoice on a later pass.
-- Do NOT "fix" the discrepancy by editing R31's VALUES: tenants have already applied it as written,
-- and rewriting an applied fix makes the ledger describe something that never ran.
--
-- STARTNO vs CURRENTNEXT vs PREFIX -- AND THE FORWARD-ONLY RULE
-- ---------------------------------------------------------------------------------------------
-- STARTNO is metadata: the base a sequence is RESET to, never a number a document already carries.
-- Correcting it can never renumber anything that exists, so it is corrected unconditionally, in
-- both directions.
--
-- CURRENTNEXT is the next number that will be ISSUED. LOWERING it makes a sequence hand out numbers
-- it has handed out before — on a tenant with real documents that is a fiscal defect, not merely a
-- data one. It is lowered here anyway, on exactly the premise R31 recorded and a human accepted on
-- 2026-09-02: there are NO production environments; every existing tenant is a test tenant plus one
-- small pre-prod, and none holds documents whose numbers matter.
--
-- PREFIX carries the same hazard in a different shape: adding "FV" to a series that has already
-- issued unprefixed invoices splits one legal series in two mid-stream. Same premise, same
-- acceptance.
--
-- >>> IF THIS FIX IS EVER RE-TARGETED AT A TENANT WITH GENUINELY ISSUED DOCUMENTS, BOTH GUARDS MUST
-- >>> COME BACK: restore `AND s.currentnext < t.startno::numeric` on statement 2, and restrict
-- >>> statement 3 to sequences that have issued nothing (`AND s.currentnext = s.startno`). The same
-- >>> statements that are harmless on a test tenant produce duplicate and split document series on
-- >>> a production one. This is a property of the ENVIRONMENT, not of the SQL: the statement cannot
-- >>> tell the difference, so the decision belongs to whoever runs it.
--
-- MATCHING IS BY NAME, AND SOME TENANTS CARRY DUPLICATES
-- ---------------------------------------------------------------------------------------------
-- Matched on AD_Sequence.NAME because sequence ids differ per tenant; this is also exactly what the
-- window's own allowlist matches on, so the two can never disagree about which row is in scope.
-- None of these five is among the known duplicated DocumentNo_* rows, but the statements are
-- per-row and individually guarded, so a duplicate would be corrected consistently rather than
-- arbitrarily. Rows are NOT deduplicated here — that question is still undecided (see R31).
--
-- WHY ONBOARDING_PROVISIONED_THROUGH IS NOT BUMPED
-- ---------------------------------------------------------------------------------------------
-- A brand-new tenant already gets the five prefixes straight from the corrected AD_SEQUENCE.xml, so
-- this fix's own @check returns 0 rows for it and the runner records a clean SKIPPED_NOT_NEEDED —
-- the same terminal state a watermark skip produces, reached by actually looking. Same shape as
-- A9/N4/N5: dataset-only preventive, no new onboarding service, no CUT bump.
--
-- LIVE VALIDATION (2026-09-19, read-only --dry-run against the shared dev DB)
-- ---------------------------------------------------------------------------------------------
--   94 tenants WOULD_APPLY, 19 SKIPPED_NOT_NEEDED, 0 FAILED.
-- Cross-checked against the DB rather than trusted: the 19 skips are EXACTLY the 19 tenants that
-- own none of these five sequences at all (partial/legacy onboarding) -- so no tenant that holds an
-- in-scope row is being skipped. 461 in-scope rows fleet-wide, and 0 of them already carry any of
-- PC/PV/FV/FVR/FCR, so every WOULD_APPLY is a genuine correction rather than a re-run artefact.

-- Idempotency
-- ---------------------------------------------------------------------------------------------
-- Two layers. @check returns rows only while some correction still applies, so a healthy tenant is
-- SKIPPED_NOT_NEEDED and @apply never runs. All three @apply statements are ALSO self-guarded by
-- `IS DISTINCT FROM` against their own target (NULL-safe, unlike `<>` — and PREFIX is genuinely
-- NULL on the three sequences that never had one), so a re-run after a successful apply matches
-- zero rows. Every statement is scoped by ad_client_id = :client_id.

-- @check
-- Returns >=1 row while any of the five series has a PREFIX, STARTNO or CURRENTNEXT off target, in
-- EITHER direction. 0 rows => this tenant's series are already correct (a new tenant born from the
-- corrected dataset lands here), or it has none of these sequences at all.
SELECT 1
FROM ad_sequence s
JOIN (VALUES
        ('Purchase Order', 'PC', 1000000),
        ('Standard Order', 'PV', 1000000),
        ('AR Invoice', 'FV', 1000000),
        ('Factura Rectificativa (Ventas)', 'FVR', 1000000),
        ('Factura Rectificativa (Compras)', 'FCR', 1000000)
     ) AS t(name, prefix, startno) ON t.name = s.name
WHERE s.ad_client_id = :client_id
  AND (s.prefix IS DISTINCT FROM t.prefix
       OR s.startno IS DISTINCT FROM t.startno::numeric
       OR s.currentnext IS DISTINCT FROM t.startno::numeric)
LIMIT 1;

-- @apply

-- 1. STARTNO -- corrected unconditionally. Pure metadata (the reset base), so this can never
--    renumber an existing document. Self-guarded by IS DISTINCT FROM, which also keeps
--    `updated`/`updatedby` honest on a re-run.
UPDATE ad_sequence s
SET startno = t.startno::numeric,
    updated = now(),
    updatedby = '0'
FROM (VALUES
        ('Purchase Order', 1000000),
        ('Standard Order', 1000000),
        ('AR Invoice', 1000000),
        ('Factura Rectificativa (Ventas)', 1000000),
        ('Factura Rectificativa (Compras)', 1000000)
     ) AS t(name, startno)
WHERE s.ad_client_id = :client_id
  AND s.name = t.name
  AND s.startno IS DISTINCT FROM t.startno::numeric;

-- 2. CURRENTNEXT -- set to the target in BOTH directions, so the series ends at delta 0. The
--    `IS DISTINCT FROM` here is the idempotency guard, not a safety guard. The safety guard
--    (`AND s.currentnext < t.startno::numeric`, forward-only) is deliberately absent on the
--    "no production tenants" premise in the header. RESTORE IT before running this against any
--    tenant holding genuinely issued documents.
UPDATE ad_sequence s
SET currentnext = t.startno::numeric,
    updated = now(),
    updatedby = '0'
FROM (VALUES
        ('Purchase Order', 1000000),
        ('Standard Order', 1000000),
        ('AR Invoice', 1000000),
        ('Factura Rectificativa (Ventas)', 1000000),
        ('Factura Rectificativa (Compras)', 1000000)
     ) AS t(name, startno)
WHERE s.ad_client_id = :client_id
  AND s.name = t.name
  AND s.currentnext IS DISTINCT FROM t.startno::numeric;

-- 3. PREFIX -- the actual content of this ticket. Three of the five had no prefix at all (NULL),
--    the two rectificativas carried ETP-4737's interim 'REC-'. All five prefixes satisfy the
--    Spanish fiscal rules DocumentSequenceHandler enforces on write (uppercase A-Z/0-9/hyphen, no
--    I O Y W Ñ, <= 20 chars), so a value written here can also be re-saved from the window without
--    being rejected. Same "no production tenants" premise as statement 2: on a tenant that has
--    already issued unprefixed documents this splits one series in two.
UPDATE ad_sequence s
SET prefix = t.prefix,
    updated = now(),
    updatedby = '0'
FROM (VALUES
        ('Purchase Order', 'PC'),
        ('Standard Order', 'PV'),
        ('AR Invoice', 'FV'),
        ('Factura Rectificativa (Ventas)', 'FVR'),
        ('Factura Rectificativa (Compras)', 'FCR')
     ) AS t(name, prefix)
WHERE s.ad_client_id = :client_id
  AND s.name = t.name
  AND s.prefix IS DISTINCT FROM t.prefix;

-- @report
-- Read-only, runs after a successful @apply in the same transaction. Post-condition check: lists
-- any in-scope series STILL off target once the fix has run. There is no legitimate "left off
-- target" case, so THIS RESULT SHOULD ALWAYS BE EMPTY -- a non-empty `detail` on the APPLIED ledger
-- row means something raced the update or a row was skipped, and is worth investigating.
SELECT s.name AS sequence_name,
       'STILL OFF TARGET after apply: prefix=' || COALESCE(s.prefix, '<null>')
         || ' currentnext=' || s.currentnext || ' startno=' || s.startno
         || ' expected prefix=' || t.prefix || ' expected number=' || t.startno AS detail
FROM ad_sequence s
JOIN (VALUES
        ('Purchase Order', 'PC', 1000000),
        ('Standard Order', 'PV', 1000000),
        ('AR Invoice', 'FV', 1000000),
        ('Factura Rectificativa (Ventas)', 'FVR', 1000000),
        ('Factura Rectificativa (Compras)', 'FCR', 1000000)
     ) AS t(name, prefix, startno) ON t.name = s.name
WHERE s.ad_client_id = :client_id
  AND (s.prefix IS DISTINCT FROM t.prefix
       OR s.startno IS DISTINCT FROM t.startno::numeric
       OR s.currentnext IS DISTINCT FROM t.startno::numeric)
ORDER BY s.name;
