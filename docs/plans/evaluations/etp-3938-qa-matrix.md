# ETP-3938 QA Matrix: Agentic Corrections

Maps each original finding from the JuanCarlos.mbox validation reports to its current status.

## QA Matrix

| # | Original Finding | Jira Task | Affected Spec | Status | Generated Metadata | Runtime Expectation | Test Coverage |
|---|-----------------|-----------|---------------|--------|-------------------|---------------------|---------------|
| 1 | `partnerAddress` returns empty without BP context | ETP-3955 | sales-order, purchase-order, sales-invoice, purchase-invoice | **Fixed** | `dependsOn` + `context.required` with `C_BPartner_ID` | Selector accepts `C_BPartner_ID` param | `selectorContext.js` unit tests |
| 2 | `priceList` returns wrong mode (sales vs purchase) | ETP-3955 | All transactional specs | **Fixed** | `context.required` with `isSOTrx` from window category | Selector filters by `isSOTrx=Y/N` | `selectorContext.js` + contract tests |
| 3 | `transactionDocument` hidden but required | ETP-3955 | purchase-order, purchase-invoice | **Fixed** | Classified as `system` with default expectation | `neo_defaults` returns valid doc type | Contract generation tests |
| 4 | Line `tax` returns empty without date/SO context | ETP-3955 | All transactional specs | **Fixed** | `context.required` with `IsSOTrx`, `DateInvoiced` | Selector maps date to `DD-MM-YYYY` | `selectorContext.js` date format tests |
| 5 | Document actions not discoverable | ETP-3956 | All transactional specs | **Fixed** | `apiPrediction.actions[]` with type, params, preconditions | `neo_actions_discover` endpoint | `generate-contract.test.js` action tests |
| 6 | No edge cases documented for processes | ETP-3956 | All specs with actions | **Fixed** | Every action has `edgeCases` array (>= 3) | Runtime returns structured diagnostics | F13 quality gate + 10 contract tests |
| 7 | Agents cannot evaluate form state before write | ETP-3957 | All specs | **Fixed** | `formState` with visible, readOnly, required, calloutTriggers | `neo_form_state` endpoint | 11 formState contract tests |
| 8 | No session context exposed for agents | ETP-3957 | All specs | **Fixed** | `formState.requiredSessionVariables` from `@#VAR@` patterns | `neo_whoami` or session endpoint | `requiredSessionVariables` test |
| 9 | Raw contracts too large for agent planning | ETP-3958 | All specs | **Fixed** | `agentProfile` with purpose, minimumCreate, workflow | Schema discovery includes profile | 11 agentProfile contract tests |
| 10 | No quality gates for generated artifacts | ETP-3959 | All specs | **Fixed** | F13-F16 rules in validate-pipeline.js | N/A (design-time gate) | 5 validator tests |
| 11 | `bp-location` access denied | ETP-3955 | bp-location | **Deferred** | N/A | RBAC/configuration gap | Out of scope |
| 12 | `verifactu-config` entity not found | ETP-3955 | verifactu-config | **Deferred** | N/A | Module not installed | Out of scope |
| 13 | `tbai-facturas-enviadas` entity not found | ETP-3955 | tbai-facturas-enviadas | **Deferred** | N/A | Module not installed | Out of scope |
| 14 | Dashboard widgets not agent-accessible | ETP-3958 | dashboard | **Deferred** | N/A | Widget API not exposed | Follow-up ETP |
| 15 | Report specs not agent-accessible | ETP-3958 | reports | **Deferred** | N/A | Report API not exposed | Follow-up ETP |

## Summary

- **Fixed**: 10 findings (ETP-3955 through ETP-3959)
- **Deferred**: 5 findings (RBAC gaps, missing modules, widget/report APIs)
- **Out of scope**: 0
- **Total test coverage**: 42 new tests across generate-contract, validate-pipeline, and selectorContext

## Edge Cases per Process-Heavy Flow

### Sales Order
1. Business partner has no active address
2. Document type not valid for selected organization
3. Product inactive in selected price list

### Purchase Order
1. Vendor has no vendor role in current client
2. Price list missing for purchase mode
3. Document already completed (action blocked)

### Sales Invoice
1. Invoice created without lines (blocked)
2. Payment method not configured for BP
3. Tax date outside valid range

### Goods Receipt
1. Shipment has no pending lines
2. Warehouse not accessible for current org
3. Partner address missing for vendor

## Behavioral Test Commands

```bash
# Full CLI test suite
make test

# Contract generation tests (actions, formState, agentProfile)
cd cli && node --test test/generate-contract.test.js

# Pipeline validation tests (quality gates F13-F16)
cd cli && node --test test/validate-pipeline.test.js

# Selector context builder tests
node --test tools/app-shell/src/lib/__tests__/selectorContext.vitest.js
```
