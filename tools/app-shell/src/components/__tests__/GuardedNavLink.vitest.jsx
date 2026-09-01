// ETP-5073 / DOC-08 — the side menu's links go through this, so "another window" cannot discard
// an in-progress edit silently any more.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GuardedNavLink } from '../GuardedNavLink.jsx';
import {
  setUnsavedChanges, subscribeNavigationPrompt, confirmPendingNavigation,
  resetUnsavedChangesForTests,
} from '@/lib/unsavedChanges.js';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  // A real anchor, so the modifier-click cases below are meaningful.
  NavLink: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
}));

function renderLink() {
  return render(
    <GuardedNavLink to="/purchase-order" data-testid="link">Purchase orders</GuardedNavLink>,
  );
}

describe('GuardedNavLink', () => {
  beforeEach(() => {
    resetUnsavedChangesForTests();
    mockNavigate.mockClear();
  });

  it('navigates straight away when no form is dirty', () => {
    subscribeNavigationPrompt(vi.fn());
    renderLink();
    fireEvent.click(screen.getByTestId('link'));
    expect(mockNavigate).toHaveBeenCalledWith('/purchase-order');
  });

  it('holds the navigation and raises the prompt when a form is dirty', () => {
    const listener = vi.fn();
    subscribeNavigationPrompt(listener);
    setUnsavedChanges('form', true);
    renderLink();
    fireEvent.click(screen.getByTestId('link'));
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(listener).toHaveBeenCalledWith(true);
  });

  it('navigates once the user discards', () => {
    subscribeNavigationPrompt(vi.fn());
    setUnsavedChanges('form', true);
    renderLink();
    fireEvent.click(screen.getByTestId('link'));
    confirmPendingNavigation();
    expect(mockNavigate).toHaveBeenCalledWith('/purchase-order');
  });

  it.each([
    ['meta (cmd-click)', { metaKey: true }],
    ['ctrl', { ctrlKey: true }],
    ['shift', { shiftKey: true }],
    ['alt', { altKey: true }],
    ['middle button', { button: 1 }],
  ])('leaves an "open elsewhere" gesture alone — %s', (_label, eventInit) => {
    // These open a second tab and leave the current form exactly where it is, so there is
    // nothing to lose and a prompt would be pure friction. The browser handles them natively,
    // which is also why preventDefault must NOT run.
    const listener = vi.fn();
    subscribeNavigationPrompt(listener);
    setUnsavedChanges('form', true);
    renderLink();
    fireEvent.click(screen.getByTestId('link'), eventInit);
    expect(listener).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('yields to a caller that already handled the click', () => {
    const listener = vi.fn();
    subscribeNavigationPrompt(listener);
    setUnsavedChanges('form', true);
    render(
      <GuardedNavLink
        to="/x"
        data-testid="link"
        onClick={(event) => event.preventDefault()}>x</GuardedNavLink>,
    );
    fireEvent.click(screen.getByTestId('link'));
    expect(listener).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('still runs a caller onClick that does not preventDefault', () => {
    const onClick = vi.fn();
    subscribeNavigationPrompt(vi.fn());
    render(<GuardedNavLink to="/x" data-testid="link" onClick={onClick}>x</GuardedNavLink>);
    fireEvent.click(screen.getByTestId('link'));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/x');
  });

  it('renders a real anchor, so the link is still copyable and openable in a new tab', () => {
    renderLink();
    expect(screen.getByTestId('link').getAttribute('href')).toBe('/purchase-order');
  });
});
