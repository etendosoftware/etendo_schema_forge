# Roles & Users (ETP-3504) — GOClient reference-role seed (ETP-4508)

**Scope of this doc:** the Phase 1 foundation — 4 fixed operational `AD_Role`
records seeded on **GOClient**, the reference/main client (plus the
resolution mechanism for "Administrator", which is not a seeded role — see
below). Window-access wiring (ETP-4509), UI enforcement of the protection
convention (ETP-4510+), onboarding replication for new tenants (ETP-4515) and
backfill for existing tenants (ETP-4516) are follow-up tasks that build on
the facts recorded here.

Design doc: [Roles y Usuarios](https://etendoproject.atlassian.net/wiki/spaces/PYPI/pages/5042438147/Roles+y+Usuarios) (Confluence, PYPI).
Epic: ETP-3504.

## GOClient

```
ad_client_id = 802509E12436405C86BA1FD5B1DF508C   (name/value = "GOClient")
```

## The 4 canonical operational roles (fixed, reserved IDs)

Generated via `make uuid`. **Reserved — never reuse these IDs for anything
else.** Seeded by `cli/sql/goclient-seed-roles.sql`.

| Role | `AD_Role_ID` | `userlevel` | `is_client_admin` |
|---|---|---|---|
| Finance | `127AE77FE2994067B7FE6495FC21D51E` | `  O` (Org) | `N` |
| Sales | `2A159DF4F4B944A6AA903202AD35B545` | `  O` | `N` |
| Purchasing | `A826430F723E4C1B9A53EBB0746A98C0` | `  O` | `N` |
| Inventory | `55E05A4B43514A029D6FB6B8D94B49D4` | `  O` | `N` |

These 4 are operational roles scoped at Org level, matching the existing
`GOuser` pattern (see below). "Administrator" is **not** one of these seeded
roles — see the "Administrator resolution" section below.

All 4 have `iswebserviceenabled='Y'` (required to authenticate through Etendo
Go's REST/JWT flow) and `isadvanced='Y'` (matches GOClient's existing roles).
`isrestrictbackend` was left at the core default (`'N'`) — deliberately not
touched here; ETP-4509/4510 may revisit whether the 4 operational roles
should be barred from the classic Etendo backend, since that is a product
decision outside this task's scope.

## Administrator resolution — NOT a seeded role, resolved per-tenant

**Correction (2026-07-15): a prior run of this task mistakenly created a new,
freshly-generated `AD_Role` named "Administrator"
(`451EED23EC0A44679F15C6789A4EB980`) on GOClient.** This was wrong and has
been reverted. Before deletion, every FK column referencing `ad_role_id`
across the schema was checked for dependent rows: the role had zero
dependents in any FK column with `ON DELETE NO ACTION` — `AD_User_Roles`,
`AD_Window_Access`, `AD_Process_Access`, `AD_Form_Access`,
`AD_Role_Inheritance`, `AD_Role_OrgAccess` all showed 0 rows. The only
non-zero counts were in 3 OB UI framework tables via `ON DELETE CASCADE`
FKs — `obkmo_widget_class_access` (27 rows), `obuiapp_process_access`
(138), `obuiapp_view_role_access` (1) — present in the exact same counts on
every one of the 5 roles that existed at the time, confirming these are
framework-bootstrap rows populated on role creation regardless of
`ismanual`, not evidence of real usage. The role was deleted
(`DELETE FROM ad_role WHERE ad_role_id = '451EED23EC0A44679F15C6789A4EB980'`,
cascading the 3 framework tables' rows along with it) from the live GOClient
DB, and the `INSERT` block removed from `cli/sql/goclient-seed-roles.sql`
— the script now seeds 4 roles.

**"Administrator" is the tenant's pre-existing client-admin role, not a new
record.** Core Etendo's `InitialClientSetup` (the standard create-client
wizard, invoked by `EtendoGoJwtServlet.createClient` for every new tenant)
already auto-creates a Client+Org-level, `is_client_admin='Y'` admin role for
every client — on GOClient that's **"GOClient Admin"**
(`9B8D736190724807AB256DC95F20EC5E`). This role already satisfies "full
access to all windows": as a non-manual role (`ismanual='N'`), core's
`AD_ROLE_TRG` trigger auto-derives and keeps in sync a blanket grant across
every active window/process for its userlevel (verified live: 266
`AD_Window_Access` / 306 `AD_Process_Access` / 17 `AD_Form_Access` rows) —
automatically, forever, as new windows are added. **This is** the "Owner +
Admin, full access to every window" requirement from the ETP-3504 design doc.
No manual curation is needed for it, unlike Finance/Sales/Purchasing/
Inventory (see the `ismanual` section below) — it must be left exactly as
`InitialClientSetup` created it: `ismanual='N'`, untouched.

**The resolution mechanism — MANDATORY for ETP-4515 (onboarding replication)
and ETP-4516 (backfill for existing tenants):**

```sql
SELECT ad_role_id FROM ad_role
WHERE ad_client_id = :client_id AND is_client_admin = 'Y';
```

- **Resolve by `is_client_admin = 'Y'` scoped to the tenant's `ad_client_id`
  — NEVER by name and NEVER by a fixed ID.**
  - **Not by name:** `InitialClientSetup` names the role `"<ClientName>
    Admin"` (e.g. "GOClient Admin", "Acme Corp Admin" for a future tenant
    named "Acme Corp") — the literal string is client-derived, not portable.
  - **Not by a fixed ID:** every tenant gets its own freshly-generated
    `AD_Role_ID` for this role at client-creation time; there is no single ID
    that works across tenants.
- This is also the existing convention elsewhere in the codebase —
  `EtendoGoJwtDalHelper.findClientAdminUserRole` already resolves the
  client-admin role this same way (`is_client_admin='Y'`, not by name),
  confirmed via `grep` across `modules/com.etendoerp.go/src`.
- **No `AD_Window_Access` seeding needed for this role in ETP-4509** — unlike
  the 4 operational roles, it needs no per-role window-access table entries;
  its blanket access is already correct and self-maintaining via the core
  trigger.

## Open question 1 — where does the authoritative artifact live?

**Decision: NOT `cli/src/data-fixes/`.** That framework
(`docs/etendo-ad/onboarding-and-datafixes-map.md` §3,
`.claude/agents/tenant-fixer.md`) exists specifically to close **provisioning
gaps across the tenant fleet** — its `.sql` catalog, ledger
(`ETGO_DATA_FIX_HISTORY`), and `BASELINE`/`DETECTED` watermark model all
assume:
1. a matching **preventive** onboarding-service front (so new tenants are
   "born clean" and the fix is skipped for them), and
2. the fix is meaningful for **any** tenant in the fleet, not just one
   hardcoded client.

Neither holds here. This is a **one-off seed of new reference master data on
the single reference client**; the onboarding-replication mechanism for new
tenants (ETP-4515) and the backfill for existing tenants (ETP-4516) are
explicitly **separate, not-yet-designed** follow-up tasks.

**Corrected framing (2026-07-15): the authoritative, tracked artifact is the
GOClient sampledata XML in `com.etendoerp.go`, NOT a standalone `.sql`
script.** GOClient is the module's own bundled reference/template client —
its data ships as XML dumps, one file per table, under
`{etendo_root}/modules/com.etendoerp.go/referencedata/sampledata/GOClient/`
(`AD_ROLE.xml`, `AD_ROLE_ORGACCESS.xml`, `AD_USER_ROLES.xml`, etc. already
exist there for the 2 pre-existing core roles). `db.apply.modules.sampledata`
(Gradle) imports this dataset into a DB, and `prepareOnboardingSampledata`
stages this EXACT dataset for new-tenant onboarding (per
`tenant-remediation-knowledge.md`'s 2026-07-02 finding: this directory is a
literal, live-synced source, not a separate hand-authored template) — so
editing it is not optional documentation, it is the real deliverable that
reaches both GOClient rebuilds and every future onboarded tenant.

The 4 new `<AD_ROLE>` blocks were hand-authored into `AD_ROLE.xml` by
transcribing the exact field values already seeded on the live dev DB (never
invented) — the user explicitly decided NOT to run the automated
`./gradlew export.sample.data` DB→XML export for this task. **Convention
confirmed by the user: entries are ordered ascending alphanumeric by the ID
field** (this is how `export.sample.data` naturally emits them, sorted by
primary key) — verified for all 6 roles that now exist on GOClient:

```
127AE77FE2994067B7FE6495FC21D51E — Finance      (new)
2A159DF4F4B944A6AA903202AD35B545 — Sales        (new)
55E05A4B43514A029D6FB6B8D94B49D4 — Inventory    (new)
6A0A8D73D8284C6088DF36BDCC569161 — GOuser       (existing, unchanged)
9B8D736190724807AB256DC95F20EC5E — GOClient Admin (existing, unchanged)
A826430F723E4C1B9A53EBB0746A98C0 — Purchasing   (new)
```

**`cli/sql/goclient-seed-roles.sql` is now a LOCAL DEV-SEEDING CONVENIENCE
SCRIPT ONLY**, not the authoritative artifact — it follows the
`cli/sql/neo-constraints.sql` precedent (a plain, idempotent, manually-invoked
`.sql` file) purely to let a developer reproduce the same DB rows on a fresh
local dev DB (e.g. one restored before this task ran) without needing a full
sampledata re-import. It is not consumed by CI, onboarding, or any other
tenant — the XML is. Both are kept in sync by hand; if they ever drift,
the XML wins (it's what ships).

## Open question 2 — does GOClient already have an Administrator-equivalent role?

**Yes — and it IS reused (as of the 2026-07-15 correction), not duplicated.**
See § "Administrator resolution" above for the full rationale: why a
brand-new "Administrator" role was briefly (and mistakenly) created, why it
was reverted, and why the tenant's admin role is always resolved by the
`is_client_admin='Y'` predicate rather than by name or a fixed ID.

GOClient already had 2 roles before this task, auto-created by core Etendo's
`InitialClientSetup` (the standard "create-client" wizard invoked by
`EtendoGoJwtServlet.createClient` for every new tenant, GOClient included):

| Role | `AD_Role_ID` | `userlevel` | `is_client_admin` |
|---|---|---|---|
| GOClient Admin | `9B8D736190724807AB256DC95F20EC5E` | ` CO` | `Y` |
| GOuser | `6A0A8D73D8284C6088DF36BDCC569161` | `  O` | `N` |

**Net effect:** GOClient has **6 roles**: the 2 core bootstrap roles
(`GOClient Admin`, `GOuser`, untouched) + the **4** new GO operational roles
(Finance/Sales/Purchasing/Inventory). Every future tenant will end up with the
same shape once ETP-4515 ships (their own `InitialClientSetup`-named
admin/user pair + the same 4 fixed-name GO operational roles; "Administrator"
is never a 5th seeded role on any tenant — it's always the resolved
`is_client_admin='Y'` role).

## AD_Role_OrgAccess — resolved (2026-07-15: 2 rows per role, `IS_ORG_ADMIN='N'` throughout)

**Investigated 2026-07-15, applied 2026-07-15 (in two passes — GOOrg row,
then org `'0'` row).** A role's `AD_Role_OrgAccess` rows determine which
organizations it can even see/select — this is different from
`AD_Window_Access` (which windows) and decides whether these 4 roles are
usable at all, not just present as records.

Queried both pre-existing GOClient roles:

| Role | Org | `IS_ORG_ADMIN` |
|---|---|---|
| GOuser (`  O`, `is_client_admin='N'` — same shape as the 4 new roles) | GOOrg (`61849243BE89460EB70866880A545D50`) | `Y` |
| GOClient Admin (` CO`, `is_client_admin='Y'`) | `0` (`*`) | `N` |
| GOClient Admin | GOOrg | `Y` |

**Finding, pass 1 (GOOrg row): the 4 new roles need an `AD_Role_OrgAccess`
row to be functional, not just to exist as a record.** `GOuser` — the exact
same `userlevel`/`is_client_admin` shape as Finance/Sales/Purchasing/
Inventory — has exactly ONE such row (GOOrg). Without any row, a user
assigned one of the 4 new roles has no organization to select at login and
the role cannot be used to do anything — this is a functional gap, not just
missing metadata. The **org itself** (GOOrg) and the row's mere existence
follow the `GOuser` precedent exactly.

**`IS_ORG_ADMIN`, however, is a separate, deliberate decision — NOT mirrored
from `GOuser`.** `GOuser`'s row uses `'Y'`, but granting organization-admin
rights is a privilege grant distinct from "can select this org", so it
needed explicit human sign-off rather than a mechanical transcription.
**Decision: `IS_ORG_ADMIN='N'` for all 4 roles.** Reasoning: Finance,
Sales, Purchasing, and Inventory are tiered, restricted business roles under
the 3-tier full/read-only/none window-access model (see the `ismanual`
section above) that ETP-4509 will build on top of these roles — org-admin
rights are not part of that design, so least-privilege wins over exactly
mirroring the `GOuser` precedent.

**Finding, pass 2 (org `'0'` safety-net row): mirrors `GOClient Admin`, not
`GOuser`.** `GOClient Admin` carries a SECOND `AD_Role_OrgAccess` row for org
`'0'` (the all-orgs/`*` marker), `IS_ORG_ADMIN='N'`, alongside its GOOrg row
— `GOuser` does not have this second row. Decision: add the equivalent org
`'0'` row (also `IS_ORG_ADMIN='N'`) to all 4 new roles as a safety net,
consistent with the same least-privilege reasoning as pass 1 (the row grants
org-`'0'` visibility, not org-admin rights).

Applied to the live GOClient dev DB in two passes (4 + 4 fresh UUIDs via
`make uuid`, no collisions with existing `AD_Role_OrgAccess_ID`s each time)
and to `referencedata/sampledata/GOClient/AD_ROLE_ORGACCESS.xml` (same
ascending-alphanumeric-by-ID ordering rule as `AD_ROLE.xml`; the 3
pre-existing blocks — GOuser + GOClient Admin ×2 — are untouched throughout).
See the two resolved `INSERT` blocks near the bottom of
`cli/sql/goclient-seed-roles.sql` for the exact statements (idempotent,
`WHERE NOT EXISTS` guarded).

Verification (live GOClient DB, 2026-07-15, final):

```sql
SELECT r.name,
  (SELECT count(*) FROM ad_role_orgaccess oa WHERE oa.ad_role_id = r.ad_role_id) AS org_access,
  (SELECT string_agg(oa.ad_org_id || ':' || oa.is_org_admin, ', ' ORDER BY oa.ad_org_id)
     FROM ad_role_orgaccess oa WHERE oa.ad_role_id = r.ad_role_id) AS org_rows
FROM ad_role r
WHERE ad_client_id = '802509E12436405C86BA1FD5B1DF508C'
ORDER BY r.name;
```

```
      name      | org_access |                  org_rows
----------------+------------+---------------------------------------------
 Finance        |          2 | 0:N, 61849243BE89460EB70866880A545D50:N
 GOClient Admin |          2 | 0:N, 61849243BE89460EB70866880A545D50:Y
 GOuser         |          1 | 61849243BE89460EB70866880A545D50:Y
 Inventory      |          2 | 0:N, 61849243BE89460EB70866880A545D50:N
 Purchasing     |          2 | 0:N, 61849243BE89460EB70866880A545D50:N
 Sales          |          2 | 0:N, 61849243BE89460EB70866880A545D50:N
```

The 4 new roles each now carry exactly TWO `AD_Role_OrgAccess` rows (org
`'0'` and GOOrg), both `IS_ORG_ADMIN='N'`, as decided. `GOuser` and
`GOClient Admin` are byte-for-byte unchanged from before this task.

## Protection against edit/delete (V1)

**No AD_Role column fits "system-protected, non-editable" today** —
`IsManual`, `IsTemplate`, `IsAdvanced`, `IsRestrictBackend` etc. all have
unrelated core semantics (checked via `ad_column.help`/`description` against
GOClient's live schema; see the header comment in
`cli/sql/goclient-seed-roles.sql`). Adding a new column to `AD_Role` — a core,
widely-used AD table — was judged out of proportion for this task (schema
change + `export.database` + touches every existing role everywhere).

**Chosen convention (V1): fixed/reserved ID + human-readable marker,
enforced at the future UI layer, not the DB layer.**

1. **Structural protection, today:** there is no Etendo Go "Roles" window/
   spec yet (`grep` across `artifacts/*/decisions.json` confirms no window
   targets `AD_Role`), so these records are **inherently non-editable from
   the Etendo Go UI right now** — there is no CRUD surface at all.
2. **Forward-looking protection, for whenever that window ships
   (ETP-4510+):** its `NeoHandler` (see the pattern in
   `docs/neo-headless-extensibility.md`) **MUST** block `update`/`delete`
   whenever `AD_Role_ID` is one of the 4 reserved IDs listed above. Check the
   ID, not the `Description` text — the description marker
   (`"Etendo Go system role — do not edit or delete"`) is a human-readable
   hint for anyone looking at the record in the classic Etendo backend, not
   a machine-checkable guard. The tenant's Administrator-equivalent role
   (`is_client_admin='Y'`, e.g. `GOClient Admin`) also needs update/delete
   protection, but by that predicate, not by a reserved-ID list entry — it
   has no fixed ID across tenants.
3. This doc + the header of `cli/sql/goclient-seed-roles.sql` are the two
   canonical, must-stay-in-sync locations for the reserved-ID list.

## Important for ETP-4509 — the roles are MANUAL (`ismanual='Y'`), by design

These 4 roles are seeded with `ismanual='Y'` — **mandatory, do not change.**
Core Etendo's `AD_ROLE_TRG` trigger (fires on `INSERT`/`UPDATE` of `AD_ROLE`
for **non-manual** roles, `ismanual='N'` — see
`docs/etendo-ad/tenant-remediation-knowledge.md` §"Window/Process Access Gap
for Automatic Roles (ETP-4397)") auto-derives blanket `AD_Window_Access`/
`AD_Process_Access`/`AD_Form_Access` for **every active window/process
matching the role's `userlevel`**, with `isreadwrite='Y'` (full access) by
default, on every `INSERT` (and on `UPDATE` when `userlevel` changes). ETP-4509
curates each role's window access **by hand** (the 3-tier full/read-only/none
model), so these roles must stay `ismanual='Y'` — the trigger's function body
(`ad_role_trg()`) explicitly short-circuits for manual roles (`ELSIF
(new.IsManual = 'Y') THEN RETURN NEW`), so it never touches them. This gives
ETP-4509 a genuinely **empty** `AD_Window_Access`/`AD_Process_Access`/
`AD_Form_Access` set to build its 3-tier model on top of, rather than having
to narrow down an auto-granted blanket one.

**Correction record (2026-07-15, part 1 — ismanual bug):** the first run of
this script mistakenly used `ismanual='N'`. At the time it seeded 5 roles
(including the since-removed "Administrator" — see part 2 below). The trigger
fired as described above and auto-granted 243–265 `AD_Window_Access` rows,
303–306 `AD_Process_Access` rows, and 85 `AD_Form_Access` rows across the 5
roles (confirmed to match the exact same pattern already present on the
pre-existing core `GOClient Admin` (266/306/17) and `GOuser` (245/303/17)
roles — this is standard Etendo behavior for any non-manual role, not a
defect specific to this seed). This was corrected via:

```sql
UPDATE ad_role SET ismanual = 'Y', updated = now(), updatedby = '100'
WHERE ad_role_id IN (<the 5 role IDs seeded at the time>);

DELETE FROM ad_window_access  WHERE ad_role_id IN (<the 5 role IDs seeded at the time>);
DELETE FROM ad_process_access WHERE ad_role_id IN (<the 5 role IDs seeded at the time>);
DELETE FROM ad_form_access    WHERE ad_role_id IN (<the 5 role IDs seeded at the time>);
```

A plain `UPDATE ismanual 'N'→'Y'` alone does **not** clean up rows the trigger
already inserted while the role was non-manual — `ad_role_trg()`'s `UPDATE`
branch only runs its delete-and-rebuild logic when `userlevel` changes or when
flipping `ismanual` from `'Y'` to `'N'` (the opposite direction); going
`'N'→'Y'` is a no-op for access rows, so the explicit `DELETE`s above were
required. `cli/sql/goclient-seed-roles.sql` was updated to use `ismanual='Y'`
in all `INSERT`s so a fresh install seeds correctly the first time.

**Correction record (2026-07-15, part 2 — Administrator role removal):** the
seeded "Administrator" `AD_Role` (`451EED23EC0A44679F15C6789A4EB980`) should
never have been created as a new record. See § "Administrator resolution"
near the top of this doc for the full rationale, the FK-dependency
verification, and the exact statement used to delete it —
`cli/sql/goclient-seed-roles.sql` was updated to remove the Administrator
`INSERT` block entirely, and the script now seeds 4 roles.

**Correction record (2026-07-15, part 3 — delivery mechanism + minor field
gap):** transcribing the live DB rows into `AD_ROLE.xml` (see "Open question
1" above for why the XML, not the `.sql` script, is now the authoritative
artifact) surfaced that `recalculatepermissions` was `NULL` on all 4 new
roles — the original `INSERT` column list omitted it, while both pre-existing
core roles show `'N'`. Fixed live DB via `UPDATE ad_role SET
recalculatepermissions = 'N' WHERE ad_role_id IN (<the 4 role IDs>)`;
`cli/sql/goclient-seed-roles.sql` updated to include the column in the
`INSERT`s (value `'N'`) plus a guarded repair `UPDATE` for installs seeded by
the earlier revision. Also discovered the 4 new roles had **zero**
`AD_Role_OrgAccess` rows, unlike the same-shape `GOuser` — resolved with
`IS_ORG_ADMIN='N'` per the human decision recorded in the
"AD_Role_OrgAccess — resolved" section above.

`ad_window_access`/`ad_process_access` have a single `isreadwrite` (Y/N) flag
(plus `isactive`), matching the handoff doc's 3-tier model: "allowview only ⇒
read-only; all flags ⇒ full" maps to `isreadwrite='N'` vs `'Y'` on an active
row; no access ⇒ row absent (or `isactive='N'`). ETP-4509 will `INSERT` these
rows directly per its per-role table — no pre-existing rows to clean up first.

## Verification (live GOClient DB, 2026-07-15 — final, after AD_Role_OrgAccess resolution)

```sql
SELECT ad_role_id, name, ismanual, userlevel, is_client_admin, isactive, iswebserviceenabled, recalculatepermissions,
  (SELECT count(*) FROM ad_window_access wa WHERE wa.ad_role_id = r.ad_role_id) AS win_access,
  (SELECT count(*) FROM ad_process_access pa WHERE pa.ad_role_id = r.ad_role_id) AS proc_access,
  (SELECT count(*) FROM ad_form_access fa WHERE fa.ad_role_id = r.ad_role_id) AS form_access,
  (SELECT count(*) FROM ad_role_orgaccess oa WHERE oa.ad_role_id = r.ad_role_id) AS org_access
FROM ad_role r
WHERE ad_client_id = '802509E12436405C86BA1FD5B1DF508C'
ORDER BY name;
```

```
            ad_role_id            |      name      | ismanual | userlevel | is_client_admin | isactive | iswebserviceenabled | recalc | win_access | proc_access | form_access | org_access
----------------------------------+----------------+----------+-----------+-----------------+----------+---------------------+--------+------------+-------------+-------------+------------
 127AE77FE2994067B7FE6495FC21D51E | Finance        | Y        |   O       | N               | Y        | Y                   | N      |          0 |           0 |           0 |          2
 9B8D736190724807AB256DC95F20EC5E | GOClient Admin | N        |  CO       | Y               | Y        | Y                   | N      |        266 |         306 |          17 |          2
 6A0A8D73D8284C6088DF36BDCC569161 | GOuser         | N        |   O       | N               | Y        | Y                   | N      |        245 |         303 |          17 |          1
 55E05A4B43514A029D6FB6B8D94B49D4 | Inventory      | Y        |   O       | N               | Y        | Y                   | N      |          0 |           0 |           0 |          2
 A826430F723E4C1B9A53EBB0746A98C0 | Purchasing     | Y        |   O       | N               | Y        | Y                   | N      |          0 |           0 |           0 |          2
 2A159DF4F4B944A6AA903202AD35B545 | Sales          | Y        |   O       | N               | Y        | Y                   | N      |          0 |           0 |           0 |          2
```

**6 roles total, exactly as expected:** the 4 new manual roles
(Finance/Sales/Purchasing/Inventory — `ismanual='Y'`, `recalculatepermissions='N'`,
zero window/process/form access rows, **two** org access rows each — org
`'0'` and GOOrg, both `IS_ORG_ADMIN='N'`) + the 2 pre-existing core bootstrap
roles (`GOClient Admin`, `ismanual='N'`, 266/306/17/2 access — untouched,
unchanged from before this task; `GOuser`, `ismanual='N'`, 245/303/17/1
access — untouched). "Administrator" (`451EED23EC0A44679F15C6789A4EB980`) is
gone, and nothing new appeared in its place — GOClient's own admin role
(`GOClient Admin`) already fills that function via `is_client_admin='Y'`.
No open items remain from this task.

Re-running the corrected `cli/sql/goclient-seed-roles.sql` a second time
confirmed idempotency: all 4 role `INSERT`s, the `recalculatepermissions`
repair `UPDATE`, all 4 `AD_Role_OrgAccess` GOOrg `INSERT`s, and all 4
`AD_Role_OrgAccess` org-`'0'` `INSERT`s reported `0` rows affected.

**Authoritative artifact:** `{etendo_root}/modules/com.etendoerp.go/referencedata/sampledata/GOClient/AD_ROLE.xml`
now carries all 6 roles, and `AD_ROLE_ORGACCESS.xml` now carries all 11 rows
(3 pre-existing + 8 new — 2 per new role), both in ascending-alphanumeric-ID
order (validated well-formed XML, sort order confirmed programmatically for
both files).

---

# ETP-4509 — Window access mapping (3-tier, GOClient)

**Scope:** map each of the 4 operational roles to `AD_Window_Access` rows for
their designated windows (full/read-only), per the business-term table in
the Jira ticket / phase-1 handoff. Depends on ETP-4508 (roles + org access,
above) being correct.

## Highest-risk item — ETGO_SF_ENTITY/ETGO_SF_SPEC → AD_Window_ID reliability

**RESOLVED, confirmed reliable for real AD windows.** `ETGO_SF_SPEC` (the
top-level Etendo Go spec table) has its own **direct** `ad_window_id` column
— no join through `ETGO_SF_ENTITY`/`AD_TAB` is even needed for the common
case. Verified live on GOClient across all 49 active `spec_type='W'`
("window") specs:

- **47/49** have a non-NULL `ad_window_id` that is byte-for-byte consistent
  with every one of their child `ETGO_SF_ENTITY.ad_tab_id → AD_TAB.ad_window_id`
  values — **zero mismatches, zero specs spanning more than one AD window**
  (checked via a full outer join across all active entities/tabs). For these,
  `ETGO_SF_SPEC.ad_window_id` is a fully reliable, direct FK — use it, no
  cross-checking needed.
- **2/49 have `ad_window_id = NULL` by design, not by gap:** `dashboard` (a
  synthetic aggregate view assembled from several unrelated KPI/trend/task
  sub-entities — its own child entities like `kpis`/`trends`/`pending-tasks`
  also have `ad_tab_id = NULL`, confirming they are computed panels with no
  backing AD_Tab at all) and `not-posted-documents` (a cross-window
  aggregate report, same shape). Neither corresponds to a single AD window —
  there is nothing to grant `AD_Window_Access` *to* for these two.
- **`spec_type='R'` specs (8 active) have `ad_window_id = NULL` for ALL of
  them, always** — these are Etendo Go's own custom aggregate/report views
  (`aging-receivable`, `bank-reconciliation`, `bank-statements`,
  `financial-account-psd2`, `financial-account-transactions`,
  `financial-accounts-page`, `inventory-stock-report`, `tax-report`). They
  are a **different spec category** from `spec_type='W'`, not a subset that
  happens to be missing data. **None of them can ever get an
  `AD_Window_Access` row** — there is no AD window (Go-exposed or core) that
  backs them; they're purely computed views assembled by NEO Headless from
  other entities' data.
- A handful of individual `ETGO_SF_ENTITY` rows *within* an otherwise
  window-backed spec have `ad_tab_id = NULL` (e.g. `contacts`' `bp-stats`/
  `bp-trend` sub-entities) — same pattern as above: synthetic stat/trend
  panels bolted onto a real window, not evidence the window itself is
  unmapped.

**Net verdict:** the mapping mechanism itself (`ETGO_SF_SPEC.ad_window_id`)
is **100% reliable wherever it is populated** (47/49 window specs, zero
drift/mismatch found). The 2 exceptions among window-type specs, and all 8
report-type specs, are **correctly** unmapped — they are not real AD
windows and were never going to be. This is a materially different (better)
answer than "some specs have missing/unreliable IDs" — the mechanism doesn't
have gaps, a small category of specs is simply out of its domain.

**Practical consequence for this task:** `bank-reconciliation` (the Go spec
behind "Conciliación bancaria" in the business-term table, see below) falls
in the second bullet above — it is a `spec_type='R'` view with no
`AD_Window_ID`, so **it cannot receive an `AD_Window_Access` row at all**,
regardless of role or tier. This is the significant, concrete instance of
"unreliable mapping" the ticket asked to surface.

## Business-term → AD_Window_ID resolution table

Resolved by cross-referencing the Spanish business terms in the Jira table
against the 49 active `spec_type='W'` specs' `AD_WINDOW_TRL` (`es_ES`) names
— **not** by searching the full core `AD_MENU` tree, which returns dozens of
noisy, non-Go-exposed matches for generic terms (verified and discarded as
an approach; e.g. searching AD_MENU for "Facturas de venta" surfaces a
payment-plan report, not the actual Sales Invoice window). Only the 49
Go-exposed specs are actually reachable by an Etendo Go role, so that's the
correct search universe.

| Business term (role, tier) | Spec (kebab) | `AD_Window_ID` | Confidence |
|---|---|---|---|
| Plan contable (Finance, full) | chart-of-accounts | `118` | High — exact concept match ("Árbol de cuentas"/Account Tree) |
| Asientos (Finance, full) | simple-g-l-journal | `B917E8A7B0864ACEA9D941E3B7494E53` | High — only Go-exposed journal-entry window (core's "Asientos manuales"/G-L Journal, window `132`, is NOT Go-exposed) |
| Bancos (Finance, full) | financial-account | `94EAA455D2644E04AB25D93BE5157B6D` | High — only Go-exposed banking window; core's `AD_Bank` window (`158`, "Banco-Sucursal") is NOT Go-exposed |
| Pagos (Finance, full) | payment-out | `6F8F913FA60F4CBD93DC1D3AA696E76E` | High |
| Cobros (Finance, full) | payment-in | `E547CE89D4C04429B6340FFA44E70716` | High — exact ES name match ("Cobros") |
| Impuestos (Finance, full) | tax **and** tax-category | `137` and `138` | **Ambiguous** — both are legitimate Go-exposed "tax config" windows (Tax Rate / Tax Category); no single window is uniquely "Impuestos". Resolved by granting **both** rather than guessing one (low over-grant risk, both are within Finance's own domain) |
| Contabilidad (Finance, full) | — | **none** | **Unresolved, not seeded.** No single Go-exposed window matches this generic label once Plan contable/Asientos are already separately accounted for; the closest candidate (`general-ledger-configuration`, "Esquema contable") is a distinct concept (accounting-schema setup, not general "accounting"). Flagged for product clarification rather than guessed. |
| Conciliación bancaria (Finance, full) | bank-reconciliation | **none — impossible** | **Unresolved, not seeded — see the highest-risk finding above.** `spec_type='R'`, no `AD_Window_ID` exists at all, in Go or in core AD. |
| Facturas de venta (Finance RO; Sales, full) | sales-invoice | `167` | High |
| Facturas de compra (Finance RO; Purchasing, full) | purchase-invoice | `183` | High |
| Pedidos de venta (Sales, full) | sales-order | `143` | High |
| Presupuestos (Sales, full) | sales-quotation | `6CB5B67ED33F47DFA334079D3EA2340E` | High |
| Clientes (Sales, full) | contacts | `123` | High, but see finding below |
| Contactos (Sales, full) | contacts | `123` | High, but see finding below — **same window as Clientes** |
| Tarifas (Sales, full) | price-list | `146` | High |
| Productos (Sales RO; Purchasing full; Inventory full) | product | `140` | High |
| Pedidos de compra (Purchasing, full) | purchase-order | `181` | High |
| Proveedores (Purchasing, full) | contacts | `123` | High, but see finding below — **same window as Clientes/Contactos** |
| Inventario (Purchasing, RO) | physical-inventory | `168` | Moderate — see "Stock vs Inventario" finding below |
| Almacenes (Inventory, full) | warehouse | `139` | High |
| Movimientos de inventario (Inventory, full) | goods-movements | `170` | Moderate-high — ES name is "Movimiento entre almacenes" (warehouse-to-warehouse transfer), the closest Go-exposed match |
| Stock (Inventory, full) | physical-inventory | `168` | Moderate — see finding below |
| Entradas de mercancía (Inventory, full) | goods-receipt | `184` | High — semantic match (incoming goods from vendor) |
| Salidas de mercancía (Inventory, full) | goods-shipment | `169` | High — semantic match (outgoing goods to customer) |

**Finding — "Clientes"/"Contactos"/"Proveedores" all collapse to the SAME
window.** Etendo's Business Partner model is unified: there is no separate
AD window for customers vs. vendors vs. generic contacts — one window
(`contacts` spec, `AD_Window_ID 123`, "Business Partner"/"Terceros") serves
all three business-facing concepts, differentiated by BP flags
(`iscustomer`/`isvendor`), not by window. So the design table's 3 separate
line items (Sales' "Clientes", Sales' "Contactos", Purchasing's
"Proveedores") produce only **one** distinct `AD_Window_Access` row per role
(Sales gets one row for window `123`; Purchasing gets its own separate row
for the same window `123`) — not three. This is expected Etendo behavior,
not a mapping defect.

**Finding — "Stock" (Inventory) and "Inventario" (Purchasing RO) both
resolve to the same window, `physical-inventory` (168), because no
Go-exposed window is literally titled either term.** The only inventory-
quantity window in the Go-exposed catalog is `physical-inventory`
("Inventario físico"/Physical Inventory) — there is no separate Go-exposed
"Stock" window (core has several stock-related windows/reports, e.g. "Stock
Reservation", none Go-exposed). Both business terms were resolved to the
same `AD_Window_ID`, flagged here as a judgment call rather than a certain
match.

## Correction to the ETP-4509 task brief — no CRUD-flag columns on AD_Window_Access

The task brief assumed `AD_Window_Access` exposes granular flags (e.g.
`allowview`/full CRUD flags) to represent the 3-tier model. **This table has
no such columns in this Etendo version** — confirmed via
`information_schema.columns`: `ad_window_access` has exactly one access flag,
`isreadwrite` (`Y`/`N`), plus the standard audit/active columns (`inherited_from`
and a module-added `em_smfmu_mobileview` are also present but irrelevant
here). This actually matches (and was already anticipated by) the note in
the ETP-4508 section above ("`ad_window_access`/`ad_process_access` have a
single `isreadwrite` (Y/N) flag ... matching the handoff doc's 3-tier
model"). Final representation used:

- **No row** → NONE (role cannot open the window)
- **Row, `isreadwrite='N'`** → READ-ONLY
- **Row, `isreadwrite='Y'`** → FULL

`AD_ORG_ID` is always `'0'`, matching the existing GOClient Admin /
`CreateRoleStep` convention (role-level access, not org-scoped).
`AD_PROCESS_ACCESS` has the identical shape (`isreadwrite` only).

## AD_Process_Access — judged OUT OF SCOPE for this pass

**Decision: do not seed `AD_Process_Access` in ETP-4509.** Reasoning:

1. The Jira acceptance criteria for ETP-4509 explicitly scope this task to
   `AD_Window_Access` rows only; the business-term table is entirely
   window-based (no process/report is named anywhere in it).
2. Determining "the processes associated with each window" is not a
   well-defined, bounded set — Etendo windows carry an open-ended list of
   toolbar/document actions (Complete, Void, Close, Reactivate, print/export
   processes, etc.), and picking which of those each role should run per
   tier is a separate product decision this ticket does not make.
3. Unlike the window table, there is no equivalent "process access" tier
   table anywhere in the design doc or Jira to drive a mechanical mapping —
   inventing one here would be scope creep, not resolution of ambiguity.

**However, this is very likely a real functional gap worth flagging
explicitly, not just a scoping technicality.** Because the 4 roles are
`ismanual='Y'` (mandatory, see the ETP-4508 section above), core's
`AD_ROLE_TRG` trigger — which auto-grants blanket `AD_Process_Access` for
non-manual roles — never touches them. Confirmed live: all 4 roles show
**zero** `AD_Process_Access` rows even after this task's `AD_Window_Access`
seeding. In practice this means a Finance/Sales/Purchasing/Inventory user
**cannot run any document action** (e.g. "Complete" a Sales Order,
"Process" a payment, generate a report) even on a window they have FULL
`AD_Window_Access` to — only CRUD-via-grid would work. **Recommend this be
picked up explicitly as a near-term follow-up** (either a new Jira task or
folded into ETP-4510's UI-enforcement phase), since without it the 4
operational roles are functionally read-mostly regardless of their
`AD_Window_Access` tier.

## Delivery — `AD_WINDOW_ACCESS.xml`

Same convention as ETP-4508: `cli/sql/goclient-seed-window-access.sql` is a
**local dev-seeding convenience script only**; the authoritative, tracked
artifact is
`{etendo_root}/modules/com.etendoerp.go/referencedata/sampledata/GOClient/AD_WINDOW_ACCESS.xml`
(newly created — did not exist before this task), transcribed from the live
DB rows after running the script, in ascending-alphanumeric-ID order,
identical field layout to the pre-existing `F_B_International_Group`/
`QA_Testing` clients' own `AD_WINDOW_ACCESS.xml` templates (`AD_WINDOW_ACCESS_ID`,
`AD_WINDOW_ID`, `AD_ROLE_ID`, `AD_CLIENT_ID`, `AD_ORG_ID`, `ISACTIVE`,
`CREATED`, `CREATEDBY`, `UPDATED`, `UPDATEDBY`, `ISREADWRITE`).
No `AD_PROCESS_ACCESS.xml` was created (out of scope, see above).

## Verification (live GOClient DB, 2026-07-15)

```sql
SELECT r.name AS role_name, w.name AS window_name_en, wt.name AS window_name_es,
       wa.ad_window_id, wa.isreadwrite
FROM ad_window_access wa
JOIN ad_role r ON r.ad_role_id = wa.ad_role_id
LEFT JOIN ad_window w ON w.ad_window_id = wa.ad_window_id
LEFT JOIN ad_window_trl wt ON wt.ad_window_id = wa.ad_window_id AND wt.ad_language='es_ES'
WHERE r.ad_client_id = '802509E12436405C86BA1FD5B1DF508C'
  AND r.name IN ('Finance','Sales','Purchasing','Inventory')
ORDER BY r.name, wa.isreadwrite DESC, w.name;
```

```
=== Finance (9 rows) ===
  [FULL] 118                                 Account Tree / Árbol de cuentas
  [FULL] 94EAA455D2644E04AB25D93BE5157B6D    Financial Account / Cuenta financiera
  [FULL] E547CE89D4C04429B6340FFA44E70716    Payment In / Cobros
  [FULL] 6F8F913FA60F4CBD93DC1D3AA696E76E    Payment Out / Pago
  [FULL] B917E8A7B0864ACEA9D941E3B7494E53    Simple G/L Journal / Asientos Manuales Simplificados
  [FULL] 138                                 Tax Category / Categoría de Impuesto
  [FULL] 137                                 Tax Rate / Rango impuesto
  [RO  ] 183                                 Purchase Invoice / Factura (Proveedor)
  [RO  ] 167                                 Sales Invoice / Factura (Cliente)

=== Sales (6 rows) ===
  [FULL] 123                                 Business Partner / Terceros
  [FULL] 146                                 Price List / Tarifa
  [FULL] 167                                 Sales Invoice / Factura (Cliente)
  [FULL] 143                                 Sales Order / Pedido de venta
  [FULL] 6CB5B67ED33F47DFA334079D3EA2340E    Sales Quotation / Presupuesto de ventas
  [RO  ] 140                                 Product / Producto

=== Purchasing (5 rows) ===
  [FULL] 123                                 Business Partner / Terceros
  [FULL] 140                                 Product / Producto
  [FULL] 183                                 Purchase Invoice / Factura (Proveedor)
  [FULL] 181                                 Purchase Order / Pedido de compra
  [RO  ] 168                                 Physical Inventory / Inventario físico

=== Inventory (6 rows) ===
  [FULL] 170                                 Goods Movements / Movimiento entre almacenes
  [FULL] 184                                 Goods Receipt / Albarán (Proveedor)
  [FULL] 169                                 Goods Shipment / Albarán (Cliente)
  [FULL] 168                                 Physical Inventory / Inventario físico
  [FULL] 140                                 Product / Producto
  [FULL] 139                                 Warehouse and Storage Bins / Almacén y huecos
```

Total: 26 `AD_Window_Access` rows across the 4 roles (Finance 9, Sales 6,
Purchasing 5, Inventory 6). Re-running
`cli/sql/goclient-seed-window-access.sql` a second time confirmed
idempotency (all 26 `INSERT`s report `0` rows on re-run, guarded by
`WHERE NOT EXISTS (... ad_role_id, ad_window_id ...)`).

**Open items carried forward:** "Contabilidad" and "Conciliación bancaria" for
Finance remain unresolved (documented above, not seeded) — **accepted as a
known limitation by the team (Jira comment on ETP-4509, 2026-07-15); no
further action planned.** `AD_Process_Access` was initially deferred as
out-of-scope but was **expanded into this same task** — see the section
below.

---

# ETP-4509 (expansion) — AD_Process_Access (document-action processes)

**Team decision (2026-07-15):** the AD_Process_Access gap flagged above is
real and was pulled into this task rather than deferred — with `ismanual='Y'`
(mandatory) the 4 roles get **zero** automatic process access from
`AD_ROLE_TRG`, so without this, a user could open a FULL-access window and
edit its grid, but could not run Complete/Void/Process/Reconcile/etc. on it.

## AD_Process_Access schema/semantics

Confirmed identical shape to `AD_Window_Access`: `information_schema.columns`
shows exactly one access flag, `isreadwrite` (Y/N), plus the standard
audit/active columns and `inherited_from` — **no granular
view/insert/update/delete tier**. So process access is purely
existence-based per role: a row (with `isreadwrite='Y'`, matching every
existing grant on GOClient) means the role can run that process; no row
means it can't. There is **no per-window scoping column on
`AD_Process_Access` at all** — a grant is global to the role, not tied to a
specific window, matching how the automatic non-manual grant also works
(`AD_ROLE_TRG` grants a role access to a *process*, independent of which
window(s) happen to expose it as a button). This matters mechanically: if a
role has two FULL windows that share a process (e.g. "Explode" appears as a
button on both Sales Order and Purchase Order, but as two *different*
`AD_Process_ID`s — see below), only one row per **(role, process)** pair is
needed/possible, not one per (role, process, window).

## Window → process mapping approach

**Mechanism: `AD_Field` (button reference) → `AD_Column.ad_process_id` →
`AD_Tab` → `AD_Window`.** In Etendo, a document-action/utility button on a
window (Complete, Process, Reconcile, Copy Lines, etc.) is implemented as an
`AD_Field` placed on one of the window's tabs, whose underlying `AD_Column`
carries a non-NULL `ad_process_id` (the process the button launches). This
is a **real, reliable, DB-native mechanism** — it's the exact same mechanism
`AD_ROLE_TRG` itself uses conceptually (every process reachable from a
window's own button fields), so it was validated directly against the two
existing non-manual roles:

```sql
SELECT DISTINCT c.ad_process_id, p.name, p.isreport,
  (SELECT count(*) FROM ad_process_access pa
   WHERE pa.ad_process_id = c.ad_process_id
     AND pa.ad_role_id IN ('9B8D736190724807AB256DC95F20EC5E','6A0A8D73D8284C6088DF36BDCC569161')
  ) AS granted_to_admin_guser
FROM ad_field f
JOIN ad_column c ON c.ad_column_id = f.ad_column_id
JOIN ad_process p ON p.ad_process_id = c.ad_process_id
JOIN ad_tab t ON t.ad_tab_id = f.ad_tab_id
WHERE f.isactive='Y' AND t.ad_window_id = :window_id AND p.isactive='Y';
```

**Result: 100% match.** Every button-linked process found for every one of
the 19 distinct target windows was already granted to **both** GOClient
Admin and GOuser (`2/2`), confirming the mechanism captures exactly the same
universe of processes the automatic grant would produce — no guessing
required, this is a mechanical, DB-verifiable rule: *"a role's process
access = the union of button-linked processes across the role's FULL-tier
windows."*

**No `AD_Table_ID`-based join was needed/used** — `AD_Process` does carry an
`AD_Table_ID` column in some Etendo versions, but the button-field join above
is strictly more precise (it only returns processes actually wired as a
button on that specific window's tabs, not every process that merely
operates on the same underlying table, which would over-grant reports and
unrelated utility processes tied to the same table from other windows).

**Classic document actions (Complete/Void/Close/Reactivate) are NOT separate
`AD_Process` rows** — Etendo implements them via a single generic
"Process X" button per document type (e.g. `Process Order` id `104` for
Sales/Purchase Order, `Process Invoice` id `111` for Sales/Purchase Invoice,
`Process Shipment` id `109` for Goods Receipt/Shipment, `Process Inventory
Count` id `107` for Physical Inventory), which opens a dialog offering
Complete/Void/Close/Reactivate as options. Granting that one process is
therefore sufficient to unlock the whole document-action lifecycle for that
document type — there is nothing further named "Complete" or "Void" to grant
separately.

**Finding — the SAME conceptual action (Copy Lines, Explode) is often a
DIFFERENT `AD_Process_ID` per document type.** E.g. `Copy Lines` on Sales
Order is process `211`, but on Sales Invoice it's process `210` — same name,
different ID, because each document type implements its own copy-lines
logic. **Apply:** dedup by `AD_Process_ID`, never by process name, when
building a role's process-access set (two windows both showing "Copy Lines"
still need two distinct grants if the underlying process differs).

## Read-only-tier decision: zero process access granted

For the 4 windows carrying READ-ONLY tier somewhere in the design
(`sales-invoice`/`purchase-invoice` for Finance, `product` for Sales,
`physical-inventory` for Purchasing), the button-linked processes found were
inspected individually for a plausible "safe, view-only" candidate
(Print/Export-style actions the coordinator suggested might be reasonable
even read-only):

| RO window | Button processes found | Any view-only candidate? |
|---|---|---|
| sales-invoice (Finance RO) | APRM Process Invoice, Calculate Promotions, Change Debt Payment, Copy Lines, Explode, Generate Receipt from Invoice, Process Invoice, Update Payment Plan | No — all state-changing |
| purchase-invoice (Finance RO) | APRM Process Invoice, Change Debt Payment, Copy Lines, Explode, Generate Receipt from Invoice, Process Invoice, Update Payment Plan | No — all state-changing |
| product (Sales RO) | Create Variants, Verify BOM | No — both create/modify master data |
| physical-inventory (Purchasing RO) | Create Inventory Count List, Process Inventory Count, Update Quantity | No — all state-changing |

**Decision: grant ZERO `AD_Process_Access` rows for any role/window pair at
the READ-ONLY tier.** None of the processes wired as buttons on these 4
windows are print/export/view-type actions — Etendo's grid/form-level
Print/Export are generic toolbar actions available independent of
`AD_Process_Access` (they are not gated by a specific process grant the way
document actions are), so there was no candidate to grant that would
preserve "read-only" in spirit. Every available button is a genuine
state-changing document action (Process/Copy/Generate/Update/Create), so
granting any of them would silently upgrade the read-only tier to
effectively-full for that window. This reasoning is recorded here rather
than mechanically re-applied per window, since it turned out to be a clean
"no" in all 4 cases — there was no ambiguous middle case requiring a
per-window judgment call.

## Final per-role process sets (deduped by `AD_Process_ID`, FULL-tier windows only)

- **Finance (14 processes)** — from `simple-g-l-journal` (Add Payment From
  Journal ×2) + `financial-account` (Bank Statement Process/Force, Import
  Statement, Reconcile ×2, Reconciliation Details/Process Force/Summary,
  Transaction Process) + `payment-out`/`payment-in` (Execute Payment, Payment
  Process, Reverse Payment — same 3 process IDs shared by both windows).
  `chart-of-accounts`, `tax`, `tax-category` have **zero** button processes
  (pure master-data windows, nothing to grant).
- **Sales (16 processes)** — from `sales-order` (Calculate Promotions, Change
  Debt Payment, Copy Lines[211], Copy Product Template, Explode[order-type],
  Process Order) + `sales-invoice` (APRM Process Invoice, Copy Lines[210],
  Explode[invoice-type], Generate Receipt from Invoice, Process Invoice,
  Update Payment Plan) + `sales-quotation` (adds Create Order) + `contacts`
  (Create Invoice (Volume Discount)) + `price-list` (Create Price List,
  Create Price List Version).
- **Purchasing (13 processes)** — from `purchase-order` + `purchase-invoice`
  (same process families as Sales' order/invoice, but Purchasing-specific
  process IDs where they differ) + `contacts` (Create Invoice (Volume
  Discount)) + `product` (Create Variants, Verify BOM).
- **Inventory (13 processes)** — from `product` (Create Variants, Verify
  BOM) + `goods-movements` (Move a Storage Bin, Process Movements) +
  `physical-inventory` (Create Inventory Count List, Process Inventory
  Count, Update Quantity) + `goods-receipt`/`goods-shipment` (Calculate
  Freight Amount, Explode[receipt-type], Process Shipment, Process Shipment
  Java, Update Attributes from Shipment; Generate Invoice from Receipt only
  on `goods-receipt`). `warehouse` has **zero** button processes.

Total: **56** `AD_Process_Access` rows (Finance 14, Sales 16, Purchasing 13,
Inventory 13).

## Delivery — `AD_PROCESS_ACCESS.xml`

Same convention as `AD_WINDOW_ACCESS.xml`: `cli/sql/goclient-seed-process-access.sql`
is a **local dev-seeding convenience script only** (built by a driver script
that also executed the same statements against the live DB, so file and DB
state match exactly); the authoritative, tracked artifact is
`{etendo_root}/modules/com.etendoerp.go/referencedata/sampledata/GOClient/AD_PROCESS_ACCESS.xml`
(newly created — did not exist before this task), transcribed from the live
DB rows, ascending-alphanumeric-ID order, identical field layout to the
pre-existing `F_B_International_Group`/`QA_Testing` clients'
`AD_PROCESS_ACCESS.xml` templates (`AD_PROCESS_ACCESS_ID`, `AD_PROCESS_ID`,
`AD_ROLE_ID`, `AD_CLIENT_ID`, `AD_ORG_ID`, `ISACTIVE`, `CREATED`,
`CREATEDBY`, `UPDATED`, `UPDATEDBY`, `ISREADWRITE`). Every `AD_ROLE_ID`
written was cross-checked byte-for-byte against the live `AD_ROLE.xml`
entries before use (same 4 IDs already verified for `AD_WINDOW_ACCESS.xml`
above).

## Verification (live GOClient DB, 2026-07-15)

```sql
SELECT r.name, count(*) FROM ad_process_access pa
JOIN ad_role r ON r.ad_role_id = pa.ad_role_id
WHERE r.ad_client_id = '802509E12436405C86BA1FD5B1DF508C'
  AND r.name IN ('Finance','Sales','Purchasing','Inventory')
GROUP BY r.name ORDER BY r.name;
```

```
    name    | count
------------+-------
 Finance    |    14
 Inventory  |    13
 Purchasing |    13
 Sales      |    16
```

**Sanity check — every granted process is a subset of GOClient
Admin/GOuser's own automatic grants (zero over-grants):**

```sql
SELECT r.name, p.name, pa.ad_process_id
FROM ad_process_access pa
JOIN ad_role r ON r.ad_role_id = pa.ad_role_id
JOIN ad_process p ON p.ad_process_id = pa.ad_process_id
WHERE r.ad_client_id = '802509E12436405C86BA1FD5B1DF508C'
  AND r.name IN ('Finance','Sales','Purchasing','Inventory')
  AND NOT EXISTS (
    SELECT 1 FROM ad_process_access pa2
    WHERE pa2.ad_process_id = pa.ad_process_id
      AND pa2.ad_role_id IN ('9B8D736190724807AB256DC95F20EC5E','6A0A8D73D8284C6088DF36BDCC569161')
  );
-- 0 rows
```

Re-running `cli/sql/goclient-seed-process-access.sql` a second time confirmed
idempotency: all 56 `INSERT`s reported `0` rows on re-run.

**Open items carried forward:** "Contabilidad" and "Conciliación bancaria"
for Finance remain unresolved — accepted as a known limitation (Jira
comment, no further action). No AD_Process_Access-specific open items
remain; Phase 2 (ETP-4510+) UI enforcement should treat "no row" as "hide
the action" for both windows and processes, consistently.
