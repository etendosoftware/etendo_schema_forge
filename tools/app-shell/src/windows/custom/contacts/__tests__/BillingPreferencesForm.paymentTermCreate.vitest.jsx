// @covers tools/app-shell/src/windows/custom/contacts/BillingPreferencesForm.jsx
// @covers tools/app-shell/src/hooks/useCanCreateInSpec.js
// ---------------------------------------------------------------------------
// "+ Crear condición de pago" on a contact's customer AND vendor payment terms, gated by the
// role's write access to the Payment Term window (141).
//
// Its own file because the sibling BillingPreferencesForm suites stub `EntityForm` module-wide;
// this behaviour needs the REAL EntityForm → InlineCreateSelector → gate chain. Only the leaf
// selector is stubbed (it exposes the create label it was given), plus the session the gate reads
// and the form's own discount requests.
// ---------------------------------------------------------------------------
vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

const session = vi.hoisted(() => ({ windowAccess: {}, capabilities: {} }));
vi.mock('@/hooks/useCapabilitiesSafe.js', () => ({
  useWindowAccessSafe: () => session.windowAccess,
  useCapabilitiesSafe: () => session.capabilities,
}));

const mockApiFetch = vi.hoisted(() => vi.fn());
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => mockApiFetch }));

vi.mock('@/components/contract-ui/CreatableSearchSelect.jsx', () => ({
  CreatableSearchSelect: ({ field, createLabel, onCreateRequest }) => (
    <div data-testid={`select-${field?.key}`}>
      {createLabel && onCreateRequest && (
        <button type="button" data-testid={`create-${field?.key}`}>{createLabel}</button>
      )}
    </div>
  ),
}));

import { render, screen } from '@testing-library/react';
import BillingPreferencesForm from '../BillingPreferencesForm';

const TERMS_FIELDS = ['paymentTerms', 'pOPaymentTerms'];

function renderForm() {
  render(
    <BillingPreferencesForm
      data={{ id: 'BP1', customer: true, vendor: true }}
      token="t"
      apiBaseUrl="/sws/neo/contacts"
      onChange={vi.fn()}
    />,
  );
}

describe('BillingPreferencesForm — create a payment term from the selector', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ response: { data: [] }, items: [] }) });
    session.windowAccess = {};
    session.capabilities = {};
  });

  it('a "full" grant on Payment Term: both the customer and the vendor terms offer the create row', () => {
    session.windowAccess = { 141: 'full' };
    renderForm();

    for (const key of TERMS_FIELDS) {
      expect(screen.getByTestId(`select-${key}`)).toBeInTheDocument();
      expect(screen.getByTestId(`create-${key}`)).toHaveTextContent('paymentTermCreate');
    }
  });

  it('a read-only grant on Payment Term: neither terms field offers the create row', () => {
    session.windowAccess = { 141: 'read-only' };
    renderForm();

    for (const key of TERMS_FIELDS) {
      expect(screen.getByTestId(`select-${key}`)).toBeInTheDocument();
      expect(screen.queryByTestId(`create-${key}`)).not.toBeInTheDocument();
    }
  });

  it('access not loaded: neither terms field offers the create row (fail closed)', () => {
    renderForm();

    for (const key of TERMS_FIELDS) {
      expect(screen.queryByTestId(`create-${key}`)).not.toBeInTheDocument();
    }
  });

  it('no other billing selector offers a create row', () => {
    session.capabilities = { isAdminOrClientAdmin: true };
    renderForm();

    const createRows = screen.queryAllByTestId(/^create-/).map((el) => el.dataset.testid);
    expect(createRows.sort()).toEqual(['create-pOPaymentTerms', 'create-paymentTerms']);
  });
});
