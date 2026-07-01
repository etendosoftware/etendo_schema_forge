import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// --- Mocks ----------------------------------------------------------------

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...rest }) => (
    <button onClick={onClick} disabled={disabled} {...rest}>
      {children}
    </button>
  ),
}));

vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: vi.fn(() => vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }))),
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: vi.fn(() => ({
    selectedOrg: { id: 'org-1', name: 'Test Organization' },
    selectedRole: { orgList: [{ id: 'org-1', name: 'Test Organization' }] },
    selectOrg: vi.fn(),
  })),
}));

vi.mock('@/components/related-documents/helpers.js', () => ({
  fetchById: vi.fn(() => Promise.resolve(null)),
  neoBase: (url) => url?.replace(/\/[^/]+$/, '') ?? '',
}));

vi.mock('../fiscalConfig.utils.js', () => ({
  buildOnboardingPayloads: vi.fn(() => ({})),
  getFiscalRecordId: vi.fn(() => null),
  getAllowedSystemsForTerritory: vi.fn(() => ['SII', 'TBAI', 'VERIFACTU']),
  getCertificateContext: vi.fn(() => null),
  resolveSystem: vi.fn(() => null),
}));

vi.mock('../SiiSection.jsx', () => ({ default: () => <div data-testid="sii-section" /> }));
vi.mock('../TbaiSection.jsx', () => ({ default: () => <div data-testid="tbai-section" /> }));
vi.mock('../VerifactuSection.jsx', () => ({ default: () => <div data-testid="verifactu-section" /> }));
vi.mock('../CertModal.jsx', () => ({ default: () => <div data-testid="cert-modal" /> }));
vi.mock('../CertSection.jsx', () => ({ default: () => <div data-testid="cert-section" /> }));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// --- Import under test ----------------------------------------------------

import OnboardingWizard from '../OnboardingWizard.jsx';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { useAuth } from '@/auth/AuthContext.jsx';
import { buildOnboardingPayloads } from '../fiscalConfig.utils.js';

// --- Helpers --------------------------------------------------------------

function renderWizard(overrides = {}) {
  const defaults = {
    apiBaseUrl: '/api/fiscal-config',
    onComplete: vi.fn(),
    onGoHome: vi.fn(),
  };
  return { ...render(<OnboardingWizard {...defaults} {...overrides} />), props: { ...defaults, ...overrides } };
}

// --- Tests ----------------------------------------------------------------

describe('OnboardingWizard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders without crashing', () => {
    renderWizard();
    // The territory step title
    expect(screen.getByText('fiscal.onboarding.territory.title')).toBeInTheDocument();
  });

  it('shows organization name', () => {
    renderWizard();
    expect(screen.getByText('Test Organization')).toBeInTheDocument();
  });

  it('renders stepper with step 1 active', () => {
    renderWizard();
    // Step labels
    expect(screen.getByText('fiscal.onboarding.step.territory')).toBeInTheDocument();
    expect(screen.getByText('fiscal.onboarding.step.details')).toBeInTheDocument();
    expect(screen.getByText('fiscal.onboarding.step.confirm')).toBeInTheDocument();
  });

  it('renders territory cards', () => {
    renderWizard();
    // Territory names come from ui() calls
    expect(screen.getByText('fiscal.territory.navarra')).toBeInTheDocument();
    expect(screen.getByText('fiscal.territory.alava')).toBeInTheDocument();
    expect(screen.getByText('fiscal.territory.bizkaia')).toBeInTheDocument();
  });

  it('shows continue button that is initially disabled', () => {
    renderWizard();
    const continueBtn = screen.getByText('fiscal.onboarding.continue');
    expect(continueBtn).toBeDisabled();
  });

  it('shows skip option', () => {
    renderWizard();
    expect(screen.getByText('fiscal.onboarding.skip')).toBeInTheDocument();
  });

  it('navigates to skipped state when skip is clicked', () => {
    renderWizard();
    fireEvent.click(screen.getByText('fiscal.onboarding.skip'));
    expect(screen.getByText('fiscal.onboarding.skipped.title')).toBeInTheDocument();
  });

  it('shows manual config link in header', () => {
    renderWizard();
    expect(screen.getByText('fiscal.onboarding.territory.prefer.manual.link')).toBeInTheDocument();
  });

  it('navigates to manual step when manual config link is clicked', () => {
    renderWizard();
    fireEvent.click(screen.getByText('fiscal.onboarding.territory.prefer.manual.link'));
    expect(screen.getByText('fiscal.onboarding.manual.title')).toBeInTheDocument();
  });
});

