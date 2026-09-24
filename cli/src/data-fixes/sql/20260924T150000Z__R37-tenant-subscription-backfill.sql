-- @id: R37-tenant-subscription-backfill
-- @gap: B2
-- @risk: medium
-- @type: sql
-- @description: Backfill one open ETGO_SUBSCRIPTION row on the grandfathered legacy-productive plan for every tenant carrying the AD_Preference ETGO_TenantPlan='productive' marker but no open subscription, copying Stripe ids from its ETGO_CHECKOUT_REQUEST when one exists, and retire that tenant's now-stale ETGO_TenantPlan preference in the SAME transaction (ETP-5046)

-- Why this file is dated 2026-09-24 (READ BEFORE RE-DATING IT)
-- --------------------------------------------------------------------------------------------
-- It was authored as 20260918T120000Z. While ETP-5046 waited to merge, develop shipped fixes up
-- to 20260922T130000Z, and one of them (R38-org-legalentity-pointer) carries that EXACT same
-- timestamp. run.js skips every fix at or before a tenant's watermark (strict `<=`, no
-- look-back), so on any environment that had already processed those develop fixes this file
-- would have been skipped silently -- no ledger row, no error, every paying tenant left on the
-- preference. It was renamed before it reached any shared environment (sql/README.md rule 3
-- forbids renaming an APPLIED fix, not an unapplied one). Keep it strictly newer than every fix
-- already merged when it lands.

