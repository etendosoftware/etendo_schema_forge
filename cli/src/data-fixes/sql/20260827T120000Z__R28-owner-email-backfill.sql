-- @id: R28-owner-email-backfill
-- @gap: L2
-- @risk: low
-- @type: sql
-- @description: Backfill AD_User.Email for tenant owners (EM_ETGO_Is_Owner='Y') whose email is NULL, resolved from the matching active ETGO_Account, mirroring GoAccountResolver#findAccountByUsername (ETP-5019)

-- Context (ETP-5019, new gap -- L2, sibling of L1 "Tenant Ownership" in
-- docs/etendo-ad/onboarding-gaps.md): core Etendo's InitialSetupUtility#insertUser (the
-- primitive InitialClientSetup calls to provision a brand-new client's admin AD_User) sets
-- Name/Description/Username but never Email -- so every self-service-registered tenant's
-- owner renders with an empty "Correo electronico" field in the Users window. Confirmed by
-- direct query: every EM_ETGO_Is_Owner='Y' row on this DB has Email IS NULL (69/69 at the
-- time of writing). Not a frontend display bug -- the column is genuinely NULL.
--
-- PREVENTIVE FRONT (already shipped, same PR): EtendoGoJwtSupport#applyClientAdminEmail,
-- called from EtendoGoJwtServlet#resolveOrCreateClient right after the existing
-- applyClientAdminDisplayName call, backfills Email at client-creation time from
-- accountEmail (the verified login/registration email held on the founder's ETGO_Account,
-- NOT the AD_User username, which may carry a client-name suffix -- see below). New tenants
-- onboarded from this deploy onward are born with Email already set; @check below naturally
-- returns 0 rows for them (SKIPPED_NOT_NEEDED). ONBOARDING_PROVISIONED_THROUGH is
-- deliberately NOT bumped for this fix: R24/R25/R26/R27 (timestamped after the current CUT,
-- 2026-08-11T12:00:00Z/R23) have not been individually re-verified here to each have their
-- own preventive front shipped, and bumping the single shared CUT constant past them would
-- risk silently skipping THEIR corrective SQL for brand-new tenants -- a mistake this
-- project's own "never bump CUT without confirming every intervening fix's preventive
-- parity" rule exists to prevent. Per the framework's own documented trade-off table, shipping
-- the .sql + preventive without a CUT bump is always safe (new tenants' @check is a cheap
-- no-op skip since their Email is already set by the preventive fix above) -- merely
-- redundant, never incorrect. Precedent: ETP-4743/R22 did the inverse split (corrective + CUT
-- bump, preventive shipped separately); this is the mirror case (preventive shipped here,
-- CUT bump deliberately deferred).
--
-- EMAIL SOURCE (the crux): AD_User.Username is NOT the real account email for every tenant --
-- onboarding names the FIRST environment a founder creates after their plain account email,
-- and every LATER environment <accountEmail>+<clientName> (EtendoGoJwtSupport#
-- buildClientUsername) to dodge the AD_User.Username uniqueness constraint. The canonical,
-- already-proven-in-production inverse of that naming is GoAccountResolver#
-- findAccountByUsername (used by EtendoGoJwtDalHelper#findAccountForEnvironmentUser to
-- resolve a RETURNING owner's identity on every login): try an exact username=email match
-- first; if that misses, split the username on the LAST '+' (never the first -- the
-- client-name suffix alphabet is [a-z0-9] only, so it can never itself contain '+', which
-- keeps a legitimately plus-addressed account email like "user+tag@example.com" intact) and
-- retry the exact match on the prefix. This fix mirrors that exact two-step resolution in
-- SQL rather than inventing a new heuristic, so the corrective and the runtime-login path
-- can never disagree about whose email a given owner really has.
--
-- Live-DB sweep (2026-08-27): all 69 current EM_ETGO_Is_Owner='Y' rows resolve via the EXACT
-- branch alone (every owner on this DB is still the first/only environment their account
-- owns, so no username currently carries a '+' suffix) -- 69/69 confidently resolvable, 0
-- ambiguous, 0 left NULL. The suffix branch is kept for correctness/future-proofing (an owner
-- CAN legitimately be the founder of a second+ tenant under the same account, which DOES
-- suffix their username) even though it is a no-op on today's data. Also confirmed: no
-- client has more than one EM_ETGO_Is_Owner='Y' row, no owner already has a non-NULL email,
-- and every matched ETGO_Account is isactive='Y' with status='active' (mirrors
-- EtendoGoJwtDalHelper.ACTIVE_ACCOUNT_FILTER, which likewise does not additionally filter on
-- STATUS or EMAIL_VERIFIED -- a pending/unverified account is still the correct identity to
-- backfill from, matching what the live preventive path itself would have written).
--
-- Idempotency: @apply is guarded by "u.email IS NULL" (defensive, matches @check's own gate)
-- plus the resolved-email subquery only ever matching an owner still missing the column,
-- so a re-run after success is a no-op. @report (below) surfaces any EM_ETGO_Is_Owner='Y'
-- row STILL NULL after @apply -- i.e. an owner whose username could not be resolved to any
-- active ETGO_Account by either branch -- so an operator can investigate by hand instead of
-- the gap silently persisting forever (mirrors R19's "flag, don't guess" @report pattern).
-- On this DB @report is expected to return 0 rows for every tenant (see sweep above).

-- @check
-- Needs the fix when the tenant has an owner with Email IS NULL that resolves (exact or
-- suffix-stripped) to an active ETGO_Account. 0 rows => SKIPPED_NOT_NEEDED, @apply never runs.
-- An owner whose username resolves to NO account is correctly excluded here too (matches
-- @apply's own resolvability condition below) so the fix converges instead of perpetually
-- re-matching an owner it can never actually fix.
SELECT 1
FROM ad_user u
WHERE u.ad_client_id = :client_id
  AND u.em_etgo_is_owner = 'Y'
  AND u.email IS NULL
  AND EXISTS (
    SELECT 1 FROM etgo_account a
    WHERE a.isactive = 'Y'
      AND (
        lower(a.email) = lower(u.username)
        OR (
          position('+' IN u.username) > 0
          AND lower(a.email) = lower(substring(
                u.username FROM 1 FOR (length(u.username) - position('+' IN reverse(u.username)))
              ))
        )
      )
  )
LIMIT 1;

-- @apply
-- Resolve each owner's real account email (exact match first, else the last-'+' suffix
-- stripped, exactly like GoAccountResolver#findAccountByUsername) and backfill it.
UPDATE ad_user u
SET email = resolved.resolved_email
FROM (
  SELECT
    u2.ad_user_id,
    COALESCE(a_exact.email, a_suffix.email) AS resolved_email
  FROM ad_user u2
  LEFT JOIN etgo_account a_exact
    ON a_exact.isactive = 'Y'
   AND lower(a_exact.email) = lower(u2.username)
  LEFT JOIN etgo_account a_suffix
    ON a_exact.etgo_account_id IS NULL
   AND position('+' IN u2.username) > 0
   AND a_suffix.isactive = 'Y'
   AND lower(a_suffix.email) = lower(substring(
         u2.username FROM 1 FOR (length(u2.username) - position('+' IN reverse(u2.username)))
       ))
  WHERE u2.ad_client_id = :client_id
    AND u2.em_etgo_is_owner = 'Y'
    AND u2.email IS NULL
) resolved
WHERE u.ad_user_id = resolved.ad_user_id
  AND u.ad_client_id = :client_id
  AND u.em_etgo_is_owner = 'Y'
  AND u.email IS NULL
  AND resolved.resolved_email IS NOT NULL;

-- @report
-- Read-only, same transaction as @apply. Lists any owner still Email IS NULL afterward --
-- i.e. their username resolved to no active ETGO_Account by either branch. Expected to be
-- empty on this DB (see sweep note above); kept as a permanent safety net for any tenant
-- whose owner's account was deactivated/renamed since onboarding.
SELECT u.ad_user_id, u.username AS unresolved_owner_username
FROM ad_user u
WHERE u.ad_client_id = :client_id
  AND u.em_etgo_is_owner = 'Y'
  AND u.email IS NULL;
