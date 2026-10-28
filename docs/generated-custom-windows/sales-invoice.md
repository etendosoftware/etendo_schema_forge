

## Agent prompts on dates, line tax and installments — ETP-5852

`invoiceDate`/`accountingDate` explain the server proposes today and the user's own date must be sent (M-31); `lines.tax` says the server resolves the tax from product and customer tax categories, Recargo de Equivalencia included, and points to `etendo_selectors` for the line's options instead of the tax catalogue (M-35, M-79). `paymentPlan` allows `etendo_list(allParents:true)` (MCP_CONFIG.parent.allParents) to find installments by `dueDate`/`daysOverdue` across invoices (M-50).