describe('OnboardingWizard — territory selection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('enables continue after selecting a territory', () => {
    renderWizard();
    fireEvent.click(screen.getByText('fiscal.territory.navarra'));
    expect(screen.getByText('fiscal.onboarding.continue')).not.toBeDisabled();
  });

  it('renders all territory groups including gipuzkoa, baleares, canarias, ceuta', () => {
    renderWizard();
    expect(screen.getByText('fiscal.territory.gipuzkoa')).toBeInTheDocument();
    expect(screen.getByText('fiscal.territory.canarias')).toBeInTheDocument();
    expect(screen.getByText('fiscal.territory.ceuta')).toBeInTheDocument();
  });

  it('navigates directly to ConfirmScreen for navarra (no sub-questions)', () => {
    renderWizard();
    fireEvent.click(screen.getByText('fiscal.territory.navarra'));
    fireEvent.click(screen.getByText('fiscal.onboarding.continue'));
    expect(screen.getByText('fiscal.onboarding.confirm.title')).toBeInTheDocument();
  });

  it('navigates to SubquestionScreen for alava (askNational=true)', () => {
    renderWizard();
    fireEvent.click(screen.getByText('fiscal.territory.alava'));
    fireEvent.click(screen.getByText('fiscal.onboarding.continue'));
    expect(screen.getByText('fiscal.onboarding.subq.also.title')).toBeInTheDocument();
  });

  it('navigates to SubquestionScreen for baleares (askVolume=true)', () => {
    renderWizard();
    fireEvent.click(screen.getByText('fiscal.territory.espania'));
    fireEvent.click(screen.getByText('fiscal.onboarding.continue'));
    expect(screen.getByText('fiscal.onboarding.subq.obligation.title')).toBeInTheDocument();
  });
});

describe('OnboardingWizard — SkippedScreen', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows go-home button in skipped screen', () => {
    renderWizard();
    fireEvent.click(screen.getByText('fiscal.onboarding.skip'));
    expect(screen.getByText('fiscal.onboarding.goHome')).toBeInTheDocument();
  });

  it('navigates back to territory from skipped screen', () => {
    renderWizard();
    fireEvent.click(screen.getByText('fiscal.onboarding.skip'));
    fireEvent.click(screen.getByText('fiscal.onboarding.back.wizard'));
    expect(screen.getByText('fiscal.onboarding.territory.title')).toBeInTheDocument();
  });
});

describe('OnboardingWizard — SubquestionScreen (national)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function navigateToSubquestion() {
    renderWizard();
    fireEvent.click(screen.getByText('fiscal.territory.alava'));
    fireEvent.click(screen.getByText('fiscal.onboarding.continue'));
  }

  it('shows national-tax question for tbai territories', () => {
    navigateToSubquestion();
    expect(screen.getByText('fiscal.onboarding.subq.also.title')).toBeInTheDocument();
    expect(screen.getByText('fiscal.onboarding.subq.tbai.label')).toBeInTheDocument();
    expect(screen.getByText('fiscal.onboarding.subq.sii.label')).toBeInTheDocument();
  });

  it('continue is disabled before answering the national question', () => {
    navigateToSubquestion();
    expect(screen.getByText('fiscal.onboarding.continue')).toBeDisabled();
  });

  it('continue is enabled after selecting only-tbai option', () => {
    navigateToSubquestion();
    fireEvent.click(screen.getByText('fiscal.onboarding.subq.tbai.label'));
    expect(screen.getByText('fiscal.onboarding.continue')).not.toBeDisabled();
  });

  it('continue is enabled after selecting also-sii option', () => {
    navigateToSubquestion();
    fireEvent.click(screen.getByText('fiscal.onboarding.subq.sii.label'));
    expect(screen.getByText('fiscal.onboarding.continue')).not.toBeDisabled();
  });

  it('navigates to ConfirmScreen after answering the national question', () => {
    navigateToSubquestion();
    fireEvent.click(screen.getByText('fiscal.onboarding.subq.tbai.label'));
    fireEvent.click(screen.getByText('fiscal.onboarding.continue'));
    expect(screen.getByText('fiscal.onboarding.confirm.title')).toBeInTheDocument();
  });

  it('navigates back to territory from SubquestionScreen', () => {
    navigateToSubquestion();
    fireEvent.click(screen.getByText('fiscal.onboarding.back'));
    expect(screen.getByText('fiscal.onboarding.territory.title')).toBeInTheDocument();
  });
});

