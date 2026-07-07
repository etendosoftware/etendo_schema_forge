import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ── Mocks ────────────────────────────────────────────────────────────────────
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: vi.fn(() => ({ selectedOrg: { id: 'org-1', name: 'Test Org' } })),
}));

vi.mock('@/components/layout/PageMetaContext', () => ({
  useSetPageMeta: vi.fn(),
}));

vi.mock('../useGeneralLedgerConfig.js', () => ({
  useGeneralLedgerConfig: vi.fn(),
}));

// DEFAULTS_GROUPS drives REQUIRED_DEFAULTS at module load — provide a minimal
// real-shaped catalog so the required-key computation is deterministic.
vi.mock('../mockCatalogs.js', () => ({
  DEFAULTS_GROUPS: [
    { fields: [{ key: 'bankAsset', required: true }, { key: 'optional', required: false }] },
  ],
}));

vi.mock('../TabBar.jsx', () => ({
  default: ({ tabs, active, onChange }) => (
    <div data-testid="tab-bar">
      {tabs.map((tab, i) => (
        <button key={i} onClick={() => onChange(i)} data-active={active === i}>
          {tab.label}{typeof tab.badge === 'number' ? `:${tab.badge}` : ''}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('../GeneralTab.jsx', () => ({
  default: (props) => <div data-testid="general-tab" data-errors={JSON.stringify(props.errors)} />,
}));
vi.mock('../DefaultsTab.jsx', () => ({
  default: (props) => <div data-testid="defaults-tab" data-errors={JSON.stringify(props.errors)} />,
}));
vi.mock('../DimensionsTab.jsx', () => ({
  default: () => <div data-testid="dimensions-tab" />,
}));
vi.mock('../DocumentsTab.jsx', () => ({
  default: (props) => (
    <div data-testid="documents-tab" data-backed={String(props.documentsBacked)}>{props.documentsNote}</div>
  ),
}));
vi.mock('../GeneralAccountsTab.jsx', () => ({
  default: () => <div data-testid="general-accounts-tab" />,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, className, ...rest }) => (
    <button onClick={onClick} disabled={disabled} className={className} {...rest}>{children}</button>
  ),
}));

vi.mock('lucide-react', () => ({
  Check: (props) => <svg data-testid="icon-check" {...props} />,
}));

import GeneralLedgerConfigPage from '../GeneralLedgerConfigPage.jsx';
import { useGeneralLedgerConfig } from '../useGeneralLedgerConfig.js';
import { useAuth } from '@/auth/AuthContext.jsx';

// ── Helpers ──────────────────────────────────────────────────────────────────
function makeHook(overrides = {}) {
  return {
    general: { name: 'GL', currency: 'EUR' },
    defaults: { bankAsset: 'acct-1' },
    dimensions: [],
    documents: [{ id: 'd1' }, { id: 'd2' }],
    orgInfo: {},
    meta: { documentsBacked: true, documentsNote: 'note-key' },
    catalogs: { currencies: [], accounts: [] },
    generalAccounts: { active: true },
    setGeneralField: vi.fn(),
    setDefaultField: vi.fn(),
    setDimensionField: vi.fn(),
    setGeneralAccountsField: vi.fn(),
    isDirty: true,
    save: vi.fn().mockResolvedValue(undefined),
    loading: false,
    ...overrides,
  };
}

function renderPage(props = {}) {
  return render(<GeneralLedgerConfigPage apiBaseUrl="/api" {...props} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  vi.mocked(useAuth).mockReturnValue({ selectedOrg: { id: 'org-1', name: 'Test Org' } });
  vi.mocked(useGeneralLedgerConfig).mockReturnValue(makeHook());
});

describe('GeneralLedgerConfigPage — initial render', () => {
  it('renders the tab bar and the General tab by default', () => {
    renderPage();
    expect(screen.getByTestId('tab-bar')).toBeInTheDocument();
    expect(screen.getByTestId('general-tab')).toBeInTheDocument();
    expect(screen.queryByTestId('defaults-tab')).not.toBeInTheDocument();
  });

  it('renders the save button with its label', () => {
    renderPage();
    expect(screen.getByTestId('glc-save')).toHaveTextContent('saveChanges');
  });

  it('shows the documents-tab badge count from documents.length', () => {
    renderPage();
    // Documents tab is the 4th tab; badge shows count 2.
    expect(screen.getByText('glc.tab.documents:2')).toBeInTheDocument();
  });
});

describe('GeneralLedgerConfigPage — organization-required note', () => {
  it('shows the note when no org is selected', () => {
    vi.mocked(useAuth).mockReturnValue({ selectedOrg: null });
    renderPage();
    expect(screen.getByTestId('glc-org-required-note')).toBeInTheDocument();
  });

  it('hides the note when an org is selected', () => {
    renderPage();
    expect(screen.queryByTestId('glc-org-required-note')).not.toBeInTheDocument();
  });
});

describe('GeneralLedgerConfigPage — tab switching', () => {
  it('switches to the Defaults tab', () => {
    renderPage();
    fireEvent.click(screen.getByText('glc.tab.defaults'));
    expect(screen.getByTestId('defaults-tab')).toBeInTheDocument();
    expect(screen.queryByTestId('general-tab')).not.toBeInTheDocument();
  });

  it('switches to the Dimensions tab', () => {
    renderPage();
    fireEvent.click(screen.getByText('glc.tab.dimensions'));
    expect(screen.getByTestId('dimensions-tab')).toBeInTheDocument();
  });

  it('switches to the Documents tab and passes backed meta through', () => {
    renderPage();
    fireEvent.click(screen.getByText('glc.tab.documents:2'));
    const docs = screen.getByTestId('documents-tab');
    expect(docs).toBeInTheDocument();
    expect(docs).toHaveAttribute('data-backed', 'true');
    expect(docs).toHaveTextContent('note-key');
  });

  it('switches to the General Accounts tab', () => {
    renderPage();
    fireEvent.click(screen.getByText('glc.tab.generalAccounts'));
    expect(screen.getByTestId('general-accounts-tab')).toBeInTheDocument();
    expect(screen.queryByTestId('general-tab')).not.toBeInTheDocument();
  });
});

describe('GeneralLedgerConfigPage — save button disabled state', () => {
  it('is disabled when not dirty', () => {
    vi.mocked(useGeneralLedgerConfig).mockReturnValue(makeHook({ isDirty: false }));
    renderPage();
    expect(screen.getByTestId('glc-save')).toBeDisabled();
  });

  it('is disabled when no org is selected', () => {
    vi.mocked(useAuth).mockReturnValue({ selectedOrg: null });
    renderPage();
    expect(screen.getByTestId('glc-save')).toBeDisabled();
  });

  it('is disabled while loading', () => {
    vi.mocked(useGeneralLedgerConfig).mockReturnValue(makeHook({ loading: true }));
    renderPage();
    expect(screen.getByTestId('glc-save')).toBeDisabled();
  });

  it('is enabled when dirty, org selected, and not loading', () => {
    renderPage();
    expect(screen.getByTestId('glc-save')).not.toBeDisabled();
  });
});

describe('GeneralLedgerConfigPage — save success', () => {
  it('calls save() and shows the saved-ok state', async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useGeneralLedgerConfig).mockReturnValue(makeHook({ save }));
    renderPage();
    const btn = screen.getByTestId('glc-save');

    await act(async () => {
      fireEvent.click(btn);
    });
    expect(save).toHaveBeenCalledTimes(1);
    // savedOk toggles the green class on the button.
    expect(btn.className).toContain('bg-green-600');

    // After the 2500ms timeout the green state clears.
    await act(async () => {
      vi.advanceTimersByTime(2600);
    });
    expect(btn.className).not.toContain('bg-green-600');
    vi.useRealTimers();
  });
});

describe('GeneralLedgerConfigPage — validation blocks save', () => {
  it('does not call save and surfaces general errors when a required general field is empty', async () => {
    const save = vi.fn();
    vi.mocked(useGeneralLedgerConfig).mockReturnValue(
      makeHook({ save, general: { name: '', currency: 'EUR' } }),
    );
    renderPage();
    // Start on Defaults tab; a general error must jump the user back to tab 0.
    fireEvent.click(screen.getByText('glc.tab.defaults'));
    expect(screen.getByTestId('defaults-tab')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId('glc-save'));
    });
    expect(save).not.toHaveBeenCalled();
    // Jumped back to the General tab, and the error map is populated.
    const general = await screen.findByTestId('general-tab');
    expect(JSON.parse(general.getAttribute('data-errors'))).toHaveProperty('name');
  });

  it('jumps to the Defaults tab when only a required default is missing', async () => {
    const save = vi.fn();
    vi.mocked(useGeneralLedgerConfig).mockReturnValue(
      makeHook({ save, defaults: { bankAsset: '' } }),
    );
    renderPage();
    // Starts on General (tab 0); defaults error must jump to tab 1.
    await act(async () => {
      fireEvent.click(screen.getByTestId('glc-save'));
    });
    expect(save).not.toHaveBeenCalled();
    const defaults = await screen.findByTestId('defaults-tab');
    expect(JSON.parse(defaults.getAttribute('data-errors'))).toHaveProperty('bankAsset');
  });
});
