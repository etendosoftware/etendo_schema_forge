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

Do not add hexadecimal, RGB, HSL palette literals, or palette-specific
Tailwind utilities to application UI. The only exceptions are intentionally
data-encoded visuals (charts and deterministic avatars), externally branded
assets, and print/PDF output, where a theme role would change the data or the
document contract.

For inline styles, use the semantic CSS custom properties, for example
`var(--status-success-bg)` or `hsl(var(--foreground))`. For class names, use
the matching semantic Tailwind utilities, for example
`bg-status-success text-status-success-foreground`.