-- Context (ETP-5046, gap B1 "Tenant subscription")
-- --------------------------------------------------------------------------------------------
-- Before the subscription model existed, the ONLY record that a tenant had been provisioned
-- through the paid upgrade flow was a single AD_Preference row, attribute 'ETGO_TenantPlan',
-- value 'productive' (com.etendoerp.go, TenantPlanService#markProductive / #resolvePlan). That
-- marker cannot express a price, a period, a provider id or a subscription state -- which is
-- exactly why ETGO_SUBSCRIPTION now exists. Every tenant marked productive BEFORE that table
-- shipped therefore has a plan but no subscription row, and would read back as "not subscribed"
-- to every consumer of the new model. This fix gives each of them one open subscription row on
-- the grandfathered 'legacy-productive' plan, so the new model's answer matches the old marker's
-- answer for the entire existing fleet.
--
-- TENANT SCOPING -- reads like a rule-1 violation, is not (READ THIS BEFORE FLAGGING IT)
-- --------------------------------------------------------------------------------------------
-- sql/README.md rule 1 requires every statement to filter `ad_client_id = :client_id`. THREE of
-- the tables this fix touches genuinely do not hold the tenant in `ad_client_id`, so filtering on
-- that column would silently match ZERO rows -- the exact silent-no-op failure mode this catalog
-- exists to avoid. Each one is scoped by the column that really does carry the tenant:
--
--   * etgo_subscription      -> environment_client_id = :client_id
--       `ad_client_id` is the OWNER of the row, always the System pseudo-client '0' (the table is
--       System-owned, like ETGO_DATA_FIX_HISTORY itself). The TENANT the subscription is FOR is
--       `environment_client_id`. Its partial unique index is keyed on that column too
--       (etgo_sub_open_envclient_uq, see below), which is the authoritative statement of which
--       column means "tenant" here.
--   * etgo_checkout_request  -> created_client_id = :client_id
--       Same shape: the table is System-owned at client '0' (a checkout request exists BEFORE the
--       tenant's own client does, so it cannot be owned by it), and the tenant that the request
--       belongs to is `created_client_id`.
--   * ad_preference          -> visibleat_client_id = :client_id
--       The plan marker is written by Preferences.setPreferenceValue(..., client, organization,
--       ...) whose `client` argument is the VISIBILITY scope, not the row's owner -- the row is
--       created under the onboarding session's own (System) context. TenantPlanService#resolvePlan
--       reads it back through Preference.PROPERTY_VISIBLEATCLIENT, and the two sibling fixes that
--       already gate on this same marker (R31-force-test-mode-demo-tenants,
--       R32-revert-test-mode-productive-tenants) use `visibleat_client_id` verbatim. Using
--       `ad_client_id` here would disagree with both of them about which tenants are productive.
--
-- `ad_client` (the anchor of @check, @apply's INSERT ... SELECT and @report's first branch) IS
-- filtered on `ad_client_id = :client_id`, so rule 1 is met literally on the driving table of
-- every statement in this file. No statement anywhere below is unscoped; the regression test
-- cli/test/data-fixes-r37-tenant-subscription-backfill.test.js asserts that statement by statement.
--
-- Target schema (the constraints this fix has to respect)
-- --------------------------------------------------------------------------------------------
--   * status IN ('active','past_due','canceled')          -- we always write 'active'
--   * end_date IS NULL OR end_date >= start_date          -- we always write end_date = NULL (open)
--   * PARTIAL UNIQUE INDEX etgo_sub_open_envclient_uq
--       ON etgo_subscription(environment_client_id) WHERE isactive='Y' AND end_date IS NULL
--     i.e. AT MOST ONE OPEN SUBSCRIPTION PER TENANT. The `NOT EXISTS (open subscription)` guard
--     that appears in BOTH @check and @apply is therefore not decoration: it is what keeps a
--     re-run, a concurrent run, or a tenant that got a real subscription in the meantime from
--     hitting that index. It is also what makes @check converge to 0 rows after a successful
--     @apply (two-layer idempotency, README rule 2).
--
-- Why @apply ABORTS instead of inserting nothing when the plan row is missing
-- --------------------------------------------------------------------------------------------
-- The first statement of @apply deliberately RAISES (a cast of an explanatory message to integer,
-- guarded by NOT EXISTS, with the client id concatenated in so PostgreSQL cannot constant-fold the
-- cast at plan time and raise it unconditionally) when etgo_plan has no active 'legacy-productive'
-- row. The alternative -- letting the INSERT's plan subselect return NULL, or letting the INSERT
-- match zero rows -- would be far worse than a loud failure:
--   an ERROR rolls the transaction back and records FAILED, and FAILED is NOT in the runner's
--   PROCESSED set (run.js: PROCESSED = {APPLIED, MANUALLY_FIXED, SKIPPED_NOT_NEEDED}), so the
--   tenant's watermark does NOT advance and the tenant is retried on the very next run, once the
--   plan row exists. Inserting zero rows would instead record APPLIED, advance the watermark past
--   R37 forever, and silently leave a PAYING customer with no subscription -- i.e. flipped to free.
--   A fix that can lose a paying customer by succeeding must fail instead.
--
-- Stripe ids
-- --------------------------------------------------------------------------------------------
-- Copied from the tenant's most recent paid checkout request (LEFT JOIN LATERAL, ordered
-- `paid_at DESC NULLS LAST, created DESC`, LIMIT 1, and requiring stripe_subscription_id IS NOT
-- NULL so a request that never reached a subscription is never picked). A tenant marked productive
-- through a path that left no checkout request simply gets both ids NULL -- correct, not a defect:
-- there is no Stripe subscription to point at. @report says, per created row, which of the two
-- happened, so an operator never has to guess.
-- provider_price_id is copied from that same checkout request's stripe_price_id -- the Stripe price
-- the tenant was actually charged, recorded on the request since develop's ETP-5463 -- and is NULL
-- when the request predates that column or no request exists. snapshot_amount / snapshot_currency
-- stay NULL on purpose: the grandfathered 'legacy-productive' plan has no price, the request stores
-- only the price id, so there is no truthful amount to snapshot.
-- etgo_account_id is likewise NULL -- the checkout request does not carry it and inventing an
-- owner account here would be a guess.
--
-- ONBOARDING_PROVISIONED_THROUGH is deliberately NOT bumped for this fix. Once the ETGO_TenantPlan
-- write path is retired, a newly onboarded tenant never gets the preference at all, so @check's
-- `EXISTS (productive preference)` is a cheap 0-row skip (SKIPPED_NOT_NEEDED) for every new tenant
-- regardless of the CUT -- shipping without the bump is redundant here, never incorrect.
--
-- PER-TENANT RETIREMENT OF ETGO_TenantPlan (statement 3 of @apply)
-- --------------------------------------------------------------------------------------------
-- The preference is NOT retired fleet-wide on a flag day. It is retired PER TENANT, in the same
-- transaction that gives that tenant its subscription: the subscription row appears and the
-- preference row disappears together, or neither does. A tenant is therefore never in a state
-- where both stores answer, and never in a state where neither does.
--
-- That turns the ETP-5046 cutover into a per-tenant state transition with an OBSERVABLE end
-- condition rather than a judgement call:
--
--     select count(*) from ad_preference where attribute = 'ETGO_TenantPlan';
--
-- When that reaches 0 -- and the TenantPlanPreferenceFallback WARN lines stop appearing in the
-- logs -- every tenant has moved, and Phase F (deleting TenantPlanService#markProductive,
-- TenantPlanService.PREFERENCE_ATTRIBUTE, TenantPlanPreferenceFallback and everything else
-- carrying the grep marker ETP-5046-TRANSITIONAL-FALLBACK) is provably safe. Until then the
-- remaining rows ARE the worklist.
--
-- The DELETE is guarded on an open subscription EXISTING for the tenant, not on "the INSERT above
-- just ran". Guarding on existence makes the statement self-healing: a tenant that got its
-- subscription by ANY route -- the runtime paid-upgrade path, a manual correction, an earlier
-- partially-applied run -- has its preference retired the next time this fix is invoked for it,
-- without the fix needing to know how the row got there. A "we just inserted" guard would only
-- ever clean up after itself.
--
-- WHY THE DELETE IGNORES the preference's own value and isactive flag. @check keys on an ACTIVE
-- 'productive' row, but the DELETE removes EVERY ETGO_TenantPlan row visible at the tenant,
-- whatever it holds. Three reasons, in order of weight:
--   1. Once the tenant has an open subscription, the subscription IS its plan. Any surviving
--      ETGO_TenantPlan row is a second answer to a question that now has one authority -- stale
--      by definition, regardless of what it says.
--   2. An inactive or non-'productive' leftover would keep the end-condition count above zero
--      FOREVER, which is the one thing that makes this design worth having. A cutover whose
--      completion query can never reach 0 is back to being a judgement call.
--   3. An isactive='N' row is one operator click away from being reactivated into a parallel
--      truth that nothing reads any more.
-- The blast radius is bounded: this attribute is written by exactly one place in the product
-- (TenantPlanService#markProductive, via Preferences.setPreferenceValue) and read by exactly one
-- (TenantPlanPreferenceFallback). Nothing else in Etendo owns or consumes it. The deletion is
-- recorded in @report, which -- because the row itself is gone afterwards -- is the ONLY audit
-- trail of it.
--
-- ORDERING INVARIANT -- R31/R32 must never observe a post-retirement tenant (READ BEFORE ADDING
-- ANY FIX THAT KEYS ON ETGO_TenantPlan)
-- --------------------------------------------------------------------------------------------
-- Two earlier fixes read this preference directly in SQL and know nothing about etgo_subscription:
--   * 20260901T120000Z__R31-force-test-mode-demo-tenants.sql keys on the ABSENCE of an active
--     productive marker to force ETSG_ForceTestMode='Y'.
--   * 20260901T130000Z__R32-revert-test-mode-productive-tenants.sql keys on its PRESENCE.
-- If R31 ever ran for a tenant AFTER this fix retired that tenant's preference, it would read a
-- PAYING tenant as free and force test mode on it -- which routes that tenant's real
-- SII/TicketBAI/VeriFactu submissions to the tax authority's TEST endpoints. That is a
-- fiscal-compliance failure, not a configuration nit.
--
-- What makes it safe is the runner, and it is worth stating exactly: run.js sorts the catalog by
-- file name (the UTC timestamp prefix makes lexical order == chronological order) and applies, per
-- tenant, only fixes strictly newer than that tenant's watermark -- the newest timestamp among its
-- PROCESSED ledger rows. So for any single tenant:
--   * within one run, R31 (2026-09-01) is always visited before R37 (2026-09-24);
--   * once R37 is PROCESSED the watermark is >= 2026-09-24T15:00:00Z, so R31 is skipped on every
--     later run -- including the case where R31 itself FAILED, because the watermark is a date,
--     not a per-fix flag.
-- R31 can therefore never execute against a tenant whose preference this fix has already retired.
-- Neither R31 nor R32 is edited here: an applied data-fix is immutable (sql/README.md rule 3) and
-- is superseded by a new dated file, never edited in place.
--
-- ==> ANY FUTURE FIX MUST KEY ON etgo_subscription, NOT ON ETGO_TenantPlan. After this fix, the
--     preference is present ONLY for tenants the backfill has not reached, so "has no productive
--     preference" no longer means "is a free tenant" -- it increasingly means "is a paying tenant
--     that has already been migrated". A new fix written against the preference would invert its
--     own intent, silently, on exactly the tenants that pay.
--
-- @report placeholder convention
-- --------------------------------------------------------------------------------------------
-- @report carries the VERBATIM outcome of a manual pre-check that must be re-run before this fix
-- goes out fleet-wide. While that pre-check is still outstanding an author leaves the marker
-- TODO-PRECHECK-R37 in the @report text; the regression test FAILS the build while that marker is
-- present, and separately asserts the settled pre-check wording is there instead. The marker must
-- therefore never appear inside the @report section itself -- only here, in this header.

-- @check
-- Returns >=1 row when the fix IS needed: the tenant carries the productive plan marker AND has
-- no open subscription. 0 rows => SKIPPED_NOT_NEEDED, @apply never runs. Converges to 0 after a
-- successful @apply for TWO independent reasons: the inserted row is itself an open subscription,
-- and statement 3 retires the productive preference this probe also requires.
SELECT 1
FROM ad_client c
WHERE c.ad_client_id = :client_id
  AND EXISTS (
    SELECT 1 FROM ad_preference tp
    WHERE tp.attribute = 'ETGO_TenantPlan'
      AND tp.visibleat_client_id = :client_id
      AND tp.isactive = 'Y'
      AND upper(trim(tp.value)) = 'PRODUCTIVE'
  )
  AND NOT EXISTS (
    SELECT 1 FROM etgo_subscription s
    WHERE s.environment_client_id = :client_id
      AND s.isactive = 'Y'
      AND s.end_date IS NULL
  )
LIMIT 1;

-- @apply

-- Statement 1 of 3 -- ABORT GUARD (see the header: an error retries the tenant, a silent no-op
-- loses it). Raises only for a tenant that genuinely would have been backfilled below, and only
-- when the grandfathered plan row is absent. The client id is concatenated into the message so
-- the cast argument is not a constant -- PostgreSQL constant-folds a constant cast at PLAN time,
-- which would make this raise unconditionally, ignoring its own WHERE clause.
SELECT CAST(
         'R37 ABORT: etgo_plan has no active row with value = ''legacy-productive''. '
         || 'Refusing to backfill tenant ' || c.ad_client_id
         || ' with a NULL plan. Create the grandfathered plan row, then re-run this fix.'
         AS integer
       ) AS abort_missing_legacy_plan
FROM ad_client c
WHERE c.ad_client_id = :client_id
  AND EXISTS (
    SELECT 1 FROM ad_preference tp
    WHERE tp.attribute = 'ETGO_TenantPlan'
      AND tp.visibleat_client_id = :client_id
      AND tp.isactive = 'Y'
      AND upper(trim(tp.value)) = 'PRODUCTIVE'
  )
  AND NOT EXISTS (
    SELECT 1 FROM etgo_subscription s
    WHERE s.environment_client_id = :client_id
      AND s.isactive = 'Y'
      AND s.end_date IS NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM etgo_plan p
    WHERE p.value = 'legacy-productive'
      AND p.isactive = 'Y'
  );

-- Statement 2 of 3 -- the backfill itself. One open row per productive tenant, on the
-- grandfathered plan, guarded by the same NOT EXISTS the partial unique index enforces.
INSERT INTO etgo_subscription (
  etgo_subscription_id, ad_client_id, ad_org_id, isactive,
  created, createdby, updated, updatedby,
  environment_client_id, etgo_plan_id, status,
  start_date, end_date, current_period_start, current_period_end,
  stripe_customer_id, stripe_subscription_id,
  etgo_account_id, provider_price_id, snapshot_amount, snapshot_currency,
  pending_plan_id, pending_effective_date
)
SELECT
  '@uuid_ETGOSUB@',
  '0', '0', 'Y',
  now(), '0', now(), '0',
  c.ad_client_id,
  (SELECT p.etgo_plan_id FROM etgo_plan p
    WHERE p.value = 'legacy-productive' AND p.isactive = 'Y'
    LIMIT 1),
  'active',
  COALESCE(cr.paid_at, c.created, now()),
  NULL, NULL, NULL,
  cr.stripe_customer_id, cr.stripe_subscription_id,
  NULL, cr.stripe_price_id, NULL, NULL,
  NULL, NULL
FROM ad_client c
LEFT JOIN LATERAL (
  SELECT r.stripe_customer_id, r.stripe_subscription_id, r.stripe_price_id, r.paid_at
  FROM etgo_checkout_request r
  WHERE r.created_client_id = :client_id
    AND r.isactive = 'Y'
    AND r.stripe_subscription_id IS NOT NULL
  ORDER BY r.paid_at DESC NULLS LAST, r.created DESC
  LIMIT 1
) cr ON TRUE
WHERE c.ad_client_id = :client_id
  AND EXISTS (
    SELECT 1 FROM ad_preference tp
    WHERE tp.attribute = 'ETGO_TenantPlan'
      AND tp.visibleat_client_id = :client_id
      AND tp.isactive = 'Y'
      AND upper(trim(tp.value)) = 'PRODUCTIVE'
  )
  AND NOT EXISTS (
    SELECT 1 FROM etgo_subscription s
    WHERE s.environment_client_id = :client_id
      AND s.isactive = 'Y'
      AND s.end_date IS NULL
  );

-- Statement 3 of 3 -- PER-TENANT RETIREMENT of the legacy plan marker (see the header section
-- "PER-TENANT RETIREMENT OF ETGO_TenantPlan" for the full rationale, and the ORDERING INVARIANT
-- immediately after it for why R31/R32 can never observe the result of this statement).
--
-- Runs in the SAME transaction as the INSERT above, so the subscription row and the preference row
-- flip together or not at all. Scoped by VISIBLEAT_CLIENT_ID -- the tenant column for this row;
-- its AD_CLIENT_ID is the System pseudo-client '0', so a filter on ad_client_id would match ZERO
-- rows for every tenant (the silent-no-op mistake that has already nearly shipped twice on this
-- ticket; verified on the live fleet: via_visibleat=6, via_adclient=0).
--
-- Guarded on an open subscription EXISTING -- not on "the statement above just inserted one" -- so
-- it is self-healing for a tenant that obtained its subscription by any other route. When the
-- guard is false the statement removes nothing and the fallback keeps answering for that tenant,
-- which is the safe direction.
--
-- Idempotency: after this statement the tenant has a subscription and no preference, so @check
-- (which requires a productive preference AND no open subscription) returns 0 rows on every later
-- run -- it now converges for two independent reasons instead of one -- and @apply is never
-- invoked again. A second invocation would in any case remove nothing.
DELETE FROM ad_preference tp
 WHERE tp.attribute = 'ETGO_TenantPlan'
   AND tp.visibleat_client_id = :client_id
   AND EXISTS (
     SELECT 1 FROM etgo_subscription s
     WHERE s.environment_client_id = :client_id
       AND s.isactive = 'Y'
       AND s.end_date IS NULL
   );

-- @report
-- Read-only, same transaction as @apply. ALWAYS returns at least one row on a successful apply
-- (the manual-pre-check branch is driven by ad_client, which always matches the target tenant),
-- so the ledger detail is never NULL on an APPLIED row. Second branch: one line per open
-- subscription the tenant now has, saying whether Stripe ids were copied or deliberately left
-- NULL, so an operator never has to open the table to find out.
--
-- THIRD BRANCH -- the audit trail of the retirement. Statement 3 of @apply removes the tenant's
-- ETGO_TenantPlan preference, so once this fix has run there is no row left to inspect: this
-- ledger line is the ONLY lasting record that the tenant was retired, and by which fix. One line
-- per tenant, driven by ad_client so it is always emitted.
--
-- It reads the POST-state, which is what makes it trustworthy: it reports what is true at commit
-- time rather than what the statement intended. The inference "no row remains => this fix retired
-- it" is sound because @apply only runs when @check returned rows, and @check requires an active
-- productive preference -- so on every invocation a row existed beforehand.
--
-- The wording deliberately avoids the three bare DML keywords, in the CASE labels AND in this
-- comment: the regression test asserts @report is read-only by scanning the whole section for
-- them, so a label -- or a stray explanation -- containing one would defeat that check.
-- "Retired"/"removed" say the same thing without weakening the guard.
SELECT 'manual-pre-check' AS item,
       'Re-verify that production Stripe checkout has not gone live since 2026-08-27; if it has, a real paying cohort exists that the backfill would orphan and an adoption step is required first.' AS outcome,
       c.ad_client_id AS ref
FROM ad_client c
WHERE c.ad_client_id = :client_id
UNION ALL
SELECT 'open-subscription' AS item,
       CASE
         WHEN s.stripe_subscription_id IS NOT NULL
           THEN 'stripe ids copied from etgo_checkout_request (customer='
                || COALESCE(s.stripe_customer_id, 'none')
                || ', subscription=' || s.stripe_subscription_id
                || ', price=' || COALESCE(s.provider_price_id, 'unknown') || ')'
         ELSE 'no usable etgo_checkout_request found, stripe ids left NULL'
       END AS outcome,
       s.etgo_subscription_id AS ref
FROM etgo_subscription s
WHERE s.environment_client_id = :client_id
  AND s.isactive = 'Y'
  AND s.end_date IS NULL
UNION ALL
SELECT 'tenant-plan-preference' AS item,
       CASE
         WHEN EXISTS (
                SELECT 1 FROM ad_preference tp
                WHERE tp.attribute = 'ETGO_TenantPlan'
                  AND tp.visibleat_client_id = :client_id
              )
           THEN 'ETGO_TenantPlan preference STILL PRESENT for this tenant: it has no open '
                || 'subscription, so the per-tenant retirement did not fire. The transitional '
                || 'preference fallback keeps answering for it.'
         WHEN EXISTS (
                SELECT 1 FROM etgo_subscription s2
                WHERE s2.environment_client_id = :client_id
                  AND s2.isactive = 'Y'
                  AND s2.end_date IS NULL
              )
           THEN 'ETGO_TenantPlan preference retired for this tenant in the same transaction as '
                || 'its open subscription; no row remains (either it was removed here, or there '
                || 'was none left to remove). The subscription is now its only plan record.'
         ELSE 'No ETGO_TenantPlan preference remains for this tenant and it has no open '
              || 'subscription either; nothing was retired.'
       END AS outcome,
       c.ad_client_id AS ref
FROM ad_client c
WHERE c.ad_client_id = :client_id
ORDER BY 1, 3;