describe('OnboardingWizard — SubquestionScreen (volume)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function navigateToVolumeSubquestion() {
    renderWizard();
    fireEvent.click(screen.getByText('fiscal.territory.espania'));
    fireEvent.click(screen.getByText('fiscal.onboarding.continue'));
  }

  it('shows volume question for siiver territories', () => {
    navigateToVolumeSubquestion();
    expect(screen.getByText('fiscal.onboarding.subq.obligation.title')).toBeInTheDocument();
    expect(screen.getByText('fiscal.onboarding.subq.obligation.no.label')).toBeInTheDocument();
    expect(screen.getByText('fiscal.onboarding.subq.obligation.yes.label')).toBeInTheDocument();
  });

  it('continue is enabled after selecting high volume', () => {
    navigateToVolumeSubquestion();
    fireEvent.click(screen.getByText('fiscal.onboarding.subq.obligation.yes.label'));
    expect(screen.getByText('fiscal.onboarding.continue')).not.toBeDisabled();
  });

  it('continue stays disabled after selecting low volume without choosing system', () => {
    navigateToVolumeSubquestion();
    fireEvent.click(screen.getByText('fiscal.onboarding.subq.obligation.no.label'));
    expect(screen.getByText('fiscal.onboarding.continue')).toBeDisabled();
  });

  it('shows system choice when volume is low', () => {
    navigateToVolumeSubquestion();
    fireEvent.click(screen.getByText('fiscal.onboarding.subq.obligation.no.label'));
    expect(screen.getByText('fiscal.onboarding.subq.choice.title')).toBeInTheDocument();
    expect(screen.getByText('fiscal.onboarding.subq.verifactu.label')).toBeInTheDocument();
    expect(screen.getByText('fiscal.onboarding.subq.sii.vol.label')).toBeInTheDocument();
  });

  it('continue is enabled after choosing system for low volume', () => {
    navigateToVolumeSubquestion();
    fireEvent.click(screen.getByText('fiscal.onboarding.subq.obligation.no.label'));
    fireEvent.click(screen.getByText('fiscal.onboarding.subq.verifactu.label'));
    expect(screen.getByText('fiscal.onboarding.continue')).not.toBeDisabled();
  });
});

describe('OnboardingWizard — ConfirmScreen', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function navigateToConfirm() {
    renderWizard();
    fireEvent.click(screen.getByText('fiscal.territory.navarra'));
    fireEvent.click(screen.getByText('fiscal.onboarding.continue'));
  }

  it('shows confirmation title and subtitle', () => {
    navigateToConfirm();
    expect(screen.getByText('fiscal.onboarding.confirm.title')).toBeInTheDocument();
    expect(screen.getByText('fiscal.onboarding.confirm.subtitle.pre')).toBeInTheDocument();
  });

  it('shows confirm button', () => {
    navigateToConfirm();
    expect(screen.getByText('fiscal.onboarding.confirm.btn')).toBeInTheDocument();
  });

  it('shows territory row in summary', () => {
    navigateToConfirm();
    expect(screen.getByText('fiscal.onboarding.confirm.row.territory')).toBeInTheDocument();
  });

  it('back button returns to territory for navarra (no sub-questions)', () => {
    navigateToConfirm();
    fireEvent.click(screen.getByText('fiscal.onboarding.back'));
    expect(screen.getByText('fiscal.onboarding.territory.title')).toBeInTheDocument();
  });

  it('back button returns to subquestion for alava (went through sub-questions)', () => {
    renderWizard();
    fireEvent.click(screen.getByText('fiscal.territory.alava'));
    fireEvent.click(screen.getByText('fiscal.onboarding.continue'));
    fireEvent.click(screen.getByText('fiscal.onboarding.subq.tbai.label'));
    fireEvent.click(screen.getByText('fiscal.onboarding.continue'));
    fireEvent.click(screen.getByText('fiscal.onboarding.back'));
    expect(screen.getByText('fiscal.onboarding.subq.also.title')).toBeInTheDocument();
  });
});

