# Return Material Receipt - Research Findings

## Identity

- **Window:** Return Material Receipt (Sales Management > Transactions > Return Material Receipt)
- **Etendo Window ID:** 53013 (approximate, may vary by Etendo version)
- **Tables:** `M_InOut` (header) + `M_InOutLine` (lines)
- **Category:** Sales

## Relationship to M_InOut

The `M_InOut` table is shared across multiple windows, differentiated by `IsSOTrx` and
**`C_DocType.IsReturn`** — NOT by `MovementType`.

> **Correction (verified against a real instance, `etendo_go_new`):** an earlier version of
> this document claimed `MovementType` differs between a normal document and its return
> (`C-` vs `C+`, `V+` vs `V-`). That is **false**. A live query against `M_InOut` joined to
> `C_DocType` shows `MovementType` is IDENTICAL between a document and its return — only
> `C_DocType.IsReturn` differs:
>
> ```
> documentno | issotrx | movementtype | doctype_name  | isreturn
> -----------+---------+--------------+---------------+---------
> 1000012    | Y       | C-           | MM Shipment   | N        <- goods-shipment
> 1000002    | Y       | C-           | RFC Receipt   | Y        <- return-material-receipt (SAME movementtype)
> 10000000   | N       | V+           | MM Receipt    | N        <- goods-receipt
> 1000002    | N       | V+           | RTV Shipment  | Y        <- return-to-vendor-shipment (SAME movementtype)
> ```
>
> The correct discriminator table:

| Window | IsSOTrx | MovementType | C_DocType.IsReturn | Direction | Doc Type |
|--------|---------|-------------|---------------------|-----------|----------|
| Goods Shipment (Sales) | Y | C- | N | Customer outbound | Shipment |
| **Return Material Receipt** | **Y** | **C-** | **Y** | **Customer inbound** | **Customer Return Receipt** |
| Goods Receipt (Purchase) | N | V+ | N | Vendor inbound | Goods Receipt |
| Return to Vendor Shipment | N | V+ | Y | Vendor outbound | Return to Vendor |

The `whereClause` on the tab filters to `IsSOTrx='Y' AND [doctype resolves to a return]` to
show only customer return receipts — in practice this is implemented by joining to
`C_DocType` and checking `IsReturn='Y'`, since `M_InOut` itself carries no `IsReturn` column.

## MovementType Encoding

The two-character `MovementType` encodes:
- First character: `V` = Vendor, `C` = Customer
- Second character: `+` = Inbound (receiving), `-` = Outbound (shipping)

**`MovementType` only encodes direction/party, not return-vs-normal.** A customer return
receipt still uses `C-`... wait: in the verified data above, `RFC Receipt` (return-material-receipt)
also shows `movementtype = C-`, the same as a normal `MM Shipment`. The direction letter pair
does **not** flip on return; the actual physical stock direction (in vs. out) for a return
document is instead determined by the document's `C_DocType` configuration (`IsReturn`), not
by a distinct `MovementType` code. Do not rely on `MovementType` to distinguish a return
document from its non-return counterpart — always join to `C_DocType.IsReturn`.

## Relationship to Return from Customer (RMA)

The typical sales return flow is:

```
1. Return from Customer (RMA) — M_RMA — authorization/approval
2. Return Material Receipt — M_InOut (C+) — physical receipt of returned goods (this window)
3. Credit Memo to Customer — C_Invoice — financial settlement / refund
```

The RMA (`M_RMA`) is the authorization step. It references the original Goods Shipment (`M_InOut` with `C-`) and specifies which products/quantities are authorized for return.

The Return Material Receipt can be:
- Created manually (selecting customer and products directly)
- Created from an approved RMA (auto-populating header and lines from RMA)

When linked to an RMA:
- `M_InOut.M_RMA_ID` points to the RMA header
- `M_InOutLine.M_RMALine_ID` points to individual RMA lines

## How It Differs from Return to Vendor Shipment

| Aspect | Return Material Receipt | Return to Vendor Shipment |
|--------|------------------------|--------------------------|
| IsSOTrx | Y (sales side) | N (purchase side) |
| MovementType | C- (same as Goods Shipment) | V+ (same as Goods Receipt) |
| C_DocType.IsReturn | Y | Y |
| Stock effect | Increases inventory | Decreases inventory |
| Locator meaning | Destination bin (receiving) | Source bin (shipping) |
| Business Partner | Customer (IsCustomer='Y') | Vendor (IsVendor='Y') |
| Typical origin | Customer RMA | Vendor RMA |
| Order reference | Sales Order | Purchase Order |
| Doc Type config key | `doctype.returnMaterialReceipt` | `doctype.returnToVendorShipment` |
| Financial settlement | Credit Memo to Customer | Credit Memo from Vendor |

## How It Differs from Goods Shipment

| Aspect | Return Material Receipt | Goods Shipment |
|--------|------------------------|----------------|
| MovementType | C- (SAME code as Goods Shipment) | C- |
| C_DocType.IsReturn | Y | N |
| Stock effect | Increases inventory | Decreases inventory |
| Direction | Customer -> Warehouse | Warehouse -> Customer |
| Typical trigger | RMA authorization | Sales Order |
| Locator meaning | Destination (where to put returned goods) | Source (where to pick from) |

## Schema Design Decisions

1. **RMA reference (M_RMA_ID):** Made editable and searchable at header level since this is the primary workflow trigger. Optional because manual returns without RMA are possible.

2. **Order reference (C_Order_ID):** Points to a SalesOrder (not PurchaseOrder as in the vendor-side equivalent). Editable at header, optional. May be auto-filled from RMA.

3. **RMA line reference (M_RMALine_ID):** On lines, dependent on the header's RMA selection. Enables traceability to authorized return quantities.

4. **Order line reference (C_OrderLine_ID):** On lines, references SalesOrderLine (not PurchaseOrderLine). Dependent on header's order reference.

5. **MovementQty:** Always positive. The document's `IsSOTrx`/`C_DocType.IsReturn` combination (not a distinct `MovementType` code — see correction above) tells the stock engine to add to the locator's inventory for a customer return.

6. **Locator as destination:** Unlike vendor return (where locator is the source bin), here the locator represents where the returned goods will be stored upon receipt.

7. **No price fields on lines:** Same as all M_InOut windows — shipment/receipt lines do not carry pricing. Financial settlement happens via Credit Memo.

8. **Validate_Locator_Available:** Instead of stock validation (as in vendor returns), we validate locator availability since we are receiving goods into a bin, not taking from one.

## Document Type

In Etendo, the document type for return material receipts is typically named "Customer Return" or "Return Material Receipt" and is configured with:
- `DocBaseType = MMR` (Material Movement Receipt)
- `IsSOTrx = Y`
- `IsReturn = Y` (flag distinguishing return doc types from regular ones)

The exact document type ID depends on the Etendo instance configuration.
