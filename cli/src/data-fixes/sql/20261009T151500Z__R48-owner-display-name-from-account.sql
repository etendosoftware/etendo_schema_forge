-- @id: R48-owner-display-name-from-account
-- @gap: ETP-5689
-- @risk: low
-- @type: sql
-- @description: Rename the owner AD_User from its (often "+company"-suffixed) username to the account holder's name — ETGO_ACCOUNT.NAME, else the bare account email.

-- ETP-5689 — onboarding named the owner AD_User after its username whenever the request carried
-- no full name, which is always the case when an existing account creates an additional
-- environment. That username is `email+<company>` as soon as the email is already a username
-- anywhere in the instance (EtendoGoJwtSupport.buildClientUsername), so the suffixed value showed
-- up as the person's name in the Users window, in attachments ("uploaded by") and in the audit
-- "created by" fields. The pooled path (PooledTenantClaimService.personalize) fell back to the
-- same username.
--
-- CODE-SIDE HALF (com.etendoerp.go, same ticket, NOT touched by this fix): prepareOnboarding now
-- fills a blank full name from ETGO_ACCOUNT.NAME, then the email, before either path runs, so no
-- new environment gets the username as its owner's name. This fix only renames owners created
-- before that.
--
-- TARGET: the owner (EM_ETGO_Is_Owner = 'Y') whose Name still equals its Username, i.e. a name
-- nobody ever edited. A name a user changed by hand is never touched. Username and Description
-- are left alone: GO resolves an account's environments by `username = email OR username LIKE
-- 'email+%'`, and Description is not shown anywhere.
--
-- ACCOUNT LOOKUP: by the owner's Email (backfilled since ETP-5019), else by the username with the
-- client suffix removed. The suffix is the last `+...` AFTER the `@`, so an address that has a
-- `+` of its own in the local part (`jane+test@acme.com+acme`) keeps it — the same split
-- GoAccountResolver makes. An owner with no matching ETGO_ACCOUNT is skipped: that is an unclaimed
-- pool tenant (`pool-<hex>` username, renamed when claimed) or a seed/test user, not a signup.
--
-- NEW NAME: ETGO_ACCOUNT.NAME, else the account email; trimmed and capped at 60 (AD_User.Name).
--
-- DB-STATE INVESTIGATION (2026-10-09, local dev DB): 58 owners with Name = Username; 16 are
-- unclaimed pool tenants without an account (skipped), the other 42 resolve to an account with a
-- name — 33 of them with the `+company` suffix.
--
-- IDEMPOTENT: once renamed, Name <> Username, so a second run finds 0 rows (@check) and @apply
-- re-applies the same guard.

-- @check
SELECT 1
FROM ad_user u
JOIN etgo_account a
  ON lower(a.email) = lower(coalesce(nullif(trim(u.email), ''),
                                     regexp_replace(u.username, '^(.*@[^+]*)\+[a-z0-9]+$', '\1')))
WHERE u.ad_client_id = :client_id
  AND u.em_etgo_is_owner = 'Y'
  AND u.name = u.username
  AND left(coalesce(nullif(trim(a.name), ''), lower(a.email)), 60) <> u.name;

-- @apply
UPDATE ad_user u
SET name = left(coalesce(nullif(trim(a.name), ''), lower(a.email)), 60),
    updated = now(),
    updatedby = '0'
FROM etgo_account a
WHERE u.ad_client_id = :client_id
  AND u.em_etgo_is_owner = 'Y'
  AND u.name = u.username
  AND lower(a.email) = lower(coalesce(nullif(trim(u.email), ''),
                                      regexp_replace(u.username, '^(.*@[^+]*)\+[a-z0-9]+$', '\1')))
  AND left(coalesce(nullif(trim(a.name), ''), lower(a.email)), 60) <> u.name;