describe('OnboardingWizard — createRecords flow', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('navigates to DetailScreen after confirming', async () => {
    renderWizard();
    fireEvent.click(screen.getByText('fiscal.territory.navarra'));
    fireEvent.click(screen.getByText('fiscal.onboarding.continue'));
    fireEvent.click(screen.getByText('fiscal.onboarding.confirm.btn'));
    await waitFor(() => {
      expect(screen.getByText('fiscal.save')).toBeInTheDocument();
    });
  });

  it('back button in DetailScreen returns to ConfirmScreen', async () => {
    renderWizard();
    fireEvent.click(screen.getByText('fiscal.territory.navarra'));
    fireEvent.click(screen.getByText('fiscal.onboarding.continue'));
    fireEvent.click(screen.getByText('fiscal.onboarding.confirm.btn'));
    await waitFor(() => {
      expect(screen.getByText('fiscal.save')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('fiscal.cancel'));
    expect(screen.getByText('fiscal.onboarding.confirm.title')).toBeInTheDocument();
  });
});

describe('OnboardingWizard — ManualScreen', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function navigateToManual() {
    renderWizard();
    fireEvent.click(screen.getByText('fiscal.onboarding.territory.prefer.manual.link'));
  }

  it('shows territory cards in manual screen', () => {
    navigateToManual();
    expect(screen.getByText('fiscal.territory.navarra')).toBeInTheDocument();
    expect(screen.getByText('fiscal.territory.alava')).toBeInTheDocument();
  });

  it('shows system placeholder when no territory selected', () => {
    navigateToManual();
    expect(screen.getByText('fiscal.onboarding.manual.system.placeholder')).toBeInTheDocument();
  });

  it('continue is disabled when no territory or system selected', () => {
    navigateToManual();
    expect(screen.getByText('fiscal.onboarding.continue')).toBeDisabled();
  });

  it('shows system options after selecting a territory', () => {
    navigateToManual();
    fireEvent.click(screen.getByText('fiscal.territory.navarra'));
    expect(screen.getByText('SII')).toBeInTheDocument();
    expect(screen.getByText('TicketBAI')).toBeInTheDocument();
  });

  it('continue is disabled after selecting territory but not system', () => {
    navigateToManual();
    fireEvent.click(screen.getByText('fiscal.territory.navarra'));
    expect(screen.getByText('fiscal.onboarding.continue')).toBeDisabled();
  });

  it('continue is enabled after selecting both territory and system', () => {
    navigateToManual();
    fireEvent.click(screen.getByText('fiscal.territory.navarra'));
    fireEvent.click(screen.getByText('SII'));
    expect(screen.getByText('fiscal.onboarding.continue')).not.toBeDisabled();
  });

  it('navigates to ConfirmScreen after selecting territory and system', () => {
    navigateToManual();
    fireEvent.click(screen.getByText('fiscal.territory.navarra'));
    fireEvent.click(screen.getByText('SII'));
    fireEvent.click(screen.getByText('fiscal.onboarding.continue'));
    expect(screen.getByText('fiscal.onboarding.confirm.title')).toBeInTheDocument();
  });

  it('navigates back to territory from manual screen', () => {
    navigateToManual();
    fireEvent.click(screen.getByText('fiscal.onboarding.back'));
    expect(screen.getByText('fiscal.onboarding.territory.title')).toBeInTheDocument();
  });

  it('changing territory in manual screen resets system selection', () => {
    navigateToManual();
    fireEvent.click(screen.getByText('fiscal.territory.navarra'));
    fireEvent.click(screen.getByText('SII'));
    fireEvent.click(screen.getByText('fiscal.territory.alava'));
    expect(screen.getByText('fiscal.onboarding.continue')).toBeDisabled();
  });

  it('ConfirmScreen back button returns to manual when manualSystem is set', () => {
    navigateToManual();
    fireEvent.click(screen.getByText('fiscal.territory.navarra'));
    fireEvent.click(screen.getByText('SII'));
    fireEvent.click(screen.getByText('fiscal.onboarding.continue'));
    fireEvent.click(screen.getByText('fiscal.onboarding.back'));
    expect(screen.getByText('fiscal.onboarding.manual.title')).toBeInTheDocument();
  });
});

