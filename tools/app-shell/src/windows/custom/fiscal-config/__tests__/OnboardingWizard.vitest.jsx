// @covers tools/app-shell/src/windows/custom/fiscal-config/OnboardingWizard.jsx
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

// Spread the real module so only the helpers below are stubbed.
vi.mock('../fiscalConfig.utils.js', async (importOriginal) => ({
  ...(await importOriginal()),
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
import { buildOnboardingPayloads, getAllowedSystemsForTerritory } from '../fiscalConfig.utils.js';

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

  it('navigates directly to ConfirmScreen for ceuta (no sub-questions — VERIFACTU is the only applicable system, ETP-5272 point 4)', () => {
    renderWizard();
    fireEvent.click(screen.getByText('fiscal.territory.ceuta'));
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

  // ETP-5597 — SIF options are offered in the order SII → TicketBAI → VERI*FACTU.
  it('offers SII before VERI*FACTU in the low-volume system choice', () => {
    navigateToVolumeSubquestion();
    fireEvent.click(screen.getByText('fiscal.onboarding.subq.obligation.no.label'));
    const sii = screen.getByTestId('BulletOptionCard__sii');
    const verifactu = screen.getByTestId('BulletOptionCard__verifactu');
    expect(sii).toHaveTextContent('fiscal.onboarding.subq.sii.vol.label');
    expect(verifactu).toHaveTextContent('fiscal.onboarding.subq.verifactu.label');
    expect(sii.compareDocumentPosition(verifactu) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

  // ETP-4783: the records already exist, so "Cancelar" never goes back into the wizard. Since
  // ETP-5831 (no applied screen) it hands over to the page, which shows the configured view.
  it('cancel in DetailScreen hands over to the page instead of going back into the wizard', async () => {
    const { props } = renderWizard();
    fireEvent.click(screen.getByText('fiscal.territory.navarra'));
    fireEvent.click(screen.getByText('fiscal.onboarding.continue'));
    fireEvent.click(screen.getByText('fiscal.onboarding.confirm.btn'));
    await waitFor(() => {
      expect(screen.getByText('fiscal.save')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('fiscal.cancel'));
    expect(screen.queryByText('fiscal.onboarding.confirm.title')).not.toBeInTheDocument();
    expect(props.onComplete).toHaveBeenCalledTimes(1);
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

describe('OnboardingWizard — ManualScreen territory restriction (ETP-5272 point 4)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function navigateToManual() {
    renderWizard();
    fireEvent.click(screen.getByText('fiscal.onboarding.territory.prefer.manual.link'));
  }

  it('ceuta/melilla only offers VERI*FACTU — SII is not rendered as an option', () => {
    vi.mocked(getAllowedSystemsForTerritory).mockImplementation((territory) => {
      if (territory === 'ceuta') return ['VERIFACTU'];
      return ['SII', 'TBAI', 'VERIFACTU'];
    });
    navigateToManual();
    fireEvent.click(screen.getByText('fiscal.territory.ceuta'));
    expect(screen.getByText('VERI*FACTU')).toBeInTheDocument();
    expect(screen.queryByText('SII')).not.toBeInTheDocument();
  });

  it('canarias (SII-supported territory) still offers both SII and VERI*FACTU — no regression', () => {
    vi.mocked(getAllowedSystemsForTerritory).mockImplementation((territory) => {
      if (territory === 'ceuta') return ['VERIFACTU'];
      if (territory === 'canarias') return ['SII', 'VERIFACTU'];
      return ['SII', 'TBAI', 'VERIFACTU'];
    });
    navigateToManual();
    fireEvent.click(screen.getByText('fiscal.territory.canarias'));
    expect(screen.getByText('SII')).toBeInTheDocument();
    expect(screen.getByText('VERI*FACTU')).toBeInTheDocument();
  });
});

// ETP-5831 — the "Configuración aplicada" screen is gone: once the detail save succeeds the
// wizard hands over to the page (onComplete), which re-reads the config and shows the configured
// view with its "Estado" panel. Nothing of the wizard's own summary is rendered.
describe('OnboardingWizard — after saving the details', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function saveDetails(overrides = {}) {
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
    // handleSaveDetail: system='SII', siiRef.current is null (SiiSection mocked), so the save
    // resolves at once and the wizard hands over.
    fireEvent.click(screen.getByTestId('OnboardingWizard__detailSaveButton'));
    return result;
  }

  it('calls onComplete so the page re-reads the stored config', async () => {
    const { props } = await saveDetails();
    await waitFor(() => expect(props.onComplete).toHaveBeenCalledTimes(1));
  });

  it('never renders an applied / summary screen of its own', async () => {
    await saveDetails();
    await waitFor(() => expect(screen.queryByText('fiscal.onboarding.applied.title')).not.toBeInTheDocument());
    expect(screen.queryByTestId('FiscalStatusSummary__applied')).not.toBeInTheDocument();
    expect(screen.queryByTestId('FiscalStatusSummary__panel')).not.toBeInTheDocument();
  });

  it('does not double-submit: a second click while the save is in flight is ignored', async () => {
    const { props } = renderWizard();
    fireEvent.click(screen.getByText('fiscal.onboarding.territory.prefer.manual.link'));
    fireEvent.click(screen.getByText('fiscal.territory.navarra'));
    fireEvent.click(screen.getByText('SII'));
    fireEvent.click(screen.getByText('fiscal.onboarding.continue'));
    fireEvent.click(screen.getByText('fiscal.onboarding.confirm.btn'));
    const save = await screen.findByTestId('OnboardingWizard__detailSaveButton');
    fireEvent.click(save);
    fireEvent.click(save);
    await waitFor(() => expect(props.onComplete).toHaveBeenCalled());
    expect(props.onComplete).toHaveBeenCalledTimes(1);
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

// ETP-5272 follow-up — the onboarding/setup wizard is the ONLY path that
// performs a first-time fiscal-system ACTIVATION (createRecords() POSTs the
// sii-config/tbai-config/verifactu-config record on the confirm step), which
// is exactly what "Fuerza SII/TicketBAI/VeriFactu a modo prueba" exists to
// block — there is no carve-out for first-time setup in the requirement.
describe('OnboardingWizard — forceTestMode (ETP-5272 follow-up)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function navigateToConfirmViaNavarra(overrides = {}) {
    // Navarra (sii_foral regime) has no national/volume sub-question, so
    // "Continue" goes straight from the territory screen to 'confirm'.
    const result = renderWizard(overrides);
    fireEvent.click(screen.getByText('fiscal.territory.navarra'));
    fireEvent.click(screen.getByText('fiscal.onboarding.continue'));
    return result;
  }

  it('does not show the test-mode banner on the territory screen when forceTestMode is false', () => {
    renderWizard({ forceTestMode: false });
    expect(screen.queryByTestId('OnboardingWizard__testModeBanner')).not.toBeInTheDocument();
  });

  it('shows the test-mode banner on the territory screen when forceTestMode is true', () => {
    renderWizard({ forceTestMode: true });
    expect(screen.getByTestId('OnboardingWizard__testModeBanner')).toBeInTheDocument();
    expect(screen.getByText('fiscal.testModeLock.warning')).toBeInTheDocument();
  });

  it('defaults to unlocked (no banner) when forceTestMode is omitted — no regression', () => {
    renderWizard();
    expect(screen.queryByTestId('OnboardingWizard__testModeBanner')).not.toBeInTheDocument();
  });

  it('territory selection and navigation still work while locked (browsing is not blocked)', () => {
    navigateToConfirmViaNavarra({ forceTestMode: true });
    // Reaching the confirm screen proves territory pick + Continue still work.
    expect(screen.getByText('fiscal.onboarding.confirm.title')).toBeInTheDocument();
    expect(screen.getByTestId('OnboardingWizard__confirmActivateButton')).toBeInTheDocument();
  });

  it('keeps the banner visible on the confirm screen when forceTestMode is true', () => {
    navigateToConfirmViaNavarra({ forceTestMode: true });
    expect(screen.getByTestId('OnboardingWizard__testModeBanner')).toBeInTheDocument();
  });

  it('disables the confirm/activate button when forceTestMode is true — no first-time activation', () => {
    navigateToConfirmViaNavarra({ forceTestMode: true });
    expect(screen.getByTestId('OnboardingWizard__confirmActivateButton')).toBeDisabled();
  });

  it('enables the confirm/activate button when forceTestMode is false (no regression)', () => {
    navigateToConfirmViaNavarra({ forceTestMode: false });
    expect(screen.getByTestId('OnboardingWizard__confirmActivateButton')).not.toBeDisabled();
  });

  it('clicking the confirm button never calls the API when forceTestMode is true', async () => {
    const mockFetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
    vi.mocked(useApiFetch).mockReturnValue(mockFetch);
    vi.mocked(buildOnboardingPayloads).mockReturnValue({ sii: { orgField: 'x' } });

    navigateToConfirmViaNavarra({ forceTestMode: true });
    fireEvent.click(screen.getByTestId('OnboardingWizard__confirmActivateButton'));

    // Disabled button never fires onClick, and createRecords() itself also
    // short-circuits on forceTestMode — either way, no network write happens.
    expect(mockFetch).not.toHaveBeenCalled();
    expect(screen.queryByText('fiscal.save')).not.toBeInTheDocument();
  });

  it('clicking the confirm button still creates records when forceTestMode is false (no regression)', async () => {
    const mockFetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
    vi.mocked(useApiFetch).mockReturnValue(mockFetch);
    vi.mocked(buildOnboardingPayloads).mockReturnValue({ sii: { orgField: 'x' } });

    navigateToConfirmViaNavarra({ forceTestMode: false });
    fireEvent.click(screen.getByTestId('OnboardingWizard__confirmActivateButton'));

    await waitFor(() => {
      expect(screen.getByText('fiscal.save')).toBeInTheDocument();
    });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('sii-config'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('disables the detail-screen Save button when forceTestMode is true (defense-in-depth for a mid-session flip)', async () => {
    const mockFetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ response: { data: [{ id: 'sii-1' }] } }),
    }));
    vi.mocked(useApiFetch).mockReturnValue(mockFetch);
    vi.mocked(buildOnboardingPayloads).mockReturnValue({ sii: { orgField: 'x' } });

    // Reach the detail screen while unlocked (the only way to get past the
    // confirm gate), then re-render with forceTestMode=true to simulate the
    // preference flipping on while the wizard is still open on the detail step.
    const { rerender } = renderWizard({ forceTestMode: false });
    fireEvent.click(screen.getByText('fiscal.territory.navarra'));
    fireEvent.click(screen.getByText('fiscal.onboarding.continue'));
    fireEvent.click(screen.getByTestId('OnboardingWizard__confirmActivateButton'));
    await waitFor(() => {
      expect(screen.getByTestId('OnboardingWizard__detailSaveButton')).toBeInTheDocument();
    });

    rerender(
      <OnboardingWizard
        apiBaseUrl="/api/fiscal-config"
        onComplete={vi.fn()}
        onGoHome={vi.fn()}
        forceTestMode
      />,
    );
    expect(screen.getByTestId('OnboardingWizard__detailSaveButton')).toBeDisabled();
  });
});
