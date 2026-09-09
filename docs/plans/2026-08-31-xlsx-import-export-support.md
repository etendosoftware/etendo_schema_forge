# Excel (.xlsx) support for import, templates and export — ETP-4997

**Status:** implemented; pending compile + manual verification
**Date:** 2026-08-31
**Scope:** the two windows that have import/export today — Contacts and Product

## Goal

Three capabilities, one format:

1. **Import** accepts `.xlsx` in addition to the `.csv`/`.txt` it accepts today.
2. **Template download** offers CSV or XLSX.
3. **Export** offers CSV or XLSX.

The point of the feature is the loop: export → edit in Excel → re-import. Anything that
breaks that loop is a bug, not a trade-off.

## Verified facts that constrain the design

Each of these was measured, not assumed. They are recorded because the design only makes
sense in their light, and because a future reader will otherwise re-litigate them.

**F1 — Apache POI 5.4.0 is already available server-side.** Declared in
`artifacts.list.COMPILATION.gradle` (its own "Office and Document Processing" section) and
deployed as `poi-5.4.0.jar`, `poi-ooxml-5.4.0.jar`, `poi-ooxml-lite-5.4.0.jar` in
`WebContent/WEB-INF/lib/`. Server-side xlsx needs no new runtime dependency, only a
`compileOnly` declaration — the same pattern the go module already uses for
`commons-lang3`, which is likewise core-provided.

**F2 — Reading xlsx must happen in the browser.** The file is chosen in the dialog and the
entire preview / column-mapping / validation / FK-resolution pipeline is client-side. There
is no server round trip to attach a parser to, so a JS reader is unavoidable.

**F3 — `xlsx` (SheetJS) on npm is disqualified.** `npm audit` reports **high** severity
(prototype pollution + ReDoS) against `xlsx@0.18.5`, which is the last release published to
npm; the fixes live only on the vendor's own CDN. `exceljs@4.4.0` carries a moderate
advisory transitively and has not been republished since 2024-12. `read-excel-file@9.3.10`
(2026-08) and `write-excel-file@4.1.1` (2026-06) audit clean, are MIT, are single-purpose,
and are an order of magnitude smaller unpacked. **Chosen: the read/write-excel-file pair.**

**F4 — Text cells round-trip byte-exactly; typed cells do not.** Measured by writing a
workbook and reading it back:

| written as | read back as |
|---|---|
| `'08018'` (text) | `'08018'` — leading zero intact |
| `'31-08-2026'` (text) | `'31-08-2026'` |
| `'1.234,56'` (text) | `'1.234,56'` |
| `'=SUM(A1)'` (text) | `'=SUM(A1)'` — a literal string |
| `8018` (number) | `8018` — **the leading zero is gone** |
| a `Date` cell | a `Date` object |

This is why every cell we write is a string. Note the last row of the text column: a text
cell in xlsx is **inert** — it is not a formula, because a formula is a different cell type
entirely. The CSV apostrophe neutralization (`csvField`, and its server-side twin in
`NeoCsvExportService`) must therefore **not** be applied to xlsx, where it would appear as
literal garbage in the cell.

The number row's lost zero happens inside Excel, before our code ever sees the file, and is
unrecoverable. It is mitigated at the template (see §3), not at the parser.

**F5 — A blank cell reads as `null`, not `''`.** `parseDelimited` yields `''` for a missing
cell. Nothing downstream (`mapColumns`, `validateRows`, `rowValidators`, the review queue)
has ever received a `null`. This single mismatch would have produced exactly the kind of
silent divergence this feature must avoid, and it is the reason §1 is written as a contract
rather than as a parser.

**F6 — `.txt` is pre-existing and intentional.** `parseDelimited`'s `DELIMITER_CANDIDATES`
includes the tab, with a dedicated `'detects tab'` test — that is the format Spanish Excel
produces via *Guardar como → Texto (delimitado por tabulaciones)*. It stays. It is, however,
not covered by any E2E spec: functional but unprotected.

**F8 — A date cell materializes at UTC midnight, so local getters lose a day.** Measured:
a cell written as 2026-08-31 reads back as `2026-08-31T00:00:00.000Z`, whose local getters
on an `America/Cordoba` (UTC-3) host give **30 August**, not 31. An xlsx serial date is a
timezone-less calendar date, so it must be read with `getUTCDate()`/`getUTCMonth()`/
`getUTCFullYear()`. Reading it with local getters is the ETP-4031 / ETP-4850 bug class, and
it would have shifted every date in every imported Excel by one day for every user at a
negative UTC offset — silently, since a valid-looking date is not an error.

