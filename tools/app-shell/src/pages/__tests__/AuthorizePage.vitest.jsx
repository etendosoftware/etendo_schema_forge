import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock dependencies BEFORE imports
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => key,
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ token: 'test-token', username: 'testuser', logout: vi.fn() }),
}));

vi.mock('@/auth/api.js', () => ({
  createApiFetch: vi.fn(() => vi.fn()),
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children, ...props }) => <div data-testid="card" {...props}>{children}</div>,
  CardContent: ({ children, ...props }) => <div {...props}>{children}</div>,
  CardHeader: ({ children, ...props }) => <div {...props}>{children}</div>,
  CardTitle: ({ children, ...props }) => <div {...props}>{children}</div>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }) => <button {...props}>{children}</button>,
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, ...props }) => <span {...props} data-testid="badge">{children}</span>,
}));

vi.mock('@/components/ui/separator', () => ({
  Separator: () => <hr />,
}));

vi.mock('lucide-react', () => ({
  Shield: () => <span>Shield</span>,
  CheckCircle2: () => <span>CheckCircle2</span>,
  XCircle: () => <span>XCircle</span>,
  Loader2: () => <span>Loader2</span>,
  Plug: () => <span>Plug</span>,
}));

let mockSearchParams = new URLSearchParams();
vi.mock('react-router-dom', () => ({
  useSearchParams: () => [mockSearchParams],
}));

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuthorizePage from '../AuthorizePage.jsx';

