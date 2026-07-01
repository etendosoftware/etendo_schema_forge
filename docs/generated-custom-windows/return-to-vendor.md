# Return to Vendor

## Intent

The Return to Vendor window should let purchasing users register a vendor return order, anchor each return line to received material that is being sent back, and move the return through its order lifecycle before downstream shipment or invoice steps happen elsewhere.

## What this window should allow

- Create and update a vendor-return header with the vendor reference, order date, business partner, partner address, return reason, warehouse, payment method, payment terms, price list, and supporting notes.
- Review return orders in a list/detail flow and inspect summary values such as total net amount, total gross amount, currency, and delivered state.
- Open a specific return and work with its `lines` child dataset so the order captures which products, quantities, taxes, and amounts are being returned, even though the generated line table currently only shows `lineGrossAmount` as the visible grid column.
- Pick or edit return lines from prior goods receipts instead of forcing users to build the return entirely from scratch.
- Process a draft return order so the document can leave draft status once the selected lines and header context are ready.
- Follow linked purchasing records through the related-documents tab when upstream or downstream documents already exist.

## Interaction model

- **Route:** `/return-to-vendor` for the list and `/return-to-vendor/:recordId` for the detail form.
- **Visibility:** Visible in the Purchases menu.
- **Implementation type:** Generated standard list/detail window registered in `tools/app-shell/src/windows/registry.js`, using the shared app-shell generated route flow plus a generated detail page that adds a related-documents tab.
- **Window shape:** Master-child window. The primary `header` entity is backed by `C_Order`, the main child table is `lines` on `C_OrderLine`, and the generated detail page also exposes secondary child tabs such as `basicDiscounts`.
- An **Attachments** tab is available in the detail tab strip, allowing files to be attached to the current record.
- Lines tab layout: this window uses `window.linesLayout = "inlineEditable"`. Rows render at 40 px with pencil and trash hover-action icons on the right; clicking pencil flips the row into inline edit; trash removes the row after confirmation. When the add-row form is open, existing rows stay in `InlineLinesPanel` so column widths remain stable; the form renders in a header-hidden `DataTable` below that handles callouts, selectors, and focus. Clicking "Añadir línea" while a form is already open saves the current line and opens a fresh form scrolled into view. See `docs/ui-customization.md` section 13 for the full reference.

## Reactive behavior and dependencies

- Header and line behavior are coordinated through the shared app-shell entity flow: opening a header detail also loads its child rows, and adding or updating child rows refreshes both the child collection and the header so summary totals stay current.
- The vendor context is partially reactive. `businessPartner` has a callout, `partnerAddress` has its own callout, and both fields become read-only once the document is processed or temporarily blocked by `DocStatus='TMP'`. That supports the expectation that vendor selection drives valid address and commercial context.
- Agentic selector behavior now treats `partnerAddress` as dependent on `businessPartner`, passing `C_BPartner_ID` to the address selector so vendor-return agents do not need to hardcode partner-location IDs.
- `orderDate` has a line-update callout and defaults to `@#Date@`, which indicates date changes should propagate to line-level context even though the exact downstream field updates are not described in the current evidence.
- `priceList` has a callout, while `paymentMethod`, `paymentTerms`, `warehouse`, and return-reason selectors are exposed through selector/search endpoints. This shows the header depends on selector-backed commercial configuration rather than free-text entry.
- Line `tax` is exposed as a selector for the agentic flow. It should be resolved with purchase-mode, header date, price list, and partner-address context before creating or updating return lines.
- Draft lifecycle actions are status-driven. `Pick/Edit Lines` is only visible while `Processed='N'`, `Process Order` is available while the document is not voided or closed, and `Insert Orphan Line` appears only when the document is still unprocessed and `RMAllowOprhanLine='Y'`.
- Line anchoring is explicit in current evidence. Each return line carries a read-only `goodsShipmentLine` field mapped to `M_Inoutline_ID` and labeled **Goods Receipt Line**, plus read-only return quantity, net amount, gross amount, tax, and delivered quantity fields. That supports a receipt-linked return flow where users pick source receipt lines first and then review the anchored commercial values.
- Totals and tax behavior are visible at a summary level. The header page summarizes `summedLineAmount`, `grandTotalAmount`, currency, and delivered state, and the contract exposes a `lineTax` child dataset. The current evidence supports totals and tax visibility, but not the exact recalculation timing or whether taxes can be edited directly as part of the main return workflow. The `lineTax` table shows tax name, tax amount, and taxable amount per line — it does not display the rate percentage. Rate values are visible in the `/tax` catalog, where the `Rate` column uses a three-state tag: green `+N %` for positive rates, neutral `0 %` for zero, and red `−N %` for negative rates (withholdings).
- The generated detail page includes a custom **Related Documents** tab and the contract marks the window as `relatedDocuments: true`, so users should be able to inspect linked purchasing records from the return order context.

## Gap assessment

