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
| [roles-users-reference.md](roles-users-reference.md) | Roles & Users (ETP-3504): GOClient's 4 new operational `AD_Role` records (fixed IDs), why they're not routed through `cli/src/data-fixes/`, why "Administrator" instead reuses the pre-existing `GOClient Admin` role (resolved via `is_client_admin='Y'`, not a new seeded role), and the edit/delete protection convention |
