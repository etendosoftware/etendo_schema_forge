# Product Import Category Resolution and Auto-Creation

**Status:** Proposed
**Jira:** Unassigned follow-up block
**Date:** 2026-08-14
**Owners:** Etendo Go team

## 1. Summary

Extend the existing Products CSV/TXT import so that each product can receive a product category. The importer must resolve an existing category when possible and create it automatically when it does not exist, then assign the resolved category to the product in the same import flow.

The outcome is an executive-visible functional capability: users can import products without pre-configuring every product category manually.

This is a follow-up to the generic import delivered by ETP-4447 and the product import work already present in the ETP-4669 history. The current implementation intentionally reduced the product descriptor to four columns and excludes `productCategory`; this PRD restores category support as a deliberate, deterministic feature.

## 2. Problem

The current product import accepts `searchKey`, `name`, `description`, and `price`. Product category is not accepted from the file. Users must therefore create or prepare categories separately before importing products, which makes bulk onboarding slower and error-prone.

The solution must avoid creating duplicate categories, must produce actionable row-level errors, and must preserve the existing composite product-and-price import behavior.

## 3. Goals

- Accept a category value in the Products CSV/TXT import.
- Match an existing product category deterministically.
- Create a missing category automatically when the input contains enough information.
- Assign the existing or newly created category to the imported product.
- Reuse a category resolution within one import run.
- Keep category creation safe when multiple rows refer to the same new category.
- Preserve current product, price, deduplication, validation, and error behavior.
- Deliver implementation and evidence across Schema Forge, `schema_forge_core`, and `com.etendoerp.go` where each repository is required.

## 4. Non-goals

- Redesigning the Product Category window.
- Changing product-category permissions or general master-data maintenance.
- Fuzzy matching that can silently select an ambiguous category.
- Importing arbitrary category hierarchies in the first iteration.
- Changing the existing price-list selection behavior.
- Editing generated files under `artifacts/*/generated/` manually.

## 5. User experience

The product import template adds a category column. Recommended supported headers are:

- `categoryCode` / `codigoCategoria` / `código categoría`
- `categoryName` / `nombreCategoria` / `nombre categoría`
- `category` / `categoria` / `categoría` as a convenience fallback

The implementation should support `category` as the minimum viable input. When both code and name are supplied, code is authoritative and name is validated against the resolved category when possible.

For a single `category` value, the resolver must:

1. Match an exact category `searchKey`.
2. Otherwise match an exact normalized category `name`.
3. If there is no match, create a category using the documented deterministic creation rule.
4. If more than one category matches the normalized name, reject the row with an ambiguity error.

Normalization may ignore leading/trailing whitespace, case, and accent differences for comparison only. It must not overwrite the stored category name.

## 6. Creation policy

The implementation must document and test one deterministic policy for creating a category from a single `category` value. The recommended policy is:

- preserve the original input as the category `name`;
- derive `searchKey` using the existing project-safe normalization/slug convention;
- reject creation if the derived key is empty or conflicts with a different category;
- if the product organization requires business-controlled codes, require `categoryCode` for creation and use `categoryName` only as display text.

The final implementation must choose one policy explicitly before coding. It must not guess a business identifier silently.

Blank category behavior must also be explicit. The recommended default is to preserve the existing product default only when the category column is absent or blank; a supplied but invalid category must fail the row with a clear message.

## 7. Functional requirements

### FR-1: Contract and descriptor

The Product import configuration must expose the category field(s), aliases, labels, and validation rules through the source contract/decision files. Generated contracts must be regenerated through the supported pipeline.

### FR-2: Existing-category matching

The importer must resolve categories using deterministic exact matching, with code before normalized name. Matching must be scoped to the current organization/client context used by the NEO endpoint.

### FR-3: Automatic creation

When no category exists and the creation policy permits it, the importer must create the category and use its identifier for the product operation.

### FR-4: Reuse and concurrency

Within one import run, repeated references to the same category must reuse one resolution. Parallel rows must not result in duplicate category records or inconsistent product references.

### FR-5: Atomic product flow

The category resolution/create and product creation must be coordinated so a product is never reported as successfully imported while its required category assignment failed. Existing product-plus-price composite operations must continue to work.

### FR-6: Error reporting

Errors must remain row-scoped and actionable. At minimum, distinguish:

- category not supplied when required;
- category ambiguous;
- category creation rejected by validation or authorization;
- duplicate category key/conflict;
- product assignment failure;
- batch or reference failure.

### FR-7: Authorization and safety

Category creation must use the same authenticated organization/client context and authorization model as direct Product Category creation. The importer must not accept arbitrary foreign identifiers or bypass NEO validation.

### FR-8: Backward compatibility

