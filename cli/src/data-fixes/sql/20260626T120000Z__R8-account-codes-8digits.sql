-- @id: R8-account-codes-8digits
-- @gap: A1
-- @risk: medium
-- @type: sql
-- @description: Right-pad numeric posting account codes (C_ElementValue) to exactly 8 digits
--   by appending trailing zeros, so that the Chart of Accounts feature (ETP-4247) can apply
--   a uniform 8-digit key format.
--
-- Background
-- ----------
-- The GOClient chart of accounts uses a 3-level numeric hierarchy:
--   3-digit codes  (100, 200, …)      → group accounts  (issummary='Y')
--   4-digit codes  (1000, 1010, …)    → group accounts  (issummary='Y')
--   5-digit codes  (10000, 10100, …)  → posting accounts (issummary='N')
-- Non-numeric codes (A, P, P.G.D, A.B.II.1, …) are Spanish PGC section labels —
-- they must not be touched.
--
-- Scope
-- -----
-- ONLY posting accounts (issummary='N') with a purely numeric value shorter than 8
-- digits are padded.  Group accounts (issummary='Y') are deliberately excluded because
-- naive right-padding collides within the same element tree:
--   RPAD('100', 8, '0') = RPAD('1000', 8, '0') = RPAD('10000', 8, '0') = '10000000'
-- which would violate the UNIQUE(c_element_id, value) constraint.
-- Confirmed in DB: scoping to issummary='N' yields 0 collision pairs.
--
-- Idempotency
-- -----------
-- The @apply WHERE clause (LENGTH(value) < 8) is self-terminating: after a complete
-- run every qualifying row is exactly 8 chars, so a re-run finds 0 rows and is a no-op.
-- The @check also returns 0 rows after a successful apply, so the runner records
-- SKIPPED_NOT_NEEDED on re-run.
--
-- Preventive note
-- ---------------
-- When gap A1's onboarding step is built (chart-of-accounts seeding for new tenants),
-- it must seed c_elementvalue rows with 8-digit numeric codes from the start so that
-- new tenants are born without this gap.  This corrective fix covers existing tenants
-- only.  See docs/etendo-ad/onboarding-gaps.md §A1.

-- @check
-- Returns >=1 row when the client has at least one numeric posting account
-- whose code is shorter than 8 digits (i.e. the fix is needed).
SELECT 1
FROM c_elementvalue
WHERE ad_client_id = :client_id
  AND issummary = 'N'
  AND value ~ '^[0-9]+$'
  AND LENGTH(value) < 8
LIMIT 1;

-- @apply
-- Right-pad every numeric posting account code to exactly 8 digits.
-- The WHERE clause mirrors @check exactly, making the statement idempotent.
UPDATE c_elementvalue
SET    value = RPAD(value, 8, '0')
WHERE  ad_client_id = :client_id
  AND  issummary = 'N'
  AND  value ~ '^[0-9]+$'
  AND  LENGTH(value) < 8;
