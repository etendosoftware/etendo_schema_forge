# Semantic theme usage

The application consumes its visual roles from `@schema-forge/app-shell-core`.
Feature code must express intent instead of selecting a palette value, so the
active theme remains the source of truth for both light and dark appearances.

Use the structural roles `background`, `foreground`, `card`, `muted`,
`border-subtle`, `border-control`, `focus-ring`, and `text-disabled` for
layout and controls. Use `primary` only for product emphasis. For business
states use `status-success`, `status-warning`, `status-info`,
`status-neutral`, or `destructive`; their background, foreground and border
variants are available as Tailwind utilities and CSS custom properties.

Do not add hexadecimal, RGB, or numeric-HSL palette literals; named palette
utilities (including `white` and `black`); or palette-specific Tailwind
utilities to application UI. The only exceptions are intentionally data-encoded
visuals (deterministic avatars and category identities), externally branded
assets, and print/PDF output, where a theme role would change the data or the
document contract.

`semanticThemeUsage.test.js` enforces this rule for application source, the
live `artifacts/*/custom` components resolved by the `@generated` alias, and
generated frontend output (excluding mock payloads). Its explicit exception
list is limited to category identities, developer debug panels, and print/PDF
contracts. Narrow data palettes are allowed only as named literals, so the
rest of the same component remains protected. Adding an exception requires
documenting why a semantic role would alter the represented data or document.

The guard names every allowed exception with its rationale: event, product,
warehouse, application-section, or product-avatar identity; developer
diagnostic palettes; and print/PDF contracts. It deliberately does not exempt
ordinary screens, controls, overlays, charts, or status feedback.

For inline styles, use the semantic CSS custom properties, for example
`var(--status-success-bg)` or `hsl(var(--foreground))`. For class names, use
the matching semantic Tailwind utilities, for example
`bg-status-success text-status-success-foreground`.
