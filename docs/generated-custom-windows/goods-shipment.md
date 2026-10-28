

## Agent prompts on lines — ETP-5852

`entities.lines.agentPrompt` says lots, serial numbers and expiry dates are not handled in Etendo GO (the line's `attributeSetValue` is discarded in the UI too), so agents tell the user instead of looking for a field (M-23). `salesOrderLine.agentPrompt` says the shipment line has no price of its own and points to the order line (M-33).
