# Module Isolation Spec — Multi-Localization Architecture

## Status: implemented
## Epic: ETP-4343
## Jira: ETP-4351
## Related: ETP-4346 (AR workspace), ETP-4347 (publish @schema-forge/cli)

---

## Problem

Currently `push-to-neo.js` writes all `ETGO_SF_*` records (specs, entities, fields)
to the same Etendo module. When multiple localization workspaces share the same
Etendo installation, their pipeline artifacts mix in a single module, making it
impossible to export/deploy each localization independently.

---

## Goal

Every workspace (`tools/app-shell/` for Spain, `tools/etendo-go-ar/` for Argentina,
future localizations) writes its `ETGO_SF_*` records tagged with its own
`AD_Module_ID`. Export, versioning, and deployment become per-module and fully
isolated.

---

## Current state

```
etendo_core/
  modules/
    com.etendoerp.go/     ← all ETGO_SF_* records (Spain + shared logic)
  DB: etendo (single)

tools/app-shell/          ← Spain workspace
tools/etendo-go-ar/       ← AR workspace → points to SAME etendo_core
```

---

## Target state

```
etendo_core/                      etendo_core_ar/           (new install)
  modules/                          modules/
    com.etendoerp.go/                 com.etendoerp.go/     (same repo, shared)
    [com.etendoerp.go.es/ — future]   com.etendoerp.go.ar/  (already exists)
  DB: etendo                        DB: etendo_ar            (new)

tools/app-shell/  → etendo_core    tools/etendo-go-ar/ → etendo_core_ar
SF_MODULE_ID = <go module id>      SF_MODULE_ID = 48E18B28715944AEBDDDE0FBE3DE8C1F
```

---

## Module IDs

| Module | AD_Module_ID | Status |
|--------|-------------|--------|
| `com.etendoerp.go` | query DB: `SELECT ad_module_id FROM ad_module WHERE javapackage = 'com.etendoerp.go'` | existing |
| `com.etendoerp.go.ar` | `48E18B28715944AEBDDDE0FBE3DE8C1F` | exists, exported |

---

## Isolation mechanism — `SF_MODULE_ID`

`push-to-neo.js` reads `process.env.SF_MODULE_ID` and passes it as `AD_Module_ID`
on every INSERT into `ETGO_SF_SPEC`, `ETGO_SF_ENTITY`, `ETGO_SF_FIELD`.

**Fallback:** if `SF_MODULE_ID` is not set, behavior is unchanged (uses the
hardcoded `com.etendoerp.go` module ID as today). This ensures zero regression
for existing setups that haven't adopted the env var yet.

Each workspace exports `SF_MODULE_ID` from its `.env.local` and `Makefile`:

```bash
# tools/etendo-go-ar/.env.local
SF_MODULE_ID=48E18B28715944AEBDDDE0FBE3DE8C1F
ETENDO_GRADLE_PROPERTIES=../../etendo_core_ar/gradle.properties

# tools/app-shell/.env.local  (add)
SF_MODULE_ID=<com.etendoerp.go module id>
```

When Spain eventually splits into `com.etendoerp.go.es`, only the env var changes —
zero code changes required.

---

## Changes required

### `cli/src/push-to-neo.js`

Read `SF_MODULE_ID` and propagate to the neo-writer calls:

```js
const SF_MODULE_ID = process.env.SF_MODULE_ID ?? null;
// pass to upsertSpec / upsertEntity / upsertField
```

### `cli/src/neo-writer.js`

Accept optional `moduleId` param in `upsertSpec`, `upsertEntity`, `upsertField`.
Use it as `AD_Module_ID` in the INSERT statement when provided.

### `tools/etendo-go-ar/`

- `.env.local` — add `SF_MODULE_ID` and `ETENDO_GRADLE_PROPERTIES`
- `Makefile` — export both vars (already exports `SF_ROOT`)

### `tools/app-shell/`

- `.env.local` — add `SF_MODULE_ID` for Spain (query DB for module ID)

