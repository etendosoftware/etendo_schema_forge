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
    headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
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