Existing files without a category column must retain current behavior, including product defaults where applicable. Existing price import behavior must remain unchanged.

## 8. Repository responsibilities

### Schema Forge

- Update the Product import source descriptor and source decision/contract configuration.
- Preserve the current product and price composite operation.
- Regenerate contracts using the supported pipeline.
- Add descriptor and contract regression tests.
- Update the relevant generated-window or import documentation if behavior documentation exists.

### `schema_forge_core`

- Extend the generic import orchestration only where required for dependent lookup/create resolution.
- Provide per-run category caching and duplicate-create protection.
- Keep generic behavior reusable; do not hardcode Product-specific rules in shared components.
- Preserve row-level error classification and localized messages.
- Add tests for repeated categories, ambiguous matches, missing categories, and concurrent references.

### `com.etendoerp.go`

- Verify that the NEO batch flow supports category create/resolve followed by Product creation and assignment.
- Use existing NEO contracts and batch/reference mechanisms.
- Add a qualified `NeoHandler` only if custom server-side behavior is genuinely required; do not add Product-specific logic to generic CRUD/default/servlet classes.
- Add backend tests for authorization, reference wiring, atomicity, duplicate-key handling, and organization/client scope.

## 9. Acceptance criteria

1. A valid CSV containing a category code imports the product and links the existing category.
2. A valid CSV containing an existing category name imports the product and links the existing category.
3. A valid CSV containing a new category creates exactly one category and links all relevant products to it.
4. Repeated rows with the same new category do not create duplicates, including when import concurrency is enabled.
5. An ambiguous category name fails the affected rows with a clear error and does not assign an arbitrary category.
6. A category creation conflict or authorization failure fails the affected product row and leaves no orphaned successful product record.
7. A file without category columns continues to import according to the existing default behavior.
8. Existing price import remains functional in the same batch.
9. The import UI displays the category field and localized validation/error messages.
10. Tests and documentation identify at least three edge cases and provide evidence for the complete flow.

## 10. Test plan

### Schema Forge

- descriptor maps supported headers and aliases;
- generated Product contract contains the category import configuration;
- legacy four-column input remains valid;
- composite product/price descriptor includes the resolved category reference.

### `schema_forge_core`

- exact code match;
- normalized name match;
- ambiguous name rejection;
- category creation and per-run cache reuse;
- concurrent duplicate-create protection;
- row-level failure classification and localization;
- blank/missing category policy.

### `com.etendoerp.go`

- existing category reference in `/batch`;
- category create followed by Product reference wiring;
- atomic rollback or row failure when the dependent operation fails;
- duplicate category key;
- organization/client isolation;
- authorization denial;
- preservation of Product price operation.

### End-to-end

Run a real import against a test organization with:

- one existing category by code;
- one existing category by name;
- one new category referenced by multiple products;
- one ambiguous category;
- one invalid category;
- one legacy file with no category column.

Record imported product count, created category count, links, failed rows, and duplicate checks.

## 11. Delivery sequence

Work sequentially on the latest `origin/epic/ETP-3504` base:

1. Confirm the final category input and creation policy.
2. Create the Jira key-specific branch in all three designated repositories.
3. Implement source contract and descriptor changes in Schema Forge.
4. Implement reusable resolution/orchestration support in `schema_forge_core`.
5. Implement or validate NEO batch/reference behavior in `com.etendoerp.go`.
6. Run focused tests independently in every changed repository.
7. Run the end-to-end import scenario.
8. Review the complete diff, documentation, and generated-output provenance.
9. Push each repository with `git push --no-verify` only after validation passes.
10. Update Jira only through a write-capable Jira integration; `jira-local` alone is read-only.

## 12. Risks and decisions

- **Category identifier semantics:** deriving a code from a free-text name may conflict with business expectations. Resolve this before implementation.
- **Concurrent creation:** client-side caching alone is insufficient if requests are split across batches; server-side uniqueness/idempotency must be verified.
- **Transaction boundary:** confirm whether the existing `/batch` endpoint guarantees the required atomicity across category, product, and price operations.
- **Permissions:** automatic category creation may require a product-import permission decision and explicit QA coverage.
- **Generated artifacts:** the source-of-truth path must be used for all contract changes.

## 13. Definition of done

- Functional acceptance criteria pass.
- Relevant tests pass in each changed repository.
- End-to-end evidence is recorded.
- Documentation reflects the new import behavior.
- No generated output was edited manually.
- Branches follow `feature/ETP-####` once a Jira key is assigned.
- Commit and PR titles follow `Feature ETP-####: <Title Case summary>`.
- QA validation is recorded or explicitly marked pending.
- Jira status/comment changes are reported truthfully.
