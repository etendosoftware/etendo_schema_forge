-- @id: R36-costing-background-schedule
-- @gap: P1
-- @risk: low
-- @type: sql
-- @description: ETP-5245 — a GO-onboarded tenant gets NO scheduled "Costing Background process"
--   (AD_PROCESS_REQUEST, CostingBackground), so product costs are never calculated automatically
--   and every M_TRANSACTION stays iscostcalculated='N' until somebody launches the process by
--   hand; creates the missing SCH request (every 5 minutes), owned by the tenant's own
--   client/org/admin

-- Root cause (why this is missing in the first place)
-- --------------------------------------------------------------------------------------------
-- AD_PROCESS_REQUEST is listed in OnboardingDatasetDefinition.EXCLUDED_TABLES
-- (com.etendoerp.go, OnboardingDatasetDefinition.java:37 — inside the EXCLUDED_TABLES literal that
-- spans lines 28-47, NOT the INCLUDED_TABLES one that starts at line 49). shouldIncludeTable()
-- requires INCLUDED_TABLES.contains(table) && !EXCLUDED_TABLES.contains(table), so ZERO of the 24
-- rows in referencedata/sampledata/GOClient/AD_PROCESS_REQUEST.xml ever reach a new tenant.
--
-- The exclusion is CORRECT and must stay. Two independent reasons:
--   1. 23 of those 24 rows are STATUS='COM' — completed one-shot executions (Process Order,
--      Process Inventory Count, Create Periods, Set as Ready, ...). They are GOClient's execution
--      HISTORY, not scheduled jobs. Importing them would copy another tenant's audit trail.
--   2. Every row carries AD_USER_ID pointing at GOClient's own GOAdmin
--      (47EAF009B7BB42BBB663C7BA1792D958) and an OB_CONTEXT JSON blob naming GOClient's client,
--      org, role and user. OnboardingDatasetNormalizer remaps AD_ORG_ID only
--      (OnboardingDatasetNormalizer.java:209) — it never touches AD_USER_ID, AD_ROLE_ID or
--      OB_CONTEXT, and AD_USER/AD_ROLE are themselves excluded tables. Importing the rows would
--      therefore plant dangling cross-tenant references in every new tenant.
--
-- So the answer is NOT "un-exclude the table". Exactly ONE of the 24 rows is a real scheduled job
-- (STATUS='SCH', AD_PROCESS_ID=3F2B4AAC707B4CE7B98D2005CF7310B5 = CostingBackground), and the
-- right way to deliver it is the way the only other per-tenant schedule is already delivered:
-- built programmatically, from the tenant's OWN client/org/user/role. That is what
-- OnboardingBankConnectionSyncService does for the PSD2 "Get Bank Statements" job, and it is why
-- "Get Bank Statements" (SCH) is one of only two AD_PROCESS_REQUEST rows a new tenant has. (The
-- other, "Set as Ready" with STATUS='COM', is not provisioned at all: it is the residue of
-- OnboardingMarkOrgReadyService running the AD_Org_Ready process.)
--
-- SCOPE OF THIS FIX — corrective only, on purpose (read this before "completing" the pair)
-- --------------------------------------------------------------------------------------------
-- This file ships WITHOUT its preventive twin, and that is a deliberate decision, not an
-- oversight. The onboarding half of gap P1 is being closed by a SEPARATE PR, authored by someone
-- else, outside ETP-5245. A preventive service was drafted here and then removed once that
-- overlap surfaced, precisely so the two PRs do not both wire a step into
-- EtendoGoJwtServlet#ensureOnboardingDataset and collide. ETP-5245 therefore touches
-- com.etendoerp.go not at all.
--
-- Consequences, so nobody has to reconstruct this later:
--   * Until that other PR merges, every NEWLY onboarded tenant is still born without the schedule
--     and genuinely needs this fix. That is normal and handled — see the CUT section below.
--   * After it merges, a newborn tenant already has the SCH row, this fix's @check returns 0 rows
--     for it, and the runner records a clean SKIPPED_NOT_NEEDED. No change is needed here on that
--     day: the @check self-heals. Do NOT retire this fix — legacy tenants still need it.
--   * Whoever writes that preventive service: the shape to copy is
--     OnboardingBankConnectionSyncService (build the ProcessRequest from the tenant's OWN
--     client/org/user/role; create the row inside the onboarding transaction and activate it in
--     Quartz AFTER the commit). Two traps this fix already hit, documented in
--     docs/etendo-ad/tenant-remediation-knowledge.md: (a) judge "already provisioned" on
--     status='SCH', never on the mere existence of a row for the process — a COM row is a
--     completed manual run and treating it as a schedule leaves the tenant unscheduled forever;
--     (b) do not reach for the dataset, for the two reasons above.
--
-- Why it matters (ETP-5245)
-- --------------------------------------------------------------------------------------------
-- org.openbravo.costing.CostingBackground is strictly CLIENT-scoped: it lists the organizations to
-- process with "ad_isorgincluded(o.id, :orgId, :clientId) <> -1", binding
-- bundle.getContext().getClient() (CostingBackground.java:90-95). No system-level or other-tenant
-- run ever covers this client. Without a per-tenant scheduled request, nothing calculates costs.
--
-- The Product window now blocks on a missing cost and warns that "sin costo no se podrán calcular
-- los costes ni contabilizar los movimientos" (ETP-5245). On a GO-onboarded tenant the second half
-- was true even AFTER defining the cost, because the calculation job was never scheduled. Live
-- evidence on the shared dev DB: "E2E User 1 5b33eb60" has 20 M_TRANSACTION rows, 20 of them with
-- iscostcalculated='N', while carrying a perfectly valid, validated Standard-Algorithm
-- M_COSTING_RULE (M_COSTING_RULE *is* imported — it is in INCLUDED_TABLES). The rule is there, the
-- engine that consumes it is not.
--
-- Fleet state at authoring time (2026-09-10, shared dev DB):
--   GOClient               SCH present  -> not needed (dataset source client)
--   F&B International Grp  SCH present  -> not needed (core sampledata, ad_org_id='0', user '100')
--   QA Testing             only a COM   -> NEEDED
--   E2E User 1 5b33eb60    none         -> NEEDED
--   E2E User 2 8bc91bf1    none         -> NEEDED
--   Empresa madera         none         -> NEEDED (onboarded 2026-09-10)
--
-- Row shape
-- --------------------------------------------------------------------------------------------
-- Modelled on the two rows that demonstrably work on this DB: the onboarding-built PSD2 bank-sync
-- request, and F&B's core-sampledata costing request.
--   * ad_org_id = '0' (the tenant's client-level/root org). DELIBERATE. CostingBackground
--     processes only the orgs INCLUDED IN the request's org, and a legacy tenant can be multi-org
--     (QA Testing has validated costing rules on both "USA" and "Spain"), so picking one business
--     org would silently leave the siblings uncosted. '0' covers every org of the tenant and is
--     what F&B's own working row uses. NOTE for whoever reviews this against the separate
--     onboarding PR: it is fine, and expected, for that PR to use the new tenant's single business
--     org instead — a newborn GO tenant has exactly one, so the two choices are equivalent there,
--     and this fix's @check keys on the CLIENT, not the org, so either shape satisfies it.
--   * CADENCE — every 5 minutes: timing_option='S' (Schedule), frequency='2' (02 - Every n
--     minutes), minutely_interval=5, minutely_repetitions=NULL, status='SCH', isrolesecurity='Y',
--     isgroup='N', channel='Process Scheduler'. This is the product owner's explicit choice
--     (configured by hand in Classic's Process Request window on 2026-09-10), and it is NOT the
--     cadence of the bank-sync sibling — costing is a near-real-time queue drain, not a nightly
--     batch, so a document posted at 10:00 must not wait until the small hours to become costable.
--     An earlier draft of this fix used frequency='4' (daily) by analogy with the bank sync; that
--     was wrong and was corrected. Verified against the two rows that demonstrably run this shape
--     on the shared dev DB — F&B International Group's row and the product owner's own new GOClient
--     row — both `S | 2 | 5 | NULL | SCH`, both with a live `next_fire_time` five minutes out.
--   * daily_interval=1 / daily_option='N' are KEPT even though they are inert at frequency='2'.
--     Not an oversight and not leftovers from the daily draft: BOTH reference rows carry exactly
--     these values, because Classic's Process Request window writes the daily block's defaults
--     whatever the selected frequency. The scheduler switches on `frequency` and reads only the
--     matching interval column, so they are ignored at runtime. Reproducing the working row
--     byte-for-byte is worth more than tidying fields the UI itself populates — a row that differs
--     from every hand-made one is harder to diagnose than one with two inert columns.
--   * NO per-tenant start_time stagger. An earlier draft hashed :client_id to spread the first
--     fire across a 01:00-03:00 window; that made sense for a once-daily job and is meaningless at
--     a 5-minute cadence, where every tenant's job is running more or less continuously anyway.
--     Staggering would only shift each tenant's first fire by a few minutes and then converge on
--     the same steady state, at the cost of a line of unexplainable arithmetic. start_date/
--     start_time are simply "from now on", which is what Classic writes.
--   * ob_context is the serialized org.openbravo.scheduling.ProcessContext the scheduler rebuilds
--     its security variables from when the job fires. It MUST name the tenant's own user, role,
--     client and org — that is the whole point of this fix and the user-visible requirement.
--   * ad_process_id is resolved by search key ('CostingBackground'), never hardcoded, even though
--     core pins it as CostingBackground.AD_PROCESS_ID.
--
-- Placeholder syntax — two rules, both violated by this fix's first draft
-- --------------------------------------------------------------------------------------------
-- 1. QUOTE the token: write '@uuid_KEY@', not @uuid_KEY@. inlineFreshUuids substitutes a BARE
--    32-hex id, so the quoting must already be in the file. Unquoted, the id becomes an
--    identifier and the whole @apply fails to parse ("syntax error at or near ,").
-- 2. The KEY must be ALPHANUMERIC ONLY. UUID_TOKEN is /@uuid_([0-9A-Za-z]+)@/g, so an underscore
--    (@uuid_COSTING_REQUEST@) silently fails to match and the placeholder TEXT is inserted
--    verbatim as the primary key. This produces no error on the first tenant -- it writes a row
--    whose PK is the literal string -- and then a duplicate-PK failure on every tenant after it.
--
-- Neither is catchable with --dry-run (which only runs @check) nor by hand-substituting the token
-- in psql. Validate an @apply by running the real runner.
--
-- Operational note — the row does NOT fire until the scheduler re-initializes
-- --------------------------------------------------------------------------------------------
-- This fix INSERTs the request directly, so nothing registers it with Quartz: the created rows
-- have next_fire_time NULL until Etendo's scheduler initializes again (typically a Tomcat
-- restart), whereas rows created through Classic's window are registered immediately. The status
-- 'SCH' is what makes the scheduler pick them up on that next initialization, so no further
-- action is required -- but do not expect costs to start calculating the same minute the fix
-- runs. (The separate onboarding PR's service has the same constraint, which is why the bank-sync
-- sibling calls OBScheduler.schedule(...) explicitly AFTER its commit.)
--
-- Admin resolution (whose credentials the job runs as)
-- --------------------------------------------------------------------------------------------
-- The request carries isrolesecurity='Y', so the role it names bounds which organizations the job
-- can actually touch. Both tiers therefore require the role to be a Client-level (' CO') ACTIVE
-- role of this client holding an active AD_ROLE_ORGACCESS grant on the client root '0' — the same
-- shape as the org chosen for the row itself. Two tiers, first match wins:
--   1. The tenant's real admin — an ACTIVE user of this client whose DEFAULT role qualifies. This
--      is R26's proven identification pattern and it resolves the GO-onboarded tenants to exactly
--      the same user the bank-sync row already uses (verified: 8C7CE2F5... for E2E User 1,
--      FE147687... for E2E User 2).
--   2. Fallback — the System 'Admin' user '100' paired with the qualifying role that grants access
--      to the MOST organizations (ties broken by creation order, so the choice is deterministic).
--      Needed for legacy/demo tenants whose named admin users are all deactivated (QA Testing:
--      every ' CO'-role holder has isactive='N'). The widest-access ordering matters: QA Testing
--      has four ' CO' roles with a '0' grant, and only "QA Testing Admin" reaches all of USA, Main
--      and Spain — picking the oldest instead would have named "QA Testing USA Admin". It also
--      reproduces exactly the shape of F&B's own working row (ad_user_id='100' + the client-wide
--      "F&B International Group Admin", which likewise has the most grants), so this is a proven
--      combination, not an invention.
-- A tenant with no qualifying role yields no row from either tier; @check then returns 0 and the
-- fix records SKIPPED_NOT_NEEDED rather than inserting a request with a security context the
-- scheduler could not run.
--
-- ONBOARDING_PROVISIONED_THROUGH (OnboardingBaselineService) — NOT bumped, and MUST NOT be
-- --------------------------------------------------------------------------------------------
-- The constant stays at 2026-09-02T12:00:00Z. This fix's own timestamp (2026-09-10T12:00:00Z) is
-- ABOVE it, which means a freshly onboarded tenant's BASELINE watermark does NOT cover this fix
-- and the runner still evaluates it for that tenant. That is exactly what is wanted here.
--
-- Note this is the OPPOSITE reasoning from R34-fin-account-cleared-payment-accounts, which also
-- skipped its bump. R34 could skip it because its preventive front shipped in the SAME PR, so a
-- newborn tenant was already correct. Here there is no preventive front in this PR at all (see
-- "SCOPE OF THIS FIX" above): until the separate onboarding PR merges, a tenant onboarded today is
-- still born WITHOUT the schedule and genuinely needs this fix. Bumping the CUT to this fix's
-- timestamp would push it under every new tenant's watermark and silently skip it for exactly the
-- tenants that need it — the "CUT bump without its preventive front" failure mode the constant's
-- own contract warns about.
--
-- No bump will be needed on the day that other PR merges either: from then on a newborn tenant
-- already has the SCH row, so the @check returns 0 and the runner records SKIPPED_NOT_NEEDED on
-- its own. The correct action then is to do nothing to this file (it is immutable anyway) and to
-- leave the constant alone. As a practical matter, bumping it is also impossible from this PR:
-- the constant lives in com.etendoerp.go, which ETP-5245 deliberately does not touch.
--
-- Idempotency
-- --------------------------------------------------------------------------------------------
-- @check and @apply gate on the same predicate: no ACTIVE, SCH-status request for the
-- CostingBackground process exists for this client. A re-run after success matches 0 rows ->
-- SKIPPED_NOT_NEEDED. The @apply INSERT carries the same NOT EXISTS guard, so partial or
-- concurrent state is safe. A pre-existing COM row (QA Testing, GOClient) is deliberately NOT
-- counted as a schedule — a completed one-shot run is history, not a recurring job — and is never
-- modified or deleted. Every statement is scoped to :client_id.

