---
name: stored-computed-column
description: >
  Create, change or debug a stored computed column in com.etendoerp.go (the EPL-1807
  engine: AD_COLUMN Computation_Mode / Refresh_Mode, AD_COLUMN_COMP_DEPENDENCY,
  AD_COMPDEP_WATCHED_COL, ad_scd_* triggers). Use it whenever a list column needs a value
  derived from another table, whenever a derived column shows a stale or frozen value, and
  before reviewing a PR that adds one. Triggers on: "columna computada", "stored computed
  column", "Computation_Mode", "ad_scd", "the column never updates", "always shows the same
  value", "derived column", "make this column filterable".
---

# Stored Computed Columns

## Why this skill exists

The engine works. What does not work is finding out when you got it wrong: **every failure mode
is silent and produces a column that looks healthy** — it renders, it filters, it sorts, and it
never changes. `update.database` finishes green either way.

ETP-5216 shipped a dependency that generated no trigger and it took a full day to find, after
the column had already been declared working in the UI. Before that, ETP-4391 spent months
showing "Pendiente" on every invoice because a response injector had died behind a swallowed
exception. Same symptom, different cause. Assume you cannot see the failure; verify it.

## When a stored computed column is the right answer

A list column whose value comes from **another table** or from a **computation**. That value must
be a real database column, or the backend cannot filter or sort it and the core drops it from the
advanced filter in silence (`isFilterableColumn`).

Do NOT reach for it when the value is already an AD column of the same table (just declare
`column:`), when it only recomposes existing columns visually (use `multiField`), or when the cell
is purely presentational (buttons, icons).

Never substitute a `NeoHandler.afterHandle()` injection: the field is invisible to the backend
query, so it is unfilterable, unsortable, and its failure is undetectable from the UI.

## Mode policy (module default)

| Axis | Default | Fall back only when |
|---|---|---|
| `Computation_Mode` | **`S` stored** — physical column, filterable and sortable | `V` only when the value genuinely cannot be stored (it depends on `now()`) |
| `Refresh_Mode` | **`S` synchronous** — recomputed in the same transaction, exact at read time | `Q` only for genuinely heavy computations (the reference case is stock / `m_storage_detail`); `M` only for one-off operator-driven population |

`S`/`S` has one consequence to design around, not to avoid: **a computation error rolls back the
whole business transaction**. A broken function does not show a wrong badge — it makes the record
impossible to save. So make the function total, do not downgrade to `Q` out of caution.

`com.etendoerp.go` targets PostgreSQL only; do not weaken a design for Oracle portability — with
the single exception of `FROM dual` below, which the generator enforces.

## The five artifacts

All in `{etendo_root}/modules/com.etendoerp.go/src-db/database/`. Generate every new id with
`make uuid` — never invent or copy one. Look up existing ids from the DB, never guess.

1. **`model/functions/<FN_NAME>.xml`** — the PL/pgSQL function. One parameter: the target table's
   PK. See the total-function rules below.
2. **`model/modifiedTables/<TARGET_TABLE>.xml`** — the new physical column (`EM_<prefix>_<Name>`).
3. **`model/modifiedTables/<SOURCE_TABLE>.xml`** — an index on the FK the resolver walks, plus any
   column the function orders by. Validator rule V16, and it keeps the enqueue trigger off a seq
   scan during ordinary DML.
4. **`sourcedata/AD_COLUMN.xml`** + **`AD_ELEMENT.xml`** — the column with `COMPUTATION_MODE`,
   `REFRESH_MODE`, `COMPUTATION_FUNCTION`, `COMPUTATION_SEQUENCE_NUMBER`.
5. **`sourcedata/AD_COLUMN_COMP_DEPENDENCY.xml`** + **`AD_COMPDEP_WATCHED_COL.xml`** — one
   dependency per source table, plus the columns whose change should trigger a recompute.

