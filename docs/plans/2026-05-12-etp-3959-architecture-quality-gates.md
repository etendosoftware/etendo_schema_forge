# ETP-3959 Architecture Review And Quality Gates

ETP-3959 adds validator gates for the agentic correction stack and records the
architecture review notes required before QA.

## Review Notes

- No hardcoded window, process, or menu IDs are introduced by this layer.
- No generated output under `artifacts/*/generated/` is edited by this layer.
- The change is limited to Schema Forge validation and test fixtures.
- No NEO generic services are touched, so no window-specific runtime behavior is
  added to `NeoSelectorService`, `NeoDefaultsService`, `NeoCrudHandler`, or
  `NeoServlet`.
- Per-window runtime behavior remains outside this layer and must use
  `NeoHandler` or another explicit extension point when needed.
- `push-to-neo.js` is not run by this layer, so no Etendo database export is
  required.

## Validator Gates

The validator keeps the existing F12 `window.linesLayout` rule. ETP-3959 adds:

- F13: action metadata must expose at least three edge cases.
- F14: contracts `0.7.0+` must include `formState`.
- F15: contracts `0.7.0+` must include `agentProfile` and the profile must only
  reference generated fields, selectors, and actions.
- F16: generated frontend files must not look manually edited after contract
  generation.

These checks are version-gated where they depend on the agentic contract shape,
so existing older contracts do not fail until regenerated.

## Risks For QA

- F16 uses file modification times as a heuristic, so slow or unusual
  regeneration flows can create false positives.
- F13-F15 validate contract shape and references, not runtime NEO behavior.
- Runtime review still needs to confirm that any per-window behavior lands in
  `NeoHandler` implementations instead of generic NEO services.