-- @check
-- Returns >=1 row when the tenant has no active scheduled CostingBackground request AND a security
-- context for one can be resolved. 0 rows => SKIPPED_NOT_NEEDED, @apply never runs.
SELECT 1
FROM ad_client c
WHERE c.ad_client_id = :client_id
  AND c.ad_client_id <> '0'
  AND EXISTS (
    SELECT 1 FROM ad_process p
    WHERE p.value = 'CostingBackground' AND p.isactive = 'Y')
  AND EXISTS (
    SELECT 1 FROM ad_role r
    JOIN ad_role_orgaccess oa ON oa.ad_role_id = r.ad_role_id
                             AND oa.ad_org_id = '0'
                             AND oa.isactive = 'Y'
    WHERE r.ad_client_id = c.ad_client_id AND r.isactive = 'Y' AND r.userlevel = ' CO')
  AND NOT EXISTS (
    SELECT 1
    FROM ad_process_request pr
    JOIN ad_process p2 ON p2.ad_process_id = pr.ad_process_id
    WHERE pr.ad_client_id = c.ad_client_id
      AND p2.value = 'CostingBackground'
      AND pr.isactive = 'Y'
      AND pr.status = 'SCH')
LIMIT 1;

-- @apply
-- Same predicate as @check (textually parallel so the two can be eyeballed against each other),
-- which is also the defensive second idempotency layer.
INSERT INTO ad_process_request (
  ad_process_request_id, ad_client_id, ad_org_id, isactive,
  created, createdby, updated, updatedby,
  ad_process_id, description, ad_user_id, isrolesecurity, ob_context,
  status, channel, timing_option, start_date, start_time,
  frequency, minutely_interval, daily_interval, daily_option, finishes, isgroup)
