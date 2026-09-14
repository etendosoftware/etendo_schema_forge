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

// --- Shared fixtures ---

const SPAIN = { id: 'ES-ID', label: 'España' };
const FRANCE = { id: 'FR-ID', label: 'Francia' };

const BASE_PROPS = {
  bpApiBaseUrl: 'http://localhost/sws/neo/contacts',
  headers: { Authorization: 'Bearer test-token', 'Accept-Language': 'es_ES', 'Content-Type': 'application/json' },
  onClose: vi.fn(),
  onCreated: vi.fn(),
};

/**
 * Serve a country catalog to the C_Country_ID selector and an empty list to
 * every other one. Shared by the pre-fill and default-country suites, which
 * both hinge on what that single selector returns.
 */
function mockFetchWithCountries(countries) {
  globalThis.fetch = vi.fn((url) => {
    if (typeof url === 'string' && url.includes('C_Country_ID')) {
      return Promise.resolve({ ok: true, json: async () => ({ items: countries, hasMore: false }) });
    }
    return Promise.resolve({ ok: true, json: async () => ({ items: [] }) });
  });
}

/** URLs the component has requested so far, for asserting a follow-up fetch. */
function fetchedUrls() {
  return globalThis.fetch.mock.calls.map(([url]) => String(url));
}

// --- Tests ---

describe('CreateContactModal', () => {
  const defaultProps = {
    ...BASE_PROPS,
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
  const baseProps = BASE_PROPS;

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
    mockFetchWithCountries([SPAIN, FRANCE]);
    render(<CreateContactModal {...baseProps} prefill={OCR_PREFILL} />);
    await waitFor(() => {
      expect(capturedProps.patchValues?.country).toBe(SPAIN.id);
    });
  });

  it('leaves the country unset when no option matches the printed label', async () => {
    mockFetchWithCountries([FRANCE]);
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

/**
 * ETP-5103 — the address of a new contact opens with Spain preselected and
 * cannot be saved with an empty "Primera línea".
 *
 * The behaviour is asserted through the props handed to EntityCreationModal,
 * which is stubbed here: `patchValues` is what preselects the country (its merge
 * writes only still-empty fields) and `requiredFields` is what both draws the
 * asterisk in AddressSection and gates the Save button. Both have their own
 * suites; this one pins what CreateContactModal decides.
 */
describe('CreateContactModal — ETP-5103 default country and mandatory address', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProps = {};
    mockFetchWithCountries([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Render and wait for the country catalog to land in `opts`. */
  async function renderWithCatalog(countries, props = {}) {
    mockFetchWithCountries(countries);
    const view = render(<CreateContactModal {...BASE_PROPS} {...props} />);
    await waitFor(() => {
      expect(capturedProps.opts.countries.options).toHaveLength(countries.length);
    });
    return view;
  }

  // CP-1
  it('preselects Spain once the country catalog has loaded', async () => {
    await renderWithCatalog([FRANCE, SPAIN]);
    expect(capturedProps.patchValues).toEqual({ country: SPAIN.id });
  });

  it('resolves the default from the English label too', async () => {
    // The selector labels are translated, so an en_US session never sees "España".
    const spainInEnglish = { id: SPAIN.id, label: 'Spain' };
    await renderWithCatalog([spainInEnglish]);
    expect(capturedProps.patchValues.country).toBe(SPAIN.id);
  });

  it('fetches the regions of the defaulted country', async () => {
    // Regions hang off `currentCountry`, which normally only the field's own
    // onChange feeds. A defaulted country bypasses it, so without an explicit
    // seed the Región picker would unlock on an empty list.
    await renderWithCatalog([SPAIN]);
    await waitFor(() => {
      const regionCall = fetchedUrls().find(url => url.includes('C_Region_ID'));
      expect(regionCall).toContain(`C_Country_ID=${SPAIN.id}`);
    });
  });

  it('leaves the country alone when the catalog has no Spain', async () => {
    // Never guess: an instance that does not expose Spain has nothing to preselect.
    await renderWithCatalog([FRANCE]);
    expect(capturedProps.patchValues).toBeNull();
  });

  // CP-2 — the user may change the preselected country. `patchValues` is the
  // mechanism that keeps that possible: EntityCreationModal writes it only into
  // still-empty fields, so once a country is in the form the default is inert.
  it('keeps the default patch stable so it cannot re-apply over a later choice', async () => {
    const { rerender } = await renderWithCatalog([SPAIN]);
    const firstPatch = capturedProps.patchValues;

    rerender(<CreateContactModal {...BASE_PROPS} />);
    expect(capturedProps.patchValues).toBe(firstPatch);
  });

  it('lets an extracted country win over the default', async () => {
    // An explicit pre-fill is evidence about THIS contact; the default is only a
    // convenience. Scanning a French invoice must not file the vendor in Spain.
    await renderWithCatalog([FRANCE, SPAIN], { prefill: { country: 'Francia' } });
    await waitFor(() => {
      expect(capturedProps.patchValues.country).toBe(FRANCE.id);
    });
  });

  // CP-3 / CP-4 / CP-5 / CP-6 — all four follow from this list: AddressSection
  // draws the asterisk for the ids it contains and EntityCreationModal disables
  // Save until each one holds a value.
  it('marks the first address line as required in company mode', () => {
    render(<CreateContactModal {...BASE_PROPS} />);
    expect(capturedProps.requiredFields).toContain('address');
  });

  it('marks the first address line as required in person mode', async () => {
    const user = userEvent.setup();
    render(<CreateContactModal {...BASE_PROPS} />);

    await user.click(screen.getByText('Person'));
    expect(capturedProps.requiredFields).toContain('address');
  });

  it('does not make the remaining address fields required', () => {
    // Only "Primera línea" was asked for — the rest of the Dirección tab stays
    // optional, so a contact with a partial address can still be created.
    render(<CreateContactModal {...BASE_PROPS} />);
    expect(capturedProps.requiredFields).not.toContain('address2');
    expect(capturedProps.requiredFields).not.toContain('postalCode');
    expect(capturedProps.requiredFields).not.toContain('city');
    expect(capturedProps.requiredFields).not.toContain('region');
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
