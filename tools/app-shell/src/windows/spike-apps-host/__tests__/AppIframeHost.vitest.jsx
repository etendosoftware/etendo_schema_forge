import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

import AppIframeHost from '../AppIframeHost.jsx';
import {
  declareBearerSession,
  declareCookieSession,
  expectBearerHeader,
  expectNoAuthorizationHeader,
  expectNoCsrfHeader,
} from '@/test/sessionContract.js';

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
    render(<AppIframeHost appUrl="https://app.test" appId="myapp" />);
    expect(screen.getByText(/loading app/i)).toBeInTheDocument();
  });

  it('renders iframe after successful token fetch', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'app-jwt-token' }),
    });
    render(<AppIframeHost appUrl="https://app.test" appId="myapp" />);

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
    render(<AppIframeHost appUrl="https://app.test?foo=bar" appId="myapp" />);

    await waitFor(() => {
      const iframe = screen.getByTitle('myapp');
      expect(iframe.getAttribute('src')).toBe(
        'https://app.test?foo=bar&jwt=jwt123',
      );
    });
  });

  /**
   * ETP-4576 — the two cases that lived here asserted a `!token` gate: with no
   * token the component refused to mint the app JWT and rendered "Missing Etendo
   * session token". Under the cookie scheme the client never holds a token, so
   * that gate turned the whole embedded app into a permanent error for every
   * user. Whether the session is valid is the token endpoint's answer to give,
   * which the non-ok and throw cases below already cover.
   *
   * Replaced by its inverse, so removing the gate cannot silently regress: with
   * no token held, the request must still be issued.
   */
  it('still requests the app token when the client holds no bearer', async () => {
    declareCookieSession();
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ token: 'jwt' }) });

    render(<AppIframeHost appUrl="https://app.test" appId="myapp" />);

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
    expectNoAuthorizationHeader();
  });

  it('shows error when fetch fails with non-ok status', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 403,
    });
    render(<AppIframeHost appUrl="https://app.test" appId="myapp" />);

    await waitFor(() => {
      expect(screen.getByText(/token endpoint failed: 403/)).toBeInTheDocument();
    });
  });

  it('shows error when fetch throws', async () => {
    globalThis.fetch.mockRejectedValue(new Error('Network error'));
    render(<AppIframeHost appUrl="https://app.test" appId="myapp" />);

    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
  });

  it('sets sandbox attribute on iframe', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'jwt' }),
    });
    render(<AppIframeHost appUrl="https://app.test" appId="myapp" />);

    await waitFor(() => {
      const iframe = screen.getByTitle('myapp');
      expect(iframe).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');
    });
  });

  // Runs once per scheme: minting the app JWT is an unsafe POST, so it must carry
  // the bearer under one and the CSRF proof under the other. Pinning either here
  // would let a call site that hard-codes one scheme pass while being broken in
  // the other direction — the failure this whole task exists to prevent.
  for (const scheme of [
    { name: 'bearer', declare: declareBearerSession,
      assertCredential: () => { expectBearerHeader(); expectNoCsrfHeader(); } },
    { name: 'cookie', declare: declareCookieSession,
      assertCredential: () => expectNoAuthorizationHeader() },
  ]) {
    it(`calls fetch with the correct URL and the ${scheme.name} credential`, async () => {
      scheme.declare();
      globalThis.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ token: 'jwt' }),
      });
      render(<AppIframeHost appUrl="https://app.test" appId="app42" />);

      await waitFor(() => screen.getByTitle('app42'));

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('appId=app42'),
        expect.objectContaining({ method: 'POST' }),
      );
      scheme.assertCredential();
    });
  }

  it('encodes appId in URL', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'jwt' }),
    });
    render(<AppIframeHost appUrl="https://app.test" appId="app with spaces" />);

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
    render(<AppIframeHost appUrl="https://app.test" appId="x" />);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('https://api.example.com/sws/apps/token'),
        expect.any(Object),
      );
    });
  });
});
