# Pattern: extract-card-shell

## When to apply

Two or more components render the same outer container (border, radius, background, height) AND the same header strip (title in a colored bar). The container differs only in body content.

## Anti-pattern

```jsx
// CardA.jsx
<div className="overflow-hidden bg-white" style={SHELL_STYLES}>
  <div style={HEADER_STYLES}>
    <span style={TITLE_STYLES}>{ui('cardATitle')}</span>
  </div>
  {bodyA}
</div>

// CardB.jsx — same shell, same header, different body
<div className="overflow-hidden bg-white" style={SHELL_STYLES}>
  <div style={HEADER_STYLES}>
    <span style={TITLE_STYLES}>{ui('cardBTitle')}</span>
  </div>
  {bodyB}
</div>
```

## Refactored

```jsx
// _shared/CardShell.jsx
export function CardShell({ title, headerExtra = null, children, testId }) {
  return (
    <div className="overflow-hidden bg-white" style={SHELL_STYLE} data-testid={testId}>
      <div style={HEADER_BAR_STYLE}>
        <div style={TITLE_WRAPPER_STYLE}>
          <span style={TITLE_TEXT_STYLE}>{title}</span>
        </div>
        {headerExtra}
      </div>
      {children}
    </div>
  );
}

// CardA.jsx
<CardShell title={ui('cardATitle')}>{bodyA}</CardShell>
// CardB.jsx
<CardShell title={ui('cardBTitle')}>{bodyB}</CardShell>
```

## Prop API rules

- **`title`** required — pre-resolved string (i18n is the caller's job).
- **`headerExtra`** optional node slot. Default `null`. Use for things like a toggle button placed at the right of the header bar.
- **`children`** the body. The shell sets `flex-direction: column` so children stack naturally.
- **`testId`** optional `data-testid`. Helps integration tests scope queries.

## Anti-features to reject

- Do not add `headerStyle` / `titleStyle` overrides. If two cards genuinely need different headers, that means **they are not the same shell** — keep them separate.
- Do not bake i18n keys into the shell. The shell takes resolved strings.

## Validation

1. Existing tests of each consumer must remain green.
2. New tests for the shell: renders title, renders children, renders headerExtra when given.
3. Visual diff: open the dashboard, confirm pixel parity.
