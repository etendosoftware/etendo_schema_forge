# Tenant data-fixes catalog

Corrective `.sql` data-fixes for existing Etendo GO tenants. Each file is one
fix; the runner (`../run.js`) applies them Flyway-style and records state in the
System-owned ledger `ETGO_DATA_FIX_HISTORY`.

## File naming

`<YYYYMMDDThhmmssZ>__<slug>.sql` — the UTC timestamp prefix makes a lexical
sort equal to chronological execution order. The `fix_id` is the file name
without `.sql`. Known onboarding-gap fixes carry their `Rn` label in `@id`,
e.g. `20260611T143000Z__R3-periodcontrol.sql`.

## File format

```sql
-- @id: R3-periodcontrol
-- @gap: C2
-- @risk: medium
-- @type: sql                 (default; or "webhook")
-- @description: one-line human description

-- @check
-- Returns >=1 row when the fix IS needed. 0 rows => SKIPPED_NOT_NEEDED.
SELECT 1 FROM ad_org o
WHERE o.ad_client_id = :client_id
  AND NOT EXISTS (SELECT 1 FROM c_periodcontrol pc WHERE pc.ad_org_id = o.ad_org_id);

-- @apply
INSERT INTO c_periodcontrol (...)
SELECT ... FROM ad_org o
WHERE o.ad_client_id = :client_id
  AND NOT EXISTS (SELECT 1 FROM c_periodcontrol pc WHERE pc.ad_org_id = o.ad_org_id);
```

For `@type: webhook`, add a `-- @webhook: <Name>` header instead of `@apply`;
the webhook MUST be atomic on its own (the runner cannot wrap it in a SQL tx).

### Optional `@report` section

A third, optional section may follow `@apply`:

```sql
-- @report
-- Read-only. Runs after a successful @apply, in the SAME transaction. Its
-- result rows are formatted into the ledger's `detail` column on the APPLIED
-- row. Use this when @apply must legitimately skip some rows (a guard that
-- protects against an unsafe state) and an operator needs to know which rows
-- still need manual attention.
SELECT l.value AS locator, ...
FROM ... WHERE ad_client_id = :client_id AND <still-needs-attention>;
```

A fix with no `@report` section behaves exactly as before — `detail` stays
`null` on an `APPLIED` row. See `20260803T160000Z__R19-locator-inventory-status.sql`
for a worked example (skips flipping a locator with negative on-hand stock,
reports which product/attribute/UOM/locator combination needs a manual
physical-inventory correction first).

## Mandatory rules

1. **Tenant scope is `:client_id` — non-negotiable.** Every statement in both
   `@check` and `@apply` MUST filter `ad_client_id = :client_id`. (The runner
   inlines these as validated AD-id literals so multi-statement `@apply` bodies
   work.)
2. **Two-layer idempotency.** `@check` decides whether to run at all; `@apply`
   is ALSO defensively guarded (`WHERE NOT EXISTS`) so partial/concurrent state
   is safe.
3. **Applied fixes are immutable.** Never rename or edit an applied `.sql`. A fix that becomes
   superseded (e.g. by a later fix covering the same ground more completely) is never edited or
   deleted either — it is **retired** instead via `../retired.json` (`fixId` + sha256 checksum of
   the file's live bytes), which makes the runner skip it entirely on every future run. See
   `../../../.claude/agents/tenant-fixer.md` § Retirement for the mechanism.

## Apply-time placeholders

The runner makes a temp copy of the `.sql`, substitutes the placeholders below,
and runs it in ONE transaction. The file on disk never changes.

| Placeholder | Resolves to | Notes |
|---|---|---|
| `:client_id` | The target tenant's `ad_client_id` | Quoted AD-id literal. Required scope filter. |
| `:org_id` | The tenant's **onboarding (operative) org** | The non-System org (`ad_org_id <> '0'`, active, oldest). Resolved ONLY when a fix uses the bind; the runner errors if the tenant has none. The System/client-level org is written as the literal `'0'` — never `:org_id`. |
| `@name_client@` | The tenant's `ad_client.name` | Bare, single-quote-escaped; lives INSIDE a string literal (e.g. `'Chart of @name_client@'`). Keeps copied text from staying hard-coded to the source client. |
| `@uuid_<KEY>@` | A fresh per-tenant Etendo id (32 hex, upper) | Same `KEY` (any `[0-9A-Za-z]+`, typically the source id) → same generated id within one apply, so a PK and the FKs that point at it stay linked. A new tenant gets a brand-new id set → zero cross-client references. Write your own quotes: `'@uuid_...@'`. |

See `../../../.claude/agents/tenant-fixer.md` for the full runner design.