SELECT
  -- TWO placeholder rules, both learned the hard way here (see the header's "Placeholder" note):
  --   1. QUOTE it. inlineFreshUuids substitutes a BARE 32-hex id, so the literal quoting must
  --      already be in this file; unquoted it becomes an identifier and @apply fails to parse.
  --   2. The KEY must be ALPHANUMERIC ONLY -- UUID_TOKEN is /@uuid_([0-9A-Za-z]+)@/, so an
  --      underscore in the key silently prevents the match and the placeholder text is inserted
  --      VERBATIM as the primary key. No error, just a corrupt row.
  '@uuid_COSTINGREQUEST@',
  c.ad_client_id,
  '0',
  'Y',
  now(), '0', now(), '0',
  p.ad_process_id,
  'Automatic cost calculation (Etendo GO remediation, ETP-5245)',
  ctx.user_id,
  'Y',
  '{"org.openbravo.scheduling.ProcessContext":{"user":"' || ctx.user_id
    || '","role":"' || ctx.role_id
    || '","language":"' || ctx.language
    || '","theme":"ltr\/org.openbravo.userinterface.skin.250to300Comp\/250to300Comp'
    || '","client":"' || c.ad_client_id
    || '","organization":"0","warehouse":"","command":"DEFAULT","userClient":"",'
    || '"userOrganization":"","dbSessionID":"","javaDateFormat":"","jsDateFormat":"",'
    || '"sqlDateFormat":"","accessLevel":"","roleSecurity":true}}',
  'SCH',
  'Process Scheduler',
  'S',                                -- timing_option: Schedule
  -- start_date / start_time are the trigger's start boundary, not a run slot. Both reference rows
  -- were written by Classic's Process Request window, which stores the date truncated to midnight
  -- and the time-of-day at which the row was created; reproduced here so the first fire is
  -- "from now on". No per-tenant stagger -- see the cadence note in the header.
  date_trunc('day', now()),
  date_trunc('second', now()),        -- whole seconds, as Classic stores them
  '2',                                -- frequency: 02 - Every n minutes
  5,                                  -- minutely_interval: every 5 minutes
  1,                                  -- daily_interval  ) inert at frequency '2'; kept because
  'N',                                -- daily_option    ) both reference rows carry them
  'N',
  'N'
