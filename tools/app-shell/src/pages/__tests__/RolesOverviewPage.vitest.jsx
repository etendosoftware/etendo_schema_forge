// Vitest render tests for RolesOverviewPage.jsx (ETP-4513 — read-only
// "Configuración > Roles" view). Mirrors OAuth2ClientsPage.vitest.jsx's
// mocking style: real i18n keys surface as-is (useUI mock returns the key),
// UI primitives are stubbed to plain elements that preserve data-testid/props
// so we can assert on the page's own contract instead of shadcn/Radix
// internals.
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/lib/rolesApi.js', () => ({
  fetchRolesOverview: vi.fn(),
}));

vi.mock('lucide-react', () => ({
  Users: (p) => <span data-testid={p['data-testid']} {...p} />,
  Pencil: (p) => <span data-testid={p['data-testid']} {...p} />,
  RefreshCw: (p) => <span data-testid={p['data-testid']} className={p.className} />,
  ShieldAlert: (p) => <span data-testid={p['data-testid']} {...p} />,
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children, ...props }) => <div {...props}>{children}</div>,
  CardHeader: ({ children, className }) => <div className={className}>{children}</div>,
  CardTitle: ({ children }) => <h3>{children}</h3>,
  CardDescription: ({ children }) => <p>{children}</p>,
  CardContent: ({ children, className }) => <div className={className}>{children}</div>,
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant, title, ...props }) => (
    <span data-variant={variant} title={title} {...props}>{children}</span>
  ),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }) => (
    <button onClick={onClick} disabled={disabled} {...props}>{children}</button>
  ),
}));

vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: (props) => <div {...props} />,
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }) => (open ? <div data-testid="dialog-root">{children}</div> : null),
  DialogContent: ({ children, ...props }) => <div {...props}>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <h2>{children}</h2>,
  DialogDescription: ({ children }) => <p>{children}</p>,
  DialogFooter: ({ children }) => <div>{children}</div>,
}));

// ── Import under test ───────────────────────────────────────────────────────

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RolesOverviewPage from '../RolesOverviewPage.jsx';
import { fetchRolesOverview } from '@/lib/rolesApi.js';

// Real backend shape (mirrors SFRolesOverview.java / mockFetch.js's fixture):
// `rawDescription` is deliberately junk AD_Role boilerplate text that must
// NEVER be what the page renders — the page must use the curated i18n
// descKey instead (ROLE_I18N map in RolesOverviewPage.jsx).
const RAW_JUNK_DESCRIPTION = '*** Please, do not edit this role. Use Copy Record instead ***';

const FIVE_ROLES = [
  {
    id: '9B8D736190724807AB256DC95F20EC5E',
    name: 'GOClient Admin',
    rawDescription: 'GOClient Admin',
    userCount: 2,
    windows: [
      { id: '108', name: 'User', tier: 'full' },
      { id: '146', name: 'Price List', tier: 'full' },
    ],
  },
  {
    id: '127AE77FE2994067B7FE6495FC21D51E',
    name: 'Finance',
    rawDescription: RAW_JUNK_DESCRIPTION,
    userCount: 2,
    windows: [
      { id: 'w-fin-1', name: 'Financial Account', tier: 'full' },
      { id: 'w-fin-2', name: 'Sales Invoice', tier: 'read-only' },
    ],
  },
  {
    id: '2A159DF4F4B944A6AA903202AD35B545',
    name: 'Sales',
    rawDescription: RAW_JUNK_DESCRIPTION,
    userCount: 1,
    windows: [{ id: 'w-sales-1', name: 'Sales Order', tier: 'full' }],
  },
  {
    id: 'A826430F723E4C1B9A53EBB0746A98C0',
    name: 'Purchasing',
    rawDescription: RAW_JUNK_DESCRIPTION,
    userCount: 0,
    windows: [{ id: 'w-pur-1', name: 'Purchase Order', tier: 'full' }],
  },
  {
    id: '55E05A4B43514A029D6FB6B8D94B49D4',
    name: 'Inventory',
    rawDescription: RAW_JUNK_DESCRIPTION,
    userCount: 0,
    windows: [{ id: 'w-inv-1', name: 'Warehouse and Storage Bins', tier: 'read-only' }],
  },
];

