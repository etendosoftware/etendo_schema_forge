-- @id: R42-paid-provisioning-commercial-metadata
-- @gap: Paid provisioning commercial metadata
-- @risk: medium
-- @type: sql
-- @description: Restore productive markers and fiscal defaults for directly linked paid provisioned owned clients.
-- Plan resolver uses VisibleAtClient; lifecycle resolver uses the row's own AD_Client_ID.
-- Normalize compatible free/productive or DEMO/PRODUCTIVE duplicates without deleting IDs.
-- Preserve trial/subscription dates, billing state, payments and owners; never invent CURRENT.
-- Fiscal reversal mirrors existing R32: restore config flags then delete only tenant overrides.
-- Closed/unknown subscription states, reversed checkouts and targeted preference scopes require review.

-- @check
SELECT c.ad_client_id,c.name FROM ad_client c WHERE c.ad_client_id = :client_id AND c.ad_client_id <> '0' AND c.isactive = 'Y'
  AND EXISTS (SELECT 1 FROM ad_user u WHERE u.ad_client_id=c.ad_client_id AND u.isactive='Y' AND u.em_etgo_is_owner='Y')
  AND EXISTS (SELECT 1 FROM etgo_checkout_request q WHERE q.created_client_id=c.ad_client_id AND upper(q.checkout_status)='PROVISIONED' AND q.paid_at IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM etgo_checkout_request q WHERE q.created_client_id=c.ad_client_id AND upper(q.checkout_status) IN ('REFUNDED','CANCELED','CANCELLED','EXPIRED'))
  AND NOT EXISTS (SELECT 1 FROM etgo_tenant_pool t WHERE t.pool_client_id=c.ad_client_id AND t.isactive='Y' AND (upper(t.status)<>'CLAIMED' OR coalesce(t.error_message,'') ILIKE '%fixture%'))
  AND NOT EXISTS (SELECT 1 FROM ad_preference p WHERE p.isactive='Y'
    AND ((p.attribute='ETGO_TenantPlan' AND (p.visibleat_client_id=c.ad_client_id OR p.ad_client_id=c.ad_client_id)) OR (p.attribute='ETGO_EnvironmentType' AND p.ad_client_id=c.ad_client_id))
    AND (p.ad_user_id IS NOT NULL OR p.ad_window_id IS NOT NULL OR p.visibleat_role_id IS NOT NULL OR p.ispropertylist<>'N'
      OR (p.attribute='ETGO_TenantPlan' AND (p.ad_client_id NOT IN ('0',c.ad_client_id) OR p.visibleat_client_id IS DISTINCT FROM c.ad_client_id OR lower(trim(coalesce(p.value,''))) NOT IN ('free','productive')))
      OR (p.attribute='ETGO_EnvironmentType' AND ((p.visibleat_client_id IS NOT NULL AND p.visibleat_client_id<>c.ad_client_id) OR upper(trim(coalesce(p.value,''))) NOT IN ('DEMO','PRODUCTIVE')))))
  AND NOT EXISTS (SELECT 1 FROM ad_preference p WHERE p.ad_client_id=c.ad_client_id AND p.isactive='Y'
    AND ((p.attribute='ETGO_AssociatedProductiveClientId' AND trim(coalesce(p.value,''))<>'' AND trim(p.value)<>c.ad_client_id)
      OR (p.attribute='ETGO_SubscriptionStatus' AND upper(trim(coalesce(p.value,''))) NOT IN ('CURRENT','LEGACY_ENTITLEMENT','PAST_DUE'))))
  AND NOT EXISTS (SELECT 1 FROM ad_preference fp WHERE fp.ad_client_id=c.ad_client_id
    AND fp.property='ETSG_ForceTestMode' AND (fp.ad_user_id IS NOT NULL OR fp.ad_window_id IS NOT NULL
      OR fp.visibleat_role_id IS NOT NULL OR (fp.visibleat_client_id IS NOT NULL AND fp.visibleat_client_id<>c.ad_client_id)))
  AND (EXISTS (SELECT 1 FROM ad_preference p WHERE p.visibleat_client_id=c.ad_client_id AND p.isactive='Y' AND p.attribute='ETGO_TenantPlan' AND trim(coalesce(p.value,''))<>'productive')
    OR NOT EXISTS (SELECT 1 FROM ad_preference p WHERE p.visibleat_client_id=c.ad_client_id AND p.isactive='Y' AND p.attribute='ETGO_TenantPlan')
    OR EXISTS (SELECT 1 FROM ad_preference p WHERE p.ad_client_id=c.ad_client_id AND p.isactive='Y' AND p.attribute='ETGO_EnvironmentType' AND trim(coalesce(p.value,''))<>'PRODUCTIVE')
    OR NOT EXISTS (SELECT 1 FROM ad_preference p WHERE p.ad_client_id=c.ad_client_id AND p.isactive='Y' AND p.attribute='ETGO_EnvironmentType')
    OR EXISTS (SELECT 1 FROM ad_preference fp WHERE fp.ad_client_id=c.ad_client_id AND fp.property='ETSG_ForceTestMode')
    OR EXISTS (SELECT 1 FROM etvfac_verifactu_config v WHERE v.ad_client_id=c.ad_client_id AND v.isactive='Y' AND v.is_dev_env='Y')
    OR EXISTS (SELECT 1 FROM aeatsii_config a WHERE a.ad_client_id=c.ad_client_id AND a.isactive='Y' AND a.produccion='N')
    OR EXISTS (SELECT 1 FROM tbai_config t WHERE t.ad_client_id=c.ad_client_id AND t.isactive='Y' AND t.production_env='N'));