**F9 — Both libraries expose a `./universal` entry.** Neither has an ESM main; the bare
specifier fails to resolve under Node with `ERR_PACKAGE_PATH_NOT_EXPORTED`. `./universal`
resolves in both the browser (Vite) and Node, which is what lets the adapter be a single
module shipped to the browser and exercised under `node --test`.
`write-excel-file/universal` returns `{ toBlob }`.

**F7 — `window.import.formats` is dead config.** Both windows declare `["csv","txt"]` and
nothing reads it: `ImportDropzone` hardcodes `accept='.csv,.txt'` and hardcodes its hint
text. `ListView` already passes the whole `window.import` block as `config`, so
`config.formats` is reachable inside `ImportDialog` with no new prop.

## Design

### §1 — One parser boundary, defined as a contract

Add `parseXlsx(file)` whose contract is *to return exactly what `parseDelimited` returns*:

```
{ headers: string[], rows: Array<Record<string, string>> }
```

`ImportDialog` dispatches on the file's extension: `.csv`/`.txt` keep
`decodeCsvBuffer` + `parseDelimited` untouched; `.xlsx` goes to the new adapter. Everything
downstream — `mapColumns`, `validateRows`, `resolveForeignKeys`, `dedupeRows`,
`buildOperations`, `importEngine`, `ImportReviewQueue` — is unchanged and cannot tell where
a row came from. That is the whole safety argument: the xlsx path inherits every behaviour
the CSV path has already earned, including the coded-value synonym tables, the FK resolvers
and the DB dedupe.

The adapter owes these normalizations, one per verified fact:

- `null` → `''` (F5).
- number → its string form (F4).
- `Date` → `dd-MM-yyyy`, the same shape the CSV export writes, read with **UTC getters**
  (F8) — never local ones, and *not* through `formatCalendarDate`/`parseCalendarDate`: those
  exist for date-only **strings** and build their `Date` with the local-time constructor.
  Handed an already-correct UTC-midnight instant they would reintroduce the very off-by-one
  day they were written to prevent.
- headers trimmed, and the **same duplicate-header rejection** `parseDelimited` performs
  (`ImportParseError`). The `*` required marker keeps being stripped downstream by
  `mapColumns.stripRequiredMarker`; the adapter must not strip it itself.
- **Multi-sheet: reject.** The reader exposes every sheet. A workbook with more than one
  non-empty sheet raises `ImportParseError` rather than importing the first and discarding
  the rest. Silently importing half a file is the same failure shape as the swallowed
  `SQLException` this ticket already chased twice.
- The reader returns `[{ sheet, data }]` even when a `sheet` option is passed, so the
  adapter unwraps rather than assuming a bare array.

### §2 — Export: `export=xlsx`

`NeoCsvExportService.tryExport` stays the entry point and gains a format branch — the class
is already "serialize a list response to a file", so this is a new format, not a sibling
service. The xlsx writing itself goes in a new `NeoXlsxExportWriter` rather than inline:
`NeoCsvExportService` is already 394 lines, and the repo has a standing rule against
growing God components.

- `SXSSFWorkbook` with a sliding row window, so the documented invariant holds: a 5000-row
  export never materializes — not in the browser, and now not in the JVM heap either.
- Every cell written as a string (F4), which is what makes §5's round-trip test pass.
- The CSV formula neutralization is **not** applied (F4).
- `columns`, `valueMaps`, `ids` and `filename` behave identically — the frontend keeps
  owning column resolution and the server keeps owning serialization. `valueMaps` still
  applies, so `Persona`/`Empresa` and `NIF` read the same in both formats.
