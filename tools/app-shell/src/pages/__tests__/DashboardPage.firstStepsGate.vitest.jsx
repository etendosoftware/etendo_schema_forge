/**
 * ETP-5190 — the one-time post-signup redirect from the dashboard to /first-steps.
 *
 * `FirstStepsContext` is replaced by a fake that keeps the ONE behaviour the gate depends on:
 * `markSeen()` optimistically flips `seen` to true in the same commit that renders the
 * <Navigate>. That is what the latch in `useFirstStepsRedirect` exists for, and a fake that
 * returned a constant `seen` could not catch its absence.
 *
 * `Navigate` is stubbed because the real one renders `null`: there is nothing in the DOM to
 * assert against, in this suite or in a browser. The stub renders its OWN marker element
 * and reads only `to`/`replace` off the props, so what is asserted is the redirect DECISION
 * — never a `data-testid` the page happens to pass through (react-router drops unknown
 * props, so such a prop would be dead weight in the source anyway). In the browser the same
 * decision is observed through the URL; see `e2e/tests/flows/first-steps-onboarding.mocked.spec.js`.
 */
import { useCallback, useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({
    token: 'test-token',
    username: 'testuser',
    logout: () => {},
    windowAccess: {},
    capabilities: { isAdminOrClientAdmin: true },
  }),
}));

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  // Marker owned by this stub, not forwarded from the page — see the header comment.
  Navigate: ({ to, replace }) => (
    <div data-testid="navigate-stub" data-to={to} data-replace={String(!!replace)} />
  ),
}));

vi.mock('@/components/layout/PageMetaContext', () => ({ useSetPageMeta: vi.fn() }));
vi.mock('@/components/CopilotContext', () => ({ useCopilot: () => ({ open: vi.fn() }) }));
vi.mock('@/hooks/useCurrency.jsx', () => ({ useCurrency: () => 'USD' }));
vi.mock('@/hooks/useDashboardData', () => ({
  useDashboardData: () => ({
    kpis: [], revenueTrend: { labels: [], values: [] }, expenseTrend: [],
    topClients: [], pendingTasks: [], recentInvoices: [], bestProducts: [], bestSellers: [],
    pendingAmounts: { collections: 0, payments: 0 }, loading: false,
  }),
}));
vi.mock('@/lib/dashboardNavigation.js', () => ({ resolveDashboardNavigation: vi.fn() }));
vi.mock('@/lib/dashboardNumberFormat.js', () => ({ localeFromUi: () => 'en-US' }));
vi.mock('@/components/dashboard/DashboardDateRangeContext', () => ({
  DashboardDateRangeProvider: ({ children }) => <div data-testid="dashboard-rendered">{children}</div>,
}));
vi.mock('@/components/dashboard/DashboardGreeting', () => ({ DashboardGreeting: () => <div /> }));
vi.mock('@/components/dashboard/PendingTasksRail', () => ({ PendingTasksRail: () => <div /> }));
vi.mock('@/components/dashboard/QuickActionsList', () => ({ QuickActionsList: () => <div /> }));
vi.mock('@/components/dashboard/TopClientsList', () => ({ TopClientsList: () => <div /> }));
vi.mock('@/components/dashboard/FinancialSummaryCard', () => ({ FinancialSummaryCard: () => <div /> }));
vi.mock('@/components/dashboard/RecentSalesList', () => ({ RecentSalesList: () => <div /> }));
vi.mock('@/components/dashboard/CollectionsPaymentsCard', () => ({ CollectionsPaymentsCard: () => <div /> }));
vi.mock('@/components/dashboard/FinancialTrendChart', () => ({ FinancialTrendChart: () => <div /> }));
vi.mock('@/components/dashboard/BestProductsList', () => ({ BestProductsList: () => <div /> }));
vi.mock('@/components/dashboard/DashboardSkeleton', () => ({ DashboardSkeleton: () => <div /> }));
vi.mock('lucide-react', () => ({
  FileText: (props) => <svg {...props} />,
  ShoppingCart: (props) => <svg {...props} />,
  Users: (props) => <svg {...props} />,
  DollarSign: (props) => <svg {...props} />,
  TrendingUp: (props) => <svg {...props} />,
}));

const gate = vi.hoisted(() => ({
  scenario: { loading: true, error: null, seen: false },
  markSeen: vi.fn(),
}));

vi.mock('@/pages/first-steps/FirstStepsContext.jsx', () => ({
  useFirstStepsState: () => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [optimisticSeen, setOptimisticSeen] = useState(false);
    // Stable identity — the gate lists `markSeen` as an effect dependency, so a fresh
    // function each render would refire the effect and make the "exactly once" assertions
    // pass or fail for the wrong reason.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const markSeen = useCallback(async () => {
      gate.markSeen();
      setOptimisticSeen(true);   // the real hook's optimistic flip
      return true;
    }, []);
    return {
      completed: [],
      seen: gate.scenario.seen || optimisticSeen,
      loading: gate.scenario.loading,
      error: gate.scenario.error,
      toggleStep: async () => true,
      markSeen,
    };
  },
}));

