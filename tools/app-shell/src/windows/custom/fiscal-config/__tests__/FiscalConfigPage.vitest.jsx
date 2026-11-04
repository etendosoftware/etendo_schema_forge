// @covers tools/app-shell/src/windows/custom/fiscal-config/FiscalConfigPage.jsx
// @covers tools/app-shell/src/windows/custom/fiscal-config/FiscalStatusSummary.jsx
// @covers tools/app-shell/src/windows/custom/fiscal-config/fiscalCatalog.js
// @covers tools/app-shell/src/windows/custom/fiscal-config/fiscalConfig.utils.js
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';

// --- Mocks ----------------------------------------------------------------

// `ui()` returns the key; a test that must see an interpolated value (a server message inside a
// translated sentence) turns `withParams` on, and `ui()` then appends the params' values.
const i18nMode = vi.hoisted(() => ({ withParams: false }));
vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => (i18nMode.withParams && params ? `${key} ${Object.values(params).join(' ')}` : key),
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));

// ETP-6053 — the territory × system rules (and so the "Estado" territory) come from the backend
// catalog; useFiscalCatalog has its own suite. `catalogState.value` is what the hook returns.
const catalogState = vi.hoisted(() => ({ value: null }));
vi.mock('../useFiscalCatalog.js', () => ({
  useFiscalCatalog: vi.fn(() => catalogState.value),
}));

// ETP-5395 Fix 3: FiscalConfigPage is now gated by useWindowAccess — default to 'full' so
// this suite keeps exercising the window as before (mirrors financial-account's own
// ETP-4658 test convention).
vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: vi.fn(() => ({
    selectedOrg: { id: 'org-1', name: 'Test Org' },
    selectedRole: { orgList: [{ id: 'org-1', name: 'Test Org' }] },
    selectOrg: vi.fn(),
  })),
  useWindowAccess: vi.fn(() => 'full'),
  WindowAccessGuard: () => <div data-testid="window-access-guard" />,
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

// `certExpiry.value` lets a test give the page a loaded certificate; `calls` records the
// refreshKey each render asked for (ETP-5831: a replaced certificate re-reads it).
// Section-double saves in call order (ETP-5831 QA F-1).
const sectionSaves = vi.hoisted(() => []);
// Optional per-section save override (e.g. a rejection or a deferred promise); null → resolves.
const sectionSaveImpl = vi.hoisted(() => ({ sii: null }));
const certExpiry = vi.hoisted(() => ({ value: { daysLeft: null, validTo: null }, calls: [] }));
vi.mock('../useCertExpiry.js', () => ({
  useCertExpiry: (apiBaseUrl, opts) => { certExpiry.calls.push(opts); return certExpiry.value; },
}));

vi.mock('../useFiscalTestMode.js', () => ({
  useFiscalTestMode: vi.fn(() => ({ forceTestMode: false })),
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

vi.mock('../SiiSection.jsx', async () => {
  // The real dirty tracking over a one-field form: "edit" makes the section dirty.
  const { useFormDirty } = await import('../useFormDirty.js');
  return { default: React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({ save: () => { sectionSaves.push(['sii']); return sectionSaveImpl.sii ? sectionSaveImpl.sii() : Promise.resolve(); } }));
    const [form, setForm] = React.useState({ value: 'stored' });
    useFormDirty(form, props.onDirtyChange);
    return (
      <div
        data-testid="sii-section"
        data-form={form.value}
        data-locked={String(!!props.locked)}
        data-hide-cert={String(!!props.hideCert)}
        data-cert-refresh-key={String(props.certRefreshKey ?? '')}>
        <button type="button" data-testid="sii-section-cert-uploaded" onClick={() => props.onCertUploaded?.()}>uploaded</button>
        <button type="button" data-testid="sii-section-edit" onClick={() => setForm({ value: 'edited' })}>edit</button>
      </div>
    );
  }) };
});

vi.mock('../TbaiSection.jsx', async () => {
  // The real dirty tracking over a one-field form: "edit" makes the section dirty.
  const { useFormDirty } = await import('../useFormDirty.js');
  return { default: React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({ save: () => { sectionSaves.push(['tbai']); return Promise.resolve(); } }));
    const [form, setForm] = React.useState({ value: 'stored' });
    useFormDirty(form, props.onDirtyChange);
    return (
      <div
        data-testid="tbai-section"
        data-form={form.value}
        data-locked={String(!!props.locked)}
        data-hide-cert={String(!!props.hideCert)}
        data-cert-refresh-key={String(props.certRefreshKey ?? '')}>
        <button type="button" data-testid="tbai-section-cert-uploaded" onClick={() => props.onCertUploaded?.()}>uploaded</button>
        <button type="button" data-testid="tbai-section-edit" onClick={() => setForm({ value: 'edited' })}>edit</button>
      </div>
    );
  }) };
});

vi.mock('../VerifactuSection.jsx', async () => {
  // The real dirty tracking over a one-field form: "edit" makes the section dirty.
  const { useFormDirty } = await import('../useFormDirty.js');
  return { default: React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({ save: vi.fn().mockResolvedValue(undefined) }));
    const [form, setForm] = React.useState({ value: 'stored' });
    useFormDirty(form, props.onDirtyChange);
    return (
      <div
        data-testid="verifactu-section"
        data-locked={String(!!props.locked)}
        data-hide-cert={String(!!props.hideCert)}
        data-cert-refresh-key={String(props.certRefreshKey ?? '')}>
        <button type="button" data-testid="verifactu-section-cert-uploaded" onClick={() => props.onCertUploaded?.()}>uploaded</button>
        <button type="button" data-testid="verifactu-section-edit" onClick={() => setForm({ value: 'edited' })}>edit</button>
      </div>
    );
  }) };
});

