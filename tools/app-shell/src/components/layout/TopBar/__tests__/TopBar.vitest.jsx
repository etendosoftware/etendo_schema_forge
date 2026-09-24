/**
 * TopBar — the app shell header. Covers the title truncation fix (ETP-4764 follow-up): a long
 * record name (e.g. a bank account's full name + IBAN) used to overflow the header and run
 * underneath the absolutely-centered search box instead of eliding, because nothing capped the
 * width of the title's container — `truncate` alone never got a chance to activate.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => key,
}));

vi.mock('@/components/CopilotContext', () => ({
  useCopilot: () => ({ toggle: vi.fn() }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

// Mutable so the demo-banner tests can move the tenant off the trial. The DEFAULT is the
// active-trial environment every other test in this file renders against, unchanged.
const DEMO_TRIAL_ENV = {
  clientId: 'demo-client',
  plan: 'free',
  trialStartedAt: '2026-09-10T00:00:00Z',
  trialExpiresAt: '2026-09-24T00:00:00Z',
  trialDaysRemaining: 7,
};
const environmentRef = vi.hoisted(() => ({ current: null }));
vi.mock('@/hooks/useEnvironmentSwitch.js', () => ({
  useEnvironmentSwitch: () => ({
    currentClientId: 'demo-client',
    environments: [environmentRef.current],
  }),
}));

// The real hook dynamic-imports EVERY generated contract.json (`import.meta.glob`) and only then
// resolves the scope targets. Under the full suite that resolution routinely overran waitFor's 1s
// default, so this file failed for machine load rather than for behaviour. What the pill actually
// consumes is the resolved target list, which the fixture supplies directly; that the generated
// contracts really declare `vectorSearch.target`, and that /sales-invoice resolves to its own
// window, is covered against the resolvers themselves in src/lib/__tests__/vectorSearchConfig.test.js.
// Two targets, not one, so "the current window" and "every window" stay distinguishable — that is
// the difference between the pill showing and the pill being cleared.
vi.mock('@/hooks/useVectorSearchContracts.js', () => ({
  useVectorSearchContracts: () => ([
    {
      specName: 'sales-invoice',
      contract: {
        frontendContract: { window: { name: 'Sales Invoice', vectorSearch: { target: 'salesinvoice' } } },
      },
    },
    {
      specName: 'purchase-order',
      contract: {
        frontendContract: { window: { name: 'Purchase Order', vectorSearch: { target: 'purchaseorder' } } },
      },
    },
  ]),
}));

import TopBar from '../TopBar.jsx';

const LONG_NAME = 'Banco Santander S.A (Sandbox) - PT50018000354378591102009';

beforeEach(() => {
  environmentRef.current = DEMO_TRIAL_ENV;
});

describe('TopBar title', () => {
  it('shows the active demo trial prominently above the global header', () => {
    render(<TopBar title="Inicio" />);
    const indicator = screen.getByTestId('topbar-demo-trial-indicator');
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveTextContent('environmentDemo');
    expect(indicator).toHaveTextContent('environmentTrialDaysRemaining');
    expect(indicator.querySelector('[style*="width"]')).toBeTruthy();
  });

  it('truncates a long title instead of letting it overflow the header', () => {
    render(<TopBar title={LONG_NAME} />);
    const title = screen.getByText(LONG_NAME);
    expect(title.className).toMatch(/truncate/);
    // The block itself must be capped — truncate has no effect on an unbounded container.
    expect(title.closest('[class*="max-w-"]')).toBeTruthy();
  });

  // The full name is wired as the tooltip's own content — not asserted by actually opening the
  // Radix tooltip on hover: that interaction needs pointer fidelity jsdom doesn't reliably give
  // (confirmed by hand — both fireEvent.mouseEnter and userEvent.hover left it closed after the
  // delay elapsed), which is why no other test in this codebase exercises a Radix tooltip's real
  // open state either. asChild means the trigger renders the title span itself with no wrapper,
  // so getByText only ever finds the one visible instance; this instead reaches into the render
  // tree for the (unmounted-until-open) TooltipContent's own children.
  it('passes the untruncated title to the tooltip content', () => {
    const { container } = render(<TopBar title={LONG_NAME} />);
    const tooltipContent = container.querySelector('[data-testid="TooltipContent__topbar-title"]');
    // Radix Tooltip.Content doesn't mount until open, so this just documents the prop wiring —
    // if this ever starts finding a real node, it should still contain the full name.
    if (tooltipContent) {
      expect(tooltipContent).toHaveTextContent(LONG_NAME);
    }
  });

  it('renders a short title unaffected (no visible truncation in practice)', () => {
    render(<TopBar title="Cuentas" />);
    expect(screen.getByText('Cuentas')).toBeInTheDocument();
  });

  it('shows the current contract target as a removable search scope', async () => {
    window.history.pushState({}, '', '/sales-invoice');
    const scopeEvents = [];
    const recordScopeEvent = (event) => scopeEvents.push(event.detail);
    document.addEventListener('schema-forge:vector-search-scope', recordScopeEvent);

    render(<TopBar title="Sales Invoice" />);
    await waitFor(() => {
      expect(screen.getByTestId('topbar-vector-search-scope')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('topbar-vector-search-scope-clear'));
    expect(screen.queryByTestId('topbar-vector-search-scope')).not.toBeInTheDocument();
    expect(scopeEvents).toContainEqual({
      pathname: '/sales-invoice',
      vectorSearchTarget: null,
    });
    document.removeEventListener('schema-forge:vector-search-scope', recordScopeEvent);
    window.history.pushState({}, '', '/');
  });

  it('clears the scope pill when Backspace is pressed at the start of a non-empty query', async () => {
    window.history.pushState({}, '', '/sales-invoice');
    render(<TopBar title="Sales Invoice" />);
    await waitFor(() => {
      expect(screen.getByTestId('topbar-vector-search-scope')).toBeInTheDocument();
    });

    const input = screen.getByTestId('global-search-input');
    fireEvent.change(input, { target: { value: 'texto largo' } });
    input.setSelectionRange(0, 0);
    fireEvent.keyDown(input, { key: 'Backspace' });

    expect(input).toHaveValue('texto largo');
    expect(screen.queryByTestId('topbar-vector-search-scope')).not.toBeInTheDocument();
    window.history.pushState({}, '', '/');
  });

  it('keeps vector search active after clearing the scope with Backspace', async () => {
    window.history.pushState({}, '', '/sales-invoice');
    const selectionEvents = [];
    const recordSelection = (event) => selectionEvents.push(event.detail);
    document.addEventListener('schema-forge:vector-search-selection', recordSelection);
    render(<TopBar title="Sales Invoice" />);
    await waitFor(() => {
      expect(screen.getByTestId('topbar-vector-search-scope')).toBeInTheDocument();
    });

    const input = screen.getByTestId('global-search-input');
    fireEvent.change(input, { target: { value: 'lentejas' } });
    input.setSelectionRange(0, 0);
    fireEvent.keyDown(input, { key: 'Backspace' });

    const latestSelection = selectionEvents.at(-1);
    expect(latestSelection.targets.length).toBeGreaterThan(0);
    expect(input).toHaveValue('lentejas');
    document.removeEventListener('schema-forge:vector-search-selection', recordSelection);
    window.history.pushState({}, '', '/');
  });
});

describe('TopBar demo banner — fiscal notice and colour (ETP-5364)', () => {
  const banner = () => screen.getByTestId('topbar-demo-trial-indicator');

  it('carries both caveats, after the payment button', () => {
    // The two things a user has to know BEFORE paying: this environment never talks to
    // Hacienda, and going productive carries over only contacts and products. Inside the
    // upgrade flow would be too late — the decision is already made by then.
    render(<TopBar title="Inicio" />);
    const notice = screen.getByTestId('topbar-demo-fiscal-notice');
    expect(notice).toHaveTextContent('environmentDemoFiscalNotice');
    expect(notice).toHaveTextContent('environmentDemoMigrationNotice');

    const ids = [...banner().querySelectorAll('[data-testid]')].map((n) => n.dataset.testid);
    expect(ids.indexOf('topbar-demo-fiscal-notice'))
      .toBeGreaterThan(ids.indexOf('topbar-go-to-payment'));
  });

  it('puts the migration caveat on its own line, below the fiscal one', () => {
    // Two block elements rather than one string with a `\n`: the break is structural, so a
    // translator cannot drop it by losing an escape inside a JSON string.
    render(<TopBar title="Inicio" />);
    const tax = screen.getByTestId('topbar-demo-fiscal-notice-tax');
    const migration = screen.getByTestId('topbar-demo-fiscal-notice-migration');

    expect(tax.tagName).toBe('P');
    expect(migration.tagName).toBe('P');
    expect(tax.nextElementSibling).toBe(migration);
    // Neither sentence carries the other's text, so each line stands on its own.
    expect(tax).not.toHaveTextContent('environmentDemoMigrationNotice');
    expect(migration).not.toHaveTextContent('environmentDemoFiscalNotice');
  });

  it('draws no second link to the upgrade flow inside the notice', () => {
    // "crear un entorno productivo" stays plain prose: the payment button immediately to its
    // left is that link, and two controls with one destination 8px apart read as a mistake.
    render(<TopBar title="Inicio" />);
    const notice = screen.getByTestId('topbar-demo-fiscal-notice');
    expect(notice.querySelector('a, button')).toBeNull();
  });

  it('wraps onto a second line instead of squeezing the rest of the bar', () => {
    // The bar is `flex-wrap`; the notice takes the leftover width with a floor, so a narrow
    // viewport moves it to its own line rather than crushing the days label and the button.
    render(<TopBar title="Inicio" />);
    const notice = screen.getByTestId('topbar-demo-fiscal-notice');
    expect(notice.className).toMatch(/flex-1/);
    expect(notice.className).toMatch(/min-w-/);
    expect(banner().className).toMatch(/flex-wrap/);
  });

  it('is amber, not green', () => {
    // `status-warning` is the only orange trio the core preset defines (bg/foreground/border,
    // light and dark), so the colour change is a token swap and dark mode comes with it.
    render(<TopBar title="Inicio" />);
    expect(banner().className).toMatch(/bg-status-warning/);
    expect(banner().className).toMatch(/border-status-warning-border/);
    expect(banner().className).not.toMatch(/status-success/);
  });

  it('shows nothing at all on a productive environment', () => {
    // The banner is the gate: it never renders outside a trial, which is why the notice needs
    // no plan check of its own.
    environmentRef.current = { ...DEMO_TRIAL_ENV, plan: 'productive' };
    render(<TopBar title="Inicio" />);
    expect(screen.queryByTestId('topbar-demo-trial-indicator')).not.toBeInTheDocument();
    expect(screen.queryByTestId('topbar-demo-fiscal-notice')).not.toBeInTheDocument();
  });

  it('shows nothing when the backend sent no trial metadata', () => {
    environmentRef.current = { clientId: 'demo-client', plan: 'free' };
    render(<TopBar title="Inicio" />);
    expect(screen.queryByTestId('topbar-demo-fiscal-notice')).not.toBeInTheDocument();
  });

  it('keeps the caveat on an expired trial, when it matters most', () => {
    environmentRef.current = { ...DEMO_TRIAL_ENV, trialDaysRemaining: 0 };
    render(<TopBar title="Inicio" />);
    expect(screen.getByTestId('topbar-demo-fiscal-notice')).toBeInTheDocument();
    expect(screen.getByTestId('topbar-demo-trial-indicator'))
      .toHaveTextContent('environmentDemoExpired');
  });
});
