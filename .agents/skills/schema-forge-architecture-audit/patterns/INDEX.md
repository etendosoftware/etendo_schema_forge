# Patterns catalog

Each pattern is a named refactor we have applied or expect to apply often. Adding a new pattern requires at least one case file in `../cases/` validating it works.

| Pattern | When | Cases |
|---|---|---|
| [extract-card-shell.md](extract-card-shell.md) | N≥2 components share an identical outer wrapper + header bar | [2026-05-13-dashboard-cards.md](../cases/2026-05-13-dashboard-cards.md) |
| [extract-empty-state.md](extract-empty-state.md) | N≥2 components render the same "no data" layout (title + subtitle + optional CTAs) | [2026-05-13-dashboard-cards.md](../cases/2026-05-13-dashboard-cards.md) |
| [extract-leaf-icon-slot.md](extract-leaf-icon-slot.md) | An identical small leaf (icon + fixed-size wrapper) repeats in multiple list rows | [2026-05-13-dashboard-cards.md](../cases/2026-05-13-dashboard-cards.md) |
