// Vitest render tests for RolesOverviewPage.jsx, redesigned by ETP-4907 to
// match a new reference layout: 5 role summary cards + a window x role
// access matrix grouped by category (replacing ETP-4513's per-role card
// list with window "tier" chips). Sub-component internals (RoleSummaryCard,
// RolesAccessMatrix, AccessTierPill) have their own dedicated test files —
// this file only verifies the page's own orchestration: loading/error/
// no-access states, and that both sub-components receive the right data.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/i18n', () => ({
  useUI: () => (key, params = {}) => {
    let text = key;
    Object.keys(params).forEach((p) => { text = `${text} {${p}=${params[p]}}`; });
    return text;
  },
  useMenuLabel: () => (key) => key,
}));

vi.mock('@/components/layout/PageMetaContext', () => ({
  useSetPageMeta: vi.fn(),
}));

const mockUseRolesOverviewData = vi.fn();
vi.mock('../roles/useRolesOverviewData.js', () => ({
  useRolesOverviewData: () => mockUseRolesOverviewData(),
  ROLE_ICONS: {},
  resolveRoleKind: () => null,
  buildRowKey: (category, windowId) => `${category}::${windowId}`,
}));

vi.mock('lucide-react', () => ({
  ShieldAlert: (p) => <span data-testid={p['data-testid']} {...p} />,
  Users: (p) => <span data-testid={p['data-testid']} {...p} />,
  LayoutGrid: (p) => <span data-testid={p['data-testid']} {...p} />,
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children, ...props }) => <div {...props}>{children}</div>,
  CardContent: ({ children, className }) => <div className={className}>{children}</div>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }) => (
    <button onClick={onClick} disabled={disabled} {...props}>{children}</button>
  ),
}));

vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: (props) => <div {...props} />,
}));

// ── Import under test ───────────────────────────────────────────────────────

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RolesOverviewPage from '../RolesOverviewPage.jsx';

// Realistic-but-arbitrary figures (NOT the earlier Figma reference
// screenshot's placeholder numbers, which the backend developer confirmed
// don't match live GOClient data — Admin's 48/2 is the one figure that does).
const SAMPLE_CARDS = [
  { id: 'admin', name: 'GOClient Admin', isClientAdmin: true, windowCount: 48, userCount: 2 },
  { id: 'sales', name: 'Sales', windowCount: 13, userCount: 3 },
];
// Uses a category other than "General" — RolesAccessMatrix always overlays a
// hardcoded "General" section (Inicio/Favoritos/Copilot) of its own ahead of
// whatever `matrix` prop it receives, so a same-named fixture category here
// would collide on data-testid="RolesAccessMatrix__category-General".
const SAMPLE_MATRIX = [
  { category: 'Commercial', rows: [{ windowId: 'w-contacts', windowName: 'Business Partner', access: { admin: 'full', sales: 'full' } }] },
];

describe('RolesOverviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loading state', () => {
    it('shows 3 skeleton placeholders while loading', () => {
      mockUseRolesOverviewData.mockReturnValue({ loading: true, error: null, cards: [], matrix: [], reload: vi.fn() });
      render(<RolesOverviewPage />);
      expect(screen.getByTestId('RolesOverviewPage__loading')).toBeTruthy();
      expect(screen.getAllByTestId('Skeleton__rolesOverview')).toHaveLength(3);
    });

    it('does not render the cards/matrix content or error/empty states while loading', () => {
      mockUseRolesOverviewData.mockReturnValue({ loading: true, error: null, cards: [], matrix: [], reload: vi.fn() });
      render(<RolesOverviewPage />);
      expect(screen.queryByTestId('RolesOverviewPage__content')).toBeNull();
      expect(screen.queryByTestId('RolesOverviewPage__error')).toBeNull();
      expect(screen.queryByTestId('RolesOverviewPage__noAccess')).toBeNull();
    });
  });

  describe('error state', () => {
    it('shows the error card with a retry action', () => {
      mockUseRolesOverviewData.mockReturnValue({
        loading: false, error: 'network down', cards: [], matrix: [], reload: vi.fn(),
      });
      render(<RolesOverviewPage />);
      expect(screen.getByTestId('RolesOverviewPage__error')).toBeTruthy();
      expect(document.body.textContent).toContain('rolesLoadError');
      expect(screen.getByTestId('RolesOverviewPage__retry')).toBeTruthy();
    });

    it('retry invokes reload()', async () => {
      const reload = vi.fn();
      mockUseRolesOverviewData.mockReturnValue({ loading: false, error: 'boom', cards: [], matrix: [], reload });
      const user = userEvent.setup();
      render(<RolesOverviewPage />);
      await user.click(screen.getByTestId('RolesOverviewPage__retry'));
      expect(reload).toHaveBeenCalledTimes(1);
    });
  });

  describe('no-access / empty state', () => {
    it('shows the no-access card when cards resolves to an empty array', () => {
      mockUseRolesOverviewData.mockReturnValue({ loading: false, error: null, cards: [], matrix: [], reload: vi.fn() });
      render(<RolesOverviewPage />);
      expect(screen.getByTestId('RolesOverviewPage__noAccess')).toBeTruthy();
      expect(document.body.textContent).toContain('rolesNoAccessTitle');
      expect(document.body.textContent).toContain('rolesNoAccessMessage');
    });
  });

  describe('content — cards + matrix', () => {
    beforeEach(() => {
      mockUseRolesOverviewData.mockReturnValue({
        loading: false, error: null, cards: SAMPLE_CARDS, matrix: SAMPLE_MATRIX, reload: vi.fn(),
      });
    });

    it('renders one summary card per role', () => {
      render(<RolesOverviewPage />);
      expect(screen.getByTestId('RoleSummaryCard__admin')).toBeTruthy();
      expect(screen.getByTestId('RoleSummaryCard__sales')).toBeTruthy();
    });

    it('renders the access matrix below the cards', () => {
      render(<RolesOverviewPage />);
      expect(screen.getByTestId('RolesAccessMatrix')).toBeTruthy();
      expect(screen.getByTestId('RolesAccessMatrix__category-General')).toBeTruthy();
    });

    it('exposes no create/edit/delete affordance anywhere on the page', () => {
      render(<RolesOverviewPage />);
      const allTestIds = Array.from(document.querySelectorAll('[data-testid]')).map((el) =>
        el.getAttribute('data-testid')
      );
      expect(allTestIds.some((id) => /delete/i.test(id))).toBe(false);
      expect(allTestIds.some((id) => /create/i.test(id))).toBe(false);
      expect(allTestIds.some((id) => /^RolesOverviewPage__edit/i.test(id))).toBe(false);
      expect(document.querySelector('form')).toBeNull();
    });
  });
});
