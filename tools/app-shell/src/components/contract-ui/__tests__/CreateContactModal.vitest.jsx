/**
 * Integration render test for CreateContactModal.
 * Renders the real component with mocked dependencies.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// --- Mocks (before imports) ---

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
}));

vi.mock('@/i18n/useLocaleState', () => ({
  useLocaleState: () => ['en_US', vi.fn()],
}));

// Stub EntityCreationModal — it's a heavy component with its own tests.
// Capture the props passed to it so we can assert on them.
let capturedProps = {};
vi.mock('../EntityCreationModal.jsx', () => ({
  default: (props) => {
    capturedProps = props;
    return (
      <div data-testid="entity-creation-modal">
        <span data-testid="modal-title">{props.title}</span>
        <span data-testid="modal-save-label">{props.saveLabel}</span>
        {props.titleRightContent}
        <button data-testid="save-btn" onClick={() => props.onSave?.({}, { contacts: [], bankAccount: [] })}>
          save
        </button>
        <button data-testid="cancel-btn" onClick={() => props.onCancel?.()}>
          cancel
        </button>
      </div>
    );
  },
}));

vi.mock('../FinancialSection.jsx', () => ({
  default: () => <div data-testid="financial-section" />,
}));

vi.mock('../AddressSection.jsx', () => ({
  default: () => <div data-testid="address-section" />,
}));

vi.mock('../contactModalConfig.js', () => ({
  contactModalConfig: {
    headerFields: [
      { id: 'name', labelKey: 'contactName', type: 'text', required: true },
    ],
    sections: [],
    repeatableSections: [],
    progressFields: ['name', 'taxIdType', 'taxID', 'country'],
  },
}));

import CreateContactModal, { getBillingPatch } from '../CreateContactModal.jsx';

// --- Tests ---

describe('CreateContactModal', () => {
  const defaultProps = {
    bpApiBaseUrl: 'http://localhost/sws/neo/contacts',
    headers: { Authorization: 'Bearer test-token', 'Accept-Language': 'es_ES', 'Content-Type': 'application/json' },
    onClose: vi.fn(),
    onCreated: vi.fn(),
    initialQuery: '',
    documentType: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    capturedProps = {};
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders without crashing', () => {
    render(<CreateContactModal {...defaultProps} />);
    expect(screen.getByTestId('entity-creation-modal')).toBeInTheDocument();
  });

  it('passes translated title and saveLabel', () => {
    render(<CreateContactModal {...defaultProps} />);
    expect(screen.getByTestId('modal-title')).toHaveTextContent('newContact');
    expect(screen.getByTestId('modal-save-label')).toHaveTextContent('saveContact');
  });

  it('renders ContactModeToggle in titleRightContent', () => {
    render(<CreateContactModal {...defaultProps} />);
    // The toggle has Person and company buttons
    expect(screen.getByText('Person')).toBeInTheDocument();
    expect(screen.getByText('company')).toBeInTheDocument();
  });

  it('defaults to company mode', () => {
    render(<CreateContactModal {...defaultProps} />);
    // In company mode, requiredFields should contain "name"
    expect(capturedProps.requiredFields).toContain('name');
    expect(capturedProps.requiredFields).not.toContain('etgoFirstname');
  });

  it('switches to person mode when Person button is clicked', async () => {
    const user = userEvent.setup();
    render(<CreateContactModal {...defaultProps} />);
    await user.click(screen.getByText('Person'));
    // In person mode, requiredFields should contain firstname/lastname
    expect(capturedProps.requiredFields).toContain('etgoFirstname');
    expect(capturedProps.requiredFields).toContain('etgoLastname');
    expect(capturedProps.requiredFields).not.toContain('name');
  });

  // --- ETP-4566: Categoría de contacto (businessPartnerCategory) ---

  it('marks businessPartnerCategory as required in both company and person mode', async () => {
    const user = userEvent.setup();
    render(<CreateContactModal {...defaultProps} />);
    expect(capturedProps.requiredFields).toContain('businessPartnerCategory');

    await user.click(screen.getByText('Person'));
    expect(capturedProps.requiredFields).toContain('businessPartnerCategory');
  });

  it('renders businessPartnerCategory as a dynamicSelect header field next to the legal name', () => {
    render(<CreateContactModal {...defaultProps} />);
    const headerFieldIds = capturedProps.headerFields.map(f => f.id);
    expect(headerFieldIds).toContain('businessPartnerCategory');

    const field = capturedProps.headerFields.find(f => f.id === 'businessPartnerCategory');
    expect(field.type).toBe('dynamicSelect');
    expect(field.optionsKey).toBe('businessPartnerCategories');
    expect(field.required).toBe(true);
    expect(field.labelKey).toBe('contactCategoryField');

    // Adjacent to the legal name field (Razón Social) in company mode
    expect(headerFieldIds.indexOf('businessPartnerCategory')).toBe(headerFieldIds.indexOf('name') + 1);
  });

  it('defaults businessPartnerCategory to an empty value (no hardcoded category)', () => {
    render(<CreateContactModal {...defaultProps} />);
    expect(capturedProps.initialValues.businessPartnerCategory).toBe('');
  });

  it('fetches businessPartnerCategory selector options from C_BP_Group_ID', async () => {
    render(<CreateContactModal {...defaultProps} />);
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });
    const urls = globalThis.fetch.mock.calls.map(c => c[0]);
    expect(urls.some(u => typeof u === 'string' && u.includes('/selectors/C_BP_Group_ID'))).toBe(true);
  });

  it('exposes businessPartnerCategories in opts with an onRetry callback', () => {
    render(<CreateContactModal {...defaultProps} />);
    const opts = capturedProps.opts;
    expect(opts.businessPartnerCategories).toBeDefined();
    expect(typeof opts.businessPartnerCategories.onRetry).toBe('function');
  });

  it('includes businessPartnerCategory in the create payload sent on save', async () => {
    globalThis.fetch = vi.fn((url, init) => {
      if (init?.method === 'POST' && typeof url === 'string' && url.endsWith('/businessPartner')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ response: { data: [{ id: 'bp-1', name: 'Acme' }] } }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ items: [] }) });
    });

    render(<CreateContactModal {...defaultProps} />);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());

    // Simulate a fully-filled form (as EntityCreationModal would provide once
    // requiredFields — including businessPartnerCategory — are satisfied).
    await capturedProps.onSave(
      { name: 'Acme', taxID: 'B123', taxIdType: '1', businessPartnerCategory: 'cat-1', country: 'ES' },
      { contacts: [], bankAccount: [] }
    );

    const createCall = globalThis.fetch.mock.calls.find(
      ([url, init]) => init?.method === 'POST' && typeof url === 'string' && url.endsWith('/businessPartner')
    );
    expect(createCall).toBeDefined();
    const payload = JSON.parse(createCall[1].body);
    expect(payload.businessPartnerCategory).toBe('cat-1');
  });

  it('calls onClose when cancel is triggered', async () => {
    const user = userEvent.setup();
    render(<CreateContactModal {...defaultProps} />);
    await user.click(screen.getByTestId('cancel-btn'));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('sets isCustomer=true when documentType is sale', () => {
    render(<CreateContactModal {...defaultProps} documentType="sale" />);
    expect(capturedProps.initialValues.isCustomer).toBe(true);
    expect(capturedProps.initialValues.isVendor).toBe(false);
  });

  it('sets isVendor=true when documentType is purchase', () => {
    render(<CreateContactModal {...defaultProps} documentType="purchase" />);
    expect(capturedProps.initialValues.isCustomer).toBe(false);
    expect(capturedProps.initialValues.isVendor).toBe(true);
  });

  it('fetches selectors on mount', async () => {
    render(<CreateContactModal {...defaultProps} />);
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });
    // Should fetch taxIdTypes, salesPriceLists, etc.
    const urls = globalThis.fetch.mock.calls.map(c => c[0]);
    expect(urls.some(u => typeof u === 'string' && u.includes('selectors'))).toBe(true);
  });

  it('passes componentMap with AddressSection and FinancialSection', () => {
    render(<CreateContactModal {...defaultProps} />);
    expect(capturedProps.componentMap).toBeDefined();
    expect(capturedProps.componentMap.AddressSection).toBeDefined();
    expect(capturedProps.componentMap.FinancialSection).toBeDefined();
  });

  it('passes opts with onRetry callbacks', () => {
    render(<CreateContactModal {...defaultProps} />);
    const opts = capturedProps.opts;
    expect(opts).toBeDefined();
    expect(typeof opts.taxIdTypes.onRetry).toBe('function');
    expect(typeof opts.countries.onRetry).toBe('function');
    expect(typeof opts.regions.onRetry).toBe('function');
  });

  it('does not fetch when bpApiBaseUrl is falsy', () => {
    render(<CreateContactModal {...defaultProps} bpApiBaseUrl="" />);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

/**
 * ETP-4855 Error 1 — the create-contact popup opened empty, discarding
 * everything the OCR had already read off the invoice.
 */
