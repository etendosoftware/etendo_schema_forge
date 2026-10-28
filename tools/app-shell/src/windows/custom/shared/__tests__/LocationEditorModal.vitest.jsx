// @covers tools/app-shell/src/windows/custom/shared/LocationEditorModal.jsx
// @covers tools/app-shell/src/windows/custom/shared/tbaiPostalCodeWarning.js
import { render, screen, fireEvent } from '@testing-library/react';

// --- Global stubs for browser APIs not available in jsdom -----------------

globalThis.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  observe() {}
  unobserve() {}
  disconnect() {}
};

// --- Mocks ----------------------------------------------------------------

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLabel: () => (key) => key,
}));

// ETP-5806 follow-up: the legacy-address banner renders a shared `CopyButton`
// (`@/components/ui/copy-button.jsx`), which imports `Copy` from lucide-react in
// addition to `Check`. The pre-ETP-5806 mock only listed the 5 icons this modal
// imports directly and crashed the moment the banner mounted ("No 'Copy' export
// is defined on the 'lucide-react' mock") — found while extending this suite for
// ETP-5806 (uncaught exception on every test that reached `isLegacyAddress`).
vi.mock('lucide-react', () => ({
  X: (props) => <span data-testid="icon-x" {...props} />,
  Loader2: (props) => <span data-testid="loader" {...props} />,
  Search: (props) => <span data-testid="icon-search" {...props} />,
  ChevronDown: (props) => <span data-testid="icon-chevron" {...props} />,
  Check: (props) => <span data-testid="icon-check" {...props} />,
  Copy: (props) => <span data-testid="icon-copy" {...props} />,
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

// ETP-5806 — `useCapabilitiesSafe()` reads `capabilities` off `useAuth()`. This whole suite
// predates the `structured-address-for-sepa` flag and exercises the structured Street/Number/
// Building Name fields unconditionally, so the default here keeps the flag ON — matching every
// existing test below. The flag-OFF behavior (legacy address lines, legacy save-gating) is
// covered by its own describe block further down, which overrides this mock locally.
vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: vi.fn(() => ({
    token: 'test-token',
    logout: () => {},
    capabilities: { structuredAddressForSepa: true },
  })),
}));

// --- Import under test ----------------------------------------------------

import LocationEditorModal from '../LocationEditorModal.jsx';
import { toast } from 'sonner';
import { useAuth } from '@/auth/AuthContext.jsx';
import { hasUnsavedChanges } from '@/lib/unsavedChanges.js';
import {
  readPartnerCustomer,
  shouldWarnMissingTbaiPostalCode,
} from '../tbaiPostalCodeWarning.js';

/** Restores the default (flag ON) `useAuth()` mock used by every pre-existing test. */
function useCapabilitiesOn() {
  useAuth.mockReturnValue({
    token: 'test-token',
    logout: () => {},
    capabilities: { structuredAddressForSepa: true },
  });
}

/** Switches `useAuth()` to report the `structured-address-for-sepa` flag as off/absent. */
function useCapabilitiesOff(capabilities = {}) {
  useAuth.mockReturnValue({ token: 'test-token', logout: () => {}, capabilities });
}

// --- Helpers --------------------------------------------------------------

function renderModal(overrides = {}) {
  const defaults = {
    open: true,
    onClose: vi.fn(),
    onSaved: vi.fn(),
    rowId: null,
    bpId: 'bp-1',
    apiBase: '/api/contacts',
    token: 'tok',
  };
  return { ...render(<LocationEditorModal {...defaults} {...overrides} />), props: { ...defaults, ...overrides } };
}

// Shared fixtures. Note the default `global.fetch` in `beforeEach` answers every
// selector page with an EMPTY item list, so the ETP-5103 default-country prefill
// resolves to nothing and the country stays empty unless a test opts in by mocking
// a selector response that contains Spain.
const SPAIN_OPTION = { id: 'ES', label: 'Spain' };
const STREET_VALUE = 'Avenida Principal';
const NUMBER_VALUE = '100';
const CITY_VALUE = 'Madrid';
const DEFAULT_COUNTRY_QUERY_PARAM = 'q=Spain';

/**
 * Whether a field label carries the ETP-5103/ETP-5806 mandatory asterisk. RequiredMark
 * renders it as a sibling <span> inside the label element; Testing Library's text queries
 * read only an element's DIRECT text nodes, so the label is still located by its plain key.
 */
function hasRequiredMark(labelKey) {
  const label = screen.getByText(labelKey);
  return Array.from(label.querySelectorAll('span')).some(s => s.textContent === '*');
}

/** The Save button — stable `data-testid`, independent of its i18n label. */
function saveButton() {
  return screen.getByTestId('location-save');
}

// ETP-5806 follow-up — the Save button is gated with `aria-disabled`, NOT the
// native `disabled` attribute (see the component's own comment on the button):
// a natively-disabled button never fires `onClick`, which made `attemptedSave`
// — and therefore every "Este campo es obligatorio" message — unreachable.
// `toBeDisabled()`/`toBeEnabled()` only look at the native attribute, so the
// save-gating assertions below read `aria-disabled` directly instead.
function expectSaveBlocked() {
  expect(saveButton()).toHaveAttribute('aria-disabled', 'true');
}
function expectSaveAllowed() {
  expect(saveButton()).toHaveAttribute('aria-disabled', 'false');
}

/** The Cancel button in the footer. */
function cancelButton() {
  return screen.getByTestId('location-cancel');
}

// ETP-5806 — the free-text Address Line 1/2 inputs were replaced by 3 structured
// fields (Street/Number/Building name); Address1/Address2 are now a read-only,
// computed preview. These helpers target the new fields by their stable testids.
const streetNameInput = () => screen.getByTestId('location-field-streetName');
const buildingNumberInput = () => screen.getByTestId('location-field-buildingNumber');
const buildingNameInput = () => screen.getByTestId('location-field-buildingName');
const postalCodeInput = () => screen.getByTestId('location-field-postalCode');
const cityInput = () => screen.getByTestId('location-field-city');
const countryButton = () => screen.getByTestId('location-field-country');
const regionButton = () => screen.getByTestId('location-field-region');

function typeStreetName(value = STREET_VALUE) {
  fireEvent.change(streetNameInput(), { target: { value } });
}
function typeBuildingNumber(value = NUMBER_VALUE) {
  fireEvent.change(buildingNumberInput(), { target: { value } });
}
function typeCity(value = CITY_VALUE) {
  fireEvent.change(cityInput(), { target: { value } });
}

/** Open the country picker and choose Spain. Requires a selector mock returning it. */
async function selectSpain() {
  fireEvent.click(countryButton());
  fireEvent.click(await screen.findByText(SPAIN_OPTION.label));
}

/**
 * Fills the 4 fields `isSaveBlocked` requires (ETP-5806): Street, Number, City and
 * Country. Every save-path test needs all four now, so the flows exercising POST/PUT
 * go through this helper instead of repeating the sequence.
 */
async function fillMandatoryFields({ street = STREET_VALUE, number = NUMBER_VALUE, city = CITY_VALUE } = {}) {
  typeStreetName(street);
  typeBuildingNumber(number);
  typeCity(city);
  await selectSpain();
}

/** URLs of every selector page requested so far, for prefill assertions. */
function fetchedUrls() {
  return global.fetch.mock.calls.map(([url]) => url);
}

