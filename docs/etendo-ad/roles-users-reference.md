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
been reverted (the role had zero dependents in any FK column with
`ON DELETE NO ACTION` — `AD_User_Roles`, `AD_Window_Access`,
`AD_Process_Access`, `AD_Form_Access`, `AD_Role_Inheritance`,
`AD_Role_OrgAccess` all showed 0 rows; the only rows referencing it were in 3
OB UI framework tables — `obkmo_widget_class_access`,
`obuiapp_process_access`, `obuiapp_view_role_access` — all via
`ON DELETE CASCADE` FKs and present in identical counts on every role, i.e.
framework bootstrap noise, not real assignment; they were cascade-deleted
along with the role). It was deleted from the live GOClient DB and the
`INSERT` block removed from `cli/sql/goclient-seed-roles.sql`.

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
GOClient already had 2 roles before this task, auto-created by core Etendo's
`InitialClientSetup` (the standard "create-client" wizard invoked by
`EtendoGoJwtServlet.createClient` for every new tenant, GOClient included):

| Role | `AD_Role_ID` | `userlevel` | `is_client_admin` |
|---|---|---|---|
| GOClient Admin | `9B8D736190724807AB256DC95F20EC5E` | ` CO` | `Y` |
| GOuser | `6A0A8D73D8284C6088DF36BDCC569161` | `  O` | `N` |

**Superseded decision (originally 2026-06-XX, corrected 2026-07-15):** the
first draft of this task created a brand-new "Administrator" `AD_Role`
alongside `GOClient Admin`, reasoning that the 5-role model needed an
identical, stable literal name across tenants. **This was wrong** — it is
resolved by *predicate*, not by *name or ID*:

1. **Name is not portable, but that's not a problem — resolve by
   `is_client_admin='Y'` instead of by name.** `InitialClientSetup` names the
   admin role `"<ClientName> Admin"` (e.g. "GOClient Admin", "Acme Corp
   Admin"). ETP-4509/4515/4516 must never hardcode the literal "Administrator"
   string against `AD_Role.name` — they resolve the tenant's admin role via
   `WHERE ad_client_id = :client_id AND is_client_admin = 'Y'`, which is
   already stable and portable across every tenant without needing a fixed
   name or ID. See the "Administrator resolution" section above.
2. **Same semantics, no coupling risk.** `GOClient Admin` already carries
   exactly the semantics the design doc wants for "Administrator" — Client+Org
   level, `is_client_admin='Y'`, non-manual (blanket auto-granted access kept
   in sync forever by `AD_ROLE_TRG`). Reusing it via the `is_client_admin`
   predicate (the same mechanism `EtendoGoJwtDalHelper.findClientAdminUserRole`
   already uses) introduces no coupling beyond what already exists — no
   renaming, no touching the live role at all.
3. **No ID collision, and now no duplicate role either.** The freshly-created
   "Administrator" role (`451EED23EC0A44679F15C6789A4EB980`) was deleted
   after confirming it had zero real dependents (see "Administrator
   resolution" above) — GOClient does not carry a redundant admin role.

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

**Correction record (2026-07-15, part 2 — Administrator role removal):** a
further review found that the seeded "Administrator" `AD_Role`
(`451EED23EC0A44679F15C6789A4EB980`) should never have been created as a new
record — see the "Administrator resolution" section near the top of this doc
for the full rationale. Before deletion, every FK column referencing
`ad_role_id` across the schema was checked for dependent rows:
`AD_User_Roles`, `AD_Window_Access`, `AD_Process_Access`, `AD_Form_Access`,
`AD_Role_Inheritance`, `AD_Role_OrgAccess`, and all other `ON DELETE NO
ACTION` FKs to `ad_role` showed **0** rows for this role. The only non-zero
counts were in 3 OB UI framework tables via `ON DELETE CASCADE` FKs —
`obkmo_widget_class_access` (27), `obuiapp_process_access` (138),
`obuiapp_view_role_access` (1) — present in the **exact same counts on every
one of the 5 roles**, confirming they are framework-bootstrap rows populated
on role creation regardless of `ismanual`, not evidence of real usage. The
role was deleted (`DELETE FROM ad_role WHERE ad_role_id =
'451EED23EC0A44679F15C6789A4EB980'`), cascading the 3 framework tables'
rows along with it. `cli/sql/goclient-seed-roles.sql` was updated to remove
the Administrator `INSERT` block entirely — the script now seeds 4 roles.

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