- `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, and the
  bytes go to `response.getOutputStream()`. **Trap:** `getWriter()` and `getOutputStream()`
  are mutually exclusive on one `HttpServletResponse` — the CSV branch must keep using the
  writer and the xlsx branch must never touch it.
- `build.gradle`: `compileOnly 'org.apache.poi:poi-ooxml:5.4.0'` (F1).

Frontend: `useCsvExport` takes a `format`, and `ListView`'s Export control becomes a
dropdown offering the window's **output** formats (see §4).

### §3 — Templates

`buildTemplateCsv` is untouched. A sibling `buildTemplateXlsx(fields, { headerFor })` reuses
**the same `resolveTemplateHeaders`** — that is what keeps template, export and import
headers byte-identical in whatever language the session runs, including the collision
fallback that exists because `parseDelimited` rejects duplicate headers.

The template's data columns carry a text format (`'@'`), so a postal code typed by hand into
an empty row stays text instead of losing its leading zero (F4). This is the only available
mitigation for the typed-cell problem, and it is a mitigation rather than a guarantee:
**it must be confirmed by opening a generated template in a real Excel**, which the probe
could not do.

`ImportDialog` renders one template control per **output** format (see §4) — so CSV and
XLSX, never TXT.

### §4 — `formats` becomes live

`window.import.formats` starts governing the `accept` attribute and the dropzone hint text
(F7). Both windows move to `["csv","txt","xlsx"]`: `txt` is not being added, it is being
stopped from being a lie (F6).

**`formats` declares what the import ACCEPTS, which is not the same set the app WRITES.**
`txt` is an input-only convenience — it exists because Spanish Excel's *Guardar como →
Texto (delimitado por tabulaciones)* produces one (F6) — and there is no reason to ever
hand a user a `.txt` template or a `.txt` export. So the output formats are derived, not
declared separately:

```
outputFormats = formats ∩ { csv, xlsx }
```

That one line governs both the template controls (§3) and the Export dropdown (§2), keeps a
single declaration per window, and cannot drift into a state where the export offers a
format the import cannot read back.

No new per-window gate is introduced. xlsx rides along with `window.import.enabled`, which
is why only Contacts and Product get it — they are the only windows with import/export.

### §5 — Testing

The test that makes the feature true rather than hoped-for:

> **Round-trip equivalence.** Export the same rows as CSV and as XLSX, parse both through
> their own parsers, and assert the resulting `{ headers, rows }` are **identical**.

If that passes, "the import accepts the exported xlsx without errors" is a proven property
rather than a claim. Alongside it:

- Adapter unit tests, one per normalization in §1: `null` → `''`, number → string,
  `Date` → `dd-MM-yyyy`, duplicate headers rejected, multi-sheet rejected, the `*` marker
  left alone.
- `NeoCsvExportServiceTest` gains xlsx cases that read the produced workbook back with POI
  and assert the cells are of type STRING and that no cell carries the apostrophe prefix.
- One mocked E2E uploading a real `.xlsx` through the dialog, following
  `e2e/tests/flows/row-quick-actions.mocked.spec.js` as the reference. Worth adding the
  missing `.txt` case (F6) while the fixtures are being built.
- Per `CLAUDE.md`, every one of these is written by Tester (`test-generator`), not inline.

## What the implementation changed about this design

Three things the plan got wrong or under-specified, all found by measuring rather than reasoning.
They are recorded here because each one would otherwise look like an unexplained deviation.

**F8 replaced the date handling.** §1 originally said to format an imported date through
`formatCalendarDate`. That would have been a bug: an xlsx date cell arrives at UTC midnight, and
those helpers build their `Date` with the local-time constructor. Reading with UTC getters is the
correct handling, and `formatCalendarDate` is the wrong tool for this input despite being the right
tool for the input it was written for.

**`trim: false` is required.** `read-excel-file` trims every string value by default;
`parseDelimited` trims headers only. Left on, the same visible data would import differently
depending on whether the user saved as `.csv` or `.xlsx` — silently cleaning one and not the other.
Identity with the CSV path wins; if trimming cells is desirable, it is a deliberate change to both
parsers.

**The projection had to be extracted, not duplicated.** §2 said the xlsx writing "goes in a new
`NeoXlsxExportWriter`", which left the column/date/valueMaps resolution in
`NeoCsvExportService` where only the CSV writer could reach it. Two writers each resolving cells
their own way is two chances to disagree, and a disagreement surfaces as a re-import that maps a
column differently depending on the format the user picked. `NeoExportTable` now owns the
projection and both writers share it, which makes the equivalence structural. Escaping stayed
per-format, which is the correct split: CSV quotes and neutralizes formulas, xlsx does neither.

One thing the plan under-specified rather than got wrong: `formats` declares what the import
ACCEPTS, and the writable set is derived (`outputFormats = formats ∩ {csv, xlsx}`) — see §4. The
`txt` asymmetry was noted in the spec but the derivation now lives in one shared helper
(`importFormats.js`) used by both the dialog's template buttons and ListView's export menu, so the
two surfaces cannot disagree about what a window offers.

## Verification performed

- `parseXlsx.test.js` — 17 cases, including equivalence asserted against `parseDelimited` itself.
- `buildTemplateXlsx.test.js` — 7 cases, including header parity with `buildTemplateCsv` and a
  full round trip through `mapColumns` on a field set with colliding labels.
- `importFormats.test.js` — 13 cases.
- `ImportDropzone.test.jsx` — 9 cases (accept/hint now derived).
- `NeoCsvExportServiceTest` — 24 cases, up from 16. The eight new ones read the produced workbook
  back with POI and assert cell TYPE, not just content. Compiled and run against the deployed
  `WEB-INF/lib` jars, outside Gradle.
- `useCsvExport.vitest.jsx` — 10 cases; `ListViewExport.vitest.js` — 17 cases.
- The Java sources compile clean against the real POI 5.4.0 jars with `-Xlint:deprecation`.

Not verified, and still open: opening a generated template and a generated export in a **real
Excel**. The `'@'` column format and the freeze pane are accepted by the writer and survive a
read-back, but only a real spreadsheet application can confirm they behave as intended.

## Non-goals

- Legacy `.xls` (BIFF). Only OOXML `.xlsx`.
- Typed number/date cells in the output. Rejected on the evidence in F4.
- Multi-sheet workbooks. Explicitly rejected in §1.
- Extending import/export to windows that do not have it today.
- Cleaning up the duplicated `C_Region` rows, or the silently-dropped region on import —
  both found while diagnosing the CSV export, both tracked separately.

## Delivery

Three repos, one ticket (ETP-4997), the parallel branch workflow this project already uses:

| Repo | Changes |
|---|---|
| `schema_forge_core` | `parseXlsx`, `buildTemplateXlsx`, `ImportDialog` dispatch + template controls, `ImportDropzone` accept/hint from `formats`, the two npm deps |
| `com.etendoerp.go` | `NeoXlsxExportWriter`, the format branch in `NeoCsvExportService`, `compileOnly` POI |
| `schema_forge` | `useCsvExport` format param, `ListView` export dropdown, `formats` in both `decisions.json`, i18n keys in **both** locales, docs |

The core change ships as a published `@etendosoftware/app-shell-core` bump, so the pin in
`tools/app-shell/package.json` (today `0.3.41`) moves last. `make dev-local-core` exercises
it before publishing.

### Until the core publishes, `schema_forge` needs `LOCAL_CORE=1`

`ListView.jsx` imports `@etendosoftware/app-shell-core/lib/import/importFormats.js`, a module
that exists only in core source until the bump lands. Without `LOCAL_CORE`, `vitest.config.js`
adds no alias and that specifier resolves into the installed `0.3.41` package, which does not
have the file — so the failure is a **module resolution error, not an assertion**, and it takes
down every test that imports `ListView.jsx` (ten of them) plus `make dev` and the production
build. Nothing is wrong with the code; the two halves of one ticket are simply not both
published yet.

So while this ticket is open:

- tests: `cd tools/app-shell && LOCAL_CORE=1 npx vitest run`
- manual testing: `make dev-local-core`, never plain `make dev`

Both revert to their unflagged forms once the core version is bumped and the pin moves — which
is the last step of the delivery, and the one that makes the functional PR mergeable.

## Risks

1. **Excel's typed-cell coercion on hand-built files.** A user who builds a file from
   scratch rather than from our template can still lose a leading zero before we see it. The
   `'@'` column format mitigates the template path only, and is itself unverified against a
   real Excel (§3).
2. **Two npm dependencies added to a shared package.** They land in app-shell-core and
   therefore in every consumer. Both audit clean today; that needs to stay true.
3. **`getWriter()`/`getOutputStream()`** — mixing them yields an `IllegalStateException` at
   runtime, not at compile time (§2).
4. **The template's header collision fallback** is load-bearing and easy to lose by
   reimplementing headers in the xlsx writer instead of reusing `resolveTemplateHeaders`
   (§3).