- A vendor-return process commonly needs explicit validation that returned quantities cannot exceed the source receipt quantities and that only eligible receipt lines can be selected. The current evidence shows the pick action and the receipt-line anchor, but it does not show the selection rules or quantity-validation behavior. Treat those validations as a gap or open ambiguity.
- The contract exposes downstream-looking actions such as `rMReceiveMaterials`, `rMCreateInvoice`, and `rMPickFromShipment`, which suggests shipment or settlement steps exist around this order. However, the current visible window evidence does not explain when those steps become available in the UI or how they relate to the separate Return to Vendor Shipment window. Treat downstream shipment semantics as an open ambiguity.
- The line contract also exposes CRUD endpoints, selector endpoints, and generated line forms, while many key commercial fields are read-only and the primary visible action is receipt picking. That leaves an ambiguity about how much manual line editing is actually intended for end users versus what is only technically available through the generated surface.
- The `Insert Orphan Line` action implies the business may allow return lines that are not anchored to a source receipt in some cases. Current evidence does not explain the business rules for when orphan lines are allowed or how that affects source-document linkage expectations.
- The window shows totals, taxes, discounts, and related documents, but the current evidence does not describe concrete validation for return reason requirements, shipment creation prerequisites, or whether processing the order automatically creates downstream records. Those behaviors should not be assumed without manual confirmation.

## Manual verification

1. Open `/return-to-vendor` and confirm the window is reachable from the Purchases menu and loads as a generated list/detail route.
2. Open a draft record at `/return-to-vendor/<recordId>` and confirm the header shows **Pick/Edit Lines** and **Process Order**. If the business allows orphan lines for that record, confirm **Insert Orphan Line** is also visible.
3. Use **Pick/Edit Lines** and confirm the resulting child rows include a read-only **Goods Receipt Line** reference, along with return quantity, net/gross amount, tax, and delivered-quantity context.
4. Change vendor-related header inputs on a draft record and confirm partner address options are scoped to the selected business partner before the record is processed.
5. Resolve or edit a line tax value only after the header has date, price list, and partner address context, and confirm the selector returns purchase tax options instead of an empty undiagnosed list.
6. Add or update a child line and confirm the line list refreshes and the header summary values update to reflect the current return totals.
7. Process the order and confirm document status moves out of draft, draft-only actions disappear or become unavailable, and previously editable header fields become read-only where the contract says they should.
8. Open the **Related Documents** tab on a return that already has linked records and confirm the window exposes navigation back to the related purchasing flow.
9. Try selecting or entering a quantity that would exceed the source receipt quantity, and note whether the window blocks it, warns about it, or accepts it without visible validation.
10. Open a saved record and confirm the **Attachments** tab is visible in the tab strip. Upload a file and verify it appears in the table. Download it and delete it. When multiple files exist, confirm 'Download all (ZIP)' and 'Delete all' appear in the table header and that 'Delete all' shows a confirmation dialog before removing all files.

## Automated evidence

- `tools/app-shell/src/menu.json` places `return-to-vendor` in the visible Purchases menu.
- `tools/app-shell/src/windows/registry.js` registers `return-to-vendor` as a generated window loader, so `/return-to-vendor` and `/return-to-vendor/:recordId` resolve through the shared app-shell window flow documented in `docs/generated-custom-windows/app-shell-functional-flows.md`.
- `artifacts/return-to-vendor/contract.json` defines the `header` entity on `C_Order`, the `lines` child entity on `C_OrderLine`, the `lineTax` child entity, selector endpoints for header and line foreign keys, summary fields such as `summedLineAmount` and `grandTotalAmount`, and action endpoints including `rMPickfromreceipt`, `documentAction`, and `rMAddOrphanLine`.
- `artifacts/return-to-vendor/generated/web/return-to-vendor/HeaderPage.jsx` shows the generated detail page is a master-child `DetailView` with `lines` as the detail entity, `basicDiscounts` as a secondary tab, summary cards for totals/currency/delivered state, and a custom `Related Documents` tab.
- `artifacts/return-to-vendor/generated/web/return-to-vendor/index.jsx` exposes CRUD URLs for `header`, `lines`, `lineTax`, `basicDiscounts`, `tax`, `paymentOutPlan`, and `paymentOutDetails`, which confirms the return order participates in a broader purchasing and settlement surface even though the current window narrative centers on the header-plus-lines workflow.
- No dedicated return-to-vendor UI test was found in `tools/app-shell`; the current evidence is contract-backed and source-backed rather than browser-level automated proof.
- The generated `HeaderPage.jsx` includes `AttachmentsTab` in its `customTabs` prop, wired to the `C_Order` AD table.
- **ETP-3995 — Related Documents tab i18n**: The generated page file now uses `labelKey: 'relatedDocuments'` in the `customTabs` prop instead of a hardcoded `label: 'Related Documents'` string, so the tab title renders via the active UI language (e.g. "Documentos relacionados" in Spanish) regardless of the browser locale.

## PSD2 dependency — `EM_Psd2_Generate_Bank_Payment`

`com.etendoerp.go` now depends on the **PSD2** module, which adds the
`EM_Psd2_Generate_Bank_Payment` ("Generate Bank Payment") column to the shared
core table this window sits on (`C_Order` / `C_Invoice` / `FIN_Payment`). Because
Schema Forge extracts from AD, that column surfaces in this window's contract as a
**system field** — present in the backend contract but **not** rendered in the
frontend (there is no `AD_Field` for it on this window). No UI or behavior change;
this note only records why the contract was regenerated when the PSD2 dependency
was added. Full rationale: [`docs/plans/psd2-dependency-cross-domain.md`](../plans/psd2-dependency-cross-domain.md).