FROM ad_client c
CROSS JOIN LATERAL (
  SELECT p2.ad_process_id
  FROM ad_process p2
  WHERE p2.value = 'CostingBackground' AND p2.isactive = 'Y'
  LIMIT 1) p
CROSS JOIN LATERAL (
  -- Tier 1: the tenant's real admin (active user whose DEFAULT role qualifies).
  -- Tier 2: System 'Admin' ('100') + the qualifying role with the widest org access.
  -- "Qualifying" = active ' CO' role of THIS client with an active '0' org-access grant.
  SELECT t.user_id, t.role_id, t.language
  FROM (
    SELECT u.ad_user_id AS user_id,
           u.default_ad_role_id AS role_id,
           COALESCE(u.default_ad_language, c.ad_language, 'en_US') AS language,
           1 AS tier,
           0 AS org_reach,
           u.created AS ord
    FROM ad_user u
    JOIN ad_user_roles ur ON ur.ad_user_id = u.ad_user_id
                         AND ur.ad_role_id = u.default_ad_role_id
                         AND ur.isactive = 'Y'
    JOIN ad_role r ON r.ad_role_id = u.default_ad_role_id
                  AND r.ad_client_id = c.ad_client_id
                  AND r.isactive = 'Y'
                  AND r.userlevel = ' CO'
    WHERE u.ad_client_id = c.ad_client_id
      AND u.isactive = 'Y'
      AND EXISTS (SELECT 1 FROM ad_role_orgaccess oa
                  WHERE oa.ad_role_id = r.ad_role_id
                    AND oa.ad_org_id = '0' AND oa.isactive = 'Y')
    UNION ALL
    SELECT '100',
           r.ad_role_id,
           COALESCE(c.ad_language, 'en_US'),
           2,
           -(SELECT count(*) FROM ad_role_orgaccess oa2
             WHERE oa2.ad_role_id = r.ad_role_id AND oa2.isactive = 'Y')::int,
           r.created
    FROM ad_role r
    WHERE r.ad_client_id = c.ad_client_id
      AND r.isactive = 'Y'
      AND r.userlevel = ' CO'
      AND EXISTS (SELECT 1 FROM ad_role_orgaccess oa
                  WHERE oa.ad_role_id = r.ad_role_id
                    AND oa.ad_org_id = '0' AND oa.isactive = 'Y')
  ) t
  ORDER BY t.tier, t.org_reach, t.ord
  LIMIT 1) ctx
WHERE c.ad_client_id = :client_id
  AND c.ad_client_id <> '0'
  AND NOT EXISTS (
    SELECT 1
    FROM ad_process_request pr
    JOIN ad_process p3 ON p3.ad_process_id = pr.ad_process_id
    WHERE pr.ad_client_id = c.ad_client_id
      AND p3.value = 'CostingBackground'
      AND pr.isactive = 'Y'
      AND pr.status = 'SCH');