-- @apply
SET LOCAL lock_timeout='5s';
LOCK TABLE ad_client,ad_user,ad_preference,etgo_checkout_request,etgo_tenant_pool IN SHARE ROW EXCLUSIVE MODE;

UPDATE ad_preference target SET value='productive',updated=now(),updatedby='0'
FROM ad_client c WHERE c.ad_client_id = :client_id AND c.ad_client_id <> '0' AND c.isactive = 'Y'
  AND EXISTS (SELECT 1 FROM ad_user u WHERE u.ad_client_id=c.ad_client_id AND u.isactive='Y' AND u.em_etgo_is_owner='Y')
  AND EXISTS (SELECT 1 FROM etgo_checkout_request q WHERE q.created_client_id=c.ad_client_id AND upper(q.checkout_status)='PROVISIONED' AND q.paid_at IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM etgo_checkout_request q WHERE q.created_client_id=c.ad_client_id AND upper(q.checkout_status) IN ('REFUNDED','CANCELED','CANCELLED','EXPIRED'))
  AND NOT EXISTS (SELECT 1 FROM etgo_tenant_pool t WHERE t.pool_client_id=c.ad_client_id AND t.isactive='Y' AND (upper(t.status)<>'CLAIMED' OR coalesce(t.error_message,'') ILIKE '%fixture%'))
  AND NOT EXISTS (SELECT 1 FROM ad_preference p WHERE p.isactive='Y'
    AND ((p.attribute='ETGO_TenantPlan' AND (p.visibleat_client_id=c.ad_client_id OR p.ad_client_id=c.ad_client_id)) OR (p.attribute='ETGO_EnvironmentType' AND p.ad_client_id=c.ad_client_id))
    AND (p.ad_user_id IS NOT NULL OR p.ad_window_id IS NOT NULL OR p.visibleat_role_id IS NOT NULL OR p.ispropertylist<>'N'
      OR (p.attribute='ETGO_TenantPlan' AND (p.ad_client_id NOT IN ('0',c.ad_client_id) OR p.visibleat_client_id IS DISTINCT FROM c.ad_client_id OR lower(trim(coalesce(p.value,''))) NOT IN ('free','productive')))
      OR (p.attribute='ETGO_EnvironmentType' AND ((p.visibleat_client_id IS NOT NULL AND p.visibleat_client_id<>c.ad_client_id) OR upper(trim(coalesce(p.value,''))) NOT IN ('DEMO','PRODUCTIVE')))))
  AND NOT EXISTS (SELECT 1 FROM ad_preference p WHERE p.ad_client_id=c.ad_client_id AND p.isactive='Y'
    AND ((p.attribute='ETGO_AssociatedProductiveClientId' AND trim(coalesce(p.value,''))<>'' AND trim(p.value)<>c.ad_client_id)
      OR (p.attribute='ETGO_SubscriptionStatus' AND upper(trim(coalesce(p.value,''))) NOT IN ('CURRENT','LEGACY_ENTITLEMENT','PAST_DUE'))))
  AND NOT EXISTS (SELECT 1 FROM ad_preference fp WHERE fp.ad_client_id=c.ad_client_id
    AND fp.property='ETSG_ForceTestMode' AND (fp.ad_user_id IS NOT NULL OR fp.ad_window_id IS NOT NULL
      OR fp.visibleat_role_id IS NOT NULL OR (fp.visibleat_client_id IS NOT NULL AND fp.visibleat_client_id<>c.ad_client_id)))
  AND target.ad_client_id IN ('0',c.ad_client_id) AND target.visibleat_client_id=c.ad_client_id AND target.isactive='Y' AND target.attribute='ETGO_TenantPlan'
  AND trim(coalesce(target.value,'')) IS DISTINCT FROM 'productive';

