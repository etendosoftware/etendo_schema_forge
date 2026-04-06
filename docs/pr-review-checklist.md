# PR Review Checklist — Schema Forge

## Before flagging a generated file change as "manual edit"

Generated files live in `artifacts/*/generated/`. Changes there are **expected pipeline output**.
Before raising a regeneration concern, verify:

1. **Does the generator emit this?**
   - Check `cli/src/generate-frontend.js` for the relevant prop/import
   - Check if `decisions.json` declares the config that drives it
   - Check if `resolve-curated.js` forwards that config to the in-memory schema
   - Check if `generate-contract.js` includes it in the contract

2. **Is it inside a `@sf-custom-start/end` block?** → preserved, intentional
3. **Is it inside a `@sf-generated-start/end` block?** → emitted by generator, verify step 1
4. **Is it outside all markers?** → could be manual; verify step 1 for imports section

## Regeneration concern is valid only if:
- The change is NOT emitted by the generator from config
- AND there is no `@sf-custom-start/end` wrapping it
- AND there is no corresponding `decisions.json` + pipeline support

## Common false positives:
- New props added to the Page component (`formFooter`, `primaryTabs`, `newRecordComponent`, etc.) → check if generator was updated in the same PR
- New imports at top of Page component → check `customComponents` in decisions + generator
- Removed `detailEntity` / secondary tabs → check `decisions.json` for `detailEntity: null`
