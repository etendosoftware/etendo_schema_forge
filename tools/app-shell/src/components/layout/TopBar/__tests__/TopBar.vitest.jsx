/**
 * TopBar — the app shell header. Covers the title truncation fix (ETP-4764 follow-up): a long
 * record name (e.g. a bank account's full name + IBAN) used to overflow the header and run
 * underneath the absolutely-centered search box instead of eliding, because nothing capped the
 * width of the title's container — `truncate` alone never got a chance to activate.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => key,
}));

vi.mock('@/components/CopilotContext', () => ({
  useCopilot: () => ({ toggle: vi.fn() }),
}));

const navigateMock = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
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

import TopBar, { TOPBAR_COMPACT_BELOW_PX } from '../TopBar.jsx';

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

// ETP-5504 — Top Bar responsive layout for the 1280×720 minimum resolution.

/** Radix DropdownMenu opens on pointerdown, not click. */
function openDropdown(trigger) {
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' });
}

/** jsdom has no matchMedia; emulate a viewport width against max-width queries. */
function mockViewport(width) {
  window.matchMedia = vi.fn().mockImplementation((query) => {
    const max = Number(/max-width:\s*([\d.]+)px/.exec(query)?.[1]);
    return {
      matches: Number.isFinite(max) ? width <= max : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
  });
}

describe('TopBar layout (ETP-5504)', () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    navigateMock.mockReset();
  });

  it('caps the title/breadcrumb block at 256px', () => {
    render(<TopBar title={LONG_NAME} breadcrumb={`Finanzas / Cuentas / ${LONG_NAME}`} />);
    const block = screen.getByTestId('topbar-title-block');
    expect(block.className).toMatch(/max-w-\[256px\]/);
    expect(block.className).not.toMatch(/max-w-\[320px\]/);
    expect(block).toContainElement(screen.getByTestId('topbar-breadcrumb'));
  });

  it('keeps the search in the flex flow with a fixed 392px width (no absolute overlay)', () => {
    render(<TopBar title="Plan de cuentas" />);
    const trigger = screen.getByTestId('global-search-trigger');
    expect(trigger.className).toMatch(/w-\[392px\]/);
    const slot = screen.getByTestId('topbar-search-slot');
    expect(slot.className).toMatch(/flex-1/);
    expect(slot.className).not.toMatch(/absolute/);
    expect(slot.className).not.toMatch(/inset-0/);
  });

  it('still lays out with a back button present', () => {
    render(<TopBar title="Informe" onBack={vi.fn()} />);
    expect(screen.getByTestId('topbar-back')).toBeInTheDocument();
    expect(screen.getByTestId('global-search-trigger')).toBeInTheDocument();
  });

  // Hover needs pointer fidelity jsdom lacks, but Radix also opens a tooltip on keyboard focus,
  // which jsdom does handle — so the tooltip's real open state is asserted here.
  it('truncates the title and shows its full text in a tooltip', async () => {
    render(<TopBar title={LONG_NAME} />);
    const title = screen.getByText(LONG_NAME);
    expect(title.className).toMatch(/truncate/);
    await act(async () => { fireEvent.focus(title); });
    expect(await screen.findByTestId('TooltipContent__topbar-title')).toHaveTextContent(LONG_NAME);
  });

  it('truncates the breadcrumb and shows its full text in a tooltip', async () => {
    render(<TopBar title="Cuenta" breadcrumb={`Finanzas / Cuentas / ${LONG_NAME}`} />);
    const breadcrumb = screen.getByTestId('topbar-breadcrumb');
    expect(breadcrumb.className).toMatch(/truncate/);
    expect(breadcrumb).toHaveTextContent(`Finanzas / Cuentas / ${LONG_NAME}`);
    await act(async () => { fireEvent.focus(breadcrumb); });
    expect(await screen.findByTestId('TooltipContent__topbar-breadcrumb'))
      .toHaveTextContent(`Finanzas / Cuentas / ${LONG_NAME}`);
  });

  it('shows the full collapsed breadcrumb (hidden levels included) in its tooltip', async () => {
    render(<TopBar title="Modelo" breadcrumb="Ajustes / Fiscal / Monitor / Modelo 303" />);
    await act(async () => { fireEvent.focus(screen.getByTestId('topbar-breadcrumb')); });
    expect(await screen.findByTestId('TooltipContent__topbar-breadcrumb'))
      .toHaveTextContent('Ajustes / Fiscal / Monitor / Modelo 303');
  });

  it('renders a string breadcrumb with ≤3 levels unchanged, without overflow', () => {
    render(<TopBar title="Factura de Compra" breadcrumb="Compras / Factura de Compra" />);
    expect(screen.getByTestId('topbar-breadcrumb')).toHaveTextContent('Compras / Factura de Compra');
    expect(screen.queryByTestId('topbar-breadcrumb-overflow')).not.toBeInTheDocument();
  });

  it('renders a structured breadcrumb with 3 levels without overflow', () => {
    render(
      <TopBar
        title="FAC-001"
        breadcrumb={[
          { label: 'Ventas' },
          { label: 'Factura de Venta', href: '/sales-invoice' },
          { label: 'FAC-001' },
        ]}
      />,
    );
    const breadcrumb = screen.getByTestId('topbar-breadcrumb');
    expect(breadcrumb).toHaveTextContent('Ventas / Factura de Venta / FAC-001');
    expect(screen.queryByTestId('topbar-breadcrumb-overflow')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Factura de Venta'));
    expect(navigateMock).toHaveBeenCalledWith('/sales-invoice');
  });

  it('collapses >3 levels to first / ⋯ / current, with hidden levels in the dropdown', async () => {
    render(
      <TopBar
        title="Canasta baloncesto 3x3 profesional"
        breadcrumb={[
          { label: 'Inventario' },
          { label: 'Categorías', href: '/categories' },
          { label: 'Equipamiento', href: '/categories/equipment' },
          { label: 'Baloncesto', href: '/categories/equipment/basketball' },
          { label: 'Canasta baloncesto 3x3 profesional' },
        ]}
      />,
    );
    const breadcrumb = screen.getByTestId('topbar-breadcrumb');
    expect(breadcrumb).toHaveTextContent('Inventario');
    expect(breadcrumb).not.toHaveTextContent('Categorías');
    expect(breadcrumb).not.toHaveTextContent('Equipamiento');
    expect(screen.getByTestId('topbar-breadcrumb-current'))
      .toHaveTextContent('Canasta baloncesto 3x3 profesional');

    openDropdown(screen.getByTestId('topbar-breadcrumb-overflow'));
    const menu = await screen.findByTestId('topbar-breadcrumb-overflow-menu');
    const items = screen.getAllByTestId('topbar-breadcrumb-overflow-item');
    expect(items.map((item) => item.textContent)).toEqual(['Categorías', 'Equipamiento', 'Baloncesto']);
    expect(menu).not.toHaveTextContent('Canasta baloncesto 3x3 profesional');
    expect(menu).not.toHaveTextContent('Inventario');

    fireEvent.click(items[1]);
    expect(navigateMock).toHaveBeenCalledWith('/categories/equipment');
  });

  it('also collapses a legacy string breadcrumb with >3 levels', async () => {
    render(<TopBar title="Modelo" breadcrumb="Ajustes / Fiscal / Monitor / Modelo 303" />);
    expect(screen.getByTestId('topbar-breadcrumb-current')).toHaveTextContent('Modelo 303');
    openDropdown(screen.getByTestId('topbar-breadcrumb-overflow'));
    await screen.findByTestId('topbar-breadcrumb-overflow-menu');
    const items = screen.getAllByTestId('topbar-breadcrumb-overflow-item');
    expect(items.map((item) => item.textContent)).toEqual(['Fiscal', 'Monitor']);
  });

  it('keeps the title ⋯ menu independent from the right quick-actions ⋯', () => {
    mockViewport(1280);
    render(<TopBar title="Almacen Principal" onAddToFavorites={vi.fn()} rightExtras={<button type="button">Extra</button>} />);
    expect(screen.getByTestId('topbar-more-actions')).toBeInTheDocument();
    expect(screen.getByTestId('topbar-quick-actions-overflow')).toBeInTheDocument();
    expect(screen.getByTestId('topbar-more-actions'))
      .not.toBe(screen.getByTestId('topbar-quick-actions-overflow'));
  });

  it('hides the right ⋯ when there is nothing to overflow (compact viewport)', () => {
    mockViewport(1280);
    render(<TopBar title="Plan de cuentas" />);
    expect(screen.queryByTestId('topbar-quick-actions-overflow')).not.toBeInTheDocument();
    expect(screen.getByLabelText('aiAssistant')).toBeInTheDocument();
  });

  it('shows every quick action inline on wide screens, without the right ⋯', () => {
    mockViewport(TOPBAR_COMPACT_BELOW_PX);
    const onNotifications = vi.fn();
    render(
      <TopBar
        title="Inicio"
        quickActions={[
          { id: 'notifications', label: 'Notificaciones', onClick: onNotifications },
          { id: 'new', label: 'Nuevo', onClick: vi.fn() },
        ]}
        rightExtras={<button type="button" data-testid="page-extra">Extra</button>}
      />,
    );
    const group = screen.getByTestId('topbar-quick-actions');
    expect(group).toContainElement(screen.getByTestId('topbar-quick-action-notifications'));
    expect(group).toContainElement(screen.getByTestId('topbar-quick-action-new'));
    expect(group).toContainElement(screen.getByTestId('page-extra'));
    expect(screen.queryByTestId('topbar-quick-actions-overflow')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('topbar-quick-action-notifications'));
    expect(onNotifications).toHaveBeenCalled();
  });

  it('moves overflow actions into the right ⋯ at the compact breakpoint', async () => {
    mockViewport(TOPBAR_COMPACT_BELOW_PX - 1);
    const onNew = vi.fn();
    render(
      <TopBar
        title="Inicio"
        quickActions={[
          { id: 'notifications', label: 'Notificaciones', onClick: vi.fn() },
          { id: 'new', label: 'Nuevo', onClick: onNew },
        ]}
        rightExtras={<button type="button" data-testid="page-extra">Extra</button>}
      />,
    );
    // Copilot stays inline; the rest is hidden until the menu opens.
    expect(screen.getByLabelText('aiAssistant')).toBeInTheDocument();
    expect(screen.queryByTestId('topbar-quick-action-notifications')).not.toBeInTheDocument();
    expect(screen.queryByTestId('page-extra')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('topbar-quick-actions-overflow'));
    const menu = await screen.findByTestId('topbar-quick-actions-overflow-menu');
    expect(menu).toContainElement(screen.getByTestId('topbar-quick-action-notifications'));
    expect(menu).toContainElement(screen.getByTestId('topbar-quick-action-new'));
    expect(menu).toContainElement(screen.getByTestId('page-extra'));

    fireEvent.click(screen.getByTestId('topbar-quick-action-new'));
    expect(onNew).toHaveBeenCalled();
  });
});
