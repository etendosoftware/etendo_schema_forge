// Regression test for the collapsed-sidebar "silent tooltip" bug: 4 collapsed menu icons
// (Home, First Steps, Connect AI agent, and any module reduced to a single visible item by
// role filtering — e.g. Contacts) render through SideMenu's `<TooltipTrigger asChild>
// <GuardedNavLink>` path. Radix's `asChild` clones GuardedNavLink and attaches a DOM ref to
// compute where to anchor the floating tooltip content. Before this fix, GuardedNavLink was a
// plain function component (no `forwardRef`), so React dropped that ref silently — the tooltip
// technically opened but had no anchor to position against, so it never became visible.
// See GuardedNavLink.jsx for the full explanation.

import { createRef } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { GuardedNavLink } from '../GuardedNavLink.jsx';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip.jsx';

describe('GuardedNavLink ref forwarding', () => {
  it('forwards a ref to the underlying anchor DOM node (real react-router-dom NavLink)', () => {
    const ref = createRef();
    render(
      <MemoryRouter>
        <GuardedNavLink ref={ref} to="/dashboard" data-testid="link">Home</GuardedNavLink>
      </MemoryRouter>,
    );
    expect(ref.current).toBeInstanceOf(HTMLAnchorElement);
  });

  it('lets a Radix Tooltip asChild trigger anchor its floating content on a collapsed icon link', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <TooltipProvider>
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <GuardedNavLink to="/dashboard" data-testid="collapsed-home-icon">H</GuardedNavLink>
            </TooltipTrigger>
            <TooltipContent side="right">Home</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </MemoryRouter>,
    );

    await user.hover(screen.getByTestId('collapsed-home-icon'));
    // This is an integration-style check that the full Tooltip + TooltipTrigger asChild +
    // GuardedNavLink composition renders without crashing and shows the expected content in
    // jsdom. It does NOT reproduce the original silent-failure symptom: jsdom does not model
    // Radix Popper's real anchoring/positioning, so this assertion passes identically with or
    // without `forwardRef` (verified empirically by temporarily reverting the forwardRef wrap).
    // The test above is the actual regression guard for the ref-forwarding bug.
    expect(await screen.findByText('Home')).toBeInTheDocument();
  });
});
