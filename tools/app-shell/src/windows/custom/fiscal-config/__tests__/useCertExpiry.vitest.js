// @covers tools/app-shell/src/windows/custom/fiscal-config/useCertExpiry.js
// @covers tools/app-shell/src/windows/custom/fiscal-config/CertExpiryBanner.jsx
import { createElement } from 'react';
import { renderHook, render, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/components/related-documents/helpers.js', () => ({
  neoBase: (url) => url ?? '',
}));

vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: vi.fn(),
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

import { useCertExpiry } from '../useCertExpiry.js';
import CertExpiryBanner from '../CertExpiryBanner.jsx';
import { useApiFetch } from '@/auth/useApiFetch.js';

function makeApiFetch(body, { ok = true } = {}) {
  return vi.fn(() => Promise.resolve({ ok, json: () => Promise.resolve(body) }));
}

const BASE = 'http://api.test/fiscal-config';
const ORG = 'org-123';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useCertExpiry — mockDaysLeft', () => {
  it('returns mockDaysLeft immediately without fetching', async () => {
    const apiFetch = makeApiFetch({});
    vi.mocked(useApiFetch).mockReturnValue(apiFetch);

    const { result } = renderHook(() =>
      useCertExpiry(BASE, { mockDaysLeft: 42, orgId: ORG }),
    );

    await waitFor(() => expect(result.current.daysLeft).toBe(42));
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('returns a null validTo while a mock is set (the debug override has no real date)', async () => {
    vi.mocked(useApiFetch).mockReturnValue(makeApiFetch({ exists: true, validTo: '2030-01-01' }));
    const { result } = renderHook(() => useCertExpiry(BASE, { mockDaysLeft: 5, orgId: ORG }));
    await waitFor(() => expect(result.current.daysLeft).toBe(5));
    expect(result.current.validTo).toBeNull();
  });

  it('drops a real validTo already loaded when a mock is switched on', async () => {
    vi.mocked(useApiFetch).mockReturnValue(makeApiFetch({ exists: true, validTo: '2030-01-01' }));
    const { result, rerender } = renderHook(
      ({ mock }) => useCertExpiry(BASE, { mockDaysLeft: mock, orgId: ORG }),
      { initialProps: { mock: null } },
    );
    await waitFor(() => expect(result.current.validTo).toBe('2030-01-01'));
    rerender({ mock: 5 });
    await waitFor(() => expect(result.current.daysLeft).toBe(5));
    expect(result.current.validTo).toBeNull();
  });
});

