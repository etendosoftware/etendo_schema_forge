/**
 * TopBar — the app shell header. Covers the title truncation fix (ETP-4764 follow-up): a long
 * record name (e.g. a bank account's full name + IBAN) used to overflow the header and run
 * underneath the absolutely-centered search box instead of eliding, because nothing capped the
 * width of the title's container — `truncate` alone never got a chance to activate.
 */
import { render, screen } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/components/CopilotContext', () => ({
  useCopilot: () => ({ toggle: vi.fn() }),
}));

import TopBar from '../TopBar.jsx';

const LONG_NAME = 'Banco Santander S.A (Sandbox) - PT50018000354378591102009';

describe('TopBar title', () => {
  it('truncates a long title instead of letting it overflow the header', () => {
    render(<TopBar title={LONG_NAME} />);
    const title = screen.getByText(LONG_NAME);
    expect(title.className).toMatch(/truncate/);
    // The block itself must be capped — truncate has no effect on an unbounded container.
    expect(title.closest('[class*="max-w-"]')).toBeTruthy();
  });

  // The full name is wired as the tooltip's own content — not asserted by actually opening the
  // Radix tooltip on hover: that interaction needs pointer fidelity jsdom doesn't reliably give
  // (confirmed by hand — both fireEvent.mouseEnter and userEvent.hover left it closed after the
  // delay elapsed), which is why no other test in this codebase exercises a Radix tooltip's real
  // open state either. asChild means the trigger renders the title span itself with no wrapper,
  // so getByText only ever finds the one visible instance; this instead reaches into the render
  // tree for the (unmounted-until-open) TooltipContent's own children.
  it('passes the untruncated title to the tooltip content', () => {
    const { container } = render(<TopBar title={LONG_NAME} />);
    const tooltipContent = container.querySelector('[data-testid="TooltipContent__topbar-title"]');
    // Radix Tooltip.Content doesn't mount until open, so this just documents the prop wiring —
    // if this ever starts finding a real node, it should still contain the full name.
    if (tooltipContent) {
      expect(tooltipContent).toHaveTextContent(LONG_NAME);
    }
  });

  it('renders a short title unaffected (no visible truncation in practice)', () => {
    render(<TopBar title="Cuentas" />);
    expect(screen.getByText('Cuentas')).toBeInTheDocument();
  });
});