describe('RolesOverviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering all 5 roles', () => {
    it('renders one card per role, keyed by role id', async () => {
      fetchRolesOverview.mockResolvedValue({ roles: FIVE_ROLES });
      render(<RolesOverviewPage />);
      await waitFor(() => {
        for (const role of FIVE_ROLES) {
          expect(screen.getByTestId(`RolesOverviewPage__role-${role.id}`)).toBeTruthy();
        }
      });
    });

    it('renders the curated i18n name/description keys (not raw role.name/rawDescription)', async () => {
      fetchRolesOverview.mockResolvedValue({ roles: FIVE_ROLES });
      render(<RolesOverviewPage />);
      await waitFor(() => {
        expect(document.body.textContent).toContain('roleNameGoClientAdmin');
        expect(document.body.textContent).toContain('roleDescGoClientAdmin');
        expect(document.body.textContent).toContain('roleNameFinance');
        expect(document.body.textContent).toContain('roleDescFinance');
      });
    });

    // This is the central "no raw junk text" assertion the task calls out
    // explicitly: the backend's rawDescription field is boilerplate AD_Role
    // text ("*** Please, do not edit this role...") and must never leak into
    // the rendered page — only the curated roleDesc* i18n keys should appear.
    it('never renders the raw AD_Role.description-shaped junk text', async () => {
      fetchRolesOverview.mockResolvedValue({ roles: FIVE_ROLES });
      render(<RolesOverviewPage />);
      await waitFor(() => {
        expect(screen.getByTestId(`RolesOverviewPage__role-${FIVE_ROLES[1].id}`)).toBeTruthy();
      });
      expect(document.body.textContent).not.toContain(RAW_JUNK_DESCRIPTION);
      expect(document.body.textContent).not.toContain('Please, do not edit this role');
    });

    it('renders the userCount badge for each role', async () => {
      fetchRolesOverview.mockResolvedValue({ roles: FIVE_ROLES });
      render(<RolesOverviewPage />);
      await waitFor(() => {
        expect(screen.getByTestId(`RolesOverviewPage__userCount-${FIVE_ROLES[0].id}`).textContent).toContain('2');
        expect(screen.getByTestId(`RolesOverviewPage__userCount-${FIVE_ROLES[3].id}`).textContent).toContain('0');
      });
    });

    it('renders a window chip for every window in role.windows, per role', async () => {
      fetchRolesOverview.mockResolvedValue({ roles: FIVE_ROLES });
      render(<RolesOverviewPage />);
      await waitFor(() => {
        for (const role of FIVE_ROLES) {
          for (const w of role.windows) {
            const chip = screen.getByTestId(`RolesOverviewPage__window-${role.id}-${w.id}`);
            expect(chip.textContent).toBe(w.name);
          }
        }
      });
    });

    it('gives a "full" tier window chip the default badge variant and a "read-only" one the outline variant', async () => {
      fetchRolesOverview.mockResolvedValue({ roles: FIVE_ROLES });
      render(<RolesOverviewPage />);
      await waitFor(() => {
        const fullChip = screen.getByTestId(`RolesOverviewPage__window-${FIVE_ROLES[0].id}-108`);
        expect(fullChip.getAttribute('data-variant')).toBe('default');
        const readOnlyChip = screen.getByTestId(`RolesOverviewPage__window-${FIVE_ROLES[1].id}-w-fin-2`);
        expect(readOnlyChip.getAttribute('data-variant')).toBe('outline');
      });
    });

    it('renders a placeholder dash when a role has no windows', async () => {
      const roleWithNoWindows = { ...FIVE_ROLES[3], windows: [] };
      fetchRolesOverview.mockResolvedValue({ roles: [roleWithNoWindows] });
      render(<RolesOverviewPage />);
      await waitFor(() => {
        expect(screen.getByTestId(`RolesOverviewPage__windows-${roleWithNoWindows.id}`).textContent).toContain('—');
      });
    });
  });

  describe('Edit action — coming soon dialog', () => {
    it('opens the "coming soon" dialog when Edit is clicked, with no navigation side effect', async () => {
      fetchRolesOverview.mockResolvedValue({ roles: FIVE_ROLES });
      const user = userEvent.setup();
      render(<RolesOverviewPage />);
      await waitFor(() => {
        expect(screen.getByTestId(`RolesOverviewPage__edit-${FIVE_ROLES[0].id}`)).toBeTruthy();
      });

      expect(screen.queryByTestId('RolesOverviewPage__editDialog')).toBeNull();
      await user.click(screen.getByTestId(`RolesOverviewPage__edit-${FIVE_ROLES[0].id}`));

      const dialog = screen.getByTestId('RolesOverviewPage__editDialog');
      expect(dialog).toBeTruthy();
      expect(document.body.textContent).toContain('rolesEditComingSoonTitle');
      expect(document.body.textContent).toContain('rolesEditComingSoonMessage');
    });

    it('closes the dialog via the close button, without changing which roles are rendered', async () => {
      fetchRolesOverview.mockResolvedValue({ roles: FIVE_ROLES });
      const user = userEvent.setup();
      render(<RolesOverviewPage />);
      await waitFor(() => {
        expect(screen.getByTestId(`RolesOverviewPage__edit-${FIVE_ROLES[0].id}`)).toBeTruthy();
      });

      await user.click(screen.getByTestId(`RolesOverviewPage__edit-${FIVE_ROLES[0].id}`));
      expect(screen.getByTestId('RolesOverviewPage__editDialog')).toBeTruthy();

      await user.click(screen.getByTestId('RolesOverviewPage__editDialogClose'));
      expect(screen.queryByTestId('RolesOverviewPage__editDialog')).toBeNull();

      // Still shows all 5 roles — closing the dialog must not clear the list.
      for (const role of FIVE_ROLES) {
        expect(screen.getByTestId(`RolesOverviewPage__role-${role.id}`)).toBeTruthy();
      }
    });

    it('exposes no create/delete affordance anywhere on the page', async () => {
      fetchRolesOverview.mockResolvedValue({ roles: FIVE_ROLES });
      render(<RolesOverviewPage />);
      await waitFor(() => {
        expect(screen.getByTestId(`RolesOverviewPage__role-${FIVE_ROLES[0].id}`)).toBeTruthy();
      });

      const allTestIds = Array.from(document.querySelectorAll('[data-testid]')).map(
        (el) => el.getAttribute('data-testid')
      );
      expect(allTestIds.some((id) => /delete/i.test(id))).toBe(false);
      expect(allTestIds.some((id) => /create/i.test(id))).toBe(false);
      expect(allTestIds.some((id) => /^RolesOverviewPage__new/i.test(id))).toBe(false);
    });
  });

  describe('loading state', () => {
    it('shows 3 skeleton placeholders while the fetch is in flight', () => {
      fetchRolesOverview.mockReturnValue(new Promise(() => {})); // never resolves
      render(<RolesOverviewPage />);
      expect(screen.getByTestId('RolesOverviewPage__loading')).toBeTruthy();
      expect(screen.getAllByTestId('Skeleton__rolesOverview')).toHaveLength(3);
    });

    it('does not show the role list or error/empty states while loading', () => {
      fetchRolesOverview.mockReturnValue(new Promise(() => {}));
      render(<RolesOverviewPage />);
      expect(screen.queryByTestId('RolesOverviewPage__list')).toBeNull();
      expect(screen.queryByTestId('RolesOverviewPage__error')).toBeNull();
      expect(screen.queryByTestId('RolesOverviewPage__noAccess')).toBeNull();
    });
  });

  describe('error state', () => {
    it('shows the error card with a retry action when the API rejects', async () => {
      fetchRolesOverview.mockRejectedValue(new Error('network down'));
      render(<RolesOverviewPage />);
      await waitFor(() => {
        expect(screen.getByTestId('RolesOverviewPage__error')).toBeTruthy();
      });
      expect(document.body.textContent).toContain('rolesLoadError');
      expect(screen.getByTestId('RolesOverviewPage__retry')).toBeTruthy();
    });

    it('retry re-invokes fetchRolesOverview and can recover into the success state', async () => {
      fetchRolesOverview.mockRejectedValueOnce(new Error('network down'));
      fetchRolesOverview.mockResolvedValueOnce({ roles: FIVE_ROLES });
      const user = userEvent.setup();
      render(<RolesOverviewPage />);

      await waitFor(() => expect(screen.getByTestId('RolesOverviewPage__error')).toBeTruthy());
      await user.click(screen.getByTestId('RolesOverviewPage__retry'));

      await waitFor(() => {
        expect(screen.getByTestId(`RolesOverviewPage__role-${FIVE_ROLES[0].id}`)).toBeTruthy();
      });
      expect(fetchRolesOverview).toHaveBeenCalledTimes(2);
    });
  });

  describe('empty / denied state', () => {
    it('shows the no-access card when roles resolves to an empty array', async () => {
      fetchRolesOverview.mockResolvedValue({ roles: [] });
      render(<RolesOverviewPage />);
      await waitFor(() => {
        expect(screen.getByTestId('RolesOverviewPage__noAccess')).toBeTruthy();
      });
      expect(document.body.textContent).toContain('rolesNoAccessTitle');
      expect(document.body.textContent).toContain('rolesNoAccessMessage');
    });

    it('treats a missing/non-array roles field as empty rather than crashing', async () => {
      fetchRolesOverview.mockResolvedValue({});
      render(<RolesOverviewPage />);
      await waitFor(() => {
        expect(screen.getByTestId('RolesOverviewPage__noAccess')).toBeTruthy();
      });
    });
  });

  describe('refresh action', () => {
    it('refetches when the refresh button is clicked', async () => {
      fetchRolesOverview.mockResolvedValue({ roles: FIVE_ROLES });
      const user = userEvent.setup();
      render(<RolesOverviewPage />);
      await waitFor(() => expect(fetchRolesOverview).toHaveBeenCalledTimes(1));

      await user.click(screen.getByTestId('RolesOverviewPage__refresh'));
      await waitFor(() => expect(fetchRolesOverview).toHaveBeenCalledTimes(2));
    });
  });
});
