# ETP-5123 — INF-06 Victoria decision

## Decision

Merge INF-06 into the generic transactional-document-type defect. It does not remain a separate
Victoria-specific MCP bug.

## Evidence

The reported records (1000011–1000015) were created through the NEO Headless/MCP
`sales-quotation` contract with:

- `documentType = Quotation` (`C_DocType_ID`)
- `transactionDocument = Standard Order` (`C_DocTypeTarget_ID`)

The Sales Quotation window filters on `transactionDocument`, while the Order window therefore
found the records. Updating `transactionDocument` to the Quotation document type made all five
records visible in the correct window. A quotation created through the UI already populated both
values consistently.

## Scope and fix

This is not a sales-only rule. The runtime resolver is shared by transactional document families
and applies the authoritative tab subtype to both document-type fields when the tab defines it.
The MCP create path now invokes that same resolver before persistence, preserving an explicitly
submitted value when the tab has no authoritative subtype constraint.

The `neo_batch` create path reaches the common CRUD default/callout pipeline and is covered by the
same resolver contract. The focused regression suite covers the resolver mapping matrix,
MCP create integration point, and batch pipeline call site.

## Reproduction status

The Victoria report supplies environment evidence and affected record IDs; this repository does
not claim an independent replay against that demo database. The symptom and correction match the
generic defect exactly, so no additional Victoria-only cause or severity is justified. If a future
Victoria report concerns a different MCP operation or persists after both fields are synchronized,
open a new finding rather than reopening INF-06 under this decision.
