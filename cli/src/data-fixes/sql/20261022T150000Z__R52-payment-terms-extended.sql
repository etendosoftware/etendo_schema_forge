-- @id: R52-payment-terms-extended
-- @gap: G5
-- @risk: low
-- @type: sql
-- @description: Seed the nine extra predefined payment terms (1 Dia, 7, 15, 20, 45, 100, 120, 180 and 364 Dias) into every Etendo GO tenant that does not already have a simple term with that number of days (ETP-5826)

-- Background
-- --------------------------------------------------------------------------------------------
-- Etendo GO seeds exactly four payment terms per tenant from
-- `modules/com.etendoerp.go/referencedata/sampledata/GOClient/C_PAYMENTTERM.xml`: Inmediato (0),
-- 30 Dias, 60 Dias and 90 Dias -- no C_PaymentTermLine rows, IsDueFixed='N', FixMonthOffset=0,
-- and IsNextBusinessDay='Y' on 30/60/90. A customer on any other term (e.g. 12 days) had no way
-- to pick it. ETP-5826 adds nine more predefined terms to the seed (the preventive front, same
-- ticket) and this fix gives them to the tenants that were provisioned before that change.
--
-- Each term follows the shape of the seeded 30/60/90 exactly (product decision: behave like
-- 30/60/90): NetDays=N, FixMonthOffset=0, IsDueFixed='N', IsNextBusinessDay='Y', IsDefault='N',
-- IsValid='N', FixMonthDay3=0; Name 'N Dias' ('1 Dia' singular); search key (Value) 'ND'.
-- A line-less term with NetDays=N already makes core's APRM_GEN_PAYMENTSCHEDULE_INV compute a due
-- date of invoice date + N, moved to the next business day -- nothing else is needed for the
-- term to work.
--
-- Identifying an Etendo GO tenant
-- --------------------------------------------------------------------------------------------
-- Same signature as R14/R15/R24: the tenant owns a payment method named 'Transferencia bancaria'
-- (GOClient-sampledata seed). Demo clients (F&B International Group, QA Testing) ship their own
-- unrelated English terms ('Immediate', '30 days', ...) and must not receive Spanish GO terms.
-- On top of that the fix needs an ANCHOR: the tenant's seeded "Inmediato" term (Value='I',
-- NetDays=0). The new terms are inserted in the SAME organization that owns it, so they are
-- visible exactly where the four seeded terms are (the tenant's operative org for a normal
-- tenant, GOOrg for GOClient). A GO tenant with no such anchor (it deleted or re-keyed its
-- Inmediato) gets nothing -- the fix cannot know where its terms belong, and @check reports 0
-- rows for it, so it converges as SKIPPED_NOT_NEEDED. When a tenant somehow has several
-- anchors, an active one wins, then the oldest, then the lowest id (deterministic).
--
-- What counts as "the tenant already has that term"
-- --------------------------------------------------------------------------------------------
-- A term for N days is NOT inserted when the client already has, in ANY org and active or not,
-- a "simple" term with NetDays=N: no C_PaymentTermLine rows, IsDueFixed='N' and FixMonthOffset
-- 0 or NULL. This is the same duplicate rule the backend enforces when a user creates a term
-- from the "+ Crear condicion de pago" dropdown option (PaymentTermHandler, ETP-5826), so the
-- fix never seeds a term the user could not have created by hand. A user's own "7 dias neto"
-- therefore suppresses our "7 Dias"; a term with lines or a fixed due day does not.
--
-- Unique constraint
-- --------------------------------------------------------------------------------------------
-- C_PaymentTerm has UNIQUE c_paymentterm_name (ad_client_id, ad_org_id, name). When the anchor
-- org already holds a term with the target NAME but a different shape (e.g. a "45 Dias" split in
-- two installments), the term is skipped rather than renamed -- @check applies the same guard,
-- so the fix still converges, and @report names every term skipped this way.
--
-- Translations
-- --------------------------------------------------------------------------------------------
-- Nothing to do: the runner's session has triggers enabled, so core's c_paymentterm_trg inserts
-- one C_PaymentTerm_Trl row per active system language (IsTranslated='N', copy of the base
-- name), exactly like a term created from the Classic window. The base NAME is already the
-- Spanish text (same convention as the four seeded terms).
--
-- Idempotency
-- --------------------------------------------------------------------------------------------
-- Two-layer. @check returns one row per term still missing (anchor present, no simple term with
-- that NetDays in the client, name free in the anchor org). @apply is ONE INSERT ... SELECT over
-- the same nine-row target set with the same three guards, so a re-run, or a run after a partial
-- manual seed, inserts only what is still missing and the second run is SKIPPED_NOT_NEEDED. The
-- nine targets have distinct NetDays and names, so the single statement can never collide with
-- itself.
--
-- ONBOARDING_PROVISIONED_THROUGH is NOT bumped (same call as G1/G2/G3): a tenant provisioned
-- after the seed change already has the nine terms, so this fix's @check returns 0 rows there
-- and it is a clean SKIPPED_NOT_NEEDED. Bumping the CUT from 2026-09-02 to here would also jump
-- every fix in between for new tenants, which this ticket has no business deciding.

