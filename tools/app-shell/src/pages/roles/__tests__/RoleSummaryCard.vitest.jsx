// Vitest coverage for the ETP-4907 role summary card (icon, name, "N Users"
// headline). ETP-4999 removed the window-count badge from this card entirely
// (see RoleSummaryCard.jsx's own ETP-4999 doc comment) — the card now shows
// only icon + name + the userCount headline.
import { describe, it, expect, vi } from 'vitest';
import React from 'react';

vi.mock('@/i18n', () => ({
  useUI: () => (key, params = {}) => {
    let text = { rolesColWindows: 'Assigned windows', rolesUserCount: '{count} Users' }[key] ?? key;
    Object.keys(params).forEach((p) => { text = text.replace(`{${p}}`, params[p]); });
    return text;
  },
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children, ...props }) => <div {...props}>{children}</div>,
  CardContent: ({ children, ...props }) => <div {...props}>{children}</div>,
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

  // ETP-4999: the user count is the card's only headline/content line now that
  // the window-count badge was removed entirely. See RoleSummaryCard.jsx's own
  // ETP-4999 doc comment.
  it('renders the user count as the interpolated headline', () => {
    render(<RoleSummaryCard role={{ id: 'sales', name: 'Sales', windowCount: 13, userCount: 3 }} Icon={DummyIcon} />);
    expect(screen.getByTestId('RoleSummaryCard__userCount-sales').textContent).toBe('3 Users');
  });

  // ETP-4999 regression guard — a window-count badge (and its icon) used to sit
  // top-right of the card; the Figma spec dropped it from this card altogether.
  // `role.windowCount` is no longer read by the component at all, so this must
  // hold even when the field is present (and non-zero) on the role object.
  it('does not render a window-count badge or icon (ETP-4999 — removed entirely)', () => {
    render(<RoleSummaryCard role={{ id: 'inventory', name: 'Inventory', windowCount: 13, userCount: 1 }} Icon={DummyIcon} />);
    expect(screen.queryByTestId('RoleSummaryCard__windowCount-inventory')).not.toBeInTheDocument();
    expect(screen.queryByTestId('RoleSummaryCard__windowsIcon-inventory')).not.toBeInTheDocument();
  });

  it('renders the given icon', () => {
    render(<RoleSummaryCard role={{ id: 'purchasing', name: 'Purchasing', windowCount: 11, userCount: 1 }} Icon={DummyIcon} />);
    expect(screen.getByTestId('RoleSummaryCard__icon-purchasing')).toBeTruthy();
  });

  it('does not crash when no Icon is provided', () => {
    render(<RoleSummaryCard role={{ id: 'sales', name: 'Sales', windowCount: 13, userCount: 3 }} />);
    expect(screen.getByTestId('RoleSummaryCard__sales')).toBeTruthy();
  });

  // ETP-4907 QA: a role can legitimately have zero users (e.g. a
  // newly-provisioned system-template fallback nobody has composed yet) — the
  // card must render "0", not blank or NaN, for the headline.
  it('renders "0 Users" (not blank/NaN) in the user-count headline for a role with userCount: 0', () => {
    render(<RoleSummaryCard role={{ id: 'inventory', name: 'Inventory', windowCount: 5, userCount: 0 }} Icon={DummyIcon} />);
    expect(screen.getByTestId('RoleSummaryCard__userCount-inventory').textContent).toBe('0 Users');
  });
});
