# Return from Customer

## Intent

Use this window to register a customer return against material that was previously shipped to the customer. The business goal is to capture the commercial return request, keep each returned item tied to the outbound shipment line it reverses, and move the document toward warehouse receipt and downstream credit or replacement actions.

## What this window should allow

Users should be able to review existing customer returns, open a specific return record, maintain the return header, and maintain return lines that describe what is coming back. The window should let users record the customer, address, warehouse, sales representative, return reason, dates, notes, and returned quantities, while preserving the link between each return line and the original goods shipment line. From the available actions, the window should also support progressing the return through document processing, picking lines from a shipment, receiving returned material, and starting follow-on commercial actions such as invoice or order creation.

## Interaction model

- Route: `/return-from-customer` for the list and `/return-from-customer/:recordId` for the detail view.
- Visibility: visible from the Sales menu in the app shell.
- Implementation type: generated app-shell window loaded from the window registry.
- Window shape: master-child document with `customerReturn` as the header entity and `customerReturnLine` as the child entity.
- Lines tab layout: this window uses `window.linesLayout = "inlineEditable"`. Rows render at 40 px with pencil and trash hover-action icons on the right; clicking pencil flips the row into inline edit; trash removes the row after confirmation. The add-line button and any related panels are unchanged from the classic layout. See `docs/ui-customization.md` section 13 for the full reference.
- List behavior: the generated page exposes a list view for existing returns and hides create from that list, so record creation is not evidenced from the list surface itself.
- Detail behavior: the detail view renders the header form, line table, line form, notes, document preview metadata, and a custom Related Documents tab.

## Reactive behavior and dependencies

- `partnerAddress` is a dependent selector driven by `businessPartner`, so changing the customer should narrow the address choices to that customer.
- Each line can store a `goodsShipmentLine` reference. Current evidence shows that this is the explicit anchor back to the original shipment context.
- The Related Documents tab follows the line-level `goodsShipmentLine` values, resolves the parent goods shipment records, and exposes clickable shipment chips that navigate back to `/goods-shipment/:id`.
- Header actions are status-driven document actions rather than free-form edits. Current generated actions include document processing, receive materials, pick from shipment, create invoice, and create order, which indicates the return is expected to advance through a controlled lifecycle.
- Returned quantity, net unit price, line net amount, and tax are wired to amount-related callouts in the contract, and the header exposes read-only net and gross totals. The generated line table still renders `unitPrice` as a plain `number` column rather than an `amount`, so currency formatting is not yet evidenced there. This suggests totals should react to line changes, but the exact recalculation timing and discount behavior are not directly shown in the current evidence.
- Defaulting is partially evidenced: document status defaults to draft and order date defaults from the current date. No explicit defaulting was found for shipment selection, warehouse, or return reason beyond their selector definitions.

## Gap assessment

- Research notes describe this window as the customer-side RMA flow tied to `M_RMA` and `M_RMALine`, but the generated contract currently labels the entities with `C_Order` and `C_OrderLine` table names. That mismatch is an open ambiguity in the current evidence and should not be treated as resolved behavior.
- Expected validation that a returned quantity cannot exceed the shipped quantity, or the remaining quantity after earlier returns, is described in research notes but is not directly evidenced in the generated contract or page code. Treat this as a gap until verified in runtime behavior or backend rules.
- Expected validation that the selected shipment line belongs to the same customer and shipment context as the header is not visible in the current repo evidence. The shipment-line anchor exists, but consistency enforcement is not demonstrated.
- The return lifecycle suggests that receiving materials should create or coordinate with a return material receipt and that invoicing may create a customer credit document, but this document does not have direct runtime evidence for those downstream effects beyond the available actions and research notes.
- The Related Documents tab only shows upstream goods shipments. The custom code explicitly marks credit-note linkage as pending backend support, so downstream financial document visibility is still incomplete.
- `pick from shipment` and `add orphan line` imply richer line-population workflows, but the exact user flow, filtering rules, and safeguards for those actions are not visible in the current code snapshot.

## Manual verification

1. Open `/return-from-customer` and confirm the Sales menu entry reaches the generated list view.
2. Open a return record and confirm the detail view shows header fields, child lines, notes, and the Related Documents tab.
3. Change the business partner and verify the partner-address selector refreshes based on that customer.
4. Add or edit a line and verify the UI can relate the line to a goods shipment line while exposing returned quantity, UOM, tax, and pricing fields.
5. Open Related Documents and confirm the shipment chips navigate back to the originating goods shipment records.
6. Execute a return lifecycle action such as pick from shipment, receive materials, create invoice, or create order, and verify the record refresh preserves the shipment-linked context and clearly reflects the new document status.
7. Specifically test whether the UI or backend blocks over-return quantities or shipment/customer mismatches, because those validations are expected semantically but not evidenced in the current implementation artifacts.

## Automated evidence

- App shell menu entry exists in `tools/app-shell/src/menu.json`.
- Window registry maps `return-from-customer` to the generated implementation in `tools/app-shell/src/windows/registry.js`.
- The generated page config shows a list route, detail route usage, master-child detail view, hidden delete when complete, and the Related Documents custom tab in `artifacts/return-from-customer/generated/web/return-from-customer/CustomerReturnPage.jsx`.
- The contract exposes the dependent `partnerAddress` selector, the `goodsShipmentLine` line field, header actions such as `rMReceiveMaterials`, `rMPickFromShipment`, `rMCreateInvoice`, and `createOrder`, and read-only total/status fields in `artifacts/return-from-customer/contract.json`.
- The Related Documents custom component resolves goods shipments by traversing `customerReturnLine.goodsShipmentLine` and linking to the parent goods shipment records in `artifacts/return-from-customer/custom/RelatedDocuments.jsx`.
- Research notes in `artifacts/return-from-customer/FINDINGS.md` document the intended customer-return lifecycle and expected shipment/receipt/credit relationships.
- I did not find dedicated browser automation for this window in the current repository evidence.