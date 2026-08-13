// Vitest render tests for OAuth2ClientsPage.jsx
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

const stableLogout = vi.fn();
vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ token: 'test-token', logout: stableLogout }),
}));

const stableApiFetch = vi.fn();
vi.mock('@/auth/api.js', () => ({
  createApiFetch: () => stableApiFetch,
}));

vi.mock('@/lib/oauth2Api.js', () => ({
  listClients: vi.fn().mockResolvedValue([]),
  deleteClient: vi.fn(),
  regenerateSecret: vi.fn(),
  revokeTokens: vi.fn(),
}));

vi.mock('@/components/OAuth2ClientDialog.jsx', () => ({
  default: () => <div data-testid="oauth-dialog">Dialog</div>,
  SecretRevealDialog: () => <div data-testid="secret-reveal">SecretReveal</div>,
  ConfirmDialog: () => <div data-testid="confirm-dialog">ConfirmDialog</div>,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('lucide-react', () => ({
  Shield: (p) => <span {...p} />,
  Plus: (p) => <span {...p} />,
  RefreshCw: (p) => <span {...p} />,
  Trash2: (p) => <span {...p} />,
  Key: (p) => <span {...p} />,
  MoreHorizontal: (p) => <span {...p} />,
  Copy: (p) => <span {...p} />,
  Ban: (p) => <span {...p} />,
  Pencil: (p) => <span {...p} />,
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children }) => <div data-testid="card">{children}</div>,
  CardContent: ({ children, className }) => <div className={className}>{children}</div>,
}));

vi.mock('@/components/ui/table', () => ({
  Table: ({ children }) => <table>{children}</table>,
  TableHeader: ({ children }) => <thead>{children}</thead>,
  TableRow: ({ children }) => <tr>{children}</tr>,
  TableHead: ({ children }) => <th>{children}</th>,
  TableBody: ({ children }) => <tbody>{children}</tbody>,
  TableCell: ({ children, className }) => <td className={className}>{children}</td>,
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant }) => <span data-variant={variant}>{children}</span>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...rest }) => (
    <button onClick={onClick} disabled={disabled} {...rest}>{children}</button>
  ),
}));

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }) => <button onClick={onClick}>{children}</button>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ children }) => <div>{children}</div>,
}));

// ── Import under test ───────────────────────────────────────────────────────

import { render, screen, waitFor } from '@testing-library/react';
import OAuth2ClientsPage from '../../pages/OAuth2ClientsPage.jsx';
import { listClients } from '@/lib/oauth2Api.js';

// ── Tests ───────────────────────────────────────────────────────────────────

describe('OAuth2ClientsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the page title', async () => {
    listClients.mockResolvedValue([]);
    render(<OAuth2ClientsPage />);
    expect(document.body.textContent).toContain('oauth2Clients');
  });

  it('renders the subtitle', async () => {
    listClients.mockResolvedValue([]);
    render(<OAuth2ClientsPage />);
    expect(document.body.textContent).toContain('oauthClientManage');
  });

  it('shows loading state initially', () => {
    listClients.mockReturnValue(new Promise(() => {})); // never resolves
    render(<OAuth2ClientsPage />);
    expect(document.body.textContent).toContain('loadingClients');
  });

  it('shows empty state when no clients', async () => {
    listClients.mockResolvedValue([]);
    render(<OAuth2ClientsPage />);
    await waitFor(() => {
      expect(document.body.textContent).toContain('oauthClientNoClients');
    });
  });

  it('renders "New Client" button', () => {
    listClients.mockResolvedValue([]);
    render(<OAuth2ClientsPage />);
    expect(document.body.textContent).toContain('oauthClientNew');
  });

  it('renders a table when clients exist', async () => {
    listClients.mockResolvedValue([
      { id: '1', name: 'Agent-1', clientId: 'cid-123456789012', scopes: ['neo:read'], isActive: true },
    ]);
    render(<OAuth2ClientsPage />);
    await waitFor(() => {
      expect(document.body.textContent).toContain('Agent-1');
    });
  });

  it('renders scope badges for each client', async () => {
    listClients.mockResolvedValue([
      { id: '1', name: 'A', clientId: 'cid', scopes: ['neo:read', 'neo:write'], isActive: true },
    ]);
    render(<OAuth2ClientsPage />);
    await waitFor(() => {
      expect(document.body.textContent).toContain('neo:read');
      expect(document.body.textContent).toContain('neo:write');
    });
  });

  it('shows active/inactive badge', async () => {
    listClients.mockResolvedValue([
      { id: '1', name: 'A', clientId: 'cid', scopes: [], isActive: true },
    ]);
    render(<OAuth2ClientsPage />);
    await waitFor(() => {
      expect(document.body.textContent).toContain('oauthActive');
    });
  });

  it('renders OAuth2ClientDialog sub-component', async () => {
    listClients.mockResolvedValue([]);
    render(<OAuth2ClientsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('oauth-dialog')).toBeTruthy();
    });
  });

  it('renders ConfirmDialog sub-component', async () => {
    listClients.mockResolvedValue([]);
    render(<OAuth2ClientsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeTruthy();
    });
  });

  it('calls listClients on mount', async () => {
    listClients.mockResolvedValue([]);
    render(<OAuth2ClientsPage />);
    await waitFor(() => {
      expect(listClients).toHaveBeenCalled();
    });
  });

  it('renders table column headers when clients exist', async () => {
    listClients.mockResolvedValue([
      { id: '1', name: 'A', clientId: 'cid', scopes: [], isActive: true },
    ]);
    render(<OAuth2ClientsPage />);
    await waitFor(() => {
      // The table should show headers — check for specific header keys
      expect(document.body.textContent).toContain('oauthClientId');
      expect(document.body.textContent).toContain('oauthScopes');
      expect(document.body.textContent).toContain('oauthActive');
    });
  });
});