vi.mock('../FiscalConfigDebugPanel.jsx', () => ({
  default: () => <div data-testid="debug-panel" />,
}));

vi.mock('../OnboardingWizard.jsx', () => ({
  default: (props) => (
    <div
      data-testid="onboarding-wizard"
      data-force-test-mode={String(!!props.forceTestMode)}>
      <button type="button" data-testid="onboarding-wizard-complete" onClick={() => props.onComplete?.()}>complete</button>
    </div>
  ),
}));

vi.mock('../CertExpiryBanner.jsx', () => ({
  default: () => <div data-testid="cert-expiry-banner" />,
}));

vi.mock('../TabBar.jsx', () => ({
  default: ({ tabs, active, onChange, className }) => (
    <div data-testid="tab-bar" className={className}>
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
  AlertTriangle: () => <svg data-testid="icon-alert-triangle" />,
  X: () => <svg data-testid="icon-x" />,
  Info: () => <svg data-testid="icon-info" />,
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
import { useFiscalTestMode } from '../useFiscalTestMode.js';
import { useAuth, useWindowAccess } from '@/auth/AuthContext.jsx';
import { useNavigate } from 'react-router-dom';
import { hasUnsavedChanges, saveUnsavedChanges } from '@/lib/unsavedChanges.js';
import { deriveConfiguredStatus, buildConfiguredStatusRows } from '../FiscalStatusSummary.jsx';
import { buildTerritories, buildSystems } from '../fiscalCatalog.js';
import { useFiscalCatalog } from '../useFiscalCatalog.js';
import { FISCAL_SYSTEM_CATALOG } from './fiscalSystemCatalog.fixture.js';

// --- Helpers --------------------------------------------------------------

beforeEach(() => {
  catalogState.value = { catalog: FISCAL_SYSTEM_CATALOG, error: null, loading: false };
  i18nMode.withParams = false;
});

const BASE_PROPS = {
  token: 'test-token',
  apiBaseUrl: '/api',
};

function renderPage(props = {}) {
  return render(<FiscalConfigPage {...BASE_PROPS} {...props} />);
}

// --- Tests ----------------------------------------------------------------

// ETP-5395 Fix 3 — before this fix, a 'none' tier still fired the sii/tbai/verifactu-config
// fetches, got a real backend 403, and rendered it raw ("Failed to load ...: HTTP 403" + a
// Retry button that can never help).
describe('FiscalConfigPage — no access (ETP-5395 Fix 3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      selectedOrg: { id: 'org-1', name: 'Test Org' },
      selectedRole: { orgList: [{ id: 'org-1', name: 'Test Org' }] },
      selectOrg: vi.fn(),
    });
    vi.mocked(useWindowAccess).mockReturnValue('none');
    vi.mocked(useFiscalConfig).mockReturnValue({
      loading: false,
      error: 'HTTP 403',
      profile: null,
      siiRecord: null,
      tbaiRecord: null,
      verifactuRecord: null,
      refetch: vi.fn(),
    });
  });

  it('renders WindowAccessGuard instead of the raw error box', () => {
    renderPage();
    expect(screen.getByTestId('window-access-guard')).toBeInTheDocument();
    expect(screen.queryByText('fiscal.loadError')).not.toBeInTheDocument();
  });
});

