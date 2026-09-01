# Global semantic vector search configuration

Schema Forge opts a window into the global semantic command palette through its contract. Etendo Go exposes the authenticated endpoint and DB Extended owns indexing and retrieval. A working window requires both the contract opt-in and an active DB Extended search target.

## Ownership

- `com.etendoerp.db.extended` owns the reusable tables, the Application Dictionary fields, and the `AD_DATASET_TABLE` entries that export vector providers, sources, and source fields.
- The feature module owns its concrete provider and source configuration. For example, Product and Contacts configuration belongs to `com.etendoerp.go`.
- Schema Forge owns the opt-in in `artifacts/<spec>/decisions.json` and the resulting contract. A missing `vectorSearch` object is the default opt-out; do not add disabled entries to unrelated windows.

## Add a window

1. Select the visible Schema Forge spec and the backing Etendo table. Do not use a hidden classic window when the user-facing spec has a different route.
2. Choose a stable target key using the user-facing business entity, such as `product` or `business-partner`. It must match `[A-Za-z][A-Za-z0-9_.-]{0,127}` and be unique among active search targets.
3. Add the target to the spec's `decisions.json`:

   ```json
   {
     "window": {
       "vectorSearch": { "target": "business-partner" }
     }
   }
   ```

4. Regenerate the contract so `frontendContract.window.vectorSearch` has the same target. The command palette loads opted-in contracts, derives request targets and result labels from them, and routes a result to `/<spec>/<recordId>`. When opened from an opted-in window, it initially shows a removable scope pill for that window; removing it searches every opted-in target.

5. Optional navigation shortcuts belong in `window.searchSuggestions`, each with an i18n `label` and a local `path`. For example, a Sales Invoice shortcut can declare `{ "label": "overdueSalesInvoices", "path": "/sales-invoice?filter=overdue" }`. The global search shows these under Suggestions only when their window is in the selected scope.

## Sources that share a table

When two windows use the same table, configure one source that indexes the complete table and add a DB Extended search target for each user-facing subset. The target's Display Logic is evaluated against indexed metadata at query time; every field referenced by it must be a source field with `Reindex on Change` enabled.

For example, Sales Invoice and Purchase Invoice both use `C_Invoice`. Their shared Go-owned source indexes `DocumentNo` as content and `IsSOTrx` as metadata. The `sales-invoice` target uses `@IsSOTrx@='Y'`; `purchase-invoice` uses `@IsSOTrx@='N'`. Their contracts declare the corresponding target, so the command palette filters, labels, and opens the appropriate editing window.
5. In DB Extended, create or reuse an embedding provider and create a source for the backing table. Assign both source and provider to the feature module. Add only business-identifying source fields: for Contacts these are Name, Search Key, Tax ID, email, and phone. Avoid generic boilerplate text because it makes unrelated records look semantically similar.
6. Ensure the DB Extended `AD_DATASET_TABLE` registration exports provider, source, source-column, and search-target records. The child filters must select their parents by owning module.
7. Update existing records to enqueue them, let Vector Outbox process them, then verify the source has an active collection and provider.

## Application shell responsibilities

The global search UI is split into a shared data layer and window-aware presentation:

- `useVectorSearchContracts` is the single loader for generated window contracts. Both the top bar and the palette consume this hook, so target keys, labels, and opt-in state always come from generated contracts rather than duplicated discovery code.
- `useVectorSearch` owns debouncing, authentication, target fan-out, score filtering, result ordering, abort handling, and the loading state. It does not render UI or decide which windows are visible.
- `useRecentSearches` owns browser persistence, de-duplication, size limits, and the minimum query length for history entries.
- `vectorSearchConfig.js` and `vectorSearchRanking.js` remain pure policy functions for scope resolution and grouping/ranking. They can be tested without React or a browser.
- `GlobalSearchContext` owns palette visibility, query state, the input reference, and keyboard-handler registration. `TopBar` owns the input and active-window pill. `CommandPalette` owns scope selection, navigation, rendering, and route actions.

Generated files under `artifacts/*/generated/` remain outputs. Changes to search behavior belong in these hooks, pure policy modules, or the palette/top-bar components, followed by contract regeneration when the schema changes.

## Contacts example

The user-facing `contacts` spec is backed by `C_BPartner`. Its target is `business-partner`, because the Contacts window covers customers, vendors, and employees; it is not a customer-only table. The UI label remains contract-driven (`Contacts`), while the target stays stable and technical.

## Verification

1. Run `update.database` after versioning the source data, then `export.database`; a clean diff confirms ownership and dataset export are stable.
2. Query `GET /sws/neo/vectorsearch` with a valid session and the declared target. A `422 VECTOR_COLLECTION_NOT_FOUND` means the target's source, provider, or collection is not active yet.
3. In the command palette, enter at least three characters. On an opted-in window, verify that its localized removable scope pill appears and that the request includes only that target; remove it and verify the request includes every opted-in target. During the request, the localized semantic-loading placeholder is visible. Semantic results render before page-navigation results, show the contract label and score, and open the matching spec in edit mode.

## Edge cases

- A contract target without an active vector source causes the combined semantic request to fail; deploy contract and source configuration together.
- Organization access is resolved server-side from the active role. A record outside the readable organization tree must not be returned.
- Scores are nearest-neighbour ranking signals, not confidence probabilities. Use a configured minimum score and evaluate domain-specific thresholds before treating a match as relevant.
