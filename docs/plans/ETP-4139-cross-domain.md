# ETP-4139 Cross-Domain Plan

## Scope

This PR intentionally spans the shared document-email flow and the sales document windows that use it.

Domains:

- `repo-infra`: transactional email framework and contract implementation guides.
- `platform-change`: shared `SendDocumentModal` routing tests for contract-driven sends.
- `window:sales-order`: Sales Order window documentation for `sales-order-send`.
- `window:sales-quotation`: Sales Quotation window documentation for `sales-quotation-send`.

## Reason

The email contract framework is shared, but the user-facing behavior is validated through the sales document windows that already use the shared modal. Keeping the docs and routing coverage together avoids documenting a contract surface that is not proven by the shared UI entry point.

## Tests

- `git diff --check`
- `node --test tools/app-shell/src/components/contract-ui/__tests__/SendDocumentModal.test.js artifacts/sales-quotation/custom/__tests__/QuotationTopbarActions.test.js`
- `./gradlew test --tests com.etendoerp.go.schemaforge.email.InitialEmailContractsTest` in `etendo_core` for the paired runtime PR.

## Rollback

- Revert the Schema Forge commits on `feature/ETP-4139` to remove only documentation and test coverage changes.
- Revert the paired `com.etendoerp.go` PR if runtime contract registration must be rolled back.
- No generated artifacts or database exports are included in this PR.
