# Global search (vector search) configuration

How the global search palette finds **records**, and the three procedures a developer needs to
change what it finds:

1. [Add or edit an indexed column](#procedure-1--add-or-edit-an-indexed-column) of a window that is
   already searchable.
2. [Add a new window](#procedure-2--add-a-new-window-to-the-search) to the search.
3. [Remove a column or a window](#procedure-3--remove-a-column-or-a-window) and clean up its
   vectors.

Every claim below carries the file and line that proves it, so a later change can be checked
against this guide. `{etendo_root}` is the Etendo checkout that contains `modules/`.

> **Read-only rule for investigation.** Everything you need to inspect lives in the sourcedata XML
> (`{etendo_root}/modules/com.etendoerp.go/src-db/database/sourcedata/ETARC_VECTOR_*.xml`) or can
> be read with `SELECT`. Never run DDL by hand against the vector tables or the pgvector extension:
> the extension, its schema and the change-capture triggers are created **only** by
> `update.database` (see [Ownership](#ownership)). Creating them by hand moves the structure
> checksum and blocks the next update.

---

## Contents

- [How it works](#how-it-works)
- [Ownership](#ownership)
- [Current configuration](#current-configuration)
- [How the embedded text is built](#how-the-embedded-text-is-built)
- [Procedure 1 — Add or edit an indexed column](#procedure-1--add-or-edit-an-indexed-column)
- [Procedure 2 — Add a new window to the search](#procedure-2--add-a-new-window-to-the-search)
- [Procedure 3 — Remove a column or a window](#procedure-3--remove-a-column-or-a-window)
- [Verification queries (read-only)](#verification-queries-read-only)
- [Troubleshooting](#troubleshooting)
- [Application shell responsibilities](#application-shell-responsibilities)
- [Checklist](#checklist)

---

## How it works

**The palette does not run a text search over records.** It runs **one** kind of record search, the
vector (semantic) one, and then splits what comes back into three groups in the browser. The only
thing searched as plain text is the list of **menu windows**, which are not records.

```
                         what the user types ("juan perez")
                                       │
           ┌───────────────────────────┴─────────────────────────────┐
           │ immediately                                              │ ≥ 3 chars, after 250 ms
           ▼                                                          ▼
  Text filter in the browser                      GET /sws/neo/vectorsearch
  over menu.json (window/section names)           ?query=…&targets=…&minScore=0.45&topK=10
           │                                      (one request PER target when no scope is chosen)
           ▼                                                          │
  ┌────────────────┐                     com.etendoerp.go: NeoVectorSearchEndpoint
  │  Menu windows  │                     (target exists? role may read it?)
  └────────────────┘                                                  │
                                                                      ▼
                                         com.etendoerp.db.extended: VectorSearchService
                                         1. embed the query (provider "LiteLLM etendo-embed")
                                         2. pgvector: 10 nearest records per target
                                         3. score = (1 + cosine) / 2
                                                                      │
                                                                      ▼
                                         browser: merge, sort by score, keep top 10
                                                                      │
                                                rankVectorMatches()   │
                          ┌───────────────────────────────┼──────────────────────────────┐
                          ▼                               ▼                              ▼
                 ┌─────────────────┐          ┌────────────────────┐          ┌──────────────────┐
                 │  Text matches   │          │   Best matches     │          │  Other matches   │
                 │ query appears   │          │ score ≥ 0.72 and   │          │ score ≥ 0.55;    │
                 │ in a field      │          │ ≥ best − 0.08      │          │ hidden when the  │
                 │ (any score)     │          │                    │          │ scores are       │
                 │                 │          │                    │          │ concentrated     │
                 └─────────────────┘          └────────────────────┘          └──────────────────┘
```

### One request, top-10 semantic results

| Step | Behaviour | Source |
|---|---|---|
| Minimum query | Fewer than 3 characters: no record request at all | `tools/app-shell/src/hooks/useVectorSearch.js:15` |
| Debounce | 250 ms; the previous request is aborted | `useVectorSearch.js:53` |
| Fan-out | With no explicit scope and more than one target, **one HTTP request per target**; with a chosen scope, one request carrying all chosen targets | `useVectorSearch.js:26-29` |
| Parameters | `query`, `targets`, `minScore=0.45`, `topK=10` | `useVectorSearch.js:5-6, 30-35` |
| Merge | All responses are merged, sorted by score descending and cut to **10 overall** — not 10 per window | `useVectorSearch.js:42-45` |
| Server defaults | `topK` 10 (max 50), `minScore` 0.60, `maxScore` 1. The SPA overrides `minScore` with 0.45 | `{etendo_root}/modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/NeoVectorSearchEndpoint.java:47-50` |
| Errors | **Any** failed request (in a fan-out, any one of them) empties the whole record list; no message is shown | `useVectorSearch.js:29, 39, 49` |

Because a single query is embedded once per request, a palette with 4 searchable windows and no
scope costs **4 embedding calls per search**.

### Score formula

For the `COSINE` metric DB Extended reports `score = clamp((2 − distance) / 2)`, which equals
`(1 + cos) / 2` (`{etendo_root}/modules/com.etendoerp.db.extended/src/com/etendoerp/db/extended/vector/VectorSearchService.java:212-215`).
Two texts with **nothing** in common (cosine ≈ 0) therefore already score **≈ 0.50**. Read the
thresholds with that in mind:

| Threshold | Equivalent cosine | Meaning |
|---|---|---|
| `minScore = 0.45` (SPA request) | −0.10 | Filters practically nothing |
| `0.55` (`RELATED_SCORE_FLOOR`) | 0.10 | Floor for "Other matches" |
| `0.72` (`HIGH_SCORE_FLOOR`) | 0.44 | Floor for "Best matches" |

The score only ranks the rows. Since ETP-5602 the palette no longer displays it
(`tools/app-shell/src/components/CommandPalette.jsx:385-387`).

### Grouping in the browser

`rankVectorMatches()` in `tools/app-shell/src/lib/vectorSearchRanking.js` sorts the (at most 10)
matches and puts each into one group:

| Group (UI key → en / es) | Rule | Source |
|---|---|---|
| **Text matches** (`exactSearchResults` → "Text matches" / "Coincidencias por texto") | The normalized query (NFD, no accents, lower case) is a substring of any value in `match.fields`, or — for queries of 2+ words longer than 2 letters — at least 60 % of those words appear. **Any score** qualifies | `vectorSearchRanking.js:5-16, 49-51` |
| **Best matches** (`relevantSearchResults` → "Best matches" / "Coincidencias principales") | `score ≥ max(0.72, best − 0.08)` and `score ≥ cutoff`, where `cutoff = max(floor, mean − stddev)` | `vectorSearchRanking.js:37-48, 52` |
| **Other matches** (`relatedSearchResults` → "Other matches" / "Otras coincidencias") | `score ≥ 0.55`. Not rendered when the result set is *concentrated* (half or more scores ≥ 0.72 and coefficient of variation ≤ 0.12) | `vectorSearchRanking.js:39-40, 53`; `CommandPalette.jsx:567` |
| Discarded | Everything else | — |

Consequence: "Text matches" is a **filter over the semantic top 10**, not a text search. A record
whose text matches exactly but which the vector search did not return does not appear anywhere.

### Scope

Opened from a searchable window, the palette starts scoped to that window's target only
(`CommandPalette.jsx:286-289`, `tools/app-shell/src/lib/vectorSearchConfig.js:42-45`). The scope pill
is removable; removing it searches every target.

---

## Ownership

The configuration is split across three repos/modules and **two independent declarations of the
same key**:

| Piece | Lives in | Owner |
|---|---|---|
| Tables `ETARC_VECTOR_EMBED_PROVIDER`, `ETARC_VECTOR_SOURCE`, `ETARC_VECTOR_SOURCE_COLUMN`, `ETARC_VECTOR_SEARCH_TARGET`, `ETARC_VECTOR_OUTBOX`, `ETARC_VECTOR_REINDEX_REQ`; windows **Embedding Provider**, **Search Source** (tabs *Source Columns*, *Search Target*, *Reindex Request*), **Outbox Monitor**; processes **Check Indexing Readiness**, **Request Reindex**, **Process Vector Outbox**, **Process Vector Reindex**, **Requeue Failed Vector Events** | `com.etendoerp.db.extended` | Platform (reusable) |
| The concrete provider, sources, source columns and search targets for Etendo GO windows | `{etendo_root}/modules/com.etendoerp.go/src-db/database/sourcedata/ETARC_VECTOR_*.xml` (every row has `AD_MODULE_ID = 94E1B433CF55451EABB764750AC5902A`, i.e. `com.etendoerp.go`) | Feature module |
| `window.vectorSearch.target` (and optional `window.searchSuggestions`) | `artifacts/<spec>/decisions.json` → copied to `frontendContract.window.vectorSearch` by `resolve-curated.js` in `schema_forge_core` (`cli/src/resolve-curated.js:957, 1016`) | This repo |
| Runtime storage `etarc_vector.etarc_vector_collection` / `etarc_vector.etarc_vector_record`, the pgvector extension, the per-source triggers | Created by `update.database` (post-update module script); excluded from DBSM exports | Never versioned |

**How export works.** DB Extended's `AD_DATASET_TABLE` exports provider, source and target rows
whose `AD_MODULE_ID` is the module being exported, and source-column rows whose **parent source**
belongs to it. So set `AD_MODULE_ID = com.etendoerp.go` on any new provider/source/target, keep the
module *In Development*, and `./gradlew export.database` writes the four
`com.etendoerp.go/src-db/database/sourcedata/ETARC_VECTOR_*.xml` files.

**The two-key rule.** `ETARC_VECTOR_SEARCH_TARGET.SEARCH_KEY` (server, MCP) and
`decisions.json → window.vectorSearch.target` (SPA) must both equal the **spec name** (the
`artifacts/<spec>/` directory name, kebab-case). A vector match carries no pointer to where its
record lives, so the target key is the only clue a caller has; when it is the spec name, a match is
read with `etendo_get(spec:<target>, id:<match.id>)` (MCP, agents, any API caller) and nothing
has to be guessed. The palette itself does not depend on this: it navigates by the `specName` it
resolved from the contract that declared the target (`vectorSearchConfig.js:19-36`,
`CommandPalette.jsx:312-318`). **Nothing validates the two against each other** (the pipeline-validator rule
F11 is an open follow-up); a one-sided change makes the SPA send a key the server does not know,
which the palette shows as *no results*, never as an error. See
`{etendo_root}/modules/com.etendoerp.go/docs/neo-headless.md` §4.9a and `docs/decisions-reference.md`
(`vectorSearch`).

---

## Current configuration

Verified against the sourcedata XML of `com.etendoerp.go`, the core `AD_COLUMN.xml` and the four
`decisions.json` files. All sources use the provider **LiteLLM etendo-embed** (`OPENAI` type,
model `etendo-embed` through `https://llm.etendo.software/v1`, 1536 dimensions, batch 25, max
24 000 input characters, retry limit 3, API key read from `ETENDO_PGVECTOR_OPENAI_API_KEY`) and the
`COSINE` metric.

| Window (spec) | `decisions.json` target | Search target `SEARCH_KEY` | Filter Display Logic | Source (namespace → table) | Indexed content columns (SeqNo) | Metadata columns | Result tag |
|---|---|---|---|---|---|---|---|
| `contacts` | `contacts` | `contacts` | — | `go.business-partner` → `C_BPartner` | `Name` (10), `Value` (20), `TaxID` (30) | — | Contacts |
| `product` | `product` | `product` | — | `go.product` → `M_Product` | `Value` (10), `Name` (20), `Description` (30) | — | Product |
| `sales-invoice` | `sales-invoice` | `sales-invoice` | `@IsSOTrx@='Y'` | `go.invoice` → `C_Invoice` | `DocumentNo` (10) | `IsSOTrx` (20) | Sales Invoice |
| `purchase-invoice` | `purchase-invoice` | `purchase-invoice` | `@IsSOTrx@='N'` | `go.invoice` → `C_Invoice` (**same source**) | `DocumentNo` (10) | `IsSOTrx` (20) | Purchase Invoice |

Notes:

- The *source* namespace (`go.business-partner`) is an internal storage name and does not need to
  match anything. Only the *target* key does.
- Contacts indexes **Name, Search Key and Tax ID only** — not email or phone.
- Invoices index **only the document number**. Searching an invoice by customer name, amount or
  date does not work today; see the worked example in Procedure 1.
- Any window not listed has no `vectorSearch` and is found only through its menu entry.

---

## How the embedded text is built

`DictionaryVectorOutboxConsumer` builds one text per record
(`{etendo_root}/modules/com.etendoerp.db.extended/src/com/etendoerp/db/extended/vector/DictionaryVectorOutboxConsumer.java:129-142`):

1. It reads **the record's own row** by primary key — `SELECT <source columns> FROM <table> WHERE <pk> = ?`.
   **There are no joins.**
2. For every active source column, in `SeqNo` order, whose value is not `NULL`:
   - the value goes into `fields` (content **and** metadata columns);
   - if the column is **content** (`IsContent = 'Y'`), the line `ColumnName: value\n` is appended
     to the text.
3. The text is truncated to the provider's **Max Input Characters**, embedded, and stored with
   metadata `{sourceId, configVersion, fields}`.

So the contact *Juan Perez* is embedded as:

```
Name: Juan Perez
Value: Juan Perez
TaxID: K01927367
```

and sales invoice `10000014` as just `DocumentNo: 10000014`.

### Consequences for anyone choosing columns

| Fact | Consequence |
|---|---|
| Values are read **raw** from the row | A **foreign-key column embeds the referenced record's ID** (a 32-char UUID), not its name. Adding `C_BPartner_ID` to the invoice source would embed `C_BPartner_ID: 203884E383AB4B5AAF3FA05EF8E9BE46`, which is useless for search and also appears in the result label |
| `fields` holds every source column, content and metadata | The palette label is `Object.values(match.fields)` joined with ` · `, skipping only a field literally named `IsSOTrx` (`CommandPalette.jsx:378-382`). Any other metadata column **is shown in the label** and is checked by the "Text matches" filter |
| `fields` is stored in a `jsonb` column | `jsonb` reorders keys (shorter keys first), so the label order does **not** follow `SeqNo` |
| Change capture watches only this table | A trigger fires on `INSERT`, `DELETE` and `UPDATE OF <column>` of the **source table** only (`VectorTriggerService.java:260-273`). Renaming a business partner never re-embeds its invoices unless the value lives in an invoice column |
| Only columns with **Reindex on Change = Y** are watched for updates | `VectorTriggerService.java:102-109`. A content column with `N` is embedded on insert/reindex but its later edits are not picked up |
| Generic boilerplate makes everything look alike | Index only business-identifying text. A column holding the same value on every row (a document type name, a status) pulls unrelated records together |

---

## Procedure 1 — Add or edit an indexed column

Applies to a window that is already searchable (a source and target exist). **No `decisions.json`
change and no `make regen` are needed**: the palette builds the label from whatever `fields` the
server returns.

### Step 1 — Make sure the value is a column of the source table

- **Already a column of the table** (e.g. `M_Product.UPC`): go to Step 2.
- **Lives in another table** (the customer name of an invoice, the product category name, …):
  create a **stored computed column** on the source table first — `Computation_Mode = 'S'`,
  `Refresh_Mode = 'S'` — per the *Computed Column Policy* in `CLAUDE.md`. Do **not** index the FK
  column itself (it embeds an ID), and do not use a virtual `SQLLogic` column (`V`): the indexer
  reads the physical row, and a value that is not physically stored is never captured by the
  change-capture trigger. Use the `/stored-computed-column` skill and
  `{etendo_root}/modules/com.etendoerp.go/docs/STORED-COMPUTED-COLUMNS.md`.

  Why this works end to end: the stored column is a real column of the source table, and the engine
  writes it with an `UPDATE <column> = <fn>(<pk>)` at commit (`STORED-COMPUTED-COLUMNS.md`,
  phase 2). That `UPDATE` fires the vector trigger `AFTER UPDATE OF <column>`, so the record is
  re-embedded when the **referenced** value changes — something an FK-resolving indexer could not
  do.

#### Worked example — find Juan Pérez's invoices by typing his name

Today "juan perez" finds the contact but none of his invoices, because the invoice source embeds
only `DocumentNo: 10000014`. The fix (illustrative — not implemented yet):

1. In `com.etendoerp.go`, add a stored computed column to `C_Invoice`, e.g.
   `EM_Etgo_BPartner_Name` (VARCHAR), `Computation_Mode = 'S'`, `Refresh_Mode = 'S'`, computed by a
   total (never-throwing) SQL function such as `etgo_invoice_bpartner_name(p_c_invoice_id)` that
   returns `C_BPartner.Name` of the invoice's `C_BPartner_ID` (or `NULL`).
2. Declare its dependencies (`AD_COLUMN_COMP_DEPENDENCY` + `AD_COMPDEP_WATCHED_COL`):
   - `C_Invoice`, insert/update, watched column `C_BPartner_ID` (the invoice changes customer);
   - `C_BPartner`, update, watched column `Name`, resolving the affected invoices by
     `C_BPartner_ID` (the customer is renamed).

   **Size the blast radius**: with `S` refresh, renaming a partner with thousands of invoices
   recomputes them all in that transaction and enqueues one outbox event (one embedding) per
   invoice. That is the honest cost of keeping the index exact.
3. Add the new column to the `go.invoice` source (Step 2 below) as **content**, **Reindex on
   Change = Y**, `SeqNo` 15.
4. Request Reindex of `go.invoice` (Step 4 below).

After that, invoice `10000014` is embedded as:

```
DocumentNo: 10000014
EM_Etgo_BPartner_Name: Juan Perez
```

and its `fields` carry the name, so the result label reads `10000014 · Juan Perez` and the "Text
matches" filter places it in the first group. Because the column is a real AD column it is also
filterable and sortable in the invoice list — the same reason `CLAUDE.md` prefers stored columns in
*List Columns Must Be Real Columns*.

### Step 2 — Add or edit the source column in the dictionary

Log in as **System Administrator**, open **Search Source**, select the source (e.g. `Invoice
Example` / `go.invoice`) and use the **Source Columns** tab (`ETARC_VECTOR_SOURCE_COLUMN`):

| Field (column) | Value |
|---|---|
| Column (`AD_COLUMN_ID`) | The column of the source table |
| Content (`IsContent`) | `Y` to embed it as text; `N` for metadata only (used by a target's Filter Display Logic, returned in `fields`, not embedded) |
| Reindex on Change (`IsReindexOnChange`) | `Y` so edits to this column re-embed the record. Required for any column a target's Display Logic references |
| Sequence (`SeqNo`) | Order of the line in the embedded text |
| Active (`IsActive`) | `Y` |

Make the change **in the window, not by hand in the XML.** Saving fires
`VectorSourceConfigurationEventHandler`
(`{etendo_root}/modules/com.etendoerp.db.extended/src/com/etendoerp/db/extended/handler/VectorSourceConfigurationEventHandler.java`),
which increments `ETARC_VECTOR_SOURCE.CONFIG_VERSION` on any insert, update or delete of a source
column. Every outbox event still queued under the previous version is then marked **SUPERSEDED**
instead of being embedded with stale rules (`VectorOutboxService.java:136-142`). An XML edit
bypasses that handler; if you must edit the XML, bump `CONFIG_VERSION` of the parent
`ETARC_VECTOR_SOURCE` row by hand in the same change.

Then run **Check Indexing Readiness** on the source. It writes nothing and reports whether the
source will produce vectors (e.g. it flags a source with no content column).

### Step 3 — Export, then rebuild the triggers

```bash
cd {etendo_root}
./gradlew export.database     # writes com.etendoerp.go/src-db/database/sourcedata/
                              #   ETARC_VECTOR_SOURCE_COLUMN.xml (+ ETARC_VECTOR_SOURCE.xml CONFIG_VERSION)
./gradlew update.database     # regenerates the source's change-capture triggers
```

The trigger set is rebuilt **only** by `update.database` (`GenerateVectorSourceTriggers` →
`VectorProvisioningService.provision()` → `VectorTriggerService.deployAll()`). Until it runs, edits
to the new column are not captured. The diff must touch only the `ETARC_VECTOR_*.xml` files you
meant to change (plus the AD files of the stored computed column, if you created one).

If you created a stored computed column, also expose it in the window if users should see it, via
`decisions.json` and `make regen ONLY=<window> PUSH_TO_NEO=1` — that is a regular field change and
independent from search.

### Step 4 — Re-embed the records that already exist

**Yes, a reindex is needed** whenever the content columns change. Existing vectors were embedded
with the old text and keep it until each record is next inserted or has a watched column updated;
the configuration-version bump only discards *queued* events, it does not rebuild anything.

1. **Search Source** → select the source → **Request Reindex**. It records one request per source
   and tells you roughly how many records that will enqueue. If the source already has a request,
   asking again **restarts** that walk from the beginning: the first click only answers how many
   records are already enqueued and what the restart would cost, and the restart happens only when
   you run it again with the parameter *"Enqueue the whole table again, discarding the previous
   walk"* (`Confirm_Restart`) checked (`RequestVectorReindex.java:101, 118-126`).
2. The scheduled **Process Vector Reindex** walks the table in chunks of 1 000 rows (at most 20
   chunks per run, pausing while the source has more than 10 000 pending events) and enqueues one
   outbox event per row (`ProcessVectorReindex.java`).
3. The scheduled **Process Vector Outbox** embeds up to 100 pending events per run, grouped by
   source, one provider call per batch of 25.

Both processes must be scheduled **once, at System level** (*Process Request*), not per client.
Request the reindex **after** the column change: a reindex requested before it carries the old
configuration version and its events end up SUPERSEDED.

Cost: one embedding per record of the source. For a shared source (`go.invoice`) that is every
sales **and** purchase invoice.

---

## Procedure 2 — Add a new window to the search

Example: making `sales-order` searchable by document number and customer.

### Step 1 — Confirm the spec name and the backing table

- The spec name is the `artifacts/<spec>/` directory (kebab-case, from `toSpecName()`); never guess
  it. Use the user-facing spec, not a hidden classic window with a different route.
- The table is the header entity's table (here `C_Order`).
- The spec must be **active**, of type window, with **Show in MCP** set, and have an active, included
  `ETGO_SF_ENTITY` on that table — the endpoint authorizes a target only if such a spec exists and
  the role has `AD_Window_Access` to its window plus DAL read access to the entity
  (`NeoVectorSearchEndpoint.java:411-473`). Otherwise the request is rejected with 403.

### Step 2 — Create or reuse the source

In **Search Source** (System Administrator), either reuse a source over the same table or create one
(`ETARC_VECTOR_SOURCE`):

| Field | Value |
|---|---|
| Name / Description | Human-readable |
| Table (`AD_TABLE_ID`) | The backing table |
| Namespace | Stable storage key, convention `go.<entity>` (e.g. `go.order`). Changing it later bumps the configuration version and orphans the old collection |
| Embedding Provider | **LiteLLM etendo-embed** (`A1B2C3D4E5F6478899AABBCCDDEEFF00`) unless you have a reason; sources searched together must share provider type, model, dimensions and metric or DB Extended rejects the combined search |
| Distance Metric | `COSINE` |
| Enabled / Insert / Update / Delete Enabled | `Y` |
| Module | `com.etendoerp.go` |

Add its **Source Columns** exactly as in Procedure 1, Step 2 — at least one content column, or the
source is never instrumented (`VectorTriggerService.java` `READY_EXPR`).

**Two windows over one table** (Sales/Purchase Invoice): use **one** source that indexes the whole
table and one target per window with a **Filter Display Logic** (e.g. `@IsSOTrx@='Y'`). The filter is
evaluated against the stored metadata at query time, so every field it references must be a source
column (content or metadata) with **Reindex on Change = Y**.

### Step 3 — Create the search target (server-side key)

**Search Source** → **Search Target** tab (`ETARC_VECTOR_SEARCH_TARGET`):

| Field | Value |
|---|---|
| Name | The window's display name (e.g. `Sales Order`) |
| Search Key (`SEARCH_KEY`) | **Exactly the spec name** (`sales-order`). Must match `[A-Za-z][A-Za-z0-9_.-]{0,127}` and be unique among active targets |
| Filter Display Logic | Only for a shared source; otherwise empty |
| Module | `com.etendoerp.go` |
| Active | `Y` |

### Step 4 — Export, update, verify readiness

```bash
cd {etendo_root}
./gradlew export.database     # new rows in ETARC_VECTOR_SOURCE / _SOURCE_COLUMN / _SEARCH_TARGET .xml
./gradlew update.database     # creates the collection for the namespace and the triggers
```

Run **Check Indexing Readiness** on the source; it should report it ready. Triggers created by the
update capture only changes from then on.

### Step 5 — Index the existing rows

**Request Reindex** on the source, with **Process Vector Reindex** and **Process Vector Outbox**
scheduled at System level (Procedure 1, Step 4). Without it, only records inserted or edited after
the update are searchable.

### Step 6 — Declare the target in `decisions.json` (SPA-side key)

In `artifacts/sales-order/decisions.json`:

```json
{
  "window": {
    "vectorSearch": { "target": "sales-order" }
  }
}
```

The target **must equal** the spec name and the `SEARCH_KEY` from Step 3. Omitting `vectorSearch` is
the opt-out; never add disabled entries to other windows.

Optionally add navigation shortcuts, shown under *Suggestions* only while this window is within the
selected scope. `label` is an i18n key (add it to both `en_US.json` and `es_ES.json`) and `path` must
start with `/<spec>` (`vectorSearchConfig.js:51-66`):

```json
"searchSuggestions": [
  { "label": "pendingDeliverySalesOrders", "path": "/sales-order?filter=pendingDelivery" }
]
```

`resolveWindowSearchSuggestions` silently drops any entry whose `path` does not start with
`/<spec>` of the window that declares it (`vectorSearchConfig.js:61`). The label key and the
`filter` value above are illustrative: use a key you add to the locales and a query parameter the
window actually understands.

Regenerate:

```bash
make regen ONLY=sales-order PUSH_TO_NEO=1
cd {etendo_root} && ./gradlew export.database   # always after PUSH_TO_NEO
```

Check the contract picked it up:

```bash
python3 -c "import json;w=json.load(open('artifacts/sales-order/contract.json'))['frontendContract']['window'];print(w.get('vectorSearch'), w.get('name'))"
```

### How the window appears in the palette

- **Participation**: `useVectorSearchContracts` globs `@generated/*/contract.json`
  (`@generated` → `artifacts/`) at build time; `resolveVectorSearchTargets` keeps every contract
  with a valid `frontendContract.window.vectorSearch.target` (`vectorSearchConfig.js:19-36`). The
  contract is **bundled into the app**: in dev `make dev` picks it up; elsewhere the UI container
  must be rebuilt.
- **Result label**: the non-empty values of `match.fields` joined with ` · ` (falls back to the
  record ID). Choose content columns that make a readable label; keep FK IDs out.
- **Result tag**: `frontendContract.window.name`, translated with the menu translations
  (`CommandPalette.jsx:383-384, 401`).
- **Click**: `handleVectorSelect` looks up the target in the contract-derived map and navigates to
  `/<specName>/<match.id>` (`CommandPalette.jsx:312-318`), where `specName` is the artifact directory
  of the contract that declared the target (`vectorSearchConfig.js:19-36`). Navigation therefore
  works whatever the key is; the key-equals-spec rule exists for the callers that only have the
  match (MCP, `etendo_get(spec:<target>, id)`), as explained in [Ownership](#ownership).
- **Scope pill**: opening the palette from `/sales-order` scopes it to `sales-order`.

### Step 7 — Verify end to end

1. Run the [verification queries](#verification-queries-read-only): the target is active, the
   source has a collection, the outbox drains to `DONE`, and `etarc_vector.etarc_vector_record` has
   rows for the namespace.
2. Call the endpoint with a valid session token:

   ```bash
   curl -s -H "Authorization: Bearer $TOKEN" \
     "http://localhost:8080/etendo/sws/neo/vectorsearch?query=10000014&targets=sales-order&topK=5" | jq
   ```

   Expected: `200` with `{ "matches": [ { "target": "sales-order", "id": "…", "score": …, "fields": {…} } ] }`.
   `422 unknown_vector_target` (with an `available` list) means the `SEARCH_KEY` is missing or
   inactive; `403` means the role/window authorization in Step 1 failed; an empty `matches` means
   nothing is indexed yet.
3. Through MCP, `etendo_vector_search` must list `sales-order` in the `targets` enum, and
   `etendo_get(spec:"sales-order", id:<match.id>)` must read the match.
4. In the palette, from `/sales-order`, type ≥ 3 characters of a known document number: the pill
   shows *Sales Order*, the record appears under *Text matches* with the *Sales Order* tag, and
   clicking it opens the record. Remove the pill and repeat to confirm the other windows still
   return results (a broken target empties them all, see Troubleshooting).

---

## Procedure 3 — Remove a column or a window

### Remove an indexed column

1. **Search Source** → source → **Source Columns**: delete the row (or set it inactive). The
   configuration version is bumped; queued events become SUPERSEDED.
2. If a target's **Filter Display Logic** references the column, change the filter first.
3. `./gradlew export.database`, then `./gradlew update.database` (the `UPDATE OF` trigger for the
   column is dropped).
4. **Request Reindex** on the source. Until each record is re-embedded, its old vector still contains
   the removed column's text and its `fields` still show it in the label. The reindex upserts every
   record, replacing both.

### Remove a window whose source is shared (e.g. drop Purchase Invoice, keep Sales Invoice)

1. Remove `window.vectorSearch` from `artifacts/<spec>/decisions.json`, then
   `make regen ONLY=<spec> PUSH_TO_NEO=1` and `./gradlew export.database`. Ship the SPA **first**: if
   the target disappears while the SPA still sends it, the server answers `422` and, in a fan-out,
   the palette shows no records for **any** window.
2. **Search Target** tab: delete the target row (or set it inactive), then `./gradlew
   export.database`.
3. Leave the vectors alone: they belong to the shared source and still serve the other target.

### Remove a window whose source is its own (remove the whole source)

1. Remove `window.vectorSearch` from `decisions.json` and regenerate, as above.
2. Delete (or deactivate) the **Search Target** row.
3. On the source, set **Enabled = N** (or inactive) and `./gradlew export.database`; then
   `./gradlew update.database`, which sweeps the triggers of every source that is no longer ready.
   Prefer disabling over deleting the source row. Four foreign keys reference it **without
   cascade**, so a delete fails while any of these rows points at it:
   - `ETARC_VECTOR_OUTBOX` (`ETARC_VOUT_SOURCE`);
   - `ETARC_VECTOR_REINDEX_REQ` (`ETARC_VREIDX_SOURCE`);
   - `ETARC_VECTOR_SOURCE_COLUMN` (`ETARC_VSRCCOL_SOURCE`);
   - `ETARC_VECTOR_SEARCH_TARGET` (`ETARC_VTARGET_SOURCE`).

   To delete the source, first remove its targets and source columns, and clear its outbox and
   reindex rows.
4. **Clean up the vectors.** Nothing does this automatically: `VectorStore.deleteCollection()` exists
   but has no caller, and the trigger sweep leaves stored vectors in place. They are invisible once
   no active target points at the namespace, but they still occupy space and still contain tenant
   text. An operator removes them with one statement — **a write, run deliberately, never as part of
   an investigation**:

   ```sql
   -- etarc_vector_record references the collection ON DELETE CASCADE
   DELETE FROM etarc_vector.etarc_vector_collection WHERE namespace = 'go.<entity>';
   ```

   This is DML on runtime tables that are outside the DBSM model, so it does not move the structure
   checksum. It must be repeated on each environment; it is not exported.

---

## Verification queries (read-only)

All `SELECT`. Prefer reading the sourcedata XML for configuration; use these for runtime state.

```sql
-- targets, their sources and tables
SELECT t.search_key, t.isactive, t.filter_display_logic, s.namespace, tb.tablename,
       s.isactive AS source_active, s.isenabled, s.config_version, s.distance_metric
  FROM etarc_vector_search_target t
  JOIN etarc_vector_source s USING (etarc_vector_source_id)
  JOIN ad_table tb ON tb.ad_table_id = s.ad_table_id
 ORDER BY t.search_key;

-- columns per source, in embedding order
SELECT s.namespace, sc.seqno, c.columnname, sc.iscontent, sc.isreindexonchange, sc.isactive
  FROM etarc_vector_source s
  JOIN etarc_vector_source_column sc USING (etarc_vector_source_id)
  JOIN ad_column c ON c.ad_column_id = sc.ad_column_id
 ORDER BY s.namespace, sc.seqno;

-- outbox state per source
SELECT s.namespace, o.status, count(*)
  FROM etarc_vector_outbox o JOIN etarc_vector_source s USING (etarc_vector_source_id)
 GROUP BY 1, 2 ORDER BY 1, 2;

-- are the delivery and reindex processes scheduled?
SELECT p.value, r.status, r.ad_client_id
  FROM ad_process_request r JOIN ad_process p USING (ad_process_id)
 WHERE p.value IN ('ETARC_ProcessVectorOutbox', 'ETARC_ProcessVectorReindex');

-- what is actually indexed (only exists after the first update.database with a ready source)
SELECT namespace, count(*) FROM etarc_vector.etarc_vector_record GROUP BY 1;
SELECT * FROM etarc_vector.etarc_vector_collection;

-- what text a record was embedded from (its fields)
SELECT external_key, metadata->'fields'
  FROM etarc_vector.etarc_vector_record
 WHERE namespace = 'go.invoice' LIMIT 5;
```

Each searchable window's `decisions.json` target must appear as an active `search_key` in the first
query, and vice versa:

```bash
grep -l '"vectorSearch"' artifacts/*/decisions.json
grep -h -A0 "<SEARCH_KEY>" {etendo_root}/modules/com.etendoerp.go/src-db/database/sourcedata/ETARC_VECTOR_SEARCH_TARGET.xml
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| The palette never shows records; the endpoint returns `200` with empty `matches` | **The index is empty.** Typical local state: `etarc_vector_record` has 0 rows while `etarc_vector_outbox` holds `PENDING` events, because **Process Vector Outbox** is not scheduled | Schedule **Process Vector Outbox** and **Process Vector Reindex** once at System level; check the provider key `ETENDO_PGVECTOR_OPENAI_API_KEY` (a LiteLLM key) is set |
| Outbox events end in `FAILED` | Provider error (key, endpoint, timeout) or a source with no content column | Fix the cause (the **Outbox Monitor** window shows the error), then run **Requeue Failed Vector Events** |
| Outbox events end in `SUPERSEDED` | The source configuration changed after they were queued | Expected. Request Reindex after the change |
| A window shows no results, or **all** record results vanished after a change | **Mismatched target key.** The SPA sends a key with no active `SEARCH_KEY` → `422 unknown_vector_target`. `useVectorSearch` turns any non-`ok` response into an empty list, and in a fan-out one failing request empties the results of every window (`useVectorSearch.js:29, 39, 49`). A `403` on one target (role lacks window access, spec not active / not *Show in MCP*) has the same effect | Make `decisions.json → vectorSearch.target`, `SEARCH_KEY` and the spec name identical; check the Network tab for the failing `vectorsearch` request |
| Old records are never found, new ones are | **Records predate the triggers.** Triggers capture changes only from the `update.database` that installed them | **Request Reindex** on the source |
| A record is found by its old text after an edit | The edited column has **Reindex on Change = N**, or the update that rebuilds the triggers was not run after adding the column | Set it to `Y`, run `update.database`, then Request Reindex |
| Searching invoices by customer name finds nothing | The name is not in the invoice's embedded text; FK columns embed IDs | Stored computed column (Procedure 1 worked example) |
| An unrelated record shows up under "Other matches" | Unrelated text already scores ≈ 0.50; the floor is 0.55 | Expected noise. Do not raise the score threshold without evaluating domain queries |
| A known exact match is missing from "Text matches" | "Text matches" only re-classifies the **semantic top 10 across all windows**; a frequent name or a stronger match in another window can push it out | Scope the search to the window (pill) |
| Opened from a window, results from other windows are missing | The palette starts scoped to the current window | Remove the scope pill |
| Result count looks wrong / `maxResults` ignored | The server reads **`topK`** (1–50, default 10), not `maxResults`. Clients before ETP-5602 sent `maxResults`, which was silently ignored and only worked because both defaults are 10 | Send `topK` (`NeoVectorSearchEndpoint.java:104-107`; `useVectorSearch.js:34`) |
| `update.database` refuses to run after someone "enabled pgvector" by hand | The extension was created outside an update, moving the structure checksum | See `{etendo_root}/modules/com.etendoerp.db.extended/doc/checksum-acceptance.md`; never create the extension or vector objects by hand |
| `503` "Semantic search is not available on this instance" | DB Extended not installed or not wired | Install/enable `com.etendoerp.db.extended` |

---

## Application shell responsibilities

The global search UI is split into a shared data layer and window-aware presentation:

- `useVectorSearchContracts` is the single loader for generated window contracts. Both the top bar
  and the palette consume this hook, so target keys, labels, and opt-in state always come from
  generated contracts rather than duplicated discovery code.
- `useVectorSearch` owns debouncing, authentication (`useApiFetch`), target fan-out, score filtering,
  result ordering, abort handling, and the loading state. It does not render UI or decide which
  windows are visible.
- `useRecentSearches` owns browser persistence, de-duplication, size limits, and the minimum query
  length for history entries.
- `vectorSearchConfig.js` and `vectorSearchRanking.js` are pure policy functions for scope
  resolution and grouping/ranking. They can be tested without React or a browser.
- `globalSearchMenu.js` is the pure policy for the page-navigation (window) entries: with a
  non-empty query it keeps only the windows whose translated or original label or route name
  matches, plus every window of a section whose group label matches. Matches are ranked in tiers,
  and Enter opens the first one. Matching and highlighting ignore case and accents. An empty query
  lists every visible window.
- `GlobalSearchContext` owns palette visibility, query state, the input reference, and
  keyboard-handler registration. `TopBar` owns the input and active-window pill. `CommandPalette`
  owns scope selection, navigation, rendering, and route actions.

Generated files under `artifacts/*/generated/` remain outputs. Changes to search behaviour belong in
these hooks, pure policy modules, or the palette/top-bar components.

---

## Checklist

**Any change**

- [ ] Inspected configuration from the sourcedata XML; any DB access was `SELECT` only
- [ ] Changed the dictionary through the **Search Source** window (so `CONFIG_VERSION` is bumped),
      or bumped `CONFIG_VERSION` by hand if the XML was edited
- [ ] **Check Indexing Readiness** reports the source ready
- [ ] `./gradlew export.database` → diff limited to the intended `ETARC_VECTOR_*.xml` rows in
      `com.etendoerp.go` (all with `AD_MODULE_ID` of `com.etendoerp.go`)
- [ ] `./gradlew update.database` run so the triggers match the new columns
- [ ] **Request Reindex** issued *after* the change; **Process Vector Reindex** and **Process
      Vector Outbox** scheduled at System level
- [ ] Outbox drained to `DONE`; `etarc_vector_record` populated for the namespace
- [ ] This guide's *Current configuration* table updated

**Adding/editing a column**

- [ ] The value is a physical column of the source table — never an FK ID, never a virtual column;
      cross-table values come from a stored computed column (`S`/`S`)
- [ ] Content vs metadata decided; Reindex on Change = `Y`; `SeqNo` set
- [ ] Remembered that metadata columns other than `IsSOTrx` appear in the result label

**Adding a window**

- [ ] `SEARCH_KEY` = `decisions.json → window.vectorSearch.target` = spec name (artifact directory)
- [ ] Spec active, window type, *Show in MCP*, entity on the source table; roles have window access
- [ ] `make regen ONLY=<spec> PUSH_TO_NEO=1` + `./gradlew export.database`; contract shows
      `frontendContract.window.vectorSearch`
- [ ] Endpoint returns `200` for the target; MCP lists it; palette shows the tag and opens the record;
      other windows still return results with the scope pill removed

**Removing**

- [ ] SPA opt-out (`decisions.json`) shipped before or with the target removal
- [ ] Target removed; source disabled only if no other target uses it
- [ ] Removed column → Request Reindex; removed source → vectors cleaned per environment