describe('FiscalConfigPage — loading state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      selectedOrg: { id: 'org-1', name: 'Test Org' },
      selectedRole: { orgList: [{ id: 'org-1', name: 'Test Org' }] },
      selectOrg: vi.fn(),
    });
    vi.mocked(useWindowAccess).mockReturnValue('full');
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

  // ETP-5831 — the org bar has no "Cancelar" any more (it only navigated back).
  it('shows the org bar with the save button and no cancel button', () => {
    renderPage();
    expect(screen.getByText('fiscal.save')).toBeInTheDocument();
    expect(screen.queryByText('fiscal.cancel')).not.toBeInTheDocument();
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

  // ETP-6053 — createComplementary calls the configureFiscalSystem action and throws the server's
  // own message on refusal; the page shows it inside the "could not add" banner.
  it('shows the backend refusal message in the error banner when "Add SII" is refused', async () => {
    i18nMode.withParams = true;
    const createComplementaryMock = vi.fn().mockRejectedValue(new Error('El modo prueba está forzado: no se puede activar SII.'));
    vi.mocked(useFiscalConfig).mockReturnValue({
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
    fireEvent.click(screen.getByTestId('FiscalConfigPage__actionsMenu'));
    fireEvent.click(screen.getByTestId('FiscalConfigPage__addComplementary'));

    const banner = await screen.findByText(
      'fiscal.addComplementary.err.createFailed El modo prueba está forzado: no se puede activar SII.',
    );
    expect(banner).toBeInTheDocument();
    // Refused: no SII section was mounted and the layout stays TicketBAI-only.
    expect(screen.queryByTestId('sii-section')).not.toBeInTheDocument();
    expect(screen.getByTestId('tbai-section')).toBeInTheDocument();
  });

  it('closes the "Add SII" error banner with its dismiss button', async () => {
    vi.mocked(useFiscalConfig).mockReturnValue({
      loading: false,
      error: null,
      profile: 'tbai',
      siiRecord: null,
      tbaiRecord: { id: 'tbai-1' },
      verifactuRecord: null,
      refetch: vi.fn(),
      createComplementary: vi.fn().mockRejectedValue(new Error('refused')),
    });
    renderPage();
    fireEvent.click(screen.getByTestId('FiscalConfigPage__actionsMenu'));
    fireEvent.click(screen.getByTestId('FiscalConfigPage__addComplementary'));

    const banner = await screen.findByText('fiscal.addComplementary.err.createFailed');
    fireEvent.click(banner.parentElement.querySelector('button'));
    expect(screen.queryByText('fiscal.addComplementary.err.createFailed')).not.toBeInTheDocument();
  });
});

describe('FiscalConfigPage — profile: sii+tbai', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sectionSaves.length = 0;
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

  // ETP-5831 QA F-1: the inactive tab is hidden, not unmounted, so its unsaved edits survive.
  it('hides SiiSection after switching to TBAI tab (still mounted)', () => {
    renderPage();
    fireEvent.click(screen.getByText('fiscal.tab.tbai'));
    expect(screen.getByTestId('FiscalConfigPage__siiPane')).toHaveAttribute('hidden');
    expect(screen.getByTestId('FiscalConfigPage__tbaiPane')).not.toHaveAttribute('hidden');
  });

  it('keeps an SII edit across a switch to TicketBAI and back, with Save enabled on the other tab', () => {
    renderPage();
    const saveBtn = () => screen.getByText(/fiscal\.save/).closest('button');
    fireEvent.click(screen.getByTestId('sii-section-edit'));
    fireEvent.click(screen.getByText('fiscal.tab.tbai'));
    expect(saveBtn()).not.toBeDisabled();
    fireEvent.click(screen.getByText('fiscal.tab.sii'));
    expect(screen.getByTestId('sii-section')).toHaveAttribute('data-form', 'edited');
    expect(saveBtn()).not.toBeDisabled();
  });

  it('keeps the unsaved-changes guard active when only the hidden tab is dirty', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('sii-section-edit'));
    fireEvent.click(screen.getByText('fiscal.tab.tbai'));
    expect(hasUnsavedChanges()).toBe(true);
  });

  it('shows the certificate block in the visible tab only', () => {
    renderPage();
    expect(screen.getByTestId('sii-section')).toHaveAttribute('data-hide-cert', 'false');
    expect(screen.getByTestId('tbai-section')).toHaveAttribute('data-hide-cert', 'true');
    fireEvent.click(screen.getByText('fiscal.tab.tbai'));
    expect(screen.getByTestId('sii-section')).toHaveAttribute('data-hide-cert', 'true');
    expect(screen.getByTestId('tbai-section')).toHaveAttribute('data-hide-cert', 'false');
  });

  it('a save with both tabs dirty saves both, and both reset clean afterwards', async () => {
    renderPage();
    const saveBtn = () => screen.getByText(/fiscal\.save/).closest('button');
    fireEvent.click(screen.getByTestId('sii-section-edit'));
    fireEvent.click(screen.getByText('fiscal.tab.tbai'));
    fireEvent.click(screen.getByTestId('tbai-section-edit'));
    fireEvent.click(saveBtn());
    await waitFor(() => expect(sectionSaves.map(([label]) => label)).toEqual(['sii', 'tbai']));
    await waitFor(() => expect(saveBtn()).toBeDisabled());
    expect(hasUnsavedChanges()).toBe(false);
    expect(screen.getByTestId('sii-section')).toHaveAttribute('data-form', 'stored');
    expect(screen.getByTestId('tbai-section')).toHaveAttribute('data-form', 'stored');
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

  // ETP-5831 — "Guardar" is enabled only while a section has unsaved changes.
  it('the Save button is disabled while nothing has changed', () => {
    renderPage();
    const saveBtn = screen.getByText('fiscal.save').closest('button');
    expect(saveBtn).toBeDisabled();
  });

  it('enables Save once a section has unsaved changes, and disables it again after a successful save', async () => {
    renderPage();
    const saveBtn = () => screen.getByText(/fiscal\.save/).closest('button');
    fireEvent.click(screen.getByTestId('sii-section-edit'));
    expect(saveBtn()).not.toBeDisabled();

    fireEvent.click(saveBtn());
    // The sections remount after the save (resetKey) and report themselves clean.
    await waitFor(() => expect(saveBtn()).toBeDisabled());
  });

  it('clicking Save triggers the save flow without throwing', async () => {
    renderPage();
    fireEvent.click(screen.getByTestId('sii-section-edit'));
    const saveBtn = screen.getByText('fiscal.save').closest('button');
    fireEvent.click(saveBtn);
    // After save, label becomes "✓ fiscal.save" briefly — just verify no crash
    await waitFor(() => {
      expect(screen.getByText(/fiscal\.save/)).toBeInTheDocument();
    });
  });
});

// ETP-5831 — the page feeds its dirty flag into the shared unsaved-changes registry
// (useUnsavedChangesGuard), which drives the in-app navigation prompt and `beforeunload`.
describe('FiscalConfigPage — unsaved-changes guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      selectedOrg: { id: 'org-1', name: 'Test Org' },
      selectedRole: { orgList: [{ id: 'org-1', name: 'Test Org' }] },
      selectOrg: vi.fn(),
    });
    vi.mocked(useFiscalConfig).mockReturnValue({
      loading: false, error: null, profile: 'sii',
      siiRecord: { id: 'sii-1' }, tbaiRecord: null, verifactuRecord: null, refetch: vi.fn(),
    });
  });

  it('is inactive while the form is clean and active once a section is edited', () => {
    renderPage();
    expect(hasUnsavedChanges()).toBe(false);
    fireEvent.click(screen.getByTestId('sii-section-edit'));
    expect(hasUnsavedChanges()).toBe(true);
  });

  it('is inactive again after a successful save', async () => {
    renderPage();
    fireEvent.click(screen.getByTestId('sii-section-edit'));
    expect(hasUnsavedChanges()).toBe(true);
    fireEvent.click(screen.getByText(/fiscal\.save/).closest('button'));
    await waitFor(() => expect(hasUnsavedChanges()).toBe(false));
  });

  it('offers "save and continue" through the page save', async () => {
    renderPage();
    fireEvent.click(screen.getByTestId('sii-section-edit'));
    let saved;
    await act(async () => { saved = await saveUnsavedChanges(); });
    expect(saved).toBe(true);
    await waitFor(() => expect(hasUnsavedChanges()).toBe(false));
  });

  // A failed save must keep the guard on — otherwise "Save and continue" would navigate away
  // and drop the edits the server just refused.
  describe('when the save fails', () => {
    afterEach(() => { sectionSaveImpl.sii = null; });

    it('"save and continue" resolves false when the section save rejects, and the registry stays dirty', async () => {
      sectionSaveImpl.sii = () => Promise.reject(new Error('Backend refused the SII config'));
      renderPage();
      fireEvent.click(screen.getByTestId('sii-section-edit'));
      let saved;
      await act(async () => { saved = await saveUnsavedChanges(); });
      expect(saved).toBe(false);
      expect(hasUnsavedChanges()).toBe(true);
      expect(screen.getByTestId('sii-section')).toHaveAttribute('data-form', 'edited');
      expect(screen.getByText('Backend refused the SII config')).toBeInTheDocument();
    });

    it('a rejection the section already reported (_sectionHandled) shows no page error banner but still resolves false', async () => {
      sectionSaveImpl.sii = () => Promise.reject(Object.assign(new Error('Shown by the section'), { _sectionHandled: true }));
      renderPage();
      fireEvent.click(screen.getByTestId('sii-section-edit'));
      let saved;
      await act(async () => { saved = await saveUnsavedChanges(); });
      expect(saved).toBe(false);
      expect(screen.queryByText('Shown by the section')).not.toBeInTheDocument();
      expect(hasUnsavedChanges()).toBe(true);
    });

    it('is inactive while a save is in flight', async () => {
      let resolveSave;
      sectionSaveImpl.sii = () => new Promise((resolve) => { resolveSave = resolve; });
      renderPage();
      fireEvent.click(screen.getByTestId('sii-section-edit'));
      expect(hasUnsavedChanges()).toBe(true);
      let pending;
      await act(async () => { pending = saveUnsavedChanges(); });
      expect(screen.getByText('fiscal.saving')).toBeInTheDocument();
      expect(hasUnsavedChanges()).toBe(false);
      let saved;
      await act(async () => { resolveSave(); saved = await pending; });
      expect(saved).toBe(true);
      await waitFor(() => expect(hasUnsavedChanges()).toBe(false));
    });
  });

  it('releases the registry entry on unmount', () => {
    const { unmount } = renderPage();
    fireEvent.click(screen.getByTestId('sii-section-edit'));
    unmount();
    expect(hasUnsavedChanges()).toBe(false);
  });

  it('is inactive during the onboarding wizard', () => {
    vi.mocked(useFiscalConfig).mockReturnValue({
      loading: false, error: null, profile: 'unconfigured',
      siiRecord: null, tbaiRecord: null, verifactuRecord: null, refetch: vi.fn(),
    });
    renderPage();
    expect(hasUnsavedChanges()).toBe(false);
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

  // ETP-5831 — adding a complementary SIF must be finishable with "Guardar" even with no field
  // edited: the save is what closes the "adding" state.
  it('enables Save while a complementary SIF is being added, even with no field edited', async () => {
    setupAuth();
    vi.mocked(useFiscalConfig).mockReturnValue({
      loading: false, error: null, profile: 'tbai',
      siiRecord: null, tbaiRecord: { id: 'tbai-1' }, verifactuRecord: null,
      refetch: vi.fn(), createComplementary: vi.fn().mockResolvedValue({ id: 'new-sii-1' }),
    });
    renderPage();
    expect(screen.getByText('fiscal.save').closest('button')).toBeDisabled();
    fireEvent.click(screen.getByTestId('FiscalConfigPage__actionsMenu'));
    fireEvent.click(screen.getByTestId('FiscalConfigPage__addComplementary'));
    await waitFor(() => expect(screen.getByText('fiscal.save').closest('button')).not.toBeDisabled());
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

// ETP-5272 — AD_Preference "Fuerza SII/TicketBAI/VeriFactu a modo prueba":
// GET /sws/neo/fiscal-test-mode → { forceTestMode }. When true, the window
// must lock its editable sections and show a warning banner; the page must
// behave exactly as before when false or when the check fails (fail-open).
describe('FiscalConfigPage — forceTestMode (ETP-5272)', () => {
  function setupSiiProfile() {
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
  }

  beforeEach(() => {
    vi.clearAllMocks();
    setupSiiProfile();
  });

  it('shows the test-mode warning banner when forceTestMode is true', () => {
    vi.mocked(useFiscalTestMode).mockReturnValue({ forceTestMode: true });
    renderPage();
    expect(screen.getByTestId('FiscalConfigPage__testModeBanner')).toBeInTheDocument();
    expect(screen.getByText('fiscal.testModeLock.warning')).toBeInTheDocument();
  });

  it('does not show the test-mode banner when forceTestMode is false', () => {
    vi.mocked(useFiscalTestMode).mockReturnValue({ forceTestMode: false });
    renderPage();
    expect(screen.queryByTestId('FiscalConfigPage__testModeBanner')).not.toBeInTheDocument();
  });

  it('disables the page Save button when forceTestMode is true', () => {
    vi.mocked(useFiscalTestMode).mockReturnValue({ forceTestMode: true });
    renderPage();
    const saveBtn = screen.getByText('fiscal.save').closest('button');
    expect(saveBtn).toBeDisabled();
  });

  it('re-enables the page Save button when forceTestMode is false (no regression)', () => {
    vi.mocked(useFiscalTestMode).mockReturnValue({ forceTestMode: false });
    renderPage();
    fireEvent.click(screen.getByTestId('sii-section-edit'));
    const saveBtn = screen.getByText('fiscal.save').closest('button');
    expect(saveBtn).not.toBeDisabled();
  });

  it('passes locked=true down to SiiSection when forceTestMode is true', () => {
    vi.mocked(useFiscalTestMode).mockReturnValue({ forceTestMode: true });
    renderPage();
    expect(screen.getByTestId('sii-section')).toHaveAttribute('data-locked', 'true');
  });

  it('passes locked=false down to SiiSection when forceTestMode is false', () => {
    vi.mocked(useFiscalTestMode).mockReturnValue({ forceTestMode: false });
    renderPage();
    expect(screen.getByTestId('sii-section')).toHaveAttribute('data-locked', 'false');
  });

  it('passes locked=true down to TbaiSection when forceTestMode is true', () => {
    vi.mocked(useFiscalTestMode).mockReturnValue({ forceTestMode: true });
    vi.mocked(useFiscalConfig).mockReturnValue({
      loading: false,
      error: null,
      profile: 'tbai',
      siiRecord: null,
      tbaiRecord: { id: 'tbai-1' },
      verifactuRecord: null,
      refetch: vi.fn(),
      createComplementary: vi.fn(),
    });
    renderPage();
    expect(screen.getByTestId('tbai-section')).toHaveAttribute('data-locked', 'true');
  });

  it('passes locked=true down to VerifactuSection when forceTestMode is true', () => {
    vi.mocked(useFiscalTestMode).mockReturnValue({ forceTestMode: true });
    vi.mocked(useFiscalConfig).mockReturnValue({
      loading: false,
      error: null,
      profile: 'verifactu',
      siiRecord: null,
      tbaiRecord: null,
      verifactuRecord: { id: 'ver-1' },
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByTestId('verifactu-section')).toHaveAttribute('data-locked', 'true');
  });

  it('does NOT show the "Add SII" kebab item when forceTestMode is true (no new activation)', () => {
    vi.mocked(useFiscalTestMode).mockReturnValue({ forceTestMode: true });
    vi.mocked(useFiscalConfig).mockReturnValue({
      loading: false,
      error: null,
      profile: 'tbai',
      siiRecord: null,
      tbaiRecord: { id: 'tbai-1' },
      verifactuRecord: null,
      refetch: vi.fn(),
      createComplementary: vi.fn(),
    });
    renderPage();
    // canChangeSif is still true for 'tbai', so the kebab itself renders —
    // only the "Add SII" item must be gone.
    fireEvent.click(screen.getByTestId('FiscalConfigPage__actionsMenu'));
    expect(screen.queryByTestId('FiscalConfigPage__addComplementary')).not.toBeInTheDocument();
  });

  it('does not render its own top-level banner in the "unconfigured" (wizard) state — the wizard renders its own', () => {
    // FiscalConfigPage.testModeBanner belongs to the configured-profile branch;
    // the 'unconfigured' profile takes the early-return wizard branch instead,
    // which never mounts that banner markup. This does NOT mean the wizard is
    // unlocked — see the next test: forceTestMode is forwarded as a prop, and
    // OnboardingWizard renders its own equivalent banner/lock (ETP-5272 follow-up).
    vi.mocked(useFiscalTestMode).mockReturnValue({ forceTestMode: true });
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
    expect(screen.getByTestId('onboarding-wizard')).toBeInTheDocument();
    expect(screen.queryByTestId('FiscalConfigPage__testModeBanner')).not.toBeInTheDocument();
  });

  it('forwards forceTestMode=true to OnboardingWizard in the "unconfigured" state (ETP-5272 follow-up)', () => {
    vi.mocked(useFiscalTestMode).mockReturnValue({ forceTestMode: true });
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
    expect(screen.getByTestId('onboarding-wizard')).toHaveAttribute('data-force-test-mode', 'true');
  });

  it('forwards forceTestMode=false to OnboardingWizard in the "unconfigured" state (no regression)', () => {
    vi.mocked(useFiscalTestMode).mockReturnValue({ forceTestMode: false });
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
    expect(screen.getByTestId('onboarding-wizard')).toHaveAttribute('data-force-test-mode', 'false');
  });
});

// ---------------------------------------------------------------------------
// ETP-5831 — shared certificate in the SII and TicketBAI tabs, and the "Estado" panel
// ---------------------------------------------------------------------------

function mockConfig(overrides) {
  vi.mocked(useAuth).mockReturnValue({
    selectedOrg: { id: 'org-1', name: 'Test Org' },
    selectedRole: { orgList: [{ id: 'org-1', name: 'Test Org' }] },
    selectOrg: vi.fn(),
  });
  vi.mocked(useWindowAccess).mockReturnValue('full');
  vi.mocked(useFiscalConfig).mockReturnValue({
    loading: false, error: null, profile: 'unconfigured',
    siiRecord: null, tbaiRecord: null, verifactuRecord: null,
    refetch: vi.fn(), createComplementary: vi.fn(),
    ...overrides,
  });
}

const SII_REC = { id: 'sii-1', entornoDeProduccin: 'Y', created: '2026-11-02T11:08:00+01:00', taxtype: 'IVA' };
const TBAI_REC = { id: 'tbai-1', productionEnv: 'Y', etsgSifTerritory: 'GIPUZKOA', created: '2026-11-02T11:08:00+01:00' };

describe('FiscalConfigPage — certificate in both SII and TicketBAI tabs (ETP-5831 A)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    certExpiry.value = { daysLeft: 200, validTo: '2027-07-01' };
    certExpiry.calls = [];
    mockConfig({ profile: 'sii+tbai', siiRecord: SII_REC, tbaiRecord: TBAI_REC });
  });

  it('shows the certificate block in the TicketBAI tab too (the org has one shared certificate)', () => {
    renderPage();
    expect(screen.getByTestId('sii-section')).toHaveAttribute('data-hide-cert', 'false');
    fireEvent.click(screen.getByText('fiscal.tab.tbai'));
    expect(screen.getByTestId('tbai-section')).toHaveAttribute('data-hide-cert', 'false');
  });

  it('a certificate replaced from one tab refreshes the other tab, the expiry banner and the status panel', () => {
    renderPage();
    expect(screen.getByTestId('sii-section')).toHaveAttribute('data-cert-refresh-key', '0');
    fireEvent.click(screen.getByTestId('sii-section-cert-uploaded'));

    fireEvent.click(screen.getByText('fiscal.tab.tbai'));
    expect(screen.getByTestId('tbai-section')).toHaveAttribute('data-cert-refresh-key', '1');
    expect(certExpiry.calls.at(-1)).toMatchObject({ orgId: 'org-1', refreshKey: 1 });

    fireEvent.click(screen.getByTestId('tbai-section-cert-uploaded'));
    fireEvent.click(screen.getByText('fiscal.tab.sii'));
    expect(screen.getByTestId('sii-section')).toHaveAttribute('data-cert-refresh-key', '2');
  });
});

describe('FiscalConfigPage — "Estado" status panel on load (ETP-5831 B)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    certExpiry.value = { daysLeft: 200, validTo: '2027-07-01' };
    certExpiry.calls = [];
  });

  it('renders the status panel on opening the window when the org already has SII + TicketBAI', () => {
    mockConfig({ profile: 'sii+tbai', siiRecord: SII_REC, tbaiRecord: TBAI_REC });
    renderPage();

    const panel = screen.getByTestId('FiscalStatusSummary__panel');
    expect(panel).toHaveTextContent('fiscal.status.title');
    expect(screen.getByTestId('FiscalStatusSummary__envBadge')).toHaveTextContent('fiscal.onboarding.applied.env.production');
    expect(screen.getByTestId('FiscalStatusSummary__title')).toHaveTextContent('fiscal.status.active');
    expect(panel).toHaveTextContent('fiscal.status.body');
    expect(screen.getByTestId('FiscalStatusSummary__row-territory')).toHaveTextContent('fiscal.territory.gipuzkoa');
    expect(screen.getByTestId('FiscalStatusSummary__row-tax')).toHaveTextContent('fiscal.territory.gipuzkoa.systemLong');
    expect(screen.getByTestId('FiscalStatusSummary__row-national')).toHaveTextContent('fiscal.onboarding.applied.national.active');
    expect(screen.getByTestId('FiscalStatusSummary__row-cert')).toHaveTextContent('fiscal.cert.validUntil');
    expect(screen.getByTestId('FiscalStatusSummary__row-activated')).toBeInTheDocument();
    // No submission-history link in the panel.
    expect(panel.querySelector('a')).toBeNull();
  });

  // Layout (ETP-5831): the SII | TicketBAI switch is the first thing in the form column, so the
  // panel beside it starts level with the switch; the panel is a 360px column from `xl` and
  // stacks full-width below it.
  it('puts the SII | TicketBAI switch inside the form column, beside the status panel', () => {
    mockConfig({ profile: 'sii+tbai', siiRecord: SII_REC, tbaiRecord: TBAI_REC });
    renderPage();
    const formColumn = screen.getByTestId('FiscalConfigPage__formColumn');
    const statusColumn = screen.getByTestId('FiscalConfigPage__statusColumn');
    expect(formColumn.firstElementChild).toBe(screen.getByTestId('tab-bar'));
    expect(formColumn.parentElement).toBe(statusColumn.parentElement);
  });

  it('keeps the panel level with the form content when there is no tab switch', () => {
    mockConfig({ profile: 'sii', siiRecord: SII_REC });
    renderPage();
    expect(screen.queryByTestId('tab-bar')).not.toBeInTheDocument();
    expect(screen.getByTestId('FiscalConfigPage__formColumn').firstElementChild).toBe(screen.getByTestId('sii-section'));
  });

  it('is a 360px column from xl and stacks full-width under the form below it', () => {
    mockConfig({ profile: 'sii', siiRecord: SII_REC });
    renderPage();
    const statusColumn = screen.getByTestId('FiscalConfigPage__statusColumn');
    expect(statusColumn.className.split(/\s+/)).toEqual(expect.arrayContaining(['w-full', 'xl:w-[360px]']));
    expect(statusColumn.parentElement.className.split(/\s+/)).toEqual(expect.arrayContaining(['flex-col', 'xl:flex-row']));
  });

  it('stays visible after switching between the SII and TicketBAI tabs', () => {
    mockConfig({ profile: 'sii+tbai', siiRecord: SII_REC, tbaiRecord: TBAI_REC });
    renderPage();
    fireEvent.click(screen.getByText('fiscal.tab.tbai'));
    expect(screen.getByTestId('FiscalStatusSummary__panel')).toBeInTheDocument();
  });

  it.each([
    ['sii', { siiRecord: SII_REC }, ['territory', 'tax', 'cert', 'activated'], ['national']],
    ['sii-navarra', { siiRecord: { ...SII_REC, navarra: 'Y' } }, ['territory', 'tax', 'cert'], ['national']],
    ['tbai', { tbaiRecord: TBAI_REC }, ['territory', 'tax', 'national', 'cert'], []],
    ['verifactu', { verifactuRecord: { id: 'vf-1', isDevEnv: 'N', tAXType: '03', created: '2026-11-02T11:08:00Z' } }, ['territory', 'tax', 'cert', 'activated'], ['national']],
  ])('renders the status panel for a %s configuration with the rows that apply', (profile, records, present, absent) => {
    mockConfig({ profile, ...records });
    renderPage();
    expect(screen.getByTestId('FiscalStatusSummary__panel')).toBeInTheDocument();
    for (const row of present) expect(screen.getByTestId(`FiscalStatusSummary__row-${row}`)).toBeInTheDocument();
    for (const row of absent) expect(screen.queryByTestId(`FiscalStatusSummary__row-${row}`)).not.toBeInTheDocument();
  });

  // ETP-6053 — the territory is read from the records through the backend catalog.
  it('reads the catalog for the selected organization', () => {
    mockConfig({ profile: 'sii', siiRecord: SII_REC });
    renderPage();
    expect(useFiscalCatalog).toHaveBeenCalledWith('/api', 'org-1');
  });

  it.each([
    ['tbai', { tbaiRecord: { ...TBAI_REC, etsgSifTerritory: 'ARABA' } }, 'alava'],
    ['tbai', { tbaiRecord: { ...TBAI_REC, etsgSifTerritory: 'BIZKAIA' } }, 'bizkaia'],
    ['sii', { siiRecord: { ...SII_REC, taxtype: 'IGIC' } }, 'canarias'],
    ['sii', { siiRecord: SII_REC }, 'baleares'],
    ['sii-navarra', { siiRecord: { ...SII_REC, navarra: 'Y' } }, 'navarra'],
    ['verifactu', { verifactuRecord: { id: 'vf-1', tAXType: '02' } }, 'ceuta'],
  ])('resolves the %s territory from the records via the catalog (%j → %s)', (profile, records, territoryId) => {
    mockConfig({ profile, ...records });
    renderPage();
    const label = territoryId === 'baleares' ? 'fiscal.territory.espania' : `fiscal.territory.${territoryId}`;
    expect(screen.getByTestId('FiscalStatusSummary__row-territory')).toHaveTextContent(label);
  });

  it('follows the catalog it is given: a TicketBAI value mapped elsewhere names that territory', () => {
    catalogState.value = {
      catalog: { territories: [{ territory: 'bizkaia', systems: ['TBAI'], sii: null, tbaiTerritory: 'GIPUZKOA', verifactuTaxType: null }] },
      error: null,
      loading: false,
    };
    mockConfig({ profile: 'tbai', tbaiRecord: TBAI_REC });
    renderPage();
    expect(screen.getByTestId('FiscalStatusSummary__row-territory')).toHaveTextContent('fiscal.territory.bizkaia');
  });

  it('shows the panel without a territory row while the catalog is not available', () => {
    catalogState.value = { catalog: null, error: 'Could not read the fiscal system catalog.', loading: false };
    mockConfig({ profile: 'tbai', tbaiRecord: TBAI_REC });
    renderPage();
    expect(screen.getByTestId('FiscalStatusSummary__panel')).toBeInTheDocument();
    expect(screen.queryByTestId('FiscalStatusSummary__row-territory')).not.toBeInTheDocument();
  });

  it('marks a TicketBAI-only territory without SII as "No aplica" for the national operation', () => {
    mockConfig({ profile: 'tbai', tbaiRecord: TBAI_REC });
    renderPage();
    expect(screen.getByTestId('FiscalStatusSummary__row-national')).toHaveTextContent('fiscal.onboarding.applied.national.na');
  });

  it('shows the sandbox badge when a record is not in production', () => {
    mockConfig({ profile: 'sii', siiRecord: { ...SII_REC, entornoDeProduccin: 'N' } });
    renderPage();
    expect(screen.getByTestId('FiscalStatusSummary__envBadge')).toHaveTextContent('fiscal.onboarding.applied.env.sandbox');
  });

  it('shows the certificate as pending when the org has none', () => {
    certExpiry.value = { daysLeft: null, validTo: null };
    mockConfig({ profile: 'sii', siiRecord: SII_REC });
    renderPage();
    expect(screen.getByTestId('FiscalStatusSummary__row-cert')).toHaveTextContent('fiscal.onboarding.cert.pending');
  });

  it.each([
    ['loading', { loading: true, profile: null }],
    ['unconfigured (wizard)', { profile: 'unconfigured' }],
    ['conflict', { profile: 'conflict', siiRecord: SII_REC, verifactuRecord: { id: 'vf' } }],
    ['load error', { error: 'boom', profile: null }],
  ])('does not render the status panel while %s', (_label, state) => {
    mockConfig(state);
    renderPage();
    expect(screen.queryByTestId('FiscalStatusSummary__panel')).not.toBeInTheDocument();
  });
});

