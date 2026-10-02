-- @id: R43-pool-claim-placeholder-names
-- @gap: Pooled tenant claim kept the POOL-<id> placeholder in derived names
-- @risk: low
-- @type: sql
-- @description: Replace the POOL-<pool row id> placeholder with the client name in the admin role, trees, ledger, chart of accounts and calendar of tenants claimed from the pool before ETP-5548.
-- Until ETP-5548 a pool claim renamed only the client, organization and admin user, so a claimed
-- tenant showed "POOL-<id> Admin" as its role and kept the placeholder in its ledger, chart of
-- accounts, calendar and 17 trees. Claims made since then rewrite these names themselves
-- (PooledTenantClaimService.renamePlaceholderDerivedNames); this fix applies the same rewrite to
-- the tenants claimed earlier. Same tables and column lengths as that method.
-- Scope: only a tenant whose pool row is CLAIMED and whose client no longer carries the
-- placeholder, i.e. a personalized tenant. A READY pooled tenant keeps its placeholder on
-- purpose. The placeholder is the exact pool row id, so no other text is ever matched.

-- @check
SELECT x.tbl, x.name
FROM (SELECT 'POOL-' || t.etgo_tenant_pool_id AS placeholder
      FROM etgo_tenant_pool t
      JOIN ad_client c ON c.ad_client_id = t.pool_client_id
      WHERE t.pool_client_id = :client_id
        AND upper(t.status) = 'CLAIMED'
        AND c.name <> 'POOL-' || t.etgo_tenant_pool_id) p
JOIN (SELECT 'ad_role' AS tbl, r.name, r.description FROM ad_role r
      WHERE r.ad_client_id = :client_id
      UNION ALL
      SELECT 'ad_tree', tr.name, tr.description FROM ad_tree tr
      WHERE tr.ad_client_id = :client_id
      UNION ALL
      SELECT 'c_acctschema', s.name, NULL FROM c_acctschema s
      WHERE s.ad_client_id = :client_id
      UNION ALL
      SELECT 'c_element', e.name, e.description FROM c_element e
      WHERE e.ad_client_id = :client_id
      UNION ALL
      SELECT 'c_calendar', cal.name, NULL FROM c_calendar cal
      WHERE cal.ad_client_id = :client_id) x
  ON strpos(x.name, p.placeholder) > 0
  OR strpos(coalesce(x.description, ''), p.placeholder) > 0;

-- @apply
UPDATE ad_role r
SET name = left(replace(r.name, p.placeholder, '@name_client@'), 60),
    description = left(replace(r.description, p.placeholder, '@name_client@'), 255),
    updated = now()
FROM (SELECT 'POOL-' || t.etgo_tenant_pool_id AS placeholder
      FROM etgo_tenant_pool t
      JOIN ad_client c ON c.ad_client_id = t.pool_client_id
      WHERE t.pool_client_id = :client_id
        AND upper(t.status) = 'CLAIMED'
        AND c.name <> 'POOL-' || t.etgo_tenant_pool_id) p
WHERE r.ad_client_id = :client_id
  AND (strpos(r.name, p.placeholder) > 0
       OR strpos(coalesce(r.description, ''), p.placeholder) > 0);

UPDATE ad_tree tr
SET name = left(replace(tr.name, p.placeholder, '@name_client@'), 255),
    description = left(replace(tr.description, p.placeholder, '@name_client@'), 255),
    updated = now()
FROM (SELECT 'POOL-' || t.etgo_tenant_pool_id AS placeholder
      FROM etgo_tenant_pool t
      JOIN ad_client c ON c.ad_client_id = t.pool_client_id
      WHERE t.pool_client_id = :client_id
        AND upper(t.status) = 'CLAIMED'
        AND c.name <> 'POOL-' || t.etgo_tenant_pool_id) p
WHERE tr.ad_client_id = :client_id
  AND (strpos(tr.name, p.placeholder) > 0
       OR strpos(coalesce(tr.description, ''), p.placeholder) > 0);

UPDATE c_acctschema s
SET name = left(replace(s.name, p.placeholder, '@name_client@'), 60),
    updated = now()
FROM (SELECT 'POOL-' || t.etgo_tenant_pool_id AS placeholder
      FROM etgo_tenant_pool t
      JOIN ad_client c ON c.ad_client_id = t.pool_client_id
      WHERE t.pool_client_id = :client_id
        AND upper(t.status) = 'CLAIMED'
        AND c.name <> 'POOL-' || t.etgo_tenant_pool_id) p
WHERE s.ad_client_id = :client_id
  AND strpos(s.name, p.placeholder) > 0;

UPDATE c_element e
SET name = left(replace(e.name, p.placeholder, '@name_client@'), 60),
    description = left(replace(e.description, p.placeholder, '@name_client@'), 255),
    updated = now()
FROM (SELECT 'POOL-' || t.etgo_tenant_pool_id AS placeholder
      FROM etgo_tenant_pool t
      JOIN ad_client c ON c.ad_client_id = t.pool_client_id
      WHERE t.pool_client_id = :client_id
        AND upper(t.status) = 'CLAIMED'
        AND c.name <> 'POOL-' || t.etgo_tenant_pool_id) p
WHERE e.ad_client_id = :client_id
  AND (strpos(e.name, p.placeholder) > 0
       OR strpos(coalesce(e.description, ''), p.placeholder) > 0);

UPDATE c_calendar cal
SET name = left(replace(cal.name, p.placeholder, '@name_client@'), 60),
    updated = now()
FROM (SELECT 'POOL-' || t.etgo_tenant_pool_id AS placeholder
      FROM etgo_tenant_pool t
      JOIN ad_client c ON c.ad_client_id = t.pool_client_id
      WHERE t.pool_client_id = :client_id
        AND upper(t.status) = 'CLAIMED'
        AND c.name <> 'POOL-' || t.etgo_tenant_pool_id) p
WHERE cal.ad_client_id = :client_id
  AND strpos(cal.name, p.placeholder) > 0;
