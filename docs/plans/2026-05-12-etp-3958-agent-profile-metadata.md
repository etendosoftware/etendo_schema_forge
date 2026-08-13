# ETP-3958 Agent Profile Metadata

ETP-3958 adds an `agentProfile` section to generated contracts. The profile is
intended for MCP agents and other runtime consumers that need concise guidance
about how a generated spec should be used.

## Contract Shape

The generated profile contains:

- `purpose`: short human-readable summary derived from window name and category.
- `whenToUse`: short usage hints for the spec.
- `minimumCreate`: required editable fields grouped by header and line entities.
- `selectorContexts`: selectors that require runtime context, including the
  required and optional context parameters exposed by `apiPrediction`.
- `actions`: generated document or create-from action names.
- `workflow`: transactional workflow hints. Master-data and configuration specs
  stay empty unless generated metadata proves a workflow exists.
- `edgeCases`: generated action and form-state caveats. Transactional specs with
  lifecycle actions must expose at least three useful edge cases.
- `examples`: minimal generated operation examples for create header, create
  line, and lifecycle completion when those operations are supported.
- `warnings`: read-only, system-action, or missing-lifecycle warnings derived
  from generated form and action metadata.
- `knownLimitations`: reserved for curated overrides.
- `dangerousOperations`: destructive lifecycle actions inferred from generated
  action names.

## Source Of Truth

The profile is generated from `schema`, `apiPrediction`, and `formState` in
`cli/src/generate-contract.js`. Do not edit generated contracts manually. To
change profile output, update extractor inputs, decisions, or the profile
generator.

## Jira Mapping

The profile satisfies the ETP-3958 acceptance criteria as follows:

- Stable metadata schema: `agentProfile` is always present in generated
  contracts.
- Priority document specs: transactional categories generate workflow, examples,
  lifecycle actions, and at least three edge cases when actions exist.
- No generated-output edits: profile generation happens in
  `generate-contract.js`.
- Simple master data: non-transactional specs do not receive workflow or generic
  edge-case boilerplate.
- Documentation: this file explains the shape and update path.

## Validation

Focused tests live in `cli/test/generate-contract.test.js` under
`generateContract - agentProfile (ETP-3958)`.
