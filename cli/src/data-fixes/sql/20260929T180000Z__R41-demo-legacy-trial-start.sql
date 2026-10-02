-- @id: R41-demo-legacy-trial-start
-- @gap: Legacy demo lifecycle metadata
-- @risk: medium
-- @type: sql
-- @description: Initialize an explicitly approved transition start only for unpaid owned legacy demos.
-- The date is a PostgreSQL session setting, never client creation time or now().
-- PGOPTIONS='-c etendo_go.demo_transition_started_at=<UTC-ISO-INSTANT>'
-- Missing/invalid settings fail apply atomically; dry-run needs no date.
-- Existing dates (including malformed values) are left untouched for manual review.
-- Conservative exclusion: an owner's paid checkout also protects their separate demo. A
-- checkout is tied to the demo by its id or its owner's email, never by company name: names
-- are not unique, so another account buying the same name must not exclude this demo.

-- @check
SELECT c.ad_client_id, c.name FROM ad_client c
WHERE c.ad_client_id = :client_id
  AND c.ad_client_id <> '0' AND c.isactive = 'Y'
  AND EXISTS (SELECT 1 FROM ad_user u WHERE u.ad_client_id = c.ad_client_id
              AND u.isactive = 'Y' AND u.em_etgo_is_owner = 'Y')
  AND NOT EXISTS (SELECT 1 FROM etgo_tenant_pool t WHERE t.pool_client_id = c.ad_client_id
                  AND t.isactive = 'Y' AND (upper(t.status) <> 'CLAIMED'
                       OR coalesce(t.error_message, '') ILIKE '%fixture%'))
  AND NOT EXISTS (SELECT 1 FROM ad_preference p WHERE (p.ad_client_id = c.ad_client_id
          OR (p.attribute = 'ETGO_TenantPlan' AND p.visibleat_client_id = c.ad_client_id))
      AND p.isactive = 'Y' AND p.attribute IN ('ETGO_TenantPlan', 'ETGO_EnvironmentType',
          'ETGO_DemoTrialStartedAt', 'ETGO_LegacyTransitionStartedAt',
          'ETGO_AssociatedProductiveClientId', 'ETGO_SubscriptionStatus',
          'ETGO_SubscriptionDueAt', 'ETGO_SubscriptionEventAt', 'ETGO_AssociatedDemoClientId')
      AND (p.ad_user_id IS NOT NULL OR p.ad_window_id IS NOT NULL
           OR p.visibleat_role_id IS NOT NULL OR p.ispropertylist <> 'N'
           OR (p.attribute='ETGO_TenantPlan' AND (p.ad_client_id NOT IN ('0',c.ad_client_id) OR p.visibleat_client_id IS DISTINCT FROM c.ad_client_id))
           OR (p.attribute<>'ETGO_TenantPlan' AND p.visibleat_client_id IS NOT NULL AND p.visibleat_client_id<>c.ad_client_id)))
  AND NOT EXISTS (SELECT 1 FROM ad_preference p WHERE (p.ad_client_id = c.ad_client_id
          OR (p.attribute = 'ETGO_TenantPlan' AND p.visibleat_client_id = c.ad_client_id))
      AND p.isactive = 'Y' AND p.attribute IN ('ETGO_TenantPlan', 'ETGO_EnvironmentType',
          'ETGO_DemoTrialStartedAt', 'ETGO_LegacyTransitionStartedAt',
          'ETGO_AssociatedProductiveClientId', 'ETGO_SubscriptionStatus',
          'ETGO_SubscriptionDueAt', 'ETGO_SubscriptionEventAt', 'ETGO_AssociatedDemoClientId')
      GROUP BY p.attribute HAVING count(*) > 1)
  AND NOT EXISTS (SELECT 1 FROM ad_preference p WHERE (p.ad_client_id = c.ad_client_id
          OR (p.attribute = 'ETGO_TenantPlan' AND p.visibleat_client_id = c.ad_client_id))
      AND p.isactive = 'Y'
      AND (p.attribute IN ('ETGO_DemoTrialStartedAt', 'ETGO_LegacyTransitionStartedAt',
                           'ETGO_SubscriptionStatus', 'ETGO_SubscriptionDueAt',
                           'ETGO_SubscriptionEventAt', 'ETGO_AssociatedDemoClientId')
           OR (p.attribute = 'ETGO_AssociatedProductiveClientId' AND trim(coalesce(p.value, '')) <> '')
           OR (p.attribute = 'ETGO_TenantPlan' AND upper(trim(coalesce(p.value, ''))) <> 'FREE')
           OR (p.attribute = 'ETGO_EnvironmentType' AND upper(trim(coalesce(p.value, ''))) <> 'DEMO')))
  AND NOT EXISTS (SELECT 1 FROM etgo_checkout_request q
      WHERE (q.created_client_id = c.ad_client_id OR q.demo_client_id = c.ad_client_id
          OR EXISTS (SELECT 1 FROM ad_user u WHERE u.ad_client_id = c.ad_client_id
              AND u.isactive = 'Y' AND u.em_etgo_is_owner = 'Y'
              AND lower(u.email) = lower(q.account_email)))
      AND (q.paid_at IS NOT NULL OR upper(q.checkout_status) IN ('PAID', 'PROVISIONING', 'PROVISIONED')
           OR q.stripe_subscription_id IS NOT NULL));

-- @apply
SET LOCAL lock_timeout = '5s';
-- Prevent claims, ownership/payment changes, and preference mutations during classification.
LOCK TABLE ad_client, ad_user, ad_preference, etgo_checkout_request, etgo_tenant_pool
  IN SHARE ROW EXCLUSIVE MODE;
