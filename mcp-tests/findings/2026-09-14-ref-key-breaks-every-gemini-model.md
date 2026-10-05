# The `$ref` key in list/get rows makes the MCP unusable with every Gemini model

**Date:** 2026-09-14
**Run:** `20260914T1811-local-71aa`, probe `how-do-i-find-a-customer` (suite `discoverability`)
**Target:** local — `http://localhost:3100/mcp`
**Model:** `gemini/gemini-3.8-flash` via `https://llm.etendo.software/v1`
**Spec/entity:** any — reproduced on `contacts` / `businessPartner`

## What happened

The probe died mid-loop, not with a wrong answer but with an HTTP 400 from the model provider:

```
The referenced name `BusinessPartner/BC8DDDF69DDA49E9938729F19B0F330E` in
function_response.response does not match to a display_name in the function_response.parts
```

The id in the message is "Blanquiceleste S.A.". It reaches the model because every row the MCP
returns carries Etendo's OBRest reference key. Verbatim, from `neo_list` on `contacts`:

```json
{
  "_identifier": "Blanquiceleste S.A.",
  "_entityName": "BusinessPartner",
  "$ref": "BusinessPartner/BC8DDDF69DDA49E9938729F19B0F330E",
  "id": "BC8DDDF69DDA49E9938729F19B0F330E",
  "name": "Blanquiceleste S.A.",
  ...
}
```

`$ref` is a **reserved key inside Gemini's `function_response.response`**: it declares a pointer to
an attached part, to be resolved against `function_response.parts`. Gemini tries to resolve it,
finds no such part, and rejects the whole request.

## Isolating the trigger

Five hand-built tool results were sent directly to the gateway, same model, varying only the shape
of one row. Actual output:

```
OK        | A control (no $ anywhere)  | answered normally
FAIL 400  | B $ref (today)             | display_name/function_response error
OK        | C _ref (proposed)          | answered normally
OK        | D $ inside key             | answered normally
FAIL 400  | E $ref, non-ref value      | display_name/function_response error
```

Two conclusions:

- The trigger is the **literal key name `$ref`**, not its value. Variant E carries the string
  `"hello world"` under that key and still fails.
- Keys that merely *contain* `$` are safe. Variant D used `category$_identifier`; the real rows are
  full of `xxx$_identifier` keys and none of them is implicated. The blast radius is one key.

## Why it matters

This is not a degraded experience, it is a total one: the failure is on the tool RESULT, so it fires
the first time an agent reads any record, and no prompt, retry or fallback can route around it. An
entire model vendor cannot use the Etendo GO MCP server today.

The cost side is one-directional too. `$ref` is exactly `_entityName` + `"/"` + `id`, and both are
already on the same row — it carries no information the agent does not already have, and it is paid
for on every row of every list response.

## The UI test (D22)

**Passes.** The probe asked how to find a customer — a person does that in the Etendo GO UI every
day. The task is legitimate and the MCP failed it.

Note the failure is not in Etendo's *semantics*: the answer the MCP composed was fine. It is an
interoperability defect in the response *encoding*.

## Not verified

- Whether other Gemini-family surfaces (Vertex AI direct, rather than through this LiteLLM gateway)
  reject the same key. `vertex_ai/*` routes on this gateway are blocked by an unrelated
  project-level `BILLING_DISABLED`, so they could not be used as a second opinion.
- Whether any current MCP consumer reads `$ref`. Removing it is proposed on the grounds that it is
  redundant, but no survey of consumers was done.
- Whether the MCP and the NEO REST API share the serialiser that injects the key. If they do, the
  REST contract must stay untouched — it has other consumers, the React SPA among them.
- Whether other providers (OpenAI, Anthropic) treat `$ref` as reserved. Only Gemini was observed to,
  and `openai/gpt-5.2` runs the same suites without complaint.

## Agreed fix

Three parts, agreed with the user on 2026-09-14, all of which must land together:

1. Stop emitting `$ref` on the **MCP surface only**.
2. Declare the construction rule once — a reference is `<entityName>/<id>`, and both halves are on
   every row — in **both** `neo_schema` and the `docs` tool. A constant belongs in the place the
   agent learns shapes, not repeated on every row.
3. A regression test asserting no `$ref` survives anywhere in an MCP tool response, nested rows
   included.

## A harness gap this exposed

The run files could not establish any of the above: `20260914T1811-local-71aa` recorded
`toolCalls: None` for this probe. Two causes, both being fixed — tool RESULTS were never recorded at
all, and a provider exception mid-loop discarded the transcript instead of saving what it had. Every
fact in this file had to be reproduced by hand against the live server.
