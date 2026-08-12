import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// --- Mocks ----------------------------------------------------------------

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: vi.fn(() => ({
    selectedOrg: { id: 'org-1', name: 'Test Org' },
    selectedRole: { orgList: [{ id: 'org-1', name: 'Test Org' }] },
    selectOrg: vi.fn(),
  })),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn(() => vi.fn()),
}));

vi.mock('@/components/layout/PageMetaContext', () => ({
  useSetPageMeta: vi.fn(),
}));

vi.mock('../useFiscalConfig.js', () => ({
  useFiscalConfig: vi.fn(() => ({
    loading: false,
    error: null,
    profile: 'sii',
    siiRecord: { id: 'sii-1' },
    tbaiRecord: null,
    verifactuRecord: null,
    refetch: vi.fn(),
    createComplementary: vi.fn().mockResolvedValue({ id: 'new-tbai-1' }),
  })),
}));

vi.mock('../../fiscal-monitor/useDebugMode.js', () => ({
  useDebugMode: () => false,
}));

vi.mock('../useCertExpiry.js', () => ({
  useCertExpiry: () => ({ daysLeft: null }),
}));

vi.mock('../fiscalConfig.utils.js', async (importActual) => ({
  ...(await importActual()),
  detectProfile: vi.fn(() => 'sii'),
}));

// Change SIF dialog renders a portal Dialog; stub it out for page-level tests.
// The stub is configurable via `__changeSifDialogBehavior`:
//   - null (default): renders nothing
//   - 'expose-trigger': renders a button that invokes onChanged when clicked,
//     letting tests simulate the dialog completing a deactivation
// This allows specific tests to exercise the page's response to a completed change.
let __changeSifDialogBehavior = null;
vi.mock('../ChangeSifDialog.jsx', async () => {
  const React = await import('react');
  return {
    default: (props) => {
      if (__changeSifDialogBehavior === 'expose-trigger') {
        return React.createElement('button', {
          'data-testid': 'ChangeSifDialog__simulateOnChanged',
          onClick: () => props.onChanged?.(),
        }, 'simulate-onChanged');
      }
      return null;
    },
  };
});

// Section component mocks

vi.mock('../SiiSection.jsx', () => ({
  default: React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({ save: vi.fn().mockResolvedValue(undefined) }));
    return <div data-testid="sii-section" />;
  }),
}));

vi.mock('../TbaiSection.jsx', () => ({
  default: React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({ save: vi.fn().mockResolvedValue(undefined) }));
    return <div data-testid="tbai-section" />;
  }),
}));

vi.mock('../VerifactuSection.jsx', () => ({
  default: React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({ save: vi.fn().mockResolvedValue(undefined) }));
    return <div data-testid="verifactu-section" />;
  }),
}));

vi.mock('../FiscalConfigDebugPanel.jsx', () => ({
  default: () => <div data-testid="debug-panel" />,
}));

vi.mock('../OnboardingWizard.jsx', () => ({
  default: () => <div data-testid="onboarding-wizard" />,
}));

vi.mock('../CertExpiryBanner.jsx', () => ({
  default: () => <div data-testid="cert-expiry-banner" />,
}));

vi.mock('../TabBar.jsx', () => ({
  default: ({ tabs, active, onChange }) => (
    <div data-testid="tab-bar">
      {tabs.map((tab, i) => (
        <button key={i} onClick={() => onChange(i)} data-active={active === i}>{tab}</button>
      ))}
    </div>
  ),
}));

vi.mock('../FiscalOrgDropdown.jsx', () => ({
  default: ({ selectedOrg }) => (
    <div data-testid="org-dropdown">{selectedOrg?.name}</div>
  ),
}));

vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }) => <div data-testid="skeleton" className={className} />,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, variant, className, ...rest }) => (
    <button onClick={onClick} disabled={disabled} className={className} {...rest}>{children}</button>
  ),
}));

vi.mock('lucide-react', () => ({
  Save: () => <svg data-testid="icon-save" />,
  RefreshCw: () => <svg data-testid="icon-refresh" />,
  PlusCircle: () => <svg data-testid="icon-plus-circle" />,
  MoreVertical: () => <svg data-testid="icon-more-vertical" />,
}));