-- @check
-- Returns one row per predefined term the tenant is still missing. 0 rows => SKIPPED_NOT_NEEDED.
WITH anchor AS (
  SELECT pt.ad_org_id
  FROM c_paymentterm pt
  WHERE pt.ad_client_id = :client_id
    AND pt.value = 'I'
    AND pt.netdays = 0
    AND EXISTS (
      SELECT 1 FROM fin_paymentmethod pm
      WHERE pm.ad_client_id = :client_id AND pm.name = 'Transferencia bancaria'
    )
  ORDER BY (pt.isactive = 'Y') DESC, pt.created, pt.c_paymentterm_id
  LIMIT 1
),
target (netdays, name, value) AS (
  VALUES (1, '1 Día', '1D'), (7, '7 Días', '7D'), (15, '15 Días', '15D'),
         (20, '20 Días', '20D'), (45, '45 Días', '45D'), (100, '100 Días', '100D'),
         (120, '120 Días', '120D'), (180, '180 Días', '180D'), (364, '364 Días', '364D')
)
SELECT t.netdays, t.name, a.ad_org_id
FROM target t
CROSS JOIN anchor a
WHERE NOT EXISTS (
    SELECT 1 FROM c_paymentterm s
    WHERE s.ad_client_id = :client_id
      AND s.netdays = t.netdays
      AND s.isduefixed = 'N'
      AND COALESCE(s.fixmonthoffset, 0) = 0
      AND NOT EXISTS (
        SELECT 1 FROM c_paymenttermline l WHERE l.c_paymentterm_id = s.c_paymentterm_id
      )
  )
  AND NOT EXISTS (
    SELECT 1 FROM c_paymentterm n
    WHERE n.ad_client_id = :client_id
      AND n.ad_org_id = a.ad_org_id
      AND n.name = t.name
  )
ORDER BY t.netdays;

-- @apply
-- One guarded INSERT for the nine terms, in the anchor org. Ids come from get_uuid(), so every
-- tenant gets its own fresh set; c_paymentterm_trg adds the C_PaymentTerm_Trl rows.
INSERT INTO c_paymentterm (
  c_paymentterm_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby,
  name, isduefixed, netdays, fixmonthoffset, isnextbusinessday, isdefault, value, isvalid,
  fixmonthday3
)
WITH anchor AS (
  SELECT pt.ad_org_id
  FROM c_paymentterm pt
  WHERE pt.ad_client_id = :client_id
    AND pt.value = 'I'
    AND pt.netdays = 0
    AND EXISTS (
      SELECT 1 FROM fin_paymentmethod pm
      WHERE pm.ad_client_id = :client_id AND pm.name = 'Transferencia bancaria'
    )
  ORDER BY (pt.isactive = 'Y') DESC, pt.created, pt.c_paymentterm_id
  LIMIT 1
),
target (netdays, name, value) AS (
  VALUES (1, '1 Día', '1D'), (7, '7 Días', '7D'), (15, '15 Días', '15D'),
         (20, '20 Días', '20D'), (45, '45 Días', '45D'), (100, '100 Días', '100D'),
         (120, '120 Días', '120D'), (180, '180 Días', '180D'), (364, '364 Días', '364D')
)
SELECT get_uuid(), :client_id, a.ad_org_id, 'Y', now(), '0', now(), '0',
  t.name, 'N', t.netdays, 0, 'Y', 'N', t.value, 'N',
  0
FROM target t
CROSS JOIN anchor a
WHERE NOT EXISTS (
    SELECT 1 FROM c_paymentterm s
    WHERE s.ad_client_id = :client_id
      AND s.netdays = t.netdays
      AND s.isduefixed = 'N'
      AND COALESCE(s.fixmonthoffset, 0) = 0
      AND NOT EXISTS (
        SELECT 1 FROM c_paymenttermline l WHERE l.c_paymentterm_id = s.c_paymentterm_id
      )
  )
  AND NOT EXISTS (
    SELECT 1 FROM c_paymentterm n
    WHERE n.ad_client_id = :client_id
      AND n.ad_org_id = a.ad_org_id
      AND n.name = t.name
  );

-- @report
-- Terms NOT seeded because the anchor org already holds a term with that name but a different
-- shape (lines, fixed due day or month offset). Empty on a normal tenant.
WITH anchor AS (
  SELECT pt.ad_org_id
  FROM c_paymentterm pt
  WHERE pt.ad_client_id = :client_id
    AND pt.value = 'I'
    AND pt.netdays = 0
    AND EXISTS (
      SELECT 1 FROM fin_paymentmethod pm
      WHERE pm.ad_client_id = :client_id AND pm.name = 'Transferencia bancaria'
    )
  ORDER BY (pt.isactive = 'Y') DESC, pt.created, pt.c_paymentterm_id
  LIMIT 1
),
target (netdays, name) AS (
  VALUES (1, '1 Día'), (7, '7 Días'), (15, '15 Días'), (20, '20 Días'), (45, '45 Días'),
         (100, '100 Días'), (120, '120 Días'), (180, '180 Días'), (364, '364 Días')
)
SELECT t.name AS skipped_name, n.netdays AS existing_netdays, n.c_paymentterm_id AS existing_id
FROM target t
CROSS JOIN anchor a
JOIN c_paymentterm n
  ON n.ad_client_id = :client_id AND n.ad_org_id = a.ad_org_id AND n.name = t.name
WHERE NOT EXISTS (
  SELECT 1 FROM c_paymentterm s
  WHERE s.ad_client_id = :client_id
    AND s.netdays = t.netdays
    AND s.isduefixed = 'N'
    AND COALESCE(s.fixmonthoffset, 0) = 0
    AND NOT EXISTS (
      SELECT 1 FROM c_paymenttermline l WHERE l.c_paymentterm_id = s.c_paymentterm_id
    )
)
ORDER BY t.netdays;