// --- Tests ----------------------------------------------------------------

// ETP-5806 — a global safety net: whichever describe block last overrode `useAuth()` (the
// flag-OFF block below), every other test in this file must still see the flag ON.
afterEach(() => {
  useCapabilitiesOn();
});

describe('LocationEditorModal', () => {
  beforeEach(() => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [], hasMore: false }),
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when open is false', () => {
    const { container } = render(
      <LocationEditorModal
        open={false}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        bpId="bp-1"
        apiBase="/api"
        token="tok"
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the modal when open', () => {
    renderModal();
    expect(screen.getByText('locationSelectorTitle')).toBeInTheDocument();
  });

  it('renders address form fields, including the structured Street/Number/Building name fields (ETP-5806)', () => {
    renderModal();
    expect(screen.getByText('streetNameLabel')).toBeInTheDocument();
    expect(screen.getByText('buildingNumberLabel')).toBeInTheDocument();
    expect(screen.getByText('buildingNameLabel')).toBeInTheDocument();
    expect(screen.getByText('postalCodeLabel')).toBeInTheDocument();
    expect(screen.getByText('cityLabel')).toBeInTheDocument();
    expect(screen.getByText('countryLabel')).toBeInTheDocument();
    expect(screen.getByText('regionLabel')).toBeInTheDocument();
    expect(screen.getByText('resultingAddressLabel')).toBeInTheDocument();
  });

  it('renders save and cancel buttons', () => {
    renderModal();
    expect(saveButton()).toBeInTheDocument();
    expect(cancelButton()).toBeInTheDocument();
  });

  it('calls onClose when cancel button is clicked', () => {
    const { props } = renderModal();
    fireEvent.click(cancelButton());
    expect(props.onClose).toHaveBeenCalled();
  });

  it('renders shipping and invoicing checkboxes', () => {
    renderModal();
    // useLabel/useUI both return the key itself in this suite.
    expect(screen.getByText('shippingAddressLabel')).toBeInTheDocument();
    expect(screen.getByText('billingAddressLabel')).toBeInTheDocument();
  });

  it('renders the shipping/invoicing checkboxes as the shared SquareCheckbox', () => {
    renderModal();
    const shipping = screen.getByTestId('SquareCheckbox__location-shipping');
    const invoicing = screen.getByTestId('SquareCheckbox__location-invoicing');
    expect(shipping.tagName).toBe('INPUT');
    expect(shipping).toHaveAttribute('type', 'checkbox');
    expect(invoicing).toHaveAttribute('type', 'checkbox');
    // Both start from form.shipToAddress / invoiceToAddress (default true on a new location).
    expect(shipping.checked).toBe(true);
    expect(invoicing.checked).toBe(true);
  });

  it('toggling the shipping checkbox updates the form (shipToAddress → IsShipTo)', () => {
    renderModal();
    const shipping = screen.getByTestId('SquareCheckbox__location-shipping');
    expect(shipping.checked).toBe(true);
    fireEvent.click(shipping);
    expect(shipping.checked).toBe(false);
  });

  it('toggling the invoicing checkbox updates the form (invoiceToAddress → IsBillTo)', () => {
    renderModal();
    const invoicing = screen.getByTestId('SquareCheckbox__location-invoicing');
    expect(invoicing.checked).toBe(true);
    fireEvent.click(invoicing);
    expect(invoicing.checked).toBe(false);
  });

  it('does not render remove location button', () => {
    renderModal({ rowId: 'loc-123' });
    expect(screen.queryByText('removeLocation')).not.toBeInTheDocument();
  });

  it('renders exactly 5 text input fields: street, number, building name, postal code, city', () => {
    renderModal();
    const inputs = screen.getAllByRole('textbox');
    expect(inputs).toHaveLength(5);
  });

  it('renders checkboxes for shipping and invoicing', () => {
    renderModal();
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBe(2);
    // Both default to checked
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).toBeChecked();
  });

  it('renders country and region selector buttons with aria-haspopup', () => {
    renderModal();
    expect(countryButton()).toHaveAttribute('aria-haspopup', 'dialog');
    expect(regionButton()).toHaveAttribute('aria-haspopup', 'dialog');
  });

  it('region selector is disabled when no country is selected', () => {
    renderModal();
    expect(regionButton()).toBeDisabled();
    expect(countryButton()).not.toBeDisabled();
  });

  it('shows selectCountryFirst text in region button when no country selected', () => {
    renderModal();
    expect(screen.getByText('selectCountryFirst')).toBeInTheDocument();
  });

  it('calls close when X button is clicked', () => {
    const { props } = renderModal();
    // The close X button has aria-label "close"
    const closeBtn = screen.getByLabelText('close');
    fireEvent.click(closeBtn);
    expect(props.onClose).toHaveBeenCalled();
  });

  it('fetches the existing record and the selector catalogs when editing', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ response: { data: [{ id: 'loc-1', streetName: 'Gran Via', buildingNumber: '1', city: 'Madrid', country: 'ES', 'country$_identifier': 'Spain' }] }, items: [], hasMore: false }),
      }),
    );

    renderModal({ rowId: 'loc-1' });

    await screen.findByText('locationSelectorTitle');
    expect(global.fetch).toHaveBeenCalled();
  });

  it('renders save button disabled for new records with empty mandatory fields', () => {
    renderModal();
    expectSaveBlocked();
  });

  it('allows typing in the street name field', () => {
    renderModal();
    typeStreetName('Calle Mayor');
    expect(streetNameInput()).toHaveValue('Calle Mayor');
  });

  it('allows toggling shipping checkbox off', () => {
    renderModal();
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0]).toBeChecked();
    fireEvent.click(checkboxes[0]);
    expect(checkboxes[0]).not.toBeChecked();
  });

  it('allows toggling invoicing checkbox off', () => {
    renderModal();
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[1]).toBeChecked();
    fireEvent.click(checkboxes[1]);
    expect(checkboxes[1]).not.toBeChecked();
  });

  it('opens country picker when country button is clicked', () => {
    renderModal();
    fireEvent.click(countryButton());
    // Country picker shows a search input with placeholder
    expect(screen.getByPlaceholderText('countrySearchPlaceholder')).toBeInTheDocument();
  });

  it('calls onSaved on successful save when creating a new record', async () => {
    const mockResponse = {
      ok: true,
      json: () => Promise.resolve({
        response: { status: 0, data: [{ id: 'new-loc-1', name: 'New Location' }] },
        items: [],
        hasMore: false,
      }),
    };

    global.fetch = vi.fn((url) => {
      if (url.includes('/locationAddress') && !url.includes('selectors')) {
        return Promise.resolve(mockResponse);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [{ id: 'ES', label: 'Spain' }], hasMore: false }),
      });
    });

    renderModal();

    await fillMandatoryFields();

    fireEvent.click(saveButton());

    // Wait for async save to complete
    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/locationAddress'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  /**
   * ETP-5103 reframed this case, ETP-5806 widened the mandatory set. Country was
   * already mandatory — handleSave refused to save without it and showed the
   * `locationCountryRequired` toast — but the refusal only happened after the click.
   * Now `saveDisabled` covers an empty country (and Street/Number/City), so the button
   * is unreachable and the toast never fires. What still matters, and is asserted here,
   * is the invariant the old test protected: no save request leaves without a country.
   */
  it('keeps save disabled and issues no request when the country is empty', async () => {
    const { toast } = await import('sonner');
    vi.mocked(toast.error).mockClear();
    renderModal();

    // Street/Number/City filled, country still empty (the default mock returns no options).
    typeStreetName();
    typeBuildingNumber();
    typeCity();
    expectSaveBlocked();

    fireEvent.click(saveButton());

    expect(toast.error).not.toHaveBeenCalled();
    const writeCalls = global.fetch.mock.calls.filter(([, opts]) => opts?.method);
    expect(writeCalls).toHaveLength(0);
  });

  it('disables save button during initial loading when editing', () => {
    global.fetch = vi.fn(() =>
      // Never resolve to keep initialLoading = true
      new Promise(() => {}),
    );

    renderModal({ rowId: 'loc-123' });

    expectSaveBlocked();
  });

  // ---------------------------------------------------------------------------
  // Save failure (ETP-5806) — a non-ok response used to be completely silent
  // ---------------------------------------------------------------------------

  describe('save failure surfaces a toast (ETP-5806)', () => {
    it('shows locationSaveError when the CREATE (POST) request fails', async () => {
      vi.mocked(toast.error).mockClear();
      global.fetch = vi.fn((url, opts) => {
        if (url.includes('/locationAddress') && !url.includes('selectors') && opts?.method === 'POST') {
          return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [SPAIN_OPTION], hasMore: false }) });
      });

      const onSaved = vi.fn();
      renderModal({ onSaved });
      await fillMandatoryFields();
      fireEvent.click(saveButton());

      await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('locationSaveError'));
      expect(onSaved).not.toHaveBeenCalled();
    });

    it('shows locationSaveError when the EDIT (PUT) request fails', async () => {
      vi.mocked(toast.error).mockClear();
      const rowId = 'loc-fail';
      global.fetch = vi.fn((url, opts) => {
        if (url.includes(`/locationAddress/${rowId}`) && (!opts?.method || opts.method === 'GET')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              response: { data: [{ id: rowId, streetName: 'Gran Via', buildingNumber: '1', city: 'Madrid', country: 'ES', 'country$_identifier': 'Spain' }] },
            }),
          });
        }
        if (url.includes(`/locationAddress/${rowId}`) && opts?.method === 'PUT') {
          return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [SPAIN_OPTION], hasMore: false }) });
      });

      const onSaved = vi.fn();
      renderModal({ rowId, onSaved });

      await vi.waitFor(() => expectSaveAllowed());
      fireEvent.click(saveButton());

      await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('locationSaveError'));
      expect(onSaved).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // showBackendMessages — PUT (edit) path
  // ---------------------------------------------------------------------------

  describe('showBackendMessages — PUT (edit existing record)', () => {
    /**
     * Render an edit modal with a pre-loaded record whose Street/Number/City/Country
     * are already filled (so the Save button is immediately enabled under the
     * ETP-5806 mandatory set). The PUT response carries the messages under test.
     */
    async function renderAndSaveExisting(rowId, putMessages, onParentRefresh) {
      const { toast } = await import('sonner');
      vi.mocked(toast.success).mockClear();
      vi.mocked(toast.error).mockClear();
      vi.mocked(toast.warning).mockClear();
      vi.mocked(toast.info).mockClear();

      const onSaved = vi.fn();

      global.fetch = vi.fn((url, opts) => {
        // Initial GET of the existing record — populate form so save is enabled
        if (url.includes(`/locationAddress/${rowId}`) && (!opts?.method || opts.method === 'GET')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              response: {
                data: [{
                  id: rowId,
                  streetName: 'Gran Via',
                  buildingNumber: '1',
                  city: 'Madrid',
                  country: 'ES',
                  'country$_identifier': 'Spain',
                }],
              },
            }),
          });
        }
        // PUT — save response carries messages
        if (url.includes(`/locationAddress/${rowId}`) && opts?.method === 'PUT') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              response: { data: [{ id: rowId, messages: putMessages }] },
            }),
          });
        }
        // Selector calls (countries)
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ items: [{ id: 'ES', label: 'Spain' }], hasMore: false }),
        });
      });

      renderModal({ rowId, onSaved, onParentRefresh });

      // Wait until the record finished loading and save is enabled.
      await vi.waitFor(() => expectSaveAllowed());

      fireEvent.click(saveButton());

      // Wait for the save to complete (onSaved is called after PUT finishes)
      await vi.waitFor(() => {
        expect(onSaved).toHaveBeenCalled();
      }, { timeout: 3000 });

      return { toast, onSaved };
    }

    it('calls toast.warning and onSaved for warning message', async () => {
      const onParentRefresh = vi.fn();
      const { toast, onSaved } = await renderAndSaveExisting(
        'loc-warn',
        [{ type: 'warning', title: 'NIF warning', text: 'desc' }],
        onParentRefresh,
      );
      expect(toast.warning).toHaveBeenCalledWith('NIF warning', { description: 'desc' });
      expect(onSaved).toHaveBeenCalled();
      expect(onParentRefresh).toHaveBeenCalled();
    });

    it('calls toast.error and onSaved for error message', async () => {
      const onParentRefresh = vi.fn();
      const { toast, onSaved } = await renderAndSaveExisting(
        'loc-err',
        [{ type: 'error', title: 'VIES error' }],
        onParentRefresh,
      );
      expect(toast.error).toHaveBeenCalledWith('VIES error', { description: undefined });
      expect(onSaved).toHaveBeenCalled();
    });

    it('calls toast.success and onSaved for success message', async () => {
      const onParentRefresh = vi.fn();
      const { toast, onSaved } = await renderAndSaveExisting(
        'loc-ok',
        [{ type: 'success', title: 'Valid NIF' }],
        onParentRefresh,
      );
      expect(toast.success).toHaveBeenCalledWith('Valid NIF', { description: undefined });
      expect(onSaved).toHaveBeenCalled();
    });

    it('calls toast.info for unknown message type with title', async () => {
      const onParentRefresh = vi.fn();
      const { toast } = await renderAndSaveExisting(
        'loc-info',
        [{ type: 'foo', title: 'Info msg' }],
        onParentRefresh,
      );
      expect(toast.info).toHaveBeenCalledWith('Info msg', { description: undefined });
    });

    it('does NOT call onParentRefresh when messages array is empty', async () => {
      const onParentRefresh = vi.fn();
      const { onSaved } = await renderAndSaveExisting('loc-empty', [], onParentRefresh);
      expect(onParentRefresh).not.toHaveBeenCalled();
      expect(onSaved).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // showBackendMessages — POST (create) path
  // ---------------------------------------------------------------------------

  describe('showBackendMessages — POST (create new record)', () => {
    beforeEach(() => {
      vi.mocked(toast.success).mockClear();
      vi.mocked(toast.error).mockClear();
      vi.mocked(toast.warning).mockClear();
      vi.mocked(toast.info).mockClear();
    });

    /**
     * Render a create modal, fill the mandatory fields, click save, and wait for POST.
     */
    async function renderAndSaveNew(postResponseData, onSaved, onParentRefresh) {
      global.fetch = vi.fn((url, opts) => {
        if (url.includes('/locationAddress') && !url.includes('selectors') && opts?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              response: { status: 0, data: [postResponseData] },
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ items: [{ id: 'ES', label: 'Spain' }], hasMore: false }),
        });
      });

      renderModal({ onSaved, onParentRefresh });

      await fillMandatoryFields();
      fireEvent.click(saveButton());

      await vi.waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/locationAddress'),
          expect.objectContaining({ method: 'POST' }),
        );
      });
    }

    it('calls toast.success and onSaved with new record id for success message', async () => {
      const onSaved = vi.fn();
      const onParentRefresh = vi.fn();

      await renderAndSaveNew(
        { id: 'new-loc-99', name: 'Madrid, Avenida Principal', messages: [{ type: 'success', title: 'ok' }] },
        onSaved,
        onParentRefresh,
      );

      await vi.waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('ok', { description: undefined });
      });
      expect(onSaved).toHaveBeenCalledWith('new-loc-99', 'Madrid, Avenida Principal');
      expect(onParentRefresh).toHaveBeenCalled();
    });

    it('calls onSaved without toast when POST response has no messages', async () => {
      const onSaved = vi.fn();
      const onParentRefresh = vi.fn();

      await renderAndSaveNew(
        { id: 'new-loc-100', name: 'Barcelona' },
        onSaved,
        onParentRefresh,
      );

      await vi.waitFor(() => {
        expect(onSaved).toHaveBeenCalledWith('new-loc-100', 'Barcelona');
      });
      expect(onParentRefresh).not.toHaveBeenCalled();
      expect(toast.success).not.toHaveBeenCalled();
      expect(toast.warning).not.toHaveBeenCalled();
    });
  });

  it('allows typing in postal code and city fields', () => {
    renderModal();
    fireEvent.change(postalCodeInput(), { target: { value: '28001' } });
    expect(postalCodeInput()).toHaveValue('28001');
    fireEvent.change(cityInput(), { target: { value: 'Madrid' } });
    expect(cityInput()).toHaveValue('Madrid');
  });

  it('caps Street/Number/Building name inputs at their DB column lengths', () => {
    renderModal();
    expect(streetNameInput()).toHaveAttribute('maxLength', '70');
    expect(buildingNumberInput()).toHaveAttribute('maxLength', '16');
    expect(buildingNameInput()).toHaveAttribute('maxLength', '35');
  });

  it('calls onClose when the close (X) button is clicked', () => {
    const { props } = renderModal();
    const closeBtn = screen.getByLabelText('close');
    fireEvent.click(closeBtn);
    expect(props.onClose).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // "Dirección resultante" preview (ETP-5806) — composeAddressLines
  // ---------------------------------------------------------------------------

  describe('resulting-address preview (ETP-5806)', () => {
    const address1 = () => screen.getByTestId('location-resulting-address1');
    const address2 = () => screen.getByTestId('location-resulting-address2');

    it('shows "—" on both lines when nothing has been typed yet', () => {
      renderModal();
      expect(address1()).toHaveTextContent('—');
      expect(address2()).toHaveTextContent('—');
    });

    it('shows everything on line 1 and "—" on line 2 when it all fits', () => {
      renderModal();
      typeStreetName('Calle Mayor');
      typeBuildingNumber('5');
      expect(address1()).toHaveTextContent('Calle Mayor, 5');
      expect(address2()).toHaveTextContent('—');
    });

    it('splits into line 2 the building name that would overflow line 1 (60 chars)', () => {
      renderModal();
      const street = 'Avenida Principal Industrial';
      const number = '100';
      const buildingName = 'Nave Numero Cuarenta y Dos Fondo';
      typeStreetName(street);
      typeBuildingNumber(number);
      fireEvent.change(buildingNameInput(), { target: { value: buildingName } });

      expect(address1()).toHaveTextContent(`${street}, ${number}`);
      expect(address2()).toHaveTextContent(buildingName);
    });

    it('truncates the street itself to 60 chars when even Street+Number overflows', () => {
      renderModal();
      const street = 'CCCCC Calle de Nombre Extremadamente Largo Para Forzar Truncado Total';
      typeStreetName(street);
      typeBuildingNumber('1');
      fireEvent.change(buildingNameInput(), { target: { value: 'B' } });

      expect(address1()).toHaveTextContent(street.slice(0, 60));
      expect(address2()).toHaveTextContent('1 - B');
    });

    it('accepts free-text building numbers such as "s/n"', () => {
      renderModal();
      typeStreetName('Calle Mayor');
      typeBuildingNumber('s/n');
      expect(address1()).toHaveTextContent('Calle Mayor, s/n');
    });
  });

  // ---------------------------------------------------------------------------
  // Legacy-address banner (ETP-5806)
  // ---------------------------------------------------------------------------

  describe('legacy-address banner (ETP-5806)', () => {
    it('does not show the banner on a brand-new, unseeded create form', () => {
      renderModal();
      expect(screen.queryByTestId('location-legacy-address-banner')).not.toBeInTheDocument();
    });

    it('shows the banner when editing a record with free-text address but no structured fields', async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            response: { data: [{ id: 'loc-legacy', address: 'Old Street 12, 3B', country: 'ES', 'country$_identifier': 'Spain' }] },
            items: [],
            hasMore: false,
          }),
        }),
      );

      renderModal({ rowId: 'loc-legacy' });

      const banner = await screen.findByTestId('location-legacy-address-banner');
      expect(banner).toHaveTextContent('Old Street 12, 3B');
    });

    it('does not show the banner when editing a record that already has structured fields', async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            response: { data: [{ id: 'loc-modern', streetName: 'Gran Via', buildingNumber: '1', country: 'ES', 'country$_identifier': 'Spain' }] },
            items: [],
            hasMore: false,
          }),
        }),
      );

      renderModal({ rowId: 'loc-modern' });

      await screen.findByText('locationSelectorTitle');
      await vi.waitFor(() => expect(streetNameInput()).toHaveValue('Gran Via'));
      expect(screen.queryByTestId('location-legacy-address-banner')).not.toBeInTheDocument();
    });

    it('shows the banner on CREATE when seeded with unstructured OCR text (ETP-5654 round 2)', async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [SPAIN_OPTION], hasMore: false }) }),
      );

      renderModal({ initialValues: { address: 'Calle OCR 99', countryName: 'Spain' } });

      const banner = await screen.findByTestId('location-legacy-address-banner');
      expect(banner).toHaveTextContent('Calle OCR 99');
    });

    it('renders a Copy button inside the banner that copies the old text and toasts success', async () => {
      vi.mocked(toast.success).mockClear();
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText }, configurable: true, writable: true,
      });

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            response: { data: [{ id: 'loc-legacy', address: 'Old Street 12', country: 'ES', 'country$_identifier': 'Spain' }] },
            items: [],
            hasMore: false,
          }),
        }),
      );

      renderModal({ rowId: 'loc-legacy' });

      const copyBtn = await screen.findByTestId('location-legacy-address-copy');
      fireEvent.click(copyBtn);

      await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('Old Street 12'));
      expect(toast.success).toHaveBeenCalledWith('copied');
    });
  });

  // ---------------------------------------------------------------------------
  // Mandatory-field validation (ETP-5806) — Street, Number, City, Country
  // ---------------------------------------------------------------------------

  describe('mandatory-field validation (ETP-5806)', () => {
    it('shows no inline errors before a save attempt, even with every mandatory field empty', () => {
      renderModal();
      expect(screen.queryByText('fieldRequiredMessage')).not.toBeInTheDocument();
    });

    // ETP-5806 follow-up — repro for the bug reported above (test-reuse-policy.md
    // point 6 exception: the developer commits the repro together with the fix).
    // The Save button used to be natively `disabled={saveDisabled}`, so clicking it
    // while a mandatory field was empty never dispatched `click` at all and
    // `attemptedSave` could never become true — the inline message was unreachable.
    // The button is now gated with `aria-disabled` instead (see its own comment),
    // so the click DOES register, `handleSave` sets `attemptedSave` and still
    // refuses to save (`saveDisabled` guard), and the message becomes visible.
    it('shows fieldRequiredMessage under every empty mandatory field after clicking Save', () => {
      renderModal();
      expect(screen.queryByText('fieldRequiredMessage')).not.toBeInTheDocument();

      fireEvent.click(saveButton());

      // One message per empty mandatory field: Street, Number, City, Country.
      expect(screen.getAllByText('fieldRequiredMessage')).toHaveLength(4);
    });

    it('marks Street, Number, City and Country as mandatory, and no other field', () => {
      renderModal();
      expect(hasRequiredMark('streetNameLabel')).toBe(true);
      expect(hasRequiredMark('buildingNumberLabel')).toBe(true);
      expect(hasRequiredMark('cityLabel')).toBe(true);
      expect(hasRequiredMark('countryLabel')).toBe(true);
      for (const label of ['buildingNameLabel', 'postalCodeLabel', 'regionLabel']) {
        expect(hasRequiredMark(label)).toBe(false);
      }
    });

    it('keeps save disabled while Street/Number/City are not all filled, even with a country picked', async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [SPAIN_OPTION], hasMore: false }) }),
      );
      renderModal();
      await selectSpain();
      expectSaveBlocked();

      typeStreetName();
      typeBuildingNumber();
      expectSaveBlocked();

      typeCity();
      expectSaveAllowed();
    });

    it('treats a whitespace-only Street as empty', async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [SPAIN_OPTION], hasMore: false }) }),
      );
      renderModal();
      await fillMandatoryFields();
      expectSaveAllowed();

      typeStreetName('   ');
      expectSaveBlocked();
    });
  });

  // ---------------------------------------------------------------------------
  // saveMode="location" (plain C_Location) — ETP-4526
  // ---------------------------------------------------------------------------

  describe('saveMode="location" and showAddressTypeCheckboxes=false', () => {
    it('does NOT render the shipping/invoicing checkboxes', () => {
      renderModal({ saveMode: 'location', showAddressTypeCheckboxes: false });
      expect(
        screen.queryByTestId('SquareCheckbox__location-shipping'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId('SquareCheckbox__location-invoicing'),
      ).not.toBeInTheDocument();
      expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    });

    it('CREATE (rowId null) POSTs to `${apiBase}/location` with no businessPartner and no address-type flags', async () => {
      global.fetch = vi.fn((url, opts) => {
        if (url.includes('/location') && !url.includes('selectors') && opts?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              response: { status: 0, data: [{ id: 'new-c-loc-1', name: 'Madrid, Avenida Principal' }] },
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ items: [{ id: 'ES', label: 'Spain' }], hasMore: false }),
        });
      });

      const onSaved = vi.fn();
      renderModal({
        rowId: null,
        saveMode: 'location',
        showAddressTypeCheckboxes: false,
        apiBase: '/api/warehouse',
        onSaved,
      });

      await fillMandatoryFields();

      fireEvent.click(saveButton());

      let postCall;
      await vi.waitFor(() => {
        postCall = global.fetch.mock.calls.find(
          ([url, opts]) => opts?.method === 'POST',
        );
        expect(postCall).toBeDefined();
      });

      const [postUrl, postOpts] = postCall;
      // Plain C_Location endpoint — no parentId query, no /locationAddress segment.
      expect(postUrl).toBe('/api/warehouse/location');
      expect(postUrl).not.toContain('parentId');
      expect(postUrl).not.toContain('locationAddress');

      const body = JSON.parse(postOpts.body);
      // No BP link and no address-type flags in location mode.
      expect(body).not.toHaveProperty('businessPartner');
      expect(body).not.toHaveProperty('shipToAddress');
      expect(body).not.toHaveProperty('invoiceToAddress');
      expect(body.country).toBe('ES');
      expect(body.streetName).toBe(STREET_VALUE);
      expect(body.buildingNumber).toBe(NUMBER_VALUE);

      await vi.waitFor(() => {
        expect(onSaved).toHaveBeenCalledWith('new-c-loc-1', 'Madrid, Avenida Principal');
      });
    });

    it('EDIT (rowId set) PUTs to `${apiBase}/location/{rowId}`', async () => {
      const rowId = 'c-loc-77';
      global.fetch = vi.fn((url, opts) => {
        // Initial GET-by-id to prefill the form (populate country so save is enabled)
        if (url.includes(`/location/${rowId}`) && (!opts?.method || opts.method === 'GET')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              response: {
                data: [{
                  id: rowId,
                  streetName: 'Gran Via',
                  buildingNumber: '1',
                  city: 'Madrid',
                  country: 'ES',
                  'country$_identifier': 'Spain',
                }],
              },
            }),
          });
        }
        // PUT edit
        if (url.includes(`/location/${rowId}`) && opts?.method === 'PUT') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              response: { data: [{ id: rowId, name: 'Updated Location' }] },
            }),
          });
        }
        // Selectors
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ items: [{ id: 'ES', label: 'Spain' }], hasMore: false }),
        });
      });

      const onSaved = vi.fn();
      renderModal({
        rowId,
        saveMode: 'location',
        showAddressTypeCheckboxes: false,
        apiBase: '/api/warehouse',
        onSaved,
      });

      await vi.waitFor(() => expectSaveAllowed());

      fireEvent.click(saveButton());

      let putCall;
      await vi.waitFor(() => {
        putCall = global.fetch.mock.calls.find(
          ([url, opts]) => opts?.method === 'PUT',
        );
        expect(putCall).toBeDefined();
      });

      const [putUrl, putOpts] = putCall;
      expect(putUrl).toBe('/api/warehouse/location/c-loc-77');
      expect(putUrl).not.toContain('locationAddress');

      const body = JSON.parse(putOpts.body);
      expect(body).not.toHaveProperty('businessPartner');
      expect(body).not.toHaveProperty('shipToAddress');
      expect(body).not.toHaveProperty('invoiceToAddress');

      await vi.waitFor(() => {
        expect(onSaved).toHaveBeenCalledWith('c-loc-77', 'Updated Location');
      });
    });
  });

  // ---------------------------------------------------------------------------
  // ETP-5103 — Spain preselected on create
  // ---------------------------------------------------------------------------

  describe('ETP-5103 — default country prefill', () => {
    // The prefill asks the selector for Spain by name; the response carries the
    // TRANSLATED label, which is what the picker button ends up showing.
    const SPAIN_PREFILL_OPTION = { id: '106', label: 'España' };
    const FRANCE_OPTION = { id: 'FR', label: 'Francia' };

    /**
     * Mock the selector endpoints, routing by URL:
     *   - the `?q=Spain` prefill request  → `prefill`
     *   - every other selector page      → `catalog` (what the picker lists)
     * Splitting the two makes the assertions unambiguous: the country can only be set
     * by the prefill when it came from the `?q=` request, never from the first page.
     * Any request carrying an HTTP method (the save) resolves as a successful write.
     *
     * `catalog` must be non-empty by default: the modal only records which of its 8
     * selector fallbacks answered when a page comes back with rows, and the prefill
     * reuses that resolved base. An always-empty catalog would therefore disable the
     * prefill — which is production behaviour when there are no countries at all, and
     * is covered by its own case below.
     */
    function mockSelectors({ prefill = [SPAIN_PREFILL_OPTION], catalog = [FRANCE_OPTION] } = {}) {
      global.fetch = vi.fn((url, opts) => {
        if (opts?.method) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              response: { status: 0, data: [{ id: 'saved-1', name: 'Saved' }] },
            }),
          });
        }
        const items = String(url).includes(DEFAULT_COUNTRY_QUERY_PARAM) ? prefill : catalog;
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ items, hasMore: false }) });
      });
    }

    /** Wait until the country trigger displays `label`. */
    function waitForCountry(label) {
      return vi.waitFor(() => expect(countryButton()).toHaveTextContent(label));
    }

    /** CP-1 */
    it('preselects Spain when the popup opens in create mode', async () => {
      mockSelectors();
      renderModal();

      await waitForCountry(SPAIN_PREFILL_OPTION.label);
      expect(
        fetchedUrls().some(url => url.includes(DEFAULT_COUNTRY_QUERY_PARAM)),
      ).toBe(true);
    });

    /** CP-2 */
    it('lets the user replace the preselected country, and does not restore it', async () => {
      mockSelectors({ catalog: [FRANCE_OPTION] });
      renderModal();

      await waitForCountry(SPAIN_PREFILL_OPTION.label);

      fireEvent.click(countryButton());
      fireEvent.click(await screen.findByText(FRANCE_OPTION.label));

      expect(countryButton()).toHaveTextContent(FRANCE_OPTION.label);
      // The one-shot guard must keep the default from snapping back over the choice.
      await vi.waitFor(() => {
        expect(countryButton()).not.toHaveTextContent(SPAIN_PREFILL_OPTION.label);
      });
    });

    /** CP-3 */
    it('keeps save disabled while Street/Number/City are empty, even with Spain preselected', async () => {
      mockSelectors();
      renderModal();

      await waitForCountry(SPAIN_PREFILL_OPTION.label);
      expectSaveBlocked();
    });

    /** CP-4 */
    it('enables save once Street, Number and City are filled', async () => {
      mockSelectors();
      renderModal();

      await waitForCountry(SPAIN_PREFILL_OPTION.label);
      typeStreetName();
      typeBuildingNumber();
      typeCity();

      expectSaveAllowed();
    });

    /** CP-5 */
    it('disables save again when Street is cleared', async () => {
      mockSelectors();
      renderModal();

      await waitForCountry(SPAIN_PREFILL_OPTION.label);
      typeStreetName();
      typeBuildingNumber();
      typeCity();
      expectSaveAllowed();

      typeStreetName('');
      expectSaveBlocked();
    });

    it('keeps save disabled without a country, and enables it once one is picked', async () => {
      // Prefill resolves nothing (no Spain in the response), so the country starts empty.
      mockSelectors({ prefill: [], catalog: [FRANCE_OPTION] });
      renderModal();

      typeStreetName();
      typeBuildingNumber();
      typeCity();
      expectSaveBlocked();

      fireEvent.click(countryButton());
      fireEvent.click(await screen.findByText(FRANCE_OPTION.label));

      expectSaveAllowed();
    });

    it('leaves the country empty when the default cannot be resolved', async () => {
      mockSelectors({ prefill: [] });
      renderModal();

      await vi.waitFor(() => {
        expect(fetchedUrls().some(url => url.includes(DEFAULT_COUNTRY_QUERY_PARAM))).toBe(true);
      });
      expect(countryButton()).toHaveTextContent('—');
      expect(screen.getByText('locationSelectorTitle')).toBeInTheDocument();
    });

    it('skips the prefill entirely when no selector fallback returns countries', async () => {
      // Every selector page is empty, so no base URL is ever resolved. The prefill has
      // nothing to hang off and must simply not run — no request, no crash.
      mockSelectors({ prefill: [], catalog: [] });
      renderModal();

      await vi.waitFor(() => expect(global.fetch).toHaveBeenCalled());
      expect(fetchedUrls().some(url => url.includes(DEFAULT_COUNTRY_QUERY_PARAM))).toBe(false);
      expect(countryButton()).toHaveTextContent('—');
      expectSaveBlocked();
    });

    it('does not prefill when editing, and keeps the loaded country', async () => {
      const rowId = 'loc-edit-1';
      global.fetch = vi.fn((url, opts) => {
        if (String(url).includes(`/locationAddress/${rowId}`) && !opts?.method) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              response: {
                data: [{
                  id: rowId,
                  streetName: '10 Rue de Rivoli',
                  buildingNumber: '10',
                  city: 'Paris',
                  country: FRANCE_OPTION.id,
                  'country$_identifier': FRANCE_OPTION.label,
                }],
              },
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ items: [SPAIN_PREFILL_OPTION], hasMore: false }),
        });
      });

      renderModal({ rowId });

      await waitForCountry(FRANCE_OPTION.label);
      // The prefill request must never be issued in edit mode, so the record's own
      // country can never be overwritten by the default.
      expect(fetchedUrls().some(url => url.includes(DEFAULT_COUNTRY_QUERY_PARAM))).toBe(false);
      expectSaveAllowed();
    });

    it('keeps save disabled while a save is in flight', async () => {
      let resolveSave;
      global.fetch = vi.fn((url, opts) => {
        if (opts?.method) return new Promise(resolve => { resolveSave = resolve; });
        const isPrefill = String(url).includes(DEFAULT_COUNTRY_QUERY_PARAM);
        const items = isPrefill ? [SPAIN_PREFILL_OPTION] : [FRANCE_OPTION];
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ items, hasMore: false }) });
      });

      renderModal();

      await waitForCountry(SPAIN_PREFILL_OPTION.label);
      typeStreetName();
      typeBuildingNumber();
      typeCity();
      fireEvent.click(saveButton());

      await vi.waitFor(() => expectSaveBlocked());

      resolveSave({ ok: true, json: () => Promise.resolve({ response: { status: 0, data: [] } }) });
    });
  });
});

