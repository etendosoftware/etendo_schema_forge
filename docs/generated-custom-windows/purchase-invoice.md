

## Agent prompts on dates, line tax and installments — ETP-5852

`invoiceDate` (the supplier document's date) and `accountingDate` (M-31); `lines.tax` resolved from product and supplier tax categories, options through `etendo_selectors` (M-35); `paymentPlan` allows `etendo_list(allParents:true)` to find installments by due date across invoices (M-50). Over MCP a line price sent alone on update is the line's Precio and the net follows the discount, as on create (M-103).