// DropdownMenu: stub out Radix primitives so the content renders only when the
// trigger has been clicked. Uses a React context inside the factory to share
// open/setOpen between Trigger and Content — no portals, no a11y machinery.
vi.mock('@/components/ui/dropdown-menu', async () => {
  const React = await import('react');
  const Ctx = React.createContext({ open: false, toggle: () => {} });

  function DropdownMenu({ children }) {
    const [open, setOpen] = React.useState(false);
    const toggle = React.useCallback(() => setOpen(o => !o), []);
    return (
      <Ctx.Provider value={{ open, toggle }}>
        <div data-dropdown-root="true">{children}</div>
      </Ctx.Provider>
    );
  }

  function DropdownMenuTrigger({ children, asChild }) {
    const { toggle } = React.useContext(Ctx);
    const inner = asChild ? React.Children.only(children) : <button type="button">{children}</button>;
    return React.cloneElement(inner, {
      onClick: (e) => {
        inner.props.onClick?.(e);
        toggle();
      },
    });
  }

  function DropdownMenuContent({ children }) {
    const { open } = React.useContext(Ctx);
    if (!open) return null;
    return <div data-testid="dropdown-menu-content">{children}</div>;
  }

  function DropdownMenuItem({ children, onSelect, disabled, ...rest }) {
    return (
      <div
        role="menuitem"
        tabIndex={disabled ? -1 : 0}
        onClick={disabled ? undefined : onSelect}
        aria-disabled={disabled}
        {...rest}>
        {children}
      </div>
    );
  }

  return { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem };
});

// --- Import under test ----------------------------------------------------

import FiscalConfigPage from '../FiscalConfigPage.jsx';
import { useFiscalConfig } from '../useFiscalConfig.js';
import { useAuth } from '@/auth/AuthContext.jsx';
import { useNavigate } from 'react-router-dom';

// --- Helpers --------------------------------------------------------------

const BASE_PROPS = {
  token: 'test-token',
  apiBaseUrl: '/api',
};

function renderPage(props = {}) {
  return render(<FiscalConfigPage {...BASE_PROPS} {...props} />);
}

// --- Tests ----------------------------------------------------------------

describe('FiscalConfigPage — loading state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      selectedOrg: { id: 'org-1', name: 'Test Org' },
      selectedRole: { orgList: [{ id: 'org-1', name: 'Test Org' }] },
      selectOrg: vi.fn(),
    });
    vi.mocked(useFiscalConfig).mockReturnValue({
      loading: true,
      error: null,
      profile: null,
      siiRecord: null,
      tbaiRecord: null,
      verifactuRecord: null,
      refetch: vi.fn(),
    });
  });

  it('shows loading skeletons when loading is true', () => {
    renderPage();
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
  });

  it('does not show SiiSection while loading', () => {
    renderPage();
    expect(screen.queryByTestId('sii-section')).not.toBeInTheDocument();
  });
});

describe('FiscalConfigPage — error state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      selectedOrg: { id: 'org-1', name: 'Test Org' },
      selectedRole: { orgList: [{ id: 'org-1', name: 'Test Org' }] },
      selectOrg: vi.fn(),
    });
    vi.mocked(useFiscalConfig).mockReturnValue({
      loading: false,
      error: 'Failed to load',
      profile: null,
      siiRecord: null,
      tbaiRecord: null,
      verifactuRecord: null,
      refetch: vi.fn(),
    });
  });

  it('shows error message when error is set', () => {
    renderPage();
    expect(screen.getByText('fiscal.loadError')).toBeInTheDocument();
  });

  it('shows retry button on error', () => {
    renderPage();
    expect(screen.getByText('fiscal.retry')).toBeInTheDocument();
  });

  it('does not show SiiSection on error', () => {
    renderPage();
    expect(screen.queryByTestId('sii-section')).not.toBeInTheDocument();
  });
});

describe('FiscalConfigPage — no org selected', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      selectedOrg: null,
      selectedRole: { orgList: [] },
      selectOrg: vi.fn(),
    });
    vi.mocked(useFiscalConfig).mockReturnValue({
      loading: false,
      error: null,
      profile: null,
      siiRecord: null,
      tbaiRecord: null,
      verifactuRecord: null,
      refetch: vi.fn(),
    });
  });

  it('shows "no org" message when orgId is null', () => {
    renderPage();
    expect(screen.getByText('fiscal.noOrg')).toBeInTheDocument();
  });

  it('does not show SiiSection when no org', () => {
    renderPage();
    expect(screen.queryByTestId('sii-section')).not.toBeInTheDocument();
  });
});