// ---------------------------------------------------------------------------
// ETP-5654 — `initialValues` seed for a NEW address (OCR vendor address),
// reconciled with ETP-5806's structured fields.
// ---------------------------------------------------------------------------

describe('LocationEditorModal — initialValues seed (ETP-5654 x ETP-5806)', () => {
  const SPAIN = { id: '106', label: 'España' };
  const ARGENTINA = { id: 'AR', label: 'Argentina' };
  const SEED = { address: ' Gran Vía 45 ', postalCode: '28013', city: 'Madrid', countryName: 'Argentina' };

  /** Answer `?q=<term>` pages from `byQuery`; anything else gets the catalog. */
  function mockSelectors(byQuery) {
    global.fetch = vi.fn((url) => {
      const match = Object.keys(byQuery).find(term => String(url).includes(`q=${term}`));
      const items = match ? byQuery[match] : [ARGENTINA];
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items, hasMore: false }) });
    });
  }

  const countryButton = () => screen.getByTestId('location-field-country');

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('applies the free-text seed (postalCode/city), resolves the country, shows the legacy banner for the unstructured text, and is not dirty', async () => {
    mockSelectors({ Argentina: [ARGENTINA], Spain: [SPAIN] });
    renderModal({ initialValues: SEED });

    await vi.waitFor(() => expect(countryButton()).toHaveTextContent('Argentina'));
    // `address` is NOT bound to an editable field any more (ETP-5806): it only
    // ever surfaces inside the legacy-address banner, never pre-fills Street.
    const banner = screen.getByTestId('location-legacy-address-banner');
    expect(banner).toHaveTextContent('Gran Vía 45');
    expect(screen.getByTestId('location-field-streetName')).toHaveValue('');
    expect(screen.getByTestId('location-field-postalCode')).toHaveValue('28013');
    expect(screen.getByTestId('location-field-city')).toHaveValue('Madrid');
    expect(hasUnsavedChanges()).toBe(false);
  });

  it('falls back to Spain when the country name does not resolve', async () => {
    mockSelectors({ Atlantis: [], Spain: [SPAIN] });
    renderModal({ initialValues: { ...SEED, countryName: 'Atlantis' } });

    await vi.waitFor(() => expect(countryButton()).toHaveTextContent('España'));
  });

  it('falls back to Spain when the seed carries no country', async () => {
    mockSelectors({ Spain: [SPAIN] });
    renderModal({ initialValues: { ...SEED, countryName: '' } });

    await vi.waitFor(() => expect(countryButton()).toHaveTextContent('España'));
  });

  it('ignores the seed in edit mode (no banner text from the seed, no seeded city)', async () => {
    global.fetch = vi.fn((url, opts) => {
      if (String(url).includes('/locationAddress/loc-1') && !opts?.method) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ response: { data: [{ id: 'loc-1', streetName: 'Real Street', buildingNumber: '1', country: 'FR', 'country$_identifier': 'Francia' }] } }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [ARGENTINA], hasMore: false }) });
    });
    renderModal({ rowId: 'loc-1', initialValues: SEED });

    await vi.waitFor(() => expect(screen.getByTestId('location-field-streetName')).toHaveValue('Real Street'));
    expect(screen.queryByTestId('location-legacy-address-banner')).not.toBeInTheDocument();
    expect(screen.getByTestId('location-field-city')).toHaveValue('');
  });

  it('behaves as before without initialValues: no banner, empty fields, Spain default', async () => {
    mockSelectors({ Spain: [SPAIN] });
    renderModal();

    await vi.waitFor(() => expect(countryButton()).toHaveTextContent('España'));
    expect(screen.queryByTestId('location-legacy-address-banner')).not.toBeInTheDocument();
    expect(screen.getByTestId('location-field-streetName')).toHaveValue('');
    expect(hasUnsavedChanges()).toBe(false);
  });
});

