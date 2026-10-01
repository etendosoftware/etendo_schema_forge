-- @id: R41-personal-role-owner-backfill
-- @gap: ETP-5502
-- @risk: low
-- @type: sql
-- @description: Backfill AD_Role.EM_ETGO_Personal_Owner_ID on existing personal roles whose owner is unambiguous, so demoting an Admin restores their own role, never a namesake's -- ETP-5502
--   Only the first line of @description reaches the ledger.
--
-- Background (ETP-5502)
-- --------------------------------------------------------------------------------------------
-- Promoting a user to Admin unassigns their personal composition role ("Personal – <name>")
-- but keeps it, dormant. Demoting them restores it. Until ETP-5502 the restore looked the role
-- up BY NAME and accepted it when it had zero AD_User_Roles rows — exactly what a DELETED
-- user's orphan role looks like. So a second "Juan Pérez" got the deleted Juan's permissions,
-- and a user whose role carried a " (2)" suffix, or who was renamed, got a new empty role.
--
-- com.etendoerp.go now records the owner on every personal role it creates
-- (AD_Role.EM_ETGO_Personal_Owner_ID, a foreign key to AD_User with ON DELETE SET NULL, set once) and
-- demote restores by owner. Roles created before that have a NULL owner. The runtime still
-- handles them — a hardened name fallback that skips roles older than the user and records the
-- owner it finds (self-heal) — but this fix attributes every role whose owner is provable now.
--
-- What counts as a personal role
-- --------------------------------------------------------------------------------------------
-- name LIKE 'Personal – %' (en dash, the prefix PersonalRoleAccessProvisioningService builds),
-- not a template, not client-admin, owner still NULL. Legacy hyphen-named roles
-- ("Personal - X") are not personal composition roles and are left alone.
--
-- Attribution rules — unambiguous cases only, applied in this order
-- --------------------------------------------------------------------------------------------
--   1. The role has exactly ONE AD_User_Roles row → that row's user (the person using it).
--   2. No rows, and exactly ONE AD_User of the tenant has it as Default_Ad_Role_ID → that user.
--   3. No rows, no default user (dormant: its user was promoted to Admin) → the SINGLE user of
--      the tenant who
--        a. holds the client-admin role now (Default_Ad_Role_ID is client-admin),
--        b. has a name the role name is built from (rule below), and
--        c. was created on or before the role (a personal role is always created after its
--           user; an older role belonged to someone else).
--      Zero or several candidates → left NULL.
-- Anything else — typically the orphan of a DELETED user — stays NULL. The runtime rejects
-- those (they are older than any namesake created later), and a follow-up task will deactivate
-- them on user delete.
--
-- Name rule (mirrors PersonalRoleAccessProvisioningService — keep in lockstep)
-- --------------------------------------------------------------------------------------------
--   base      = TRIM(name), else TRIM(username), else ad_user_id  (empty counts as missing)
--   n = 1     : LEFT('Personal – ' || base, 60)
--   n >= 2    : LEFT('Personal – ' || base, 60 - LENGTH(' (n)')) || ' (n)'
-- The role matches when its name equals the n = 1 form, or ends in " (n)" with n >= 2 and
-- equals that n-th form. Known limit: a 57-character legacy name built by the old
-- suffix-then-truncate code ("… (2", closing parenthesis cut off) does not match rule 3; rules
-- 1 and 2 still attribute it whenever it is assigned.
--
-- Run order
-- --------------------------------------------------------------------------------------------
-- Needs the column, i.e. com.etendoerp.go with ETP-5502 deployed and update.database run. On a
-- tenant without it the @check fails loudly and the runner records FAILED; nothing changes.
--
-- Idempotency
-- --------------------------------------------------------------------------------------------
-- Every statement touches only rows with em_etgo_personal_owner_id IS NULL, and @check only
-- returns rows a rule can still attribute, so a re-run is SKIPPED_NOT_NEEDED.

-- @check
WITH pr AS (
  SELECT r.ad_role_id, r.name, r.created,
         (SELECT COUNT(*) FROM ad_user_roles ur WHERE ur.ad_role_id = r.ad_role_id) AS n_rows,
         (SELECT COUNT(*) FROM ad_user du
           WHERE du.ad_client_id = :client_id AND du.default_ad_role_id = r.ad_role_id) AS n_default
  FROM ad_role r
  WHERE r.ad_client_id = :client_id
    AND r.name LIKE 'Personal – %'
    AND r.istemplate = 'N'
    AND r.is_client_admin = 'N'
    AND r.em_etgo_personal_owner_id IS NULL
),
admins AS (
  SELECT u.ad_user_id, u.created,
         'Personal – ' || COALESCE(NULLIF(TRIM(u.name), ''), NULLIF(TRIM(u.username), ''),
                                   u.ad_user_id) AS full_name
  FROM ad_user u
  JOIN ad_role ar ON ar.ad_role_id = u.default_ad_role_id
  WHERE u.ad_client_id = :client_id
    AND ar.is_client_admin = 'Y'
),
dormant_matches AS (
  SELECT pr.ad_role_id, a.ad_user_id
  FROM pr
  JOIN admins a
    ON a.created <= pr.created
   AND (pr.name = LEFT(a.full_name, 60)
        OR (SUBSTRING(pr.name FROM ' \(([1-9][0-9]{0,8})\)$') IS NOT NULL
            AND SUBSTRING(pr.name FROM ' \(([1-9][0-9]{0,8})\)$') <> '1'
            AND pr.name = LEFT(a.full_name,
                               60 - LENGTH(' (' || SUBSTRING(pr.name FROM ' \(([1-9][0-9]{0,8})\)$') || ')'))
                          || ' (' || SUBSTRING(pr.name FROM ' \(([1-9][0-9]{0,8})\)$') || ')'))
  WHERE pr.n_rows = 0 AND pr.n_default = 0
)
SELECT pr.ad_role_id FROM pr WHERE pr.n_rows = 1
UNION ALL
SELECT pr.ad_role_id FROM pr WHERE pr.n_rows = 0 AND pr.n_default = 1
UNION ALL
SELECT dm.ad_role_id FROM dormant_matches dm GROUP BY dm.ad_role_id HAVING COUNT(*) = 1;

