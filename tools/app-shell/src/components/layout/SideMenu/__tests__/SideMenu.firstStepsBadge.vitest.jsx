/**
 * ETP-5190 — the `x/7` progress badge on the sidebar's First Steps entry.
 *
 * Separate from `SideMenu.vitest.jsx` because this suite needs a real `FirstStepsContext`
 * provider around the menu, and that suite's fixture deliberately renders it bare.
 *
 * The acceptance criterion behind these tests is "the option to open the panel is never
 * hidden": the badge is only ever an ADDITION to the entry, so the assertions pair every badge
 * expectation with the link still being there.
 */
import { render, screen } from '@testing-library/react';

const mockUseLocation = vi.fn(() => ({ pathname: '/dashboard', search: '' }));
vi.mock('react-router-dom', () => ({
  useLocation: () => mockUseLocation(),
  useNavigate: () => vi.fn(),
  NavLink: ({ children, to, className, ...props }) => (
    <a href={to} className={typeof className === 'function' ? '' : className} {...props}>{children}</a>
  ),
}));

vi.mock('@/i18n', () => ({
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ selectedOrg: { name: 'Org' }, user: { name: 'User' }, logout: vi.fn() }),
}));
vi.mock('@/components/layout/FavoritesContext', () => ({
  useFavorites: () => ({ favorites: [] }),
}));
vi.mock('@/lib/flags', () => ({
  useFeatureFlag: () => false,
  PROOF_OF_CONCEPT_MENU: 'proof-of-concept-menu',
  ACCT_PROCESS_MONITOR: 'acct-process-monitor',
}));
vi.mock('@/hooks/useEnvironmentSwitch.js', () => ({
  useEnvironmentSwitch: () => ({
    environments: [], switchTo: vi.fn(), switching: null, currentClientId: undefined,
  }),
}));
vi.mock('@/menu.json', () => ({
  default: { menu: [{ group: 'First Steps', icon: 'ClipboardText', section: 'General', items: [{ name: 'first-steps', label: 'First Steps' }] }] },
}));

vi.mock('@/components/ui/tooltip.jsx', () => ({
  TooltipProvider: ({ children }) => <>{children}</>,
  Tooltip: ({ children }) => <>{children}</>,
  TooltipTrigger: ({ children }) => <>{children}</>,
  TooltipContent: ({ children }) => <span style={{ display: 'none' }}>{children}</span>,
}));
vi.mock('@/components/ui/popover.jsx', async () => {
  const React = await import('react');
  return {
    Popover: ({ children }) => <>{children}</>,
    PopoverTrigger: React.forwardRef(({ children }, ref) => <span ref={ref}>{children}</span>),
    PopoverContent: ({ children }) => <div style={{ display: 'none' }}>{children}</div>,
  };
});
vi.mock('@/components/ui/dropdown-menu.jsx', async () => {
  const React = await import('react');
  return {
    DropdownMenu: ({ children }) => <>{children}</>,
    DropdownMenuTrigger: React.forwardRef(({ children }, ref) => <div ref={ref}>{children}</div>),
    DropdownMenuContent: ({ children }) => <div style={{ display: 'none' }}>{children}</div>,
    DropdownMenuItem: ({ children }) => <div>{children}</div>,
    DropdownMenuLabel: ({ children }) => <div>{children}</div>,
    DropdownMenuSeparator: () => <hr />,
  };
});
vi.mock('@/components/ui/dialog.jsx', () => ({
  Dialog: ({ children, open }) => (open ? <div role="dialog">{children}</div> : null),
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogDescription: ({ children }) => <p>{children}</p>,
  DialogFooter: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <h2>{children}</h2>,
}));
vi.mock('@/components/ui/button.jsx', () => ({
  Button: ({ children, ...props }) => <button {...props}>{children}</button>,
}));
vi.mock('@/components/UserAvatarButton.jsx', () => ({
  UserAvatarButton: () => <div data-testid="user-avatar" />,
}));
// Mirrors SideMenu's own import list. A Proxy does not work here: vitest checks the mock's
// named exports up front and rejects anything it cannot see.
vi.mock('@phosphor-icons/react', () => {
  const iconStub = ({ className }) => <span className={className} />;
  return {
    ClipboardText: iconStub,
    House: iconStub,
    Star: iconStub,
    IdentificationCard: iconStub,
    ShareNetwork: iconStub,
    TrendUp: iconStub,
    Receipt: iconStub,
    Bank: iconStub,
    Package: iconStub,
    Briefcase: iconStub,
    Users: iconStub,
    Presentation: iconStub,
    Plug: iconStub,
    Gear: iconStub,
    Flask: iconStub,
    SquaresFour: iconStub,
    Eye: iconStub,
    FileCode: iconStub,
    Storefront: iconStub,
  };
});

const hook = vi.hoisted(() => ({ value: null }));
vi.mock('@/pages/first-steps/useFirstSteps.js', () => ({
  useFirstSteps: () => hook.value,
}));

// The provider resolves the tenant plan to size the badge denominator. Mocked here so the
// badge's own behaviour is what is under test rather than a `/sws/go/environments` request;
// the plan-dependent denominator itself is covered in FirstStepsContext.vitest.jsx.
const tenantPlan = vi.hoisted(() => ({ plan: 'productive', loading: false }));
vi.mock('@/hooks/useTenantPlan.js', () => ({
  useTenantPlan: () => tenantPlan,
}));

import SideMenu from '../SideMenu.jsx';
import { FirstStepsProvider } from '@/pages/first-steps/FirstStepsContext.jsx';
import { PLAN_PRODUCTIVE, firstStepsTotal } from '@/pages/first-steps/firstStepsConfig.js';

