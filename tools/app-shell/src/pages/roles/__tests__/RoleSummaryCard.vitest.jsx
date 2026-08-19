// Vitest coverage for the ETP-4907 role summary card (icon, name, user-count
// badge, "N Ventanas" line).
import { describe, it, expect, vi } from 'vitest';
import React from 'react';

vi.mock('@/i18n', () => ({
  useUI: () => (key, params = {}) => {
    let text = { rolesColUsers: 'Users', rolesWindowCount: '{count} Windows' }[key] ?? key;
    Object.keys(params).forEach((p) => { text = text.replace(`{${p}}`, params[p]); });
    return text;
  },
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children, ...props }) => <div {...props}>{children}</div>,
  CardContent: ({ children, ...props }) => <div {...props}>{children}</div>,
}));

vi.mock('lucide-react', () => ({
  Users: (p) => <span data-testid={p['data-testid']} {...p} />,
}));

import { render, screen } from '@testing-library/react';
import RoleSummaryCard from '../RoleSummaryCard.jsx';

function DummyIcon(props) {
  return <svg data-testid="DummyIcon" {...props} />;
}

describe('RoleSummaryCard', () => {
  it('renders the admin role via isClientAdmin, not its literal (per-tenant) name', () => {
    render(
      <RoleSummaryCard
        role={{ id: 'admin', name: 'RolesPresa Admin', isClientAdmin: true, windowCount: 48, userCount: 2 }}
        Icon={DummyIcon}
      />
    );
    expect(screen.getByTestId('RoleSummaryCard__admin').textContent).not.toContain('RolesPresa Admin');
    expect(screen.getByTestId('RoleSummaryCard__admin').textContent).toContain('roleNameAdmin');
  });

  it('resolves a fixed role name via the shared roleNameI18n map', () => {
    render(<RoleSummaryCard role={{ id: 'finance', name: 'Finance', windowCount: 27, userCount: 2 }} Icon={DummyIcon} />);
    expect(screen.getByTestId('RoleSummaryCard__finance').textContent).toContain('roleNameFinance');
  });

  it('renders the user-count badge', () => {
    render(<RoleSummaryCard role={{ id: 'sales', name: 'Sales', windowCount: 13, userCount: 3 }} Icon={DummyIcon} />);
    expect(screen.getByTestId('RoleSummaryCard__userCount-sales').textContent).toContain('3');
  });

  it('renders the interpolated window-count line', () => {
    render(<RoleSummaryCard role={{ id: 'inventory', name: 'Inventory', windowCount: 13, userCount: 1 }} Icon={DummyIcon} />);
    expect(screen.getByTestId('RoleSummaryCard__windowCount-inventory').textContent).toBe('13 Windows');
  });

  it('renders the given icon', () => {
    render(<RoleSummaryCard role={{ id: 'purchasing', name: 'Purchasing', windowCount: 11, userCount: 1 }} Icon={DummyIcon} />);
    expect(screen.getByTestId('RoleSummaryCard__icon-purchasing')).toBeTruthy();
  });

  it('does not crash when no Icon is provided', () => {
    render(<RoleSummaryCard role={{ id: 'sales', name: 'Sales', windowCount: 13, userCount: 3 }} />);
    expect(screen.getByTestId('RoleSummaryCard__sales')).toBeTruthy();
  });

  // ETP-4907 QA: a role can legitimately have zero windows/users (e.g. a
  // newly-provisioned system-template fallback nobody has composed yet, or a
  // role with no AD_Window_Access rows) — the card must render "0", not blank
  // or NaN, for both figures.
  it('renders "0 Windows" (not blank/NaN) for a role with windowCount: 0', () => {
    render(<RoleSummaryCard role={{ id: 'purchasing', name: 'Purchasing', windowCount: 0, userCount: 2 }} Icon={DummyIcon} />);
    expect(screen.getByTestId('RoleSummaryCard__windowCount-purchasing').textContent).toBe('0 Windows');
  });

  it('renders "0" (not blank/NaN) in the user-count badge for a role with userCount: 0', () => {
    render(<RoleSummaryCard role={{ id: 'inventory', name: 'Inventory', windowCount: 5, userCount: 0 }} Icon={DummyIcon} />);
    expect(screen.getByTestId('RoleSummaryCard__userCount-inventory').textContent).toContain('0');
  });
});
