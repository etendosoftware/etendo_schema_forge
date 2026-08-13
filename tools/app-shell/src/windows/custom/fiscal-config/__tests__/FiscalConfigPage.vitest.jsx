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
  })),
}));

vi.mock('../../fiscal-monitor/useDebugMode.js', () => ({
  useDebugMode: () => false,
}));

vi.mock('../useCertExpiry.js', () => ({
  useCertExpiry: () => ({ daysLeft: null }),
}));

vi.mock('../fiscalConfig.utils.js', () => ({
  detectProfile: vi.fn(() => 'sii'),
}));

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
}));

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