// ETP-5831 — first-time setup: the wizard owns the screen and the "Estado" panel is absent; the
// wizard's save hands over to the page (onComplete = refetch), and the panel appears only once the
// re-read config is a configured one.
describe('FiscalConfigPage — first-time setup and the status panel (ETP-5831)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    certExpiry.value = { daysLeft: null, validTo: null };
  });

  it('shows no status panel while the wizard is configuring, and wires the wizard completion to refetch', () => {
    const refetch = vi.fn();
    mockConfig({ profile: 'unconfigured', refetch });
    renderPage();
    expect(screen.getByTestId('onboarding-wizard')).toBeInTheDocument();
    expect(screen.queryByTestId('FiscalStatusSummary__panel')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('onboarding-wizard-complete'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows the status panel once the re-read config is configured', () => {
    mockConfig({ profile: 'unconfigured' });
    const { rerender } = renderPage();
    expect(screen.queryByTestId('FiscalStatusSummary__panel')).not.toBeInTheDocument();

    mockConfig({ profile: 'sii', siiRecord: SII_REC });
    rerender(<FiscalConfigPage {...BASE_PROPS} />);
    expect(screen.queryByTestId('onboarding-wizard')).not.toBeInTheDocument();
    expect(screen.getByTestId('FiscalStatusSummary__panel')).toBeInTheDocument();
  });

  it('opens the configured page with Save disabled (nothing unsaved yet)', () => {
    mockConfig({ profile: 'sii', siiRecord: SII_REC });
    renderPage();
    expect(screen.getByText('fiscal.save').closest('button')).toBeDisabled();
  });
});