describe('FiscalConfigPage — profile: unconfigured', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      selectedOrg: { id: 'org-1', name: 'Test Org' },
      selectedRole: { orgList: [{ id: 'org-1', name: 'Test Org' }] },
      selectOrg: vi.fn(),
    });
    vi.mocked(useFiscalConfig).mockReturnValue({
      loading: false,
      error: null,
      profile: 'unconfigured',
      siiRecord: null,
      tbaiRecord: null,
      verifactuRecord: null,
      refetch: vi.fn(),
    });
  });

  it('shows OnboardingWizard when profile is "unconfigured"', () => {
    renderPage();
    expect(screen.getByTestId('onboarding-wizard')).toBeInTheDocument();
  });

  it('does not show SiiSection when unconfigured', () => {
    renderPage();
    expect(screen.queryByTestId('sii-section')).not.toBeInTheDocument();
  });
});

describe('FiscalConfigPage — profile: sii', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      selectedOrg: { id: 'org-1', name: 'Test Org' },
      selectedRole: { orgList: [{ id: 'org-1', name: 'Test Org' }] },
      selectOrg: vi.fn(),
    });
    vi.mocked(useFiscalConfig).mockReturnValue({
      loading: false,
      error: null,
      profile: 'sii',
      siiRecord: { id: 'sii-1' },
      tbaiRecord: null,
      verifactuRecord: null,
      refetch: vi.fn(),
    });
  });

  it('shows SiiSection when profile is "sii"', () => {
    renderPage();
    expect(screen.getByTestId('sii-section')).toBeInTheDocument();
  });

  it('does not show TbaiSection for sii profile', () => {
    renderPage();
    expect(screen.queryByTestId('tbai-section')).not.toBeInTheDocument();
  });

  it('does not show VerifactuSection for sii profile', () => {
    renderPage();
    expect(screen.queryByTestId('verifactu-section')).not.toBeInTheDocument();
  });

  it('shows the org bar with cancel and save buttons', () => {
    renderPage();
    expect(screen.getByText('fiscal.cancel')).toBeInTheDocument();
    expect(screen.getByText('fiscal.save')).toBeInTheDocument();
  });

  it('does not show "Add SII" item in the kebab menu when profile is "sii"', () => {
    renderPage();
    // The actionsMenu trigger is rendered (canChangeSif is true for sii profile).
    // Open the dropdown and verify addComplementary is not among the items.
    fireEvent.click(screen.getByTestId('FiscalConfigPage__actionsMenu'));
    expect(screen.queryByTestId('FiscalConfigPage__addComplementary')).not.toBeInTheDocument();
  });
});

describe('FiscalConfigPage — profile: sii-navarra', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      selectedOrg: { id: 'org-1', name: 'Test Org' },
      selectedRole: { orgList: [{ id: 'org-1', name: 'Test Org' }] },
      selectOrg: vi.fn(),
    });
    vi.mocked(useFiscalConfig).mockReturnValue({
      loading: false,
      error: null,
      profile: 'sii-navarra',
      siiRecord: { id: 'sii-1', navarra: 'Y' },
      tbaiRecord: null,
      verifactuRecord: null,
      refetch: vi.fn(),
    });
  });

  it('shows SiiSection when profile is "sii-navarra"', () => {
    renderPage();
    expect(screen.getByTestId('sii-section')).toBeInTheDocument();
  });
});

describe('FiscalConfigPage — profile: verifactu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      selectedOrg: { id: 'org-1', name: 'Test Org' },
      selectedRole: { orgList: [{ id: 'org-1', name: 'Test Org' }] },
      selectOrg: vi.fn(),
    });
    vi.mocked(useFiscalConfig).mockReturnValue({
      loading: false,
      error: null,
      profile: 'verifactu',
      siiRecord: null,
      tbaiRecord: null,
      verifactuRecord: { id: 'ver-1' },
      refetch: vi.fn(),
    });
  });

  it('shows VerifactuSection when profile is "verifactu"', () => {
    renderPage();
    expect(screen.getByTestId('verifactu-section')).toBeInTheDocument();
  });

  it('does not show SiiSection for verifactu profile', () => {
    renderPage();
    expect(screen.queryByTestId('sii-section')).not.toBeInTheDocument();
  });
});