describe('OnboardingWizard — AppliedScreen', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function navigateToApplied(overrides = {}) {
    const result = renderWizard(overrides);
    // Use manual path so manualSystem='SII' bypasses the resolveSystem mock (which returns null)
    fireEvent.click(screen.getByText('fiscal.onboarding.territory.prefer.manual.link'));
    fireEvent.click(screen.getByText('fiscal.territory.navarra'));
    fireEvent.click(screen.getByText('SII'));
    fireEvent.click(screen.getByText('fiscal.onboarding.continue'));
    fireEvent.click(screen.getByText('fiscal.onboarding.confirm.btn'));
    await waitFor(() => {
      expect(screen.getByText('fiscal.save')).toBeInTheDocument();
    });
    // handleSaveDetail: system='SII', siiRef.current is null (SiiSection not rendered),
    // optional-chaining returns undefined, onApplied() fires → step='applied'
    fireEvent.click(screen.getByText('fiscal.save'));
    await waitFor(() => {
      expect(screen.getByText('fiscal.onboarding.applied.title')).toBeInTheDocument();
    });
    return result;
  }

  it('shows applied title after saving details', async () => {
    await navigateToApplied();
    expect(screen.getByText('fiscal.onboarding.applied.title')).toBeInTheDocument();
  });

  it('shows applied subtitle', async () => {
    await navigateToApplied();
    expect(screen.getByText('fiscal.onboarding.applied.subtitle')).toBeInTheDocument();
  });

  it('shows goHome button in applied screen', async () => {
    await navigateToApplied();
    expect(screen.getByText('fiscal.onboarding.goHome')).toBeInTheDocument();
  });

  it('shows viewConfig button in applied screen', async () => {
    await navigateToApplied();
    expect(screen.getByText('fiscal.onboarding.viewConfig')).toBeInTheDocument();
  });

  it('calls onGoHome when goHome button is clicked in applied screen', async () => {
    const { props } = await navigateToApplied();
    fireEvent.click(screen.getByText('fiscal.onboarding.goHome'));
    expect(props.onGoHome).toHaveBeenCalled();
  });

  it('calls onComplete when viewConfig button is clicked in applied screen', async () => {
    const { props } = await navigateToApplied();
    fireEvent.click(screen.getByText('fiscal.onboarding.viewConfig'));
    expect(props.onComplete).toHaveBeenCalled();
  });

  it('shows applied territory row', async () => {
    await navigateToApplied();
    expect(screen.getByText('fiscal.onboarding.applied.row.territory')).toBeInTheDocument();
  });

  it('shows applied system row', async () => {
    await navigateToApplied();
    expect(screen.getByText('fiscal.onboarding.applied.row.system')).toBeInTheDocument();
  });

  it('shows nextsteps title', async () => {
    await navigateToApplied();
    expect(screen.getByText('fiscal.onboarding.nextsteps.title')).toBeInTheDocument();
  });
});