// The status panel's pure derivation: which territory, system and rows a stored configuration
// maps to. Exercised directly so every territory branch is covered without rendering the page.
describe('FiscalStatusSummary — deriveConfiguredStatus / buildConfiguredStatusRows', () => {
  const ui = (key) => key;
  const territories = buildTerritories(ui);
  const systems = buildSystems(ui);
  const rowsFor = (status) => buildConfiguredStatusRows({ status, territories, systems, cert: null, locale: 'es_ES', ui });
  const rowKeys = (rows) => rows.map(r => r.key);
  const rowValue = (rows, key) => rows.find(r => r.key === key)?.value;
  // ETP-6053 — the territory comes from the backend catalog (fiscalSystemCatalog).
  const catalog = FISCAL_SYSTEM_CATALOG;

  it('maps sii-navarra to the Navarra territory with no national-operation row', () => {
    const status = deriveConfiguredStatus({ profile: 'sii-navarra', siiRecord: { id: 'sii-1', navarra: 'Y', taxtype: 'IVA' }, catalog });
    expect(status.system).toBe('SII');
    expect(status.territoryId).toBe('navarra');
    const rows = rowsFor(status);
    expect(rowValue(rows, 'territory')).toBe('fiscal.territory.navarra');
    expect(rowValue(rows, 'tax')).toBe('fiscal.territory.navarra.systemLong');
    expect(rowKeys(rows)).not.toContain('national');
  });

  it('maps SII with IGIC to Canarias, and SII with IVA to the common territory', () => {
    expect(deriveConfiguredStatus({ profile: 'sii', siiRecord: { id: 'sii-1', taxtype: 'igic' }, catalog }).territoryId).toBe('canarias');
    expect(deriveConfiguredStatus({ profile: 'sii', siiRecord: { id: 'sii-1', taxtype: 'IVA' }, catalog }).territoryId).toBe('baleares');
  });

  it.each([
    ['01', 'baleares'],
    ['02', 'ceuta'],
    ['03', 'canarias'],
  ])('maps VERI*FACTU tax type %s to %s', (tAXType, territoryId) => {
    const status = deriveConfiguredStatus({ profile: 'verifactu', verifactuRecord: { id: 'ver-1', tAXType }, catalog });
    expect(status.system).toBe('VERIFACTU');
    expect(status.territoryId).toBe(territoryId);
    expect(rowValue(rowsFor(status), 'tax')).toBe(`fiscal.territory.${territoryId}.systemLong`);
  });

  it('leaves the territory null for an unknown VERI*FACTU tax type and falls back to the system long name', () => {
    const status = deriveConfiguredStatus({ profile: 'verifactu', verifactuRecord: { id: 'ver-1', tAXType: '99' }, catalog });
    expect(status.territoryId).toBeNull();
    const rows = rowsFor(status);
    expect(rowKeys(rows)).not.toContain('territory');
    expect(rowValue(rows, 'tax')).toBe('fiscal.system.verifactu.long');
  });

  it('maps the TicketBAI territory before the SII flags for SII + TicketBAI', () => {
    const status = deriveConfiguredStatus({
      profile: 'sii+tbai',
      siiRecord: { id: 'sii-1', taxtype: 'IVA' },
      tbaiRecord: { id: 'tbai-1', etsgSifTerritory: 'ARABA' },
      catalog,
    });
    expect(status.system).toBe('SII+TBAI');
    expect(status.territoryId).toBe('alava');
    expect(status.nationalSii).toBe(true);
  });

  it('leaves the territory null without a catalog (not loaded or failed)', () => {
    const status = deriveConfiguredStatus({ profile: 'tbai', tbaiRecord: { id: 'tbai-1', etsgSifTerritory: 'ARABA' } });
    expect(status.system).toBe('TBAI');
    expect(status.territoryId).toBeNull();
    expect(rowKeys(rowsFor(status))).not.toContain('territory');
  });

  it('has no "activated" row when the records carry no creation date', () => {
    const status = deriveConfiguredStatus({ profile: 'sii', siiRecord: { id: 'sii-1' } });
    expect(status.activatedAt).toBeNull();
    expect(rowKeys(rowsFor(status))).not.toContain('activated');
  });

  it('has no "activated" row when the creation date is not a valid date', () => {
    const status = deriveConfiguredStatus({ profile: 'sii', siiRecord: { id: 'sii-1', created: 'not-a-date' } });
    expect(status.activatedAt).toBeNull();
    expect(rowKeys(rowsFor(status))).not.toContain('activated');
  });

  it('takes the earliest of created/creationDate across the records in use', () => {
    const status = deriveConfiguredStatus({
      profile: 'sii+tbai',
      siiRecord: { id: 'sii-1', created: '2026-03-10T10:00:00Z' },
      tbaiRecord: { id: 'tbai-1', etsgSifTerritory: 'BIZKAIA', creationDate: '2026-02-01T09:00:00Z' },
    });
    expect(status.activatedAt.toISOString()).toBe('2026-02-01T09:00:00.000Z');
    expect(rowKeys(rowsFor(status))).toContain('activated');
  });

  it.each(['conflict', 'unconfigured', 'something-else', undefined])('returns null for profile %s', (profile) => {
    expect(deriveConfiguredStatus({ profile, siiRecord: { id: 'sii-1' } })).toBeNull();
  });
});