describe('FiscalConfigPage — profile: tbai', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      selectedOrg: { id: 'org-1', name: 'Test Org' },
      selectedRole: { orgList: [{ id: 'org-1', name: 'Test Org' }] },
      selectOrg: vi.fn(),
    });
    vi.mocked(useFiscalConfig).mockReturnValue({
      loading: false,
      error: null,
      profile: 'tbai',
      siiRecord: null,
      tbaiRecord: { id: 'tbai-1' },
      verifactuRecord: null,
      refetch: vi.fn(),
      createComplementary: vi.fn().mockResolvedValue({ id: 'new-sii-1' }),
    });
  });

  it('shows TbaiSection when profile is "tbai"', () => {
    renderPage();
    expect(screen.getByTestId('tbai-section')).toBeInTheDocument();
  });

  it('does not show SiiSection for tbai profile', () => {
    renderPage();
    expect(screen.queryByTestId('sii-section')).not.toBeInTheDocument();
  });

  it('shows "Add SII" item in the kebab menu when profile is "tbai"', () => {
    renderPage();
    // Open the kebab dropdown to expose the menu items.
    fireEvent.click(screen.getByTestId('FiscalConfigPage__actionsMenu'));
    expect(screen.getByTestId('FiscalConfigPage__addComplementary')).toBeInTheDocument();
  });

  it('calls createComplementary when "Add SII" button is clicked', async () => {
    const { useFiscalConfig: mockUseFiscalConfig } = await import('../useFiscalConfig.js');
    const createComplementaryMock = vi.fn().mockResolvedValue({ id: 'new-sii-1' });
    vi.mocked(mockUseFiscalConfig).mockReturnValue({
      loading: false,
      error: null,
      profile: 'tbai',
      siiRecord: null,
      tbaiRecord: { id: 'tbai-1' },
      verifactuRecord: null,
      refetch: vi.fn(),
      createComplementary: createComplementaryMock,
    });
    renderPage();
    // Open the kebab dropdown, then click the menu item.
    fireEvent.click(screen.getByTestId('FiscalConfigPage__actionsMenu'));
    fireEvent.click(screen.getByTestId('FiscalConfigPage__addComplementary'));
    await waitFor(() => {
      expect(createComplementaryMock).toHaveBeenCalledWith('sii', 'org-1');
    });
  });
});

describe('FiscalConfigPage — profile: sii+tbai', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      selectedOrg: { id: 'org-1', name: 'Test Org' },
      selectedRole: { orgList: [{ id: 'org-1', name: 'Test Org' }] },
      selectOrg: vi.fn(),
    });
    vi.mocked(useFiscalConfig).mockReturnValue({
      loading: false,
      error: null,
      profile: 'sii+tbai',
      siiRecord: { id: 'sii-1' },
      tbaiRecord: { id: 'tbai-1' },
      verifactuRecord: null,
      refetch: vi.fn(),
    });
  });

  it('shows TabBar when profile is "sii+tbai"', () => {
    renderPage();
    expect(screen.getByTestId('tab-bar')).toBeInTheDocument();
  });

  it('shows SiiSection on the first tab (active=0) by default', () => {
    renderPage();
    expect(screen.getByTestId('sii-section')).toBeInTheDocument();
  });

  it('shows TbaiSection after switching to second tab', () => {
    renderPage();
    // Click the TBAI tab
    fireEvent.click(screen.getByText('fiscal.tab.tbai'));
    expect(screen.getByTestId('tbai-section')).toBeInTheDocument();
  });

  it('hides SiiSection after switching to TBAI tab', () => {
    renderPage();
    fireEvent.click(screen.getByText('fiscal.tab.tbai'));
    expect(screen.queryByTestId('sii-section')).not.toBeInTheDocument();
  });
});