INSERT INTO ad_preference(ad_preference_id,ad_client_id,ad_org_id,isactive,created,createdby,updated,updatedby,attribute,value,ispropertylist,selected,visibleat_client_id)
SELECT '@uuid_PaidProductivePlan@','0','0','Y',now(),'0',now(),'0','ETGO_TenantPlan','productive','N','Y',c.ad_client_id
FROM ad_client c WHERE c.ad_client_id = :client_id AND c.ad_client_id <> '0' AND c.isactive = 'Y'
  AND EXISTS (SELECT 1 FROM ad_user u WHERE u.ad_client_id=c.ad_client_id AND u.isactive='Y' AND u.em_etgo_is_owner='Y')
  AND EXISTS (SELECT 1 FROM etgo_checkout_request q WHERE q.created_client_id=c.ad_client_id AND upper(q.checkout_status)='PROVISIONED' AND q.paid_at IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM etgo_checkout_request q WHERE q.created_client_id=c.ad_client_id AND upper(q.checkout_status) IN ('REFUNDED','CANCELED','CANCELLED','EXPIRED'))
  AND NOT EXISTS (SELECT 1 FROM etgo_tenant_pool t WHERE t.pool_client_id=c.ad_client_id AND t.isactive='Y' AND (upper(t.status)<>'CLAIMED' OR coalesce(t.error_message,'') ILIKE '%fixture%'))
  AND NOT EXISTS (SELECT 1 FROM ad_preference p WHERE p.isactive='Y'
    AND ((p.attribute='ETGO_TenantPlan' AND (p.visibleat_client_id=c.ad_client_id OR p.ad_client_id=c.ad_client_id)) OR (p.attribute='ETGO_EnvironmentType' AND p.ad_client_id=c.ad_client_id))
    AND (p.ad_user_id IS NOT NULL OR p.ad_window_id IS NOT NULL OR p.visibleat_role_id IS NOT NULL OR p.ispropertylist<>'N'
      OR (p.attribute='ETGO_TenantPlan' AND (p.ad_client_id NOT IN ('0',c.ad_client_id) OR p.visibleat_client_id IS DISTINCT FROM c.ad_client_id OR lower(trim(coalesce(p.value,''))) NOT IN ('free','productive')))
      OR (p.attribute='ETGO_EnvironmentType' AND ((p.visibleat_client_id IS NOT NULL AND p.visibleat_client_id<>c.ad_client_id) OR upper(trim(coalesce(p.value,''))) NOT IN ('DEMO','PRODUCTIVE')))))
  AND NOT EXISTS (SELECT 1 FROM ad_preference p WHERE p.ad_client_id=c.ad_client_id AND p.isactive='Y'
    AND ((p.attribute='ETGO_AssociatedProductiveClientId' AND trim(coalesce(p.value,''))<>'' AND trim(p.value)<>c.ad_client_id)
      OR (p.attribute='ETGO_SubscriptionStatus' AND upper(trim(coalesce(p.value,''))) NOT IN ('CURRENT','LEGACY_ENTITLEMENT','PAST_DUE'))))
  AND NOT EXISTS (SELECT 1 FROM ad_preference fp WHERE fp.ad_client_id=c.ad_client_id
    AND fp.property='ETSG_ForceTestMode' AND (fp.ad_user_id IS NOT NULL OR fp.ad_window_id IS NOT NULL
      OR fp.visibleat_role_id IS NOT NULL OR (fp.visibleat_client_id IS NOT NULL AND fp.visibleat_client_id<>c.ad_client_id)))
  AND NOT EXISTS(SELECT 1 FROM ad_preference existing WHERE existing.visibleat_client_id=c.ad_client_id AND existing.attribute='ETGO_TenantPlan' AND existing.isactive='Y');

