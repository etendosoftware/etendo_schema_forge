-- @id: R51-etgo-survey-config-seed
-- @gap: Q1
-- @risk: low
-- @type: sql
-- @description: Seed visible defaults for the "Survey Configuration" window (ETGO_Survey_Config, ETGO_Survey_Type, ETGO_Survey_Canned_Resp), which today starts completely empty for every install -- all NPS/CSAT survey tuning is governed by hardcoded defaults in schema_forge's survey-config.js/surveys.js, invisible to the admin. Run once against the System pseudo-tenant (--client 0); never swept per-tenant

-- Context (ETP-5870)
-- --------------------------------------------------------------------------------------------
-- The "Survey Configuration" backoffice window is backed by three tables: one global-settings
-- singleton row (ETGO_Survey_Config), one header row per survey key (ETGO_Survey_Type -- adding
-- a new survey is a new row, not a new column), and canned CSAT responses as a child of the
-- header row (ETGO_Survey_Canned_Resp), each with its own score range. None of the three has ever
-- had a row seeded for any tenant -- an admin can only discover the actual tuning in effect (or
-- that a knob exists at all) by reading schema_forge's source. csat_onboarding is the worst case:
-- it has NO row at all in the original reference-list set, so there was not even a stub to edit.
--
-- Scope: System pseudo-tenant singleton, NOT per-client
-- ---------------------------------------------------------------------------
-- modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/SurveyConfigServlet.java's three read
-- queries (GLOBAL_QUERY, SURVEY_TYPES_QUERY, CANNED_QUERY) carry NO ad_client_id filter at all --
-- confirmed by reading the servlet before writing this fix, per the framework's mandatory scoping
-- check. Survey tuning is a single install-wide singleton (one physical Etendo GO install = one
-- SaaS tenant), unlike the chart-of-accounts/org-tree class of gap, which is genuinely
-- per-AD_Client. So, exactly like gaps O1 (AEATSII_CAUSE_EXEMPTION) and U1 (the duplicate "IVA
-- Normal" tax category), every statement below filters ad_client_id = :client_id -- satisfying the
-- framework's literal, non-negotiable tenant-scope rule (sql/README.md rule 1) exactly like
-- R40/R50 do -- and this fix is run EXPLICITLY, once, against the System pseudo-tenant:
--
--   node cli/src/data-fixes/run.js --fix R51-etgo-survey-config-seed --client 0
--
-- The runner's tenant-universe query excludes ad_client_id='0', so '0' is never ITERATED as a
-- subject tenant -- but that alone does NOT stop a normal full sweep (`make data-fixes`, no
-- `--fix`/`--client`) from evaluating THIS fix against every REAL tenant's own ad_client_id, same
-- as any other chain fix. Scoping every statement to :client_id (so @check/@apply only ever look
-- at the row the CALLER's :client_id owns) is necessary but NOT sufficient on its own: a real
-- tenant genuinely has no row of its own yet, so a client-scoped-only @check still legitimately
-- reads "needed" for it, and @apply would seed the whole singleton again under that tenant's own
-- ad_client_id -- served GLOBALLY to every tenant in the install, since SurveyConfigServlet has no
-- ad_client_id filter at all (see "Fixed during QA" below, bug 3, for the literal `:client_id =
-- '0'` guard in @check that closes this and makes the fix structurally a no-op for any client
-- other than the System pseudo-tenant).
--
-- Exact values seeded (identical to schema_forge's survey-config.js / surveys.js defaults, and to
-- the lockstep preventive twin, OnboardingSurveyConfigService#seedSurveyConfig)
-- ---------------------------------------------------------------------------
-- ETGO_Survey_Config: GLOBAL_COOLDOWN_DAYS=30, DISMISSED_COOLDOWN_DAYS=21, MAX_PER_MONTH=2.
-- ETGO_Survey_Type (one row per SURVEY_KEY):
--   nps              -- MIN_ACCOUNT_AGE_DAYS=60, INACTIVITY_GUARD_DAYS=14, RESPONSE_COOLDOWN_DAYS=90
--   csat_onboarding  -- MIN_ACCOUNT_AGE_DAYS=1 (its OWN special-cased default -- NOT 60; the column
--                       is reused with a different meaning, "days since onboarding completed", see
--                       getSurveyTypeConfig() in survey-config.js), everything else NULL
--   csat_invoicing   -- MIN_DOCUMENTS=5, DOCUMENT_GAP=30, RESPONSE_COOLDOWN_DAYS=90
--   csat_order       -- MIN_DOCUMENTS=5, DOCUMENT_GAP=30, RESPONSE_COOLDOWN_DAYS=90
-- All four ISACTIVE='Y'.
--
-- Canned responses (ETGO_Survey_Canned_Resp) -- only for the 3 survey keys that have a hardcoded
-- fallback list today (nps, csat_invoicing, csat_order); csat_onboarding has no fallback, so
-- nothing is seeded for it:
--   nps             -- 7 chips x 2 languages = 14 rows, no icon, MIN_SCORE=0/MAX_SCORE=10 except
--                      surveyChipAI (8/10)
--   csat_invoicing  -- 6 chips x 2 languages = 12 rows, with icon
--   csat_order      -- 6 chips x 2 languages = 12 rows, with icon
--   (38 canned rows total)
-- Text is the EXACT current en_US/es_ES locale strings (tools/app-shell/src/locales/*.json), not
-- the locale keys.
--
-- Correctness trap: CSAT rows force MIN_SCORE=1, MAX_SCORE=5 explicitly
-- ---------------------------------------------------------------------------
-- The hardcoded CSAT fallback list (csat_invoicing/csat_order) has NO score band at all --
-- resolveCannedOptions() in survey-config.js treats "no band" as "always matches". The
-- ETGO_SURVEY_CANNED_RESP column DEFAULTS to MIN_SCORE=1/MAX_SCORE=3, which would silently
-- RESTRICT these chips to only 1-3 star responses the moment a backend row exists -- breaking the
-- "always shown" behavior the fallback has today. Every csat_invoicing/csat_order row below sets
-- MIN_SCORE=1, MAX_SCORE=5 (the full CSAT range) explicitly, never relying on the column default.
-- nps uses its real bands (0-10, and 8-10 for surveyChipAI) since those bands are genuinely part
-- of its existing hardcoded behavior.
--
-- Idempotency
-- -----------
-- Config: guarded by "no row exists for :client_id" (the table has no uniqueness constraint and
-- the Config tab allows creating extra rows -- see SurveyConfigServlet's own comment on
-- GLOBAL_QUERY). Survey type: each of the 4 INSERTs is independently guarded by NOT EXISTS on
-- (ad_client_id, survey_key). Canned response: each of the 38 INSERTs is independently guarded by
-- NOT EXISTS on (ad_client_id, etgo_survey_type_id, language, line_no) -- the survey type id is
-- resolved via a join on (ad_client_id, survey_key) in the SAME statement (not captured across
-- statements), so a canned INSERT is a no-op both when its own row already exists AND when its
-- parent survey type row does not exist yet for some reason (the join simply finds nothing to
-- select). Running this fix twice, or after the preventive front has already seeded some or all
-- of the install, inserts nothing more.
--
-- Preventive twin
-- ---------------
-- OnboardingSurveyConfigService#seedSurveyConfig, wired as the last business step in
-- OnboardingProvisioningChain#ensureOnboardingDataset (ETP-5870), right before the baseline stamp.
-- Same values, same guard shape, same System pseudo-tenant target (its own SQL always hardcodes
-- the literal '0' for ad_client_id/ad_org_id, independent of whichever real clientId triggered
-- onboarding -- see that class's javadoc for the full derivation).
--
-- No CUT bump
-- -----------
-- ONBOARDING_PROVISIONED_THROUGH is deliberately NOT bumped for this gap -- same reasoning as
-- O1/U1. The watermark mechanism is keyed per REAL tenant (remediated_client_id) and only gates
-- the per-tenant corrective sweep; this fix's data lives at the System pseudo-tenant, which that
-- sweep never reaches (the runner's tenant-universe query excludes ad_client_id='0') and which
-- this fix itself is only ever run against manually (--fix ... --client 0, which ignores the
-- baseline cutoff entirely). Bumping the CUT here would do nothing for THIS gap while risking
-- silently skipping every OTHER per-tenant corrective fix dated between the current cutoff
-- (2026-09-02T12:00:00Z) and this one for brand-new tenants -- several of which (R41..R50) are
-- deliberately not yet closed on their own preventive front.
--
-- Fixed during QA (tester-functional + Sentinel, same PR)
-- ---------------------------------------------------------------------------
-- Three bugs found before this shipped to REVIEW, all fixed in this revision:
--  1. Every @uuid_<KEY>@ placeholder originally used an underscore inside KEY (e.g.
--     @uuid_NPS_SPEED_EN@). parse-fix.js's UUID_TOKEN regex is `/@uuid_([0-9A-Za-z]+)@/g` --
--     alnum only, no underscore -- so those 38 canned-response placeholders were left untouched by
--     inlineFreshUuids() and would have inserted the LITERAL placeholder string as a primary key.
--     Fixed by renaming every placeholder to an alnum-only key (e.g. NPSSPEEDEN) rather than
--     widening the shared regex, which would be a framework-wide change affecting every existing
--     fix.
--  2. Neither @check nor any @apply statement filtered ad_client_id = :client_id anywhere (it only
--     appeared as a literal being INSERTed) -- unlike R40/R50, which filter every statement by it.
--     Consequence: during a normal full sweep, @check would read as "needed" for ANY real tenant
--     (the global existence check does not care which client is asking), and @apply would then
--     insert the whole singleton under that real tenant's own ad_client_id instead of '0' --
--     contradicting "never swept per-tenant" and the framework's own non-negotiable rule. Fixed by
--     scoping every statement to ad_client_id = :client_id, exactly mirroring R40/R50.
--  3. (Sentinel, live-reproduced with a rolled-back transaction) Bug 2's fix was NECESSARY but not
--     SUFFICIENT: once @check/@apply are scoped to the CALLER's :client_id, a normal full sweep
--     still evaluates this fix once per REAL tenant, and the existence logic still legitimately
--     reports "needed" for each one (a real tenant genuinely has no row of its own) -- so @apply
--     would reseed all 43 rows under every real tenant's own ad_client_id during the very first
--     sweep after this merges. O1/R40 and U1/R50 share this same shape but are lower-risk because
--     their target tables ARE read through Etendo's standard DAL/selector client-visibility
--     filter -- a stray row under a real tenant is at most an extra option visible only to that
--     tenant. R51 is categorically worse: SurveyConfigServlet's three read queries have NO
--     ad_client_id filter at all, so a stray duplicate is served GLOBALLY to every tenant sharing
--     the install (confirmed live: NPS chips 7->14 per language, CSAT chips 6->12, 2 config rows,
--     2 survey-type rows per key). `@optIn: true` was considered and rejected: `optInChainGate`
--     requires every earlier chain fix to already be PROCESSED in the ledger for the TARGET
--     client, but client '0' structurally never accumulates ledger rows (excluded from
--     `resolveTenants`/`tenantsWithoutLedger`), so marking this fix opt-in would make the one
--     sanctioned invocation (`--fix R51-etgo-survey-config-seed --client 0`) itself fail as
--     `BLOCKED_CHAIN_BEHIND`. Fixed instead by a LITERAL client guard at the very top of @check
--     (`WHERE :client_id = '0' AND (...)`) -- see the comment directly above @check. The
--     preventive Java twin, OnboardingSurveyConfigService, does NOT share this risk: every column
--     value it writes (including ad_client_id/ad_org_id) is a hardcoded Java literal '0', never
--     parameterized by whichever real clientId triggered that onboarding call, so there is no
--     path by which it could seed rows under a real tenant's id. Confirmed by re-reading the
--     service's SQL constants. **Follow-up flagged, not blocking this ticket:** O1/R40 and U1/R50
--     share the same "no literal client guard in @check" shape and would benefit from the same
--     hardening if their target tables ever stop being read through the standard DAL/selector
--     filter; tracked as a separate concern, see docs/etendo-ad/onboarding-gaps.md gap Q1.

-- @check
-- LITERAL CLIENT GUARD (QA finding, Sentinel): the WHERE below is gated on `:client_id = '0'`
-- FIRST, before any of the existence logic. Without this, @check/@apply being correctly scoped to
-- `ad_client_id = :client_id` (the Bug-2 fix above) is not enough on its own -- during a normal
-- full sweep (`make data-fixes`, no `--fix`/`--client`), the runner evaluates this fix for EVERY
-- real tenant, and the existence checks below would legitimately read "needed" for each one (a
-- real tenant obviously has no row of its own yet), so @apply would seed the whole singleton AGAIN
-- under every real tenant's own ad_client_id. Unlike O1/R40 and U1/R50 (whose target tables ARE
-- read through Etendo's standard DAL/selector client-visibility filter, so an extra row under a
-- real tenant is at most a harmless, invisible-to-others duplicate), `SurveyConfigServlet`'s three
-- read queries (GLOBAL_QUERY/SURVEY_TYPES_QUERY/CANNED_QUERY) are hand-rolled native SQL with NO
-- ad_client_id filter AT ALL -- so a duplicate row under any real client is served GLOBALLY to
-- every tenant sharing the install (NPS chips 7->14, CSAT chips 6->12, etc.), not merely offered
-- as an extra option to the tenant that happens to own it. `:client_id = '0'` makes this fix
-- structurally a no-op (0 rows, SKIPPED_NOT_NEEDED) for any client other than the System
-- pseudo-tenant, regardless of what the existence checks below would otherwise report -- the ONLY
-- way @apply can ever fire is the explicit, sanctioned invocation
-- `--fix R51-etgo-survey-config-seed --client 0`. `@optIn: true` was considered and rejected: its
-- `optInChainGate` requires every earlier chain fix to already be PROCESSED in the ledger for the
-- TARGET client, but client `'0'` structurally never accumulates ledger rows (excluded from
-- `resolveTenants`/`tenantsWithoutLedger`), so marking this opt-in would make the one sanctioned
-- invocation itself fail as `BLOCKED_CHAIN_BEHIND`.
--
-- Returns >=1 row ONLY when `:client_id = '0'` AND the System pseudo-tenant is missing the config
-- singleton, any of the 4 survey type rows, or any of the 38 canned response rows the 3 seeded
-- survey types should carry.
SELECT 1
WHERE :client_id = '0'
  AND (
    NOT EXISTS (
      SELECT 1 FROM etgo_survey_config WHERE ad_client_id = :client_id
    )
    OR EXISTS (
      SELECT k.survey_key
      FROM (VALUES ('nps'), ('csat_onboarding'), ('csat_invoicing'), ('csat_order')) AS k(survey_key)
      WHERE NOT EXISTS (
        SELECT 1 FROM etgo_survey_type st
        WHERE st.ad_client_id = :client_id AND st.survey_key = k.survey_key
      )
    )
    OR EXISTS (
      SELECT 1
      FROM etgo_survey_type st
      JOIN (VALUES ('nps', 14), ('csat_invoicing', 12), ('csat_order', 12))
        AS expected(survey_key, canned_count) ON expected.survey_key = st.survey_key
      WHERE st.ad_client_id = :client_id
        AND (
          SELECT COUNT(*) FROM etgo_survey_canned_resp cr
          WHERE cr.ad_client_id = :client_id AND cr.etgo_survey_type_id = st.etgo_survey_type_id
        ) < expected.canned_count
    )
  )
LIMIT 1;

-- @apply

-- 1. ETGO_SURVEY_CONFIG -- global tunables singleton.
INSERT INTO etgo_survey_config (
  etgo_survey_config_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, global_cooldown_days, dismissed_cooldown_days, max_per_month
)
SELECT '@uuid_CFG@', :client_id, '0', 'Y', now(), '0', now(), '0', 30, 21, 2
WHERE NOT EXISTS (SELECT 1 FROM etgo_survey_config WHERE ad_client_id = :client_id);

-- 2. ETGO_SURVEY_TYPE -- one row per survey key. Each key's own NULL pattern ("not applicable"
--    tuning fields) is written as a literal, matching OnboardingSurveyConfigService exactly.

INSERT INTO etgo_survey_type (
  etgo_survey_type_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, survey_key, min_account_age_days, inactivity_guard_days,
  min_documents, document_gap, response_cooldown_days
)
SELECT '@uuid_NPS@', :client_id, '0', 'Y', now(), '0', now(), '0', 'nps',
       60, 14, NULL, NULL, 90
WHERE NOT EXISTS (
  SELECT 1 FROM etgo_survey_type WHERE ad_client_id = :client_id AND survey_key = 'nps'
);

INSERT INTO etgo_survey_type (
  etgo_survey_type_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, survey_key, min_account_age_days, inactivity_guard_days,
  min_documents, document_gap, response_cooldown_days
)
SELECT '@uuid_CSATONB@', :client_id, '0', 'Y', now(), '0', now(), '0', 'csat_onboarding',
       1, NULL, NULL, NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM etgo_survey_type WHERE ad_client_id = :client_id AND survey_key = 'csat_onboarding'
);

INSERT INTO etgo_survey_type (
  etgo_survey_type_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, survey_key, min_account_age_days, inactivity_guard_days,
  min_documents, document_gap, response_cooldown_days
)
SELECT '@uuid_CSATINV@', :client_id, '0', 'Y', now(), '0', now(), '0', 'csat_invoicing',
       NULL, NULL, 5, 30, 90
WHERE NOT EXISTS (
  SELECT 1 FROM etgo_survey_type WHERE ad_client_id = :client_id AND survey_key = 'csat_invoicing'
);

INSERT INTO etgo_survey_type (
  etgo_survey_type_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, survey_key, min_account_age_days, inactivity_guard_days,
  min_documents, document_gap, response_cooldown_days
)
SELECT '@uuid_CSATORD@', :client_id, '0', 'Y', now(), '0', now(), '0', 'csat_order',
       NULL, NULL, 5, 30, 90
WHERE NOT EXISTS (
  SELECT 1 FROM etgo_survey_type WHERE ad_client_id = :client_id AND survey_key = 'csat_order'
);

-- 3. ETGO_SURVEY_CANNED_RESP -- 38 rows (14 nps + 12 csat_invoicing + 12 csat_order), each
--    resolving its parent ETGO_SURVEY_TYPE_ID via a join on (ad_client_id, survey_key) in the SAME
--    statement (never a captured id from step 2), so a row is a no-op both when it already exists
--    and when its parent type row is not present for any reason.

-- 3a. nps -- 7 chips x 2 languages, no icon, 0-10 band except surveyChipAI (8-10).
INSERT INTO etgo_survey_canned_resp (
  etgo_survey_canned_resp_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, language, icon, response_text, line_no, etgo_survey_type_id,
  min_score, max_score
)
SELECT '@uuid_NPSSPEEDEN@', :client_id, '0', 'Y', now(), '0', now(), '0',
       'en_US', NULL, 'Speed', 10, st.etgo_survey_type_id, 0, 10
FROM etgo_survey_type st
WHERE st.ad_client_id = :client_id AND st.survey_key = 'nps'
  AND NOT EXISTS (
    SELECT 1 FROM etgo_survey_canned_resp cr
    WHERE cr.ad_client_id = :client_id AND cr.etgo_survey_type_id = st.etgo_survey_type_id
      AND cr.language = 'en_US' AND cr.line_no = 10
  );
INSERT INTO etgo_survey_canned_resp (
  etgo_survey_canned_resp_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, language, icon, response_text, line_no, etgo_survey_type_id,
  min_score, max_score
)
SELECT '@uuid_NPSSPEEDES@', :client_id, '0', 'Y', now(), '0', now(), '0',
       'es_ES', NULL, 'Velocidad', 10, st.etgo_survey_type_id, 0, 10
FROM etgo_survey_type st
WHERE st.ad_client_id = :client_id AND st.survey_key = 'nps'
  AND NOT EXISTS (
    SELECT 1 FROM etgo_survey_canned_resp cr
    WHERE cr.ad_client_id = :client_id AND cr.etgo_survey_type_id = st.etgo_survey_type_id
      AND cr.language = 'es_ES' AND cr.line_no = 10
  );
INSERT INTO etgo_survey_canned_resp (
  etgo_survey_canned_resp_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, language, icon, response_text, line_no, etgo_survey_type_id,
  min_score, max_score
)
SELECT '@uuid_NPSDESIGNEN@', :client_id, '0', 'Y', now(), '0', now(), '0',
       'en_US', NULL, 'Design', 20, st.etgo_survey_type_id, 0, 10
FROM etgo_survey_type st
WHERE st.ad_client_id = :client_id AND st.survey_key = 'nps'
  AND NOT EXISTS (
    SELECT 1 FROM etgo_survey_canned_resp cr
    WHERE cr.ad_client_id = :client_id AND cr.etgo_survey_type_id = st.etgo_survey_type_id
      AND cr.language = 'en_US' AND cr.line_no = 20
  );
INSERT INTO etgo_survey_canned_resp (
  etgo_survey_canned_resp_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, language, icon, response_text, line_no, etgo_survey_type_id,
  min_score, max_score
)
SELECT '@uuid_NPSDESIGNES@', :client_id, '0', 'Y', now(), '0', now(), '0',
       'es_ES', NULL, 'Diseño', 20, st.etgo_survey_type_id, 0, 10
FROM etgo_survey_type st
WHERE st.ad_client_id = :client_id AND st.survey_key = 'nps'
  AND NOT EXISTS (
    SELECT 1 FROM etgo_survey_canned_resp cr
    WHERE cr.ad_client_id = :client_id AND cr.etgo_survey_type_id = st.etgo_survey_type_id
      AND cr.language = 'es_ES' AND cr.line_no = 20
  );
INSERT INTO etgo_survey_canned_resp (
  etgo_survey_canned_resp_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, language, icon, response_text, line_no, etgo_survey_type_id,
  min_score, max_score
)
SELECT '@uuid_NPSFEATURESEN@', :client_id, '0', 'Y', now(), '0', now(), '0',
       'en_US', NULL, 'Features', 30, st.etgo_survey_type_id, 0, 10
FROM etgo_survey_type st
WHERE st.ad_client_id = :client_id AND st.survey_key = 'nps'
  AND NOT EXISTS (
    SELECT 1 FROM etgo_survey_canned_resp cr
    WHERE cr.ad_client_id = :client_id AND cr.etgo_survey_type_id = st.etgo_survey_type_id
      AND cr.language = 'en_US' AND cr.line_no = 30
  );
INSERT INTO etgo_survey_canned_resp (
  etgo_survey_canned_resp_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, language, icon, response_text, line_no, etgo_survey_type_id,
  min_score, max_score
)
SELECT '@uuid_NPSFEATURESES@', :client_id, '0', 'Y', now(), '0', now(), '0',
       'es_ES', NULL, 'Funcionalidad', 30, st.etgo_survey_type_id, 0, 10
FROM etgo_survey_type st
WHERE st.ad_client_id = :client_id AND st.survey_key = 'nps'
  AND NOT EXISTS (
    SELECT 1 FROM etgo_survey_canned_resp cr
    WHERE cr.ad_client_id = :client_id AND cr.etgo_survey_type_id = st.etgo_survey_type_id
      AND cr.language = 'es_ES' AND cr.line_no = 30
  );
INSERT INTO etgo_survey_canned_resp (
  etgo_survey_canned_resp_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, language, icon, response_text, line_no, etgo_survey_type_id,
  min_score, max_score
)
SELECT '@uuid_NPSSUPPORTEN@', :client_id, '0', 'Y', now(), '0', now(), '0',
       'en_US', NULL, 'Support', 40, st.etgo_survey_type_id, 0, 10
FROM etgo_survey_type st
WHERE st.ad_client_id = :client_id AND st.survey_key = 'nps'
  AND NOT EXISTS (
    SELECT 1 FROM etgo_survey_canned_resp cr
    WHERE cr.ad_client_id = :client_id AND cr.etgo_survey_type_id = st.etgo_survey_type_id
      AND cr.language = 'en_US' AND cr.line_no = 40
  );
INSERT INTO etgo_survey_canned_resp (
  etgo_survey_canned_resp_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, language, icon, response_text, line_no, etgo_survey_type_id,
  min_score, max_score
)
SELECT '@uuid_NPSSUPPORTES@', :client_id, '0', 'Y', now(), '0', now(), '0',
       'es_ES', NULL, 'Soporte', 40, st.etgo_survey_type_id, 0, 10
FROM etgo_survey_type st
WHERE st.ad_client_id = :client_id AND st.survey_key = 'nps'
  AND NOT EXISTS (
    SELECT 1 FROM etgo_survey_canned_resp cr
    WHERE cr.ad_client_id = :client_id AND cr.etgo_survey_type_id = st.etgo_survey_type_id
      AND cr.language = 'es_ES' AND cr.line_no = 40
  );
INSERT INTO etgo_survey_canned_resp (
  etgo_survey_canned_resp_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, language, icon, response_text, line_no, etgo_survey_type_id,
  min_score, max_score
)
SELECT '@uuid_NPSPRICEEN@', :client_id, '0', 'Y', now(), '0', now(), '0',
       'en_US', NULL, 'Pricing', 50, st.etgo_survey_type_id, 0, 10
FROM etgo_survey_type st
WHERE st.ad_client_id = :client_id AND st.survey_key = 'nps'
  AND NOT EXISTS (
    SELECT 1 FROM etgo_survey_canned_resp cr
    WHERE cr.ad_client_id = :client_id AND cr.etgo_survey_type_id = st.etgo_survey_type_id
      AND cr.language = 'en_US' AND cr.line_no = 50
  );
INSERT INTO etgo_survey_canned_resp (
  etgo_survey_canned_resp_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, language, icon, response_text, line_no, etgo_survey_type_id,
  min_score, max_score
)
SELECT '@uuid_NPSPRICEES@', :client_id, '0', 'Y', now(), '0', now(), '0',
       'es_ES', NULL, 'Precio', 50, st.etgo_survey_type_id, 0, 10
FROM etgo_survey_type st
WHERE st.ad_client_id = :client_id AND st.survey_key = 'nps'
  AND NOT EXISTS (
    SELECT 1 FROM etgo_survey_canned_resp cr
    WHERE cr.ad_client_id = :client_id AND cr.etgo_survey_type_id = st.etgo_survey_type_id
      AND cr.language = 'es_ES' AND cr.line_no = 50
  );
INSERT INTO etgo_survey_canned_resp (
  etgo_survey_canned_resp_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, language, icon, response_text, line_no, etgo_survey_type_id,
  min_score, max_score
)
SELECT '@uuid_NPSDOCSEN@', :client_id, '0', 'Y', now(), '0', now(), '0',
       'en_US', NULL, 'Documentation', 60, st.etgo_survey_type_id, 0, 10
FROM etgo_survey_type st
WHERE st.ad_client_id = :client_id AND st.survey_key = 'nps'
  AND NOT EXISTS (
    SELECT 1 FROM etgo_survey_canned_resp cr
    WHERE cr.ad_client_id = :client_id AND cr.etgo_survey_type_id = st.etgo_survey_type_id
      AND cr.language = 'en_US' AND cr.line_no = 60
  );
INSERT INTO etgo_survey_canned_resp (
  etgo_survey_canned_resp_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, language, icon, response_text, line_no, etgo_survey_type_id,
  min_score, max_score
)
SELECT '@uuid_NPSDOCSES@', :client_id, '0', 'Y', now(), '0', now(), '0',
       'es_ES', NULL, 'Documentación', 60, st.etgo_survey_type_id, 0, 10
FROM etgo_survey_type st
WHERE st.ad_client_id = :client_id AND st.survey_key = 'nps'
  AND NOT EXISTS (
    SELECT 1 FROM etgo_survey_canned_resp cr
    WHERE cr.ad_client_id = :client_id AND cr.etgo_survey_type_id = st.etgo_survey_type_id
      AND cr.language = 'es_ES' AND cr.line_no = 60
  );
INSERT INTO etgo_survey_canned_resp (
  etgo_survey_canned_resp_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, language, icon, response_text, line_no, etgo_survey_type_id,
  min_score, max_score
)
SELECT '@uuid_NPSAIEN@', :client_id, '0', 'Y', now(), '0', now(), '0',
       'en_US', NULL, 'AI / Copilot', 70, st.etgo_survey_type_id, 8, 10
FROM etgo_survey_type st
WHERE st.ad_client_id = :client_id AND st.survey_key = 'nps'
  AND NOT EXISTS (
    SELECT 1 FROM etgo_survey_canned_resp cr
    WHERE cr.ad_client_id = :client_id AND cr.etgo_survey_type_id = st.etgo_survey_type_id
      AND cr.language = 'en_US' AND cr.line_no = 70
  );
INSERT INTO etgo_survey_canned_resp (
  etgo_survey_canned_resp_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, language, icon, response_text, line_no, etgo_survey_type_id,
  min_score, max_score
)
SELECT '@uuid_NPSAIES@', :client_id, '0', 'Y', now(), '0', now(), '0',
       'es_ES', NULL, 'IA / Copilot', 70, st.etgo_survey_type_id, 8, 10
FROM etgo_survey_type st
WHERE st.ad_client_id = :client_id AND st.survey_key = 'nps'
  AND NOT EXISTS (
    SELECT 1 FROM etgo_survey_canned_resp cr
    WHERE cr.ad_client_id = :client_id AND cr.etgo_survey_type_id = st.etgo_survey_type_id
      AND cr.language = 'es_ES' AND cr.line_no = 70
  );

-- 3b. csat_invoicing -- 6 chips x 2 languages, with icon, MIN_SCORE=1/MAX_SCORE=5 forced (see the
--     correctness-trap note above -- never rely on the column default of 1-3).
INSERT INTO etgo_survey_canned_resp (
  etgo_survey_canned_resp_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, language, icon, response_text, line_no, etgo_survey_type_id,
  min_score, max_score
)
SELECT '@uuid_INV1EN@', :client_id, '0', 'Y', now(), '0', now(), '0',
       'en_US', '🐢', 'Too slow', 10, st.etgo_survey_type_id, 1, 5
FROM etgo_survey_type st
WHERE st.ad_client_id = :client_id AND st.survey_key = 'csat_invoicing'
  AND NOT EXISTS (
    SELECT 1 FROM etgo_survey_canned_resp cr
    WHERE cr.ad_client_id = :client_id AND cr.etgo_survey_type_id = st.etgo_survey_type_id
      AND cr.language = 'en_US' AND cr.line_no = 10
  );
INSERT INTO etgo_survey_canned_resp (
  etgo_survey_canned_resp_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, language, icon, response_text, line_no, etgo_survey_type_id,
  min_score, max_score
)
SELECT '@uuid_INV1ES@', :client_id, '0', 'Y', now(), '0', now(), '0',
       'es_ES', '🐢', 'Es lento', 10, st.etgo_survey_type_id, 1, 5
FROM etgo_survey_type st
WHERE st.ad_client_id = :client_id AND st.survey_key = 'csat_invoicing'
  AND NOT EXISTS (
    SELECT 1 FROM etgo_survey_canned_resp cr
    WHERE cr.ad_client_id = :client_id AND cr.etgo_survey_type_id = st.etgo_survey_type_id
      AND cr.language = 'es_ES' AND cr.line_no = 10
  );
INSERT INTO etgo_survey_canned_resp (
  etgo_survey_canned_resp_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, language, icon, response_text, line_no, etgo_survey_type_id,
  min_score, max_score
)
SELECT '@uuid_INV2EN@', :client_id, '0', 'Y', now(), '0', now(), '0',
       'en_US', '🤔', 'Hard to use', 20, st.etgo_survey_type_id, 1, 5
FROM etgo_survey_type st
WHERE st.ad_client_id = :client_id AND st.survey_key = 'csat_invoicing'
  AND NOT EXISTS (
    SELECT 1 FROM etgo_survey_canned_resp cr
    WHERE cr.ad_client_id = :client_id AND cr.etgo_survey_type_id = st.etgo_survey_type_id
      AND cr.language = 'en_US' AND cr.line_no = 20
  );
INSERT INTO etgo_survey_canned_resp (
  etgo_survey_canned_resp_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, language, icon, response_text, line_no, etgo_survey_type_id,
  min_score, max_score
)
SELECT '@uuid_INV2ES@', :client_id, '0', 'Y', now(), '0', now(), '0',
       'es_ES', '🤔', 'Es difícil de usar', 20, st.etgo_survey_type_id, 1, 5
FROM etgo_survey_type st
WHERE st.ad_client_id = :client_id AND st.survey_key = 'csat_invoicing'
  AND NOT EXISTS (
    SELECT 1 FROM etgo_survey_canned_resp cr
    WHERE cr.ad_client_id = :client_id AND cr.etgo_survey_type_id = st.etgo_survey_type_id
      AND cr.language = 'es_ES' AND cr.line_no = 20
  );
INSERT INTO etgo_survey_canned_resp (
  etgo_survey_canned_resp_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, language, icon, response_text, line_no, etgo_survey_type_id,
  min_score, max_score
)
SELECT '@uuid_INV3EN@', :client_id, '0', 'Y', now(), '0', now(), '0',
       'en_US', '📄', 'Need more templates', 30, st.etgo_survey_type_id, 1, 5
FROM etgo_survey_type st
WHERE st.ad_client_id = :client_id AND st.survey_key = 'csat_invoicing'
  AND NOT EXISTS (
    SELECT 1 FROM etgo_survey_canned_resp cr
    WHERE cr.ad_client_id = :client_id AND cr.etgo_survey_type_id = st.etgo_survey_type_id
      AND cr.language = 'en_US' AND cr.line_no = 30
  );
INSERT INTO etgo_survey_canned_resp (
  etgo_survey_canned_resp_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, language, icon, response_text, line_no, etgo_survey_type_id,
  min_score, max_score
)
SELECT '@uuid_INV3ES@', :client_id, '0', 'Y', now(), '0', now(), '0',
       'es_ES', '📄', 'Necesito más plantillas', 30, st.etgo_survey_type_id, 1, 5
FROM etgo_survey_type st
WHERE st.ad_client_id = :client_id AND st.survey_key = 'csat_invoicing'
  AND NOT EXISTS (
    SELECT 1 FROM etgo_survey_canned_resp cr
    WHERE cr.ad_client_id = :client_id AND cr.etgo_survey_type_id = st.etgo_survey_type_id
      AND cr.language = 'es_ES' AND cr.line_no = 30
  );
INSERT INTO etgo_survey_canned_resp (
  etgo_survey_canned_resp_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, language, icon, response_text, line_no, etgo_survey_type_id,
  min_score, max_score
)
SELECT '@uuid_INV4EN@', :client_id, '0', 'Y', now(), '0', now(), '0',
       'en_US', '🧾', 'VAT/tax handling is confusing', 40, st.etgo_survey_type_id, 1, 5
FROM etgo_survey_type st
WHERE st.ad_client_id = :client_id AND st.survey_key = 'csat_invoicing'
  AND NOT EXISTS (
    SELECT 1 FROM etgo_survey_canned_resp cr
    WHERE cr.ad_client_id = :client_id AND cr.etgo_survey_type_id = st.etgo_survey_type_id
      AND cr.language = 'en_US' AND cr.line_no = 40
  );
INSERT INTO etgo_survey_canned_resp (
  etgo_survey_canned_resp_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, language, icon, response_text, line_no, etgo_survey_type_id,
  min_score, max_score
)
SELECT '@uuid_INV4ES@', :client_id, '0', 'Y', now(), '0', now(), '0',
       'es_ES', '🧾', 'El IVA/impuestos es confuso', 40, st.etgo_survey_type_id, 1, 5
FROM etgo_survey_type st
WHERE st.ad_client_id = :client_id AND st.survey_key = 'csat_invoicing'
  AND NOT EXISTS (
    SELECT 1 FROM etgo_survey_canned_resp cr
    WHERE cr.ad_client_id = :client_id AND cr.etgo_survey_type_id = st.etgo_survey_type_id
      AND cr.language = 'es_ES' AND cr.line_no = 40
  );
INSERT INTO etgo_survey_canned_resp (
  etgo_survey_canned_resp_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, language, icon, response_text, line_no, etgo_survey_type_id,
  min_score, max_score
)
SELECT '@uuid_INV5EN@', :client_id, '0', 'Y', now(), '0', now(), '0',
       'en_US', '📤', 'Trouble sending to the client', 50, st.etgo_survey_type_id, 1, 5
FROM etgo_survey_type st
WHERE st.ad_client_id = :client_id AND st.survey_key = 'csat_invoicing'
  AND NOT EXISTS (
    SELECT 1 FROM etgo_survey_canned_resp cr
    WHERE cr.ad_client_id = :client_id AND cr.etgo_survey_type_id = st.etgo_survey_type_id
      AND cr.language = 'en_US' AND cr.line_no = 50
  );
INSERT INTO etgo_survey_canned_resp (
  etgo_survey_canned_resp_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, language, icon, response_text, line_no, etgo_survey_type_id,
  min_score, max_score
)
SELECT '@uuid_INV5ES@', :client_id, '0', 'Y', now(), '0', now(), '0',
       'es_ES', '📤', 'Problemas al enviar al cliente', 50, st.etgo_survey_type_id, 1, 5
FROM etgo_survey_type st
WHERE st.ad_client_id = :client_id AND st.survey_key = 'csat_invoicing'
  AND NOT EXISTS (
    SELECT 1 FROM etgo_survey_canned_resp cr
    WHERE cr.ad_client_id = :client_id AND cr.etgo_survey_type_id = st.etgo_survey_type_id
      AND cr.language = 'es_ES' AND cr.line_no = 50
  );
INSERT INTO etgo_survey_canned_resp (
  etgo_survey_canned_resp_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, language, icon, response_text, line_no, etgo_survey_type_id,
  min_score, max_score
)
SELECT '@uuid_INV6EN@', :client_id, '0', 'Y', now(), '0', now(), '0',
       'en_US', '🐛', 'Ran into a bug', 60, st.etgo_survey_type_id, 1, 5
FROM etgo_survey_type st
WHERE st.ad_client_id = :client_id AND st.survey_key = 'csat_invoicing'
  AND NOT EXISTS (
    SELECT 1 FROM etgo_survey_canned_resp cr
    WHERE cr.ad_client_id = :client_id AND cr.etgo_survey_type_id = st.etgo_survey_type_id
      AND cr.language = 'en_US' AND cr.line_no = 60
  );
INSERT INTO etgo_survey_canned_resp (
  etgo_survey_canned_resp_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, language, icon, response_text, line_no, etgo_survey_type_id,
  min_score, max_score
)
SELECT '@uuid_INV6ES@', :client_id, '0', 'Y', now(), '0', now(), '0',
       'es_ES', '🐛', 'Tuve un error', 60, st.etgo_survey_type_id, 1, 5
FROM etgo_survey_type st
WHERE st.ad_client_id = :client_id AND st.survey_key = 'csat_invoicing'
  AND NOT EXISTS (
    SELECT 1 FROM etgo_survey_canned_resp cr
    WHERE cr.ad_client_id = :client_id AND cr.etgo_survey_type_id = st.etgo_survey_type_id
      AND cr.language = 'es_ES' AND cr.line_no = 60
  );

-- 3c. csat_order -- 6 chips x 2 languages, with icon, MIN_SCORE=1/MAX_SCORE=5 forced.
INSERT INTO etgo_survey_canned_resp (
  etgo_survey_canned_resp_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, language, icon, response_text, line_no, etgo_survey_type_id,
  min_score, max_score
)
SELECT '@uuid_ORD1EN@', :client_id, '0', 'Y', now(), '0', now(), '0',
       'en_US', '🐢', 'Too slow', 10, st.etgo_survey_type_id, 1, 5
FROM etgo_survey_type st
WHERE st.ad_client_id = :client_id AND st.survey_key = 'csat_order'
  AND NOT EXISTS (
    SELECT 1 FROM etgo_survey_canned_resp cr
    WHERE cr.ad_client_id = :client_id AND cr.etgo_survey_type_id = st.etgo_survey_type_id
      AND cr.language = 'en_US' AND cr.line_no = 10
  );
INSERT INTO etgo_survey_canned_resp (
  etgo_survey_canned_resp_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, language, icon, response_text, line_no, etgo_survey_type_id,
  min_score, max_score
)
SELECT '@uuid_ORD1ES@', :client_id, '0', 'Y', now(), '0', now(), '0',
       'es_ES', '🐢', 'Es lento', 10, st.etgo_survey_type_id, 1, 5
FROM etgo_survey_type st
WHERE st.ad_client_id = :client_id AND st.survey_key = 'csat_order'
  AND NOT EXISTS (
    SELECT 1 FROM etgo_survey_canned_resp cr
    WHERE cr.ad_client_id = :client_id AND cr.etgo_survey_type_id = st.etgo_survey_type_id
      AND cr.language = 'es_ES' AND cr.line_no = 10
  );
INSERT INTO etgo_survey_canned_resp (
  etgo_survey_canned_resp_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, language, icon, response_text, line_no, etgo_survey_type_id,
  min_score, max_score
)
SELECT '@uuid_ORD2EN@', :client_id, '0', 'Y', now(), '0', now(), '0',
       'en_US', '🤔', 'Hard to use', 20, st.etgo_survey_type_id, 1, 5
FROM etgo_survey_type st
WHERE st.ad_client_id = :client_id AND st.survey_key = 'csat_order'
  AND NOT EXISTS (
    SELECT 1 FROM etgo_survey_canned_resp cr
    WHERE cr.ad_client_id = :client_id AND cr.etgo_survey_type_id = st.etgo_survey_type_id
      AND cr.language = 'en_US' AND cr.line_no = 20
  );
INSERT INTO etgo_survey_canned_resp (
  etgo_survey_canned_resp_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, language, icon, response_text, line_no, etgo_survey_type_id,
  min_score, max_score
)
SELECT '@uuid_ORD2ES@', :client_id, '0', 'Y', now(), '0', now(), '0',
       'es_ES', '🤔', 'Es difícil de usar', 20, st.etgo_survey_type_id, 1, 5
FROM etgo_survey_type st
WHERE st.ad_client_id = :client_id AND st.survey_key = 'csat_order'
  AND NOT EXISTS (
    SELECT 1 FROM etgo_survey_canned_resp cr
    WHERE cr.ad_client_id = :client_id AND cr.etgo_survey_type_id = st.etgo_survey_type_id
      AND cr.language = 'es_ES' AND cr.line_no = 20
  );
INSERT INTO etgo_survey_canned_resp (
  etgo_survey_canned_resp_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, language, icon, response_text, line_no, etgo_survey_type_id,
  min_score, max_score
)
SELECT '@uuid_ORD3EN@', :client_id, '0', 'Y', now(), '0', now(), '0',
       'en_US', '🔍', 'Couldn''t find the product', 30, st.etgo_survey_type_id, 1, 5
FROM etgo_survey_type st
WHERE st.ad_client_id = :client_id AND st.survey_key = 'csat_order'
  AND NOT EXISTS (
    SELECT 1 FROM etgo_survey_canned_resp cr
    WHERE cr.ad_client_id = :client_id AND cr.etgo_survey_type_id = st.etgo_survey_type_id
      AND cr.language = 'en_US' AND cr.line_no = 30
  );
INSERT INTO etgo_survey_canned_resp (
  etgo_survey_canned_resp_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, language, icon, response_text, line_no, etgo_survey_type_id,
  min_score, max_score
)
SELECT '@uuid_ORD3ES@', :client_id, '0', 'Y', now(), '0', now(), '0',
       'es_ES', '🔍', 'No encontré el producto', 30, st.etgo_survey_type_id, 1, 5
FROM etgo_survey_type st
WHERE st.ad_client_id = :client_id AND st.survey_key = 'csat_order'
  AND NOT EXISTS (
    SELECT 1 FROM etgo_survey_canned_resp cr
    WHERE cr.ad_client_id = :client_id AND cr.etgo_survey_type_id = st.etgo_survey_type_id
      AND cr.language = 'es_ES' AND cr.line_no = 30
  );
INSERT INTO etgo_survey_canned_resp (
  etgo_survey_canned_resp_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, language, icon, response_text, line_no, etgo_survey_type_id,
  min_score, max_score
)
SELECT '@uuid_ORD4EN@', :client_id, '0', 'Y', now(), '0', now(), '0',
       'en_US', '📋', 'Hard to build order lines', 40, st.etgo_survey_type_id, 1, 5
FROM etgo_survey_type st
WHERE st.ad_client_id = :client_id AND st.survey_key = 'csat_order'
  AND NOT EXISTS (
    SELECT 1 FROM etgo_survey_canned_resp cr
    WHERE cr.ad_client_id = :client_id AND cr.etgo_survey_type_id = st.etgo_survey_type_id
      AND cr.language = 'en_US' AND cr.line_no = 40
  );
INSERT INTO etgo_survey_canned_resp (
  etgo_survey_canned_resp_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, language, icon, response_text, line_no, etgo_survey_type_id,
  min_score, max_score
)
SELECT '@uuid_ORD4ES@', :client_id, '0', 'Y', now(), '0', now(), '0',
       'es_ES', '📋', 'Difícil armar las líneas de pedido', 40, st.etgo_survey_type_id, 1, 5
FROM etgo_survey_type st
WHERE st.ad_client_id = :client_id AND st.survey_key = 'csat_order'
  AND NOT EXISTS (
    SELECT 1 FROM etgo_survey_canned_resp cr
    WHERE cr.ad_client_id = :client_id AND cr.etgo_survey_type_id = st.etgo_survey_type_id
      AND cr.language = 'es_ES' AND cr.line_no = 40
  );
INSERT INTO etgo_survey_canned_resp (
  etgo_survey_canned_resp_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, language, icon, response_text, line_no, etgo_survey_type_id,
  min_score, max_score
)
SELECT '@uuid_ORD5EN@', :client_id, '0', 'Y', now(), '0', now(), '0',
       'en_US', '✅', 'Trouble confirming the order', 50, st.etgo_survey_type_id, 1, 5
FROM etgo_survey_type st
WHERE st.ad_client_id = :client_id AND st.survey_key = 'csat_order'
  AND NOT EXISTS (
    SELECT 1 FROM etgo_survey_canned_resp cr
    WHERE cr.ad_client_id = :client_id AND cr.etgo_survey_type_id = st.etgo_survey_type_id
      AND cr.language = 'en_US' AND cr.line_no = 50
  );
INSERT INTO etgo_survey_canned_resp (
  etgo_survey_canned_resp_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, language, icon, response_text, line_no, etgo_survey_type_id,
  min_score, max_score
)
SELECT '@uuid_ORD5ES@', :client_id, '0', 'Y', now(), '0', now(), '0',
       'es_ES', '✅', 'Problemas al confirmar el pedido', 50, st.etgo_survey_type_id, 1, 5
FROM etgo_survey_type st
WHERE st.ad_client_id = :client_id AND st.survey_key = 'csat_order'
  AND NOT EXISTS (
    SELECT 1 FROM etgo_survey_canned_resp cr
    WHERE cr.ad_client_id = :client_id AND cr.etgo_survey_type_id = st.etgo_survey_type_id
      AND cr.language = 'es_ES' AND cr.line_no = 50
  );
INSERT INTO etgo_survey_canned_resp (
  etgo_survey_canned_resp_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, language, icon, response_text, line_no, etgo_survey_type_id,
  min_score, max_score
)
SELECT '@uuid_ORD6EN@', :client_id, '0', 'Y', now(), '0', now(), '0',
       'en_US', '🐛', 'Ran into a bug', 60, st.etgo_survey_type_id, 1, 5
FROM etgo_survey_type st
WHERE st.ad_client_id = :client_id AND st.survey_key = 'csat_order'
  AND NOT EXISTS (
    SELECT 1 FROM etgo_survey_canned_resp cr
    WHERE cr.ad_client_id = :client_id AND cr.etgo_survey_type_id = st.etgo_survey_type_id
      AND cr.language = 'en_US' AND cr.line_no = 60
  );
INSERT INTO etgo_survey_canned_resp (
  etgo_survey_canned_resp_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, language, icon, response_text, line_no, etgo_survey_type_id,
  min_score, max_score
)
SELECT '@uuid_ORD6ES@', :client_id, '0', 'Y', now(), '0', now(), '0',
       'es_ES', '🐛', 'Tuve un error', 60, st.etgo_survey_type_id, 1, 5
FROM etgo_survey_type st
WHERE st.ad_client_id = :client_id AND st.survey_key = 'csat_order'
  AND NOT EXISTS (
    SELECT 1 FROM etgo_survey_canned_resp cr
    WHERE cr.ad_client_id = :client_id AND cr.etgo_survey_type_id = st.etgo_survey_type_id
      AND cr.language = 'es_ES' AND cr.line_no = 60
  );