describe('FiscalConfigPage — profile: conflict', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      selectedOrg: { id: 'org-1', name: 'Test Org' },
      selectedRole: { orgList: [{ id: 'org-1', name: 'Test Org' }] },
      selectOrg: vi.fn(),
    });
    vi.mocked(useFiscalConfig).mockReturnValue({
      loading: false,
      error: null,
      profile: 'conflict',
      siiRecord: { id: 'sii-1' },
      tbaiRecord: null,
      verifactuRecord: { id: 'ver-1' },
      refetch: vi.fn(),
    });
  });

  it('shows conflict title when profile is "conflict"', () => {
    renderPage();
    expect(screen.getByText('fiscal.conflict.title')).toBeInTheDocument();
  });

  it('shows conflict body when profile is "conflict"', () => {
    renderPage();
    expect(screen.getByText('fiscal.conflict.body')).toBeInTheDocument();
  });
});

describe('FiscalConfigPage — cancel button', () => {
  let mockNavigate;

  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate = vi.fn();
    vi.mocked(useNavigate).mockReturnValue(mockNavigate);
    vi.mocked(useAuth).mockReturnValue({
      selectedOrg: { id: 'org-1', name: 'Test Org' },
      selectedRole: { orgList: [{ id: 'org-1', name: 'Test Org' }] },
      selectOrg: vi.fn(),
    });
    vi.mocked(useFiscalConfig).mockReturnValue({
      loading: false,
      error: null,
      profile: 'sii',
      siiRecord: { id: 'sii-1' },
      tbaiRecord: null,
      verifactuRecord: null,
      refetch: vi.fn(),
    });
  });

  it('calls navigate(-1) when cancel button is clicked', () => {
    renderPage();
    fireEvent.click(screen.getByText('fiscal.cancel'));
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });
});

describe('FiscalConfigPage — save button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      selectedOrg: { id: 'org-1', name: 'Test Org' },
      selectedRole: { orgList: [{ id: 'org-1', name: 'Test Org' }] },
      selectOrg: vi.fn(),
    });
    vi.mocked(useFiscalConfig).mockReturnValue({
      loading: false,
      error: null,
      profile: 'sii',
      siiRecord: { id: 'sii-1' },
      tbaiRecord: null,
      verifactuRecord: null,
      refetch: vi.fn(),
    });
  });

  it('the Save button is present and enabled when orgId is set', () => {
    renderPage();
    // Find the Save button (has the icon + save label)
    const saveBtn = screen.getByText('fiscal.save').closest('button');
    expect(saveBtn).not.toBeDisabled();
  });

  it('clicking Save triggers the save flow without throwing', async () => {
    renderPage();
    const saveBtn = screen.getByText('fiscal.save').closest('button');
    fireEvent.click(saveBtn);
    // After save, label becomes "✓ fiscal.save" briefly — just verify no crash
    await waitFor(() => {
      expect(screen.getByText(/fiscal\.save/)).toBeInTheDocument();
    });
  });
});

describe('FiscalConfigPage — save button disabled when no org', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      selectedOrg: null,
      selectedRole: { orgList: [] },
      selectOrg: vi.fn(),
    });
    vi.mocked(useFiscalConfig).mockReturnValue({
      loading: false,
      error: null,
      profile: null,
      siiRecord: null,
      tbaiRecord: null,
      verifactuRecord: null,
      refetch: vi.fn(),
    });
  });

  it('Save button is disabled when orgId is null', () => {
    renderPage();
    const saveBtn = screen.getByText('fiscal.save').closest('button');
    expect(saveBtn).toBeDisabled();
  });
});

describe('FiscalConfigPage — org bar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      selectedOrg: { id: 'org-1', name: 'Test Org' },
      selectedRole: { orgList: [{ id: 'org-1', name: 'Test Org' }] },
      selectOrg: vi.fn(),
    });
    vi.mocked(useFiscalConfig).mockReturnValue({
      loading: false,
      error: null,
      profile: 'sii',
      siiRecord: { id: 'sii-1' },
      tbaiRecord: null,
      verifactuRecord: null,
      refetch: vi.fn(),
    });
  });

  it('renders the org label', () => {
    renderPage();
    expect(screen.getByText('fiscal.onboarding.org.label')).toBeInTheDocument();
  });

  it('renders the OrgDropdown', () => {
    renderPage();
    expect(screen.getByTestId('org-dropdown')).toBeInTheDocument();
  });

  it('renders OrgDropdown showing the selected org name', () => {
    renderPage();
    expect(screen.getByText('Test Org')).toBeInTheDocument();
  });
});

