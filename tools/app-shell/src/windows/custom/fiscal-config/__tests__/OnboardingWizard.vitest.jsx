// @covers tools/app-shell/src/windows/custom/fiscal-config/OnboardingWizard.jsx
// @covers tools/app-shell/src/windows/custom/fiscal-config/fiscalSystemApi.js
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

// ETP-6053 — the wizard talks to the organization's fiscal actions through apiFetch. One stable
// function per test (the real useApiFetch is memoized), answered by `createBackend()` below.
const backend = vi.hoisted(() => ({ fetch: null }));
vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: vi.fn(() => backend.fetch),
}));

// The territory × system rules come from the backend catalog (useFiscalCatalog has its own suite);
// each test sets what the hook returns.
const catalogState = vi.hoisted(() => ({ value: { catalog: null, error: null, loading: false } }));
vi.mock('../useFiscalCatalog.js', () => ({
  useFiscalCatalog: vi.fn(() => catalogState.value),
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
import { useAuth } from '@/auth/AuthContext.jsx';
import { useFiscalCatalog } from '../useFiscalCatalog.js';
import { FISCAL_SYSTEM_CATALOG } from './fiscalSystemCatalog.fixture.js';

// --- Helpers --------------------------------------------------------------

const ACTION_PATH = '/sii-config/siiConfiguration/org-1/action/configureFiscalSystem';

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return Promise.resolve({
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

const RECORD_SYSTEMS = { SII: ['SII'], TBAI: ['TBAI'], 'SII+TBAI': ['SII', 'TBAI'], VERIFACTU: ['VERIFACTU'] };

/**
 * A fake NEO for the wizard: `configureFiscalSystem` creates the records of the asked system (or
 * refuses with `refusal`), and each record reads back by id.
 */
function createBackend({ refusal = null } = {}) {
  return vi.fn((path, opts = {}) => {
    if (path.includes('/action/configureFiscalSystem')) {
      if (refusal) return jsonResponse({ error: { message: refusal, status: 409 } }, { ok: false, status: 409 });
      const { system, territory } = JSON.parse(opts.body);
      const created = (RECORD_SYSTEMS[system] ?? []).map(s => ({ system: s, id: `${s.toLowerCase()}-rec-1` }));
      return jsonResponse({ response: { data: { system, territory, created } } });
    }
    const m = /^\/(sii|tbai|verifactu)-config\/[^/]+\/([^/?]+)$/.exec(path);
    if (m) return jsonResponse({ response: { data: [{ id: m[2] }] } });
    return jsonResponse({});
  });
}

function actionCalls() {
  return backend.fetch.mock.calls.filter(([path]) => path.includes('/action/configureFiscalSystem'));
}

function actionBody() {
  const calls = actionCalls();
  expect(calls).toHaveLength(1);
  expect(calls[0][0]).toBe(ACTION_PATH);
  expect(calls[0][1].method).toBe('POST');
  return JSON.parse(calls[0][1].body);
}

beforeEach(() => {
  backend.fetch = createBackend();
  catalogState.value = { catalog: FISCAL_SYSTEM_CATALOG, error: null, loading: false };
});

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

  it('shows the catalog system options after selecting a territory', () => {
    navigateToManual();
    fireEvent.click(screen.getByText('fiscal.territory.alava'));
    expect(screen.getByText('TicketBAI')).toBeInTheDocument();
    expect(screen.getByText('SII + TicketBAI')).toBeInTheDocument();
    expect(screen.queryByText('VERI*FACTU')).not.toBeInTheDocument();
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

// ETP-6053 — the manual screen offers exactly the systems the backend catalog allows for the
// picked territory (ETP-5272 point 4: Ceuta/Melilla is VERI*FACTU only).
describe('OnboardingWizard — ManualScreen offers the catalog systems per territory', () => {
  const SYSTEM_LABELS = { SII: 'SII', TBAI: 'TicketBAI', 'SII+TBAI': 'SII + TicketBAI', VERIFACTU: 'VERI*FACTU' };
  const TERRITORY_LABELS = {
    navarra: 'fiscal.territory.navarra', alava: 'fiscal.territory.alava', bizkaia: 'fiscal.territory.bizkaia',
    gipuzkoa: 'fiscal.territory.gipuzkoa', baleares: 'fiscal.territory.espania',
    canarias: 'fiscal.territory.canarias', ceuta: 'fiscal.territory.ceuta',
  };

  function navigateToManual() {
    renderWizard();
    fireEvent.click(screen.getByText('fiscal.onboarding.territory.prefer.manual.link'));
  }

  it.each(FISCAL_SYSTEM_CATALOG.territories.map(t => [t.territory, t.systems]))(
    '%s offers exactly %j',
    (territory, systems) => {
      navigateToManual();
      fireEvent.click(screen.getByText(TERRITORY_LABELS[territory]));
      for (const [id, label] of Object.entries(SYSTEM_LABELS)) {
        if (systems.includes(id)) expect(screen.getByText(label)).toBeInTheDocument();
        else expect(screen.queryByText(label)).not.toBeInTheDocument();
      }
    },
  );

  it('follows the catalog it is given, not a local table', () => {
    catalogState.value = {
      catalog: { territories: [{ territory: 'navarra', systems: ['VERIFACTU'] }] },
      error: null,
      loading: false,
    };
    navigateToManual();
    fireEvent.click(screen.getByText('fiscal.territory.navarra'));
    expect(screen.getByText('VERI*FACTU')).toBeInTheDocument();
    expect(screen.queryByText('SII')).not.toBeInTheDocument();
  });

  it('offers no system while the catalog is not loaded, so Continue stays disabled', () => {
    catalogState.value = { catalog: null, error: null, loading: true };
    navigateToManual();
    fireEvent.click(screen.getByText('fiscal.territory.navarra'));
    for (const label of Object.values(SYSTEM_LABELS)) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
    expect(screen.getByText('fiscal.onboarding.continue')).toBeDisabled();
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
    // Manual path: navarra + SII.
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


// ETP-6053 — Confirm activates the system with the organization's configureFiscalSystem action:
// the wizard sends only the resolved system and the territory, the server builds the records.
describe('OnboardingWizard — confirm calls configureFiscalSystem', () => {
  const continueBtn = () => screen.getByText('fiscal.onboarding.continue');

  /** Territory path: pick the card, answer the sub-questions (labels, in order), confirm. */
  async function confirmPath(territoryLabel, answers = []) {
    renderWizard();
    fireEvent.click(screen.getByText(territoryLabel));
    fireEvent.click(continueBtn());
    if (answers.length) {
      for (const answer of answers) fireEvent.click(screen.getByText(answer));
      fireEvent.click(continueBtn());
    }
    fireEvent.click(screen.getByTestId('OnboardingWizard__confirmActivateButton'));
    await waitFor(() => expect(screen.getByText('fiscal.save')).toBeInTheDocument());
  }

  const ONLY_TBAI = 'fiscal.onboarding.subq.tbai.label';
  const ALSO_SII = 'fiscal.onboarding.subq.sii.label';
  const HIGH = 'fiscal.onboarding.subq.obligation.yes.label';
  const LOW = 'fiscal.onboarding.subq.obligation.no.label';
  const LOW_SII = 'fiscal.onboarding.subq.sii.vol.label';
  const LOW_VERIFACTU = 'fiscal.onboarding.subq.verifactu.label';

  it.each([
    ['Navarra', 'fiscal.territory.navarra', [], { system: 'SII', territory: 'navarra' }],
    ['Álava, TicketBAI only', 'fiscal.territory.alava', [ONLY_TBAI], { system: 'TBAI', territory: 'alava' }],
    ['Álava, also national SII', 'fiscal.territory.alava', [ALSO_SII], { system: 'SII+TBAI', territory: 'alava' }],
    ['Bizkaia, TicketBAI only', 'fiscal.territory.bizkaia', [ONLY_TBAI], { system: 'TBAI', territory: 'bizkaia' }],
    ['Bizkaia, also national SII', 'fiscal.territory.bizkaia', [ALSO_SII], { system: 'SII+TBAI', territory: 'bizkaia' }],
    ['Gipuzkoa, TicketBAI only', 'fiscal.territory.gipuzkoa', [ONLY_TBAI], { system: 'TBAI', territory: 'gipuzkoa' }],
    ['Gipuzkoa, also national SII', 'fiscal.territory.gipuzkoa', [ALSO_SII], { system: 'SII+TBAI', territory: 'gipuzkoa' }],
    ['Baleares, high volume', 'fiscal.territory.espania', [HIGH], { system: 'SII', territory: 'baleares' }],
    ['Baleares, low volume choosing SII', 'fiscal.territory.espania', [LOW, LOW_SII], { system: 'SII', territory: 'baleares' }],
    ['Baleares, low volume choosing VERI*FACTU', 'fiscal.territory.espania', [LOW, LOW_VERIFACTU], { system: 'VERIFACTU', territory: 'baleares' }],
    ['Canarias, high volume', 'fiscal.territory.canarias', [HIGH], { system: 'SII', territory: 'canarias' }],
    ['Canarias, low volume choosing VERI*FACTU', 'fiscal.territory.canarias', [LOW, LOW_VERIFACTU], { system: 'VERIFACTU', territory: 'canarias' }],
    ['Ceuta / Melilla (no sub-question, VERI*FACTU only)', 'fiscal.territory.ceuta', [], { system: 'VERIFACTU', territory: 'ceuta' }],
  ])('%s → %j', async (_label, territoryLabel, answers, expected) => {
    await confirmPath(territoryLabel, answers);
    expect(actionBody()).toEqual(expected);
  });

  it.each([
    ['fiscal.territory.navarra', 'SII', { system: 'SII', territory: 'navarra' }],
    ['fiscal.territory.alava', 'SII + TicketBAI', { system: 'SII+TBAI', territory: 'alava' }],
    ['fiscal.territory.ceuta', 'VERI*FACTU', { system: 'VERIFACTU', territory: 'ceuta' }],
    ['fiscal.territory.canarias', 'VERI*FACTU', { system: 'VERIFACTU', territory: 'canarias' }],
  ])('manual path %s + %s → %j', async (territoryLabel, systemLabel, expected) => {
    renderWizard();
    fireEvent.click(screen.getByText('fiscal.onboarding.territory.prefer.manual.link'));
    fireEvent.click(screen.getByText(territoryLabel));
    fireEvent.click(screen.getByText(systemLabel));
    fireEvent.click(continueBtn());
    fireEvent.click(screen.getByTestId('OnboardingWizard__confirmActivateButton'));
    await waitFor(() => expect(screen.getByText('fiscal.save')).toBeInTheDocument());
    expect(actionBody()).toEqual(expected);
  });

  it('never POSTs a config record itself — the only write is the action', async () => {
    await confirmPath('fiscal.territory.alava', [ALSO_SII]);
    const posts = backend.fetch.mock.calls.filter(([, opts]) => opts?.method === 'POST');
    expect(posts.map(([path]) => path)).toEqual([ACTION_PATH]);
  });

  it('reads back every created record and mounts its detail section', async () => {
    await confirmPath('fiscal.territory.alava', [ALSO_SII]);
    const reads = backend.fetch.mock.calls.map(([path]) => path).filter(p => !p.includes('/action/'));
    expect(reads).toEqual(['/sii-config/siiConfiguration/sii-rec-1', '/tbai-config/header/tbai-rec-1']);
    expect(screen.getByTestId('sii-section')).toBeInTheDocument();
    expect(screen.getByTestId('tbai-section')).toBeInTheDocument();
  });

  it('mounts the VERI*FACTU section for a VERI*FACTU activation', async () => {
    await confirmPath('fiscal.territory.ceuta');
    expect(screen.getByTestId('verifactu-section')).toBeInTheDocument();
    expect(screen.queryByTestId('sii-section')).not.toBeInTheDocument();
  });

  it('shows the backend refusal message on the confirm step and stays there', async () => {
    backend.fetch = createBackend({ refusal: 'Ya hay un sistema de facturación activo para esta organización.' });
    renderWizard();
    fireEvent.click(screen.getByText('fiscal.territory.navarra'));
    fireEvent.click(continueBtn());
    const confirm = screen.getByTestId('OnboardingWizard__confirmActivateButton');
    fireEvent.click(confirm);

    const message = await screen.findByText('Ya hay un sistema de facturación activo para esta organización.');
    // The confirm screen's own error line (the action buttons sit in its footer).
    expect(message.tagName).toBe('P');
    expect(message).toHaveClass('text-destructive');
    expect(screen.getByText('fiscal.onboarding.confirm.title')).toBeInTheDocument();
    expect(screen.queryByText('fiscal.save')).not.toBeInTheDocument();
    expect(screen.getByTestId('OnboardingWizard__confirmActivateButton')).not.toBeDisabled();
  });

  it('shows a network failure message the same way', async () => {
    backend.fetch = vi.fn(() => Promise.reject(new Error('Network error')));
    renderWizard();
    fireEvent.click(screen.getByText('fiscal.territory.navarra'));
    fireEvent.click(continueBtn());
    fireEvent.click(screen.getByTestId('OnboardingWizard__confirmActivateButton'));

    expect(await screen.findByText('Network error')).toBeInTheDocument();
  });

  it('shows fiscal.err.noPermission, never NEO\'s raw English denial, on a 403 without messageKeys', async () => {
    const RAW = 'Access denied to spec for current role';
    backend.fetch = vi.fn((path) => (path.includes('/action/configureFiscalSystem')
      ? jsonResponse({ error: { message: RAW, status: 403 } }, { ok: false, status: 403 })
      : jsonResponse({})));
    renderWizard();
    fireEvent.click(screen.getByText('fiscal.territory.navarra'));
    fireEvent.click(continueBtn());
    fireEvent.click(screen.getByTestId('OnboardingWizard__confirmActivateButton'));

    const message = await screen.findByText('fiscal.err.noPermission');
    expect(message).toHaveClass('text-destructive');
    expect(screen.queryByText(RAW)).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(RAW);
    expect(screen.getByText('fiscal.onboarding.confirm.title')).toBeInTheDocument();
  });

  it('shows the server message of a 403 that carries messageKeys (the action worded it)', async () => {
    const KEYED = 'No tiene permiso de escritura en VERI*FACTU.';
    backend.fetch = vi.fn((path) => (path.includes('/action/configureFiscalSystem')
      ? jsonResponse({ error: { message: KEYED, status: 403, messageKeys: ['fiscal.noWrite'] } }, { ok: false, status: 403 })
      : jsonResponse({})));
    renderWizard();
    fireEvent.click(screen.getByText('fiscal.territory.navarra'));
    fireEvent.click(continueBtn());
    fireEvent.click(screen.getByTestId('OnboardingWizard__confirmActivateButton'));

    expect(await screen.findByText(KEYED)).toBeInTheDocument();
    expect(screen.queryByText('fiscal.err.noPermission')).not.toBeInTheDocument();
  });
});

// ETP-6053 — a catalog that cannot be read is said, not silently turned into an empty choice.
describe('OnboardingWizard — fiscal catalog', () => {
  it('reads the catalog for the selected organization', () => {
    renderWizard();
    expect(useFiscalCatalog).toHaveBeenCalledWith('/api/fiscal-config', 'org-1');
  });

  it('shows the catalog-load error banner when the catalog fails to load', () => {
    catalogState.value = { catalog: null, error: 'Could not read the fiscal system catalog.', loading: false };
    renderWizard();
    const banner = screen.getByTestId('OnboardingWizard__catalogErrorBanner');
    expect(banner).toHaveTextContent('fiscal.catalog.err.load');
  });

  it('shows fiscal.err.noPermission in the banner when the role may not read the catalog', () => {
    const RAW = 'Access denied to spec for current role';
    catalogState.value = { catalog: null, error: RAW, forbidden: true, loading: false };
    renderWizard();
    const banner = screen.getByTestId('OnboardingWizard__catalogErrorBanner');
    expect(banner).toHaveTextContent('fiscal.err.noPermission');
    expect(banner).not.toHaveTextContent('fiscal.catalog.err.load');
    expect(document.body).not.toHaveTextContent(RAW);
  });

  it('shows no catalog-load banner while the catalog loads or once it is loaded', () => {
    catalogState.value = { catalog: null, error: null, loading: true };
    const { unmount } = renderWizard();
    expect(screen.queryByTestId('OnboardingWizard__catalogErrorBanner')).not.toBeInTheDocument();
    unmount();

    catalogState.value = { catalog: FISCAL_SYSTEM_CATALOG, error: null, loading: false };
    renderWizard();
    expect(screen.queryByTestId('OnboardingWizard__catalogErrorBanner')).not.toBeInTheDocument();
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
// performs a first-time fiscal-system ACTIVATION (createRecords() calls the
// configureFiscalSystem action on the confirm step, ETP-6053), which
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
    const mockFetch = backend.fetch;

    navigateToConfirmViaNavarra({ forceTestMode: true });
    fireEvent.click(screen.getByTestId('OnboardingWizard__confirmActivateButton'));

    // Disabled button never fires onClick, and createRecords() itself also
    // short-circuits on forceTestMode — either way, no network write happens.
    expect(mockFetch).not.toHaveBeenCalled();
    expect(screen.queryByText('fiscal.save')).not.toBeInTheDocument();
  });

  it('clicking the confirm button still activates the system when forceTestMode is false (no regression)', async () => {
    navigateToConfirmViaNavarra({ forceTestMode: false });
    fireEvent.click(screen.getByTestId('OnboardingWizard__confirmActivateButton'));

    await waitFor(() => {
      expect(screen.getByText('fiscal.save')).toBeInTheDocument();
    });
    expect(actionBody()).toEqual({ system: 'SII', territory: 'navarra' });
  });

  it('disables the detail-screen Save button when forceTestMode is true (defense-in-depth for a mid-session flip)', async () => {
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
