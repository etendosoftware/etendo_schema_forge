# Etendo Application Dictionary — Reference

Findings and clarifications about the Etendo AD structure, discovered during Schema Forge extraction work. These are general to Etendo (not specific to any window).

## Documents

| File | Topic |
|------|-------|
| [schema-mappings.md](schema-mappings.md) | How AD tables actually map (callouts, processes, logic columns) — corrections to initial TDD assumptions |
| [process-mechanisms.md](process-mechanisms.md) | The 3 process mechanisms in Etendo: tab_process, classic_process, obuiapp_process (+ hardcoded) |
| [display-logic-variables.md](display-logic-variables.md) | The 6 types of variables in DisplayLogic expressions: field columns, auxiliary inputs, session, preferences, acct dimensions, special |
| [openapi-module.md](openapi-module.md) | `com.etendoerp.openapi` module: CDI plugin architecture, OpenAPIEndpoint interface, flow system (DB tables), SWS integration |
| [fic-default-values.md](fic-default-values.md) | How `FormInitializationComponent` assigns default values on `MODE=NEW` by reference type: combos preselect row [0], search/selector/tree do not |
| [onboarding-gaps.md](onboarding-gaps.md) | Tenant onboarding gaps (A1…H1) found when creating a new client: symptom, root cause, verified idempotent SQL, where each should be fixed in the onboarding flow |
| [onboarding-and-datafixes-map.md](onboarding-and-datafixes-map.md) | Path-first map for tenant remediation: the live onboarding service chain, the data-fixes framework (`cli/src/data-fixes/`), and the preventive/corrective pairing per gap |
| [tenant-remediation-knowledge.md](tenant-remediation-knowledge.md) | Living knowledge base for tenant remediation — table/column quirks, corrected misinterpretations, confirmed DB facts, per-fix known limitations |
| [reconciliation-line-classification.md](reconciliation-line-classification.md) | How a pending statement line lands in each Conciliación filter, the standard matching algorithm's `matchreference` / `matchtransactiondate` / `matchbpname` flags, and why **Diferencias** (an *approximate* match, not an amount mismatch) is unreachable in the current configuration |
| [role-inheritance-window-access-overlap-core-proposal.md](role-inheritance-window-access-overlap-core-proposal.md) | Discussion doc: how to fix cross-template `AD_Window_Access` overlap corruption AT THE CORE level (`WindowAccessInjector`/`RoleInheritanceManager`) instead of the module-level workaround Schema Forge uses today — 3 tiers (ownership fix, most-permissive-wins on add, most-permissive-wins on remove), with exact file/line citations |