// Reset the stub behavior after every test so it doesn't bleed into neighbours.
afterEach(() => {
  __changeSifDialogBehavior = null;
});

describe('FiscalConfigPage — actions kebab menu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupAuth() {
    vi.mocked(useAuth).mockReturnValue({
      selectedOrg: { id: 'org-1', name: 'Test Org' },
      selectedRole: { orgList: [{ id: 'org-1', name: 'Test Org' }] },
      selectOrg: vi.fn(),
    });
  }

  it('kebab trigger is NOT rendered when profile is "unconfigured" (no actions available)', () => {
    setupAuth();
    vi.mocked(useFiscalConfig).mockReturnValue({
      loading: false,
      error: null,
      profile: 'unconfigured',
      siiRecord: null,
      tbaiRecord: null,
      verifactuRecord: null,
      refetch: vi.fn(),
    });
    renderPage();
    // unconfigured shows the wizard — canAddComplementary and canChangeSif are both false
    expect(screen.queryByTestId('FiscalConfigPage__actionsMenu')).not.toBeInTheDocument();
  });

  it('kebab trigger is NOT rendered when addingComplementary is active (complementary already in progress)', async () => {
    // addingComplementary state is set to 'sii' after clicking "Add SII".
    // We simulate this by using a tbai profile and clicking "Add SII" so that
    // the state transitions — after the click the trigger disappears.
    setupAuth();
    const createComplementary = vi.fn().mockResolvedValue({ id: 'new-sii-1' });
    vi.mocked(useFiscalConfig).mockReturnValue({
      loading: false,
      error: null,
      profile: 'tbai',
      siiRecord: null,
      tbaiRecord: { id: 'tbai-1' },
      verifactuRecord: null,
      refetch: vi.fn(),
      createComplementary,
    });
    renderPage();
    // Trigger is visible initially (canAddComplementary true)
    expect(screen.getByTestId('FiscalConfigPage__actionsMenu')).toBeInTheDocument();
    // Open the kebab and click "Add SII" — sets addingComplementary='sii' after the promise resolves
    fireEvent.click(screen.getByTestId('FiscalConfigPage__actionsMenu'));
    fireEvent.click(screen.getByTestId('FiscalConfigPage__addComplementary'));
    // The condition `!addingComplementary` gates the whole dropdown — wait for the async state update
    await waitFor(() => {
      expect(screen.queryByTestId('FiscalConfigPage__actionsMenu')).not.toBeInTheDocument();
    });
  });

  it('kebab trigger IS rendered when canChangeSif is true (sii profile)', () => {
    setupAuth();
    vi.mocked(useFiscalConfig).mockReturnValue({
      loading: false,
      error: null,
      profile: 'sii',
      siiRecord: { id: 'sii-1' },
      tbaiRecord: null,
      verifactuRecord: null,
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByTestId('FiscalConfigPage__actionsMenu')).toBeInTheDocument();
  });

  it('"Add SII" item is only in the kebab for a TBAI-only profile (not SII)', () => {
    setupAuth();
    vi.mocked(useFiscalConfig).mockReturnValue({
      loading: false,
      error: null,
      profile: 'tbai',
      siiRecord: null,
      tbaiRecord: { id: 'tbai-1' },
      verifactuRecord: null,
      refetch: vi.fn(),
      createComplementary: vi.fn().mockResolvedValue({ id: 'new-sii-1' }),
    });
    renderPage();
    // Open the kebab — addComplementary item must be visible
    fireEvent.click(screen.getByTestId('FiscalConfigPage__actionsMenu'));
    expect(screen.getByTestId('FiscalConfigPage__addComplementary')).toBeInTheDocument();
  });

  it('"Add SII" item is NOT in the kebab for an SII-only profile', () => {
    setupAuth();
    vi.mocked(useFiscalConfig).mockReturnValue({
      loading: false,
      error: null,
      profile: 'sii',
      siiRecord: { id: 'sii-1' },
      tbaiRecord: null,
      verifactuRecord: null,
      refetch: vi.fn(),
    });
    renderPage();
    // Open the kebab — canAddComplementary is false for sii, so the item must be absent
    fireEvent.click(screen.getByTestId('FiscalConfigPage__actionsMenu'));
    expect(screen.queryByTestId('FiscalConfigPage__addComplementary')).not.toBeInTheDocument();
  });
});

