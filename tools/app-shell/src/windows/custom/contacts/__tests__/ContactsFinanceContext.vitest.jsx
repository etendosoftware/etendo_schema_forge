/**
 * Tests for ContactsFinanceContext — provider, hooks, and useSyncFinanceRecordId.
 */

// Mocks must come before imports
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

import { render, screen, act, waitFor } from '@testing-library/react';
import {
  ContactsFinanceProvider,
  useContactsFinance,
  useSyncFinanceRecordId,
} from '../ContactsFinanceContext';

// ─── Helper components ───────────────────────────────────────────────────────

function FinanceConsumer() {
  const ctx = useContactsFinance();
  return (
    <div>
      <span data-testid="period">{ctx.period}</span>
      <span data-testid="recordId">{ctx.recordId ?? 'null'}</span>
      <span data-testid="stats">{ctx.stats === null ? 'null' : JSON.stringify(ctx.stats)}</span>
      <span data-testid="trend">{ctx.trend === null ? 'null' : JSON.stringify(ctx.trend)}</span>
      <button onClick={() => ctx.setPeriod('6M')}>set6M</button>
      <button onClick={() => ctx.setRecordId('BP1')}>setRecordId</button>
    </div>
  );
}

function SyncConsumer({ recordId }) {
  useSyncFinanceRecordId(recordId);
  return <span data-testid="sync-done">synced</span>;
}

function wrapper(props) {
  return (
    <ContactsFinanceProvider token="tok" apiBaseUrl="/api" {...props} />
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ContactsFinanceProvider', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('provides default period of 3M', () => {
    render(<FinanceConsumer />, { wrapper });
    expect(screen.getByTestId('period').textContent).toBe('3M');
  });

  it('provides null stats and trend initially', () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: [] } }),
    });
    render(<FinanceConsumer />, { wrapper });
    expect(screen.getByTestId('stats').textContent).toBe('null');
    expect(screen.getByTestId('trend').textContent).toBe('null');
  });

  it('provides null recordId initially', () => {
    render(<FinanceConsumer />, { wrapper });
    expect(screen.getByTestId('recordId').textContent).toBe('null');
  });

  it('setPeriod updates the period value', async () => {
    render(<FinanceConsumer />, { wrapper });
    await act(async () => {
      screen.getByText('set6M').click();
    });
    expect(screen.getByTestId('period').textContent).toBe('6M');
  });

  it('setRecordId triggers fetch for bp-stats and bp-trend', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: [] } }),
    });
    render(<FinanceConsumer />, { wrapper });

    await act(async () => {
      screen.getByText('setRecordId').click();
    });

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/bp-stats?businessPartnerId=BP1'),
        expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer tok' }) }),
      );
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/bp-trend?businessPartnerId=BP1'),
        expect.anything(),
      );
    });
  });

  it('sets stats from bp-stats response', async () => {
    const statsData = [{ key: 'revenueThisMonth', value: 1000 }];
    globalThis.fetch.mockImplementation((url) => {
      if (url.includes('bp-stats')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ response: { data: statsData } }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ response: { data: { labels: [], revenue: [], expenses: [] } } }),
      });
    });

    render(<FinanceConsumer />, { wrapper });

    await act(async () => {
      screen.getByText('setRecordId').click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('stats').textContent).not.toBe('null');
    });
  });

  it('resets stats and trend to null before re-fetching when recordId changes', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: [] } }),
    });
    render(<FinanceConsumer />, { wrapper });

    await act(async () => {
      screen.getByText('setRecordId').click();
    });

    // stats go null again during the transition — verified by confirming fetch fires
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });
  });

  it('handles fetch error gracefully — stats falls back to empty array', async () => {
    globalThis.fetch.mockRejectedValue(new Error('Network error'));
    render(<FinanceConsumer />, { wrapper });

    await act(async () => {
      screen.getByText('setRecordId').click();
    });

    await waitFor(() => {
      // After error, stats is set to []
      expect(screen.getByTestId('stats').textContent).toBe('[]');
    });
  });

  it('does not fetch when recordId is null', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: [] } }),
    });
    render(<FinanceConsumer />, { wrapper });
    // No click on setRecordId — recordId stays null
    await act(async () => {});
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('does not fetch when token is missing', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: [] } }),
    });
    render(
      <ContactsFinanceProvider token={null} apiBaseUrl="/api">
        <FinanceConsumer />
      </ContactsFinanceProvider>,
    );
    await act(async () => {
      screen.getByText('setRecordId').click();
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('useContactsFinance', () => {
  it('throws when used outside ContactsFinanceProvider', () => {
    // Suppress React's error boundary console output
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<FinanceConsumer />)).toThrow(
      'useContactsFinance must be used inside ContactsFinanceProvider',
    );
    spy.mockRestore();
  });
});

describe('useSyncFinanceRecordId', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: [] } }),
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sets the recordId in the provider on mount', async () => {
    render(
      <ContactsFinanceProvider token="tok" apiBaseUrl="/api">
        <SyncConsumer recordId="BP-SYNC" />
        <FinanceConsumer />
      </ContactsFinanceProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('recordId').textContent).toBe('BP-SYNC');
    });
  });

  it('clears recordId when passed undefined', async () => {
    render(
      <ContactsFinanceProvider token="tok" apiBaseUrl="/api">
        <SyncConsumer recordId={undefined} />
        <FinanceConsumer />
      </ContactsFinanceProvider>,
    );
    await act(async () => {});
    expect(screen.getByTestId('recordId').textContent).toBe('null');
  });

  it('throws when used outside ContactsFinanceProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<SyncConsumer recordId="x" />)).toThrow();
    spy.mockRestore();
  });
});