Reading a table from another module also needs a row in **`AD_MODULE_DEPENDENCY.xml`**. Required
for `S` (a dependency cannot point at an undeclared module's table) and equally real, though
invisible, for `V`. Do not hide a cross-module read inside raw SQL.

## Trap 1 — `FROM dual` is mandatory

```sql
SELECT COALESCE(NEW.c_invoice_id, OLD.c_invoice_id) FROM dual
```

A resolver with no `FROM` clause is valid PostgreSQL and invalid Oracle, so
`GenerateStoredComputedTriggers` rejects it — **as a `log.warn`, not an error**:

```
WARN — Skipping SCD dependency <id> — non-portable resolver SQL (missing FROM clause)
```

`update.database` finishes green, every other dependency deploys, yours is skipped, no enqueue
trigger is created, and the column keeps whatever the initial population gave it forever. Etendo
ships `public.dual` on PostgreSQL, so the clause costs nothing.

Both canonical patterns need it — the `COALESCE` form for an immutable target, and the
`UNION` form for a reparentable FK (where one update must recompute the old parent AND the new
one).

## Trap 2 — the function must be TOTAL

`Refresh_Mode = 'S'` runs it inside the business transaction. Any exception rolls back the user's
save. Every one of these must return a value, never raise:

- null/blank target id
- **zero rows** — use plain `SELECT … INTO` (assigns NULL), never `INTO STRICT` (raises)
- **several rows** — `ORDER BY … LIMIT 1`, with a deterministic tie-break. The engine writes
  unconditionally on every recompute, so a non-deterministic pick makes `ad_scd_check` report
  permanent phantom drift
- **a row exists but the value is NULL or blank**
- **an unexpected value** — pass it through unchanged; normalising invents information and raising
  blocks the save
- a final `EXCEPTION WHEN OTHERS THEN RETURN '<neutral>'`

Reference implementation: `model/functions/ETGO_GET_TBAI_STATUS.xml`, which documents all five
cases inline.

**Size the target column for the longest value the source can ever hold.** Copying the source
width is the floor, not a safe default — an overflow here is a save that fails, not a truncated
badge.

## Deploy

```bash
cd {etendo_root}
./gradlew update.database     # generates the triggers AND populates a new column inline (<100k rows)
./gradlew export.database     # only if the AD rows were edited in the DB
```

Changing the function of an **existing** column regenerates the triggers but **deliberately leaves
stored values untouched**. A manual rebuild is then mandatory (see below).

## Verify — a green build is NOT evidence

```sql
-- 1. the enqueue trigger exists on the SOURCE table
SELECT tgname FROM pg_trigger
 WHERE tgrelid='<source_table>'::regclass AND NOT tgisinternal;
-- expect ad_scd_<dependency_id>_trg

-- 2. nothing is left un-recomputed
SELECT ad_scd_check('<AD_Column_ID>');          -- expect 0

-- 3. the value actually reacts
--    change a row in the source table, then re-read the target column
```

**Step 3 is the only one that proves the chain.** Steps 1 and 2 pass on a column that is still
wrong. Asserting the initial value proves the backfill ran, nothing more — and if the source table
is empty in your environment, every row will hold the "no data" answer and a broken column is
indistinguishable from a working one.

Manual rebuild when needed (idempotent):

```sql
SELECT ad_scd_rebuild('<AD_Column_ID>');   -- no client filter
SELECT ad_scd_check('<AD_Column_ID>');     -- expect 0
```

The AD process *Rebuild Stored Column* does the same but is scoped to the caller's client unless
the caller is System.

## Debugging a column that never updates

Work down this list; each step rules out a whole class of cause.

1. `SELECT tgname FROM pg_trigger WHERE tgrelid='<source>'::regclass AND NOT tgisinternal;`
   → no `ad_scd_*` trigger means the dependency was skipped. Go to 2.
2. Re-run `./gradlew update.database --info 2>&1 | tee /tmp/upd.log` and
   `grep -iE "scd|GenerateStored" /tmp/upd.log`. The `log.warn` names the exact reason.
   **No SCD lines at all** means `update.database` aborted earlier — read the top of the log
   (a frequent one is `Database has local changes`, which stops the run before any module script).
3. Run the generator's own query against the DB, filtered to your dependency id — it is
   `QUERY_DEPS` in
   `{etendo_root}/src-util/modulescript/src/org/openbravo/modulescript/GenerateStoredComputedTriggers.java`.
   If it returns no row, the metadata is the problem (`isactive`, `computation_mode <> 'S'`, a
   broken join). If it returns your row, the metadata is fine and the reason is a per-row gate,
   which step 2 already printed.
4. Only then suspect the function itself: call it directly with a known id and compare.

**Never hand-create the trigger to unblock yourself.** It would be an object outside the
generator's control: the drift check flags it and the next `update.database` overwrites it.

## Fix the documentation you copied from

The wrong resolver in ETP-5216 came from the engine's own docs, whose two canonical patterns
omitted `FROM dual`. If an example misleads you, correct it in the same change — the next person
copies the same example.

Full engine reference: `{etendo_root}/modules/com.etendoerp.go/docs/STORED-COMPUTED-COLUMNS.md`