describe('FiscalConfigPage — handles deleted:true response from backend', () => {
  // These tests verify the page's behavior when the ChangeSifDialog calls back
  // its onChanged prop after a deactivation that returned { deleted: true }.
  // The page's onChanged is wired to refetch(), which reloads the fiscal config.
  // The key invariant: no error banner appears, and the page transitions cleanly.

  function setupSiiProfile(refetchMock) {
    vi.mocked(useAuth).mockReturnValue({
      selectedOrg: { id: 'org-1', name: 'Test Org' },
      selectedRole: { orgList: [{ id: 'org-1', name: 'Test Org' }] },
      selectOrg: vi.fn(),
    });
    vi.mocked(useFiscalConfig).mockReturnValue({
      loading: false,
      error: null,
      profile: 'sii',
      siiRecord: { id: 'sii-1' },
      tbaiRecord: null,
      verifactuRecord: null,
      refetch: refetchMock,
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    // Enable the configurable stub so the dialog exposes a trigger button
    __changeSifDialogBehavior = 'expose-trigger';
  });

  it('when onChanged fires after a regular success, no error banner appears', async () => {
    const refetch = vi.fn();
    setupSiiProfile(refetch);
    renderPage();

    // Open the "Change SIF" dialog by clicking the kebab trigger
    fireEvent.click(screen.getByTestId('FiscalConfigPage__actionsMenu'));
    fireEvent.click(screen.getByTestId('FiscalConfigPage__changeSif'));

    // The stub dialog renders a trigger button when open — simulate the dialog
    // calling onChanged (what happens after a successful deactivation, whether
    // the backend deleted the record or just set it inactive).
    const trigger = screen.getByTestId('ChangeSifDialog__simulateOnChanged');
    fireEvent.click(trigger);

    // refetch must have been called (proves onChanged → refetch wiring is intact)
    await waitFor(() => expect(refetch).toHaveBeenCalled());

    // No error banner must exist
    expect(screen.queryByTestId('ChangeSifDialog__error')).not.toBeInTheDocument();
    // The page-level save error also must not appear
    expect(screen.queryByText('fiscal.loadError')).not.toBeInTheDocument();
  });

  it('when onChanged fires (deleted:true scenario), refetch is called exactly once', async () => {
    const refetch = vi.fn();
    setupSiiProfile(refetch);
    renderPage();

    fireEvent.click(screen.getByTestId('FiscalConfigPage__actionsMenu'));
    fireEvent.click(screen.getByTestId('FiscalConfigPage__changeSif'));

    const trigger = screen.getByTestId('ChangeSifDialog__simulateOnChanged');
    fireEvent.click(trigger);

    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
  });

  it('when onChanged fires for a verifactu profile, no error banner appears', async () => {
    const refetch = vi.fn();
    vi.mocked(useAuth).mockReturnValue({
      selectedOrg: { id: 'org-1', name: 'Test Org' },
      selectedRole: { orgList: [{ id: 'org-1', name: 'Test Org' }] },
      selectOrg: vi.fn(),
    });
    vi.mocked(useFiscalConfig).mockReturnValue({
      loading: false,
      error: null,
      profile: 'verifactu',
      siiRecord: null,
      tbaiRecord: null,
      verifactuRecord: { id: 'vf-1' },
      refetch,
    });
    renderPage();

    fireEvent.click(screen.getByTestId('FiscalConfigPage__actionsMenu'));
    fireEvent.click(screen.getByTestId('FiscalConfigPage__changeSif'));

    const trigger = screen.getByTestId('ChangeSifDialog__simulateOnChanged');
    fireEvent.click(trigger);

    await waitFor(() => expect(refetch).toHaveBeenCalled());
    expect(screen.queryByTestId('ChangeSifDialog__error')).not.toBeInTheDocument();
    expect(screen.queryByText('fiscal.loadError')).not.toBeInTheDocument();
  });
});
