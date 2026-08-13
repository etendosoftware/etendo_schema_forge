# ETP-3957 Form State Metadata

## Purpose

ETP-3957 adds a `formState` section to generated contracts so MCP and NEO
agents can inspect field-level form fidelity before creating or updating
records. The metadata describes whether each exposed field is visible,
read-only, required, controlled by display or read-only logic, affected by
callouts, or dependent on session context.

## Jira Scope Mapping

The Jira task asks agents to understand the same form constraints used by the
SPA: visible fields, required fields, writable fields, callout dependencies, and
session context. This Schema Forge phase covers the contract declaration layer:

- expose per-entity field state under `formState.entities`;
- preserve extracted `displayLogic` and `readOnlyLogic` expressions;
- list callout trigger classes found in business rules;
- expose default values when the schema contains them;
- extract `@#VAR@` references into `requiredSessionVariables`.

Runtime evaluation remains owned by NEO Headless in `com.etendoerp.go`.
Schema Forge declares the expressions and dependencies; it does not decide the
current runtime result for a specific user, role, organization, or record.

## Generated Shape

Each generated contract now includes:

```json
{
  "formState": {
    "entities": {
      "header": {
        "fields": {
          "businessPartner": {
            "visible": true,
            "readOnly": false,
            "required": true,
            "displayLogic": null,
            "readOnlyLogic": null,
            "calloutTriggers": ["BPartnerCallout"],
            "defaultValue": null,
            "provenance": "extracted"
          }
        }
      }
    },
    "requiredSessionVariables": ["#AD_Client_ID", "#AD_Org_ID"],
    "evaluationMode": "runtime"
  }
}
```

System and discarded fields are excluded. Hidden but relevant fields may still
be represented with `visible: false` when they are not classified as system or
discarded.

## Validation

Generator coverage lives in `cli/test/generate-contract.test.js` and checks:

- the `formState` section is always emitted;
- editable and read-only fields are classified correctly;
- system and discarded fields are excluded;
- callout triggers are collected from rules;
- display and read-only expressions are preserved;
- default values are exposed when present;
- session variables are extracted from both field metadata and rule
  expressions;
- empty schemas produce an empty but stable `formState`.