UPDATE ad_preference target SET value='PRODUCTIVE',updated=now(),updatedby='0'
FROM ad_client c WHERE c.ad_client_id = :client_id AND c.ad_client_id <> '0' AND c.isactive = 'Y'
  AND EXISTS (SELECT 1 FROM ad_user u WHERE u.ad_client_id=c.ad_client_id AND u.isactive='Y' AND u.em_etgo_is_owner='Y')
  AND EXISTS (SELECT 1 FROM etgo_checkout_request q WHERE q.created_client_id=c.ad_client_id AND upper(q.checkout_status)='PROVISIONED' AND q.paid_at IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM etgo_checkout_request q WHERE q.created_client_id=c.ad_client_id AND upper(q.checkout_status) IN ('REFUNDED','CANCELED','CANCELLED','EXPIRED'))
  AND NOT EXISTS (SELECT 1 FROM etgo_tenant_pool t WHERE t.pool_client_id=c.ad_client_id AND t.isactive='Y' AND (upper(t.status)<>'CLAIMED' OR coalesce(t.error_message,'') ILIKE '%fixture%'))
  AND NOT EXISTS (SELECT 1 FROM ad_preference p WHERE p.isactive='Y'
    AND ((p.attribute='ETGO_TenantPlan' AND (p.visibleat_client_id=c.ad_client_id OR p.ad_client_id=c.ad_client_id)) OR (p.attribute='ETGO_EnvironmentType' AND p.ad_client_id=c.ad_client_id))
    AND (p.ad_user_id IS NOT NULL OR p.ad_window_id IS NOT NULL OR p.visibleat_role_id IS NOT NULL OR p.ispropertylist<>'N'
      OR (p.attribute='ETGO_TenantPlan' AND (p.ad_client_id NOT IN ('0',c.ad_client_id) OR p.visibleat_client_id IS DISTINCT FROM c.ad_client_id OR lower(trim(coalesce(p.value,''))) NOT IN ('free','productive')))
      OR (p.attribute='ETGO_EnvironmentType' AND ((p.visibleat_client_id IS NOT NULL AND p.visibleat_client_id<>c.ad_client_id) OR upper(trim(coalesce(p.value,''))) NOT IN ('DEMO','PRODUCTIVE')))))
  AND NOT EXISTS (SELECT 1 FROM ad_preference p WHERE p.ad_client_id=c.ad_client_id AND p.isactive='Y'
    AND ((p.attribute='ETGO_AssociatedProductiveClientId' AND trim(coalesce(p.value,''))<>'' AND trim(p.value)<>c.ad_client_id)
      OR (p.attribute='ETGO_SubscriptionStatus' AND upper(trim(coalesce(p.value,''))) NOT IN ('CURRENT','LEGACY_ENTITLEMENT','PAST_DUE'))))
  AND NOT EXISTS (SELECT 1 FROM ad_preference fp WHERE fp.ad_client_id=c.ad_client_id
    AND fp.property='ETSG_ForceTestMode' AND (fp.ad_user_id IS NOT NULL OR fp.ad_window_id IS NOT NULL
      OR fp.visibleat_role_id IS NOT NULL OR (fp.visibleat_client_id IS NOT NULL AND fp.visibleat_client_id<>c.ad_client_id)))
  AND target.ad_client_id=c.ad_client_id AND target.isactive='Y' AND target.attribute='ETGO_EnvironmentType'
  AND trim(coalesce(target.value,'')) IS DISTINCT FROM 'PRODUCTIVE';

