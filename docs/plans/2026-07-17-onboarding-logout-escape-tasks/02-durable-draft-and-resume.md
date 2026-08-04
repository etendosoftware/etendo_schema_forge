# Task 02 — Make Drafts Durable and Resumable

## Objective

Replace field-specific autosave detection with generic persistable-step behavior and guarantee a final flush before navigation or logout.

## Repository

`schema_forge_core/packages/etendo-go-core`

## RED

Cover:

- Profile-only edits create a draft.
- Company edits create a draft.
- Default values create no write before interaction.
- Immediate logout before debounce flushes pending data.
- Step transitions flush pending data.
- Re-authentication restores the last step and values.
- Save failures for 401, 409, 429, and 5xx allow logout, emit failure observability, and expose the warning state.

## GREEN

- Declare Profile and Company as `persistable` step definitions.
- Compare serialized persistable data against step defaults and the last saved draft.
- Implement a reusable pending-save flush used by transitions and logout.
- Restore the last persisted step and merged form data.
- Remove the `hasUserContent` field-name check.
- Never delete the saved draft during logout.

## Acceptance criteria

- Meaningful changes are durable regardless of field names.
- Logout never traps the user when persistence fails.
- Resume restores both the step and persisted form data.
- No unnecessary writes occur before interaction.

## Verification

```bash
cd ../schema_forge_core
npm test --workspace=packages/etendo-go-core
```
