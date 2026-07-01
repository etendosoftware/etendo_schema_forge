# Proposals

Design proposals and RFCs awaiting review, approval, or decomposition into implementation plans.

Proposals differ from plans:

- **Proposals** describe the *what* and *why* at a strategic level. They are reviewed by stakeholders, approved or rejected, and may be superseded by newer proposals. They live here until promoted.
- **Plans** (`../plans/`) describe the *how* at an execution level, with task breakdown and acceptance criteria.

## Lifecycle

1. Proposal written and committed in this folder
2. Stakeholders review and approve
3. If approved, the proposal is promoted to an implementation plan under `../plans/`
4. If rejected or deferred, the proposal stays here for historical reference or moves to `discarded/` (to be created when first discard happens)

## Index

| File | Status | Description |
|------|--------|-------------|
| [etendo-go-apps.md](etendo-go-apps.md) | Draft / Pending approval | Executive summary — external apps framework for Etendo Go (Jira Connect-style) |
| [etendo-go-apps-technical-annex.md](etendo-go-apps-technical-annex.md) | Draft / Pending approval | Technical annex — architecture, descriptor, JWT+JWKS, BFF, lifecycle, SDK |
| [etendo-apps-sdk.md](etendo-apps-sdk.md) | Draft / Pending approval | Apps SDK v1 (internal apps) — `@etendo/apps-sdk` + `@etendo/apps-sdk-bff`, migration from spike, quick-order as first consumer |
| [apps-sdk-styling.md](apps-sdk-styling.md) | Draft / Pending approval | Apps SDK styling (Option A) — ship shared CSS tokens + base.css so iframe apps inherit shell look with one import |
| [apps-sdk-mock-installer.md](apps-sdk-mock-installer.md) | Draft / Pending approval | Mock App Store installer — localStorage-backed install toggle, catalog-driven menu entries for SDK apps |
| [initial-organization-setup-accounting.md](initial-organization-setup-accounting.md) | Reviewed / Pending plan | Source-grounded proposal for automatic accounting in Initial Organization Setup: global package resolution, org wiring, pre-ready validation, and standard `AD_Org_Ready` completion |
| [document-send-editable-email-recipients.md](document-send-editable-email-recipients.md) | Draft / Pending approval | Editable To/CC recipients as the DEFAULT for all document sends (v1 evolves in place, optional `recipientEdits`, ETP-4226) — backend-owned execution, `decisions.json` opt-out/override, domain-sliced rollout |