describe('useCertExpiry — guard: missing orgId or apiBaseUrl', () => {
  it('keeps daysLeft null and does not fetch when orgId is null', async () => {
    const apiFetch = makeApiFetch({ exists: true, validTo: '2030-01-01' });
    vi.mocked(useApiFetch).mockReturnValue(apiFetch);

    const { result } = renderHook(() =>
      useCertExpiry(BASE, { orgId: null }),
    );

    await act(async () => {});
    expect(result.current.daysLeft).toBeNull();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('keeps daysLeft null and does not fetch when apiBaseUrl is null', async () => {
    const apiFetch = makeApiFetch({ exists: true, validTo: '2030-01-01' });
    vi.mocked(useApiFetch).mockReturnValue(apiFetch);

    const { result } = renderHook(() =>
      useCertExpiry(null, { orgId: ORG }),
    );

    await act(async () => {});
    expect(result.current.daysLeft).toBeNull();
    expect(apiFetch).not.toHaveBeenCalled();
  });
});

describe('useCertExpiry — fetch with orgId', () => {
  it('fetches /certificate with orgId as query param', async () => {
    const apiFetch = makeApiFetch({ exists: true, validTo: '2030-01-01' });
    vi.mocked(useApiFetch).mockReturnValue(apiFetch);

    renderHook(() => useCertExpiry(BASE, { orgId: ORG }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const url = apiFetch.mock.calls[0][0];
    expect(url).toContain('/certificate?');
    expect(url).toContain(`orgId=${ORG}`);
  });

  it('sets daysLeft when response has exists and validTo', async () => {
    const future = new Date();
    future.setDate(future.getDate() + 30);
    const validTo = future.toISOString().slice(0, 10);

    vi.mocked(useApiFetch).mockReturnValue(makeApiFetch({ exists: true, validTo }));

    const { result } = renderHook(() => useCertExpiry(BASE, { orgId: ORG }));

    await waitFor(() => expect(result.current.daysLeft).not.toBeNull());
    expect(result.current.daysLeft).toBe(30);
  });

  it('sets daysLeft to null when response has exists: false', async () => {
    vi.mocked(useApiFetch).mockReturnValue(makeApiFetch({ exists: false }));

    const { result } = renderHook(() => useCertExpiry(BASE, { orgId: ORG }));

    await act(async () => {});
    expect(result.current.daysLeft).toBeNull();
  });

  it('sets daysLeft to null when response has no validTo', async () => {
    vi.mocked(useApiFetch).mockReturnValue(makeApiFetch({ exists: true }));

    const { result } = renderHook(() => useCertExpiry(BASE, { orgId: ORG }));

    await act(async () => {});
    expect(result.current.daysLeft).toBeNull();
  });
});

describe('useCertExpiry — org change refetch', () => {
  it('refetches when orgId changes and clears stale daysLeft', async () => {
    const future = new Date();
    future.setDate(future.getDate() + 10);
    const validTo = future.toISOString().slice(0, 10);

    const apiFetch = makeApiFetch({ exists: true, validTo });
    vi.mocked(useApiFetch).mockReturnValue(apiFetch);

    const { result, rerender } = renderHook(
      ({ orgId }) => useCertExpiry(BASE, { orgId }),
      { initialProps: { orgId: 'org-A' } },
    );

    await waitFor(() => expect(result.current.daysLeft).not.toBeNull());
    const callsBefore = apiFetch.mock.calls.length;

    rerender({ orgId: 'org-B' });

    await waitFor(() => expect(apiFetch.mock.calls.length).toBeGreaterThan(callsBefore));
    const lastUrl = apiFetch.mock.calls.at(-1)[0];
    expect(lastUrl).toContain('orgId=org-B');
  });
});

// ETP-5831 — the status panel shows the certificate's validTo, and a replaced certificate is
// re-read through refreshKey.
describe('useCertExpiry — validTo and refreshKey (ETP-5831)', () => {
  it('returns the raw validTo of an existing certificate', async () => {
    vi.mocked(useApiFetch).mockReturnValue(makeApiFetch({ exists: true, validTo: '2030-01-01' }));
    const { result } = renderHook(() => useCertExpiry(BASE, { orgId: ORG }));
    await waitFor(() => expect(result.current.validTo).toBe('2030-01-01'));
  });

  it('returns a null validTo when the org has no certificate', async () => {
    vi.mocked(useApiFetch).mockReturnValue(makeApiFetch({ exists: false }));
    const { result } = renderHook(() => useCertExpiry(BASE, { orgId: ORG }));
    await act(async () => {});
    expect(result.current.validTo).toBeNull();
  });

  it('re-reads the certificate when refreshKey changes', async () => {
    const apiFetch = makeApiFetch({ exists: true, validTo: '2030-01-01' });
    vi.mocked(useApiFetch).mockReturnValue(apiFetch);
    const { rerender } = renderHook(({ k }) => useCertExpiry(BASE, { orgId: ORG, refreshKey: k }), { initialProps: { k: 0 } });
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    rerender({ k: 1 });
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
  });
});

// ETP-5831 QA F-2 — a stale certificate must never be shown for another organization, nor kept
// after a failed read.
describe('useCertExpiry — no stale certificate', () => {
  function deferred() {
    let resolve;
    const promise = new Promise(r => { resolve = r; });
    return { promise, resolve };
  }

  it('resets validTo and daysLeft as soon as orgId changes, before the new fetch resolves', async () => {
    const pending = deferred();
    const apiFetch = vi.fn()
      .mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ exists: true, validTo: '2030-01-01' }) }))
      .mockImplementationOnce(() => pending.promise);
    vi.mocked(useApiFetch).mockReturnValue(apiFetch);

    const { result, rerender } = renderHook(({ orgId }) => useCertExpiry(BASE, { orgId }), { initialProps: { orgId: ORG } });
    await waitFor(() => expect(result.current.validTo).toBe('2030-01-01'));

    rerender({ orgId: 'org-other' });
    expect(result.current.validTo).toBeNull();
    expect(result.current.daysLeft).toBeNull();

    await act(async () => { pending.resolve({ ok: true, json: () => Promise.resolve({ exists: true, validTo: '2031-06-30' }) }); });
    await waitFor(() => expect(result.current.validTo).toBe('2031-06-30'));
  });

  it('clears validTo and daysLeft when a refetch fails', async () => {
    const apiFetch = vi.fn()
      .mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ exists: true, validTo: '2030-01-01' }) }))
      .mockImplementationOnce(() => Promise.reject(new Error('network down')));
    vi.mocked(useApiFetch).mockReturnValue(apiFetch);

    const { result, rerender } = renderHook(({ refreshKey }) => useCertExpiry(BASE, { orgId: ORG, refreshKey }), { initialProps: { refreshKey: 0 } });
    await waitFor(() => expect(result.current.validTo).toBe('2030-01-01'));

    rerender({ refreshKey: 1 });
    await act(async () => {});
    expect(result.current.validTo).toBeNull();
    expect(result.current.daysLeft).toBeNull();
  });
});