/**
 * ETP-5824 — a non-simplified CUSTOMER business partner with no postal code cannot have its sales
 * invoices completed in an organization with TicketBAI (com.smf.ticketbai blocks the completion;
 * purchase invoices are never blocked, so a supplier-only partner is not warned). The modal warns
 * about it next to the postal code, but never blocks the save: the postal code is not part of the
 * save gate (ETP-5103/ETP-5806).
 */
describe('LocationEditorModal — TicketBAI postal code warning (ETP-5824)', () => {
  const WARNING_TESTID = 'location-postalCode-tbai-warning';

  /**
   * Mirrors the REAL payloads: the contacts `businessPartner` record carries no
   * `organization`, and `tbai-config/header` ignores query parameters and returns every
   * readable row (active or not).
   */
  function mockBackend({
    simplified = false, customer = true, vendor, omitCustomer = false,
    tbaiRows = [{ id: 'cfg-1', active: true }],
  } = {}) {
    const partner = { id: 'bp-1', tbaiIssimplifiedinv: simplified };
    if (!omitCustomer) partner.customer = customer;
    if (vendor !== undefined) partner.vendor = vendor;
    global.fetch = vi.fn((url) => {
      if (url.includes('/businessPartner/bp-1')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ response: { data: [partner] } }),
        });
      }
      if (url.includes('/tbai-config/header')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: tbaiRows } }) });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [SPAIN_OPTION], hasMore: false }),
      });
    });
  }

  function tbaiConfigUrls() {
    return fetchedUrls().filter(u => u.includes('/tbai-config/header'));
  }

  /** Let pending fetch promises settle before asserting that nothing appeared. */
  function flush() {
    return new Promise(resolve => setTimeout(resolve, 0));
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('warns for a non-simplified contact with an empty postal code when TicketBAI is in use', async () => {
    mockBackend();
    renderModal();

    expect(await screen.findByTestId(WARNING_TESTID)).toHaveTextContent('tbaiPostalCodeMissingWarning');
    expect(new URL(tbaiConfigUrls()[0], 'http://localhost').searchParams.get('organization')).toBeNull();
  });

  it('warns when the postal code is only whitespace', async () => {
    mockBackend();
    renderModal();
    await screen.findByTestId(WARNING_TESTID);

    fireEvent.change(screen.getByTestId('location-field-postalCode'), { target: { value: '   ' } });

    expect(screen.getByTestId(WARNING_TESTID)).toBeInTheDocument();
  });

  it('does not block the save while the warning is shown', async () => {
    mockBackend();
    renderModal();
    await screen.findByTestId(WARNING_TESTID);

    // Every selector page answers Spain, so the ETP-5103 default-country prefill fills the
    // country; with the ETP-5806 structured fields typed (street, number, city), every mandatory
    // field is set.
    typeStreetName();
    typeBuildingNumber();
    typeCity();

    await vi.waitFor(() => expectSaveAllowed());
    expect(screen.getByTestId(WARNING_TESTID)).toBeInTheDocument();
  });

  it('hides the warning once a postal code is typed', async () => {
    mockBackend();
    renderModal();
    await screen.findByTestId(WARNING_TESTID);

    fireEvent.change(screen.getByTestId('location-field-postalCode'), { target: { value: '20001' } });

    expect(screen.queryByTestId(WARNING_TESTID)).not.toBeInTheDocument();
  });

  it('does not warn when only inactive TicketBAI configurations exist', async () => {
    mockBackend({ tbaiRows: [{ id: 'cfg-old', active: false }] });
    renderModal();
    await vi.waitFor(() => expect(tbaiConfigUrls()).toHaveLength(1));
    await flush();

    expect(screen.queryByTestId(WARNING_TESTID)).not.toBeInTheDocument();
  });

  it('does not warn for a simplified-invoice contact, and does not ask for the configuration', async () => {
    mockBackend({ simplified: true });
    renderModal();
    await vi.waitFor(() => expect(fetchedUrls().some(u => u.includes('/businessPartner/bp-1'))).toBe(true));
    await flush();

    expect(screen.queryByTestId(WARNING_TESTID)).not.toBeInTheDocument();
    expect(tbaiConfigUrls()).toHaveLength(0);
  });

  /** Wait until the partner record was requested and every pending promise settled. */
  async function partnerLoaded() {
    await vi.waitFor(() => expect(fetchedUrls().some(u => u.includes('/businessPartner/bp-1'))).toBe(true));
    await flush();
  }

  it('does not warn for a supplier-only partner, and does not ask for the configuration', async () => {
    mockBackend({ customer: false, vendor: true });
    renderModal();
    await partnerLoaded();

    expect(screen.queryByTestId(WARNING_TESTID)).not.toBeInTheDocument();
    expect(tbaiConfigUrls()).toHaveLength(0);
  });

  it('does not warn when the partner record carries no customer flag (fail closed)', async () => {
    mockBackend({ omitCustomer: true });
    renderModal();
    await partnerLoaded();

    expect(screen.queryByTestId(WARNING_TESTID)).not.toBeInTheDocument();
    expect(tbaiConfigUrls()).toHaveLength(0);
  });

  it('warns for a partner that is both customer and vendor', async () => {
    mockBackend({ customer: true, vendor: true });
    renderModal();

    expect(await screen.findByTestId(WARNING_TESTID)).toHaveTextContent('tbaiPostalCodeMissingWarning');
    expect(tbaiConfigUrls()).toHaveLength(1);
  });

  it("never asks for TicketBAI data in 'location' mode (no business partner)", async () => {
    mockBackend();
    renderModal({ saveMode: 'location', showAddressTypeCheckboxes: false, bpId: undefined });
    await screen.findByText('locationSelectorTitle');
    await flush();

    expect(fetchedUrls().some(u => u.includes('/tbai-config/header') || u.includes('/businessPartner/'))).toBe(false);
    expect(screen.queryByTestId(WARNING_TESTID)).not.toBeInTheDocument();
  });
});

