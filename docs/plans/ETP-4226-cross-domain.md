# ETP-4226 Cross-Domain Plan: Editable Email Recipients for Document Sends

This PR is one ETP-4226 unit: making editable To/CC email recipients the default
for document sends. The change is inherently cross-domain because a single
user-facing capability (edit recipients in the send modal, backend stays
authoritative) requires a coordinated slice across the shared send UI, the
generator that wires the feature into windows, the shared locale strings, the
documentation, and the per-window functional guides.

## Domains

- `platform-change` (shared `contract-ui`): the send experience lives in shared
  components used by every document window — `SendDocumentModal.jsx` (editable
  recipient policy), the new `RecipientChipEditor.jsx` chip editor, the
  `recipientEdits.js` diff helper, `documentEmailSend.js` (carries the optional
  `recipientEdits` command field), and `ListView.jsx` (passes the send policy).
  Covered by `recipientEdits.test.js`, `documentEmailSend.test.js`,
  `RecipientChipEditor.vitest.jsx`, and the updated `SendDocumentModal.vitest.jsx`.
- `generator-change`: `cli/src/generate-frontend.js` emits the optional
  `window.sendDocument` override so a window can tune the recipient policy. The
  emission is gated — absent the override, the shared default applies and
  generated output is unchanged. Covered by `cli/test/generate-frontend.test.js`.
- `app-shell-core`: the seven user-visible `sendModal*` i18n keys added to both
  `en_US.json` and `es_ES.json` (the app is used in Spanish by real clients).
- `window:*` (`document`, `goods-receipt`, `goods-shipment`, `purchase-order`,
  `sales-invoice`, `sales-order`, `sales-quotation`): documentation-only updates
  to each `docs/generated-custom-windows/<window>.md` functional guide, kept in
  the same change per the self-documentation policy (behavior change + doc update
  = one atomic unit). No window artifact (`decisions.json`, `contract.json`,
  `generated/`) is modified.
- `repo-infra`: framework and ops documentation
  (`docs/transactional-email-framework.md`, `docs/email-contracts.md`,
  `docs/document-email-contract-implementation.md`,
  `docs/ops/transactional-email-security.md`, `docs/decisions-reference.md`,
  `docs/proposals/*`), plus the implementation plan.

## Why This Cannot Be Split Cleanly

The feature is a vertical slice of one capability. The chip editor, the diff
helper, the command-builder change, and the locale keys are meaningless apart
from each other; the generator override only matters because the shared UI reads
the policy it emits; and the per-window guides must land with the behavior change
they describe. Split apart, each piece is an inert fragment with no standalone
review value. Reviewed together they are coherent as "editable document-send
recipients, end to end."

## Tests

- Frontend unit (Vitest / node): `recipientEdits.test.js`,
  `documentEmailSend.test.js`, `RecipientChipEditor.vitest.jsx`,
  `SendDocumentModal.vitest.jsx` — full `contract-ui` suite green (701/0).
- Generator: `cli/test/generate-frontend.test.js` — asserts the gated
  `sendDocument` override emission (180/0).
- E2E (mocked Playwright): `e2e/tests/flows/document-send-recipients.mocked.spec.js`
  — edited send carries `recipientEdits`; untouched send omits it.
- Backend (com.etendoerp.go, separate repo, same branch): the email-framework
  JUnit suite, including the recipient-set/edits value objects and the
  document-contract recipient resolution.

## Rollback

Pure revert. The change is additive and gated:
- Reverting the commits removes the chip editor and restores the prior read-only
  send modal; the generator override is inert without a `window.sendDocument`
  declaration (none is shipped), so generated output is unaffected either way.
- No DB migration, no schema change, no window artifact regeneration is involved,
  so there is nothing to undo beyond the source revert.
- Multi-recipient *delivery* is independently gated by the provider adapter
  capability flags (`supportsMultipleRecipients`/`supportsCcChannel`), which
  remain `false` until the real gateway is verified — so a revert cannot leave
  partially-delivered sends in flight.

## Review Order

1. Platform — shared `contract-ui` send components and their tests.
2. Generator — `generate-frontend.js` gated `sendDocument` emission + test.
3. i18n — `en_US.json` / `es_ES.json` `sendModal*` keys (both locales present).
4. Docs — framework/ops docs and the seven per-window functional guides.
