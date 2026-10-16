// @covers tools/app-shell/src/windows/custom/shared/BadgeAmount.jsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import BadgeAmount from '../BadgeAmount.jsx';

describe('BadgeAmount', () => {
  // ETP-5729 CP-14 — the "A favor" chip clipped "1.452,00 €" to "1.452,0…" because the amount sat
  // in a fixed 72px box. jsdom has no layout, so the guard is on the width contract itself: the
  // amount is content-sized (no fixed or full width) and capped by a max width.
  it('renders the full amount in a content-sized box capped by a max width, not a fixed one', () => {
    render(<BadgeAmount text="1.452,00 €" className="font-semibold" data-testid="amount" />);
    const el = screen.getByTestId('amount');
    expect(el).toHaveTextContent('1.452,00 €');
    const classes = el.className.split(/\s+/);
    expect(classes).toContain('w-auto');
    expect(classes.some((c) => c.startsWith('max-w-'))).toBe(true);
    expect(classes).not.toContain('w-full');
    expect(classes.some((c) => /^w-\[\d+px\]$/.test(c))).toBe(false);
    expect(classes).toContain('font-semibold');
  });
});