INSERT INTO ad_preference(ad_preference_id,ad_client_id,ad_org_id,isactive,created,createdby,updated,updatedby,attribute,value,ispropertylist,selected,visibleat_client_id)
SELECT '@uuid_PaidProductiveType@',c.ad_client_id,'0','Y',now(),'0',now(),'0','ETGO_EnvironmentType','PRODUCTIVE','N','Y',NULL
FROM ad_client c WHERE c.ad_client_id = :client_id AND c.ad_client_id <> '0' AND c.isactive = 'Y'
  AND EXISTS (SELECT 1 FROM ad_user u WHERE u.ad_client_id=c.ad_client_id AND u.isactive='Y' AND u.em_etgo_is_owner='Y')
  AND EXISTS (SELECT 1 FROM etgo_checkout_request q WHERE q.created_client_id=c.ad_client_id AND upper(q.checkout_status)='PROVISIONED' AND q.paid_at IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM etgo_checkout_request q WHERE q.created_client_id=c.ad_client_id AND upper(q.checkout_status) IN ('REFUNDED','CANCELED','CANCELLED','EXPIRED'))
  AND NOT EXISTS (SELECT 1 FROM etgo_tenant_pool t WHERE t.pool_client_id=c.ad_client_id AND t.isactive='Y' AND (upper(t.status)<>'CLAIMED' OR coalesce(t.error_message,'') ILIKE '%fixture%'))
  AND NOT EXISTS (SELECT 1 FROM ad_preference p WHERE p.isactive='Y'
    AND ((p.attribute='ETGO_TenantPlan' AND (p.visibleat_client_id=c.ad_client_id OR p.ad_client_id=c.ad_client_id)) OR (p.attribute='ETGO_EnvironmentType' AND p.ad_client_id=c.ad_client_id))
    AND (p.ad_user_id IS NOT NULL OR p.ad_window_id IS NOT NULL OR p.visibleat_role_id IS NOT NULL OR p.ispropertylist<>'N'
      OR (p.attribute='ETGO_TenantPlan' AND (p.ad_client_id NOT IN ('0',c.ad_client_id) OR p.visibleat_client_id IS DISTINCT FROM c.ad_client_id OR lower(trim(coalesce(p.value,''))) NOT IN ('free','productive')))
      OR (p.attribute='ETGO_EnvironmentType' AND ((p.visibleat_client_id IS NOT NULL AND p.visibleat_client_id<>c.ad_client_id) OR upper(trim(coalesce(p.value,''))) NOT IN ('DEMO','PRODUCTIVE')))))
  AND NOT EXISTS (SELECT 1 FROM ad_preference p WHERE p.ad_client_id=c.ad_client_id AND p.isactive='Y'
    AND ((p.attribute='ETGO_AssociatedProductiveClientId' AND trim(coalesce(p.value,''))<>'' AND trim(p.value)<>c.ad_client_id)
      OR (p.attribute='ETGO_SubscriptionStatus' AND upper(trim(coalesce(p.value,''))) NOT IN ('CURRENT','LEGACY_ENTITLEMENT','PAST_DUE'))))
  AND NOT EXISTS (SELECT 1 FROM ad_preference fp WHERE fp.ad_client_id=c.ad_client_id
    AND fp.property='ETSG_ForceTestMode' AND (fp.ad_user_id IS NOT NULL OR fp.ad_window_id IS NOT NULL
      OR fp.visibleat_role_id IS NOT NULL OR (fp.visibleat_client_id IS NOT NULL AND fp.visibleat_client_id<>c.ad_client_id)))
  AND NOT EXISTS(SELECT 1 FROM ad_preference existing WHERE existing.ad_client_id=c.ad_client_id AND existing.attribute='ETGO_EnvironmentType' AND existing.isactive='Y');