DO $validation$
DECLARE
  transition_start text := current_setting('etendo_go.demo_transition_started_at', true);
BEGIN
  -- Tenant anchor remains explicit even inside the validation statement.
  PERFORM 1 FROM ad_client WHERE ad_client_id = :client_id;
  IF transition_start IS NULL OR transition_start !~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?Z$' THEN
    RAISE EXCEPTION 'Set explicit UTC etendo_go.demo_transition_started_at with PGOPTIONS before applying R41';
  END IF;
  PERFORM transition_start::timestamptz;
END
$validation$;

INSERT INTO ad_preference
    (ad_preference_id, ad_client_id, ad_org_id, isactive, created, createdby,
     updated, updatedby, attribute, value, ispropertylist, selected)
SELECT '@uuid_DemoLegacyTrial@', c.ad_client_id, '0', 'Y', now(), '0', now(), '0',
       'ETGO_LegacyTransitionStartedAt',
       current_setting('etendo_go.demo_transition_started_at'), 'N', 'Y'
FROM ad_client c
WHERE c.ad_client_id = :client_id
  AND c.ad_client_id <> '0' AND c.isactive = 'Y'
  AND EXISTS (SELECT 1 FROM ad_user u WHERE u.ad_client_id = c.ad_client_id
              AND u.isactive = 'Y' AND u.em_etgo_is_owner = 'Y')
  AND NOT EXISTS (SELECT 1 FROM etgo_tenant_pool t WHERE t.pool_client_id = c.ad_client_id
                  AND t.isactive = 'Y' AND (upper(t.status) <> 'CLAIMED'
                       OR coalesce(t.error_message, '') ILIKE '%fixture%'))
  AND NOT EXISTS (SELECT 1 FROM ad_preference p WHERE (p.ad_client_id = c.ad_client_id
          OR (p.attribute = 'ETGO_TenantPlan' AND p.visibleat_client_id = c.ad_client_id))
      AND p.isactive = 'Y' AND p.attribute IN ('ETGO_TenantPlan', 'ETGO_EnvironmentType',
          'ETGO_DemoTrialStartedAt', 'ETGO_LegacyTransitionStartedAt',
          'ETGO_AssociatedProductiveClientId', 'ETGO_SubscriptionStatus',
          'ETGO_SubscriptionDueAt', 'ETGO_SubscriptionEventAt', 'ETGO_AssociatedDemoClientId')
      AND (p.ad_user_id IS NOT NULL OR p.ad_window_id IS NOT NULL
           OR p.visibleat_role_id IS NOT NULL OR p.ispropertylist <> 'N'
           OR (p.attribute='ETGO_TenantPlan' AND (p.ad_client_id NOT IN ('0',c.ad_client_id) OR p.visibleat_client_id IS DISTINCT FROM c.ad_client_id))
           OR (p.attribute<>'ETGO_TenantPlan' AND p.visibleat_client_id IS NOT NULL AND p.visibleat_client_id<>c.ad_client_id)))
  AND NOT EXISTS (SELECT 1 FROM ad_preference p WHERE (p.ad_client_id = c.ad_client_id
          OR (p.attribute = 'ETGO_TenantPlan' AND p.visibleat_client_id = c.ad_client_id))
      AND p.isactive = 'Y' AND p.attribute IN ('ETGO_TenantPlan', 'ETGO_EnvironmentType',
          'ETGO_DemoTrialStartedAt', 'ETGO_LegacyTransitionStartedAt',
          'ETGO_AssociatedProductiveClientId', 'ETGO_SubscriptionStatus',
          'ETGO_SubscriptionDueAt', 'ETGO_SubscriptionEventAt', 'ETGO_AssociatedDemoClientId')
      GROUP BY p.attribute HAVING count(*) > 1)
  AND NOT EXISTS (SELECT 1 FROM ad_preference p WHERE (p.ad_client_id = c.ad_client_id
          OR (p.attribute = 'ETGO_TenantPlan' AND p.visibleat_client_id = c.ad_client_id))
      AND p.isactive = 'Y'
      AND (p.attribute IN ('ETGO_DemoTrialStartedAt', 'ETGO_LegacyTransitionStartedAt',
                           'ETGO_SubscriptionStatus', 'ETGO_SubscriptionDueAt',
                           'ETGO_SubscriptionEventAt', 'ETGO_AssociatedDemoClientId')
           OR (p.attribute = 'ETGO_AssociatedProductiveClientId' AND trim(coalesce(p.value, '')) <> '')
           OR (p.attribute = 'ETGO_TenantPlan' AND upper(trim(coalesce(p.value, ''))) <> 'FREE')
           OR (p.attribute = 'ETGO_EnvironmentType' AND upper(trim(coalesce(p.value, ''))) <> 'DEMO')))
  AND NOT EXISTS (SELECT 1 FROM etgo_checkout_request q
      WHERE (q.created_client_id = c.ad_client_id OR q.demo_client_id = c.ad_client_id
          OR EXISTS (SELECT 1 FROM ad_user u WHERE u.ad_client_id = c.ad_client_id
              AND u.isactive = 'Y' AND u.em_etgo_is_owner = 'Y'
              AND lower(u.email) = lower(q.account_email)))
      AND (q.paid_at IS NOT NULL OR upper(q.checkout_status) IN ('PAID', 'PROVISIONING', 'PROVISIONED')
           OR q.stripe_subscription_id IS NOT NULL));

-- @report
SELECT p.ad_client_id, p.ad_preference_id, p.attribute, p.value
FROM ad_preference p
WHERE p.ad_client_id = :client_id AND p.isactive = 'Y'
  AND p.attribute = 'ETGO_LegacyTransitionStartedAt';
