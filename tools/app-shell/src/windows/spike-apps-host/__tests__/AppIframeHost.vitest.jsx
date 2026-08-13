import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

import AppIframeHost from '../AppIframeHost.jsx';

describe('AppIframeHost', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
    // Mock import.meta.env
    import.meta.env.VITE_API_BASE = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows loading state initially', () => {
    globalThis.fetch.mockReturnValue(new Promise(() => {})); // never resolves
    render(<AppIframeHost appUrl="https://app.test" appId="myapp" token="tok123" />);
    expect(screen.getByText(/loading app/i)).toBeInTheDocument();
  });

  it('renders iframe after successful token fetch', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'app-jwt-token' }),
    });
    render(<AppIframeHost appUrl="https://app.test" appId="myapp" token="tok123" />);

    await waitFor(() => {
      const iframe = screen.getByTitle('myapp');
      expect(iframe).toBeInTheDocument();
      expect(iframe.getAttribute('src')).toBe(
        'https://app.test?jwt=app-jwt-token',
      );
    });
  });

  it('appends jwt with & when url already has query params', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'jwt123' }),
    });
    render(<AppIframeHost appUrl="https://app.test?foo=bar" appId="myapp" token="tok123" />);

    await waitFor(() => {
      const iframe = screen.getByTitle('myapp');
      expect(iframe.getAttribute('src')).toBe(
        'https://app.test?foo=bar&jwt=jwt123',
      );
    });
  });

  it('shows error when token is missing', () => {
    render(<AppIframeHost appUrl="https://app.test" appId="myapp" token="" />);
    expect(screen.getByText(/missing etendo session token/i)).toBeInTheDocument();
  });

  it('shows error when token is undefined', () => {
    render(<AppIframeHost appUrl="https://app.test" appId="myapp" token={undefined} />);
    expect(screen.getByText(/missing etendo session token/i)).toBeInTheDocument();
  });

  it('shows error when fetch fails with non-ok status', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 403,
    });
    render(<AppIframeHost appUrl="https://app.test" appId="myapp" token="tok123" />);

    await waitFor(() => {
      expect(screen.getByText(/token endpoint failed: 403/)).toBeInTheDocument();
    });
  });

  it('shows error when fetch throws', async () => {
    globalThis.fetch.mockRejectedValue(new Error('Network error'));
    render(<AppIframeHost appUrl="https://app.test" appId="myapp" token="tok123" />);

    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
  });

  it('sets sandbox attribute on iframe', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'jwt' }),
    });
    render(<AppIframeHost appUrl="https://app.test" appId="myapp" token="tok123" />);

    await waitFor(() => {
      const iframe = screen.getByTitle('myapp');
      expect(iframe).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');
    });
  });

  it('calls fetch with correct URL and authorization', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'jwt' }),
    });
    render(<AppIframeHost appUrl="https://app.test" appId="app42" token="bearer-tok" />);

    await waitFor(() => screen.getByTitle('app42'));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('appId=app42'),
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer bearer-tok' },
      }),
    );
  });

  it('encodes appId in URL', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'jwt' }),
    });
    render(<AppIframeHost appUrl="https://app.test" appId="app with spaces" token="tok" />);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('appId=app%20with%20spaces'),
        expect.any(Object),
      );
    });
  });

  it('uses VITE_API_BASE when set', async () => {
    import.meta.env.VITE_API_BASE = 'https://api.example.com';
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'jwt' }),
    });
    render(<AppIframeHost appUrl="https://app.test" appId="x" token="tok" />);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('https://api.example.com/sws/apps/token'),
        expect.any(Object),
      );
    });
  });
});