UPDATE etvfac_verifactu_config target SET is_dev_env='N',updated=now(),updatedby='0'
FROM ad_client c WHERE c.ad_client_id = :client_id AND c.ad_client_id <> '0' AND c.isactive = 'Y'
  AND EXISTS (SELECT 1 FROM ad_user u WHERE u.ad_client_id=c.ad_client_id AND u.isactive='Y' AND u.em_etgo_is_owner='Y')
  AND EXISTS (SELECT 1 FROM etgo_checkout_request q WHERE q.created_client_id=c.ad_client_id AND upper(q.checkout_status)='PROVISIONED' AND q.paid_at IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM etgo_checkout_request q WHERE q.created_client_id=c.ad_client_id AND upper(q.checkout_status) IN ('REFUNDED','CANCELED','CANCELLED','EXPIRED'))
  AND NOT EXISTS (SELECT 1 FROM etgo_tenant_pool t WHERE t.pool_client_id=c.ad_client_id AND t.isactive='Y' AND (upper(t.status)<>'CLAIMED' OR coalesce(t.error_message,'') ILIKE '%fixture%'))
  AND NOT EXISTS (SELECT 1 FROM ad_preference p WHERE p.isactive='Y'
    AND ((p.attribute='ETGO_TenantPlan' AND (p.visibleat_client_id=c.ad_client_id OR p.ad_client_id=c.ad_client_id)) OR (p.attribute='ETGO_EnvironmentType' AND p.ad_client_id=c.ad_client_id))
    AND (p.ad_user_id IS NOT NULL OR p.ad_window_id IS NOT NULL OR p.visibleat_role_id IS NOT NULL OR p.ispropertylist<>'N'
      OR (p.attribute='ETGO_TenantPlan' AND (p.ad_client_id NOT IN ('0',c.ad_client_id) OR p.visibleat_client_id IS DISTINCT FROM c.ad_client_id OR lower(trim(coalesce(p.value,''))) NOT IN ('free','productive')))
      OR (p.attribute='ETGO_EnvironmentType' AND ((p.visibleat_client_id IS NOT NULL AND p.visibleat_client_id<>c.ad_client_id) OR upper(trim(coalesce(p.value,''))) NOT IN ('DEMO','PRODUCTIVE')))))
  AND NOT EXISTS (SELECT 1 FROM ad_preference p WHERE p.ad_client_id=c.ad_client_id AND p.isactive='Y'
    AND ((p.attribute='ETGO_AssociatedProductiveClientId' AND trim(coalesce(p.value,''))<>'' AND trim(p.value)<>c.ad_client_id)
      OR (p.attribute='ETGO_SubscriptionStatus' AND upper(trim(coalesce(p.value,''))) NOT IN ('CURRENT','LEGACY_ENTITLEMENT','PAST_DUE'))))
  AND NOT EXISTS (SELECT 1 FROM ad_preference fp WHERE fp.ad_client_id=c.ad_client_id
    AND fp.property='ETSG_ForceTestMode' AND (fp.ad_user_id IS NOT NULL OR fp.ad_window_id IS NOT NULL
      OR fp.visibleat_role_id IS NOT NULL OR (fp.visibleat_client_id IS NOT NULL AND fp.visibleat_client_id<>c.ad_client_id)))
  AND target.ad_client_id=c.ad_client_id AND target.isactive='Y' AND target.is_dev_env='Y';

UPDATE aeatsii_config target SET produccion='Y',updated=now(),updatedby='0'
FROM ad_client c WHERE c.ad_client_id = :client_id AND c.ad_client_id <> '0' AND c.isactive = 'Y'
  AND EXISTS (SELECT 1 FROM ad_user u WHERE u.ad_client_id=c.ad_client_id AND u.isactive='Y' AND u.em_etgo_is_owner='Y')
  AND EXISTS (SELECT 1 FROM etgo_checkout_request q WHERE q.created_client_id=c.ad_client_id AND upper(q.checkout_status)='PROVISIONED' AND q.paid_at IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM etgo_checkout_request q WHERE q.created_client_id=c.ad_client_id AND upper(q.checkout_status) IN ('REFUNDED','CANCELED','CANCELLED','EXPIRED'))
  AND NOT EXISTS (SELECT 1 FROM etgo_tenant_pool t WHERE t.pool_client_id=c.ad_client_id AND t.isactive='Y' AND (upper(t.status)<>'CLAIMED' OR coalesce(t.error_message,'') ILIKE '%fixture%'))
  AND NOT EXISTS (SELECT 1 FROM ad_preference p WHERE p.isactive='Y'
    AND ((p.attribute='ETGO_TenantPlan' AND (p.visibleat_client_id=c.ad_client_id OR p.ad_client_id=c.ad_client_id)) OR (p.attribute='ETGO_EnvironmentType' AND p.ad_client_id=c.ad_client_id))
    AND (p.ad_user_id IS NOT NULL OR p.ad_window_id IS NOT NULL OR p.visibleat_role_id IS NOT NULL OR p.ispropertylist<>'N'
      OR (p.attribute='ETGO_TenantPlan' AND (p.ad_client_id NOT IN ('0',c.ad_client_id) OR p.visibleat_client_id IS DISTINCT FROM c.ad_client_id OR lower(trim(coalesce(p.value,''))) NOT IN ('free','productive')))
      OR (p.attribute='ETGO_EnvironmentType' AND ((p.visibleat_client_id IS NOT NULL AND p.visibleat_client_id<>c.ad_client_id) OR upper(trim(coalesce(p.value,''))) NOT IN ('DEMO','PRODUCTIVE')))))
  AND NOT EXISTS (SELECT 1 FROM ad_preference p WHERE p.ad_client_id=c.ad_client_id AND p.isactive='Y'
    AND ((p.attribute='ETGO_AssociatedProductiveClientId' AND trim(coalesce(p.value,''))<>'' AND trim(p.value)<>c.ad_client_id)
      OR (p.attribute='ETGO_SubscriptionStatus' AND upper(trim(coalesce(p.value,''))) NOT IN ('CURRENT','LEGACY_ENTITLEMENT','PAST_DUE'))))
  AND NOT EXISTS (SELECT 1 FROM ad_preference fp WHERE fp.ad_client_id=c.ad_client_id
    AND fp.property='ETSG_ForceTestMode' AND (fp.ad_user_id IS NOT NULL OR fp.ad_window_id IS NOT NULL
      OR fp.visibleat_role_id IS NOT NULL OR (fp.visibleat_client_id IS NOT NULL AND fp.visibleat_client_id<>c.ad_client_id)))
  AND target.ad_client_id=c.ad_client_id AND target.isactive='Y' AND target.produccion='N';