// ETP-6053 — GET /certificate returns validTo as ISO yyyy-MM-dd, so daysUntil really computes a
// distance and the banner really appears. The hook and the real banner wired as FiscalConfigPage
// wires them, with today pinned (only Date is faked, so waitFor keeps its real timers).
describe('useCertExpiry → CertExpiryBanner (ISO /certificate payload)', () => {
  function CertBanner() {
    const { daysLeft } = useCertExpiry(BASE, { orgId: ORG });
    return createElement('div', { 'data-testid': 'harness', 'data-days-left': String(daysLeft) },
      createElement(CertExpiryBanner, { daysLeft, variant: 'prominent' }));
  }

  async function renderFor(validTo) {
    vi.mocked(useApiFetch).mockReturnValue(makeApiFetch({ exists: true, validTo }));
    render(createElement(CertBanner));
    await waitFor(() => expect(screen.getByTestId('harness')).not.toHaveAttribute('data-days-left', 'null'));
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-10T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a dismissable warning 45 days ahead', async () => {
    await renderFor('2026-12-25');
    expect(screen.getByTestId('harness')).toHaveAttribute('data-days-left', '45');
    expect(screen.getByText('fiscal.cert.expiry.warn.title')).toBeInTheDocument();
    expect(screen.getByTestId('TriangleAlert__15abdc')).toBeInTheDocument();
    expect(screen.getByLabelText('fiscal.cert.expiry.dismiss')).toBeInTheDocument();
  });

  it('shows a critical, non-dismissable banner 15 days ahead', async () => {
    await renderFor('2026-11-25');
    expect(screen.getByTestId('harness')).toHaveAttribute('data-days-left', '15');
    expect(screen.getByText('fiscal.cert.expiry.critical.title')).toBeInTheDocument();
    expect(screen.getByTestId('OctagonAlert__15abdc')).toBeInTheDocument();
    expect(screen.queryByLabelText('fiscal.cert.expiry.dismiss')).not.toBeInTheDocument();
  });

  it('shows the critical "expires today" banner on the expiry day', async () => {
    await renderFor('2026-11-10');
    expect(screen.getByTestId('harness')).toHaveAttribute('data-days-left', '0');
    expect(screen.getByText('fiscal.cert.expiry.today.title')).toBeInTheDocument();
    expect(screen.getByTestId('OctagonAlert__15abdc')).toBeInTheDocument();
    expect(screen.queryByLabelText('fiscal.cert.expiry.dismiss')).not.toBeInTheDocument();
  });

  it('shows the critical "expired" banner for a past validTo', async () => {
    await renderFor('2026-10-29');
    expect(screen.getByTestId('harness')).toHaveAttribute('data-days-left', '-12');
    expect(screen.getByText('fiscal.cert.expiry.expired.title')).toBeInTheDocument();
    expect(screen.getByTestId('OctagonAlert__15abdc')).toBeInTheDocument();
    expect(screen.queryByLabelText('fiscal.cert.expiry.dismiss')).not.toBeInTheDocument();
  });

  it('shows no banner more than 60 days ahead', async () => {
    await renderFor('2027-01-24');
    expect(screen.getByTestId('harness')).toHaveAttribute('data-days-left', '75');
    expect(screen.queryByTestId('TriangleAlert__15abdc')).not.toBeInTheDocument();
    expect(screen.queryByTestId('OctagonAlert__15abdc')).not.toBeInTheDocument();
  });
});