const PRODUCTIVE_TOTAL = firstStepsTotal(PLAN_PRODUCTIVE);

const MENU_GROUPS = [
  { group: 'First Steps', icon: 'ClipboardText', section: 'General', items: [{ name: 'first-steps', label: 'First Steps' }] },
  { group: 'Home', icon: 'Home', section: 'General', items: [{ name: 'dashboard', label: 'Home' }] },
];

function setState({ completed = [], loading = false, error = null } = {}) {
  hook.value = {
    completed, seen: false, loading, error,
    toggleStep: async () => true,
    markSeen: async () => true,
  };
}

function renderMenu({ expanded = true, withProvider = true } = {}) {
  const menu = (
    <SideMenu menuGroups={MENU_GROUPS} expanded={expanded} onToggle={vi.fn()} onHelpClick={vi.fn()} unreadCount={0} />
  );
  return render(withProvider ? <FirstStepsProvider>{menu}</FirstStepsProvider> : menu);
}

beforeEach(() => {
  setState();
  tenantPlan.plan = PLAN_PRODUCTIVE;
  tenantPlan.loading = false;
});

describe('First Steps sidebar badge — the denominator follows the plan', () => {
  it('reads x/5 on a trial, not x/7', () => {
    // The badge must agree with the page. It renders `progress.total`, which the provider
    // sizes from the plan — a hardcoded 7 here would read as two steps permanently missing.
    tenantPlan.plan = 'free';
    setState({ completed: ['company-data'] });
    renderMenu();
    expect(screen.getByTestId('menu-first-steps-progress')).toHaveTextContent('2/5');
  });

  it('shows 5/5 once a trial has ticked everything it can reach', () => {
    tenantPlan.plan = 'free';
    setState({ completed: ['company-data', 'products', 'contacts', 'team'] });
    renderMenu();
    expect(screen.getByTestId('menu-first-steps-progress')).toHaveTextContent('5/5');
    expect(screen.getByTestId('menu-item-first-steps')).toBeInTheDocument();
  });

  it('renders no badge while the plan is still being resolved', () => {
    // Same reason the loading state hides it: a badge that flashed 1/7 and then became 1/5
    // reads as progress lost.
    tenantPlan.plan = null;
    tenantPlan.loading = true;
    setState({ completed: ['company-data'] });
    renderMenu();
    expect(screen.queryByTestId('menu-first-steps-progress')).not.toBeInTheDocument();
  });
});

describe('First Steps sidebar badge — expanded', () => {
  it('shows 1/7 on a fresh account, next to a link that still works', () => {
    renderMenu();
    expect(screen.getByTestId('menu-first-steps-progress')).toHaveTextContent(`1/${PRODUCTIVE_TOTAL}`);
    expect(screen.getByTestId('menu-item-first-steps')).toHaveAttribute('href', '/first-steps');
  });

  it('follows the state as steps are completed', () => {
    setState({ completed: ['company-data', 'invoice-sequence'] });
    renderMenu();
    expect(screen.getByTestId('menu-first-steps-progress')).toHaveTextContent(`3/${PRODUCTIVE_TOTAL}`);
  });

  it('keeps the entry — and the badge — once everything is done', () => {
    // The whole point of the acceptance criterion: at 7/7 the entry must NOT disappear, because
    // that is the only way back in to un-tick a step.
    setState({ completed: ['company-data', 'invoice-sequence', 'fiscal-config', 'products', 'contacts', 'team'] });
    renderMenu();
    expect(screen.getByTestId('menu-first-steps-progress')).toHaveTextContent(`7/${PRODUCTIVE_TOTAL}`);
    expect(screen.getByTestId('menu-item-first-steps')).toBeInTheDocument();
  });

  it('renders no badge while the state is loading', () => {
    // A badge that flashed 1/7 before the real count arrived would read as progress lost.
    setState({ loading: true });
    renderMenu();
    expect(screen.queryByTestId('menu-first-steps-progress')).not.toBeInTheDocument();
    expect(screen.getByTestId('menu-item-first-steps')).toBeInTheDocument();
  });

  it('renders no badge when the state failed to load, but keeps the entry', () => {
    setState({ error: 'load' });
    renderMenu();
    expect(screen.queryByTestId('menu-first-steps-progress')).not.toBeInTheDocument();
    expect(screen.getByTestId('menu-item-first-steps')).toBeInTheDocument();
  });

  it('puts the badge on no other group', () => {
    renderMenu();
    expect(screen.getAllByTestId('menu-first-steps-progress')).toHaveLength(1);
  });

  it('renders nothing at all with no provider above the menu', () => {
    renderMenu({ withProvider: false });
    expect(screen.queryByTestId('menu-first-steps-progress')).not.toBeInTheDocument();
    expect(screen.getByTestId('menu-item-first-steps')).toBeInTheDocument();
  });
});

describe('First Steps sidebar badge — collapsed', () => {
  it('shows the OUTSTANDING count, because x/7 does not fit a 40px tile', () => {
    renderMenu({ expanded: false });
    expect(screen.getByTestId('menu-first-steps-progress-collapsed')).toHaveTextContent('6');
  });

  it('drops to nothing once there is nothing left to do', () => {
    setState({ completed: ['company-data', 'invoice-sequence', 'fiscal-config', 'products', 'contacts', 'team'] });
    renderMenu({ expanded: false });
    expect(screen.queryByTestId('menu-first-steps-progress-collapsed')).not.toBeInTheDocument();
    expect(screen.getByTestId('menu-item-first-steps')).toBeInTheDocument();
  });

  it('never renders the expanded badge in the collapsed rail', () => {
    renderMenu({ expanded: false });
    expect(screen.queryByTestId('menu-first-steps-progress')).not.toBeInTheDocument();
  });
});