UPDATE tbai_config target SET production_env='Y',updated=now(),updatedby='0'
FROM ad_client c WHERE c.ad_client_id = :client_id AND c.ad_client_id <> '0' AND c.isactive = 'Y'
  AND EXISTS (SELECT 1 FROM ad_user u WHERE u.ad_client_id=c.ad_client_id AND u.isactive='Y' AND u.em_etgo_is_owner='Y')
  AND EXISTS (SELECT 1 FROM etgo_checkout_request q WHERE q.created_client_id=c.ad_client_id AND upper(q.checkout_status)='PROVISIONED' AND q.paid_at IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM etgo_checkout_request q WHERE q.created_client_id=c.ad_client_id AND upper(q.checkout_status) IN ('REFUNDED','CANCELED','CANCELLED','EXPIRED'))
  AND NOT EXISTS (SELECT 1 FROM etgo_tenant_pool t WHERE t.pool_client_id=c.ad_client_id AND t.isactive='Y' AND (upper(t.status)<>'CLAIMED' OR coalesce(t.error_message,'') ILIKE '%fixture%'))
  AND NOT EXISTS (SELECT 1 FROM ad_preference p WHERE p.isactive='Y'
    AND ((p.attribute='ETGO_TenantPlan' AND (p.visibleat_client_id=c.ad_client_id OR p.ad_client_id=c.ad_client_id)) OR (p.attribute='ETGO_EnvironmentType' AND p.ad_client_id=c.ad_client_id))
    AND (p.ad_user_id IS NOT NULL OR p.ad_window_id IS NOT NULL OR p.visibleat_role_id IS NOT NULL OR p.ispropertylist<>'N'
      OR (p.attribute='ETGO_TenantPlan' AND (p.ad_client_id NOT IN ('0',c.ad_client_id) OR p.visibleat_client_id IS DISTINCT FROM c.ad_client_id OR lower(trim(coalesce(p.value,''))) NOT IN ('free','productive')))
      OR (p.attribute='ETGO_EnvironmentType' AND ((p.visibleat_client_id IS NOT NULL AND p.visibleat_client_id<>c.ad_client_id) OR upper(trim(coalesce(p.value,''))) NOT IN ('DEMO','PRODUCTIVE')))))
  AND NOT EXISTS (SELECT 1 FROM ad_preference p WHERE p.ad_client_id=c.ad_client_id AND p.isactive='Y'
    AND ((p.attribute='ETGO_AssociatedProductiveClientId' AND trim(coalesce(p.value,''))<>'' AND trim(p.value)<>c.ad_client_id)
      OR (p.attribute='ETGO_SubscriptionStatus' AND upper(trim(coalesce(p.value,''))) NOT IN ('CURRENT','LEGACY_ENTITLEMENT','PAST_DUE'))))
  AND NOT EXISTS (SELECT 1 FROM ad_preference fp WHERE fp.ad_client_id=c.ad_client_id
    AND fp.property='ETSG_ForceTestMode' AND (fp.ad_user_id IS NOT NULL OR fp.ad_window_id IS NOT NULL
      OR fp.visibleat_role_id IS NOT NULL OR (fp.visibleat_client_id IS NOT NULL AND fp.visibleat_client_id<>c.ad_client_id)))
  AND target.ad_client_id=c.ad_client_id AND target.isactive='Y' AND target.production_env='N';

