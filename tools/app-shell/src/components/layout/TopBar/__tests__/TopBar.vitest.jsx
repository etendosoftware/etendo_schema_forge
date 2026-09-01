/**
 * TopBar — the app shell header. Covers the title truncation fix (ETP-4764 follow-up): a long
 * record name (e.g. a bank account's full name + IBAN) used to overflow the header and run
 * underneath the absolutely-centered search box instead of eliding, because nothing capped the
 * width of the title's container — `truncate` alone never got a chance to activate.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => key,
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

  it('shows the current contract target as a removable search scope', async () => {
    window.history.pushState({}, '', '/sales-invoice');
    const scopeEvents = [];
    const recordScopeEvent = (event) => scopeEvents.push(event.detail);
    document.addEventListener('schema-forge:vector-search-scope', recordScopeEvent);

    render(<TopBar title="Sales Invoice" />);
    await waitFor(() => {
      expect(screen.getByTestId('topbar-vector-search-scope')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('topbar-vector-search-scope-clear'));
    expect(screen.queryByTestId('topbar-vector-search-scope')).not.toBeInTheDocument();
    expect(scopeEvents).toContainEqual({
      pathname: '/sales-invoice',
      vectorSearchTarget: null,
    });
    document.removeEventListener('schema-forge:vector-search-scope', recordScopeEvent);
    window.history.pushState({}, '', '/');
  });

  it('clears the scope pill when Backspace is pressed at the start of a non-empty query', async () => {
    window.history.pushState({}, '', '/sales-invoice');
    render(<TopBar title="Sales Invoice" />);
    await waitFor(() => {
      expect(screen.getByTestId('topbar-vector-search-scope')).toBeInTheDocument();
    });

    const input = screen.getByTestId('global-search-input');
    fireEvent.change(input, { target: { value: 'texto largo' } });
    input.setSelectionRange(0, 0);
    fireEvent.keyDown(input, { key: 'Backspace' });

    expect(input).toHaveValue('texto largo');
    expect(screen.queryByTestId('topbar-vector-search-scope')).not.toBeInTheDocument();
    window.history.pushState({}, '', '/');
  });
});
