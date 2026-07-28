# ETP-4584 Implementation Tasks

Source plan: [`../2026-07-17-onboarding-logout-escape-plan.md`](../2026-07-17-onboarding-logout-escape-plan.md)

## Execution order

| Order | Task | Repository | Depends on | Status |
|---|---|---|---|---|
| 0 | [Prepare branches and baseline](00-prepare-branches-and-baseline.md) | Both | None | Completed |
| 1 | [Centralize onboarding logout](01-centralize-onboarding-logout.md) | `schema_forge_core` | 0 | Completed |
| 2 | [Make drafts durable and resumable](02-durable-draft-and-resume.md) | `schema_forge_core` | 1 | Completed |
| 3 | [Add authenticated session actions](03-authenticated-session-actions.md) | Both | 1, 2 | Completed |
| 4 | [Build generic `LogoutRoute`](04-generic-logout-route.md) | `schema_forge_core` | 1 | Completed |
| 5 | [Register and integrate `/logout`](05-consumer-logout-route.md) | `schema-forge` | 4 | Completed |
| 6 | [Migrate consumer onboarding authority](06-consumer-onboarding-cleanup.md) | Both | 2, 3 | Completed |
| 7 | [Add browser journeys](07-browser-logout-resume.md) | `schema-forge` | 3, 5, 6 | Completed |
| 8 | [Run delivery and compatibility gates](08-delivery-and-compatibility-gates.md) | Both | 1–7 | In progress |

Tasks 1–6 are developed and tested without publishing Core. Schema Forge resolves the sibling Core source with `LOCAL_CORE=1`, and browser testing is served with `make dev-local-core`. Preview publication happens only in Task 8.

Each functional cycle follows RED → GREEN → REFACTOR and preserves an initial failing-test commit. All repository content and commit messages remain in English.