describe('CreateContactModal — pre-fill', () => {
  const baseProps = {
    bpApiBaseUrl: 'http://localhost/sws/neo/contacts',
    headers: { Authorization: 'Bearer test-token', 'Accept-Language': 'es_ES', 'Content-Type': 'application/json' },
    onClose: vi.fn(),
    onCreated: vi.fn(),
  };

  const OCR_PREFILL = {
    name: 'Laura Morat',
    taxID: 'B81639719',
    address: 'Calle Mayor 1',
    postalCode: '28001',
    city: 'Madrid',
    country: 'España',
    etgoEmail: 'facturacion@lauramorat.es',
    etgoPhone: '+34 600 123 456',
  };

  function mockFetchWithCountries(countries) {
    globalThis.fetch = vi.fn((url) => {
      if (typeof url === 'string' && url.includes('C_Country_ID')) {
        return Promise.resolve({ ok: true, json: async () => ({ items: countries, hasMore: false }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ items: [] }) });
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    capturedProps = {};
    mockFetchWithCountries([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('seeds every free-text field the extraction found', () => {
    render(<CreateContactModal {...baseProps} prefill={OCR_PREFILL} />);
    const values = capturedProps.initialValues;
    expect(values.name).toBe('Laura Morat');
    expect(values.taxID).toBe('B81639719');
    expect(values.address).toBe('Calle Mayor 1');
    expect(values.postalCode).toBe('28001');
    expect(values.city).toBe('Madrid');
    expect(values.etgoEmail).toBe('facturacion@lauramorat.es');
    expect(values.etgoPhone).toBe('+34 600 123 456');
  });

  it('keeps the country label out of the form — that field holds an option id', () => {
    render(<CreateContactModal {...baseProps} prefill={OCR_PREFILL} />);
    expect(capturedProps.initialValues.country).toBe('');
  });

  it('resolves the country label to its option id once the selector loads', async () => {
    mockFetchWithCountries([{ id: 'ES-ID', label: 'España' }, { id: 'FR-ID', label: 'Francia' }]);
    render(<CreateContactModal {...baseProps} prefill={OCR_PREFILL} />);
    await waitFor(() => {
      expect(capturedProps.patchValues?.country).toBe('ES-ID');
    });
  });

  it('leaves the country unset when no option matches the printed label', async () => {
    mockFetchWithCountries([{ id: 'FR-ID', label: 'Francia' }]);
    render(<CreateContactModal {...baseProps} prefill={OCR_PREFILL} />);
    // Wait for the options themselves to land, so this cannot pass merely
    // because the match had not been attempted yet.
    await waitFor(() => {
      expect(capturedProps.opts.countries.options).toHaveLength(1);
    });
    expect(capturedProps.patchValues).toBeNull();
  });

  it('pre-fills the legal name from initialQuery when there is no extraction', () => {
    render(<CreateContactModal {...baseProps} initialQuery="Acme SL" />);
    expect(capturedProps.initialValues.name).toBe('Acme SL');
  });

  it('prefers the extracted name over initialQuery', () => {
    render(<CreateContactModal {...baseProps} initialQuery="Laur" prefill={{ name: 'Laura Morat' }} />);
    expect(capturedProps.initialValues.name).toBe('Laura Morat');
  });

  it('ignores blank and unknown-shaped prefill values', () => {
    render(<CreateContactModal {...baseProps} prefill={{ name: '   ', city: null, taxID: 'B1' }} />);
    expect(capturedProps.initialValues.name).toBe('');
    expect(capturedProps.initialValues.city).toBe('');
    expect(capturedProps.initialValues.taxID).toBe('B1');
  });

  it('stays inert with no prefill at all', () => {
    render(<CreateContactModal {...baseProps} />);
    expect(capturedProps.initialValues.name).toBe('');
    expect(capturedProps.patchValues).toBeNull();
  });
});

describe('getBillingPatch', () => {
  const baseOpts = {
    salesPriceLists: { options: [{ id: 'pl-1' }] },
    purchasePriceLists: { options: [{ id: 'ppl-1' }] },
    paymentMethods: { options: [{ id: 'pm-1' }] },
    paymentTerms: { options: [{ id: 'pt-1' }] },
    financialAccounts: { options: [{ id: 'fa-1' }] },
  };

  it('returns customer fields when isCustomer is true', () => {
    const form = { isCustomer: true, isVendor: false, customerBlock: false };
    const patch = getBillingPatch(baseOpts, form);
    expect(patch.priceList).toBe('pl-1');
    expect(patch.paymentMethod).toBe('pm-1');
    expect(patch.paymentTerms).toBe('pt-1');
    expect(patch.account).toBe('fa-1');
    expect(patch.customerBlocking).toBe(false);
  });

  it('returns vendor fields when isVendor is true', () => {
    const form = { isCustomer: false, isVendor: true, paymentBlock: true };
    const patch = getBillingPatch(baseOpts, form);
    expect(patch.purchasePricelist).toBe('ppl-1');
    expect(patch.pOPaymentMethod).toBe('pm-1');
    expect(patch.pOPaymentTerms).toBe('pt-1');
    expect(patch.pOFinancialAccount).toBe('fa-1');
    expect(patch.vendorBlocking).toBe(true);
  });

  it('returns empty object when neither customer nor vendor', () => {
    const form = { isCustomer: false, isVendor: false };
    const patch = getBillingPatch(baseOpts, form);
    expect(Object.keys(patch)).toHaveLength(0);
  });

  it('prefers form values over first option', () => {
    const form = { isCustomer: true, isVendor: false, salesPriceList: 'custom-pl', customerBlock: false };
    const patch = getBillingPatch(baseOpts, form);
    expect(patch.priceList).toBe('custom-pl');
  });
});
