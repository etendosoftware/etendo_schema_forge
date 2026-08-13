# ETP-3956 Action Metadata

## Purpose

ETP-3956 makes generated contracts expose document and process actions in an
agent-readable shape. The goal is to let MCP and NEO clients discover which
record actions exist, where to call them, which payload fields are expected, and
which preconditions or side effects an agent must consider before execution.

## Jira Scope Mapping

The Jira task asks for actions such as `documentAction`, `processNow`,
`createLinesFrom`, `createLinesFromOrder`, `createLinesFromShipment`,
`receiveMaterials`, `sendMaterials`, `invoicefromshipment`,
`aPRMProcessPayment`, and `aprmExecutepayment` to become discoverable and
operable by agents.

This Schema Forge phase covers the contract discovery part:

- classify button fields into `documentAction`, `paymentAction`, `createFrom`,
  or `utilityAction`;
- expose stable action metadata in `apiPrediction.actions`;
- include the record-scoped POST endpoint, payload parameters, preconditions,
  effects, dry-run support, edge cases, and provenance;
- allow curated overrides through `window.actions` in `decisions.json` when
  extracted metadata is not specific enough.

Runtime validation and execution remain owned by NEO Headless in
`com.etendoerp.go`. A Schema Forge contract can describe an action endpoint, but
it must not emulate runtime permission checks, process execution, or
window-specific action behavior.

## Generated Action Shape

Each generated action entry uses this shape:

```json
{
  "name": "documentAction",
  "label": "Document Action",
  "actionType": "documentAction",
  "entity": "header",
  "column": "DocAction",
  "requiresRecord": true,
  "endpoint": "/sws/neo/sales-order/header/{id}/action/documentAction",
  "method": "POST",
  "url": "/sws/neo/sales-order/header/{id}/action/documentAction",
  "parameters": [
    {
      "name": "docAction",
      "type": "string",
      "required": true,
      "description": "Document action code (e.g. CO=Complete, VO=Void, RE=Reactivate)"
    }
  ],
  "preconditions": [
    {
      "field": "documentStatus",
      "operator": "in",
      "values": ["DR", "IP"],
      "description": "Document must be in draft or in-progress state"
    }
  ],
  "effects": [
    "Updates document status",
    "May trigger workflow transitions"
  ],
  "dryRunSupported": true,
  "edgeCases": [
    "Document is already completed or closed",
    "Document has pending lines or missing required fields",
    "User lacks permission to execute the action"
  ],
  "provenance": "extracted"
}
```

`url` is kept as a backwards-compatible alias for existing consumers; new agent
clients should prefer `endpoint` plus `method`.

## Current Limits

- Generated metadata is inferred from button field names and columns unless a
  curated override exists.
- Document action values such as `CO`, `RE`, or `VO` should be curated when the
  extractor cannot prove the valid set.
- The contract does not prove that an action is executable for a specific user
  or record state. Runtime tools must return structured `available`, `blocked`,
  `unsupported`, or `forbidden` diagnostics.
- Real artifact contracts must be regenerated before the new action shape is
  visible in versioned `artifacts/*/contract.json` files.

## Validation

Generator coverage lives in `cli/test/generate-contract.test.js` and checks:

- document lifecycle, payment, create-from, and utility classification;
- required record-scoped action metadata;
- explicit POST endpoint metadata;
- `docAction` payload metadata for document actions;
- at least three edge cases per generated action;
- curated overrides from `window.actions`;
- action test-manifest entries using the action name.