describe('tbaiPostalCodeWarning — pure rules (ETP-5824)', () => {
  describe('shouldWarnMissingTbaiPostalCode', () => {
    const WARN_BASE = { tbaiActive: true, partnerSimplified: false, postalCode: '' };

    it('warns for a customer partner', () => {
      expect(shouldWarnMissingTbaiPostalCode({ ...WARN_BASE, partnerCustomer: true })).toBe(true);
    });

    it('does not warn for a non-customer partner', () => {
      expect(shouldWarnMissingTbaiPostalCode({ ...WARN_BASE, partnerCustomer: false })).toBe(false);
    });

    it('does not warn when the customer flag is unknown (null)', () => {
      expect(shouldWarnMissingTbaiPostalCode({ ...WARN_BASE, partnerCustomer: null })).toBe(false);
    });

    it('does not warn when the customer flag is omitted', () => {
      expect(shouldWarnMissingTbaiPostalCode(WARN_BASE)).toBe(false);
    });

    it('does not warn for a customer once a postal code is present', () => {
      expect(shouldWarnMissingTbaiPostalCode({ ...WARN_BASE, partnerCustomer: true, postalCode: '20001' })).toBe(false);
    });
  });

  describe('readPartnerCustomer', () => {
    it.each([
      ['Y', true],
      ['N', false],
      [true, true],
      [false, false],
      [undefined, null],
      ['', null],
    ])('reads customer=%j as %j', (raw, expected) => {
      expect(readPartnerCustomer({ customer: raw })).toBe(expected);
    });

    it('returns null for a record without the property, or no record at all', () => {
      expect(readPartnerCustomer({ id: 'bp-1' })).toBeNull();
      expect(readPartnerCustomer(undefined)).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// structured-address-for-sepa flag OFF (ETP-5806 backend-only flag, default/pre-launch state)
// ---------------------------------------------------------------------------

describe('LocationEditorModal — structured-address-for-sepa flag OFF', () => {
  beforeEach(() => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [], hasMore: false }) }),
    );
    useCapabilitiesOff();
  });

  afterEach(() => {
    useCapabilitiesOn();
  });

  it('renders the legacy Address Line 1/2 inputs, not the structured Street/Number/Building Name fields', () => {
    renderModal();

    expect(screen.getByTestId('location-field-address')).toBeInTheDocument();
    expect(screen.getByTestId('location-field-address2')).toBeInTheDocument();
    expect(screen.queryByTestId('location-field-streetName')).not.toBeInTheDocument();
    expect(screen.queryByTestId('location-field-buildingNumber')).not.toBeInTheDocument();
    expect(screen.queryByTestId('location-field-buildingName')).not.toBeInTheDocument();
    expect(screen.queryByTestId('location-resulting-address-preview')).not.toBeInTheDocument();
  });

  it('never shows the legacy-address banner, even for a record with only free-text address', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          response: { data: [{ id: 'loc-legacy', address: 'Old Street 12, 3B', country: 'ES', 'country$_identifier': 'Spain' }] },
          items: [],
          hasMore: false,
        }),
      }),
    );

    renderModal({ rowId: 'loc-legacy' });

    await screen.findByText('locationSelectorTitle');
    await vi.waitFor(() => expect(screen.getByTestId('location-field-address')).toHaveValue('Old Street 12, 3B'));
    // ETP-5806 — the banner, and `isLegacyAddressRecord`, are only evaluated when the flag is on.
    expect(screen.queryByTestId('location-legacy-address-banner')).not.toBeInTheDocument();
  });

  it('keeps the pre-ETP-5806 save-gating rule: address text + country, nothing else', () => {
    renderModal();
    expectSaveBlocked();

    fireEvent.change(screen.getByTestId('location-field-address'), { target: { value: 'Calle Mayor 1' } });
    // Street/Number/City don't exist in this mode, so address + country alone must unblock Save.
    expectSaveBlocked();
  });

  it('allows saving once legacy address and country are filled, with Street/Number/City never required', async () => {
    global.fetch = vi.fn((url) => {
      if (String(url).includes('/locationAddress') && !String(url).includes('selectors')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ response: { status: 0, data: [{ id: 'new-loc-legacy', name: 'Legacy Location' }] } }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [SPAIN_OPTION], hasMore: false }) });
    });

    renderModal();
    fireEvent.change(screen.getByTestId('location-field-address'), { target: { value: 'Calle Mayor 1' } });
    await selectSpain();

    expectSaveAllowed();
    fireEvent.click(saveButton());

    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/locationAddress'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('sends the raw legacy address lines, and null structured fields, in the save payload', async () => {
    let capturedBody;
    global.fetch = vi.fn((url, opts) => {
      if (String(url).includes('/locationAddress') && !String(url).includes('selectors') && opts?.method === 'POST') {
        capturedBody = JSON.parse(opts.body);
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ response: { status: 0, data: [{ id: 'new-loc-legacy', name: 'Legacy Location' }] } }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [SPAIN_OPTION], hasMore: false }) });
    });

    renderModal();
    fireEvent.change(screen.getByTestId('location-field-address'), { target: { value: 'Calle Mayor 1' } });
    fireEvent.change(screen.getByTestId('location-field-address2'), { target: { value: 'Piso 2' } });
    await selectSpain();
    fireEvent.click(saveButton());

    await vi.waitFor(() => expect(capturedBody).toBeDefined());
    expect(capturedBody.addressLine1).toBe('Calle Mayor 1');
    expect(capturedBody.addressLine2).toBe('Piso 2');
    expect(capturedBody.streetName).toBeNull();
    expect(capturedBody.buildingNumber).toBeNull();
    expect(capturedBody.buildingName).toBeNull();
  });
});