-- @apply
-- Rule 1: exactly one AD_User_Roles row.
UPDATE ad_role r
SET em_etgo_personal_owner_id = (SELECT ur.ad_user_id FROM ad_user_roles ur
                                  WHERE ur.ad_role_id = r.ad_role_id),
    updated = now(), updatedby = '0'
WHERE r.ad_client_id = :client_id
  AND r.name LIKE 'Personal – %'
  AND r.istemplate = 'N'
  AND r.is_client_admin = 'N'
  AND r.em_etgo_personal_owner_id IS NULL
  AND (SELECT COUNT(*) FROM ad_user_roles ur WHERE ur.ad_role_id = r.ad_role_id) = 1;

-- Rule 2: no rows, exactly one user has it as default role.
UPDATE ad_role r
SET em_etgo_personal_owner_id = (SELECT du.ad_user_id FROM ad_user du
                                  WHERE du.ad_client_id = :client_id
                                    AND du.default_ad_role_id = r.ad_role_id),
    updated = now(), updatedby = '0'
WHERE r.ad_client_id = :client_id
  AND r.name LIKE 'Personal – %'
  AND r.istemplate = 'N'
  AND r.is_client_admin = 'N'
  AND r.em_etgo_personal_owner_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM ad_user_roles ur WHERE ur.ad_role_id = r.ad_role_id)
  AND (SELECT COUNT(*) FROM ad_user du
        WHERE du.ad_client_id = :client_id AND du.default_ad_role_id = r.ad_role_id) = 1;

-- Rule 3: dormant, exactly one current Admin whose name builds the role name and who is not
-- younger than the role.
WITH pr AS (
  SELECT r.ad_role_id, r.name, r.created
  FROM ad_role r
  WHERE r.ad_client_id = :client_id
    AND r.name LIKE 'Personal – %'
    AND r.istemplate = 'N'
    AND r.is_client_admin = 'N'
    AND r.em_etgo_personal_owner_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM ad_user_roles ur WHERE ur.ad_role_id = r.ad_role_id)
    AND NOT EXISTS (SELECT 1 FROM ad_user du
                     WHERE du.ad_client_id = :client_id AND du.default_ad_role_id = r.ad_role_id)
),
admins AS (
  SELECT u.ad_user_id, u.created,
         'Personal – ' || COALESCE(NULLIF(TRIM(u.name), ''), NULLIF(TRIM(u.username), ''),
                                   u.ad_user_id) AS full_name
  FROM ad_user u
  JOIN ad_role ar ON ar.ad_role_id = u.default_ad_role_id
  WHERE u.ad_client_id = :client_id
    AND ar.is_client_admin = 'Y'
),
dormant_matches AS (
  SELECT pr.ad_role_id, a.ad_user_id
  FROM pr
  JOIN admins a
    ON a.created <= pr.created
   AND (pr.name = LEFT(a.full_name, 60)
        OR (SUBSTRING(pr.name FROM ' \(([1-9][0-9]{0,8})\)$') IS NOT NULL
            AND SUBSTRING(pr.name FROM ' \(([1-9][0-9]{0,8})\)$') <> '1'
            AND pr.name = LEFT(a.full_name,
                               60 - LENGTH(' (' || SUBSTRING(pr.name FROM ' \(([1-9][0-9]{0,8})\)$') || ')'))
                          || ' (' || SUBSTRING(pr.name FROM ' \(([1-9][0-9]{0,8})\)$') || ')'))
),
unique_matches AS (
  SELECT dm.ad_role_id, MIN(dm.ad_user_id) AS ad_user_id
  FROM dormant_matches dm
  GROUP BY dm.ad_role_id
  HAVING COUNT(*) = 1
)
UPDATE ad_role r
SET em_etgo_personal_owner_id = um.ad_user_id,
    updated = now(), updatedby = '0'
FROM unique_matches um
WHERE r.ad_role_id = um.ad_role_id
  AND r.ad_client_id = :client_id
  AND r.em_etgo_personal_owner_id IS NULL;

-- @report
-- Personal roles left without an owner: typically a deleted user's orphan, or a dormant role
-- with zero or several candidate owners. The runtime rejects them on demote; listed so an
-- operator can review them (a follow-up task deactivates orphans on user delete).
SELECT r.ad_role_id, r.name, r.created,
       (SELECT COUNT(*) FROM ad_user_roles ur WHERE ur.ad_role_id = r.ad_role_id) AS assigned_rows
FROM ad_role r
WHERE r.ad_client_id = :client_id
  AND r.name LIKE 'Personal – %'
  AND r.istemplate = 'N'
  AND r.is_client_admin = 'N'
  AND r.em_etgo_personal_owner_id IS NULL
ORDER BY r.created;