DELETE FROM ad_preference fp USING ad_client c WHERE c.ad_client_id = :client_id AND c.ad_client_id <> '0' AND c.isactive = 'Y'
  AND EXISTS (SELECT 1 FROM ad_user u WHERE u.ad_client_id=c.ad_client_id AND u.isactive='Y' AND u.em_etgo_is_owner='Y')
  AND EXISTS (SELECT 1 FROM etgo_checkout_request q WHERE q.created_client_id=c.ad_client_id AND upper(q.checkout_status)='PROVISIONED' AND q.paid_at IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM etgo_checkout_request q WHERE q.created_client_id=c.ad_client_id AND upper(q.checkout_status) IN ('REFUNDED','CANCELED','CANCELLED','EXPIRED'))
  AND NOT EXISTS (SELECT 1 FROM etgo_tenant_pool t WHERE t.pool_client_id=c.ad_client_id AND t.isactive='Y' AND (upper(t.status)<>'CLAIMED' OR coalesce(t.error_message,'') ILIKE '%fixture%'))
  AND NOT EXISTS (SELECT 1 FROM ad_preference p WHERE p.isactive='Y'
    AND ((p.attribute='ETGO_TenantPlan' AND (p.visibleat_client_id=c.ad_client_id OR p.ad_client_id=c.ad_client_id)) OR (p.attribute='ETGO_EnvironmentType' AND p.ad_client_id=c.ad_client_id))
    AND (p.ad_user_id IS NOT NULL OR p.ad_window_id IS NOT NULL OR p.visibleat_role_id IS NOT NULL OR p.ispropertylist<>'N'
      OR (p.attribute='ETGO_TenantPlan' AND (p.ad_client_id NOT IN ('0',c.ad_client_id) OR p.visibleat_client_id IS DISTINCT FROM c.ad_client_id OR lower(trim(coalesce(p.value,''))) NOT IN ('free','productive')))
      OR (p.attribute='ETGO_EnvironmentType' AND ((p.visibleat_client_id IS NOT NULL AND p.visibleat_client_id<>c.ad_client_id) OR upper(trim(coalesce(p.value,''))) NOT IN ('DEMO','PRODUCTIVE')))))
  AND NOT EXISTS (SELECT 1 FROM ad_preference p WHERE p.ad_client_id=c.ad_client_id AND p.isactive='Y'
    AND ((p.attribute='ETGO_AssociatedProductiveClientId' AND trim(coalesce(p.value,''))<>'' AND trim(p.value)<>c.ad_client_id)
      OR (p.attribute='ETGO_SubscriptionStatus' AND upper(trim(coalesce(p.value,''))) NOT IN ('CURRENT','LEGACY_ENTITLEMENT','PAST_DUE'))))
  AND NOT EXISTS (SELECT 1 FROM ad_preference fp WHERE fp.ad_client_id=c.ad_client_id
    AND fp.property='ETSG_ForceTestMode' AND (fp.ad_user_id IS NOT NULL OR fp.ad_window_id IS NOT NULL
      OR fp.visibleat_role_id IS NOT NULL OR (fp.visibleat_client_id IS NOT NULL AND fp.visibleat_client_id<>c.ad_client_id)))
  AND fp.ad_client_id=c.ad_client_id AND fp.property='ETSG_ForceTestMode';

-- @report
SELECT p.ad_preference_id,p.ad_client_id,p.visibleat_client_id,p.attribute,p.value
FROM ad_preference p JOIN ad_client c ON c.ad_client_id=:client_id
WHERE p.isactive='Y' AND ((p.attribute='ETGO_TenantPlan' AND p.visibleat_client_id=c.ad_client_id) OR (p.attribute='ETGO_EnvironmentType' AND p.ad_client_id=c.ad_client_id)) ORDER BY p.attribute,p.ad_preference_id;