import DashboardPage from '../DashboardPage.jsx';

const setScenario = (scenario) => { gate.scenario = scenario; };
const LOADED_UNSEEN = { loading: false, error: null, seen: false };

beforeEach(() => {
  vi.clearAllMocks();
  setScenario({ loading: true, error: null, seen: false });
});

describe('DashboardPage — First Steps gate (ETP-5190)', () => {
  it('redirects to /first-steps and records the visit for a never-seen account', async () => {
    setScenario(LOADED_UNSEEN);
    render(<DashboardPage />);

    const redirect = screen.getByTestId('navigate-stub');
    expect(redirect).toHaveAttribute('data-to', '/first-steps');
    // `replace`, so the dashboard is not left in history for the back button to bounce off.
    expect(redirect).toHaveAttribute('data-replace', 'true');
    expect(screen.queryByTestId('dashboard-rendered')).not.toBeInTheDocument();
    await waitFor(() => expect(gate.markSeen).toHaveBeenCalledTimes(1));
  });

  it('stays on the redirect after markSeen optimistically flips `seen` (the latch)', async () => {
    setScenario(LOADED_UNSEEN);
    render(<DashboardPage />);

    await waitFor(() => expect(gate.markSeen).toHaveBeenCalledTimes(1));
    // The flip re-renders with seen: true. Without the latch the gate would answer "no
    // redirect" one commit later and the user would land back on the dashboard, with the
    // outcome decided by effect ordering.
    await waitFor(() => expect(screen.getByTestId('navigate-stub')).toBeInTheDocument());
    expect(screen.queryByTestId('dashboard-rendered')).not.toBeInTheDocument();
    expect(gate.markSeen).toHaveBeenCalledTimes(1);
  });

  it('records the visit exactly once across unrelated re-renders', async () => {
    setScenario(LOADED_UNSEEN);
    const { rerender } = render(<DashboardPage />);
    await waitFor(() => expect(gate.markSeen).toHaveBeenCalledTimes(1));

    rerender(<DashboardPage />);
    rerender(<DashboardPage apiBaseUrl="/other" />);

    await waitFor(() => expect(screen.getByTestId('navigate-stub')).toBeInTheDocument());
    expect(gate.markSeen).toHaveBeenCalledTimes(1);
  });

  it('renders the dashboard and never records a visit once `seen` is true', async () => {
    setScenario({ loading: false, error: null, seen: true });
    render(<DashboardPage />);

    expect(screen.getByTestId('dashboard-rendered')).toBeInTheDocument();
    expect(screen.queryByTestId('navigate-stub')).not.toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 0));
    expect(gate.markSeen).not.toHaveBeenCalled();
  });

  it('does not redirect while the state is still loading', async () => {
    setScenario({ loading: true, error: null, seen: false });
    render(<DashboardPage />);

    // Redirecting on the default `seen: false` would flash the dashboard away on every visit.
    expect(screen.queryByTestId('navigate-stub')).not.toBeInTheDocument();
    expect(screen.getByTestId('dashboard-rendered')).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 0));
    expect(gate.markSeen).not.toHaveBeenCalled();
  });

  it('does not redirect when the GET failed — `seen` is unknown, not false', async () => {
    setScenario({ loading: false, error: 'load', seen: false });
    render(<DashboardPage />);

    expect(screen.queryByTestId('navigate-stub')).not.toBeInTheDocument();
    expect(screen.getByTestId('dashboard-rendered')).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 0));
    expect(gate.markSeen).not.toHaveBeenCalled();
  });

  it('redirects as soon as the state finishes loading unseen', async () => {
    setScenario({ loading: true, error: null, seen: false });
    const { rerender } = render(<DashboardPage />);
    expect(screen.getByTestId('dashboard-rendered')).toBeInTheDocument();

    setScenario(LOADED_UNSEEN);
    rerender(<DashboardPage />);

    await waitFor(() => expect(screen.getByTestId('navigate-stub')).toBeInTheDocument());
    expect(gate.markSeen).toHaveBeenCalledTimes(1);
  });

  it('does not redirect when loading resolves to an already-seen state', async () => {
    setScenario({ loading: true, error: null, seen: false });
    const { rerender } = render(<DashboardPage />);

    setScenario({ loading: false, error: null, seen: true });
    rerender(<DashboardPage />);

    expect(screen.getByTestId('dashboard-rendered')).toBeInTheDocument();
    expect(screen.queryByTestId('navigate-stub')).not.toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 0));
    expect(gate.markSeen).not.toHaveBeenCalled();
  });
});
