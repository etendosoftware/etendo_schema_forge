# Pattern: extract-leaf-icon-slot

## When to apply

A tiny presentational leaf (e.g. an icon inside a fixed-size flex wrapper) repeats verbatim in multiple list-row components. Each occurrence is ~10–15 lines of style attributes.

## Anti-pattern

```jsx
<div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', padding: '0px 4px 0px 0px', width: '28px', height: '24px', flexShrink: 0 }}>
  <ChevronRight style={{ width: '16px', height: '16px', color: '#828FA3' }} />
</div>
```

Three components inline this; if the chevron size or color ever needs to change, three edits are required.

## Refactored

```jsx
// _shared/RowChevron.jsx
export function RowChevron() {
  return (
    <div style={WRAPPER_STYLE}>
      <ChevronRight style={ICON_STYLE} />
    </div>
  );
}

// consumers
<RowChevron />
```

## Prop API rules

- Start with **zero props**. Add props only when a real second-use case demands variation, not speculatively.
- If two callers need different colors, add `color` prop. Don't add `size`, `direction`, `iconName` upfront.

## Anti-features to reject

- "Generic" `<IconBox>` accepting any `lucide-react` icon. That's a different abstraction — keep this one narrow.
- Passing style overrides via prop. Edit the constant in the shared file if the design changes.

## Validation

1. Render test: one icon present, wrapper has the expected width.
2. Visual diff: lists look identical.