describe('OnboardingWizard — createRecords API calls', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls the API when buildOnboardingPayloads returns an sii payload', async () => {
    const mockFetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
    vi.mocked(useApiFetch).mockReturnValue(mockFetch);
    vi.mocked(buildOnboardingPayloads).mockReturnValue({ sii: { orgField: 'x' } });

    renderWizard();
    fireEvent.click(screen.getByText('fiscal.territory.navarra'));
    fireEvent.click(screen.getByText('fiscal.onboarding.continue'));
    fireEvent.click(screen.getByText('fiscal.onboarding.confirm.btn'));

    await waitFor(() => {
      expect(screen.getByText('fiscal.save')).toBeInTheDocument();
    });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('sii-config'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('calls the API when buildOnboardingPayloads returns a tbai payload', async () => {
    const mockFetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
    vi.mocked(useApiFetch).mockReturnValue(mockFetch);
    vi.mocked(buildOnboardingPayloads).mockReturnValue({ tbai: { orgField: 'x' } });

    renderWizard();
    fireEvent.click(screen.getByText('fiscal.territory.alava'));
    fireEvent.click(screen.getByText('fiscal.onboarding.continue'));
    fireEvent.click(screen.getByText('fiscal.onboarding.subq.tbai.label'));
    fireEvent.click(screen.getByText('fiscal.onboarding.continue'));
    fireEvent.click(screen.getByText('fiscal.onboarding.confirm.btn'));

    await waitFor(() => {
      expect(screen.getByText('fiscal.save')).toBeInTheDocument();
    });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('tbai-config'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('calls the API when buildOnboardingPayloads returns a verifactu payload', async () => {
    const mockFetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
    vi.mocked(useApiFetch).mockReturnValue(mockFetch);
    vi.mocked(buildOnboardingPayloads).mockReturnValue({ verifactu: { orgField: 'x' } });

    renderWizard();
    fireEvent.click(screen.getByText('fiscal.territory.navarra'));
    fireEvent.click(screen.getByText('fiscal.onboarding.continue'));
    fireEvent.click(screen.getByText('fiscal.onboarding.confirm.btn'));

    await waitFor(() => {
      expect(screen.getByText('fiscal.save')).toBeInTheDocument();
    });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('verifactu-config'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('shows error message when API call fails during createRecords', async () => {
    vi.mocked(buildOnboardingPayloads).mockReturnValue({ sii: { orgField: 'x' } });
    vi.mocked(useApiFetch).mockReturnValue(
      vi.fn(() => Promise.reject(new Error('Network error'))),
    );

    renderWizard();
    fireEvent.click(screen.getByText('fiscal.territory.navarra'));
    fireEvent.click(screen.getByText('fiscal.onboarding.continue'));
    fireEvent.click(screen.getByText('fiscal.onboarding.confirm.btn'));

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });
});

describe('OnboardingWizard — OrgDropdown multi-org', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens dropdown showing other orgs when multiple orgs are available', () => {
    vi.mocked(useAuth).mockReturnValue({
      selectedOrg: { id: 'org-1', name: 'Test Organization' },
      selectedRole: {
        orgList: [
          { id: 'org-1', name: 'Test Organization' },
          { id: 'org-2', name: 'Other Org' },
        ],
      },
      selectOrg: vi.fn(),
    });

    renderWizard();
    // Click the org button (the span holding the name is inside the button)
    fireEvent.click(screen.getByText('Test Organization').closest('button'));
    expect(screen.getByText('Other Org')).toBeInTheDocument();
  });

  it('calls selectOrg and onComplete when another org is selected from the dropdown', () => {
    const mockSelectOrg = vi.fn();
    vi.mocked(useAuth).mockReturnValue({
      selectedOrg: { id: 'org-1', name: 'Test Organization' },
      selectedRole: {
        orgList: [
          { id: 'org-1', name: 'Test Organization' },
          { id: 'org-2', name: 'Other Org' },
        ],
      },
      selectOrg: mockSelectOrg,
    });

    const { props } = renderWizard();
    fireEvent.click(screen.getByText('Test Organization').closest('button'));
    fireEvent.click(screen.getByText('Other Org'));
    expect(mockSelectOrg).toHaveBeenCalledWith({ id: 'org-2', name: 'Other Org' });
    expect(props.onComplete).toHaveBeenCalled();
  });

  it('does not open dropdown when only one org is available', () => {
    vi.mocked(useAuth).mockReturnValue({
      selectedOrg: { id: 'org-1', name: 'Test Organization' },
      selectedRole: { orgList: [{ id: 'org-1', name: 'Test Organization' }] },
      selectOrg: vi.fn(),
    });
    renderWizard();
    fireEvent.click(screen.getByText('Test Organization').closest('button'));
    expect(screen.queryByText('Other Org')).not.toBeInTheDocument();
  });
});

// ── renderPageHead helper ─────────────────────────────────────────────────────

describe('OnboardingWizard — renderPageHead helper', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the org name in the page head on the territory step', () => {
    renderWizard();
    // renderPageHead passes selectedOrg to PageHead which renders the org name
    expect(screen.getByText('Test Organization')).toBeInTheDocument();
  });

  it('renders the manual config link on the territory step (onGoToManual variant)', () => {
    renderWizard();
    // Territory step calls renderPageHead with onGoToManual → shows the link
    expect(screen.getByText('fiscal.onboarding.territory.prefer.manual.link')).toBeInTheDocument();
  });

  it('does NOT render the manual config link on the skipped step (no onGoToManual)', () => {
    renderWizard();
    fireEvent.click(screen.getByText('fiscal.onboarding.skip'));
    // SkippedScreen calls renderPageHead without onGoToManual → link absent
    expect(screen.queryByText('fiscal.onboarding.territory.prefer.manual.link')).not.toBeInTheDocument();
  });

  it('re-renders the org name on subquestion step', () => {
    renderWizard();
    fireEvent.click(screen.getByText('fiscal.territory.alava'));
    fireEvent.click(screen.getByText('fiscal.onboarding.continue'));
    // SubquestionScreen also calls renderPageHead
    expect(screen.getByText('Test Organization')).toBeInTheDocument();
  });
});
