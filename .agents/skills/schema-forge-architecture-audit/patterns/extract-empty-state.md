# Pattern: extract-empty-state

## When to apply

Two or more components show the same "no data" layout: centered title (20px/600), centered subtitle (12px/400), optional row of action buttons (CTA). Variations may include: no buttons, different text padding, different container width.

## Anti-pattern

Each component inlines the full empty layout JSX, including button styling, ~30 lines per occurrence.

## Refactored

```jsx
<EmptyState
  title={ui('cardEmptyTitle')}
  subtitle={ui('cardEmptySubtitle')}
  width="340px"
  actions={[
    { key: 'copilot', icon: Sparkles, label: ui('createWithCopilot'), onClick: openCopilot, variant: 'secondary' },
    { key: 'new', icon: Plus, label: ui('newSale'), onClick: () => navigate('/sales-invoice/new'), variant: 'primary' },
  ]}
/>
```

## Prop API rules

- **`title`** required — pre-resolved string.
- **`subtitle`** required.
- **`actions`** optional array of `{ key, icon, label, onClick, variant }`. `variant` is `'primary' | 'secondary'`. When empty/omitted, the action row is not rendered.
- **`width`** optional fixed inner width (e.g. `'340px'`). Omit for fluid.
- **`textPadding`** optional CSS padding string for the text block (e.g. `'0px 20px'`). Use only if the original had non-default padding.

## Anti-features to reject

- Don't add a `description` slot for arbitrary children inside the text block. If the text needs more, it's not the same empty state — make a new variant or a custom component.
- Don't accept React nodes for `label` — only strings. Otherwise i18n becomes inconsistent.
- Don't expose button-level style overrides. If a variant doesn't exist, **add a named variant** to the component.

## Validation

1. Tests for each consumer (covering title/subtitle text + action click behavior) remain green.
2. New tests for the shared empty state: text rendering, no-actions case, action click forwarding, variant styling distinction.
3. Verify `useCopilot()` and `useNavigate()` callers still wire correctly through `onClick`.