describe('AuthorizePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('ConnectionsLanding (no OAuth params)', () => {
    it('renders the connections landing when no OAuth params', () => {
      render(<AuthorizePage />);
      // Landing page shows step instructions using ui keys
      expect(screen.getByText('oauthHowItWorks')).toBeInTheDocument();
      expect(screen.getByText('oauthStep1')).toBeInTheDocument();
      expect(screen.getByText('oauthStep2')).toBeInTheDocument();
      expect(screen.getByText('oauthStep3')).toBeInTheDocument();
      expect(screen.getByText('oauthStep4')).toBeInTheDocument();
    });

    it('renders MCP server URL on landing', () => {
      render(<AuthorizePage />);
      expect(screen.getByText('oauthMcpServerUrl')).toBeInTheDocument();
    });

    it('renders landing page description', () => {
      render(<AuthorizePage />);
      expect(screen.getByText('oauthConnectLandingDesc')).toBeInTheDocument();
    });
  });

  describe('OAuth consent view', () => {
    beforeEach(() => {
      mockSearchParams = new URLSearchParams({
        client_id: 'test-client',
        redirect_uri: 'https://example.com/callback',
        code_challenge: 'challenge123',
        response_type: 'code',
        scope: 'neo:read neo:write',
        state: 'state123',
      });
    });

    it('renders the consent view with OAuth params', () => {
      render(<AuthorizePage />);
      expect(screen.getByTestId('oauth-consent-view')).toBeInTheDocument();
      expect(screen.getByText('oauthAuthorizeConnection')).toBeInTheDocument();
    });

    it('displays the client ID', () => {
      render(<AuthorizePage />);
      expect(screen.getByText('test-client')).toBeInTheDocument();
    });

    it('displays the username', () => {
      render(<AuthorizePage />);
      expect(screen.getByText('testuser')).toBeInTheDocument();
    });

    it('renders scope badges', () => {
      render(<AuthorizePage />);
      const badges = screen.getAllByTestId('badge');
      expect(badges.length).toBeGreaterThanOrEqual(2);
    });

    it('renders authorize and deny buttons', () => {
      render(<AuthorizePage />);
      expect(screen.getByTestId('oauth-authorize-submit')).toBeInTheDocument();
      expect(screen.getByTestId('oauth-deny')).toBeInTheDocument();
    });

    it('displays redirect URI info', () => {
      render(<AuthorizePage />);
      expect(screen.getByText('https://example.com/callback')).toBeInTheDocument();
    });

    it('handles authorize click - success flow', async () => {
      const user = userEvent.setup();
      const mockRedirectUrl = 'https://example.com/callback?code=abc';
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ redirect_url: mockRedirectUrl }),
      });

      // Prevent actual redirect
      const originalLocation = window.location;
      delete window.location;
      window.location = { ...originalLocation, href: '' };

      render(<AuthorizePage />);
      await user.click(screen.getByTestId('oauth-authorize-submit'));

      await waitFor(() => {
        expect(screen.getByText('oauthAuthorizedRedirecting')).toBeInTheDocument();
      });

      window.location = originalLocation;
    });

    it('handles authorize click - error from server', async () => {
      const user = userEvent.setup();
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error_description: 'Server failed' }),
      });

      render(<AuthorizePage />);
      await user.click(screen.getByTestId('oauth-authorize-submit'));

      await waitFor(() => {
        expect(screen.getByText('Server failed')).toBeInTheDocument();
      });
    });

    it('handles authorize click - network error', async () => {
      const user = userEvent.setup();
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      render(<AuthorizePage />);
      await user.click(screen.getByTestId('oauth-authorize-submit'));

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });

    it('handles authorize click - no redirect_url in response', async () => {
      const user = userEvent.setup();
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      render(<AuthorizePage />);
      await user.click(screen.getByTestId('oauth-authorize-submit'));

      await waitFor(() => {
        expect(screen.getByText('No redirect URL received')).toBeInTheDocument();
      });
    });

    it('handles deny click with redirect_uri', async () => {
      const user = userEvent.setup();
      const originalLocation = window.location;
      delete window.location;
      window.location = { ...originalLocation, href: '' };

      render(<AuthorizePage />);
      await user.click(screen.getByTestId('oauth-deny'));

      expect(window.location.href).toContain('error=access_denied');
      expect(window.location.href).toContain('state=state123');

      window.location = originalLocation;
    });

    it('handles error response where json parsing fails', async () => {
      const user = userEvent.setup();
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => { throw new Error('not json'); },
      });

      render(<AuthorizePage />);
      await user.click(screen.getByTestId('oauth-authorize-submit'));

      await waitFor(() => {
        expect(screen.getByText('Authorization failed (400)')).toBeInTheDocument();
      });
    });

    it('uses default scope when scope param is missing', () => {
      mockSearchParams = new URLSearchParams({
        client_id: 'test-client',
        redirect_uri: 'https://example.com/callback',
        code_challenge: 'challenge123',
        response_type: 'code',
      });
      render(<AuthorizePage />);
      // Should render with default scope 'neo:read neo:write' -> 2 badges
      const badges = screen.getAllByTestId('badge');
      expect(badges.length).toBe(2);
    });

    it('renders unknown scope as raw text', () => {
      mockSearchParams = new URLSearchParams({
        client_id: 'test-client',
        redirect_uri: 'https://example.com/callback',
        code_challenge: 'challenge123',
        response_type: 'code',
        scope: 'custom:scope',
      });
      render(<AuthorizePage />);
      expect(screen.getByText('custom:scope')).toBeInTheDocument();
    });
  });

  describe('embedded mode', () => {
    it('applies embedded styling when embedded=1 on landing', () => {
      mockSearchParams = new URLSearchParams({ embedded: '1' });
      const { container } = render(<AuthorizePage />);
      const wrapper = container.firstChild;
      expect(wrapper.className).toContain('min-h-screen');
    });

    it('applies embedded styling when embedded=1 on consent', () => {
      mockSearchParams = new URLSearchParams({
        embedded: '1',
        client_id: 'test-client',
        redirect_uri: 'https://example.com/callback',
        code_challenge: 'challenge123',
        response_type: 'code',
      });
      const { container } = render(<AuthorizePage />);
      const consentView = screen.getByTestId('oauth-consent-view');
      expect(consentView.className).toContain('min-h-screen');
    });
  });
});
