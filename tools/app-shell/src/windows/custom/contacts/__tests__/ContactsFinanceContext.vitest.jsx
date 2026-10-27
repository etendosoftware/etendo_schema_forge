// @covers tools/app-shell/src/windows/custom/contacts/ContactsFinanceContext.jsx
// Requests go through `useApiFetch` (docs/request-policy.md): it is mocked with one stable
// function, so the provider's callbacks keep their identity across renders.
const { mockApiFetch } = vi.hoisted(() => ({ mockApiFetch: vi.fn() }));
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => mockApiFetch }));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

import { render, screen, act, waitFor } from '@testing-library/react';
import {
  ContactsFinanceProvider,
  useContactsFinance,
  useSyncFinanceRecordId,
  periodToMonths,
} from '../ContactsFinanceContext';

const ok = (data) => ({ ok: true, json: async () => ({ response: { data } }) });

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

const callsTo = (kind) => mockApiFetch.mock.calls.map(([path]) => path).filter((p) => p.startsWith(`/${kind}?`));

describe('ContactsFinanceProvider', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('provides default period of 3M', () => {
    render(<FinanceConsumer />, { wrapper });
    expect(screen.getByTestId('period').textContent).toBe('3M');
  });

  it('provides null stats and trend initially', () => {
    mockApiFetch.mockResolvedValue(ok([]));
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

  it('setRecordId requests bp-stats and bp-trend for that contact through apiFetch', async () => {
    mockApiFetch.mockResolvedValue(ok([]));
    render(<FinanceConsumer />, { wrapper });

    await act(async () => {
      screen.getByText('setRecordId').click();
    });

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.stringContaining('/bp-stats?businessPartnerId=BP1'),
        expect.anything(),
      );
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.stringContaining('/bp-trend?businessPartnerId=BP1'),
        expect.anything(),
      );
    });
  });

  it('asks bp-stats for months=3, then months=6 after setPeriod, without refetching bp-trend', async () => {
    mockApiFetch.mockResolvedValue(ok([]));
    render(<FinanceConsumer />, { wrapper });

    await act(async () => {
      screen.getByText('setRecordId').click();
    });
    await waitFor(() => expect(callsTo('bp-stats')).toHaveLength(1));
    expect(new URLSearchParams(callsTo('bp-stats')[0].split('?')[1]).get('months')).toBe('3');

    await act(async () => {
      screen.getByText('set6M').click();
    });
    await waitFor(() => expect(callsTo('bp-stats')).toHaveLength(2));
    expect(new URLSearchParams(callsTo('bp-stats')[1].split('?')[1]).get('months')).toBe('6');
    expect(callsTo('bp-trend')).toHaveLength(1);
  });

  it('keeps the latest period when an older bp-stats response arrives last', async () => {
    const pending = {};
    mockApiFetch.mockImplementation((path) => {
      if (!path.startsWith('/bp-stats')) return Promise.resolve(ok({ labels: [], revenue: [], expenses: [] }));
      const months = new URLSearchParams(path.split('?')[1]).get('months');
      return new Promise((resolve) => { pending[months] = resolve; });
    });
    render(<FinanceConsumer />, { wrapper });

    await act(async () => {
      screen.getByText('setRecordId').click();
    });
    await act(async () => {
      screen.getByText('set6M').click();
    });
    await waitFor(() => expect(Object.keys(pending).sort()).toEqual(['3', '6']));

    await act(async () => { pending['6'](ok([{ key: 'revenue', value: 6 }])); });
    await waitFor(() => expect(screen.getByTestId('stats').textContent).toContain('"value":6'));

    await act(async () => { pending['3'](ok([{ key: 'revenue', value: 3 }])); });
    expect(screen.getByTestId('stats').textContent).toContain('"value":6');
    expect(screen.getByTestId('stats').textContent).not.toContain('"value":3');
  });

  it('sets stats from bp-stats response', async () => {
    const statsData = [{ key: 'revenue', value: 1000 }];
    mockApiFetch.mockImplementation((path) => Promise.resolve(
      path.startsWith('/bp-stats') ? ok(statsData) : ok({ labels: [], revenue: [], expenses: [] }),
    ));

    render(<FinanceConsumer />, { wrapper });

    await act(async () => {
      screen.getByText('setRecordId').click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('stats').textContent).toBe(JSON.stringify(statsData));
    });
  });

  it('issues one request per KPI when recordId is set', async () => {
    mockApiFetch.mockResolvedValue(ok([]));
    render(<FinanceConsumer />, { wrapper });

    await act(async () => {
      screen.getByText('setRecordId').click();
    });

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledTimes(2);
    });
  });

  it('handles a request error gracefully — stats falls back to empty array', async () => {
    mockApiFetch.mockRejectedValue(new Error('Network error'));
    render(<FinanceConsumer />, { wrapper });

    await act(async () => {
      screen.getByText('setRecordId').click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('stats').textContent).toBe('[]');
    });
  });

  it('does not request anything when recordId is null', async () => {
    mockApiFetch.mockResolvedValue(ok([]));
    render(<FinanceConsumer />, { wrapper });
    await act(async () => {});
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('still fetches KPIs when the bearer token is empty (ETP-4576 cookie mode)', async () => {
    mockApiFetch.mockResolvedValue(ok([]));
    render(
      <ContactsFinanceProvider token={null} apiBaseUrl="/api">
        <FinanceConsumer />
      </ContactsFinanceProvider>,
    );
    await act(async () => {
      screen.getByText('setRecordId').click();
    });
    // Under the cookie credential mode the bearer is empty by design; apiFetch still carries
    // auth via the session cookie, so the KPI load must NOT be gated on the token.
    // bp-stats + bp-trend = 2 requests.
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
  });
});

describe('periodToMonths', () => {
  it.each([
    ['3M', 3],
    ['6M', 6],
    ['1Y', 3],
    [undefined, 3],
  ])('maps %s to %i months', (period, months) => {
    expect(periodToMonths(period)).toBe(months);
  });
});

describe('useContactsFinance', () => {
  it('throws when used outside ContactsFinanceProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<FinanceConsumer />)).toThrow(
      'useContactsFinance must be used inside ContactsFinanceProvider',
    );
    spy.mockRestore();
  });
});

describe('useSyncFinanceRecordId', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue(ok([]));
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
