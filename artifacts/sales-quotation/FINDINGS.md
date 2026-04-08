# Sales Quotation vs Sales Order - AD Findings

## Same Underlying Tables

Both Sales Quotation and Sales Order use the same tables:
- **Header:** `C_Order` (with `IsSOTrx = 'Y'`)
- **Lines:** `C_OrderLine`

The distinction is made at the **Document Type** level, not the table level.

## How Etendo Distinguishes Quotations from Orders

1. **C_DocType.DocSubTypeSO = 'ON'** (Quotation) vs other values for standard orders.
2. The **window-level filter** (tabWhereClause) restricts visible records:
   ```sql
   C_Order.C_DocTypeTarget_ID IN (
     SELECT C_DocType_ID FROM C_DocType WHERE DocSubTypeSO = 'ON'
   )
   ```
3. The Sales Order window uses a complementary filter excluding quotation doc types.

## Key Schema Differences

| Aspect | Sales Order | Sales Quotation |
|--------|------------|-----------------|
| Window ID | 143 | 181 |
| Primary entity name | `order` | `quotation` |
| Child entity name | `orderLine` | `quotationLine` |
| Doc type derivation | `doctype.salesOrder` | `doctype.salesQuotation` |
| `DatePromised` usage | Promised delivery date | **Valid until** (quote expiry) |
| `warehouse` on header | Editable (required for shipping) | Omitted (not relevant pre-sale) |
| `deliveryLocation` | Editable | Omitted |
| `isDelivered` | ReadOnly indicator | Omitted |
| `deliveredQty` on lines | ReadOnly | Omitted |

## Quotation-Specific Behaviors

1. **ValidUntil defaulting:** When creating a new quotation, `DatePromised` (exposed as `validUntil`) defaults to `DateOrdered + 30 days`.
2. **Convert to Order process:** Quotations can be converted to Sales Orders via a dedicated process that:
   - Creates a new `C_Order` record with standard sales order doc type
   - Copies all lines from the quotation
   - Links the new order back to the originating quotation
3. **No delivery tracking:** Since quotations are pre-sale documents, delivery-related fields (`IsDelivered`, `QtyDelivered`, `DeliveryLocation`) are not exposed.

## Field Curation Decisions (UX Simplification)

Based on competitor analysis (Salesforce CPQ, HubSpot, Odoo, SAP B1) and sales-user workflow,
the header was trimmed from 15 to 9 visible fields:

| Field | Decision | Reason |
|-------|----------|--------|
| `summedLineAmount` | discarded | Redundant — grand total is sufficient |
| `currency` | discarded | Derived from price list, not a standalone input |
| `paymentMethod` | discarded | Rarely changed per-quote; comes from partner defaults |
| `salesRepresentative` | discarded | Auto-assigned from logged-in user |
| `orderReference` | discarded | Secondary free-text; not core to the quoting flow |
| `invoiceAddress` | discarded | Not relevant at quotation stage; resolved at invoicing |

**Retained header fields (9):** `documentNo`, `businessPartner`, `partnerAddress`,
`orderDate`, `validUntil`, `priceList`, `paymentTerms`, `grandTotalAmount`, `documentStatus`.

**Description** kept in section `other` as optional notes field.

## Fields Shared (Identical Behavior)

All business partner, pricing, payment, and line-level fields behave identically:
- BP auto-fill callout
- Product price/tax/UOM auto-fill
- Line net amount recalculation
- Header total recalculation
- Read-only lock on processed documents

## Document Number Sequence

Quotations use a separate document number sequence (typically prefixed `QUO-` or similar) configured in the `C_DocType` record for the quotation type.