### `docs/parallel-app-guide.md`

Add section: "Required env vars" — document `SF_MODULE_ID` as mandatory for any
parallel workspace that needs isolated module export.

---

## etendo_core_ar setup

Steps to provision the AR Etendo installation:

1. Install Etendo Core at `schema-forge/etendo_core_ar/`
2. Add module `com.etendoerp.go` (same version as Spain)
3. Add module `com.etendoerp.go.ar` (already exported, install from repo)
4. Create database `etendo_ar`
5. Run `./gradlew install` + `./gradlew update.database`
6. Configure `etendo_core_ar/gradle.properties` with `etendo_ar` credentials
7. Add `etendo_core_ar/` to `.gitignore` (already done in ETP-4346)

---

## Make commands for project switching

Each workspace has its own `make` target, but the root `Makefile` also needs
convenience commands so developers can switch the active project context without
manually editing `.env.local` files.

Proposed commands (root `Makefile`):

```makefile
# Switch active project to Spain (etendo_core/)
switch-to-es:
	@cp tools/app-shell/.env.es tools/app-shell/.env.local
	@echo "Switched to ES — SF_MODULE_ID set to com.etendoerp.go module"

# Switch active project to Argentina (etendo_core_ar/)
switch-to-ar:
	@cp tools/etendo-go-ar/.env.ar tools/etendo-go-ar/.env.local
	@echo "Switched to AR — SF_MODULE_ID set to 48E18B28715944AEBDDDE0FBE3DE8C1F"

# Show current active project
project-status:
	@echo "ES module: $$(grep SF_MODULE_ID tools/app-shell/.env.local 2>/dev/null || echo 'not set')"
	@echo "AR module: $$(grep SF_MODULE_ID tools/etendo-go-ar/.env.local 2>/dev/null || echo 'not set')"
```

Each workspace stores a committed `.env.<locale>` template with all required vars
(no secrets). `.env.local` is gitignored and is set by `make switch-to-*`.

---

## Backend exclusivity constraint

**Critical:** A single Etendo instance serves ONLY one localization. There is no
mixed-mode runtime where `etendo_core/` serves both ES and AR windows simultaneously.

```
etendo_core/  (Spain)     →  module com.etendoerp.go        →  ETGO_SF_* rows (ES only)
etendo_core_ar/ (AR)      →  module com.etendoerp.go.ar     →  ETGO_SF_* rows (AR only)
```

This constraint is architectural, not enforced in code. It is maintained by:
- `push-to-neo.js` writes to only one DB at a time (credentials from one `gradle.properties`)
- `SF_MODULE_ID` tags all records to a single module
- `./gradlew export.database` in each `etendo_core_*` exports only its own module's data

There is intentionally NO mechanism to push from `tools/etendo-go-ar/` to `etendo_core/`
or vice versa. Configuration mistakes (wrong `ETENDO_GRADLE_PROPERTIES`) would write to
the wrong DB — the switch commands above prevent this by keeping `.env.local` consistent.

---

## Acceptance criteria

- [ ] `make regen PUSH_TO_NEO=1` from `tools/etendo-go-ar/` writes all `ETGO_SF_*`
      records with `AD_Module_ID = 48E18B28715944AEBDDDE0FBE3DE8C1F`
- [ ] `make regen PUSH_TO_NEO=1` from `tools/app-shell/` writes with Spain module ID
- [ ] `./gradlew export.database` from `etendo_core_ar/` only exports AR module records
- [ ] CLI tests pass (0 failures, `make test`)
- [ ] No regressions in existing Spain windows
- [ ] `SF_MODULE_ID` documented in `docs/parallel-app-guide.md`

---

## Future work (out of scope now)

- Split `com.etendoerp.go` → `com.etendoerp.go` (core engine) + `com.etendoerp.go.es`
- Rename `etendo_core/` → `etendo_core_es/`
- Each localization gets its own DB and Etendo install
